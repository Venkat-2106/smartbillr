"""add pur_invoice_no to purchases and get_next_purchase_number function

Revision ID: d2e3f4a5b6c8
Revises: c1d2e3f4a5b7
Create Date: 2026-07-26 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd2e3f4a5b6c8'
down_revision: Union[str, None] = 'c1d2e3f4a5b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add nullable invoice number column — existing rows get NULL
    op.execute("ALTER TABLE purchases ADD COLUMN IF NOT EXISTS pur_invoice_no TEXT NULL")

    # 2. Partial unique index per business (NULLs excluded, matching sales pattern)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uix_purchases_invoice_business
        ON purchases (business_id, pur_invoice_no)
        WHERE is_deleted = false AND pur_invoice_no IS NOT NULL
    """)

    # 3. DB function: gapless sequential PUR-XXXX per business
    op.execute("""
CREATE OR REPLACE FUNCTION public.get_next_purchase_number(p_business_id uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    new_counter INT;
    purchase_no TEXT;
    prefix      TEXT;
BEGIN
    prefix := 'PUR';

    -- Lock row to prevent duplicate numbers under concurrent requests
    UPDATE business_counters
    SET purchase_counter = purchase_counter + 1,
        updated_at      = now()
    WHERE business_id = p_business_id
    RETURNING purchase_counter INTO new_counter;

    -- If no counter row exists yet, create it
    IF new_counter IS NULL THEN
        INSERT INTO business_counters (business_id, purchase_counter, updated_at)
        VALUES (p_business_id, 1, now())
        RETURNING purchase_counter INTO new_counter;
    END IF;

    purchase_no := prefix || '-' || LPAD(new_counter::TEXT, 4, '0');
    RETURN purchase_no;
END;
$function$
    """)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.get_next_purchase_number(uuid)")
    op.execute("DROP INDEX IF EXISTS uix_purchases_invoice_business")
    op.execute("ALTER TABLE purchases DROP COLUMN IF EXISTS pur_invoice_no")
