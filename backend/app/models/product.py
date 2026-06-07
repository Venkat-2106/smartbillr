# app/models/product.py
#
# BARCODE FIX (2026-06-06):
#   Added UniqueConstraint for (business_id, barcode) to the ORM model.
#   This mirrors the partial unique index created in the DB migration
#   (uix_products_barcode_business). The ORM constraint is used by Alembic
#   if you ever auto-generate migrations. It does NOT replace the DB index —
#   the DB index (WHERE barcode IS NOT NULL) is the authoritative constraint.
#
#   All other columns, relationships, and comments are unchanged.

from sqlalchemy import Column, String, Boolean, Text, Integer, Numeric, DateTime, ForeignKey, text, UniqueConstraint
from sqlalchemy.orm import column_property
from sqlalchemy import Computed
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Product(Base):
    __tablename__ = "products"

    # BARCODE FIX: UniqueConstraint mirrors the DB partial unique index
    # uix_products_barcode_business (business_id, barcode WHERE barcode IS NOT NULL).
    # SQLAlchemy's __table_args__ UniqueConstraint is the ORM declaration.
    # The WHERE clause (partial index) is not expressible here — it lives in
    # the raw SQL migration. This declaration is for ORM completeness only.
    __table_args__ = (
        UniqueConstraint('business_id', 'barcode', name='uix_products_barcode_business'),
    )

    prod_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.category_id"), nullable=True)
    prod_name = Column(String(100), nullable=False)
    prod_sell_price = Column(Numeric(10, 2), nullable=False)
    # MRP FEATURE: Maximum Retail Price — the printed/stickered price on the product.
    # NULL = not set (most existing products will be NULL; no migration needed for them).
    # Discount on invoices = (prod_mrp - sale_item_unit_price) per unit.
    # Stored separately from prod_sell_price so regular discounts vs MRP are distinct.
    prod_mrp        = Column(Numeric(10, 2), nullable=True)
    prod_cost_price = Column(Numeric(10, 2), nullable=False)
    prod_profit = Column(
        Numeric(10, 2),
        Computed("prod_sell_price - prod_cost_price", persisted=True),
        nullable=True
    )
    prod_stock_qty = Column(Integer, default=0)
    prod_low_stock_alert = Column(Integer, default=10)
    tax_rate = Column(Numeric(5, 2), default=0)
    tax_code = Column(Text, nullable=True)
    barcode = Column(Text, nullable=True)
    unit = Column(Text, default="pcs")
    is_deleted = Column(Boolean, default=False)

    # ── Audit timestamps ──────────────────────────────────────────────────────
    # prod_created_at: set explicitly in POST route. DB DEFAULT now() acts as
    # safety net for inserts that omit it.
    prod_created_at = Column(DateTime, nullable=True, server_default=text("now()"))

    # updated_at: auto-maintained by the DB trigger fn_set_updated_at
    # (BEFORE UPDATE on products). NEVER set this from Python.
    updated_at = Column(DateTime, nullable=True, server_default=text("now()"))

    # ── Audit user references ─────────────────────────────────────────────────
    # Plain UUIDs — no SQLAlchemy ForeignKey() because the profiles table lives
    # in Supabase's auth schema and has no ORM model here.
    # The FK constraints exist in the DB from the SQL migration.
    # Values are set directly in POST/PUT routes; names are resolved via raw
    # SQL JOINs on profiles in every read query.
    created_by = Column(UUID(as_uuid=True), nullable=True)
    updated_by = Column(UUID(as_uuid=True), nullable=True)