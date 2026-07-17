"""add source_type and source_id columns to expenses

Revision ID: a1b2c3d4e5f6
Revises: f89f607c806d
Create Date: 2026-06-20 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f89f607c806d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = {c["name"] for c in inspector.get_columns("expenses")}

    if "source_type" not in existing:
        op.add_column(
            "expenses",
            sa.Column("source_type", sa.String(50), nullable=True)
        )
    if "source_id" not in existing:
        op.add_column(
            "expenses",
            sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True)
        )


def downgrade() -> None:
    op.drop_column("expenses", "source_id")
    op.drop_column("expenses", "source_type")
