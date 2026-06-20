"""add last_logout_at to profiles

Revision ID: 2f8b4e1a3c5d
Revises: da22e1256e21
Create Date: 2026-06-20 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '2f8b4e1a3c5d'
down_revision: str | None = 'da22e1256e21'
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        'profiles',
        sa.Column('last_logout_at', postgresql.TIMESTAMP(timezone=True), nullable=True)
    )
    op.create_index('ix_profiles_last_logout_at', 'profiles', ['last_logout_at'])


def downgrade() -> None:
    op.drop_index('ix_profiles_last_logout_at')
    op.drop_column('profiles', 'last_logout_at')
