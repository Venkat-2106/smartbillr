"""enforce NOT NULL on profiles.business_id

The ORM model (profile.py) already declares business_id as
nullable=False, but no database-level NOT NULL constraint exists
on the live Postgres column.  This migration adds it so that
direct inserts (e.g. via Supabase Auth trigger or staff-creation
route) are also rejected when business_id is missing.

Revision ID: 9a3ad406def5
Revises: d7dabc514088
Create Date: 2026-07-03 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9a3ad406def5'
down_revision: Union[str, None] = 'd7dabc514088'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE profiles ALTER COLUMN business_id SET NOT NULL"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE profiles ALTER COLUMN business_id DROP NOT NULL"
    )
