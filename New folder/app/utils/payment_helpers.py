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

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from decimal import Decimal
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
def calculate_payment_status(total_paid: Decimal, sale_final: Decimal) -> str:
    if total_paid <= 0:
        return "pending"
    elif total_paid >= sale_final:
        return "paid"
    else:
        return "partial"



async def record_payment_and_sync_async(
    db:              AsyncSession,
    business_id:     str,
    sale_id:         str,
    payment_amount:  Decimal,
    payment_method:  str,
    new_status:      str,
    cumulative_paid: Decimal
) -> str:
    """Async variant of record_payment_and_sync for async route handlers."""
    await db.execute(
        text("""
            UPDATE payments
            SET is_active = false
            WHERE sale_id     = CAST(:sale_id AS uuid)
              AND business_id  = CAST(:bid AS uuid)
              AND is_active    = true
        """),
        {"sale_id": sale_id, "bid": business_id}
    )

    new_payment_id = str(uuid.uuid4())
    await db.execute(
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

    await db.execute(
        text("""
            UPDATE sales
            SET sales_payment_status = :status
            WHERE sales_id = CAST(:sid AS uuid)
              AND business_id = CAST(:bid AS uuid)
        """),
        {"status": new_status, "sid": sale_id, "bid": business_id}
    )

    return new_payment_id