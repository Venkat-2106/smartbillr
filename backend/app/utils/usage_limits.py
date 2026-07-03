from sqlalchemy import text
from sqlalchemy.orm import Session
from uuid import UUID
from app.utils.subscription_features import get_feature_limits

ALLOWED_COUNT_TABLES = {"products", "purchases", "suppliers", "sales", "customers"}


def count_entities(db: Session, business_id: str, table: str) -> int:
    if table not in ALLOWED_COUNT_TABLES:
        raise ValueError(f"Invalid table for count query: {table}")

    row = db.execute(
        text(f"""
            SELECT COUNT(*) FROM {table}
            WHERE business_id = CAST(:bid AS uuid)
              AND (is_deleted = false OR is_deleted IS NULL)
        """),
        {"bid": business_id}
    ).scalar()
    return row or 0


def count_monthly(db: Session, business_id: str, table: str, date_column: str) -> int:
    if table not in ALLOWED_COUNT_TABLES:
        raise ValueError(f"Invalid table for count query: {table}")

    row = db.execute(
        text(f"""
            SELECT COUNT(*) FROM {table}
            WHERE business_id = CAST(:bid AS uuid)
              AND {date_column} >= date_trunc('month', now())
              AND (is_deleted = false OR is_deleted IS NULL)
        """),
        {"bid": business_id}
    ).scalar()
    return row or 0


def check_create_allowed(
    db: Session,
    business_id: str,
    subscription_type: str,
    limit_key: str,
    table: str,
    date_column: str = None,
) -> tuple:
    limits = get_feature_limits(subscription_type)
    max_val = limits.get(limit_key)

    if max_val is None:
        return True, ""

    if date_column:
        current = count_monthly(db, business_id, table, date_column)
    else:
        current = count_entities(db, business_id, table)

    if current >= max_val:
        plan_label = subscription_type.capitalize()
        return False, (
            f"Your {plan_label} plan allows a maximum of {max_val} "
            f"{limit_key.replace('_', ' ')}. "
            f"Upgrade to add more."
        )

    return True, ""


def fetch_subscription_type(db: Session, business_id: str) -> str:
    row = db.execute(
        text("SELECT subscription_type FROM businesses WHERE business_id = CAST(:bid AS uuid) LIMIT 1"),
        {"bid": business_id}
    ).fetchone()
    return row.subscription_type if row else "trial"
