"""add BEFORE INSERT trigger for updated_by on payments

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-07-23 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'c6d7e8f9a0b1'
down_revision: Union[str, None] = 'b5c6d7e8f9a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_payments_updated_by_insert ON payments")
    op.execute("""
        CREATE TRIGGER trg_payments_updated_by_insert
            BEFORE INSERT ON payments
            FOR EACH ROW
            EXECUTE FUNCTION fn_set_updated_by();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_payments_updated_by_insert ON payments")
