"""add purchase_delete to stock_movements move_type check

Revision ID: b4c5d6e7f8a9
Revises: a1b2c3d4e5f8
Create Date: 2026-07-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b4c5d6e7f8a9'
down_revision: Union[str, None] = 'a1b2c3d4e5f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_move_type_check")
    op.execute("""
        ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_move_type_check
        CHECK (move_type::text = ANY (ARRAY[
            'sale', 'purchase', 'adjustment', 'sales_return', 'sales_return_reversal',
            'purchase_return', 'purchase_return_reversal', 'damage', 'purchase_delete'
        ]::text[]))
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_move_type_check")
    op.execute("""
        ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_move_type_check
        CHECK (move_type::text = ANY (ARRAY[
            'sale', 'purchase', 'adjustment', 'sales_return', 'sales_return_reversal',
            'purchase_return', 'purchase_return_reversal', 'damage'
        ]::text[]))
    """)
