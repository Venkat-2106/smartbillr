"""add audit trigger to purchase_returns for parity with sales_returns

Revision ID: c1d2e3f4a5b7
Revises: b7c8d9e0f1a2
Create Date: 2026-07-26 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b7'
down_revision: Union[str, None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TRIGGER trg_audit_purchase_returns
        AFTER INSERT OR UPDATE OR DELETE ON purchase_returns
        FOR EACH ROW EXECUTE FUNCTION fn_audit_log()
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_purchase_returns ON purchase_returns")
