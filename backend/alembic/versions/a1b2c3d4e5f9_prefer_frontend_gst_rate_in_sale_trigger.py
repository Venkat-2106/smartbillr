"""prefer frontend gst_rate in fn_sale_stock_movement

Revision ID: a1b2c3d4e5f9
Revises: r7s8t9u0v1w2
Create Date: 2026-07-22 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = "a1b2c3d4e5f9"
down_revision: Union[str, None] = "r7s8t9u0v1w2"


# Previously the trigger always read tax_rate from the products table,
# ignoring any gst_rate value inserted on the sale_items row.
# This caused the frontend-sent tax_rate to be silently dropped.
#
# Fix: When NEW.gst_rate IS NOT NULL AND NEW.gst_rate > 0, use it as the
# tax rate for this sale item (frontend override / tax snapshot).
# Otherwise fall back to the product's master tax_rate (backward-compatible).

UPGRADE_SQL = r"""
CREATE OR REPLACE FUNCTION public.fn_sale_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_prev_stock   INT;
  v_tax_rate     NUMERIC;
  v_total_tax    NUMERIC;
  v_subtotal     NUMERIC;
  v_country      VARCHAR;
  v_biz_state    TEXT;
  v_cust_state   VARCHAR;
  v_cust_country VARCHAR;
  v_cgst         NUMERIC := 0;
  v_sgst         NUMERIC := 0;
  v_igst         NUMERIC := 0;
  v_tax_amt      NUMERIC := 0;
BEGIN
  -- STEP 1: Always get stock quantity (with row-level lock)
  SELECT prod_stock_qty
    INTO v_prev_stock
    FROM products
   WHERE prod_id = NEW.product_id
   FOR UPDATE;

  IF v_prev_stock < NEW.sale_item_quantity THEN
    RAISE EXCEPTION 'Insufficient stock! Only % units available.', v_prev_stock;
  END IF;

  -- STEP 2: Determine tax rate
  -- Prefer the frontend-provided gst_rate (tax snapshot) when available.
  -- Fall back to the product's master tax_rate for backward compatibility.
  IF NEW.gst_rate IS NOT NULL AND NEW.gst_rate > 0 THEN
    v_tax_rate := NEW.gst_rate;
  ELSE
    SELECT COALESCE(tax_rate, 0)
      INTO v_tax_rate
      FROM products
     WHERE prod_id = NEW.product_id;
  END IF;

  -- STEPS 3+4: business + customer -- cached per sale_id
  BEGIN
    SELECT country, biz_state, cust_state, cust_country
      INTO v_country, v_biz_state, v_cust_state, v_cust_country
      FROM _sbr_sale_ctx
     WHERE sale_id = NEW.sale_id;
  EXCEPTION WHEN undefined_table THEN
    CREATE TEMP TABLE _sbr_sale_ctx (
      sale_id      UUID PRIMARY KEY,
      country      VARCHAR,
      biz_state    TEXT,
      cust_state   VARCHAR,
      cust_country VARCHAR
    ) ON COMMIT DROP;

    SELECT COALESCE(business_country_code, ''),
           COALESCE(business_state, '')
      INTO v_country, v_biz_state
      FROM businesses
     WHERE business_id = NEW.business_id;

    SELECT COALESCE(c.cust_state, ''),
           COALESCE(c.cust_country_code, '')
      INTO v_cust_state, v_cust_country
      FROM sales s
      LEFT JOIN customers c ON c.cust_id = s.customer_id
     WHERE s.sales_id = NEW.sale_id;

    INSERT INTO _sbr_sale_ctx (sale_id, country, biz_state, cust_state, cust_country)
    VALUES (NEW.sale_id, v_country, v_biz_state, v_cust_state, v_cust_country);
  END;

  -- STEP 5: Tax calculation using the full global rule set
  v_subtotal  := NEW.sale_item_quantity * NEW.sale_item_unit_price;
  v_total_tax := (v_subtotal * v_tax_rate) / 100;

  IF v_country = 'IN' THEN
    -- Rule 1: Customer is outside India -> IGST
    IF v_cust_country != '' AND v_cust_country != 'IN' THEN
      v_igst := round(v_total_tax, 2);

    -- Rule 2: Customer in India (or unknown), no state -> CGST+SGST (intrastate default)
    ELSIF v_cust_state = '' THEN
      v_cgst := round(v_total_tax / 2, 2);
      v_sgst := v_total_tax - v_cgst;

    -- Rule 3: Same state -> intrastate (CGST + SGST)
    ELSIF lower(trim(v_biz_state)) = lower(trim(v_cust_state)) THEN
      v_cgst := round(v_total_tax / 2, 2);
      v_sgst := v_total_tax - v_cgst;

    -- Rule 4: Different state -> interstate (IGST)
    ELSE
      v_igst := round(v_total_tax, 2);
    END IF;
  ELSE
    -- Non-India business: single tax_amount bucket only
    v_tax_amt := round(v_total_tax, 2);
  END IF;

  -- STEP 6: Write tax columns back to the sale_item row
  UPDATE sale_items
     SET gst_rate    = v_tax_rate,
         cgst_amount = v_cgst,
         sgst_amount = v_sgst,
         igst_amount = v_igst,
         tax_amount  = v_tax_amt
   WHERE sale_item_id = NEW.sale_item_id;

  -- STEP 7: Stock movement ledger
  INSERT INTO stock_movements (
    business_id, product_id, move_type,
    move_qty, move_prev_stock,
    sale_reference_id, move_notes
  ) VALUES (
    NEW.business_id, NEW.product_id, 'sale',
    -NEW.sale_item_quantity, v_prev_stock,
    NEW.sale_id, 'Auto entry from sale'
  );

  -- STEP 8: Deduct stock
  UPDATE products
     SET prod_stock_qty = prod_stock_qty - NEW.sale_item_quantity,
         updated_at     = NOW()
   WHERE prod_id = NEW.product_id;

  RETURN NEW;
END;
$function$
"""

DOWNGRADE_SQL = r"""
CREATE OR REPLACE FUNCTION public.fn_sale_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_prev_stock   INT;
  v_tax_rate     NUMERIC;
  v_total_tax    NUMERIC;
  v_subtotal     NUMERIC;
  v_country      VARCHAR;
  v_biz_state    TEXT;
  v_cust_state   VARCHAR;
  v_cust_country VARCHAR;
  v_cgst         NUMERIC := 0;
  v_sgst         NUMERIC := 0;
  v_igst         NUMERIC := 0;
  v_tax_amt      NUMERIC := 0;
BEGIN
  SELECT prod_stock_qty,
         COALESCE(tax_rate, 0)
    INTO v_prev_stock,
         v_tax_rate
    FROM products
   WHERE prod_id = NEW.product_id
   FOR UPDATE;

  IF v_prev_stock < NEW.sale_item_quantity THEN
    RAISE EXCEPTION 'Insufficient stock! Only % units available.', v_prev_stock;
  END IF;

  BEGIN
    SELECT country, biz_state, cust_state, cust_country
      INTO v_country, v_biz_state, v_cust_state, v_cust_country
      FROM _sbr_sale_ctx
     WHERE sale_id = NEW.sale_id;
  EXCEPTION WHEN undefined_table THEN
    CREATE TEMP TABLE _sbr_sale_ctx (
      sale_id      UUID PRIMARY KEY,
      country      VARCHAR,
      biz_state    TEXT,
      cust_state   VARCHAR,
      cust_country VARCHAR
    ) ON COMMIT DROP;

    SELECT COALESCE(business_country_code, ''),
           COALESCE(business_state, '')
      INTO v_country, v_biz_state
      FROM businesses
     WHERE business_id = NEW.business_id;

    SELECT COALESCE(c.cust_state, ''),
           COALESCE(c.cust_country_code, '')
      INTO v_cust_state, v_cust_country
      FROM sales s
      LEFT JOIN customers c ON c.cust_id = s.customer_id
     WHERE s.sales_id = NEW.sale_id;

    INSERT INTO _sbr_sale_ctx (sale_id, country, biz_state, cust_state, cust_country)
    VALUES (NEW.sale_id, v_country, v_biz_state, v_cust_state, v_cust_country);
  END;

  v_subtotal  := NEW.sale_item_quantity * NEW.sale_item_unit_price;
  v_total_tax := (v_subtotal * v_tax_rate) / 100;

  IF v_country = 'IN' THEN
    IF v_cust_country != '' AND v_cust_country != 'IN' THEN
      v_igst := round(v_total_tax, 2);
    ELSIF v_cust_state = '' THEN
      v_cgst := round(v_total_tax / 2, 2);
      v_sgst := v_total_tax - v_cgst;
    ELSIF lower(trim(v_biz_state)) = lower(trim(v_cust_state)) THEN
      v_cgst := round(v_total_tax / 2, 2);
      v_sgst := v_total_tax - v_cgst;
    ELSE
      v_igst := round(v_total_tax, 2);
    END IF;
  ELSE
    v_tax_amt := round(v_total_tax, 2);
  END IF;

  UPDATE sale_items
     SET gst_rate    = v_tax_rate,
         cgst_amount = v_cgst,
         sgst_amount = v_sgst,
         igst_amount = v_igst,
         tax_amount  = v_tax_amt
   WHERE sale_item_id = NEW.sale_item_id;

  INSERT INTO stock_movements (
    business_id, product_id, move_type,
    move_qty, move_prev_stock,
    sale_reference_id, move_notes
  ) VALUES (
    NEW.business_id, NEW.product_id, 'sale',
    -NEW.sale_item_quantity, v_prev_stock,
    NEW.sale_id, 'Auto entry from sale'
  );

  UPDATE products
     SET prod_stock_qty = prod_stock_qty - NEW.sale_item_quantity,
         updated_at     = NOW()
   WHERE prod_id = NEW.product_id;

  RETURN NEW;
END;
$function$
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
