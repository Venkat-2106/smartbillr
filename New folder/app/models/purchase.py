# app/models/purchase.py

from sqlalchemy import Column, String, Boolean, Numeric, DateTime, ForeignKey  # ← FIXED
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Purchase(Base):
    __tablename__ = "purchases"

    pur_id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id        = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=True)  # ← FIXED
    supp_id            = Column(UUID(as_uuid=True), ForeignKey("suppliers.supp_id"), nullable=True)       # ← FIXED
    pur_total_amount   = Column(Numeric(10, 2), nullable=False)
    pur_discount       = Column(Numeric(10, 2), default=0)
    pur_cgst_total     = Column(Numeric(10, 2), default=0)
    pur_sgst_total     = Column(Numeric(10, 2), default=0)
    pur_igst_total     = Column(Numeric(10, 2), default=0)
    pur_tax_total      = Column(Numeric(10, 2), default=0)
    # pur_final_amount → GENERATED ALWAYS AS in PostgreSQL — never insert manually
    pur_payment_status = Column(String(10), default="pending")
    is_deleted         = Column(Boolean, default=False)
    pur_created_at     = Column(DateTime, nullable=True)   # ← FIXED (DateTime now imported)
    updated_at         = Column(DateTime, nullable=True)   # ← FIXED (same)
    created_by         = Column(UUID(as_uuid=True), nullable=True)

# PurchaseItem uses raw SQL only
# because purchase_items has multiple generated columns