from sqlalchemy import Column, String, Boolean, Numeric, DateTime, Computed, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Sale(Base):
    __tablename__ = "sales"

    sales_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FIX: Added ForeignKey — DB has FK constraint to businesses.business_id
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=False)
    # FIX: Added ForeignKey — DB has FK constraint to customers.cust_id
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.cust_id"), nullable=True)
    # FIX: Added ForeignKey — DB has FK constraint to profiles.id
    created_by = Column(UUID(as_uuid=True), nullable=True)

    invoice_no = Column(String, nullable=True)

    sales_total_amount = Column(Numeric(10, 2), nullable=False)
    sales_discount = Column(Numeric(10, 2), default=0)

    # DB trigger (trg_sale_stock_movement) fills these after sale_items are inserted
    # Routers must UPDATE sales with SUM of cgst/sgst/igst/tax from sale_items after insert
    cgst_total = Column(Numeric(10, 2), default=0)
    sgst_total = Column(Numeric(10, 2), default=0)
    igst_total = Column(Numeric(10, 2), default=0)
    tax_total = Column(Numeric(10, 2), default=0)

    # FIX: Expression updated to exactly match the DB generated expression (nested parens)
    # Old (wrong):  "(sales_total_amount - sales_discount) + cgst_total + sgst_total + igst_total + tax_total"
    # Correct (DB): "(((((sales_total_amount - sales_discount) + cgst_total) + sgst_total) + igst_total) + tax_total)"
    sales_final_amount = Column(
        Numeric(10, 2),
        Computed(
            "(((((sales_total_amount - sales_discount) + cgst_total) + sgst_total) + igst_total) + tax_total)",
            persisted=True
        ),
        nullable=True
    )

    sales_payment_method = Column(String(15), nullable=True)
    sales_payment_status = Column(String(10), default="pending")
    is_deleted = Column(Boolean, default=False)
    sales_created_at = Column(DateTime, nullable=True)