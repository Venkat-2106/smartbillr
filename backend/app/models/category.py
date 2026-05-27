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
    # updated_by: plain UUID — no ForeignKey() here because SQLAlchemy cannot resolve
    # 'profiles' (it lives in Supabase auth schema, no ORM model for it).
    # The FK constraint already exists in the DB from the SQL migration.
    # We set this value directly in the PUT route and JOIN via raw SQL to get the name.
    updated_by = Column(UUID(as_uuid=True), nullable=True)
