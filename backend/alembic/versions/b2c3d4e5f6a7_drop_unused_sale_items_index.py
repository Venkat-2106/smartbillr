"""drop unused sale_items index

Revision ID: b2c3d4e5f6a7
Revises: 8d3b637f35c9
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = '8d3b637f35c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop idx_sale_items_business_sale (business_id, sale_id).

    Confirmed via pg_stat_user_indexes: 0 scans, while the reverse-order
    index idx_sale_items_sale_biz (sale_id, business_id) on the same two
    columns had 90 scans. Postgres treats column order as interchangeable
    for equality lookups on both columns, so the busy index already covers
    every query the unused one did.
    """
    op.execute("DROP INDEX IF EXISTS idx_sale_items_business_sale")


def downgrade() -> None:
    """Recreate the dropped index with its original definition."""
    op.execute("""
        CREATE INDEX idx_sale_items_business_sale ON public.sale_items
        USING btree (business_id, sale_id)
    """)
