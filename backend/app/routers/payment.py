# app/routers/payment.py

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.middleware.rbac import require_permission
from app.models.payment import Payment
from app.models.sale import Sale
from app.schemas.payment import PaymentCreate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from app.utils.payment_helpers import record_payment_and_sync, calculate_payment_status
from datetime import datetime
from app.utils.timestamp import fmt_ts

router = APIRouter(prefix="/v1/payments", tags=["Payments"])


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


# ── Sort column whitelist (prevents SQL injection) ──────────────────────────
SORTABLE = {
    "payment_paid_at": "p.payment_paid_at",
    "payment_amount":  "p.payment_amount",
    "cumulative_paid": "p.cumulative_paid",
    "payment_status":  "p.payment_status",
    "invoice_no":      "s.invoice_no",
    "customer_name":   "c.cust_name",
}


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
        "payment_paid_at": fmt_ts(p.payment_paid_at)
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

    # ── Lock the sale row to serialize concurrent payments ────────────────────
    # The payments FOR UPDATE below only locks existing payment rows. For a
    # sale with zero payments (first payment), there's nothing to lock, so two
    # concurrent requests both see already_paid=0 and double-charge the customer.
    # Locking the sale row guarantees that only one payment request proceeds at
    # a time, regardless of whether a payments row exists yet.
    db.execute(
        text("SELECT 1 FROM sales WHERE sales_id = CAST(:sid AS uuid) FOR UPDATE"),
        {"sid": str(data.sale_id)}
    )

    # ── Get total already paid by reading cumulative_paid from active row ─────
    # FOR UPDATE on payments locks the active payment row (if one exists) so a
    # concurrent request cannot read the same cumulative_paid and double-record.
    # Lock is released when db.commit() is called at the end of this route.
    active_row = db.execute(
        text("""
            SELECT COALESCE(cumulative_paid, 0) AS already_paid
            FROM payments
            WHERE sale_id     = CAST(:sid AS uuid)
              AND business_id  = CAST(:bid AS uuid)
              AND is_active    = true
            FOR UPDATE
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

    new_remaining = round(sale_final - total_after, 2)

    return success_response({
        "message":            "Payment recorded successfully",
        "payment_status":     new_status,
        "this_payment":       round(new_payment, 2),
        "total_paid":         round(total_after, 2),
        "remaining_balance":  new_remaining if new_remaining > 0 else 0,
        "payment": {
            "payment_id":      new_payment_id,
            "business_id":     business_id,
            "sale_id":         str(data.sale_id),
            "payment_amount":  new_payment,
            "cumulative_paid": round(total_after, 2),
            "payment_method":  data.payment_method or "cash",
            "payment_status":  new_status,
            "is_active":       True,
            "payment_paid_at": fmt_ts(datetime.utcnow())
        }
    }, status_code=201)


# ══════════════════════════════════════════════════════════════════
# GET /payments → All active payments for this business (paginated)
#
# WHY is_active=True:
#   Each sale can have multiple payment rows (one per installment).
#   Only the active row (is_active=true) represents the CURRENT state.
#   Historical rows are accessible via GET /payments/sale/{id}.
#
# ENHANCED (Step 5.16):
#   Added search (invoice_no / customer_name), status filter,
#   sort whitelist, date filter on payment_paid_at, and JOINs with
#   sales + customers to return invoice_no, customer_name,
#   sales_final_amount, and remaining_balance in each row.
# ══════════════════════════════════════════════════════════════════
@router.get("/")
def get_all_payments(
    current_user: dict = Depends(require_permission("payments.manage")),
    db:           Session = Depends(get_db),
    pagination:   dict = Depends(paginate),
    search:       str  = Query(default=None),
    status:       str  = Query(default=None),
    sort_by:      str  = Query(default="payment_paid_at"),
    sort_dir:     str  = Query(default="desc"),
    date_from:    str  = Query(default=None),
    date_to:      str  = Query(default=None),
):
    business_id = current_user["business_id"]

    order_col = SORTABLE.get(sort_by, "p.payment_paid_at")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    # Build WHERE clauses dynamically
    where_clauses = [
        "p.business_id = CAST(:bid AS uuid)",
        "p.is_active   = true",
    ]
    params = {"bid": business_id}

    if search and search.strip():
        where_clauses.append(
            "(s.invoice_no ILIKE :search OR c.cust_name ILIKE :search)"
        )
        params["search"] = f"%{search.strip()}%"

    if status and status.strip():
        where_clauses.append("p.payment_status = :status")
        params["status"] = status.strip()

    if date_from:
        where_clauses.append("p.payment_paid_at >= CAST(:date_from AS timestamptz)")
        params["date_from"] = date_from

    if date_to:
        where_clauses.append("p.payment_paid_at <= CAST(:date_to AS timestamptz)")
        params["date_to"] = date_to

    where_sql = " AND ".join(where_clauses)

    base_sql = f"""
        FROM payments p
        JOIN sales     s ON s.sales_id     = p.sale_id AND s.is_deleted = false
        LEFT JOIN customers c ON c.cust_id = s.customer_id
        WHERE {where_sql}
    """

    # DATA (with total count via window function)
    rows = db.execute(
        text(f"""
            SELECT
                p.payment_id,
                p.business_id,
                p.sale_id,
                p.payment_amount,
                p.cumulative_paid,
                p.payment_method,
                p.payment_status,
                p.is_active,
                p.payment_paid_at,
                s.invoice_no,
                s.sales_final_amount,
                COALESCE(c.cust_name, 'Walk-in') AS customer_name,
                COUNT(*) OVER() AS total_count
            {base_sql}
            ORDER BY {order_col} {order_dir}
            LIMIT :limit OFFSET :offset
        """),
        {**params, "limit": pagination["limit"], "offset": pagination["offset"]}
    ).fetchall()

    total = rows[0].total_count if rows else 0

    items = []
    for r in rows:
        sale_final   = float(r.sales_final_amount) if r.sales_final_amount else 0.0
        cumul        = float(r.cumulative_paid)    if r.cumulative_paid    else 0.0
        remaining    = round(sale_final - cumul, 2)
        items.append({
            "payment_id":         str(r.payment_id),
            "sale_id":            str(r.sale_id),
            "payment_amount":     float(r.payment_amount),
            "cumulative_paid":    cumul,
            "payment_method":     r.payment_method,
            "payment_status":     r.payment_status,
            "is_active":          r.is_active,
            "payment_paid_at":    fmt_ts(r.payment_paid_at),
            "invoice_no":         r.invoice_no         or "—",
            "customer_name":      r.customer_name      or "Walk-in",
            "sales_final_amount": sale_final,
            "remaining_balance":  remaining if remaining > 0 else 0.0,
        })

    return success_response(
        pagination_response(items, total, pagination["page"], pagination["limit"], capped=pagination["_capped"])
    )


# ── GET /payments/summary → KPI cards for payments page ──────────────
@router.get("/summary")
def get_payment_summary_kpi(
    current_user: dict = Depends(require_permission("payments.manage")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    can_financial = "dashboard.financial" in perms

    row = db.execute(text("""
        SELECT
            (SELECT COALESCE(SUM(cumulative_paid), 0) FROM payments
              WHERE business_id = CAST(:bid AS uuid) AND is_active = true)          AS total_collected,
            (SELECT COUNT(*) FROM sales
              WHERE business_id = CAST(:bid AS uuid) AND is_deleted = false
                AND sales_payment_status IN ('pending','partial'))                  AS pending_count
    """), {"bid": bid}).fetchone()

    return success_response({
        "total_collected": float(row.total_collected) if can_financial else None,
        "pending_count":   int(row.pending_count),
    })


# ══════════════════════════════════════════════════════════════════
# GET /payments/sale/{sale_id} → Full payment history for one sale
# (Declared BEFORE /{payment_id} to avoid FastAPI routing conflict)
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

    # Fetch all payment rows + customer_name via JOIN, latest first
    rows = db.execute(
        text("""
            SELECT
                p.payment_id, p.business_id, p.sale_id,
                p.payment_amount, p.cumulative_paid, p.payment_method,
                p.payment_status, p.is_active, p.payment_paid_at,
                s.invoice_no,
                s.sales_final_amount,
                COALESCE(c.cust_name, 'Walk-in') AS customer_name
            FROM payments p
            JOIN sales s ON s.sales_id = p.sale_id
            LEFT JOIN customers c ON c.cust_id = s.customer_id
            WHERE p.sale_id     = CAST(:sid AS uuid)
              AND p.business_id = CAST(:bid AS uuid)
            ORDER BY p.payment_paid_at DESC
        """),
        {"sid": sale_id, "bid": business_id}
    ).fetchall()

    sale_final = float(rows[0].sales_final_amount) if rows and rows[0].sales_final_amount else 0.0

    # Active row is first (latest by date)
    active_row     = next((r for r in rows if r.is_active), None)
    total_paid     = float(active_row.cumulative_paid) if active_row and active_row.cumulative_paid else 0.0
    current_status = active_row.payment_status if active_row else "pending"
    invoice_no     = rows[0].invoice_no    if rows else "—"
    customer_name  = rows[0].customer_name if rows else "Walk-in"

    history = []
    for r in rows:
        history.append({
            "payment_id":      str(r.payment_id),
            "payment_amount":  float(r.payment_amount),
            "cumulative_paid": float(r.cumulative_paid) if r.cumulative_paid else 0.0,
            "payment_method":  r.payment_method,
            "payment_status":  r.payment_status,
            "is_active":       r.is_active,
            "payment_paid_at": fmt_ts(r.payment_paid_at),
        })

    return success_response({
        "sale_id":            sale_id,
        "invoice_no":         invoice_no,
        "customer_name":      customer_name,
        "sale_final_amount":  sale_final,
        "total_paid":         round(total_paid, 2),
        "remaining_balance":  round(sale_final - total_paid, 2),
        "current_status":     current_status,
        "payment_history":    history,
    })


# ══════════════════════════════════════════════════════════════════
# GET /payments/{payment_id} → One specific payment row
# (Must be declared AFTER /sale/{sale_id})
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