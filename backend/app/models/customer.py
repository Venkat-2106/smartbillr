from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid
from datetime import datetime

class Customer(Base):
    __tablename__ = "customers"

    cust_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), nullable=False)
    cust_name = Column(String, nullable=False)
    cust_phone = Column(String, nullable=True)
    cust_email = Column(String, nullable=True)
    cust_tax_number = Column(String, nullable=True)
    cust_address = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False)
    cust_created_at = Column(DateTime, default=datetime.utcnow)