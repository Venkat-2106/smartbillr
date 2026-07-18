# app/models/rbac.py
#
# SQLAlchemy models for the RBAC system.
# These mirror the tables created in SECTION_1 SQL migration.
#
# WHY SEPARATE FILE:
#   Keeping RBAC models isolated makes it easy to update permissions
#   without touching business logic models (sale.py, product.py, etc.)

from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.database import Base


class Role(Base):
    """
    Stores role definitions.
    3 default roles: admin, manager, staff.
    Future: custom roles can be added as new rows — no code change needed.
    """
    __tablename__ = "roles"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    name        = Column(String, nullable=False, unique=True)   # 'admin', 'manager', 'staff'
    description = Column(Text)
    created_at  = Column(DateTime, server_default=func.now())


class Permission(Base):
    """
    Stores individual permission codes.
    Format: 'feature.action' e.g. 'sales.create', 'reports.financial'.
    Adding a new feature = insert new permissions rows. No code change needed.
    """
    __tablename__ = "permissions"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    code        = Column(String, nullable=False, unique=True)   # 'sales.create'
    description = Column(Text)
    created_at  = Column(DateTime, server_default=func.now())


class RolePermission(Base):
    """
    Join table linking roles to permissions.
    A role can have many permissions. One permission can belong to many roles.
    This is how the RBAC matrix is stored in DB.
    """
    __tablename__ = "role_permissions"

    role_id       = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    permission_id = Column(Integer, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True)