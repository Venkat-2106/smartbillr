# app/routers/customer.py

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.rbac import require_permission
from app.models.customer import Customer
from app.schemas.customer import CustomerCreate, CustomerUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from typing import Optional

router = APIRouter(prefix="/customers", tags=["Customers"])


# ─────────────────────────────────────────
# HELPER — Format customer as dict
# ─────────────────────────────────────────
def customer_to_dict(c) -> dict:
    return {
        "cust_id":          str(c.cust_id),
        "business_id":      str(c.business_id),
        "cust_name":        c.cust_name,
        "cust_phone":       c.cust_phone,
        "cust_email":       c.cust_email,
        "cust_address":     c.cust_address,
        "cust_state":       c.cust_state,
        "cust_country_code": c.cust_country_code,
        "cust_tax_number":  c.cust_tax_number,
        "is_deleted":       c.is_deleted,
        "cust_created_at":  str(c.cust_created_at) if c.cust_created_at else None
    }


# ══════════════════════════════════════════════════════════════════
# POST /customers → Create new customer
# ══════════════════════════════════════════════════════════════════
@router.post("/")
def create_customer(
    data:         CustomerCreate,
    current_user: dict = Depends(require_permission("customers.manage")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # Block duplicate phone within same business
    if data.cust_phone:
        existing = db.query(Customer).filter(
            Customer.business_id == business_id,
            Customer.cust_phone  == data.cust_phone,
            Customer.is_deleted  == False
        ).first()
        if existing:
            return error_response("Customer with this phone already exists", 400)

    new_customer = Customer(
        business_id       = business_id,
        cust_name         = data.cust_name,
        cust_phone        = data.cust_phone,
        cust_email        = data.cust_email,
        cust_address      = data.cust_address,
        cust_state        = data.cust_state,
        cust_country_code = data.cust_country_code,
        cust_tax_number   = data.cust_tax_number
    )

    db.add(new_customer)
    db.commit()
    db.refresh(new_customer)

    return success_response({
        "message":  "Customer created successfully",
        "customer": customer_to_dict(new_customer)
    }, status_code=201)


# ══════════════════════════════════════════════════════════════════
# GET /customers → Get all customers (paginated)
# Also supports: GET /customers?phone=9876543210
#
# Same pattern as supplier list — phone filter on the list endpoint
# keeps pagination working and avoids an extra route.
# ══════════════════════════════════════════════════════════════════
@router.get("/")
def get_all_customers(
    current_user: dict = Depends(require_permission("customers.manage")),
    db:           Session       = Depends(get_db),
    pagination:   dict          = Depends(paginate),
    phone:        Optional[str] = Query(default=None, description="Search customer by phone number")
):
    business_id = current_user["business_id"]

    base = db.query(Customer).filter(
        Customer.business_id == business_id,
        Customer.is_deleted  == False
    )

    if phone:
        base = base.filter(Customer.cust_phone == phone)

    total     = base.count()
    customers = base.order_by(Customer.cust_name.asc())\
                    .offset(pagination["offset"])\
                    .limit(pagination["limit"])\
                    .all()

    return success_response(
        pagination_response(
            [customer_to_dict(c) for c in customers],
            total,
            pagination["page"],
            pagination["limit"]
        )
    )


# ══════════════════════════════════════════════════════════════════
# GET /customers/search/phone?phone=9876543210
#
# Returns a single customer by exact phone match.
# Used by the sale creation form to auto-fill customer details
# when the cashier types the customer's phone number.
# ══════════════════════════════════════════════════════════════════
@router.get("/search/phone")
def search_customer_by_phone(
    phone:        str,
    current_user: dict = Depends(require_permission("customers.manage")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    if not phone or not phone.strip():
        return error_response("Phone number is required", 400)

    customer = db.query(Customer).filter(
        Customer.business_id == business_id,
        Customer.cust_phone  == phone.strip(),
        Customer.is_deleted  == False
    ).first()

    if not customer:
        return error_response(
            f"No customer found with phone number '{phone}'", 404
        )

    return success_response(customer_to_dict(customer))


# ══════════════════════════════════════════════════════════════════
# GET /customers/{cust_id} → Customer detail WITH full sales history
# ══════════════════════════════════════════════════════════════════
@router.get("/{cust_id}")
def get_customer(
    cust_id:      str,
    current_user: dict = Depends(require_permission("customers.manage")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    customer = db.query(Customer).filter(
        Customer.cust_id     == cust_id,
        Customer.business_id == business_id,
        Customer.is_deleted  == False
    ).first()

    if not customer:
        return error_response("Customer not found", 404)

    # Fetch all sales for this customer
    sale_rows = db.execute(
        text("""
            SELECT
                sales_id, invoice_no,
                sales_total_amount, sales_discount,
                cgst_total, sgst_total, igst_total, tax_total,
                sales_final_amount, sales_payment_method,
                sales_payment_status, sales_created_at
            FROM sales
            WHERE customer_id = CAST(:cid AS uuid)
              AND business_id = CAST(:bid AS uuid)
              AND is_deleted  = false
            ORDER BY sales_created_at DESC
        """),
        {"cid": cust_id, "bid": business_id}
    ).fetchall()

    sales_history = []
    total_spent   = 0.0
    total_paid    = 0.0
    total_returns = 0.0

    for sale in sale_rows:
        sale_id    = str(sale.sales_id)
        sale_final = float(sale.sales_final_amount) if sale.sales_final_amount else 0.0
        total_spent += sale_final

        # Sale items
        item_rows = db.execute(
            text("""
                SELECT
                    si.sale_item_id, si.product_id, p.prod_name,
                    si.sale_item_quantity, si.sale_item_unit_price,
                    si.sale_item_subtotal, si.item_tax_total, si.item_total_with_tax
                FROM sale_items si
                LEFT JOIN products p ON p.prod_id = si.product_id
                WHERE si.sale_id     = CAST(:sid AS uuid)
                  AND si.business_id = CAST(:bid AS uuid)
            """),
            {"sid": sale_id, "bid": business_id}
        ).fetchall()

        items = [
            {
                "sale_item_id":       str(i.sale_item_id),
                "product_id":         str(i.product_id),
                "prod_name":          i.prod_name,
                "qty":                i.sale_item_quantity,
                "unit_price":         float(i.sale_item_unit_price),
                "subtotal":           float(i.sale_item_subtotal)      if i.sale_item_subtotal      else None,
                "item_tax_total":     float(i.item_tax_total)          if i.item_tax_total          else 0,
                "item_total_with_tax": float(i.item_total_with_tax)    if i.item_total_with_tax     else None
            }
            for i in item_rows
        ]

        # Payment summary — read from cumulative_paid on active row
        pay_row = db.execute(
            text("""
                SELECT
                    COALESCE(cumulative_paid, 0)                              AS total_paid_amount,
                    MAX(CASE WHEN is_active = true THEN payment_status END)   AS current_status,
                    COUNT(*)                                                   AS payment_count
                FROM payments
                WHERE sale_id     = CAST(:sid AS uuid)
                  AND business_id = CAST(:bid AS uuid)
            """),
            {"sid": sale_id, "bid": business_id}
        ).fetchone()

        paid_for_sale  = float(pay_row.total_paid_amount) if pay_row else 0.0
        total_paid    += paid_for_sale
        remaining      = round(sale_final - paid_for_sale, 2)

        payment_summary = {
            "total_paid":        round(paid_for_sale, 2),
            "remaining_balance": remaining if remaining > 0 else 0,
            "payment_count":     pay_row.payment_count if pay_row else 0,
            "current_status":    pay_row.current_status if (pay_row and pay_row.current_status)
                                 else sale.sales_payment_status
        }

        # Returns for this sale
        return_rows = db.execute(
            text("""
                SELECT
                    return_id, return_amount, return_reason,
                    return_status, refund_method, restock, return_created_at
                FROM sales_returns
                WHERE sale_id     = CAST(:sid AS uuid)
                  AND business_id = CAST(:bid AS uuid)
                ORDER BY return_created_at DESC
            """),
            {"sid": sale_id, "bid": business_id}
        ).fetchall()

        returns = []
        for r in return_rows:
            if r.return_status == "approved":
                total_returns += float(r.return_amount)
            returns.append({
                "return_id":         str(r.return_id),
                "return_amount":     float(r.return_amount),
                "return_reason":     r.return_reason,
                "return_status":     r.return_status,
                "refund_method":     r.refund_method,
                "restock":           r.restock,
                "return_created_at": str(r.return_created_at) if r.return_created_at else None
            })

        sales_history.append({
            "sales_id":             sale_id,
            "invoice_no":           sale.invoice_no,
            "sales_total_amount":   float(sale.sales_total_amount),
            "sales_discount":       float(sale.sales_discount) if sale.sales_discount else 0,
            "tax_total":            float(sale.tax_total) if sale.tax_total else 0,
            "sales_final_amount":   sale_final,
            "sales_payment_method": sale.sales_payment_method,
            "sales_payment_status": sale.sales_payment_status,
            "sales_created_at":     str(sale.sales_created_at) if sale.sales_created_at else None,
            "payment_summary":      payment_summary,
            "items":                items,
            "returns":              returns
        })

    outstanding = round(total_spent - total_paid, 2)

    return success_response({
        **customer_to_dict(customer),
        "summary": {
            "total_sales":        len(sale_rows),
            "total_spent":        round(total_spent, 2),
            "total_paid":         round(total_paid, 2),
            "outstanding_balance": outstanding if outstanding > 0 else 0,
            "total_returns":      round(total_returns, 2)
        },
        "sales_history": sales_history
    })


# ══════════════════════════════════════════════════════════════════
# PUT /customers/{cust_id} → Update customer
# ══════════════════════════════════════════════════════════════════
@router.put("/{cust_id}")
def update_customer(
    cust_id:      str,
    data:         CustomerUpdate,
    current_user: dict = Depends(require_permission("customers.manage")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    customer = db.query(Customer).filter(
        Customer.cust_id     == cust_id,
        Customer.business_id == business_id,
        Customer.is_deleted  == False
    ).first()

    if not customer:
        return error_response("Customer not found", 404)

    if data.cust_phone:
        existing = db.query(Customer).filter(
            Customer.business_id == business_id,
            Customer.cust_id     != cust_id,
            Customer.cust_phone  == data.cust_phone,
            Customer.is_deleted  == False
        ).first()
        if existing:
            return error_response("Customer with this phone already exists", 400)

    if data.cust_name         is not None: customer.cust_name         = data.cust_name
    if data.cust_phone        is not None: customer.cust_phone        = data.cust_phone
    if data.cust_email        is not None: customer.cust_email        = data.cust_email
    if data.cust_address      is not None: customer.cust_address      = data.cust_address
    if data.cust_state        is not None: customer.cust_state        = data.cust_state
    if data.cust_country_code is not None: customer.cust_country_code = data.cust_country_code
    if data.cust_tax_number   is not None: customer.cust_tax_number   = data.cust_tax_number

    db.commit()
    db.refresh(customer)

    return success_response({
        "message":  "Customer updated successfully",
        "customer": customer_to_dict(customer)
    })


# ══════════════════════════════════════════════════════════════════
# DELETE /customers/{cust_id} → Soft delete
# ══════════════════════════════════════════════════════════════════
@router.delete("/{cust_id}")
def delete_customer(
    cust_id:      str,
    current_user: dict = Depends(require_permission("customers.manage")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    customer = db.query(Customer).filter(
        Customer.cust_id     == cust_id,
        Customer.business_id == business_id,
        Customer.is_deleted  == False
    ).first()

    if not customer:
        return error_response("Customer not found", 404)

    customer.is_deleted = True
    db.commit()

    return success_response({"message": "Customer deleted successfully"})