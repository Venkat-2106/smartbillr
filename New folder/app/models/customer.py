from sqlalchemy import Column, String, Boolean, Text, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Customer(Base):
    __tablename__ = "customers"

    cust_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FIX: Added ForeignKey — DB has FK constraint to businesses.business_id
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=False)
    cust_name = Column(String(100), nullable=False)
    cust_phone = Column(String(15), nullable=True)
    cust_email = Column(String(100), nullable=True)
    cust_address = Column(Text, nullable=True)
    cust_state = Column(String(100), nullable=True)
    cust_country_code = Column(String(5), nullable=True)
    cust_tax_number = Column(String(50), nullable=True)
    is_deleted = Column(Boolean, default=False)
    # FIX: DB type is timestamp without time zone — was incorrectly String
    cust_created_at = Column(DateTime, nullable=True, server_default=text("now()"))
    # DB trigger trg_customers_updated_at fires on every UPDATE and sets this automatically.
    # We declare it here so SQLAlchemy can read the value after commit (via db.refresh()).
    updated_at = Column(DateTime, nullable=True, server_default=text("now()"))
    # updated_by: plain UUID — no ForeignKey() declared here (same pattern as Category).
    # The FK constraint exists in DB: REFERENCES profiles(id) ON DELETE SET NULL.
    # We set this in PUT route and JOIN via raw SQL to get the name.
    updated_by = Column(UUID(as_uuid=True), nullable=True)