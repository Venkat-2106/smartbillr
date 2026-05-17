from sqlalchemy import Column, String, Boolean, Text, Integer, Numeric, DateTime, ForeignKey
from sqlalchemy.orm import column_property
from sqlalchemy import Computed
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Product(Base):
    __tablename__ = "products"

    prod_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FIX: Added ForeignKey — DB has FK constraint to businesses.business_id
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=True)
    # FIX: Added ForeignKey — DB has FK constraint to categories.category_id
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.category_id"), nullable=True)
    prod_name = Column(String(100), nullable=False)
    prod_sell_price = Column(Numeric(10, 2), nullable=False)
    prod_cost_price = Column(Numeric(10, 2), nullable=False)
    # FIX: Added missing generated column — DB has GENERATED ALWAYS AS (prod_sell_price - prod_cost_price)
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
    prod_created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)