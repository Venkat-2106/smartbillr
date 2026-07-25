"""exclude purchase_refund from dashboard mv total_expenses

Revision ID: c6d7e8f9a0b2
Revises: b5c6d7e8f9a1
Create Date: 2026-07-25 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'c6d7e8f9a0b2'
down_revision: Union[str, None] = 'b5c6d7e8f9a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MV_SUMMARY = "mv_dashboard_summary"

NEW_MV = """
CREATE MATERIALIZED VIEW IF NOT EXISTS {mv} AS
WITH
sales_agg AS (
    SELECT
        s.business_id,
        COUNT(*)                                          AS total_invoices,
        COUNT(*) FILTER (WHERE s.sales_payment_status IN ('pending','partial'))
                                                          AS pending_payments,
        COUNT(*) FILTER (WHERE s.sales_payment_status = 'partial')
                                                          AS partial_count,
        COUNT(*) FILTER (WHERE s.sales_payment_status = 'pending')
                                                          AS pending_count,
        COUNT(*) FILTER (WHERE s.sales_payment_status = 'paid')
                                                          AS paid_count,
        COALESCE(SUM(s.sales_final_amount), 0)            AS total_revenue,
        COALESCE(SUM(s.tax_total), 0)                     AS total_tax_collected,
        COALESCE(SUM(s.cgst_total), 0)                    AS total_cgst,
        COALESCE(SUM(s.sgst_total), 0)                    AS total_sgst,
        COALESCE(SUM(s.igst_total), 0)                    AS total_igst
    FROM sales s
    WHERE s.is_deleted = false
    GROUP BY s.business_id
),
purchase_agg AS (
    SELECT
        pr.business_id,
        COUNT(*)                                          AS total_purchases,
        COALESCE(SUM(pr.pur_final_amount), 0)             AS total_purchase_amount,
        COALESCE(SUM(pr.pur_discount), 0)                 AS total_purchase_discount,
        COALESCE(SUM(pr.pur_tax_total), 0)                AS total_purchase_tax
    FROM purchases pr
    WHERE pr.is_deleted = false
    GROUP BY pr.business_id
),
profit_agg AS (
    SELECT
        s.business_id,
        COALESCE(SUM(si.sale_item_subtotal - (si.sale_item_quantity * p.prod_cost_price)), 0)
                                                          AS gross_profit
    FROM sale_items si
    JOIN sales s ON s.sales_id = si.sale_id
    JOIN products p ON p.prod_id = si.product_id
    WHERE s.is_deleted = false
    GROUP BY s.business_id
),
payment_agg AS (
    SELECT
        pay.business_id,
        COALESCE(SUM(pay.payment_amount), 0)              AS total_collected
    FROM payments pay
    JOIN sales s ON s.sales_id = pay.sale_id
    WHERE pay.is_active = true
      AND s.is_deleted = false
    GROUP BY pay.business_id
),
outstanding_agg AS (
    SELECT
        s.business_id,
        COALESCE(SUM(s.sales_final_amount - COALESCE(pay.cumulative_paid, 0)), 0)
                                                          AS outstanding_receivables
    FROM sales s
    LEFT JOIN payments pay ON pay.sale_id = s.sales_id AND pay.is_active = true
    WHERE s.is_deleted = false
    GROUP BY s.business_id
),
expense_agg AS (
    SELECT
        e.business_id,
        COALESCE(SUM(e.expense_amount), 0)               AS total_expenses
    FROM expenses e
    WHERE e.is_deleted = false
      AND (e.expense_category IS NULL OR e.expense_category != 'purchase_refund')
    GROUP BY e.business_id
),
customer_agg AS (
    SELECT business_id, COUNT(*) AS total_customers
    FROM customers WHERE is_deleted = false GROUP BY business_id
),
product_agg AS (
    SELECT business_id, COUNT(*) AS total_products
    FROM products WHERE is_deleted = false GROUP BY business_id
),
supplier_agg AS (
    SELECT business_id, COUNT(*) AS total_suppliers
    FROM suppliers WHERE is_deleted = false GROUP BY business_id
),
low_stock_agg AS (
    SELECT
        la.business_id,
        COUNT(DISTINCT la.product_id) AS low_stock_alerts
    FROM low_stock_alerts la
    JOIN products p ON p.prod_id = la.product_id
    WHERE la.alert_status = 'unread'
      AND p.is_deleted = false
      AND p.prod_stock_qty <= p.prod_low_stock_alert
    GROUP BY la.business_id
),
inventory_agg AS (
    SELECT
        business_id,
        COALESCE(SUM(prod_stock_qty * prod_cost_price), 0) AS inventory_value
    FROM products
    WHERE is_deleted = false
    GROUP BY business_id
)
SELECT
    b.business_id,
    COALESCE(sa.total_invoices, 0)            AS total_invoices,
    COALESCE(sa.pending_payments, 0)          AS pending_payments,
    COALESCE(sa.partial_count, 0)             AS partial_count,
    COALESCE(sa.pending_count, 0)             AS pending_count,
    COALESCE(sa.paid_count, 0)                AS paid_count,
    COALESCE(sa.total_revenue, 0)             AS total_revenue,
    COALESCE(sa.total_tax_collected, 0)       AS total_tax_collected,
    COALESCE(sa.total_cgst, 0)                AS total_cgst,
    COALESCE(sa.total_sgst, 0)                AS total_sgst,
    COALESCE(sa.total_igst, 0)                AS total_igst,
    COALESCE(oa.outstanding_receivables, 0)   AS outstanding_receivables,
    COALESCE(pa.total_purchases, 0)           AS total_purchases,
    COALESCE(pa.total_purchase_amount, 0)     AS total_purchase_amount,
    COALESCE(pa.total_purchase_discount, 0)   AS total_purchase_discount,
    COALESCE(pa.total_purchase_tax, 0)        AS total_purchase_tax,
    COALESCE(pra.gross_profit, 0)             AS gross_profit,
    COALESCE(pya.total_collected, 0)          AS total_collected,
    COALESCE(ea.total_expenses, 0)            AS total_expenses,
    COALESCE(ca.total_customers, 0)           AS total_customers,
    COALESCE(pta.total_products, 0)           AS total_products,
    COALESCE(sua.total_suppliers, 0)          AS total_suppliers,
    COALESCE(lsa.low_stock_alerts, 0)         AS low_stock_alerts,
    COALESCE(iva.inventory_value, 0)          AS inventory_value
FROM businesses b
LEFT JOIN sales_agg      sa  ON sa.business_id  = b.business_id
LEFT JOIN purchase_agg   pa  ON pa.business_id  = b.business_id
LEFT JOIN profit_agg     pra ON pra.business_id = b.business_id
LEFT JOIN payment_agg    pya ON pya.business_id = b.business_id
LEFT JOIN outstanding_agg oa  ON oa.business_id  = b.business_id
LEFT JOIN expense_agg    ea  ON ea.business_id  = b.business_id
LEFT JOIN customer_agg   ca  ON ca.business_id  = b.business_id
LEFT JOIN product_agg    pta ON pta.business_id = b.business_id
LEFT JOIN supplier_agg   sua ON sua.business_id = b.business_id
LEFT JOIN low_stock_agg  lsa ON lsa.business_id = b.business_id
LEFT JOIN inventory_agg  iva ON iva.business_id = b.business_id
"""


def upgrade() -> None:
    op.execute(f"DROP MATERIALIZED VIEW IF EXISTS {MV_SUMMARY}")
    op.execute(NEW_MV.format(mv=MV_SUMMARY))
    op.execute(f"CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_summary_pk ON {MV_SUMMARY} (business_id)")


def downgrade() -> None:
    op.execute(f"DROP MATERIALIZED VIEW IF EXISTS {MV_SUMMARY}")
