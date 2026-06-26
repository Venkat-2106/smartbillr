"""add CHECK constraint ensuring expense_amount > 0

Revision ID: q1r2s3t4u5v6
Revises: f2g3h4i5j6k7
Create Date: 2026-06-26 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'q1r2s3t4u5v6'
down_revision: Union[str, None] = 'f2g3h4i5j6k7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE expenses
        ADD CONSTRAINT chk_expense_amount_positive
        CHECK (expense_amount > 0)
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expense_amount_positive")
