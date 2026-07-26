"""add sale_delete to stock_movements move_type check

Revision ID: f5a6b7c8d9e0
Revises: d2e3f4a5b6c8
Create Date: 2026-07-26 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, None] = 'd2e3f4a5b6c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_move_type_check")
    op.execute("""
        ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_move_type_check
        CHECK (move_type::text = ANY (ARRAY[
            'sale', 'purchase', 'adjustment', 'sales_return', 'sales_return_reversal',
            'purchase_return', 'purchase_return_reversal', 'damage', 'purchase_delete',
            'sale_delete'
        ]::text[]))
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_move_type_check")
    op.execute("""
        ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_move_type_check
        CHECK (move_type::text = ANY (ARRAY[
            'sale', 'purchase', 'adjustment', 'sales_return', 'sales_return_reversal',
            'purchase_return', 'purchase_return_reversal', 'damage', 'purchase_delete'
        ]::text[]))
    """)
