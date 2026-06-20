"""add updated_by columns + fn_set_updated_by trigger on categories, expenses, suppliers

Revision ID: d6e7f8a9b0c1
Revises: c4d5e6f7a8b9
Create Date: 2026-06-20 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd6e7f8a9b0c1'
down_revision: Union[str, None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLES = ["categories", "expenses", "suppliers"]


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
    # 1. Add updated_by column + FK constraint to each table if missing
    for table in _TABLES:
        if not _column_exists(table, "updated_by"):
            op.execute(f"ALTER TABLE {table} ADD COLUMN updated_by UUID")
            op.execute(
                f"ALTER TABLE {table} ADD CONSTRAINT fk_{table}_updated_by "
                f"FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL"
            )

    # 2. Create the trigger function that reads app.current_user_id
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_set_updated_by()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        BEGIN
            NEW.updated_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid;
            RETURN NEW;
        END;
        $$;
    """)

    # 3. Create BEFORE UPDATE triggers on each table
    for table in _TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_by ON {table}")
        op.execute(f"""
            CREATE TRIGGER trg_{table}_updated_by
                BEFORE UPDATE ON {table}
                FOR EACH ROW
                EXECUTE FUNCTION fn_set_updated_by();
        """)


def downgrade() -> None:
    for table in reversed(_TABLES):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_by ON {table}")
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS fk_{table}_updated_by")
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS updated_by")

    op.execute("DROP FUNCTION IF EXISTS fn_set_updated_by()")
