"""add super_admin_access_policy to businesses so super admins can read/write across tenants

Revision ID: n2o3p4q5r6s7
Revises: h1i2j3k4l5m6
Create Date: 2026-07-09

"""
from typing import Sequence, Union

from alembic import op


revision: str = "n2o3p4q5r6s7"
down_revision: Union[str, None] = "h1i2j3k4l5m6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE POLICY super_admin_access_policy ON businesses
        FOR ALL
        USING (current_setting('app.is_super_admin', true) = 'true')
        WITH CHECK (current_setting('app.is_super_admin', true) = 'true')
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS super_admin_access_policy ON businesses")
