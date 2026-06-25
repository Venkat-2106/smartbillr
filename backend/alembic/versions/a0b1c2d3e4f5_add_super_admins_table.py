"""
Add super_admins table for platform-level administrators.

Super admins have no business_id — they manage the entire platform
(business lifecycle, subscription overrides, tenant suspension).

This table stores a simple FK reference from auth.users to designate
a user as a platform-level super admin.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a0b1c2d3e4f5"
down_revision: Union[str, None] = "z0y1x2w3v4u5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "super_admins",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("super_admins")
