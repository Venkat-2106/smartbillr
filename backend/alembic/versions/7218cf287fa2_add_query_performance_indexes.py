"""add query performance indexes

Revision ID: 7218cf287fa2
Revises: 8733280511d7
Create Date: 2026-07-07 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7218cf287fa2"
down_revision: Union[str, None] = "8733280511d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_profiles_business_id", "profiles", ["business_id"])
    op.create_index(
        "ix_categories_business",
        "categories",
        ["business_id", "updated_at"],
        postgresql_where=sa.text("is_deleted = false"),
    )
    op.create_index(
        "ix_sale_items_product", "sale_items", ["business_id", "product_id"]
    )
    op.create_index(
        "ix_sales_payment_status",
        "sales",
        ["business_id", "sales_payment_status"],
        postgresql_where=sa.text("is_deleted = false"),
    )


def downgrade() -> None:
    op.drop_index("ix_profiles_business_id")
    op.drop_index("ix_categories_business")
    op.drop_index("ix_sale_items_product")
    op.drop_index("ix_sales_payment_status")
