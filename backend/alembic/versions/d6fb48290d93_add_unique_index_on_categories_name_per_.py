"""add unique index on categories name per business

Revision ID: d6fb48290d93
Revises: 01edb0908deb
Create Date: 2026-08-04 22:00:17.143801

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd6fb48290d93'
down_revision: Union[str, None] = '01edb0908deb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEX_NAME = "uix_categories_name_business"


def upgrade() -> None:
    """Upgrade schema."""
    # FIX (2026-08-04): categories was the only entity with NO database-level
    # unique index on its name column — only the primary key (category_pkey)
    # exists. Duplicate-category prevention relied entirely on app-layer checks
    # (Zod frontend, FastAPI backend) with no DB backstop, unlike products
    # (uix_products_name_business), customers (idx_customers_phone_unique) and
    # suppliers (idx_suppliers_phone_unique), which all have a soft-delete-aware
    # partial unique index as the authoritative layer.
    #
    # SAFETY: adding a NEW unique constraint is not provably safe to apply blind.
    # A read-only scan ran before this migration and confirmed ZERO
    # case-insensitive duplicate active category names per business
    # (GROUP BY business_id, lower(category_name) HAVING COUNT(*) > 1), so the
    # index will create cleanly. The predicate exactly mirrors the backend
    # duplicate check in category.py (lower(category_name) on is_deleted=false).
    #
    # Idempotency guard: if the index already exists (e.g. applied out-of-band
    # or a re-run after a partial apply), skip creating a duplicate.
    op.execute(f"""
        CREATE UNIQUE INDEX IF NOT EXISTS {_INDEX_NAME}
        ON categories (business_id, lower(category_name))
        WHERE is_deleted = false
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(f"DROP INDEX IF EXISTS {_INDEX_NAME}")
