"""add composite index, FK constraints, and NOT NULL for profiles

Issues addressed:
  5. Missing composite index on businesses(payment_status, subscription_end_at)
     for expiry job performance on large datasets.
  6. Missing FK constraint on profiles.business_id -> businesses.business_id.
  7. profiles.role_id is nullable but should be NOT NULL.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Composite index for expiry job queries
    op.create_index(
        "ix_businesses_payment_status_sub_end",
        "businesses",
        ["payment_status", "subscription_end_at"],
        postgresql_where=sa.text("payment_status = 'paid'"),
    )

    # FK constraint on profiles.business_id
    op.create_foreign_key(
        "fk_profiles_business_id",
        "profiles",
        "businesses",
        ["business_id"],
        ["business_id"],
    )

    # Set any NULL role_id values to the admin role before making NOT NULL
    op.execute("""
        UPDATE profiles
        SET role_id = (SELECT id FROM roles WHERE name = 'admin' LIMIT 1)
        WHERE role_id IS NULL
    """)
    op.alter_column("profiles", "role_id", nullable=False)


def downgrade() -> None:
    op.alter_column("profiles", "role_id", nullable=True)
    op.drop_constraint("fk_profiles_business_id", "profiles", type_="foreignkey")
    op.drop_index("ix_businesses_payment_status_sub_end", table_name="businesses")
