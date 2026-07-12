"""restore dropped composite indexes

Revision ID: f9a0b1c2d3e4
Revises: c8d9e0f1a2b3
Create Date: 2026-07-12 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f9a0b1c2d3e4'
down_revision: Union[str, None] = 'c8d9e0f1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.execute("COMMIT")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_updated
        ON customers (business_id, updated_at DESC)
        WHERE is_deleted = false
    """)
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_updated
        ON products (business_id, updated_at DESC)
        WHERE is_deleted = false
    """)
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_returns_sale
        ON sales_returns (business_id, sale_id)
    """)
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_movements_product
        ON stock_movements (business_id, product_id, move_created_at DESC)
    """)
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_movements_biz_created
        ON stock_movements (business_id, move_created_at)
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_customers_updated")
    op.execute("DROP INDEX IF EXISTS idx_products_updated")
    op.execute("DROP INDEX IF EXISTS idx_sales_returns_sale")
    op.execute("DROP INDEX IF EXISTS idx_stock_movements_product")
    op.execute("DROP INDEX IF EXISTS idx_stock_movements_biz_created")
