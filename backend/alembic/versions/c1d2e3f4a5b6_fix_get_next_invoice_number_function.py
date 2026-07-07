"""fix get_next_invoice_number: remove dropped business_settings reference

Revision ID: c1d2e3f4a5b6
Revises: b2c3d4e5f6a7
Create Date: 2026-07-07 10:00:00.000000

"""

from typing import Sequence, Union
from alembic import op


revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "b2c3d4e5f6a7"


NEW_FN_DEF = """
CREATE OR REPLACE FUNCTION public.get_next_invoice_number(p_business_id uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    new_counter INT;
    invoice TEXT;
    prefix TEXT;
BEGIN
    prefix := 'INV';

    -- Lock row to prevent duplicate invoices under concurrent requests
    UPDATE business_counters
    SET invoice_counter = invoice_counter + 1,
        updated_at = now()
    WHERE business_id = p_business_id
    RETURNING invoice_counter INTO new_counter;

    -- If no counter row exists yet, create it
    IF new_counter IS NULL THEN
        INSERT INTO business_counters (business_id, invoice_counter, updated_at)
        VALUES (p_business_id, 1, now())
        RETURNING invoice_counter INTO new_counter;
    END IF;

    invoice := prefix || '-' || LPAD(new_counter::TEXT, 4, '0');
    RETURN invoice;
END;
$function$
"""

OLD_FN_DEF = """
CREATE OR REPLACE FUNCTION public.get_next_invoice_number(p_business_id uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    new_counter INT;
    invoice TEXT;
    prefix TEXT;
BEGIN
    -- Get custom prefix from business_settings if set
    SELECT COALESCE(invoice_prefix, 'INV')
    INTO prefix
    FROM business_settings
    WHERE business_id = p_business_id;

    IF prefix IS NULL THEN
        prefix := 'INV';
    END IF;

    -- Lock row to prevent duplicate invoices under concurrent requests
    UPDATE business_counters
    SET invoice_counter = invoice_counter + 1,
        updated_at = now()
    WHERE business_id = p_business_id
    RETURNING invoice_counter INTO new_counter;

    -- If no counter row exists yet, create it
    IF new_counter IS NULL THEN
        INSERT INTO business_counters (business_id, invoice_counter, updated_at)
        VALUES (p_business_id, 1, now())
        RETURNING invoice_counter INTO new_counter;
    END IF;

    invoice := prefix || '-' || LPAD(new_counter::TEXT, 4, '0');
    RETURN invoice;
END;
$function$
"""


def upgrade() -> None:
    op.execute(NEW_FN_DEF)


def downgrade() -> None:
    op.execute(OLD_FN_DEF)
