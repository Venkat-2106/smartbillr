"""create purchase_payments table

Revision ID: b5c6d7e8f9a1
Revises: a4b5c6d7e8f9
Create Date: 2026-07-25 14:00:00.000000

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "b5c6d7e8f9a1"
down_revision: Union[str, None] = "a4b5c6d7e8f9"


def upgrade() -> None:
    # Create purchase_payments mirroring the payments table structure exactly,
    # but with pur_id (FK to purchases) instead of sale_id (FK to sales).
    op.execute("""
        CREATE TABLE IF NOT EXISTS purchase_payments (
            payment_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            business_id      UUID NOT NULL REFERENCES businesses(business_id),
            pur_id           UUID NOT NULL REFERENCES purchases(pur_id),
            payment_amount   NUMERIC NOT NULL,
            payment_method   VARCHAR,
            payment_paid_at  TIMESTAMP DEFAULT now(),
            payment_status   VARCHAR NOT NULL DEFAULT 'pending',
            is_active        BOOLEAN NOT NULL DEFAULT true,
            cumulative_paid  NUMERIC DEFAULT 0,
            updated_at       TIMESTAMP DEFAULT now(),
            updated_by       UUID
        )
    """)

    # Indexes mirroring the payments table's patterns
    op.execute("CREATE INDEX IF NOT EXISTS idx_purchase_payments_biz_active ON purchase_payments (business_id, is_active)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_purchase_payments_pur_id ON purchase_payments (pur_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_purchase_payments_pur_active ON purchase_payments (pur_id, is_active)")

    # Enable RLS + tenant isolation policy (mirrors payments)
    op.execute("ALTER TABLE purchase_payments ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY tenant_access_policy ON purchase_payments
        FOR ALL USING (business_id = app.current_business_id())
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_access_policy ON purchase_payments")
    op.execute("ALTER TABLE purchase_payments DISABLE ROW LEVEL SECURITY")
    op.execute("DROP TABLE IF EXISTS purchase_payments")
