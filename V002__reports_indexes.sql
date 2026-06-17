-- =============================================================================
-- V002__reports_indexes.sql
-- Performance indexes for report aggregation queries.
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id     ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id  ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id   ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id    ON purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_sale_id       ON payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_sale_id  ON sales_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_purchase_id ON purchase_returns(purchase_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id   ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at       ON sales(created_at DESC);
