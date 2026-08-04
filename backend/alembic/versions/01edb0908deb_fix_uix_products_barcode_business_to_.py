"""fix uix_products_barcode_business to exclude soft-deleted products

Revision ID: 01edb0908deb
Revises: f4e4a5b0809e
Create Date: 2026-08-04 21:44:09.063203

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '01edb0908deb'
down_revision: Union[str, None] = 'f4e4a5b0809e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEX_NAME = "uix_products_barcode_business"

_NEW_INDEX_SQL = """
    CREATE UNIQUE INDEX uix_products_barcode_business
    ON products (business_id, barcode)
    WHERE (barcode IS NOT NULL AND is_deleted = false)
"""

_OLD_INDEX_SQL = """
    CREATE UNIQUE INDEX uix_products_barcode_business
    ON products (business_id, barcode)
    WHERE (barcode IS NOT NULL)
"""


def _existing_index_def(bind) -> Union[str, None]:
    row = bind.execute(
        sa.text(
            "SELECT indexdef FROM pg_indexes "
            "WHERE schemaname = 'public' AND indexname = :name"
        ),
        {"name": _INDEX_NAME},
    ).first()
    return row[0] if row else None


def upgrade() -> None:
    """Upgrade schema."""
    # FIX (2026-08-04): uix_products_barcode_business was the only one of the
    # four soft-delete-aware unique indexes missing `is_deleted = false` in its
    # WHERE clause (idx_customers_phone_unique, idx_suppliers_phone_unique and
    # uix_products_name_business all filter on is_deleted = false). Because of
    # that, a soft-deleted product's barcode permanently blocked reuse by any
    # new product for that business — forever, for every tenant.
    #
    # The recreated index only NARROWS the existing predicate (adds
    # is_deleted = false), so every row that satisfied the old constraint still
    # satisfies the new one. No pre-cleanup required and no currently-active
    # row can violate it.
    bind = op.get_bind()
    existing = _existing_index_def(bind)

    if existing is None:
        op.execute(_NEW_INDEX_SQL)
        print(f"[{_INDEX_NAME}] created with is_deleted = false predicate")
    elif "is_deleted" in existing:
        print(f"[{_INDEX_NAME}] already present with is_deleted predicate — skipping")
    else:
        op.execute(f"DROP INDEX IF EXISTS {_INDEX_NAME}")
        op.execute(_NEW_INDEX_SQL)
        print(f"[{_INDEX_NAME}] replaced (added is_deleted = false predicate)")


def downgrade() -> None:
    """Downgrade schema."""
    # Restore the original (buggy) predicate so the index still blocks reuse of
    # soft-deleted barcodes.
    bind = op.get_bind()
    existing = _existing_index_def(bind)

    if existing is None:
        op.execute(_OLD_INDEX_SQL)
    elif "is_deleted" not in existing:
        print(f"[{_INDEX_NAME}] already has original predicate — skipping")
    else:
        op.execute(f"DROP INDEX IF EXISTS {_INDEX_NAME}")
        op.execute(_OLD_INDEX_SQL)
