"""add source column to audit_logs and update fn_audit_log trigger

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-07-25 13:00:00.000000

"""

from typing import Sequence, Union
from alembic import op


revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, None] = "f3a4b5c6d7e8"


def upgrade() -> None:
    # 1. Add nullable source column — no default, no backfill, zero impact on
    #    existing rows or the other 5 audited tables.
    op.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS source TEXT NULL")

    # 2. Update fn_audit_log to optionally capture the app.audit_source GUC.
    #    Every other write path never sets this GUC, so it returns NULL — zero
    #    behavior change for existing code.
    op.execute("""
CREATE OR REPLACE FUNCTION public.fn_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_business_id UUID;
    v_user_id     UUID;
    v_record_id   UUID;
    v_old_data    JSONB;
    v_new_data    JSONB;
    v_pk_name     TEXT;
    v_row_data    JSONB;
    v_source      TEXT;
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new_data := to_jsonb(NEW.*);
        v_row_data := v_new_data;
    END IF;

    IF TG_OP IN ('DELETE', 'UPDATE') THEN
        v_old_data := to_jsonb(OLD.*);
        IF TG_OP = 'DELETE' THEN
            v_row_data := v_old_data;
        END IF;
    END IF;

    SELECT a.attname INTO v_pk_name
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid
                       AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = TG_RELID
      AND i.indisprimary
    LIMIT 1;

    v_record_id := (v_row_data ->> v_pk_name)::uuid;
    v_business_id := (v_row_data ->> 'business_id')::uuid;
    v_user_id := current_setting('app.current_user_id', true)::uuid;

    -- Capture optional audit source (set via set_config('app.audit_source', ..., true))
    v_source := nullif(current_setting('app.audit_source', true), '');

    INSERT INTO audit_logs (
        business_id, user_id, action_type, table_name,
        record_id, old_data, new_data, source
    ) VALUES (
        v_business_id,
        v_user_id,
        LOWER(TG_OP),
        TG_TABLE_NAME,
        v_record_id,
        v_old_data,
        v_new_data,
        v_source
    );

    RETURN NEW;
END;
$function$
    """)


def downgrade() -> None:
    op.execute("""
CREATE OR REPLACE FUNCTION public.fn_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_business_id UUID;
    v_user_id     UUID;
    v_record_id   UUID;
    v_old_data    JSONB;
    v_new_data    JSONB;
    v_pk_name     TEXT;
    v_row_data    JSONB;
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new_data := to_jsonb(NEW.*);
        v_row_data := v_new_data;
    END IF;

    IF TG_OP IN ('DELETE', 'UPDATE') THEN
        v_old_data := to_jsonb(OLD.*);
        IF TG_OP = 'DELETE' THEN
            v_row_data := v_old_data;
        END IF;
    END IF;

    SELECT a.attname INTO v_pk_name
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid
                       AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = TG_RELID
      AND i.indisprimary
    LIMIT 1;

    v_record_id := (v_row_data ->> v_pk_name)::uuid;
    v_business_id := (v_row_data ->> 'business_id')::uuid;
    v_user_id := current_setting('app.current_user_id', true)::uuid;

    INSERT INTO audit_logs (
        business_id, user_id, action_type, table_name,
        record_id, old_data, new_data
    ) VALUES (
        v_business_id,
        v_user_id,
        LOWER(TG_OP),
        TG_TABLE_NAME,
        v_record_id,
        v_old_data,
        v_new_data
    );

    RETURN NEW;
END;
$function$
    """)
    op.execute("ALTER TABLE audit_logs DROP COLUMN IF EXISTS source")
