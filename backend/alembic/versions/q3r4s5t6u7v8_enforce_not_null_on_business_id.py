"""enforce NOT NULL on business_id across all tenant tables

Revision ID: q3r4s5t6u7v8
Revises: p2q3r4s5t6u7
Create Date: 2026-07-17

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


revision: str = "q3r4s5t6u7v8"
down_revision: Union[str, None] = "p2q3r4s5t6u7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLES = [
    "categories",
    "customers",
    "expenses",
    "payments",
    "products",
    "purchases",
    "purchase_returns",
    "purchase_return_items",
    "sales",
    "sales_returns",
    "stock_movements",
    "low_stock_alerts",
    "suppliers",
]


def upgrade() -> None:
    connection = op.get_bind()

    # ── Step 1: Check for NULL business_id in every table ────────────────
    null_tables = []
    for table in TABLES:
        row = connection.execute(
            text(f"SELECT COUNT(*) AS cnt FROM {table} WHERE business_id IS NULL")
        ).fetchone()
        if row and row[0] > 0:
            null_tables.append(f"  {table}: {row[0]} NULL row(s)")

    if null_tables:
        msg = (
            "Cannot set NOT NULL on business_id — the following tables have "
            "existing NULL values:\n" + "\n".join(null_tables) + "\n"
            "Resolve these before re-running this migration."
        )
        raise Exception(msg)

    # ── Step 2: ALTER each table ─────────────────────────────────────────
    for table in TABLES:
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN business_id SET NOT NULL"
        )


def downgrade() -> None:
    for table in TABLES:
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN business_id DROP NOT NULL"
        )
