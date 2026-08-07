"""backfill updated_by on purchases, expenses, purchase_returns

Revision ID: d7a0b1c2d3e4
Revises: d6fb48290d93
Create Date: 2026-08-07 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd7a0b1c2d3e4'
down_revision: Union[str, None] = 'd6fb48290d93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_BACKFILL_TABLES = ["purchases", "expenses", "purchase_returns"]


def upgrade() -> None:
    # These tables carry user-defined triggers that would interfere with the
    # backfill UPDATE:
    #   - trg_expenses_updated_by / trg_purchase_returns_updated_by
    #     (fn_set_updated_by) — BEFORE UPDATE trigger that reads the session
    #     GUC app.current_user_id and would OVERWRITE our backfilled
    #     updated_by with NULL during the migration (no request context → GUC
    #     unset).
    #   - fn_audit_log() — Supabase-managed audit trigger that tries to cast
    #     empty-string session vars to UUID, crashing on UPDATE during
    #     migration.
    # DISABLE TRIGGER USER disables every trigger created by users/roles but
    # leaves internal (system) triggers intact. Mirror the expenses backfill
    # in e2f3a4b5c6d7.
    for table in _BACKFILL_TABLES:
        op.execute(f"ALTER TABLE {table} DISABLE TRIGGER USER")

    op.execute("""
        UPDATE purchases
        SET updated_by = created_by
        WHERE updated_by IS NULL
          AND created_by IS NOT NULL
    """)
    op.execute("""
        UPDATE expenses
        SET updated_by = created_by
        WHERE updated_by IS NULL
          AND created_by IS NOT NULL
    """)
    op.execute("""
        UPDATE purchase_returns
        SET updated_by = created_by
        WHERE updated_by IS NULL
          AND created_by IS NOT NULL
    """)

    for table in _BACKFILL_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE TRIGGER USER")


def downgrade() -> None:
    # Not reversible — we have no record of which rows originally had NULL
    # updated_by before this backfill. This is a one-time data fix.
    pass
