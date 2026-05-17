from sqlalchemy import Column, String, Integer, Numeric, Text, ForeignKey, TIMESTAMP, Boolean
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class PurchaseReturn(Base):
    __tablename__ = "purchase_returns"

    return_id         = Column(UUID(as_uuid=True), primary_key=True)
    business_id       = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"))
    pur_id            = Column(UUID(as_uuid=True), ForeignKey("purchases.pur_id"))
    return_reason     = Column(Text, nullable=True)
    return_status     = Column(String, default="pending")
    restock           = Column(Boolean, default=True)
    stock_updated     = Column(Boolean, default=False)
    refund_method     = Column(String, nullable=True)
    approved_by       = Column(UUID(as_uuid=True), nullable=True)
    approved_at       = Column(TIMESTAMP, nullable=True)
    rejected_reason   = Column(Text, nullable=True)
    return_amount     = Column(Numeric(10, 2), default=0)
    return_created_at = Column(TIMESTAMP)
    created_by        = Column(UUID(as_uuid=True))


class PurchaseReturnItem(Base):
    __tablename__ = "purchase_return_items"

    return_item_id       = Column(UUID(as_uuid=True), primary_key=True)
    return_id            = Column(UUID(as_uuid=True), ForeignKey("purchase_returns.return_id"))
    product_id           = Column(UUID(as_uuid=True), ForeignKey("products.product_id"))
    return_qty           = Column(Integer, nullable=False)
    refund_amount        = Column(Numeric(10, 2), nullable=False)
    return_item_subtotal = Column(Numeric(10, 2), nullable=True)