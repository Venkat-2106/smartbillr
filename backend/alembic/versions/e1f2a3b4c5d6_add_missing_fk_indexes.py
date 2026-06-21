"""add missing FK indexes

Revision ID: e1f2a3b4c5d6
Revises: d6e7f8a9b0c1
Create Date: 2026-06-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'd6e7f8a9b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("COMMIT")
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_customer "
        "ON sales (business_id, customer_id) "
        "WHERE is_deleted = false"
    )
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchases_supplier "
        "ON purchases (business_id, supp_id) "
        "WHERE is_deleted = false"
    )
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_sale "
        "ON payments (business_id, sale_id)"
    )
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_movements_product "
        "ON stock_movements (business_id, product_id, move_created_at DESC)"
    )
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_returns_sale "
        "ON sales_returns (business_id, sale_id)"
    )
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_returns_purchase "
        "ON purchase_returns (business_id, pur_id)"
    )
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_date "
        "ON expenses (business_id, expense_date) "
        "WHERE is_deleted = false"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_sales_customer")
    op.execute("DROP INDEX IF EXISTS idx_purchases_supplier")
    op.execute("DROP INDEX IF EXISTS idx_payments_sale")
    op.execute("DROP INDEX IF EXISTS idx_stock_movements_product")
    op.execute("DROP INDEX IF EXISTS idx_sales_returns_sale")
    op.execute("DROP INDEX IF EXISTS idx_purchase_returns_purchase")
    op.execute("DROP INDEX IF EXISTS idx_expenses_date")
