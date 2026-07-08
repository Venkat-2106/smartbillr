"""enforce at most one row in super_admins via partial unique index

Revision ID: f1e2d3c4b5a6
Revises: e3f4a5b6c7d8
Create Date: 2026-07-08 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "f1e2d3c4b5a6"
down_revision: Union[str, None] = "e3f4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_super_admins_singleton
        ON super_admins ((TRUE))
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_super_admins_singleton")
