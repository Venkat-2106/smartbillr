"""add self_lookup_policy to super_admins so super admins can read their own row

The super_admins table uses deny_all_policy FOR ALL USING (false), which was
safe when the app connected as a superuser (bypassing RLS).  Now that the app
connects as app_user (NOBYPASSRLS), the deny_all_policy blocks every query —
including the super admin lookup in verify_super_admin_token().

This policy lets a super admin read their own row by user_id, matching the
same approach used for profiles.  The deny_all_policy still covers
INSERT/UPDATE/DELETE.

Revision ID: h1i2j3k4l5m6
Revises: g0h1i2j3k4l5
Create Date: 2026-07-09

"""
from typing import Sequence, Union

from alembic import op


revision: str = "h1i2j3k4l5m6"
down_revision: Union[str, None] = "g0h1i2j3k4l5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE POLICY self_lookup_policy ON super_admins
        FOR SELECT
        USING (user_id = NULLIF(current_setting('app.current_user_id', true), ''))
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS self_lookup_policy ON super_admins")
