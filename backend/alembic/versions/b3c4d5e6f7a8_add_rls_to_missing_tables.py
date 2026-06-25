"""add RLS to tables that were missed in a2b3c4d5e6f7

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-06-20 22:10:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TENANT_TABLES = [
    "audit_logs",
    "purchase_items",
    "sales_return_items",
]

_SAFE_BIZ_ID = "app.current_business_id()"


def upgrade() -> None:
    for table in _TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY tenant_access_policy ON {table}
            FOR ALL
            USING (business_id = {_SAFE_BIZ_ID})
            """
        )


def downgrade() -> None:
    for table in reversed(_TENANT_TABLES):
        op.execute(f"DROP POLICY IF EXISTS tenant_access_policy ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
