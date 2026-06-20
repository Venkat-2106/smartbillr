"""enable row-level security on all tenant-scoped tables

Revision ID: a2b3c4d5e6f7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-20 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# All 16 tenant-scoped tables that have a business_id column.
_TENANT_TABLES = [
    "businesses",
    "customers",
    "suppliers",
    "products",
    "categories",
    "stock_movements",
    "low_stock_alerts",
    "purchases",
    "purchase_returns",
    "purchase_return_items",
    "sales",
    "sale_items",
    "sales_returns",
    "payments",
    "expenses",
    "business_counters",
]

_SAFE_BIZ_ID = "app.current_business_id()"


def upgrade() -> None:
    # 0. Ensure the app schema exists (for function + GUC namespace).
    op.execute("CREATE SCHEMA IF NOT EXISTS app")

    # 1. Create a stable helper that returns NULL when the GUC is unset.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION app.current_business_id()
        RETURNS uuid
        LANGUAGE SQL
        STABLE
        AS $$ SELECT NULLIF(current_setting('app.current_business_id', true), '')::uuid; $$
        """
    )

    # 2. Enable RLS + force it + create policy on every tenant table.
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

    op.execute("DROP FUNCTION IF EXISTS app.current_business_id()")
