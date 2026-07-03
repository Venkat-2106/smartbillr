"""add partial unique index on customers.phone and suppliers.phone

Revision ID: f0e1d2c3b4a5
Revises: e5f6a7b8c9d0
Create Date: 2026-07-04 12:00:00.000000

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "f0e1d2c3b4a5"
down_revision: Union[str, None] = "e5f6a7b8c9d0"


def upgrade() -> None:
    op.create_index(
        "idx_customers_phone_unique",
        "customers",
        ["business_id", "cust_phone"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false AND cust_phone IS NOT NULL"),
    )
    op.create_index(
        "idx_suppliers_phone_unique",
        "suppliers",
        ["business_id", "supp_phone"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false AND supp_phone IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_customers_phone_unique")
    op.drop_index("idx_suppliers_phone_unique")
