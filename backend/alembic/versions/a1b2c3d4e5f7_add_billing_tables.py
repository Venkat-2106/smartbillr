"""add billing tables

Revision ID: a1b2c3d4e5f7
Revises: o3p4q5r6s7t8
Create Date: 2026-07-11 18:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = 'o3p4q5r6s7t8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── plans ──────────────────────────────────────────────────────────────
    op.create_table(
        'plans',
        sa.Column('plan_id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('plan_code', sa.String(30), nullable=False, unique=True),
        sa.Column('display_name', sa.String(50), nullable=False),
        sa.Column('billing_cycle', sa.String(20), nullable=False),
        sa.Column('price_inr', sa.Numeric(10, 2), nullable=True),
        sa.Column('price_usd', sa.Numeric(10, 2), nullable=True),
        sa.Column('razorpay_plan_id', sa.String(100), nullable=True),
        sa.Column('stripe_price_id', sa.String(100), nullable=True),
        sa.Column('feature_limits', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default=sa.text('true')),
        sa.Column('sort_order', sa.SmallInteger, nullable=False, server_default=sa.text('0')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── subscription_payments ───────────────────────────────────────────────
    op.create_table(
        'subscription_payments',
        sa.Column('payment_id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('business_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('businesses.business_id', ondelete='CASCADE'), nullable=False),
        sa.Column('plan_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('plans.plan_id'), nullable=False),
        sa.Column('provider', sa.String(20), nullable=False),
        sa.Column('provider_order_id', sa.String(120), nullable=True),
        sa.Column('provider_payment_id', sa.String(120), nullable=True),
        sa.Column('provider_signature', sa.Text, nullable=True),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='created'),
        sa.Column('failure_reason', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_by_webhook_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('idx_subscription_payments_biz', 'subscription_payments', ['business_id', sa.text('created_at DESC')])
    op.create_index('idx_subscription_payments_provider_order', 'subscription_payments', ['provider', 'provider_order_id'], unique=True)

    # ── subscription_events ─────────────────────────────────────────────────
    op.create_table(
        'subscription_events',
        sa.Column('event_id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('provider', sa.String(20), nullable=False),
        sa.Column('provider_event_id', sa.String(150), nullable=False),
        sa.Column('event_type', sa.String(60), nullable=False),
        sa.Column('payload', postgresql.JSONB, nullable=False),
        sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('idx_subscription_events_dedupe', 'subscription_events', ['provider', 'provider_event_id'], unique=True)

    # ── subscription_invoices ───────────────────────────────────────────────
    op.create_table(
        'subscription_invoices',
        sa.Column('invoice_id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('business_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('businesses.business_id', ondelete='CASCADE'), nullable=False),
        sa.Column('payment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('subscription_payments.payment_id'), nullable=False),
        sa.Column('invoice_number', sa.String(30), nullable=False, unique=True),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False),
        sa.Column('provider_invoice_url', sa.Text, nullable=True),
        sa.Column('issued_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── businesses — new columns ────────────────────────────────────────────
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    biz_cols = {c["name"] for c in inspector.get_columns("businesses")}

    NEW_BIZ_COLS = {
        "current_plan_id": lambda: sa.Column("current_plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey('plans.plan_id'), nullable=True),
        "payment_provider": lambda: sa.Column("payment_provider", sa.String(20), nullable=True),
        "provider_customer_id": lambda: sa.Column("provider_customer_id", sa.String(120), nullable=True),
        "auto_renew": lambda: sa.Column("auto_renew", sa.Boolean, nullable=False, server_default=sa.text('true')),
        "grace_period_end_at": lambda: sa.Column("grace_period_end_at", sa.DateTime(timezone=True), nullable=True),
    }

    for col_name, factory in NEW_BIZ_COLS.items():
        if col_name not in biz_cols:
            op.add_column("businesses", factory())

    # ── RLS policies ────────────────────────────────────────────────────────
    op.execute("""
        ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY
    """)
    op.execute("""
        CREATE POLICY tenant_access_policy ON subscription_payments
        FOR ALL
        USING (business_id = current_setting('app.current_business_id')::uuid)
    """)
    op.execute("""
        ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY
    """)
    op.execute("""
        CREATE POLICY tenant_access_policy ON subscription_invoices
        FOR ALL
        USING (business_id = current_setting('app.current_business_id')::uuid)
    """)

    # ── Seed plans ──────────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO plans (plan_code, display_name, billing_cycle, price_inr, price_usd, feature_limits, sort_order) VALUES
        ('trial',    'Free Trial',  'trial',    0,      0,      '{"max_products": 50, "max_customers": 50, "max_suppliers": 25, "max_sales_per_month": 100, "max_purchases_per_month": 50, "max_export_rows": 500, "max_staff": 1, "financial_reports": false, "product_profit_view": false}', 0),
        ('basic',    'Basic',       'monthly',  499,    9.99,   '{"max_products": 500, "max_customers": 500, "max_suppliers": null, "max_sales_per_month": 2000, "max_purchases_per_month": null, "max_export_rows": 10000, "max_staff": 2, "financial_reports": false, "product_profit_view": false}', 1),
        ('pro',      'Pro',         'monthly',  999,    19,     '{"max_products": null, "max_customers": null, "max_suppliers": null, "max_sales_per_month": null, "max_purchases_per_month": null, "max_export_rows": 10000, "max_staff": 10, "financial_reports": true, "product_profit_view": true}', 2),
        ('pro_yearly', 'Pro Yearly', 'yearly',  4999,   99,     '{"max_products": null, "max_customers": null, "max_suppliers": null, "max_sales_per_month": null, "max_purchases_per_month": null, "max_export_rows": 10000, "max_staff": 10, "financial_reports": true, "product_profit_view": true}', 3)
    """)


def downgrade() -> None:
    op.drop_table('subscription_invoices')
    op.drop_index('idx_subscription_events_dedupe', table_name='subscription_events')
    op.drop_table('subscription_events')
    op.drop_index('idx_subscription_payments_provider_order', table_name='subscription_payments')
    op.drop_index('idx_subscription_payments_biz', table_name='subscription_payments')
    op.drop_table('subscription_payments')
    op.drop_table('plans')

    op.drop_column('businesses', 'grace_period_end_at')
    op.drop_column('businesses', 'auto_renew')
    op.drop_column('businesses', 'provider_customer_id')
    op.drop_column('businesses', 'payment_provider')
    op.drop_column('businesses', 'current_plan_id')
