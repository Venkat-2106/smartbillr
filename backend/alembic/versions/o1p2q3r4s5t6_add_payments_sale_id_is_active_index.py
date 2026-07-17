"""add index on payments (sale_id, is_active) for LATERAL join in sales list

Revision ID: o1p2q3r4s5t6
Revises: n1o2p3q4r5s6
Create Date: 2026-07-17

"""
from typing import Sequence, Union

from alembic import op


revision: str = "o1p2q3r4s5t6"
down_revision: Union[str, None] = "n1o2p3q4r5s6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Sales-list LATERAL join filters WHERE sale_id = s.sales_id AND is_active = true
    # with no business_id in the inner WHERE — existing business_id-leading indexes
    # are useless here.  sale_id-leading index matches the filter exactly.
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payments_sale_id_active
        ON payments (sale_id, is_active)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_payments_sale_id_active")
