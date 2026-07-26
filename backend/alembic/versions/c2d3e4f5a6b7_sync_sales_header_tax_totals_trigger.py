"""sync sales header tax totals via trigger + backfill

Revision ID: c2d3e4f5a6b7
Revises: 3f5c2f236502
Create Date: 2026-07-27 00:00:00.000000

Extends fn_sale_stock_movement (currently at 3f5c2f236502) with one new
step: after writing this sale_item's own tax columns, re-aggregate all
sale_items for the parent sale and write cgst_total/sgst_total/igst_total/
tax_total onto the sales header in the same transaction. This makes
sales.tax_total structurally impossible to drift from its line items —
no application-layer update_sale_tax_totals() call required.

Also includes a one-time backfill for sales created before this migration,
since the trigger only fires on new sale_items INSERTs going forward.
Existing sales.tax_total values may be stale (that's the bug reports.py
was working around by summing cgst_total+sgst_total+igst_total instead).
"""
from typing import Sequence, Union
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "3f5c2f236502"


UPGRADE_SQL = r"""
CREATE OR REPLACE FUNCTION public.fn_sale_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_prev_stock    INT;
  v_tax_rate      NUMERIC;
  v_total_tax     NUMERIC;
  v_subtotal      NUMERIC;
  v_country       VARCHAR;
  v_biz_state     TEXT;
  v_cust_state    VARCHAR;
  v_cust_country  VARCHAR;
  v_gst_registered BOOLEAN := false;
  v_cgst          NUMERIC := 0;
  v_sgst          NUMERIC := 0;
  v_igst          NUMERIC := 0;
  v_tax_amt       NUMERIC := 0;
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
    SELECT country, biz_state, cust_state, cust_country, gst_registered
      INTO v_country, v_biz_state, v_cust_state, v_cust_country, v_gst_registered
      FROM _sbr_sale_ctx
     WHERE sale_id = NEW.sale_id;
  EXCEPTION WHEN undefined_table THEN
    CREATE TEMP TABLE _sbr_sale_ctx (
      sale_id       UUID PRIMARY KEY,
      country       VARCHAR,
      biz_state     TEXT,
      cust_state    VARCHAR,
      cust_country  VARCHAR,
      gst_registered BOOLEAN
    ) ON COMMIT DROP;

    SELECT COALESCE(business_country_code, ''),
           COALESCE(business_state, ''),
           COALESCE(is_gst_registered, false)
      INTO v_country, v_biz_state, v_gst_registered
      FROM businesses
     WHERE business_id = NEW.business_id;

    SELECT COALESCE(c.cust_state, ''),
           COALESCE(c.cust_country_code, '')
      INTO v_cust_state, v_cust_country
      FROM sales s
      LEFT JOIN customers c ON c.cust_id = s.customer_id
     WHERE s.sales_id = NEW.sale_id;

    INSERT INTO _sbr_sale_ctx (sale_id, country, biz_state, cust_state, cust_country, gst_registered)
    VALUES (NEW.sale_id, v_country, v_biz_state, v_cust_state, v_cust_country, v_gst_registered);
  END;

  -- STEP 5: Tax calculation using the full global rule set
  v_subtotal  := NEW.sale_item_quantity * NEW.sale_item_unit_price;
  v_total_tax := (v_subtotal * v_tax_rate) / 100;

  IF v_country = 'IN' AND v_gst_registered THEN
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
    -- Non-India business or not GST-registered: single tax_amount bucket only
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

  -- STEP 6.5 (NEW): Keep sales header totals in sync — single source of
  -- truth. Re-aggregates ALL sale_items for this sale (not just NEW),
  -- so header always equals the true sum of its lines, regardless of
  -- insert order.
  UPDATE sales s
     SET cgst_total = agg.c,
         sgst_total = agg.s,
         igst_total = agg.i,
         tax_total  = agg.t
    FROM (
      SELECT COALESCE(SUM(cgst_amount), 0) AS c,
             COALESCE(SUM(sgst_amount), 0) AS s,
             COALESCE(SUM(igst_amount), 0) AS i,
             COALESCE(SUM(item_tax_total), 0) AS t
        FROM sale_items
       WHERE sale_id = NEW.sale_id
    ) agg
   WHERE s.sales_id = NEW.sale_id;

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

# One-time backfill: correct every existing sale's header tax totals from
# its actual sale_items, so historical data matches what the trigger would
# produce going forward. Safe to re-run (idempotent).
BACKFILL_SQL = r"""
UPDATE sales s
   SET cgst_total = agg.c,
       sgst_total = agg.s,
       igst_total = agg.i,
       tax_total  = agg.t
  FROM (
    SELECT sale_id,
           COALESCE(SUM(cgst_amount), 0) AS c,
           COALESCE(SUM(sgst_amount), 0) AS s,
           COALESCE(SUM(igst_amount), 0) AS i,
           COALESCE(SUM(item_tax_total), 0) AS t
      FROM sale_items
     GROUP BY sale_id
  ) agg
 WHERE s.sales_id = agg.sale_id
"""

DOWNGRADE_SQL = r"""
CREATE OR REPLACE FUNCTION public.fn_sale_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_prev_stock    INT;
  v_tax_rate      NUMERIC;
  v_total_tax     NUMERIC;
  v_subtotal      NUMERIC;
  v_country       VARCHAR;
  v_biz_state     TEXT;
  v_cust_state    VARCHAR;
  v_cust_country  VARCHAR;
  v_gst_registered BOOLEAN := false;
  v_cgst          NUMERIC := 0;
  v_sgst          NUMERIC := 0;
  v_igst          NUMERIC := 0;
  v_tax_amt       NUMERIC := 0;
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
    SELECT country, biz_state, cust_state, cust_country, gst_registered
      INTO v_country, v_biz_state, v_cust_state, v_cust_country, v_gst_registered
      FROM _sbr_sale_ctx
     WHERE sale_id = NEW.sale_id;
  EXCEPTION WHEN undefined_table THEN
    CREATE TEMP TABLE _sbr_sale_ctx (
      sale_id       UUID PRIMARY KEY,
      country       VARCHAR,
      biz_state     TEXT,
      cust_state    VARCHAR,
      cust_country  VARCHAR,
      gst_registered BOOLEAN
    ) ON COMMIT DROP;

    SELECT COALESCE(business_country_code, ''),
           COALESCE(business_state, ''),
           COALESCE(is_gst_registered, false)
      INTO v_country, v_biz_state, v_gst_registered
      FROM businesses
     WHERE business_id = NEW.business_id;

    SELECT COALESCE(c.cust_state, ''),
           COALESCE(c.cust_country_code, '')
      INTO v_cust_state, v_cust_country
      FROM sales s
      LEFT JOIN customers c ON c.cust_id = s.customer_id
     WHERE s.sales_id = NEW.sale_id;

    INSERT INTO _sbr_sale_ctx (sale_id, country, biz_state, cust_state, cust_country, gst_registered)
    VALUES (NEW.sale_id, v_country, v_biz_state, v_cust_state, v_cust_country, v_gst_registered);
  END;

  -- STEP 5: Tax calculation using the full global rule set
  v_subtotal  := NEW.sale_item_quantity * NEW.sale_item_unit_price;
  v_total_tax := (v_subtotal * v_tax_rate) / 100;

  IF v_country = 'IN' AND v_gst_registered THEN
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
    -- Non-India business or not GST-registered: single tax_amount bucket only
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


def upgrade() -> None:
    op.execute(UPGRADE_SQL)
    op.execute(BACKFILL_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
    # Note: backfilled values are NOT reverted on downgrade — they were
    # corrections, not regressions. Reverting them would reintroduce the
    # original bug.
