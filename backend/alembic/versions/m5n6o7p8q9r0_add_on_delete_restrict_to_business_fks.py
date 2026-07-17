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
# Most tables use the default {table}_business_id_fkey naming, but profiles
# was created with an explicit custom name fk_profiles_business_id in
# migration d1e2f3a4b5c6.
_TABLES: dict[str, str] = {
    "business_counters":      "business_counters_business_id_fkey",
    "categories":             "categories_business_id_fkey",
    "customers":              "customers_business_id_fkey",
    "expenses":               "expenses_business_id_fkey",
    "low_stock_alerts":       "low_stock_alerts_business_id_fkey",
    "payments":               "payments_business_id_fkey",
    "products":               "products_business_id_fkey",
    "profiles":               "fk_profiles_business_id",
    "purchase_return_items":  "purchase_return_items_business_id_fkey",
    "purchase_returns":       "purchase_returns_business_id_fkey",
    "purchase_items":         "purchase_items_business_id_fkey",
    "purchases":              "purchases_business_id_fkey",
    "sale_items":             "sale_items_business_id_fkey",
    "sales":                  "sales_business_id_fkey",
    "sales_returns":          "sales_returns_business_id_fkey",
    "stock_movements":        "stock_movements_business_id_fkey",
    "suppliers":              "suppliers_business_id_fkey",
}


def upgrade() -> None:
    for tbl, fk in _TABLES.items():
        op.execute(f"ALTER TABLE {tbl} DROP CONSTRAINT IF EXISTS {fk}")
        op.execute(
            f"ALTER TABLE {tbl} ADD CONSTRAINT {fk} "
            f"FOREIGN KEY (business_id) REFERENCES businesses(business_id) "
            f"ON DELETE RESTRICT"
        )


def downgrade() -> None:
    # Restore bare foreign keys (no ON DELETE clause = NO ACTION in Postgres).
    for tbl, fk in _TABLES.items():
        op.execute(f"ALTER TABLE {tbl} DROP CONSTRAINT IF EXISTS {fk}")
        op.execute(
            f"ALTER TABLE {tbl} ADD CONSTRAINT {fk} "
            f"FOREIGN KEY (business_id) REFERENCES businesses(business_id)"
        )
