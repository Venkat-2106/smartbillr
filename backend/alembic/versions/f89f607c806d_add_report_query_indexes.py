"""add report query indexes

Revision ID: f89f607c806d
Revises: 2f8b4e1a3c5d
Create Date: 2026-06-20 20:17:03.474483

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f89f607c806d'
down_revision: Union[str, None] = '2f8b4e1a3c5d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("COMMIT")
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_biz_created "
        "ON sales (business_id, sales_created_at)"
    )
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_movements_biz_created "
        "ON stock_movements (business_id, move_created_at)"
    )
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sale_items_sale_biz "
        "ON sale_items (sale_id, business_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_sale_items_sale_biz")
    op.execute("DROP INDEX IF EXISTS idx_stock_movements_biz_created")
    op.execute("DROP INDEX IF EXISTS idx_sales_biz_created")
