"""add plans.razorpay_plan_id_usd

Revision ID: d8e0f1b2c3d4
Revises: d7a0b1c2d3e4
Create Date: 2026-08-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd8e0f1b2c3d4'
down_revision: Union[str, None] = 'd7a0b1c2d3e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # USD recurring billing needs a separate currency-locked Razorpay Plan id.
    # INR and USD are separate Razorpay Plan objects, not one Plan with a
    # currency switch, so we store the USD one in its own column.
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"] for c in inspector.get_columns("plans")}
    if "razorpay_plan_id_usd" not in cols:
        op.add_column(
            "plans",
            sa.Column("razorpay_plan_id_usd", sa.String(100), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("plans", "razorpay_plan_id_usd")
