"""fix profiles FK constraint if duplicate was created by earlier migration

If m5n6o7p8q9r0 ran before its _TABLES fix, it silently skipped the
real fk_profiles_business_id (wrong name) and created a redundant
profiles_business_id_fkey alongside it.  This companion migration
drops both and re-adds a single correctly-named ON DELETE RESTRICT
constraint.

Revision ID: n1o2p3q4r5s6
Revises: a3b4c5d6e7f8
Create Date: 2026-07-17

"""
from typing import Sequence, Union

from alembic import op


revision: str = "n1o2p3q4r5s6"
down_revision: Union[str, None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop both the custom-named FK and the potentially-duplicate default-named FK
    op.execute("ALTER TABLE profiles DROP CONSTRAINT IF EXISTS fk_profiles_business_id")
    op.execute("ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_business_id_fkey")
    # Re-add a single correctly-named constraint with ON DELETE RESTRICT
    op.execute(
        "ALTER TABLE profiles ADD CONSTRAINT fk_profiles_business_id "
        "FOREIGN KEY (business_id) REFERENCES businesses(business_id) "
        "ON DELETE RESTRICT"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE profiles DROP CONSTRAINT IF EXISTS fk_profiles_business_id")
    op.execute("ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_business_id_fkey")
    op.execute(
        "ALTER TABLE profiles ADD CONSTRAINT fk_profiles_business_id "
        "FOREIGN KEY (business_id) REFERENCES businesses(business_id)"
    )
