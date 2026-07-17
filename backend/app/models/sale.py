# app/models/sale.py

import uuid

from sqlalchemy import Column, String, Boolean, Numeric, ForeignKey, TIMESTAMP, text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Sale(Base):
    __tablename__ = "sales"

    sales_id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id          = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=False)
    customer_id          = Column(UUID(as_uuid=True), ForeignKey("customers.cust_id"), nullable=True)
    invoice_no           = Column(String,       nullable=True)
    sales_total_amount   = Column(Numeric(10,2), nullable=True)
    sales_discount       = Column(Numeric(10,2), default=0)
    cgst_total           = Column(Numeric(10,2), nullable=True)
    sgst_total           = Column(Numeric(10,2), nullable=True)
    igst_total           = Column(Numeric(10,2), nullable=True)
    tax_total            = Column(Numeric(10,2), nullable=True)
    sales_final_amount   = Column(Numeric(10,2), nullable=True)  # DB GENERATED — never insert
    sales_payment_method = Column(String,       nullable=True)
    sales_payment_status = Column(String,       default="unpaid")
    created_by           = Column(UUID(as_uuid=True), nullable=True)
    # FIX: Added updated_by column + trg_sales_updated_by trigger (migration c8d9e0f1a2b3).
    # Auto-populated by fn_set_updated_by() on every UPDATE via the BEFORE UPDATE trigger.
    updated_by           = Column(UUID(as_uuid=True), nullable=True)
    is_deleted           = Column(Boolean,      default=False)
    sales_created_at     = Column(TIMESTAMP,    nullable=True, server_default=text("now()"))
    updated_at           = Column(TIMESTAMP,    nullable=True)