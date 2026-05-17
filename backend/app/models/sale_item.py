from sqlalchemy import Column, Integer, Numeric, Computed, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class SaleItem(Base):
    __tablename__ = "sale_items"

    sale_item_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FIX: Added ForeignKey — DB has FK constraint to businesses.business_id
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=False)
    # FIX: Added ForeignKey — DB has FK constraint to sales.sales_id
    sale_id = Column(UUID(as_uuid=True), ForeignKey("sales.sales_id"), nullable=False)
    # FIX: Added ForeignKey — DB has FK constraint to products.prod_id
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.prod_id"), nullable=False)

    # Only these two are inserted by the API — DB calculates everything else
    sale_item_quantity = Column(Integer, nullable=False)
    sale_item_unit_price = Column(Numeric(10, 2), nullable=False)

    # DB trigger (trg_sale_stock_movement) fills these after insert
    gst_rate = Column(Numeric(5, 2), default=0)
    cgst_amount = Column(Numeric(10, 2), default=0)
    sgst_amount = Column(Numeric(10, 2), default=0)
    igst_amount = Column(Numeric(10, 2), default=0)
    tax_amount = Column(Numeric(10, 2), default=0)

    # GENERATED ALWAYS AS columns — PostgreSQL computes these; never insert manually
    sale_item_subtotal = Column(
        Numeric(10, 2),
        Computed("(sale_item_quantity)::numeric * sale_item_unit_price", persisted=True),
        nullable=True
    )
    item_tax_total = Column(
        Numeric(10, 2),
        Computed(
            "(((COALESCE(cgst_amount, (0)::numeric) + COALESCE(sgst_amount, (0)::numeric)) + COALESCE(igst_amount, (0)::numeric)) + COALESCE(tax_amount, (0)::numeric))",
            persisted=True
        ),
        nullable=True
    )
    item_total_with_tax = Column(
        Numeric(10, 2),
        Computed(
            "((((((sale_item_quantity)::numeric * sale_item_unit_price) + COALESCE(cgst_amount, (0)::numeric)) + COALESCE(sgst_amount, (0)::numeric)) + COALESCE(igst_amount, (0)::numeric)) + COALESCE(tax_amount, (0)::numeric))",
            persisted=True
        ),
        nullable=True
    )