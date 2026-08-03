"""fix_last_renewed_at_timezone_mismatch

Revision ID: f4e4a5b0809e
Revises: c3d4e5f6a7b0
Create Date: 2026-08-04 00:35:04.179719

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4e4a5b0809e'
down_revision: Union[str, None] = 'c3d4e5f6a7b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # FIX (2026-08-04): businesses.last_renewed_at was added as plain
    # TIMESTAMP (naive) in e7f8a9b0c1d2, but activation.py writes the same
    # timezone-aware datetime.now(timezone.utc) that subscription_end_at
    # (a timestamptz) receives. asyncpg raises DataError when encoding an
    # aware datetime into a naive column, so the whole activation UPDATE
    # failed and the webhook returned 500. The stored naive values are
    # already UTC wall-clock time, so re-interpret them as UTC.
    op.execute("""
        ALTER TABLE businesses
        ALTER COLUMN last_renewed_at TYPE TIMESTAMP WITH TIME ZONE
        USING last_renewed_at AT TIME ZONE 'UTC'
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("""
        ALTER TABLE businesses
        ALTER COLUMN last_renewed_at TYPE TIMESTAMP WITHOUT TIME ZONE
        USING last_renewed_at AT TIME ZONE 'UTC'
    """)
