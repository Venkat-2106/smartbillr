# app/routers/payment.py

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.rbac import require_permission
from app.models.payment import Payment
from app.models.sale import Sale
from app.schemas.payment import PaymentCreate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response

# FIX: Helpers now imported from utils/payment_helpers.py
# NOT defined here anymore — avoids circular import with sale.py
from app.utils.payment_helpers import record_payment_and_sync, calculate_payment_status

router = APIRouter(prefix="/payments", tags=["Payments"])


# ══════════════════════════════════════════════════════════════════
# ARCHITECTURE — HOW PAYMENT TRACKING WORKS IN SMARTBILLR
# ══════════════════════════════════════════════════════════════════
#
# ANALOGY: Think of a restaurant bill.
#   The BILL (sales table row) says how much is owed in total.
#   The PAYMENT RECEIPTS (payments rows) record each time money was received.
#   The RUNNING TOTAL (cumulative_paid on active row) shows how much paid so far.
#   The REMAINING BALANCE = bill total - cumulative_paid.
#
# KEY RULES:
#   1. payments table is SOURCE OF TRUTH for payment status.
#   2. sales.sales_payment_status is a MIRROR — updated after every payment.
#   3. Only ONE payments row per sale has is_active=true (the latest row).
#   4. Old rows keep is_active=false forever (audit trail).
#   5. cumulative_paid on the active row = total money received so far.
#   6. payment_amount on each row = that specific installment only.
#
# EXAMPLE — Sale of ₹1000, paid in 3 installments:
#   Row 1: payment_amount=400, cumulative_paid=400, status=partial, is_active=false
#   Row 2: payment_amount=300, cumulative_paid=700, status=partial, is_active=false
#   Row 3: payment_amount=300, cumulative_paid=1000, status=paid,   is_active=true ← current
#
# To see current status: WHERE sale_id=X AND is_active=true → one row
# To see total paid:     Read cumulative_paid from that one row (= 1000)
# To see remaining:      sale_final - cumulative_paid (= 0)
# ══════════════════════════════════════════════════════════════════


# ─────────────────────────────────────────
# HELPER — Format a payment row as a dict
# ─────────────────────────────────────────
def payment_to_dict(p) -> dict:
    return {
        "payment_id":      str(p.payment_id),
        "business_id":     str(p.business_id),
        "sale_id":         str(p.sale_id),
        "payment_amount":  float(p.payment_amount),
        "cumulative_paid": float(p.cumulative_paid) if p.cumulative_paid is not None else None,
        "payment_method":  p.payment_method,
        "payment_status":  p.payment_status,
        "is_active":       p.is_active,
        "payment_paid_at": str(p.payment_paid_at) if p.payment_paid_at else None
    }


# ══════════════════════════════════════════════════════════════════
# POST /payments → Record a new payment installment for a sale
# ══════════════════════════════════════════════════════════════════
@router.post("/")
def create_payment(
    data:         PaymentCreate,
    current_user: dict = Depends(require_permission("payments.manage")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # ── Validate sale exists and belongs to this business ────────────────────
    sale = db.query(Sale).filter(
        Sale.sales_id    == data.sale_id,
        Sale.business_id == business_id,
        Sale.is_deleted  == False
    ).first()

    if not sale:
        return error_response("Sale not found", status_code=404)

    # ── Get sale final amount from DB (generated column) ─────────────────────
    sale_row = db.execute(
        text("SELECT sales_final_amount FROM sales WHERE sales_id = CAST(:sid AS uuid)"),
        {"sid": str(data.sale_id)}
    ).fetchone()

    sale_final = float(sale_row.sales_final_amount) if sale_row and sale_row.sales_final_amount else 0

    # ── Get total already paid by reading cumulative_paid from active row ─────
    # WHY read cumulative_paid and not SUM all rows:
    # cumulative_paid on the active row already IS the running total.
    # No need to sum across all rows — one read is enough.
    # If no payments exist yet, cumulative_paid defaults to 0.
    active_row = db.execute(
        text("""
            SELECT COALESCE(cumulative_paid, 0) AS already_paid
            FROM payments
            WHERE sale_id     = CAST(:sid AS uuid)
              AND business_id  = CAST(:bid AS uuid)
              AND is_active    = true
        """),
        {"sid": str(data.sale_id), "bid": business_id}
    ).fetchone()

    already_paid  = float(active_row.already_paid) if active_row else 0.0
    new_payment   = float(data.payment_amount)
    total_after   = already_paid + new_payment

    # ── Block if already fully paid ───────────────────────────────────────────
    if already_paid >= sale_final:
        return error_response(
            "This sale is already fully paid. No further payments needed.",
            status_code=400
        )

    # ── Block overpayment ─────────────────────────────────────────────────────
    remaining_balance = round(sale_final - already_paid, 2)
    if new_payment > remaining_balance:
        return error_response(
            f"Payment of {new_payment} exceeds the remaining balance of "
            f"{remaining_balance}. Please enter {remaining_balance} or less.",
            status_code=400
        )

    # ── Calculate new payment status ──────────────────────────────────────────
    new_status = calculate_payment_status(total_after, sale_final)

    # ── Deactivate old row, insert new active row, sync sales table ───────────
    new_payment_id = record_payment_and_sync(
        db              = db,
        business_id     = business_id,
        sale_id         = str(data.sale_id),
        sale_final      = sale_final,
        payment_amount  = new_payment,
        payment_method  = data.payment_method or "cash",
        new_status      = new_status,
        cumulative_paid = round(total_after, 2)
    )

    db.commit()

    # ── Fetch the newly created row to return in response ─────────────────────
    payment = db.execute(
        text("""
            SELECT payment_id, business_id, sale_id,
                   payment_amount, cumulative_paid, payment_method,
                   payment_status, is_active, payment_paid_at
            FROM payments
            WHERE payment_id = CAST(:pid AS uuid)
        """),
        {"pid": new_payment_id}
    ).fetchone()

    new_remaining = round(sale_final - total_after, 2)

    return success_response({
        "message":            "Payment recorded successfully",
        "payment_status":     new_status,
        "this_payment":       round(new_payment, 2),
        "total_paid":         round(total_after, 2),
        "remaining_balance":  new_remaining if new_remaining > 0 else 0,
        "payment": {
            "payment_id":      str(payment.payment_id),
            "business_id":     str(payment.business_id),
            "sale_id":         str(payment.sale_id),
            "payment_amount":  float(payment.payment_amount),
            "cumulative_paid": float(payment.cumulative_paid) if payment.cumulative_paid is not None else None,
            "payment_method":  payment.payment_method,
            "payment_status":  payment.payment_status,
            "is_active":       payment.is_active,
            "payment_paid_at": str(payment.payment_paid_at) if payment.payment_paid_at else None
        }
    }, status_code=201)


# ══════════════════════════════════════════════════════════════════
# GET /payments → All payments for this business (paginated)
# ══════════════════════════════════════════════════════════════════
@router.get("/")
def get_all_payments(
    current_user: dict = Depends(require_permission("payments.manage")),
    db:           Session = Depends(get_db),
    pagination:   dict    = Depends(paginate)
):
    business_id = current_user["business_id"]

    total = db.query(func.count(Payment.payment_id)).filter(
        Payment.business_id == business_id
    ).scalar()

    payments = db.query(Payment).filter(
        Payment.business_id == business_id
    ).order_by(Payment.payment_paid_at.desc())\
     .offset(pagination["offset"]).limit(pagination["limit"]).all()

    return success_response(
        pagination_response(
            [payment_to_dict(p) for p in payments],
            total,
            pagination["page"],
            pagination["limit"]
        )
    )


# ══════════════════════════════════════════════════════════════════
# GET /payments/sale/{sale_id} → Full payment history for one sale
#
# Returns:
#   current_status  → from active row (source of truth)
#   sale_final      → total the customer owes
#   total_paid      → cumulative_paid from active row
#   remaining_balance → sale_final - total_paid
#   payment_history → all rows, latest first
#                     (active row is first, is_active=true)
# ══════════════════════════════════════════════════════════════════
@router.get("/sale/{sale_id}")
def get_payments_by_sale(
    sale_id:      str,
    current_user: dict = Depends(require_permission("payments.manage")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # Validate sale belongs to this business
    sale = db.query(Sale).filter(
        Sale.sales_id    == sale_id,
        Sale.business_id == business_id,
        Sale.is_deleted  == False
    ).first()

    if not sale:
        return error_response("Sale not found", status_code=404)

    # Fetch all payment rows, latest first
    payments = db.query(Payment).filter(
        Payment.sale_id     == sale_id,
        Payment.business_id == business_id
    ).order_by(Payment.payment_paid_at.desc()).all()

    # Get sale final amount
    sale_row = db.execute(
        text("SELECT sales_final_amount FROM sales WHERE sales_id = CAST(:sid AS uuid)"),
        {"sid": sale_id}
    ).fetchone()
    sale_final = float(sale_row.sales_final_amount) if sale_row and sale_row.sales_final_amount else 0

    # Read total_paid from cumulative_paid on the active row
    # (much faster than summing all rows)
    active_payment = next((p for p in payments if p.is_active), None)
    total_paid     = float(active_payment.cumulative_paid) if active_payment and active_payment.cumulative_paid else 0.0
    current_status = active_payment.payment_status if active_payment else "pending"

    return success_response({
        "sale_id":            sale_id,
        "sale_final_amount":  sale_final,
        "total_paid":         round(total_paid, 2),
        "remaining_balance":  round(sale_final - total_paid, 2),
        "current_status":     current_status,
        "payment_history":    [payment_to_dict(p) for p in payments]
        # Note: active row (is_active=true) is first in the list (latest by date)
    })


# ══════════════════════════════════════════════════════════════════
# GET /payments/{payment_id} → One specific payment row
# ══════════════════════════════════════════════════════════════════
@router.get("/{payment_id}")
def get_payment(
    payment_id:   str,
    current_user: dict = Depends(require_permission("payments.manage")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    payment = db.query(Payment).filter(
        Payment.payment_id  == payment_id,
        Payment.business_id == business_id
    ).first()

    if not payment:
        return error_response("Payment not found", status_code=404)

    return success_response(payment_to_dict(payment))