"""drop fn_init_business_counters trigger and function

Business counters are now initialized explicitly in the app code
(subscription.py registration endpoint). The old trigger function
also referenced the now-dropped business_settings table, causing
registration to fail with:
  psycopg2.errors.UndefinedTable: relation "business_settings" does not exist

This migration removes the stale trigger and function entirely.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "a0b1c2d3e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_init_business_counters ON businesses")
    op.execute("DROP FUNCTION IF EXISTS fn_init_business_counters()")


def downgrade() -> None:
    op.execute("""
        CREATE FUNCTION fn_init_business_counters()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        BEGIN
            INSERT INTO business_counters (business_id, invoice_counter, purchase_counter)
            VALUES (NEW.business_id, 0, 0)
            ON CONFLICT (business_id) DO NOTHING;
            RETURN NEW;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER trg_init_business_counters
        AFTER INSERT ON businesses
        FOR EACH ROW
        EXECUTE FUNCTION fn_init_business_counters()
    """)
