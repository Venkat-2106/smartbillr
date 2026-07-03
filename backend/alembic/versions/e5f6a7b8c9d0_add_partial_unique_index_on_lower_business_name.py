"""add partial unique index on LOWER(business_name)

Adds a DB-level unique constraint to close the TOCTOU race in
business registration.  The app-level pre-check (SELECT before
INSERT) is kept for a fast, friendly error; this index catches
concurrent registrations that slip past the pre-check.

The index is partial (WHERE is_deleted = false OR is_deleted IS NULL)
so that soft-deleted businesses do not permanently block name reuse.

Revision ID: e5f6a7b8c9d0
Revises: 9a3ad406def5
Create Date: 2026-07-03 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = '9a3ad406def5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_name_unique
        ON businesses (LOWER(business_name))
        WHERE is_deleted = false OR is_deleted IS NULL
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_businesses_name_unique")
