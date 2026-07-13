from sqlalchemy import Column, String, Numeric, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class SalesReturn(Base):
    __tablename__ = "sales_returns"

    return_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FIX: Added ForeignKey — DB has FK constraint to businesses.business_id
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=True)
    # FIX: Added ForeignKey — DB has FK constraint to sales.sales_id
    sale_id = Column(UUID(as_uuid=True), ForeignKey("sales.sales_id"), nullable=True)
    return_amount = Column(Numeric(10, 2), nullable=False)
    return_reason = Column(Text, nullable=True)
    return_status = Column(String(10), default="pending")
    restock = Column(Boolean, default=False)
    # FIX: DB type is timestamp without time zone — was incorrectly String
    return_created_at = Column(DateTime, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)

    # FIX: Added all missing columns that exist in DB
    # The trigger fn_sales_return_stock reads and writes stock_updated — critical for correct behavior
    stock_updated = Column(Boolean, default=False)
    refund_method = Column(String(20), nullable=True)
    approved_by = Column(UUID(as_uuid=True), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    rejected_reason = Column(Text, nullable=True)