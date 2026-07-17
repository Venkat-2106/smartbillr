"""schema hardening: unique invoice index, stock_movements check, payments index

Revision ID: a3b4c5d6e7f8
Revises: x0y1z2a3b4c5
Create Date: 2026-07-17

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, None] = 'm5n6o7p8q9r0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Unique index on (business_id, invoice_no) for sales — safety net
    #    (invoice number generation is already serialized via FOR UPDATE on
    #    business_counters, but this prevents duplicates from any edge case).
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uix_sales_invoice_business
        ON sales (business_id, invoice_no)
        WHERE is_deleted = false
    """)

    # 2. CHECK constraint on stock_movements.move_qty — prevent zero-quantity
    #    movements from being inserted (they are meaningless).
    op.execute("""
        ALTER TABLE stock_movements
        ADD CONSTRAINT ck_stock_movements_move_qty_nonzero
        CHECK (move_qty <> 0)
    """)

    # 3. Composite index on payments (business_id, sale_id, is_active) — covers
    #    the common active-payment lookup pattern without touching the existing
    #    narrower idx_payments_sale (business_id, sale_id) index, which may be
    #    used by other queries that don't filter on is_active.
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payments_sale_active
        ON payments (business_id, sale_id, is_active)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uix_sales_invoice_business")
    op.execute("ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS ck_stock_movements_move_qty_nonzero")
    op.execute("DROP INDEX IF EXISTS idx_payments_sale_active")
