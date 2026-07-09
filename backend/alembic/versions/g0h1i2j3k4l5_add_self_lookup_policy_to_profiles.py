"""add self_lookup_policy to profiles so a user can read their own row

Without this policy, the cache-miss path in middleware/auth.py deadlocks:

  1. The cache-miss query does: SELECT ... FROM profiles WHERE p.id = :user_id
  2. The RLS tenant_access_policy checks: business_id = app.current_business_id()
  3. But app.current_business_id() is NULL — it hasn't been set yet because
     the query IS the lookup that's supposed to tell us the business_id.
  4. RLS hides every profile row → query returns None → 403 "User not found"

This policy lets a user always read their own profile row by id, breaking
the circular dependency.  Postgres ORs multiple permissive policies, so
tenant_access_policy still applies for INSERT/UPDATE/DELETE.

Revision ID: g0h1i2j3k4l5
Revises: f1e2d3c4b5a6
Create Date: 2026-07-09

"""
from typing import Sequence, Union

from alembic import op


revision: str = "g0h1i2j3k4l5"
down_revision: Union[str, None] = "f1e2d3c4b5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE POLICY self_lookup_policy ON profiles
        FOR SELECT
        USING (id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS self_lookup_policy ON profiles")
