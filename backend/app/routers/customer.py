# app/routers/customer.py
# OPTIMIZED VERSION
# Changes:
#   1. Added `search` query param to GET /customers/ — filters name, phone, email via ILIKE
#   2. Replaced N+1 per-sale loop in GET /customers/{id} with 3 batch SQL queries
#      (one for all items, one for all payment summaries, one for all returns)
#      reducing from 3*N queries to 3 fixed queries regardless of sales count
#   3. Pagination `le` raised to 100 (20 is default, 100 is max — removes need for limit=1000)
#   4. [NEW] customer_to_dict now returns updated_at + last_updated_by
#   5. [NEW] GET /customers/ batch-resolves last_updated_by names via profiles JOIN
#   6. [NEW] PUT /customers/{id} sets updated_by = current_user["user_id"],
#            fetches updater name, returns it in response
#            (DB trigger trg_customers_updated_at auto-sets updated_at on commit)

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
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
# Accepts optional last_updated_by name string (resolved by caller via JOIN).
# ─────────────────────────────────────────
def customer_to_dict(c, last_updated_by=None) -> dict:
    return {
        "cust_id":           str(c.cust_id),
        "business_id":       str(c.business_id),
        "cust_name":         c.cust_name,
        "cust_phone":        c.cust_phone,
        "cust_email":        c.cust_email,
        "cust_address":      c.cust_address,
        "cust_state":        c.cust_state,
        "cust_country_code": c.cust_country_code,
        "cust_tax_number":   c.cust_tax_number,
        "is_deleted":        c.is_deleted,
        "cust_created_at":   str(c.cust_created_at) if c.cust_created_at else None,
        "updated_at":        str(c.updated_at)      if c.updated_at      else None,
        "updated_by":        str(c.updated_by)      if c.updated_by      else None,
        "last_updated_by":   last_updated_by,
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
        # updated_by stays NULL on create — only set when customer is later edited
    )

    db.add(new_customer)
    db.commit()
    db.refresh(new_customer)

    return success_response({
        "message":  "Customer created successfully",
        "customer": customer_to_dict(new_customer)
    }, status_code=201)


# ══════════════════════════════════════════════════════════════════
# GET /customers → Paginated list with server-side search
#
# FIX: Added `search` param — filters name, phone, email via ILIKE.
#      phone param kept for backward compat (sale form auto-fill).
# NEW: Batch-resolves last_updated_by names via LEFT JOIN to profiles.
#      No N+1 — one SQL query returns all names at once.
# ══════════════════════════════════════════════════════════════════
@router.get("/")
def get_all_customers(
    current_user: dict          = Depends(require_permission("customers.manage")),
    db:           Session       = Depends(get_db),
    pagination:   dict          = Depends(paginate),
    search:       Optional[str] = Query(default=None, description="Search by name, phone, or email"),
    phone:        Optional[str] = Query(default=None, description="Exact phone match (for sale form auto-fill)")
):
    business_id = current_user["business_id"]

    base = db.query(Customer).filter(
        Customer.business_id == business_id,
        Customer.is_deleted  == False
    )

    # Server-side search — ILIKE covers name, phone, email in one pass
    if search and search.strip():
        q = f"%{search.strip()}%"
        from sqlalchemy import or_
        base = base.filter(
            or_(
                Customer.cust_name.ilike(q),
                Customer.cust_phone.ilike(q),
                Customer.cust_email.ilike(q),
            )
        )

    # Exact phone filter (kept for sale creation form)
    if phone:
        base = base.filter(Customer.cust_phone == phone)

    total = base.count()

    # Use raw SQL for the list so we can LEFT JOIN profiles in one query
    # and resolve last_updated_by names without an N+1 loop.
    # We replicate the same filters in SQL.
    search_clause = ""
    phone_clause  = ""
    params: dict  = {
        "bid":    business_id,
        "offset": pagination["offset"],
        "limit":  pagination["limit"],
    }

    if search and search.strip():
        search_clause = """
            AND (
                c.cust_name  ILIKE :search_q
             OR c.cust_phone ILIKE :search_q
             OR c.cust_email ILIKE :search_q
            )
        """
        params["search_q"] = f"%{search.strip()}%"

    if phone:
        phone_clause = "AND c.cust_phone = :exact_phone"
        params["exact_phone"] = phone

    rows = db.execute(
        text(f"""
            SELECT
                c.cust_id, c.business_id,
                c.cust_name, c.cust_phone, c.cust_email,
                c.cust_address, c.cust_state, c.cust_country_code,
                c.cust_tax_number, c.is_deleted,
                c.cust_created_at, c.updated_at, c.updated_by,
                p.full_name AS last_updated_by
            FROM customers c
            LEFT JOIN profiles p ON p.id = c.updated_by
            WHERE c.business_id = CAST(:bid AS uuid)
              AND c.is_deleted   = false
              {search_clause}
              {phone_clause}
            ORDER BY c.cust_name ASC
            OFFSET :offset LIMIT :limit
        """),
        params
    ).fetchall()

    data = [
        {
            "cust_id":           str(r.cust_id),
            "business_id":       str(r.business_id),
            "cust_name":         r.cust_name,
            "cust_phone":        r.cust_phone,
            "cust_email":        r.cust_email,
            "cust_address":      r.cust_address,
            "cust_state":        r.cust_state,
            "cust_country_code": r.cust_country_code,
            "cust_tax_number":   r.cust_tax_number,
            "is_deleted":        r.is_deleted,
            "cust_created_at":   str(r.cust_created_at) if r.cust_created_at else None,
            "updated_at":        str(r.updated_at)      if r.updated_at      else None,
            "updated_by":        str(r.updated_by)      if r.updated_by      else None,
            "last_updated_by":   r.last_updated_by      if r.last_updated_by else None,
        }
        for r in rows
    ]

    return success_response(
        pagination_response(data, total, pagination["page"], pagination["limit"])
    )


# ══════════════════════════════════════════════════════════════════
# GET /customers/search/phone?phone=9876543210
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
        return error_response(f"No customer found with phone number '{phone}'", 404)

    return success_response(customer_to_dict(customer))


# ══════════════════════════════════════════════════════════════════
# GET /customers/{cust_id} → Detail + summary + sales history
#
# FIX: Replaced N+1 per-sale loop with 3 batch queries:
#   Query 1 — all sales for this customer (unchanged)
#   Query 2 — all sale_items for those sales (JOIN batch, not per-sale loop)
#   Query 3 — all payment summaries (GROUP BY sale_id, one row per sale)
#   Query 4 — all returns (for those sales, batch)
#
# Before: 1 + 3*N DB round-trips where N = number of sales
# After:  4 DB round-trips regardless of N
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

    # ── Query 1: all sales ─────────────────────────────────────────
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

    if not sale_rows:
        return success_response({
            **customer_to_dict(customer),
            "summary": {
                "total_sales": 0,
                "total_spent": 0,
                "total_paid": 0,
                "outstanding_balance": 0,
                "total_returns": 0
            },
            "sales_history": []
        })

    sale_ids = [str(r.sales_id) for r in sale_rows]

    # ── Query 2: all items for all sales (batch) ──────────────────
    items_rows = db.execute(
        text("""
            SELECT
                si.sale_id,
                si.sale_item_id, si.product_id, p.prod_name,
                si.sale_item_quantity, si.sale_item_unit_price,
                si.sale_item_subtotal, si.item_tax_total, si.item_total_with_tax
            FROM sale_items si
            LEFT JOIN products p ON p.prod_id = si.product_id
            WHERE si.sale_id = ANY(CAST(:ids AS uuid[]))
              AND si.business_id = CAST(:bid AS uuid)
        """),
        {"ids": "{" + ",".join(sale_ids) + "}", "bid": business_id}
    ).fetchall()

    # Group items by sale_id
    items_by_sale: dict = {}
    for i in items_rows:
        key = str(i.sale_id)
        items_by_sale.setdefault(key, []).append({
            "sale_item_id":        str(i.sale_item_id),
            "product_id":          str(i.product_id),
            "prod_name":           i.prod_name,
            "qty":                 i.sale_item_quantity,
            "unit_price":          float(i.sale_item_unit_price),
            "subtotal":            float(i.sale_item_subtotal)       if i.sale_item_subtotal      else None,
            "item_tax_total":      float(i.item_tax_total)           if i.item_tax_total          else 0,
            "item_total_with_tax": float(i.item_total_with_tax)      if i.item_total_with_tax     else None,
        })

    # ── Query 3: payment summary per sale (batch GROUP BY) ────────
    pay_rows = db.execute(
        text("""
            SELECT
                sale_id,
                COALESCE(MAX(cumulative_paid), 0)                    AS total_paid_amount,
                MAX(CASE WHEN is_active = true THEN payment_status END) AS current_status,
                COUNT(*)                                              AS payment_count
            FROM payments
            WHERE sale_id = ANY(CAST(:ids AS uuid[]))
              AND business_id = CAST(:bid AS uuid)
            GROUP BY sale_id
        """),
        {"ids": "{" + ",".join(sale_ids) + "}", "bid": business_id}
    ).fetchall()

    pay_by_sale = {str(r.sale_id): r for r in pay_rows}

    # ── Query 4: all returns for all sales (batch) ────────────────
    return_rows = db.execute(
        text("""
            SELECT
                sale_id, return_id, return_amount, return_reason,
                return_status, refund_method, restock, return_created_at
            FROM sales_returns
            WHERE sale_id = ANY(CAST(:ids AS uuid[]))
              AND business_id = CAST(:bid AS uuid)
            ORDER BY return_created_at DESC
        """),
        {"ids": "{" + ",".join(sale_ids) + "}", "bid": business_id}
    ).fetchall()

    returns_by_sale: dict = {}
    for r in return_rows:
        key = str(r.sale_id)
        returns_by_sale.setdefault(key, []).append({
            "return_id":         str(r.return_id),
            "return_amount":     float(r.return_amount),
            "return_reason":     r.return_reason,
            "return_status":     r.return_status,
            "refund_method":     r.refund_method,
            "restock":           r.restock,
            "return_created_at": str(r.return_created_at) if r.return_created_at else None
        })

    # ── Assemble response ─────────────────────────────────────────
    sales_history = []
    total_spent   = 0.0
    total_paid    = 0.0
    total_returns = 0.0

    for sale in sale_rows:
        sale_id    = str(sale.sales_id)
        sale_final = float(sale.sales_final_amount) if sale.sales_final_amount else 0.0
        total_spent += sale_final

        pay = pay_by_sale.get(sale_id)
        paid_for_sale = float(pay.total_paid_amount) if pay else 0.0
        total_paid   += paid_for_sale
        remaining     = round(sale_final - paid_for_sale, 2)

        # Count approved returns for total_returns summary
        for ret in returns_by_sale.get(sale_id, []):
            if ret["return_status"] == "approved":
                total_returns += ret["return_amount"]

        payment_summary = {
            "total_paid":        round(paid_for_sale, 2),
            "remaining_balance": remaining if remaining > 0 else 0,
            "payment_count":     pay.payment_count if pay else 0,
            "current_status":    (pay.current_status if pay and pay.current_status
                                  else sale.sales_payment_status),
        }

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
            "items":                items_by_sale.get(sale_id, []),
            "returns":              returns_by_sale.get(sale_id, []),
        })

    outstanding = round(total_spent - total_paid, 2)

    return success_response({
        **customer_to_dict(customer),
        "summary": {
            "total_sales":         len(sale_rows),
            "total_spent":         round(total_spent, 2),
            "total_paid":          round(total_paid, 2),
            "outstanding_balance": outstanding if outstanding > 0 else 0,
            "total_returns":       round(total_returns, 2)
        },
        "sales_history": sales_history
    })


# ══════════════════════════════════════════════════════════════════
# PUT /customers/{cust_id} → Update customer
# NEW: sets updated_by = current_user["user_id"]
#      DB trigger trg_customers_updated_at auto-sets updated_at on commit
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

    # Track who last updated this customer
    # updated_at is set automatically by DB trigger trg_customers_updated_at
    customer.updated_by = current_user["user_id"]

    db.commit()
    db.refresh(customer)

    # Fetch the updater's name to return in response
    updated_by_name = db.execute(
        text("SELECT full_name FROM profiles WHERE id = CAST(:uid AS uuid)"),
        {"uid": str(customer.updated_by)}
    ).scalar()

    return success_response({
        "message":  "Customer updated successfully",
        "customer": customer_to_dict(customer, last_updated_by=updated_by_name)
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