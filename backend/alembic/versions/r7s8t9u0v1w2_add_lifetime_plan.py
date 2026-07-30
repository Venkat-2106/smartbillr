"""add lifetime plan

Revision ID: r7s8t9u0v1w2
Revises: q3r4s5t6u7v8
Create Date: 2026-07-19

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


revision: str = "r7s8t9u0v1w2"
down_revision: Union[str, None] = "q3r4s5t6u7v8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        text("""
            INSERT INTO plans (plan_code, display_name, billing_cycle, price_inr, price_usd, feature_limits, sort_order)
            VALUES (
                'lifetime',
                'Lifetime',
                'one_time',
                14999,
                299,
                '{"max_products": null, "max_customers": null, "max_suppliers": null, "max_sales_per_month": null, "max_purchases_per_month": null, "max_export_rows": 10000, "max_staff": null, "financial_reports": true, "product_profit_view": true}',
                4
            )
            ON CONFLICT (plan_code) DO NOTHING
        """)
    )


def downgrade() -> None:
    op.execute(text("DELETE FROM plans WHERE plan_code = 'lifetime'"))
