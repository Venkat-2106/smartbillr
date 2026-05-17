from sqlalchemy import Column, String, Integer, Text, Computed, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class StockMovement(Base):
    __tablename__ = "stock_movements"

    move_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FIX: Added ForeignKey — DB has FK constraint to businesses.business_id
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=True)
    # FIX: Added ForeignKey — DB has FK constraint to products.prod_id
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.prod_id"), nullable=True)
    move_type = Column(String(20), nullable=False)
    move_qty = Column(Integer, nullable=False)
    move_prev_stock = Column(Integer, nullable=False)

    # GENERATED ALWAYS AS in PostgreSQL — never insert this manually
    move_new_stock = Column(
        Integer,
        Computed("move_prev_stock + move_qty", persisted=True),
        nullable=True
    )

    sale_reference_id = Column(UUID(as_uuid=True), nullable=True)
    purchase_reference_id = Column(UUID(as_uuid=True), nullable=True)
    # FIX: Added missing columns — fn_sales_return_stock trigger inserts these
    reference_type = Column(Text, nullable=True)
    reference_id = Column(UUID(as_uuid=True), nullable=True)
    move_notes = Column(Text, nullable=True)
    # FIX: DB type is timestamp without time zone — was incorrectly String
    move_created_at = Column(DateTime, nullable=True)
    move_created_by = Column(UUID(as_uuid=True), nullable=True)


class LowStockAlert(Base):
    __tablename__ = "low_stock_alerts"

    alert_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FIX: Added ForeignKey — DB has FK constraint to businesses.business_id
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=True)
    # FIX: Added ForeignKey — DB has FK constraint to products.prod_id
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.prod_id"), nullable=True)
    alert_stock_qty = Column(Integer, nullable=False)
    alert_threshold = Column(Integer, nullable=False)
    alert_status = Column(String(10), default="unread")
    # FIX: DB type is timestamp without time zone — was incorrectly String
    alert_created_at = Column(DateTime, nullable=True)