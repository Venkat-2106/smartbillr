"""relax expense_amount check to allow negative purchase_refund

Revision ID: a8b9c0d1e2f3
Revises: c6d7e8f9a0b2
Create Date: 2026-07-25 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a8b9c0d1e2f3'
down_revision: Union[str, None] = 'c6d7e8f9a0b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE expenses
        DROP CONSTRAINT IF EXISTS chk_expense_amount_positive
    """)
    op.execute("""
        ALTER TABLE expenses
        ADD CONSTRAINT chk_expense_amount_positive
        CHECK (
            (expense_category = 'purchase_refund' AND expense_amount < 0)
            OR
            (expense_category != 'purchase_refund' AND expense_amount > 0)
        )
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE expenses
        DROP CONSTRAINT IF EXISTS chk_expense_amount_positive
    """)
    op.execute("""
        ALTER TABLE expenses
        ADD CONSTRAINT chk_expense_amount_positive
        CHECK (expense_amount > 0)
    """)
