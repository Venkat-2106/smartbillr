"""merge heads: trigger fix + sale_delete

Revision ID: 2cf4c2c7cf0b
Revises: c2d3e4f5a6b7, f5a6b7c8d9e0
Create Date: 2026-07-27 01:23:33.228913

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2cf4c2c7cf0b'
down_revision: Union[str, None] = ('c2d3e4f5a6b7', 'f5a6b7c8d9e0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
