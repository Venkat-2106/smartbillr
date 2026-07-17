"""add last_logout_at + singleton index to super_admins

Revision ID: f1e2d3c4b5a6
Revises: e3f4a5b6c7d8
Create Date: 2026-07-08 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1e2d3c4b5a6"
down_revision: Union[str, None] = "e3f4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = {c["name"] for c in inspector.get_columns("super_admins")}

    if "last_logout_at" not in existing:
        op.add_column(
            "super_admins",
            sa.Column("last_logout_at", sa.DateTime(), nullable=True),
        )
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_super_admins_singleton
        ON super_admins ((TRUE))
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_super_admins_singleton")
    op.drop_column("super_admins", "last_logout_at")
