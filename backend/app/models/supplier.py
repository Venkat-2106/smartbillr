from sqlalchemy import Column, String, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid

class Supplier(Base):
    __tablename__ = "suppliers"

    supp_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), nullable=True)
    supp_name = Column(String(255), nullable=False)
    supp_phone = Column(String(20), nullable=True)
    supp_email = Column(String(255), nullable=True)
    supp_address = Column(Text, nullable=True)
    supp_country_code = Column(String(10), nullable=True)
    supp_tax_number = Column(String(100), nullable=True)
    is_deleted = Column(Boolean, default=False)
    supp_created_at = Column(String, nullable=True)