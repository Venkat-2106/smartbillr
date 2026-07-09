"""drop unused tenant_isolation policy on profiles

tenant_isolation checks business_id against:

    current_setting('request.jwt.claims', true)::json ->> 'business_id'

This GUC is only ever populated by Supabase's PostgREST layer when a request
is made through supabase-js's data client (.from()/.rpc()/.storage()).  The
frontend src/ uses supabase-js exclusively for .auth (sign in/out/session)
with zero calls to .from(), .rpc(), or .storage().  The FastAPI backend never
sets request.jwt.claims either.

The policy can therefore never match any row — it is dead weight, not a
working second line of defence.  Safe to remove.

Caveat: if the frontend later adopts supabase-js's data client for direct
table queries, this policy would need to be re-added via the downgrade.

Revision ID: o3p4q5r6s7t8
Revises: n2o3p4q5r6s7
Create Date: 2026-07-09

"""
from typing import Sequence, Union

from alembic import op


revision: str = "o3p4q5r6s7t8"
down_revision: Union[str, None] = "n2o3p4q5r6s7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON profiles")


def downgrade() -> None:
    op.execute("""
        CREATE POLICY tenant_isolation ON profiles
        FOR ALL
        USING (business_id = ((current_setting('request.jwt.claims', true))::json ->> 'business_id')::uuid)
    """)
