"""add last_renewed_at to businesses, merge all heads

Revision ID: e7f8a9b0c1d2
Revises: 2cf4c2c7cf0b, a3b4c5d6e7f8, b2c3d4e5f6a7, b4c5d6e7f8a9, d9e0f1a2b3c4, e2f3a4b5c6d7, e5f6a7b8c9d0, n0o1p2q3r4s5
Create Date: 2026-07-30 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e7f8a9b0c1d2'
down_revision: Union[str, None] = (
    '2cf4c2c7cf0b',
    'a3b4c5d6e7f8',
    'b2c3d4e5f6a7',
    'b4c5d6e7f8a9',
    'd9e0f1a2b3c4',
    'e2f3a4b5c6d7',
    'e5f6a7b8c9d0',
    'n0o1p2q3r4s5',
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = {c["name"] for c in inspector.get_columns("businesses")}

    if "last_renewed_at" not in existing:
        op.add_column(
            'businesses',
            sa.Column('last_renewed_at', sa.DateTime(), nullable=True)
        )


def downgrade() -> None:
    op.execute("ALTER TABLE businesses DROP COLUMN IF EXISTS last_renewed_at")
