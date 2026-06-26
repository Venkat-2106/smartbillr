"""add last_login_at to profiles for session tracking

Revision ID: d7dabc514088
Revises: 36fc5d2ec293
Create Date: 2026-06-27 00:45:32.875108

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7dabc514088'
down_revision: Union[str, None] = '36fc5d2ec293'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("profiles", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("profiles", "last_login_at")
