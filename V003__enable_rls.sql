-- =============================================================================
-- V003__enable_rls.sql
-- Enable Row Level Security on all tenant-scoped tables + shared reference
-- tables. Adds tenant-isolation policies and shared-read policies.
--
-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  ⚠️  Run this ONLY if you switch DATABASE_URL to a NOBYPASSRLS role.       ║
-- ║  With the current postgres superuser connection, RLS is silently bypassed. ║
-- ║  Skip this file entirely if you're keeping the postgres connection.        ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
-- =============================================================================

BEGIN;

-- ─── 1. ENABLE ROW LEVEL SECURITY ─────────────────────────────────────────────

ALTER TABLE businesses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases             ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_returns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_return_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_returns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE low_stock_alerts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_counters     ENABLE ROW LEVEL SECURITY;

ALTER TABLE roles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions      ENABLE ROW LEVEL SECURITY;

-- ─── 2. TENANT ISOLATION POLICIES ─────────────────────────────────────────────

DO $$ BEGIN CREATE POLICY tenant_isolation ON businesses
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON profiles
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON categories
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON customers
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON suppliers
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON products
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON sales
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON sale_items
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON payments
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON purchases
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON purchase_items
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON expenses
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON sales_returns
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON sales_return_items
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON purchase_returns
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON purchase_return_items
    FOR ALL USING (return_id IN (
        SELECT pr.return_id FROM purchase_returns pr
        WHERE pr.business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON stock_movements
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON low_stock_alerts
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON audit_logs
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY tenant_isolation ON business_counters
    FOR ALL USING (business_id = (current_setting('request.jwt.claims', true)::json->>'business_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. SHARED REFERENCE TABLES (any authenticated user can SELECT) ────────────

DO $$ BEGIN CREATE POLICY readonly_for_all ON roles FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY readonly_for_all ON permissions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY readonly_for_all ON role_permissions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
