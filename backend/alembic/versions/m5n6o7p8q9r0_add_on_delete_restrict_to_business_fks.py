"""add ON DELETE RESTRICT to all business_id foreign keys

Revision ID: m5n6o7p8q9r0
Revises: x0y1z2a3b4c5
Create Date: 2026-07-17

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'm5n6o7p8q9r0'
down_revision: Union[str, None] = 'x0y1z2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# All child tables of businesses(business_id) — excludes the two billing
# tables (subscription_payments, subscription_invoices) which already have
# ON DELETE CASCADE, and the businesses table itself (self-referencing PK).
_TABLES = [
    "business_counters",
    "categories",
    "customers",
    "expenses",
    "low_stock_alerts",
    "payments",
    "products",
    "profiles",
    "purchase_return_items",
    "purchase_returns",
    "purchase_items",
    "purchases",
    "sale_items",
    "sales",
    "sales_returns",
    "stock_movements",
    "suppliers",
]


def _fk_name(table: str) -> str:
    return f"{table}_business_id_fkey"


def upgrade() -> None:
    for tbl in _TABLES:
        fk = _fk_name(tbl)
        op.execute(f"ALTER TABLE {tbl} DROP CONSTRAINT IF EXISTS {fk}")
        op.execute(
            f"ALTER TABLE {tbl} ADD CONSTRAINT {fk} "
            f"FOREIGN KEY (business_id) REFERENCES businesses(business_id) "
            f"ON DELETE RESTRICT"
        )


def downgrade() -> None:
    # Restore bare foreign keys (no ON DELETE clause = NO ACTION in Postgres).
    for tbl in _TABLES:
        fk = _fk_name(tbl)
        op.execute(f"ALTER TABLE {tbl} DROP CONSTRAINT IF EXISTS {fk}")
        op.execute(
            f"ALTER TABLE {tbl} ADD CONSTRAINT {fk} "
            f"FOREIGN KEY (business_id) REFERENCES businesses(business_id)"
        )
