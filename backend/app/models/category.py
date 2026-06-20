from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Category(Base):
    __tablename__ = "categories"

    category_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=True)
    category_name = Column(String(50), nullable=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, nullable=True, server_default=text("now()"))
    # DB trigger trg_categories_updated_at fires on every UPDATE and sets this automatically.
    # We declare it here so SQLAlchemy can read the value after commit (via db.refresh()).
    updated_at = Column(DateTime, nullable=True, server_default=text("now()"))
    # DB trigger trg_categories_updated_by fires on every UPDATE and auto-sets
    # updated_by from the app.current_user_id session variable.
    # We declare it here so SQLAlchemy can read the value after commit (via db.refresh()).
    # FK constraint exists in the DB: REFERENCES profiles(id) ON DELETE SET NULL.
    updated_by = Column(UUID(as_uuid=True), nullable=True)
    # created_by: tracks who first created this category.
    # Set in the POST route. FK constraint in DB: REFERENCES profiles(id) ON DELETE SET NULL.
    created_by = Column(UUID(as_uuid=True), nullable=True)