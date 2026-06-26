from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), primary_key=True)
    business_id = Column(UUID(as_uuid=True), nullable=False)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    role = Column(String, nullable=True)
    role_id = Column(UUID(as_uuid=True), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, nullable=True)
    last_logout_at = Column(DateTime, nullable=True)
    last_login_at = Column(DateTime, nullable=True)
