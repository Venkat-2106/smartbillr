# app/models/supplier.py

from sqlalchemy import Column, String, Boolean, Text, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Supplier(Base):
    __tablename__ = "suppliers"

    supp_id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id       = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=True)
    supp_name         = Column(String(100), nullable=False)
    supp_phone        = Column(String(15),  nullable=True)
    supp_email        = Column(String(100), nullable=True)
    supp_address      = Column(Text,        nullable=True)
    supp_state        = Column(String(100), nullable=True)   # needed for GST interstate detection
    supp_country_code = Column(String(5),   nullable=True)
    supp_tax_number   = Column(String(50),  nullable=True)
    is_deleted        = Column(Boolean,     default=False)
    supp_created_at   = Column(DateTime,    nullable=True, server_default=text("now()"))
    # DB trigger trg_suppliers_updated_at fires on every UPDATE and sets this automatically.
    # We declare it here so SQLAlchemy can read the value after commit (via db.refresh()).
    updated_at        = Column(DateTime,    nullable=True, server_default=text("now()"))
    # DB trigger trg_suppliers_updated_by fires on every UPDATE and auto-sets
    # updated_by from the app.current_user_id session variable.
    # FK constraint exists in DB: REFERENCES profiles(id) ON DELETE SET NULL.
    updated_by        = Column(UUID(as_uuid=True), nullable=True)