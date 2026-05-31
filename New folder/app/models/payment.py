# app/models/payment.py

from sqlalchemy import Column, String, Boolean, Numeric, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Payment(Base):
    __tablename__ = "payments"

    payment_id      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id     = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=True)
    sale_id         = Column(UUID(as_uuid=True), ForeignKey("sales.sales_id"), nullable=True)
    payment_amount  = Column(Numeric(10, 2), nullable=False)
    payment_method  = Column(String(15), nullable=True)

    # ── PAYMENT TRACKING COLUMNS ──────────────────────────────────────────────
    #
    # payment_status:
    #   "pending" → no money received yet for this sale
    #   "partial" → some money received but not the full amount
    #   "paid"    → full amount received
    #   This column on each row records the status AT THE TIME of this payment.
    #
    # is_active:
    #   true  → this is the LATEST payment row for this sale (only ONE per sale)
    #   false → this is a historical/older payment row (kept for audit trail)
    #
    # cumulative_paid:  ← NEW COLUMN (must be added to DB — see DB fix below)
    #   The running total of all payments received for this sale UP TO AND
    #   INCLUDING this row's payment_amount.
    #
    #   WHY cumulative_paid:
    #   Without it, to know "how much has been paid so far" you must SUM all rows.
    #   With it, you read the active row (is_active=true) once and get the answer.
    #
    #   EXAMPLE:
    #     Row 1: payment_amount=400, cumulative_paid=400,  is_active=false
    #     Row 2: payment_amount=300, cumulative_paid=700,  is_active=false
    #     Row 3: payment_amount=300, cumulative_paid=1000, is_active=true  ← read this
    #
    # ─────────────────────────────────────────────────────────────────────────
    payment_status  = Column(String(10), nullable=False, server_default="pending")
    is_active       = Column(Boolean, nullable=False, server_default=text("true"))
    cumulative_paid = Column(Numeric(10, 2), nullable=True, default=0)  # ← NEW

    payment_paid_at = Column(DateTime, nullable=True, server_default=text("now()"))