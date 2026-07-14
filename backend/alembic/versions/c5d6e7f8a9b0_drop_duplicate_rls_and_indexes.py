"""drop duplicate tenant_isolation policies, duplicate indexes, and add missing subscription_invoices index

The tenant_isolation policy checks business_id against the PostgREST
request.jwt.claims GUC which is never set by our stack (FastAPI backend
+ supabase-js only for .auth).  The working tenant_access_policy uses
app.current_business_id() instead.  The dead policies are removed from
all 19 tables that still carry them (profiles was already cleaned up in
migration o3p4q5r6s7t8).

ix_profiles_business_id is an exact duplicate of idx_profiles_business_id
(both btree on business_id).  ix_sales_payment_status is an exact duplicate
of idx_sales_payment_status (both btree on business_id, sales_payment_status
WHERE is_deleted = false).

subscription_invoices has no index on business_id; every RLS-checked query
must scan the full table.  Add idx_subscription_invoices_biz to match the
existing idx_subscription_payments_biz on the sibling table.

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-07-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TENANT_ISOLATION_TABLES = [
    "businesses",
    "categories",
    "customers",
    "suppliers",
    "products",
    "sales",
    "sale_items",
    "payments",
    "purchases",
    "purchase_items",
    "expenses",
    "sales_returns",
    "sales_return_items",
    "purchase_returns",
    "purchase_return_items",
    "stock_movements",
    "low_stock_alerts",
    "audit_logs",
    "business_counters",
]


def upgrade() -> None:
    # 1. Drop dead tenant_isolation RLS policies (19 tables).
    for table in _TENANT_ISOLATION_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")

    # 2. Drop duplicate indexes — keep the idx_ variants that predate the ix_ ones.
    op.execute("DROP INDEX IF EXISTS ix_profiles_business_id")
    op.execute("DROP INDEX IF EXISTS ix_sales_payment_status")

    # 3. Add missing index on subscription_invoices.business_id for RLS lookups.
    op.create_index(
        "idx_subscription_invoices_biz",
        "subscription_invoices",
        ["business_id", sa.text("issued_at DESC")],
    )


def downgrade() -> None:
    # 3. Remove the subscription_invoices index.
    op.drop_index("idx_subscription_invoices_biz", table_name="subscription_invoices")

    # 2. Recreate the dropped duplicate indexes.
    op.create_index("ix_profiles_business_id", "profiles", ["business_id"])
    op.create_index(
        "ix_sales_payment_status",
        "sales",
        ["business_id", "sales_payment_status"],
        postgresql_where=sa.text("is_deleted = false"),
    )

    # 1. Recreate the tenant_isolation policies.
    _USING_TEMPLATE = (
        "business_id = ((current_setting('request.jwt.claims', true))"
        "::json ->> 'business_id')::uuid"
    )
    for table in _TENANT_ISOLATION_TABLES:
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"FOR ALL USING ({_USING_TEMPLATE})"
        )
