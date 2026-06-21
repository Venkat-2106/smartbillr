"""add composite indexes on (business_id, updated_at) for list page filters

Revision ID: n0o1p2q3r4s5
Revises: h0i1j2k3l4m5
Create Date: 2026-06-21 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'n0o1p2q3r4s5'
down_revision: Union[str, None] = 'h0i1j2k3l4m5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEXES = [
    ("idx_customers_updated", "customers"),
    ("idx_products_updated",  "products"),
    ("idx_suppliers_updated", "suppliers"),
]


def upgrade() -> None:
    op.execute("COMMIT")
    for name, table in INDEXES:
        op.execute(f"""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS {name}
            ON {table}(business_id, updated_at DESC)
            WHERE is_deleted = false
        """)


def downgrade() -> None:
    for name, _ in INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {name}")
