"""drop unused business_settings table

Revision ID: z0y1x2w3v4u5
Revises: s5t6u7v8w9x0
Create Date: 2026-06-25 15:45:00.000000

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "z0y1x2w3v4u5"
down_revision: Union[str, None] = "s5t6u7v8w9x0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("business_settings")


def downgrade() -> None:
    op.create_table(
        "business_settings",
        op.Column("id", sa.Integer(), primary_key=True),
        op.Column("business_id", sa.String(), nullable=False),
    )
