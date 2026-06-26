"""merge heads: q1r2s3t4u5v6 (CHECK constraint) + t1u2v3w4x5y6 (timestamptz)

Revision ID: 36fc5d2ec293
Revises: q1r2s3t4u5v6, t1u2v3w4x5y6
Create Date: 2026-06-27 00:38:35.598925

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '36fc5d2ec293'
down_revision: Union[str, None] = ('q1r2s3t4u5v6', 't1u2v3w4x5y6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
