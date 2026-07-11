"""add updated_by column + trigger to sales table

Revision ID: c8d9e0f1a2b3
Revises: a1b2c3d4e5f7
Create Date: 2026-07-12 01:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8d9e0f1a2b3'
down_revision: Union[str, None] = 'a1b2c3d4e5f7'
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
    if not _column_exists("sales", "updated_by"):
        op.execute("ALTER TABLE sales ADD COLUMN updated_by UUID")
        op.execute(
            "ALTER TABLE sales ADD CONSTRAINT fk_sales_updated_by "
            "FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL"
        )

    op.execute("DROP TRIGGER IF EXISTS trg_sales_updated_by ON sales")
    op.execute("""
        CREATE TRIGGER trg_sales_updated_by
            BEFORE UPDATE ON sales
            FOR EACH ROW
            EXECUTE FUNCTION fn_set_updated_by();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_sales_updated_by ON sales")
    op.execute("ALTER TABLE sales DROP CONSTRAINT IF EXISTS fk_sales_updated_by")
    op.execute("ALTER TABLE sales DROP COLUMN IF EXISTS updated_by")
