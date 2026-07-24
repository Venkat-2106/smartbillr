"""add updated_at + updated_by columns and triggers to payments table

Revision ID: b5c6d7e8f9a0
Revises: 3f5c2f236502
Create Date: 2026-07-23 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b5c6d7e8f9a0'
down_revision: Union[str, None] = '3f5c2f236502'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return result.fetchone() is not None


def upgrade() -> None:
    # 1. Add updated_at column
    if not _column_exists("payments", "updated_at"):
        op.execute("ALTER TABLE payments ADD COLUMN updated_at TIMESTAMP")
        op.execute("ALTER TABLE payments ALTER COLUMN updated_at SET DEFAULT now()")

    # 2. Add updated_by column + FK
    if not _column_exists("payments", "updated_by"):
        op.execute("ALTER TABLE payments ADD COLUMN updated_by UUID")
        op.execute(
            "ALTER TABLE payments ADD CONSTRAINT fk_payments_updated_by "
            "FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL"
        )

    # 3. Create fn_set_updated_at trigger function (idempotent)
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_set_updated_at()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$;
    """)

    # 4. BEFORE UPDATE triggers for updated_at and updated_by
    op.execute("DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments")
    op.execute("""
        CREATE TRIGGER trg_payments_updated_at
            BEFORE UPDATE ON payments
            FOR EACH ROW
            EXECUTE FUNCTION fn_set_updated_at();
    """)

    op.execute("DROP TRIGGER IF EXISTS trg_payments_updated_by ON payments")
    op.execute("""
        CREATE TRIGGER trg_payments_updated_by
            BEFORE UPDATE ON payments
            FOR EACH ROW
            EXECUTE FUNCTION fn_set_updated_by();
    """)

    # 5. BEFORE INSERT trigger so new payment rows also get updated_by
    #    (the active row is INSERTed, never UPDATEd — without this trigger
    #    updated_by stays NULL on the row the payments list page shows)
    op.execute("DROP TRIGGER IF EXISTS trg_payments_updated_by_insert ON payments")
    op.execute("""
        CREATE TRIGGER trg_payments_updated_by_insert
            BEFORE INSERT ON payments
            FOR EACH ROW
            EXECUTE FUNCTION fn_set_updated_by();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_payments_updated_by_insert ON payments")
    op.execute("DROP TRIGGER IF EXISTS trg_payments_updated_by ON payments")
    op.execute("DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments")
    op.execute("DROP FUNCTION IF EXISTS fn_set_updated_at()")
    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS fk_payments_updated_by")
    op.execute("ALTER TABLE payments DROP COLUMN IF EXISTS updated_by")
    op.execute("ALTER TABLE payments DROP COLUMN IF EXISTS updated_at")
