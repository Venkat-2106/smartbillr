import uuid
from datetime import datetime

from sqlalchemy import Column, String, Boolean, Numeric, Text, SmallInteger, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class Plan(Base):
    __tablename__ = "plans"

    plan_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_code = Column(String(30), nullable=False, unique=True)
    display_name = Column(String(50), nullable=False)
    billing_cycle = Column(String(20), nullable=False)
    price_inr = Column(Numeric(10, 2), nullable=True)
    price_usd = Column(Numeric(10, 2), nullable=True)
    razorpay_plan_id = Column(String(100), nullable=True)
    feature_limits = Column(JSONB, nullable=False, default=dict)
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(SmallInteger, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class SubscriptionPayment(Base):
    __tablename__ = "subscription_payments"

    payment_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id", ondelete="CASCADE"), nullable=False)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("plans.plan_id"), nullable=False)
    provider = Column(String(20), nullable=False)
    provider_order_id = Column(String(120), nullable=True)
    razorpay_subscription_id = Column(String(120), nullable=True)
    subscription_status = Column(String(20), nullable=True)
    provider_payment_id = Column(String(120), nullable=True)
    provider_signature = Column(Text, nullable=True)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False)
    status = Column(String(20), nullable=False, default="created")
    failure_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    updated_by_webhook_at = Column(DateTime(timezone=True), nullable=True)


class SubscriptionEvent(Base):
    __tablename__ = "subscription_events"

    event_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider = Column(String(20), nullable=False)
    provider_event_id = Column(String(150), nullable=False)
    event_type = Column(String(60), nullable=False)
    payload = Column(JSONB, nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class SubscriptionInvoice(Base):
    __tablename__ = "subscription_invoices"

    invoice_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id", ondelete="CASCADE"), nullable=False)
    payment_id = Column(UUID(as_uuid=True), ForeignKey("subscription_payments.payment_id"), nullable=False)
    invoice_number = Column(String(30), nullable=False, unique=True)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False)
    provider_invoice_url = Column(Text, nullable=True)
    issued_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
