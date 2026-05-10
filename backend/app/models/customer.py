from sqlalchemy import Column, String, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid

class Customer(Base):
    __tablename__ = "customers"

    cust_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), nullable=True)
    cust_name = Column(String(100), nullable=False)
    cust_phone = Column(String(15), nullable=True)
    cust_email = Column(String(100), nullable=True)
    cust_address = Column(Text, nullable=True)
    cust_state = Column(String(100), nullable=True)    # ← ADD THIS
    cust_country_code = Column(String(5), nullable=True)
    cust_tax_number = Column(String(50), nullable=True)
    is_deleted = Column(Boolean, default=False)
    cust_created_at = Column(String, nullable=True)