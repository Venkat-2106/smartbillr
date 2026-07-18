# app/models/purchase_return.py

import uuid

from sqlalchemy import Column, String, Integer, Numeric, Text, ForeignKey, TIMESTAMP, Boolean, Computed
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import text
from app.database import Base


class PurchaseReturn(Base):
    __tablename__ = "purchase_returns"

    return_id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id       = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=False)
    pur_id            = Column(UUID(as_uuid=True), ForeignKey("purchases.pur_id"),        nullable=True)
    return_reason     = Column(Text,        nullable=True)
    return_status     = Column(String,      default="pending")
    restock           = Column(Boolean,     default=True)
    stock_updated     = Column(Boolean,     default=False)
    refund_method     = Column(String,      nullable=True)
    approved_by       = Column(UUID(as_uuid=True), nullable=True)
    approved_at       = Column(TIMESTAMP,   nullable=True)
    rejected_reason   = Column(Text,        nullable=True)
    return_amount     = Column(Numeric(10,2), default=0)
    return_created_at = Column(TIMESTAMP,   nullable=True, server_default=text("now()"))
    created_by        = Column(UUID(as_uuid=True), nullable=True)
    updated_by        = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    updated_at        = Column(TIMESTAMP,   nullable=True)


class PurchaseReturnItem(Base):
    __tablename__ = "purchase_return_items"

    return_item_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id    = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=False)
    return_id      = Column(UUID(as_uuid=True), ForeignKey("purchase_returns.return_id"), nullable=True)
    product_id     = Column(UUID(as_uuid=True), ForeignKey("products.prod_id"),           nullable=True)
    return_qty     = Column(Integer,      nullable=False)
    refund_amount  = Column(Numeric(10,2), nullable=False)

    # DB GENERATED ALWAYS AS (return_qty * refund_amount) — never insert manually
    return_item_subtotal = Column(
        Numeric(10,2),
        Computed("(return_qty)::numeric * refund_amount", persisted=True),
        nullable=True
    )