# app/routers/sale.py

from fastapi import APIRouter, Depends
from fastapi import Body
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from decimal import Decimal
from app.database import get_db
from app.middleware.auth import verify_token
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.product import Product
from app.schemas.sale import SaleCreate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response

# FIX: Import helpers from utils — NOT from routers/payment.py
# This removes the circular-import risk between sale.py and payment.py.
from app.utils.payment_helpers import record_payment_and_sync, calculate_payment_status

import uuid
import re

router = APIRouter(prefix="/sales", tags=["Sales"])


# ─────────────────────────────────────────
# Schema for PATCH /sales/{id}/status body
#
# FIX: status used to be a URL query param (?status=paid).
# It is now a proper JSON request body.
# WHY: REST convention is to send changes in the request body, not the URL.
# A URL query param means a GET request with filters. A PATCH body means
# "here is the data I want changed."
# ─────────────────────────────────────────
class SaleStatusUpdate(BaseModel):
    status: str


# ─────────────────────────────────────────
# HELPER → Generate Invoice Number
# Calls the DB stored function get_next_invoice_number() which has a
# row-level lock (SELECT FOR UPDATE) to prevent duplicate numbers
# under concurrent requests.
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
    user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = user["business_id"]
    user_id     = user["user_id"]

    try:
        # ── Step 1 — Validate products and check stock ──────────────────────
        # We do ONE loop to check both existence and stock.
        # We store fetched products in a cache so Step 2 can reuse them
        # without querying the DB again for the same product.
        product_cache = {}

        for item in data.items:
            product = db.query(Product).filter(
                Product.prod_id      == item.product_id,
                Product.business_id  == business_id,
                Product.is_deleted   == False
            ).first()

            if not product:
                return error_response(
                    f"Product '{item.product_id}' not found or does not belong to your business",
                    404
                )

            # Pre-validate stock before hitting the DB trigger.
            # This gives the frontend a clean readable error instead of
            # a raw PostgreSQL trigger exception traceback.
            if product.prod_stock_qty < item.sale_item_quantity:
                return error_response(
                    f"Insufficient stock for '{product.prod_name}': "
                    f"{product.prod_stock_qty} available, "
                    f"{item.sale_item_quantity} requested",
                    400
                )

            product_cache[str(item.product_id)] = product

        # ── Step 2 — Calculate totals and auto-discount ─────────────────────
        # DISCOUNT LOGIC:
        #   If frontend sends sales_discount > 0 → use it as manual discount.
        #   If not → auto-calculate from (MRP - actual price) × qty per item.
        #   This captures any price reduction the staff gave the customer.
        total_amount  = Decimal("0")
        auto_discount = Decimal("0")

        for item in data.items:
            product    = product_cache[str(item.product_id)]
            line_total = item.sale_item_unit_price * item.sale_item_quantity
            total_amount += line_total

            price_diff = product.prod_sell_price - item.sale_item_unit_price
            if price_diff > 0:
                auto_discount += price_diff * item.sale_item_quantity

        discount = data.sales_discount if (data.sales_discount is not None and data.sales_discount > 0) \
                   else auto_discount

        # ── Step 3 — Generate invoice number via DB function ─────────────────
        invoice_no = generate_invoice_number(db, business_id)

        # ── Step 4 — Insert sale header via raw SQL ──────────────────────────
        # WHY raw SQL: sales_final_amount is a GENERATED ALWAYS AS column.
        # SQLAlchemy ORM tries to insert NULL for generated columns which the
        # DB rejects with "ERROR: column is generated". Raw SQL lets us skip
        # that column entirely so the DB generates it automatically.
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

        # ── Step 5 — Insert sale items via raw SQL ───────────────────────────
        # WHY raw SQL: sale_item_subtotal, item_tax_total, item_total_with_tax
        # are GENERATED ALWAYS AS columns. We only insert quantity and unit_price.
        # The DB trigger trg_sale_stock_movement fires per item automatically:
        #   → Deducts stock from products table
        #   → Fills cgst/sgst/igst/tax_amount based on business country
        for item in data.items:
            db.execute(
                text("""
                    INSERT INTO sale_items (
                        business_id, sale_id, product_id,
                        sale_item_quantity, sale_item_unit_price
                    ) VALUES (
                        CAST(:business_id AS uuid),
                        CAST(:sale_id AS uuid),
                        CAST(:product_id AS uuid),
                        :quantity,
                        :unit_price
                    )
                """),
                {
                    "business_id": business_id,
                    "sale_id":     new_sale_id,
                    "product_id":  str(item.product_id),
                    "quantity":    item.sale_item_quantity,
                    "unit_price":  str(item.sale_item_unit_price)
                }
            )

        # ── Step 6 — Update sales header with summed tax totals ──────────────
        # The DB trigger fills cgst/sgst/igst on each sale_item row.
        # The sales header tax columns are NOT filled by the trigger — we
        # must SUM them from sale_items and write them back to sales.
        # Without this, sales_final_amount (generated column) would compute
        # wrong totals because it reads the header tax columns.
        db.execute(
            text("""
                UPDATE sales
                SET
                    cgst_total = COALESCE((SELECT SUM(cgst_amount) FROM sale_items WHERE sale_id = CAST(:sid AS uuid)), 0),
                    sgst_total = COALESCE((SELECT SUM(sgst_amount) FROM sale_items WHERE sale_id = CAST(:sid AS uuid)), 0),
                    igst_total = COALESCE((SELECT SUM(igst_amount) FROM sale_items WHERE sale_id = CAST(:sid AS uuid)), 0),
                    tax_total  = COALESCE((SELECT SUM(tax_amount)  FROM sale_items WHERE sale_id = CAST(:sid AS uuid)), 0)
                WHERE sales_id = CAST(:sid AS uuid)
            """),
            {"sid": new_sale_id}
        )

        # ── Step 7 — Auto-record payment for cash sales ──────────────────────
        # If the sale is marked "paid" at creation (e.g., cash walk-in),
        # we immediately record a payment row so the payments ledger is complete.
        # We use record_payment_and_sync() — same helper used by POST /payments.
        if data.sales_payment_status == "paid":
            sale_row = db.execute(
                text("SELECT sales_final_amount FROM sales WHERE sales_id = CAST(:sid AS uuid)"),
                {"sid": new_sale_id}
            ).fetchone()
            final_amount = float(sale_row.sales_final_amount) if sale_row and sale_row.sales_final_amount else float(total_amount)

            record_payment_and_sync(
                db              = db,
                business_id     = business_id,
                sale_id         = new_sale_id,
                sale_final      = final_amount,
                payment_amount  = final_amount,   # full amount paid at once
                payment_method  = data.sales_payment_method or "cash",
                new_status      = "paid",
                cumulative_paid = final_amount    # running total = full amount
            )

        db.commit()

        return success_response({
            "message":       "Sale created successfully",
            "invoice_no":    invoice_no,
            "sales_id":      new_sale_id,
            "total_amount":  str(total_amount),
            "discount":      str(discount),
            "discount_source": "manual" if (data.sales_discount and data.sales_discount > 0) else "auto"
        }, 201)

    except Exception as e:
        db.rollback()
        error_msg = str(e)

        # If the DB trigger fires a stock error (fallback — Step 1 should
        # catch it first), extract only the human-readable part.
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
    user       = Depends(verify_token),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate)
):
    business_id = user["business_id"]

    total = db.query(func.count(Sale.sales_id)).filter(
        Sale.business_id == business_id,
        Sale.is_deleted  == False
    ).scalar()

    sales = db.query(Sale).filter(
        Sale.business_id == business_id,
        Sale.is_deleted  == False
    ).order_by(Sale.sales_created_at.desc()
    ).offset(pagination["offset"]).limit(pagination["limit"]).all()

    # ── FIX: Fetch cumulative_paid for all sales in ONE query ────────────────
    # Instead of N separate queries (one per sale), we fetch ALL active
    # payment rows for this business in a single query and build a lookup map.
    # This is an O(1) DB roundtrip regardless of how many sales are on the page.
    payment_rows = db.execute(
        text("""
            SELECT sale_id,
                   COALESCE(cumulative_paid, 0) AS total_paid,
                   payment_status
            FROM payments
            WHERE business_id = CAST(:bid AS uuid)
              AND is_active    = true
        """),
        {"bid": business_id}
    ).fetchall()

    # Build a map: sale_id → {total_paid, payment_status}
    payment_map = {
        str(row.sale_id): {
            "total_paid":     float(row.total_paid),
            "payment_status": row.payment_status
        }
        for row in payment_rows
    }

    result = []
    for s in sales:
        sale_id_str   = str(s.sales_id)
        sale_final    = float(s.sales_final_amount) if s.sales_final_amount else 0.0
        pay_info      = payment_map.get(sale_id_str, {"total_paid": 0.0, "payment_status": s.sales_payment_status})
        total_paid    = pay_info["total_paid"]
        remaining     = round(sale_final - total_paid, 2)

        result.append({
            "sales_id":             sale_id_str,
            "invoice_no":           s.invoice_no,
            "customer_id":          str(s.customer_id) if s.customer_id else None,
            "sales_total_amount":   str(s.sales_total_amount),
            "sales_final_amount":   str(s.sales_final_amount) if s.sales_final_amount else None,
            "sales_payment_status": s.sales_payment_status,
            "sales_payment_method": s.sales_payment_method,
            # ── NEW fields for the shopkeeper dashboard ──
            "total_paid":           round(total_paid, 2),
            "remaining_balance":    remaining if remaining > 0 else 0,
            "sales_created_at":     str(s.sales_created_at)
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
    user = Depends(verify_token),
    db: Session = Depends(get_db)
):
    sale = db.execute(
        text("""
            SELECT sales_id, business_id, customer_id, invoice_no,
                   sales_total_amount, sales_discount,
                   cgst_total, sgst_total, igst_total, tax_total,
                   sales_final_amount, sales_payment_method,
                   sales_payment_status, sales_created_at
            FROM sales
            WHERE sales_id    = CAST(:sid AS uuid)
              AND business_id  = CAST(:bid AS uuid)
              AND is_deleted   = false
        """),
        {"sid": sales_id, "bid": user["business_id"]}
    ).fetchone()

    if not sale:
        return error_response("Sale not found", 404)

    items = db.execute(
        text("""
            SELECT sale_item_id, product_id,
                   sale_item_quantity, sale_item_unit_price,
                   sale_item_subtotal, cgst_amount, sgst_amount,
                   igst_amount, tax_amount, item_tax_total, item_total_with_tax
            FROM sale_items
            WHERE sale_id = CAST(:sid AS uuid)
        """),
        {"sid": sales_id}
    ).fetchall()

    # Get payment summary for this sale
    active_payment = db.execute(
        text("""
            SELECT COALESCE(cumulative_paid, 0) AS total_paid,
                   payment_status
            FROM payments
            WHERE sale_id    = CAST(:sid AS uuid)
              AND is_active   = true
        """),
        {"sid": sales_id}
    ).fetchone()

    sale_final  = float(sale.sales_final_amount) if sale.sales_final_amount else 0.0
    total_paid  = float(active_payment.total_paid) if active_payment else 0.0
    remaining   = round(sale_final - total_paid, 2)

    items_data = [
        {
            "sale_item_id":        str(i.sale_item_id),
            "product_id":          str(i.product_id),
            "sale_item_quantity":  i.sale_item_quantity,
            "sale_item_unit_price": str(i.sale_item_unit_price),
            "sale_item_subtotal":  str(i.sale_item_subtotal) if i.sale_item_subtotal else None,
            "cgst_amount":         str(i.cgst_amount) if i.cgst_amount else None,
            "sgst_amount":         str(i.sgst_amount) if i.sgst_amount else None,
            "igst_amount":         str(i.igst_amount) if i.igst_amount else None,
            "tax_amount":          str(i.tax_amount) if i.tax_amount else None,
            "item_tax_total":      str(i.item_tax_total) if i.item_tax_total else None,
            "item_total_with_tax": str(i.item_total_with_tax) if i.item_total_with_tax else None
        }
        for i in items
    ]

    return success_response({
        "sales_id":              str(sale.sales_id),
        "invoice_no":            sale.invoice_no,
        "customer_id":           str(sale.customer_id) if sale.customer_id else None,
        "sales_total_amount":    str(sale.sales_total_amount),
        "sales_discount":        str(sale.sales_discount),
        "cgst_total":            str(sale.cgst_total) if sale.cgst_total else None,
        "sgst_total":            str(sale.sgst_total) if sale.sgst_total else None,
        "igst_total":            str(sale.igst_total) if sale.igst_total else None,
        "tax_total":             str(sale.tax_total) if sale.tax_total else None,
        "sales_final_amount":    str(sale.sales_final_amount) if sale.sales_final_amount else None,
        "sales_payment_method":  sale.sales_payment_method,
        "sales_payment_status":  sale.sales_payment_status,
        # ── NEW payment summary fields ──
        "total_paid":            round(total_paid, 2),
        "remaining_balance":     remaining if remaining > 0 else 0,
        "sales_created_at":      str(sale.sales_created_at),
        "items":                 items_data
    })


# ══════════════════════════════════════════════════════════════════
# PATCH /sales/{sales_id}/status → Manual payment status override
#
# WHEN TO USE THIS:
#   This endpoint is for manual overrides only — write-offs, end-of-day
#   reconciliation, or correcting a mistaken status.
#   For normal payments, use POST /payments instead.
#
# FIX 1: status now comes from the JSON request body (was query param).
# FIX 2: No more fake ₹0.01 adjustment row when sale is already fully paid.
#         If remaining > 0 → record an "adjustment" payment for that amount.
#         If remaining = 0 → just update the existing active row's status
#         and sync the sales table. No new row inserted.
# ══════════════════════════════════════════════════════════════════
@router.patch("/{sales_id}/status")
def update_payment_status(
    sales_id: str,
    body: SaleStatusUpdate,
    user = Depends(verify_token),
    db: Session = Depends(get_db)
):
    allowed = ["pending", "paid", "partial"]
    status  = body.status

    if status not in allowed:
        return error_response(f"Status must be one of: {allowed}", 400)

    sale = db.query(Sale).filter(
        Sale.sales_id    == sales_id,
        Sale.business_id == user["business_id"],
        Sale.is_deleted  == False
    ).first()

    if not sale:
        return error_response("Sale not found", 404)

    old_status = sale.sales_payment_status

    # Only act if status is actually changing
    if old_status == status:
        return success_response({"message": f"Sale is already '{status}'", "status": status})

    reconciliation_inserted = False

    if status == "paid" and old_status != "paid":
        # Get the sale final amount
        sale_row = db.execute(
            text("SELECT sales_final_amount FROM sales WHERE sales_id = CAST(:sid AS uuid)"),
            {"sid": sales_id}
        ).fetchone()
        sale_final = float(sale_row.sales_final_amount) if sale_row and sale_row.sales_final_amount else 0

        # Get how much has already been paid from the active payment row
        active_row = db.execute(
            text("""
                SELECT COALESCE(cumulative_paid, 0) AS already_paid
                FROM payments
                WHERE sale_id    = CAST(:sid AS uuid)
                  AND is_active   = true
            """),
            {"sid": sales_id}
        ).fetchone()
        already_paid = float(active_row.already_paid) if active_row else 0.0
        remaining    = round(sale_final - already_paid, 2)

        if remaining > 0:
            # There is an unpaid balance — record it as an "adjustment"
            # (write-off, rounding, etc.)
            record_payment_and_sync(
                db              = db,
                business_id     = user["business_id"],
                sale_id         = sales_id,
                sale_final      = sale_final,
                payment_amount  = remaining,
                payment_method  = "adjustment",
                new_status      = "paid",
                cumulative_paid = round(already_paid + remaining, 2)
            )
            reconciliation_inserted = True
        else:
            # Sale is already fully paid — just update statuses, no new row
            db.execute(
                text("""
                    UPDATE payments
                    SET payment_status = 'paid'
                    WHERE sale_id  = CAST(:sid AS uuid)
                      AND is_active = true
                """),
                {"sid": sales_id}
            )
            db.execute(
                text("UPDATE sales SET sales_payment_status = 'paid' WHERE sales_id = CAST(:sid AS uuid)"),
                {"sid": sales_id}
            )

    else:
        # For other status changes (e.g., paid → partial, partial → pending),
        # just update the sales table. These are manual corrections.
        # The payment history rows are preserved as-is for the audit trail.
        db.execute(
            text("UPDATE sales SET sales_payment_status = :status WHERE sales_id = CAST(:sid AS uuid)"),
            {"status": status, "sid": sales_id}
        )
        # Also update the active payment row's status to match
        db.execute(
            text("""
                UPDATE payments
                SET payment_status = :status
                WHERE sale_id  = CAST(:sid AS uuid)
                  AND is_active = true
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
    user = Depends(verify_token),
    db: Session = Depends(get_db)
):
    sale = db.query(Sale).filter(
        Sale.sales_id    == sales_id,
        Sale.business_id == user["business_id"],
        Sale.is_deleted  == False
    ).first()

    if not sale:
        return error_response("Sale not found", 404)

    sale.is_deleted = True
    db.commit()

    return success_response({"message": "Sale deleted successfully"})