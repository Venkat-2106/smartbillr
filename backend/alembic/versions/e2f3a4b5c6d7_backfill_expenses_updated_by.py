"""backfill NULL updated_by and updated_at on expenses

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c7
Create Date: 2026-07-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, None] = 'd1e2f3a4b5c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Disable ALL user-defined triggers on expenses during this backfill.
    # Reasons:
    #   1. trg_expenses_updated_by (fn_set_updated_by) — BEFORE UPDATE trigger
    #      that reads session GUC app.current_user_id.  During a migration there
    #      is no request context, so the GUC is unset and the trigger would
    #      OVERWRITE our backfilled updated_by with NULL.
    #   2. fn_audit_log() — Supabase-managed audit trigger that tries to cast
    #      empty-string session vars to UUID, crashing on UPDATE during migration.
    # DISABLE TRIGGER USER disables every trigger created by users/roles but
    # leaves internal (system) triggers intact.
    op.execute("ALTER TABLE expenses DISABLE TRIGGER USER")

    op.execute("""
        UPDATE expenses
        SET updated_at  = created_at,
            updated_by  = created_by
        WHERE updated_by IS NULL
          AND created_by IS NOT NULL
    """)

    op.execute("ALTER TABLE expenses ENABLE TRIGGER USER")


def downgrade() -> None:
    # Not reversible — we have no record of which rows originally had NULL
    # updated_by/updated_at before this backfill.  This is a one-time data fix.
    pass
