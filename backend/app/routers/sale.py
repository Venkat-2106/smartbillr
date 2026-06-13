# app/routers/sale.py

from fastapi import APIRouter, Depends, Query
from fastapi import Body
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from decimal import Decimal
from app.database import get_db
from app.middleware.rbac import require_permission, get_current_user_with_permissions
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.product import Product
from app.schemas.sale import SaleCreate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response

# FIX: Import helpers from utils — NOT from routers/payment.py
# This removes the circular-import risk between sale.py and payment.py.
from app.utils.payment_helpers import record_payment_and_sync, calculate_payment_status
from app.utils.timestamp import fmt_ts

import uuid
import re

router = APIRouter(prefix="/sales", tags=["Sales"])


# ─────────────────────────────────────────
# Schema for PATCH /sales/{id}/status body
# ─────────────────────────────────────────
class SaleStatusUpdate(BaseModel):
    status: str


# ─────────────────────────────────────────
# HELPER → Generate Invoice Number
# ─────────────────────────────────────────
def generate_invoice_number(db: Session, business_id: str) -> str:
    result = db.execute(
        text("SELECT get_next_invoice_number(:bid) AS invoice_no"),
        {"bid": business_id}
    ).fetchone()

    if not result or not result.invoice_no:
        raise Exception("Failed to generate invoice number — business counter not found")

    return result.invoice_no


# ══════════════════════════════════════════════════════════════════
# POST /sales → Create a new sale
# ══════════════════════════════════════════════════════════════════
@router.post("/")
def create_sale(
    data: SaleCreate,
    current_user: dict = Depends(require_permission("sales.create")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    user_id     = current_user["user_id"]

    try:
        # ── Step 1 — Validate products and check stock (BULK LOOKUP) ────────
        requested_ids = [str(item.product_id) for item in data.items]

        products_bulk = db.query(Product).filter(
            Product.prod_id.in_(requested_ids),
            Product.business_id == business_id,
            Product.is_deleted  == False
        ).all()

        product_cache = {str(p.prod_id): p for p in products_bulk}

        override_items = []
        stock_errors   = []

        for item in data.items:
            product = product_cache.get(str(item.product_id))

            if not product:
                return error_response(
                    f"Product '{item.product_id}' not found or does not belong to your business",
                    404
                )

            if product.prod_stock_qty < item.sale_item_quantity:
                if data.allow_stock_override:
                    override_items.append({
                        "product":       product,
                        "requested_qty": item.sale_item_quantity,
                        "available_qty": int(product.prod_stock_qty),
                    })
                else:
                    stock_errors.append({
                        "product_id":    str(product.prod_id),
                        "product_name":  product.prod_name,
                        "available_qty": int(product.prod_stock_qty),
                        "requested_qty": item.sale_item_quantity,
                        "shortfall":     item.sale_item_quantity - int(product.prod_stock_qty),
                    })

        if stock_errors:
            from fastapi.responses import JSONResponse as _JSONResponse
            return _JSONResponse(
                status_code=400,
                content={
                    "success":      False,
                    "message":      "Insufficient stock for one or more items",
                    "error_code":   "INSUFFICIENT_STOCK",
                    "stock_errors": stock_errors,
                }
            )

        # ── Step 2 — Calculate totals ─────────────────────────────────────────
        # MRP DISCOUNT POLICY:
        #   MRP (Maximum Retail Price) is shown on the invoice as informational
        #   display — "you saved X vs MRP". It is NOT a discount off the bill.
        #   The customer always pays: sell_price × qty + tax.
        #
        # WHY sales_discount MUST stay 0 here:
        #   The DB generated column is:
        #     sales_final_amount = sales_total_amount - sales_discount
        #                         + cgst_total + sgst_total + igst_total + tax_total
        #   Storing (MRP - sell_price) × qty as sales_discount would make the
        #   customer pay LESS than the sell price — an undercharge error.
        #
        #   sales_discount is reserved for future explicit manual discounts only
        #   (e.g. a cashier applying a 10% loyalty reduction), which would be
        #   sent explicitly from the frontend. MRP savings are preserved per
        #   line via sale_items.item_mrp (frozen snapshot at time of sale).
        total_amount = Decimal("0")
        for item in data.items:
            total_amount += item.sale_item_unit_price * item.sale_item_quantity

        # Only honour an explicit discount sent by the frontend (currently always 0).
        discount = (
            data.sales_discount
            if (data.sales_discount is not None and data.sales_discount > 0)
            else Decimal("0")
        )

        # ── Step 3 — Generate invoice number via DB function ─────────────────
        invoice_no = generate_invoice_number(db, business_id)

        # ── Step 4 — Insert sale header via raw SQL ──────────────────────────
        # WHY raw SQL: sales_final_amount is a GENERATED ALWAYS AS column.
        # SQLAlchemy ORM would try to insert NULL which the DB rejects.
        new_sale_id = str(uuid.uuid4())

        db.execute(
            text("""
                INSERT INTO sales (
                    sales_id, business_id, customer_id,
                    invoice_no, sales_total_amount, sales_discount,
                    sales_payment_method, sales_payment_status, created_by
                ) VALUES (
                    CAST(:sales_id AS uuid),
                    CAST(:business_id AS uuid),
                    CAST(:customer_id AS uuid),
                    :invoice_no, :sales_total_amount, :sales_discount,
                    :sales_payment_method, :sales_payment_status,
                    CAST(:created_by AS uuid)
                )
            """),
            {
                "sales_id":             new_sale_id,
                "business_id":          business_id,
                "customer_id":          str(data.customer_id) if data.customer_id else None,
                "invoice_no":           invoice_no,
                "sales_total_amount":   str(total_amount),
                "sales_discount":       str(discount),
                "sales_payment_method": data.sales_payment_method,
                "sales_payment_status": data.sales_payment_status,
                "created_by":           user_id
            }
        )

        # ── Step 5 — Pre-insert stock adjustment for override items ───────────
        # Must run BEFORE sale_items inserts so the trigger sees enough stock.
        if override_items:
            for ov in override_items:
                product   = ov["product"]
                avail     = ov["available_qty"]
                shortfall = ov["requested_qty"] - avail

                db.execute(
                    text("""
                        UPDATE products
                        SET prod_stock_qty = prod_stock_qty + :shortfall
                        WHERE prod_id = CAST(:product_id AS uuid)
                    """),
                    {"shortfall": shortfall, "product_id": str(product.prod_id)}
                )

                db.execute(
                    text("""
                        INSERT INTO stock_movements (
                            business_id, product_id,
                            move_type, move_qty, move_prev_stock,
                            sale_reference_id, move_notes, move_created_by
                        ) VALUES (
                            CAST(:business_id AS uuid),
                            CAST(:product_id  AS uuid),
                            'adjustment',
                            :move_qty,
                            :move_prev_stock,
                            CAST(:sale_ref AS uuid),
                            :move_notes,
                            CAST(:created_by AS uuid)
                        )
                    """),
                    {
                        "business_id":     business_id,
                        "product_id":      str(product.prod_id),
                        "move_qty":        shortfall,
                        "move_prev_stock": avail,
                        "sale_ref":        new_sale_id,
                        "move_notes":      f"Manual stock adjustment during sale override — {shortfall} unit(s) added to fulfil order (stock was {avail}, needed {ov['requested_qty']})",
                        "created_by":      user_id,
                    }
                )

        # ── Step 5.5 — Insert sale items via raw SQL ─────────────────────────
        # GENERATED columns (sale_item_subtotal, item_tax_total, item_total_with_tax)
        # are never inserted — DB computes them.
        # Trigger trg_sale_stock_movement fires per-item:
        #   → deducts stock, fills cgst/sgst/igst/tax_amount
        # item_mrp is frozen here from product_cache — historical invoices always
        # reflect the MRP that was in effect at checkout, not the current value.
        for item in data.items:
            product  = product_cache[str(item.product_id)]
            item_mrp = str(product.prod_mrp) if product.prod_mrp is not None else None
            db.execute(
                text("""
                    INSERT INTO sale_items (
                        business_id, sale_id, product_id,
                        sale_item_quantity, sale_item_unit_price,
                        item_mrp
                    ) VALUES (
                        CAST(:business_id AS uuid),
                        CAST(:sale_id AS uuid),
                        CAST(:product_id AS uuid),
                        :quantity,
                        :unit_price,
                        :item_mrp
                    )
                """),
                {
                    "business_id": business_id,
                    "sale_id":     new_sale_id,
                    "product_id":  str(item.product_id),
                    "quantity":    item.sale_item_quantity,
                    "unit_price":  str(item.sale_item_unit_price),
                    "item_mrp":    item_mrp,
                }
            )

        # ── Step 6 — Update sales header with summed tax totals ──────────────
        # The trigger fills cgst/sgst/igst on each sale_item row.
        # We must SUM them back to the sales header so the generated column
        # sales_final_amount can include them in its formula.
        # Single-scan CTE reads sale_items once for all 4 columns.
        db.execute(
            text("""
                UPDATE sales
                SET
                    cgst_total = x.c,
                    sgst_total = x.s,
                    igst_total = x.i,
                    tax_total  = x.t
                FROM (
                    SELECT
                        COALESCE(SUM(cgst_amount), 0) AS c,
                        COALESCE(SUM(sgst_amount), 0) AS s,
                        COALESCE(SUM(igst_amount), 0) AS i,
                        COALESCE(SUM(tax_amount),  0) AS t
                    FROM sale_items
                    WHERE sale_id = CAST(:sid AS uuid)
                ) x
                WHERE sales_id = CAST(:sid AS uuid)
            """),
            {"sid": new_sale_id}
        )

        # ── Step 7 — Auto-record payment at invoice creation ──────────────────
        if data.sales_payment_status in ("paid", "partial"):
            sale_row = db.execute(
                text("SELECT sales_final_amount FROM sales WHERE sales_id = CAST(:sid AS uuid)"),
                {"sid": new_sale_id}
            ).fetchone()
            # sales_final_amount is a DB generated column — always set after Step 6.
            # Fallback: since discount is now 0, total_amount is a safe approximation.
            final_amount = (
                float(sale_row.sales_final_amount)
                if sale_row and sale_row.sales_final_amount
                else float(total_amount)
            )

            if data.sales_payment_status == "paid":
                record_payment_and_sync(
                    db              = db,
                    business_id     = business_id,
                    sale_id         = new_sale_id,
                    sale_final      = final_amount,
                    payment_amount  = final_amount,
                    payment_method  = data.sales_payment_method or "cash",
                    new_status      = "paid",
                    cumulative_paid = final_amount
                )

            elif data.sales_payment_status == "partial" and data.paid_amount and float(data.paid_amount) > 0:
                paid = float(data.paid_amount)
                if paid >= final_amount:
                    record_payment_and_sync(
                        db              = db,
                        business_id     = business_id,
                        sale_id         = new_sale_id,
                        sale_final      = final_amount,
                        payment_amount  = final_amount,
                        payment_method  = data.sales_payment_method or "cash",
                        new_status      = "paid",
                        cumulative_paid = final_amount
                    )
                else:
                    record_payment_and_sync(
                        db              = db,
                        business_id     = business_id,
                        sale_id         = new_sale_id,
                        sale_final      = final_amount,
                        payment_amount  = round(paid, 2),
                        payment_method  = data.sales_payment_method or "cash",
                        new_status      = "partial",
                        cumulative_paid = round(paid, 2)
                    )

        db.commit()

        return success_response({
            "message":      "Sale created successfully",
            "invoice_no":   invoice_no,
            "sales_id":     new_sale_id,
            "total_amount": str(total_amount),
        }, 201)

    except Exception as e:
        db.rollback()
        error_msg = str(e)

        if "Insufficient stock" in error_msg:
            match = re.search(r"Insufficient stock[^\n\"\\]+", error_msg)
            clean = match.group(0).strip() if match else "Insufficient stock for one or more items"
            return error_response(clean, 400)

        return error_response("An unexpected error occurred. Please try again.", 500)


# ══════════════════════════════════════════════════════════════════
# GET /sales → All sales (paginated) with payment summary
# ══════════════════════════════════════════════════════════════════
@router.get("/")
def get_sales(
    current_user: dict          = Depends(require_permission("sales.view")),
    db:           Session       = Depends(get_db),
    pagination:   dict          = Depends(paginate),
    search:       str           = Query(None),
    status:       str           = Query(None),
    date_from:    str           = Query(None),
    date_to:      str           = Query(None),
    sort_by:      Optional[str] = Query(default="sales_created_at", description="Column to sort by"),
    sort_dir:     Optional[str] = Query(default="desc",             description="asc or desc"),
):
    business_id = current_user["business_id"]

    SORTABLE = {
        "sales_created_at":     "s.sales_created_at",
        "invoice_no":           "s.invoice_no",
        "customer_name":        "c.cust_name",
        "sales_final_amount":   "s.sales_final_amount",
        "sales_payment_status": "s.sales_payment_status",
        "sales_payment_method": "s.sales_payment_method",
    }
    order_col = SORTABLE.get(sort_by, "s.sales_created_at")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    extra_where = ""
    params = {
        "bid":    business_id,
        "offset": pagination["offset"],
        "limit":  pagination["limit"],
    }

    if search:
        extra_where += " AND (s.invoice_no ILIKE :search OR c.cust_name ILIKE :search)"
        params["search"] = f"%{search}%"

    if status and status != "all":
        extra_where += " AND s.sales_payment_status = :status"
        params["status"] = status

    if date_from:
        extra_where += " AND s.sales_created_at >= :date_from"
        params["date_from"] = date_from

    if date_to:
        extra_where += " AND s.sales_created_at <= :date_to"
        params["date_to"] = date_to

    count_sql = f"""
        SELECT COUNT(*)
        FROM sales s
        LEFT JOIN customers c ON c.cust_id = s.customer_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted  = false
        {extra_where}
    """
    total = db.execute(text(count_sql), params).scalar()

    data_sql = f"""
        SELECT s.sales_id, s.invoice_no, s.customer_id,
               c.cust_name        AS customer_name,
               s.sales_total_amount, s.sales_final_amount,
               s.cgst_total, s.sgst_total, s.igst_total, s.tax_total,
               s.sales_payment_status, s.sales_payment_method,
               s.sales_created_at
        FROM sales s
        LEFT JOIN customers c ON c.cust_id = s.customer_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted  = false
        {extra_where}
        ORDER BY {order_col} {order_dir}
        OFFSET :offset LIMIT :limit
    """
    sales_rows = db.execute(text(data_sql), params).fetchall()

    sale_ids = [str(r.sales_id) for r in sales_rows]

    payment_map = {}
    if sale_ids:
        id_placeholders = ", ".join(
            f"CAST(:id_{i} AS uuid)" for i in range(len(sale_ids))
        )
        id_params = {f"id_{i}": sid for i, sid in enumerate(sale_ids)}

        payment_rows = db.execute(
            text(f"""
                SELECT sale_id,
                       COALESCE(cumulative_paid, 0) AS total_paid,
                       payment_status
                FROM payments
                WHERE sale_id  IN ({id_placeholders})
                  AND is_active = true
            """),
            id_params
        ).fetchall()
        payment_map = {
            str(row.sale_id): {
                "total_paid":     float(row.total_paid),
                "payment_status": row.payment_status
            }
            for row in payment_rows
        }

    result = []
    for r in sales_rows:
        sale_id_str = str(r.sales_id)
        sale_final  = float(r.sales_final_amount) if r.sales_final_amount else 0.0
        pay_info    = payment_map.get(sale_id_str, {"total_paid": 0.0, "payment_status": r.sales_payment_status})
        total_paid  = pay_info["total_paid"]
        remaining   = round(sale_final - total_paid, 2)

        result.append({
            "sales_id":             sale_id_str,
            "invoice_no":           r.invoice_no,
            "customer_id":          str(r.customer_id) if r.customer_id else None,
            "customer_name":        r.customer_name or None,
            "sales_total_amount":   str(r.sales_total_amount),
            "sales_final_amount":   str(r.sales_final_amount) if r.sales_final_amount else None,
            "cgst_total":           str(r.cgst_total) if r.cgst_total else None,
            "sgst_total":           str(r.sgst_total) if r.sgst_total else None,
            "igst_total":           str(r.igst_total) if r.igst_total else None,
            "tax_total":            str(r.tax_total) if r.tax_total else None,
            "sales_payment_status": r.sales_payment_status,
            "sales_payment_method": r.sales_payment_method,
            "total_paid":           round(total_paid, 2),
            "remaining_balance":    remaining if remaining > 0 else 0,
            "sales_created_at":     fmt_ts(r.sales_created_at)
        })

    return success_response(
        pagination_response(result, total, pagination["page"], pagination["limit"])
    )


# ══════════════════════════════════════════════════════════════════
# GET /sales/{sales_id} → Single sale with items
# ══════════════════════════════════════════════════════════════════
@router.get("/{sales_id}")
def get_sale(
    sales_id: str,
    current_user: dict = Depends(require_permission("sales.view")),
    db: Session = Depends(get_db)
):
    sale = db.execute(
        text("""
            SELECT s.sales_id, s.business_id, s.customer_id,
                   c.cust_name        AS customer_name,
                   s.invoice_no,
                   s.sales_total_amount, s.sales_discount,
                   s.cgst_total, s.sgst_total, s.igst_total, s.tax_total,
                   s.sales_final_amount, s.sales_payment_method,
                   s.sales_payment_status, s.sales_created_at
            FROM sales s
            LEFT JOIN customers c ON c.cust_id = s.customer_id
            WHERE s.sales_id    = CAST(:sid AS uuid)
              AND s.business_id = CAST(:bid AS uuid)
              AND s.is_deleted  = false
        """),
        {"sid": sales_id, "bid": current_user["business_id"]}
    ).fetchone()

    if not sale:
        return error_response("Sale not found", 404)

    items = db.execute(
        text("""
            SELECT si.sale_item_id, si.product_id,
                   p.prod_name         AS product_name,
                   si.sale_item_quantity, si.sale_item_unit_price,
                   si.item_mrp,
                   si.sale_item_subtotal, si.cgst_amount, si.sgst_amount,
                   si.igst_amount, si.tax_amount, si.item_tax_total, si.item_total_with_tax
            FROM sale_items si
            LEFT JOIN products p ON p.prod_id = si.product_id
            WHERE si.sale_id = CAST(:sid AS uuid)
        """),
        {"sid": sales_id}
    ).fetchall()

    active_payment = db.execute(
        text("""
            SELECT COALESCE(cumulative_paid, 0) AS total_paid,
                   payment_status
            FROM payments
            WHERE sale_id  = CAST(:sid AS uuid)
              AND is_active = true
        """),
        {"sid": sales_id}
    ).fetchone()

    sale_final = float(sale.sales_final_amount) if sale.sales_final_amount else 0.0
    total_paid = float(active_payment.total_paid) if active_payment else 0.0
    remaining  = round(sale_final - total_paid, 2)

    items_data = []
    for i in items:
        item_mrp_val = float(i.item_mrp) if i.item_mrp is not None else None
        unit_price   = float(i.sale_item_unit_price)
        qty          = i.sale_item_quantity

        if item_mrp_val is not None and item_mrp_val > unit_price:
            discount_per_unit = round(item_mrp_val - unit_price, 2)
            discount_amount   = round(discount_per_unit * qty, 2)
            discount_pct      = round((discount_per_unit / item_mrp_val) * 100, 1)
        else:
            discount_per_unit = None
            discount_amount   = None
            discount_pct      = None

        items_data.append({
            "sale_item_id":         str(i.sale_item_id),
            "product_id":           str(i.product_id),
            "product_name":         i.product_name or "Unknown Product",
            "sale_item_quantity":   qty,
            "sale_item_unit_price": str(i.sale_item_unit_price),
            "item_mrp":             str(i.item_mrp) if i.item_mrp is not None else None,
            "item_discount_amount": str(discount_amount) if discount_amount is not None else None,
            "item_discount_pct":    str(discount_pct)    if discount_pct    is not None else None,
            "sale_item_subtotal":   str(i.sale_item_subtotal) if i.sale_item_subtotal else None,
            "cgst_amount":          str(i.cgst_amount) if i.cgst_amount else None,
            "sgst_amount":          str(i.sgst_amount) if i.sgst_amount else None,
            "igst_amount":          str(i.igst_amount) if i.igst_amount else None,
            "tax_amount":           str(i.tax_amount) if i.tax_amount else None,
            "item_tax_total":       str(i.item_tax_total) if i.item_tax_total else None,
            "item_total_with_tax":  str(i.item_total_with_tax) if i.item_total_with_tax else None,
        })

    return success_response({
        "sales_id":             str(sale.sales_id),
        "invoice_no":           sale.invoice_no,
        "customer_id":          str(sale.customer_id) if sale.customer_id else None,
        "customer_name":        sale.customer_name or None,
        "sales_total_amount":   str(sale.sales_total_amount),
        "sales_discount":       str(sale.sales_discount),
        "cgst_total":           str(sale.cgst_total) if sale.cgst_total else None,
        "sgst_total":           str(sale.sgst_total) if sale.sgst_total else None,
        "igst_total":           str(sale.igst_total) if sale.igst_total else None,
        "tax_total":            str(sale.tax_total) if sale.tax_total else None,
        "sales_final_amount":   str(sale.sales_final_amount) if sale.sales_final_amount else None,
        "sales_payment_method": sale.sales_payment_method,
        "sales_payment_status": sale.sales_payment_status,
        "total_paid":           round(total_paid, 2),
        "remaining_balance":    remaining if remaining > 0 else 0,
        "sales_created_at":     fmt_ts(sale.sales_created_at),
        "items":                items_data
    })


# ══════════════════════════════════════════════════════════════════
# PATCH /sales/{sales_id}/status → Manual payment status override
# ══════════════════════════════════════════════════════════════════
@router.patch("/{sales_id}/status")
def update_payment_status(
    sales_id: str,
    body: SaleStatusUpdate,
    current_user: dict = Depends(require_permission("sales.edit")),
    db: Session = Depends(get_db)
):
    allowed = ["pending", "paid", "partial"]
    status  = body.status

    if status not in allowed:
        return error_response(f"Status must be one of: {allowed}", 400)

    sale = db.query(Sale).filter(
        Sale.sales_id    == sales_id,
        Sale.business_id == current_user["business_id"],
        Sale.is_deleted  == False
    ).first()

    if not sale:
        return error_response("Sale not found", 404)

    old_status = sale.sales_payment_status

    if old_status == status:
        return success_response({"message": f"Sale is already '{status}'", "status": status})

    reconciliation_inserted = False

    if status == "paid" and old_status != "paid":
        sale_row = db.execute(
            text("SELECT sales_final_amount FROM sales WHERE sales_id = CAST(:sid AS uuid)"),
            {"sid": sales_id}
        ).fetchone()
        sale_final = float(sale_row.sales_final_amount) if sale_row and sale_row.sales_final_amount else 0

        active_row = db.execute(
            text("""
                SELECT COALESCE(cumulative_paid, 0) AS already_paid
                FROM payments
                WHERE sale_id  = CAST(:sid AS uuid)
                  AND is_active = true
            """),
            {"sid": sales_id}
        ).fetchone()
        already_paid = float(active_row.already_paid) if active_row else 0.0
        remaining    = round(sale_final - already_paid, 2)

        if remaining > 0:
            record_payment_and_sync(
                db              = db,
                business_id     = current_user["business_id"],
                sale_id         = sales_id,
                sale_final      = sale_final,
                payment_amount  = remaining,
                payment_method  = "adjustment",
                new_status      = "paid",
                cumulative_paid = round(already_paid + remaining, 2)
            )
            reconciliation_inserted = True
        else:
            db.execute(
                text("""
                    UPDATE payments SET payment_status = 'paid'
                    WHERE sale_id = CAST(:sid AS uuid) AND is_active = true
                """),
                {"sid": sales_id}
            )
            db.execute(
                text("UPDATE sales SET sales_payment_status = 'paid' WHERE sales_id = CAST(:sid AS uuid)"),
                {"sid": sales_id}
            )

    else:
        db.execute(
            text("UPDATE sales SET sales_payment_status = :status WHERE sales_id = CAST(:sid AS uuid)"),
            {"status": status, "sid": sales_id}
        )
        db.execute(
            text("""
                UPDATE payments SET payment_status = :status
                WHERE sale_id = CAST(:sid AS uuid) AND is_active = true
            """),
            {"status": status, "sid": sales_id}
        )

    db.commit()

    response_data = {"message": "Payment status updated", "status": status}
    if reconciliation_inserted:
        response_data["note"] = (
            "A reconciliation payment row was automatically created "
            "in the payments table to record the remaining balance as an adjustment."
        )

    return success_response(response_data)


# ══════════════════════════════════════════════════════════════════
# DELETE /sales/{sales_id} → Soft delete
# ══════════════════════════════════════════════════════════════════
@router.delete("/{sales_id}")
def delete_sale(
    sales_id: str,
    current_user: dict = Depends(require_permission("sales.delete")),
    db: Session = Depends(get_db)
):
    sale = db.query(Sale).filter(
        Sale.sales_id    == sales_id,
        Sale.business_id == current_user["business_id"],
        Sale.is_deleted  == False
    ).first()

    if not sale:
        return error_response("Sale not found", 404)

    sale.is_deleted = True
    db.commit()

    return success_response({"message": "Sale deleted successfully"})