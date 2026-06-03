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
    # FIX: DB has updated_at on suppliers table (trg_suppliers_updated_at fires BEFORE UPDATE).
    # Model was missing this column — added so ORM can read it for sorting and serialization.
    # DB has NO updated_by column on suppliers (unlike customers/categories/products),
    # so last_updated_by tracking is not available for suppliers.
    updated_at        = Column(DateTime,    nullable=True, server_default=text("now()"))
