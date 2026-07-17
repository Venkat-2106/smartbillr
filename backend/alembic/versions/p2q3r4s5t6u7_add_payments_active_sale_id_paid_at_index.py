"""add index on payments (is_active, sale_id, payment_paid_at DESC) for DISTINCT ON in sales list

The DISTINCT ON subquery in the sales list endpoint needs to efficiently find
the latest active payment per sale:
    SELECT DISTINCT ON (pay.sale_id) ...
    FROM payments pay
    WHERE pay.is_active = true
    ORDER BY pay.sale_id, pay.payment_paid_at DESC

An index on (is_active, sale_id, payment_paid_at DESC) lets PostgreSQL do a
skip scan — jumping from one sale_id to the next, picking the first row
(highest payment_paid_at) per group, only for active payments.

Revision ID: p2q3r4s5t6u7
Revises: o1p2q3r4s5t6
Create Date: 2026-07-17

"""
from typing import Sequence, Union

from alembic import op


revision: str = "p2q3r4s5t6u7"
down_revision: Union[str, None] = "o1p2q3r4s5t6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Sales-list DISTINCT ON subquery filters WHERE is_active = true
    # and orders by sale_id, payment_paid_at DESC.  This index allows
    # an efficient skip-scan per sale_id instead of a full scan + sort.
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payments_active_sale_id_paid_at
        ON payments (is_active, sale_id, payment_paid_at DESC)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_payments_active_sale_id_paid_at")
