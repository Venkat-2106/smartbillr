from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Category(Base):
    __tablename__ = "categories"

    category_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FIX: DB has is_nullable=YES — was incorrectly nullable=False
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=True)
    category_name = Column(String(50), nullable=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, nullable=True, server_default=text("now()"))