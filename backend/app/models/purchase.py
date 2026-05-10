from sqlalchemy import Column, String, Boolean, Numeric, Integer
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Purchase(Base):
    __tablename__ = "purchases"

    pur_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), nullable=True)
    supp_id = Column(UUID(as_uuid=True), nullable=True)
    pur_total_amount = Column(Numeric, nullable=False)
    pur_discount = Column(Numeric, default=0)
    pur_cgst_total = Column(Numeric, default=0)
    pur_sgst_total = Column(Numeric, default=0)
    pur_igst_total = Column(Numeric, default=0)
    pur_tax_total = Column(Numeric, default=0)
    # pur_final_amount → generated column, excluded
    pur_payment_status = Column(String, default="pending")
    is_deleted = Column(Boolean, default=False)
    pur_created_at = Column(String, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)

# PurchaseItem uses raw SQL only
# because purchase_items has multiple generated columns