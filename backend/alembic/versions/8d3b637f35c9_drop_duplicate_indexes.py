"""drop duplicate indexes

Revision ID: 8d3b637f35c9
Revises: 7218cf287fa2
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8d3b637f35c9'
down_revision: Union[str, None] = '7218cf287fa2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop indexes that are exact duplicates of another index on the same
    table (identical columns, order, and WHERE clause). Keeping only one
    per pair removes redundant write overhead with zero query-plan impact,
    since the surviving index covers every query the dropped one did.
    """
    op.execute("DROP INDEX IF EXISTS idx_customers_updated")
    op.execute("DROP INDEX IF EXISTS idx_products_updated")
    op.execute("DROP INDEX IF EXISTS idx_purchase_returns_pur")
    op.execute("DROP INDEX IF EXISTS idx_sales_returns_sale")
    op.execute("DROP INDEX IF EXISTS idx_stock_movements_product")
    op.execute("DROP INDEX IF EXISTS idx_stock_movements_biz_created")


def downgrade() -> None:
    """Recreate the dropped indexes with their original definitions."""
    op.execute("""
        CREATE INDEX idx_customers_updated ON public.customers
        USING btree (business_id, updated_at DESC) WHERE (is_deleted = false)
    """)
    op.execute("""
        CREATE INDEX idx_products_updated ON public.products
        USING btree (business_id, updated_at DESC) WHERE (is_deleted = false)
    """)
    op.execute("""
        CREATE INDEX idx_purchase_returns_pur ON public.purchase_returns
        USING btree (pur_id)
    """)
    op.execute("""
        CREATE INDEX idx_sales_returns_sale ON public.sales_returns
        USING btree (sale_id)
    """)
    op.execute("""
        CREATE INDEX idx_stock_movements_product ON public.stock_movements
        USING btree (product_id)
    """)
    op.execute("""
        CREATE INDEX idx_stock_movements_biz_created ON public.stock_movements
        USING btree (business_id, move_created_at DESC)
    """)
