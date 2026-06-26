"""add RLS to profiles and super_admins tables

Revision ID: r1s2t3u4v5w6
Revises: b3c4d5e6f7a8
Create Date: 2026-06-26 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'r1s2t3u4v5w6'
down_revision: Union[str, None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # profiles.business_id already exists as a foreign key to businesses
    op.execute("ALTER TABLE profiles ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE profiles FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY tenant_access_policy ON profiles
        FOR ALL
        USING (business_id = app.current_business_id())
    """)

    # super_admins table also needs protection (no business_id — use a different policy)
    # Super admins should only be accessible with service role (no RLS needed there)
    op.execute("ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE super_admins FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY deny_all_policy ON super_admins
        FOR ALL
        USING (false)
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_access_policy ON profiles")
    op.execute("ALTER TABLE profiles NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE profiles DISABLE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS deny_all_policy ON super_admins")
    op.execute("ALTER TABLE super_admins NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE super_admins DISABLE ROW LEVEL SECURITY")
