"""fix audit_logs created_at column to use timestamptz

Revision ID: t1u2v3w4x5y6
Revises: r1s2t3u4v5w6
Create Date: 2026-06-26 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 't1u2v3w4x5y6'
down_revision: Union[str, None] = 'r1s2t3u4v5w6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE audit_logs
        ALTER COLUMN created_at TYPE timestamp with time zone
        USING created_at AT TIME ZONE 'UTC'
    """)
    op.execute("""
        ALTER TABLE audit_logs
        ALTER COLUMN created_at SET DEFAULT now()
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE audit_logs
        ALTER COLUMN created_at TYPE timestamp without time zone
        USING created_at AT TIME ZONE 'UTC'
    """)
