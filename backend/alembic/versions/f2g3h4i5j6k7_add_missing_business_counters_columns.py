"""add purchase_counter and customer_counter to business_counters

The SQLAlchemy model had purchase_counter and customer_counter columns, but
no migration ever added them to the production database. The registration
endpoint's INSERT into business_counters explicitly references purchase_counter,
which caused a 500 error on signup because PostgreSQL rejected writing to a
non-existent column.
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "f2g3h4i5j6k7"
down_revision: Union[str, None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = {c["name"] for c in inspector.get_columns("business_counters")}

    if "purchase_counter" not in existing:
        op.add_column(
            "business_counters",
            sa.Column("purchase_counter", sa.Integer(), server_default=sa.text("0"), nullable=False),
        )

    if "customer_counter" not in existing:
        op.add_column(
            "business_counters",
            sa.Column("customer_counter", sa.Integer(), server_default=sa.text("0"), nullable=False),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = {c["name"] for c in inspector.get_columns("business_counters")}

    if "customer_counter" in existing:
        op.drop_column("business_counters", "customer_counter")

    if "purchase_counter" in existing:
        op.drop_column("business_counters", "purchase_counter")
