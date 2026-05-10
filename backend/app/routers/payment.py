from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.auth import verify_token
from app.models.payment import Payment
from app.models.sale import Sale
from app.schemas.payment import PaymentCreate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
import uuid

router = APIRouter(prefix="/payments", tags=["Payments"])


# ─────────────────────────────────────────
# HELPER: Format payment as dict
# ─────────────────────────────────────────
def payment_to_dict(p):
    return {
        "payment_id": str(p.payment_id),
        "business_id": str(p.business_id),
        "sale_id": str(p.sale_id),
        "payment_amount": float(p.payment_amount),
        "payment_method": p.payment_method,
        "payment_paid_at": str(p.payment_paid_at) if p.payment_paid_at else None
    }


# ─────────────────────────────────────────
# POST /payments → Record a payment
# ─────────────────────────────────────────
@router.post("/")
def create_payment(
    data: PaymentCreate,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # Step 1 → Validate sale exists and belongs to this business
    sale = db.query(Sale).filter(
        Sale.sales_id == data.sale_id,
        Sale.business_id == business_id,
        Sale.is_deleted == False
    ).first()

    if not sale:
        return error_response("Sale not found", status_code=404)

    # Step 2 → Get total payments already made for this sale
    total_paid = db.execute(
        text("""
            SELECT COALESCE(SUM(payment_amount), 0) as total
            FROM payments
            WHERE sale_id = :sale_id
        """),
        {"sale_id": str(data.sale_id)}
    ).fetchone().total

    # Step 3 → Get sale final amount
    sale_row = db.execute(
        text("""
            SELECT sales_final_amount
            FROM sales
            WHERE sales_id = :sid
        """),
        {"sid": str(data.sale_id)}
    ).fetchone()

    sale_final = float(sale_row.sales_final_amount) if sale_row.sales_final_amount else 0
    already_paid = float(total_paid)
    new_payment = float(data.payment_amount)
    total_after = already_paid + new_payment

    # Step 4 → Block overpayment
    if total_after > sale_final:
        return error_response(
            f"Payment of {new_payment} exceeds remaining balance of {round(sale_final - already_paid, 2)}",
            status_code=400
        )

    # Step 5 → Insert payment via raw SQL
    new_payment_id = str(uuid.uuid4())
    db.execute(
        text("""
            INSERT INTO payments (
                payment_id, business_id, sale_id,
                payment_amount, payment_method
            ) VALUES (
                CAST(:payment_id AS uuid),
                CAST(:business_id AS uuid),
                CAST(:sale_id AS uuid),
                :payment_amount,
                :payment_method
            )
        """),
        {
            "payment_id": new_payment_id,
            "business_id": business_id,
            "sale_id": str(data.sale_id),
            "payment_amount": new_payment,
            "payment_method": data.payment_method
        }
    )

    # Step 6 → Auto update sale payment status
    if total_after >= sale_final:
        new_status = "paid"
    elif total_after > 0:
        new_status = "partial"
    else:
        new_status = "pending"

    db.execute(
        text("""
            UPDATE sales
            SET sales_payment_status = :status
            WHERE sales_id = :sid
        """),
        {"status": new_status, "sid": str(data.sale_id)}
    )

    db.commit()

    # Step 7 → Fetch saved payment
    payment = db.execute(
        text("""
            SELECT payment_id, business_id, sale_id,
                   payment_amount, payment_method, payment_paid_at
            FROM payments
            WHERE payment_id = CAST(:pid AS uuid)
        """),
        {"pid": new_payment_id}
    ).fetchone()

    return success_response({
        "message": "Payment recorded successfully",
        "payment_status": new_status,
        "total_paid": total_after,
        "remaining_balance": round(sale_final - total_after, 2),
        "payment": {
            "payment_id": str(payment.payment_id),
            "business_id": str(payment.business_id),
            "sale_id": str(payment.sale_id),
            "payment_amount": float(payment.payment_amount),
            "payment_method": payment.payment_method,
            "payment_paid_at": str(payment.payment_paid_at) if payment.payment_paid_at else None
        }
    }, status_code=201)


# ─────────────────────────────────────────
# GET /payments → Get all payments
# ─────────────────────────────────────────
@router.get("/")
def get_all_payments(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate)
):
    business_id = current_user["business_id"]

    total = db.query(func.count(Payment.payment_id)).filter(
        Payment.business_id == business_id
    ).scalar()

    payments = db.query(Payment).filter(
        Payment.business_id == business_id
    ).offset(pagination["offset"]).limit(pagination["limit"]).all()

    return success_response(
        pagination_response(
            [payment_to_dict(p) for p in payments],
            total,
            pagination["page"],
            pagination["limit"]
        )
    )


# ─────────────────────────────────────────
# GET /payments/{payment_id} → Get one payment
# ─────────────────────────────────────────
@router.get("/{payment_id}")
def get_payment(
    payment_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    payment = db.query(Payment).filter(
        Payment.payment_id == payment_id,
        Payment.business_id == business_id
    ).first()

    if not payment:
        return error_response("Payment not found", status_code=404)

    return success_response(payment_to_dict(payment))


# ─────────────────────────────────────────
# GET /payments/sale/{sale_id} → All payments for a sale
# ─────────────────────────────────────────
@router.get("/sale/{sale_id}")
def get_payments_by_sale(
    sale_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # Validate sale belongs to this business
    sale = db.query(Sale).filter(
        Sale.sales_id == sale_id,
        Sale.business_id == business_id,
        Sale.is_deleted == False
    ).first()

    if not sale:
        return error_response("Sale not found", status_code=404)

    payments = db.query(Payment).filter(
        Payment.sale_id == sale_id,
        Payment.business_id == business_id
    ).all()

    sale_row = db.execute(
        text("SELECT sales_final_amount FROM sales WHERE sales_id = :sid"),
        {"sid": sale_id}
    ).fetchone()

    total_paid = db.execute(
        text("SELECT COALESCE(SUM(payment_amount), 0) as total FROM payments WHERE sale_id = :sid"),
        {"sid": sale_id}
    ).fetchone().total

    sale_final = float(sale_row.sales_final_amount) if sale_row.sales_final_amount else 0

    return success_response({
        "sale_id": sale_id,
        "sale_final_amount": sale_final,
        "total_paid": float(total_paid),
        "remaining_balance": round(sale_final - float(total_paid), 2),
        "payments": [payment_to_dict(p) for p in payments]
    })