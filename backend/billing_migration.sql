-- SmartBillr Billing Tables Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- Idempotent: uses IF NOT EXISTS where possible

BEGIN;

-- ── plans ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
    plan_id UUID DEFAULT gen_random_uuid() NOT NULL,
    plan_code VARCHAR(30) NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    billing_cycle VARCHAR(20) NOT NULL,
    price_inr NUMERIC(10, 2),
    price_usd NUMERIC(10, 2),
    razorpay_plan_id VARCHAR(100),
    razorpay_plan_id_usd VARCHAR(100),
    stripe_price_id VARCHAR(100),
    feature_limits JSONB DEFAULT '{}' NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    sort_order SMALLINT DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (plan_id),
    UNIQUE (plan_code)
);

-- ── subscription_payments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_payments (
    payment_id UUID DEFAULT gen_random_uuid() NOT NULL,
    business_id UUID NOT NULL REFERENCES businesses.business_id ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans.plan_id,
    provider VARCHAR(20) NOT NULL,
    provider_order_id VARCHAR(120),
    provider_payment_id VARCHAR(120),
    provider_signature TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'created',
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    updated_by_webhook_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (payment_id)
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_biz
    ON subscription_payments (business_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_payments_provider_order
    ON subscription_payments (provider, provider_order_id);

-- ── subscription_events ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_events (
    event_id UUID DEFAULT gen_random_uuid() NOT NULL,
    provider VARCHAR(20) NOT NULL,
    provider_event_id VARCHAR(150) NOT NULL,
    event_type VARCHAR(60) NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (event_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_events_dedupe
    ON subscription_events (provider, provider_event_id);

-- ── subscription_invoices ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_invoices (
    invoice_id UUID DEFAULT gen_random_uuid() NOT NULL,
    business_id UUID NOT NULL REFERENCES businesses.business_id ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES subscription_payments.payment_id,
    invoice_number VARCHAR(30) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    provider_invoice_url TEXT,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (invoice_id),
    UNIQUE (invoice_number)
);

-- ── businesses — new columns ────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='current_plan_id') THEN
        ALTER TABLE businesses ADD COLUMN current_plan_id UUID REFERENCES plans.plan_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='payment_provider') THEN
        ALTER TABLE businesses ADD COLUMN payment_provider VARCHAR(20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='provider_customer_id') THEN
        ALTER TABLE businesses ADD COLUMN provider_customer_id VARCHAR(120);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='auto_renew') THEN
        ALTER TABLE businesses ADD COLUMN auto_renew BOOLEAN NOT NULL DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='grace_period_end_at') THEN
        ALTER TABLE businesses ADD COLUMN grace_period_end_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- ── RLS policies ────────────────────────────────────────────────────────
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscription_payments' AND policyname='tenant_access_policy') THEN
        CREATE POLICY tenant_access_policy ON subscription_payments
        FOR ALL USING (business_id = current_setting('app.current_business_id')::uuid);
    END IF;
END $$;

ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscription_invoices' AND policyname='tenant_access_policy') THEN
        CREATE POLICY tenant_access_policy ON subscription_invoices
        FOR ALL USING (business_id = current_setting('app.current_business_id')::uuid);
    END IF;
END $$;

-- ── Seed plans (insert only if not already present) ─────────────────────
INSERT INTO plans (plan_code, display_name, billing_cycle, price_inr, price_usd, feature_limits, sort_order) VALUES
    ('trial',      'Free Trial',  'trial',    0,      0,      '{"max_products": 50, "max_customers": 50, "max_suppliers": 25, "max_sales_per_month": 100, "max_purchases_per_month": 50, "max_export_rows": 500, "max_staff": 1, "financial_reports": false, "product_profit_view": false}', 0),
    ('basic',      'Basic',       'monthly',  499,    9.99,   '{"max_products": 500, "max_customers": 500, "max_suppliers": null, "max_sales_per_month": 2000, "max_purchases_per_month": null, "max_export_rows": 10000, "max_staff": 2, "financial_reports": false, "product_profit_view": false}', 1),
    ('pro',        'Pro',         'monthly',  999,    19,     '{"max_products": null, "max_customers": null, "max_suppliers": null, "max_sales_per_month": null, "max_purchases_per_month": null, "max_export_rows": 10000, "max_staff": 10, "financial_reports": true, "product_profit_view": true}', 2),
    ('pro_yearly', 'Pro Yearly',  'yearly',   4999,   99,     '{"max_products": null, "max_customers": null, "max_suppliers": null, "max_sales_per_month": null, "max_purchases_per_month": null, "max_export_rows": 10000, "max_staff": 10, "financial_reports": true, "product_profit_view": true}', 3),
    ('lifetime',   'Lifetime',    'one_time', 14999,  299,    '{"max_products": null, "max_customers": null, "max_suppliers": null, "max_sales_per_month": null, "max_purchases_per_month": null, "max_export_rows": 10000, "max_staff": null, "financial_reports": true, "product_profit_view": true}', 4)
ON CONFLICT (plan_code) DO NOTHING;

-- Mark alembic migration as applied (prevents re-run via alembic)
INSERT INTO alembic_version (version_num) VALUES ('a1b2c3d4e5f7')
ON CONFLICT DO NOTHING;

COMMIT;
