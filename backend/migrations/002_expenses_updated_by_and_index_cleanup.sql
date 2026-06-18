-- ================================================================
-- Migration 002: Add expenses.updated_by + drop redundant indexes
-- ================================================================
-- Applied:  (write the date when you run this)
-- Rollback: See bottom of file
-- ================================================================

-- ── Part A: Add updated_by column to expenses ─────────────────
-- WHY: Model and router already expect it (matching customer.py
-- pattern). Without it, reads/writes throw column-not-found errors.
ALTER TABLE expenses
  ADD COLUMN updated_by UUID REFERENCES profiles(id);

-- ── Part B: Drop duplicate / redundant indexes ─────────────────
-- WHY: These indexes either duplicate another index exactly, or
-- are a prefix of a composite index (PostgreSQL can use the
-- leading column of a composite index for single-column lookups).

-- 1. expenses.idx_expenses_business_id
--    Redundant: idx_expenses_business_deleted starts with (business_id),
--    and idx_expenses_date also starts with (business_id).
DROP INDEX IF EXISTS idx_expenses_business_id;

-- 2. payments.idx_payments_business_id
--    Redundant: idx_payments_business_active covers (business_id, is_active)
--    without a WHERE clause, serving the same queries.
DROP INDEX IF EXISTS idx_payments_business_id;

-- 3. purchase_items.idx_purchase_items_purchase
--    Exact duplicate of idx_purchase_items_purchase_id (both btree on pur_id).
DROP INDEX IF EXISTS idx_purchase_items_purchase;

-- 4. purchase_items.idx_purchase_items_product
--    Exact duplicate of idx_purchase_items_product_id (both btree on product_id).
DROP INDEX IF EXISTS idx_purchase_items_product;

-- 5. permissions.idx_permissions_id
--    Redundant: permissions_pkey is already a unique btree index on (id).
DROP INDEX IF EXISTS idx_permissions_id;

-- 6. products.idx_products_business_id
--    Redundant: idx_products_business_deleted starts with (business_id) and
--    all product queries filter is_deleted = false anyway.
DROP INDEX IF EXISTS idx_products_business_id;


-- ================================================================
-- ROLLBACK
-- ================================================================
-- CREATE INDEX idx_products_business_id       ON products      USING btree (business_id)       WHERE (is_deleted = false);
-- CREATE INDEX idx_permissions_id             ON permissions   USING btree (id);
-- CREATE INDEX idx_purchase_items_product     ON purchase_items USING btree (product_id);
-- CREATE INDEX idx_purchase_items_purchase    ON purchase_items USING btree (pur_id);
-- CREATE INDEX idx_payments_business_id       ON payments      USING btree (business_id)        WHERE (is_active = true);
-- CREATE INDEX idx_expenses_business_id       ON expenses      USING btree (business_id);
-- ALTER TABLE expenses DROP COLUMN updated_by;
