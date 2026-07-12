from sqlalchemy.orm import Session
from sqlalchemy import text


def fetch_stock_kpi_counts(db: Session, business_id: str) -> dict:
    """Shared KPI query for stock/product summary cards.

    Returns total_count, low_stock_count, and out_of_stock_count for
    products belonging to the given business.
    """
    row = db.execute(text("""
        SELECT
            COUNT(*)                                                           AS total_count,
            COALESCE(SUM(prod_stock_qty * prod_cost_price), 0)                 AS stock_value,
            COUNT(*) FILTER (WHERE prod_stock_qty <= prod_low_stock_alert)      AS low_stock_count,
            COUNT(*) FILTER (WHERE prod_stock_qty = 0)                          AS out_of_stock_count
        FROM products
        WHERE business_id = CAST(:bid AS uuid)
          AND is_deleted  = false
    """), {"bid": business_id}).fetchone()
    return {
        "total_count":        int(row.total_count),
        "stock_value":        float(row.stock_value),
        "low_stock_count":    int(row.low_stock_count),
        "out_of_stock_count": int(row.out_of_stock_count),
    }
