"""add updated_by columns + trg_set_updated_by triggers on purchase_returns, sales_returns

Revision ID: a1b2c3d4e5f8
Revises: f9a0b1c2d3e4
Create Date: 2026-07-13 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f8'
down_revision: Union[str, None] = 'f9a0b1c2d3e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLES = ["purchase_returns", "sales_returns"]


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
    for table in _TABLES:
        if not _column_exists(table, "updated_by"):
            op.execute(f"ALTER TABLE {table} ADD COLUMN updated_by UUID")
            op.execute(
                f"ALTER TABLE {table} ADD CONSTRAINT fk_{table}_updated_by "
                f"FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL"
            )

    # fn_set_updated_by() already exists from migration d6e7f8a9b0c1 — just add triggers
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
