from sqlalchemy import Column, String, Boolean, Text, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid

class Product(Base):
    __tablename__ = "products"

    prod_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), nullable=True)
    category_id = Column(UUID(as_uuid=True), nullable=True)
    prod_name = Column(String(255), nullable=False)
    prod_sell_price = Column(Numeric, nullable=False)
    prod_cost_price = Column(Numeric, nullable=False)
    prod_profit = Column(Numeric, nullable=True)
    prod_stock_qty = Column(Integer, default=0)
    prod_low_stock_alert = Column(Integer, default=10)
    tax_rate = Column(Numeric, default=0)
    tax_code = Column(Text, nullable=True)
    barcode = Column(Text, nullable=True)
    unit = Column(Text, default="pcs")
    is_deleted = Column(Boolean, default=False)
    prod_created_at = Column(String, nullable=True)
    updated_at = Column(String, nullable=True)