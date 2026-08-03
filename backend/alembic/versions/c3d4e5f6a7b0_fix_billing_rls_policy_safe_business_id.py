"""fix unsafe RLS policies on billing tables to use safe app.current_business_id()

FIX (2026-08-03): the tenant_access_policy on subscription_payments and
subscription_invoices used the raw form

    current_setting('app.current_business_id')::uuid

which raises an error whenever the GUC is unset (a cross-tenant context like
the HMAC-only razorpay webhook). Every other tenant-scoped table uses the
safe STABLE helper app.current_business_id(), which NULLIFs the empty string
and returns NULL instead of erroring. Drop and recreate the policies with the
safe helper so the webhook and any other cross-tenant path read/write all
rows consistently (matching a2b3c4d5e6f7).

Revision ID: c3d4e5f6a7b0
Revises: 334ec520516b
Create Date: 2026-08-03

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b0"
down_revision: Union[str, None] = "334ec520516b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SAFE_BIZ_ID = "app.current_business_id()"
_RAW_BIZ_ID = "current_setting('app.current_business_id')::uuid"

_TABLES = ["subscription_payments", "subscription_invoices"]


def _apply_policy(business_id_expr: str) -> None:
    for table in _TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_access_policy ON {table}")
        op.execute(
            f"""
            CREATE POLICY tenant_access_policy ON {table}
            FOR ALL
            USING (business_id = {business_id_expr})
            """
        )


def upgrade() -> None:
    _apply_policy(_SAFE_BIZ_ID)


def downgrade() -> None:
    _apply_policy(_RAW_BIZ_ID)
