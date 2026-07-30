"""reconcile plans.feature_limits keys/values with TIER_FEATURES

Revision ID: f291eeade481
Revises: e7f8a9b0c1d2
Create Date: 2026-07-30 09:32:05.607095

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import text

revision: str = "f291eeade481"
down_revision: Union[str, None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(text("""
        UPDATE plans SET feature_limits = '{"max_products": 50, "max_customers": 50, "max_suppliers": 25, "max_sales_per_month": 100, "max_purchases_per_month": 50, "max_export_rows": 500, "max_staff": 1, "financial_reports": false, "product_profit_view": false}'::jsonb
        WHERE plan_code = 'trial'
    """))
    op.execute(text("""
        UPDATE plans SET feature_limits = '{"max_products": 500, "max_customers": 500, "max_suppliers": null, "max_sales_per_month": 2000, "max_purchases_per_month": null, "max_export_rows": 10000, "max_staff": 2, "financial_reports": false, "product_profit_view": false}'::jsonb
        WHERE plan_code = 'basic'
    """))
    op.execute(text("""
        UPDATE plans SET feature_limits = '{"max_products": null, "max_customers": null, "max_suppliers": null, "max_sales_per_month": null, "max_purchases_per_month": null, "max_export_rows": 10000, "max_staff": 10, "financial_reports": true, "product_profit_view": true}'::jsonb
        WHERE plan_code = 'pro'
    """))
    op.execute(text("""
        UPDATE plans SET feature_limits = '{"max_products": null, "max_customers": null, "max_suppliers": null, "max_sales_per_month": null, "max_purchases_per_month": null, "max_export_rows": 10000, "max_staff": 10, "financial_reports": true, "product_profit_view": true}'::jsonb
        WHERE plan_code = 'pro_yearly'
    """))
    op.execute(text("""
        UPDATE plans SET feature_limits = '{"max_products": null, "max_customers": null, "max_suppliers": null, "max_sales_per_month": null, "max_purchases_per_month": null, "max_export_rows": 10000, "max_staff": null, "financial_reports": true, "product_profit_view": true}'::jsonb
        WHERE plan_code = 'lifetime'
    """))


def downgrade() -> None:
    op.execute(text("""
        UPDATE plans SET feature_limits = '{"max_products": 50, "max_customers": 50, "max_sales_monthly": 100, "max_staff": 1, "financial_reports": false, "product_profit_view": false}'::jsonb
        WHERE plan_code = 'trial'
    """))
    op.execute(text("""
        UPDATE plans SET feature_limits = '{"max_products": 500, "max_customers": 500, "max_sales_monthly": 2000, "max_staff": 2, "financial_reports": false, "product_profit_view": false}'::jsonb
        WHERE plan_code = 'basic'
    """))
    op.execute(text("""
        UPDATE plans SET feature_limits = '{"max_products": -1, "max_customers": -1, "max_sales_monthly": -1, "max_staff": 10, "financial_reports": true, "product_profit_view": true}'::jsonb
        WHERE plan_code = 'pro'
    """))
    op.execute(text("""
        UPDATE plans SET feature_limits = '{"max_products": -1, "max_customers": -1, "max_sales_monthly": -1, "max_staff": 10, "financial_reports": true, "product_profit_view": true}'::jsonb
        WHERE plan_code = 'pro_yearly'
    """))
    op.execute(text("""
        UPDATE plans SET feature_limits = '{"max_products": -1, "max_customers": -1, "max_sales_monthly": -1, "max_staff": -1, "financial_reports": true, "product_profit_view": true}'::jsonb
        WHERE plan_code = 'lifetime'
    """))
