from sqlalchemy import Column, String, Boolean, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class StockMovement(Base):
    __tablename__ = "stock_movements"

    move_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), nullable=True)
    product_id = Column(UUID(as_uuid=True), nullable=True)
    move_type = Column(String, nullable=False)
    move_qty = Column(Integer, nullable=False)
    move_prev_stock = Column(Integer, nullable=False)
    move_new_stock = Column(Integer, nullable=True)
    sale_reference_id = Column(UUID(as_uuid=True), nullable=True)
    purchase_reference_id = Column(UUID(as_uuid=True), nullable=True)
    move_notes = Column(Text, nullable=True)
    move_created_at = Column(String, nullable=True)
    move_created_by = Column(UUID(as_uuid=True), nullable=True)


class LowStockAlert(Base):
    __tablename__ = "low_stock_alerts"

    alert_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), nullable=True)
    product_id = Column(UUID(as_uuid=True), nullable=True)
    alert_stock_qty = Column(Integer, nullable=False)
    alert_threshold = Column(Integer, nullable=False)
    alert_status = Column(String, default="unread")
    alert_created_at = Column(String, nullable=True)