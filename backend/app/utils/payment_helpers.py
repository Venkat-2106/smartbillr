# app/utils/payment_helpers.py
#
# WHY THIS FILE EXISTS:
# Both routers/sale.py and routers/payment.py need record_payment_and_sync()
# and calculate_payment_status(). Before this file, sale.py imported directly
# from payment.py — that is a circular-import risk. If payment.py ever imports
# from sale.py, Python will crash with "cannot import name" at startup.
#
# FIX: Both helpers now live here in utils/. Both routers import from utils/.
# Neither router imports from the other. No circular risk.

from sqlalchemy.orm import Session
from sqlalchemy import text
import uuid


# ─────────────────────────────────────────────────────────────────
# HELPER — Calculate payment status from totals
#
# This is the single source of truth for what "partial", "paid",
# and "pending" mean in SmartBillr.
#
# total_paid  = sum of ALL payment rows for this sale so far
#               (including the one just being added)
# sale_final  = the final amount the customer owes (generated column
#               from sales table — after discount + tax)
# ─────────────────────────────────────────────────────────────────
def calculate_payment_status(total_paid: float, sale_final: float) -> str:
    if total_paid <= 0:
        return "pending"
    elif total_paid >= sale_final:
        return "paid"
    else:
        return "partial"


# ─────────────────────────────────────────────────────────────────
# HELPER — Record a payment and sync the sales table
#
# This runs in THREE places:
#   1. POST /payments        → customer makes a new payment installment
#   2. POST /sales           → cash sale where payment_status="paid" at creation
#   3. PATCH /sales/{id}/status → manual override to mark as paid
#
# Steps it always does:
#   A) Deactivate all existing is_active=true payment rows for this sale
#      (there should only be one, but we use WHERE is_active=true so it
#       is safe even if somehow two existed)
#   B) Insert a new row with is_active=true, the correct status,
#      the installment amount, AND the running cumulative_paid total
#   C) Mirror the status onto sales.sales_payment_status so GET /sales
#      can show status without always joining payments
#
# Returns: new payment_id (str)
# ─────────────────────────────────────────────────────────────────
def record_payment_and_sync(
    db:              Session,
    business_id:     str,
    sale_id:         str,
    sale_final:      float,
    payment_amount:  float,    # this installment only (NOT running total)
    payment_method:  str,
    new_status:      str,
    cumulative_paid: float     # running total AFTER this payment is added
) -> str:

    # Step A — Deactivate all current active rows for this sale
    # WHY: Only ONE row per sale should have is_active=true at any time.
    # That row is the "current snapshot" row. When a new payment comes in,
    # the old snapshot row becomes historical (is_active=false, kept forever).
    db.execute(
        text("""
            UPDATE payments
            SET is_active = false
            WHERE sale_id     = CAST(:sale_id AS uuid)
              AND business_id  = CAST(:bid AS uuid)
              AND is_active    = true
        """),
        {"sale_id": sale_id, "bid": business_id}
    )

    # Step B — Insert the new active payment row
    # payment_amount → what was paid in THIS transaction
    # cumulative_paid → total paid so far across ALL transactions for this sale
    #
    # WHY cumulative_paid on the row:
    # Without it, to know "how much has been paid so far" you must SUM all rows.
    # With it, you can read the active row alone and get the running total.
    # This makes dashboard queries much faster for the React frontend.
    new_payment_id = str(uuid.uuid4())
    db.execute(
        text("""
            INSERT INTO payments (
                payment_id,   business_id,  sale_id,
                payment_amount, payment_method,
                payment_status, is_active,
                cumulative_paid
            ) VALUES (
                CAST(:payment_id  AS uuid),
                CAST(:business_id AS uuid),
                CAST(:sale_id     AS uuid),
                :payment_amount,
                :payment_method,
                :payment_status,
                true,
                :cumulative_paid
            )
        """),
        {
            "payment_id":      new_payment_id,
            "business_id":     business_id,
            "sale_id":         sale_id,
            "payment_amount":  payment_amount,
            "payment_method":  payment_method,
            "payment_status":  new_status,
            "cumulative_paid": cumulative_paid
        }
    )

    # Step C — Mirror status to sales table
    # WHY: sales.sales_payment_status is a convenience column.
    # It lets GET /sales return the status without joining payments every time.
    # Source of truth is still the payments table (is_active=true row).
    db.execute(
        text("""
            UPDATE sales
            SET sales_payment_status = :status
            WHERE sales_id = CAST(:sid AS uuid)
        """),
        {"status": new_status, "sid": sale_id}
    )

    return new_payment_id