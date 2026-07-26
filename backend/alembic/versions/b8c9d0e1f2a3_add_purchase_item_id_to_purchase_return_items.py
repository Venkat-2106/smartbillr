"""add purchase_item_id fk to purchase_return_items for line-level tax proration

Revision ID: b8c9d0e1f2a3
Revises: 2cf4c2c7cf0b
Create Date: 2026-07-27 00:00:00.000000

purchase_return_items currently links to purchase_items only via
product_id (no FK), forcing reports.py to approximate purchase-return
GST proration at the whole-invoice level. This mirrors the sales side
fix: sales_return_items already has a real sale_item_id FK, resolved
and stored at creation time.

Adds purchase_item_id (nullable — legacy rows may not resolve cleanly
if a purchase ever had duplicate product_id lines) and backfills
existing rows deterministically (lowest item_id wins on ambiguous
matches). Column is additive only; no existing behavior is removed.
"""
from typing import Sequence, Union
from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "2cf4c2c7cf0b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE purchase_return_items
        ADD COLUMN purchase_item_id UUID REFERENCES purchase_items(item_id)
    """)

    # Deterministic backfill: for each existing return item, match it to
    # the purchase_item row for the same product on the same purchase.
    # DISTINCT ON + ORDER BY item_id handles the rare case of duplicate
    # product_id lines within one purchase by picking the lowest item_id.
    op.execute("""
        UPDATE purchase_return_items pri
        SET purchase_item_id = matched.item_id
        FROM (
            SELECT DISTINCT ON (pri2.return_item_id)
                   pri2.return_item_id, pi.item_id
            FROM purchase_return_items pri2
            JOIN purchase_returns pr ON pr.return_id = pri2.return_id
            JOIN purchase_items pi
              ON pi.pur_id = pr.pur_id
             AND pi.product_id = pri2.product_id
            ORDER BY pri2.return_item_id, pi.item_id
        ) matched
        WHERE pri.return_item_id = matched.return_item_id
          AND pri.purchase_item_id IS NULL
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE purchase_return_items DROP COLUMN IF EXISTS purchase_item_id")
