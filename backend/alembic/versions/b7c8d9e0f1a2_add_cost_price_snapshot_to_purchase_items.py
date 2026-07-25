"""add prod_cost_price_before_purchase snapshot column to purchase_items

Revision ID: b7c8d9e0f1a2
Revises: a8b9c0d1e2f3
Create Date: 2026-07-25 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = 'a8b9c0d1e2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'purchase_items',
        sa.Column('prod_cost_price_before_purchase', sa.Numeric(10, 2), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('purchase_items', 'prod_cost_price_before_purchase')
