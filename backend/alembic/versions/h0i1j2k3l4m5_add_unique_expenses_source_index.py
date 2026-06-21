"""add unique partial index on expenses (business_id, source_type, source_id)

Revision ID: h0i1j2k3l4m5
Revises: e1f2a3b4c5d6
Create Date: 2026-06-21 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h0i1j2k3l4m5'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEX_NAME = "uix_expenses_source"


def upgrade() -> None:
    # Soft-delete duplicate expenses (keep the oldest one per source).
    # This is defensive: the race condition in the old code may have created
    # duplicates.  Without this cleanup CREATE UNIQUE INDEX CONCURRENTLY would
    # fail.
    op.execute(f"""
        WITH dups AS (
            SELECT expense_id,
                   ROW_NUMBER() OVER (
                       PARTITION BY business_id, source_type, source_id
                       ORDER BY expense_created_at ASC
                   ) AS rn
            FROM expenses
            WHERE source_type IS NOT NULL AND is_deleted = false
        )
        UPDATE expenses SET is_deleted = true
        WHERE expense_id IN (SELECT expense_id FROM dups WHERE rn > 1)
    """)

    op.execute("COMMIT")
    op.execute(f"""
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS {INDEX_NAME}
        ON expenses (business_id, source_type, source_id)
        WHERE is_deleted = false AND source_type IS NOT NULL
    """)


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {INDEX_NAME}")
