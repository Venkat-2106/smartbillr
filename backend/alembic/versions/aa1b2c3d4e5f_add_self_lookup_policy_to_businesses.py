"""add self_lookup_policy to businesses so verify_token can read business rows

Without this policy, the cache-miss path in middleware/auth.py returns
NULL for b.is_active because the LEFT JOIN on businesses is blocked by
RLS:

  1. The cache-miss query does:
     SELECT ... LEFT JOIN businesses b ON b.business_id = p.business_id
  2. The RLS tenant_access_policy on businesses checks:
     business_id = app.current_business_id()
  3. But app.current_business_id() is NULL — it hasn't been set yet
     because the query IS the lookup that's supposed to tell us the
     business_id.
  4. RLS hides every business row → LEFT JOIN returns NULL →
     not None == True → false 403 "suspended" error.

This policy lets a user always read the business row that owns their
profile, breaking the circular dependency.  Postgres ORs multiple
permissive policies, so tenant_access_policy still applies for
INSERT/UPDATE/DELETE.

The profiles table had the identical circular dependency and was fixed
by migration g0h1i2j3k4l5 (self_lookup_policy on profiles).  This
migration mirrors that approach for the businesses table.

HOW THE POLICY WORKS:

  1. Sets app.current_user_id GUC (done in verify_token before the query).
  2. Subquery reads the user's profile to get their business_id.
  3. Compares that business_id to the row being accessed.
  4. If they match, the SELECT is allowed — breaking the chicken-and-egg
     problem where we need the business_id to set the GUC but need the
     GUC to read the business row.

DEFENSE-IN-DEPTH (middleware/auth.py):

  - business_is_active check now uses `is False` instead of `not` to
    avoid false-positive suspension when the LEFT JOIN returns NULL.
  - Cache entry stores the actual business_is_active value instead of
    hardcoded True.

RELATED POLICIES ON BUSINESSES:
  - tenant_access_policy: business_id = app.current_business_id()
    (for normal tenant-scoped queries after GUC is set)
  - super_admin_access_policy: app.is_super_admin = 'true'
    (for super admin cross-tenant access)

Revision ID: aa1b2c3d4e5f
Revises: f4a5b6c7d8e9
Create Date: 2026-07-15

"""
from typing import Sequence, Union

from alembic import op


revision: str = "aa1b2c3d4e5f"
down_revision: Union[str, None] = "f4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # self_lookup_policy allows a user to SELECT a business row when
    # the business owns their profile.  This is a SELECT-only policy
    # so it only affects reads — INSERT/UPDATE/DELETE are still gated
    # by tenant_access_policy (which requires the GUC to be set).
    #
    # The subquery is safe because profiles already has its own
    # self_lookup_policy (g0h1i2j3k4l5) that lets us read the profile
    # row using app.current_user_id.
    op.execute("""
        CREATE POLICY self_lookup_policy ON businesses
        FOR SELECT
        USING (
            business_id = (
                SELECT p.business_id
                FROM profiles p
                WHERE p.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                LIMIT 1
            )
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS self_lookup_policy ON businesses")
