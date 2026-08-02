"""add razorpay subscription fields to subscription_payments

Revision ID: 334ec520516b
Revises: f291eeade481
Create Date: 2026-08-02 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "334ec520516b"
down_revision: Union[str, None] = "f291eeade481"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "subscription_payments",
        sa.Column("razorpay_subscription_id", sa.String(120), nullable=True),
    )
    op.add_column(
        "subscription_payments",
        sa.Column("subscription_status", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("subscription_payments", "subscription_status")
    op.drop_column("subscription_payments", "razorpay_subscription_id")
