from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base


class SuperAdmin(Base):
    __tablename__ = "super_admins"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(255), nullable=False, unique=True)
    created_at = Column(DateTime, nullable=True)
