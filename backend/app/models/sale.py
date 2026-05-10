from sqlalchemy import Column, String, Boolean, Text, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Sale(Base):
    __tablename__ = "sales"

    sales_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), nullable=True)
    customer_id = Column(UUID(as_uuid=True), nullable=True)
    invoice_no = Column(Text, nullable=True)
    sales_total_amount = Column(Numeric, nullable=False)
    sales_discount = Column(Numeric, default=0)
    cgst_total = Column(Numeric, default=0)
    sgst_total = Column(Numeric, default=0)
    igst_total = Column(Numeric, default=0)
    tax_total = Column(Numeric, default=0)
    # sales_final_amount → generated column, excluded
    sales_payment_method = Column(String, nullable=True)
    sales_payment_status = Column(String, default="pending")
    is_deleted = Column(Boolean, default=False)
    sales_created_at = Column(String, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)

# SaleItem uses raw SQL only — no ORM model needed
# because sale_items has multiple generated columns