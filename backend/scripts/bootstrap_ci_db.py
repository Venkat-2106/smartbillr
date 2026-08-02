"""
Bootstrap a throwaway PostgreSQL database for the CI test suite.

The alembic migration chain is incremental-only: it was authored against
the already-populated production schema and cannot bootstrap an empty
database (`alembic upgrade head` fails with e.g. `relation "sales" does
not exist`). This script instead:

  1. Creates the full schema directly from ``app.models`` (the source of
     truth for the schema).
  2. Enables Row-Level Security on every tenant table the same way the
     RLS migration does.
  3. Creates a non-superuser ``app_user`` role (NOBYPASSRLS) so RLS is
     actually enforced — superusers bypass RLS entirely.
  4. Grants ``app_user`` DML privileges on everything it needs.
  5. Stamps the alembic version table at ``head`` so the database is
     consistent for future incremental migrations.

Only run this against a throwaway database (e.g. the CI postgres service),
never against production.

Usage (run from anywhere, DATABASE_URL must target the throwaway DB):

    DATABASE_URL=postgresql://smartbillr@localhost:5432/smartbillr_test \
        python backend/scripts/bootstrap_ci_db.py
"""
from __future__ import annotations

import os
import sys
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Capture the target DB before any import that might call load_dotenv().
_target_url = os.environ.get("DATABASE_URL", "")

# Import every model module so Base.metadata knows about all tables.
# NOTE: app.database calls load_dotenv(override=True); DATABASE_URL is
# deliberately re-set afterwards so we keep pointing at the target DB.
import app.models.business  # noqa: F401
import app.models.business_counters  # noqa: F401
import app.models.billing  # noqa: F401
import app.models.category  # noqa: F401
import app.models.customer  # noqa: F401
import app.models.expense  # noqa: F401
import app.models.payment  # noqa: F401
import app.models.product  # noqa: F401
import app.models.profile  # noqa: F401
import app.models.purchase  # noqa: F401
import app.models.purchase_return  # noqa: F401
import app.models.rbac  # noqa: F401
import app.models.sale  # noqa: F401
import app.models.sale_item  # noqa: F401
import app.models.sales_return  # noqa: F401
import app.models.stock  # noqa: F401
import app.models.super_admin  # noqa: F401
import app.models.supplier  # noqa: F401

os.environ["DATABASE_URL"] = _target_url  # restore target

from sqlalchemy import create_engine, text
from sqlalchemy.schema import DefaultClause
from app.database import Base

# All tenant-scoped tables that carry a business_id column (mirrors the
# _TENANT_TABLES list in the enable_row_level_security migration).
_TENANT_TABLES = [
    "businesses",
    "customers",
    "suppliers",
    "products",
    "categories",
    "stock_movements",
    "low_stock_alerts",
    "purchases",
    "purchase_returns",
    "purchase_return_items",
    "sales",
    "sale_items",
    "sales_returns",
    "payments",
    "expenses",
    "business_counters",
]

# Tables with a BEFORE UPDATE trg_{table}_updated_by trigger (mirrors the
# updated_by migration chain: d6e7f8a9b0c1 + a1b2c3d4e5f8 + b5c6d7e8f9a0 +
# c8d9e0f1a2b3 + c6d7e8f9a0b1).
_UPDATED_BY_TABLES = [
    "categories",
    "expenses",
    "suppliers",
    "payments",
    "sales",
    "purchase_returns",
    "sales_returns",
]

_PROD_HOST_MARKERS = ("supabase", "pooler")


def _guard(url: str) -> None:
    """Refuse to run against anything that looks like a managed/production DB."""
    if not url:
        raise SystemExit("DATABASE_URL is required")
    host = (urlparse(url).hostname or "").lower()
    if any(marker in host for marker in _PROD_HOST_MARKERS):
        raise SystemExit(
            f"Refusing to run against host {host!r} — this script is only for "
            "throwaway CI databases. Point DATABASE_URL at a local test DB."
        )


def _promote_defaults_to_server_defaults() -> None:
    """Give NOT NULL columns real server-side DEFAULTs.

    The models declare most defaults as Python-side ``default=``, so
    ``create_all`` emits no ``DEFAULT`` clause and raw-SQL inserts (e.g. the
    RLS/trigger tests seeding ``businesses``) violate NOT NULL. The migrated
    production schema has server defaults (e.g. ``payment_status`` →
    ``'pending'``, ``is_active`` → ``true``), so mirror that here for literal
    defaults only (callables like ``uuid.uuid4`` are left alone).
    """
    for table in Base.metadata.tables.values():
        for col in table.columns:
            if col.nullable is False and col.server_default is None and not col.primary_key:
                d = col.default
                if d is None or getattr(d, "is_callable", True):
                    continue
                arg = d.arg
                if isinstance(arg, bool):
                    col.server_default = DefaultClause(text("true" if arg else "false"))
                elif isinstance(arg, (int, float)):
                    col.server_default = DefaultClause(text(str(arg)))
                elif isinstance(arg, str):
                    escaped = arg.replace("'", "''")
                    col.server_default = DefaultClause(text(f"'{escaped}'"))


def main() -> None:
    _guard(_target_url)
    engine = create_engine(_target_url)

    print("Creating schema from SQLAlchemy models ...")
    _promote_defaults_to_server_defaults()
    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        print("Enabling Row-Level Security ...")
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
        conn.execute(
            text(
                """
                CREATE OR REPLACE FUNCTION app.current_business_id()
                RETURNS uuid
                LANGUAGE SQL
                STABLE
                AS $$ SELECT NULLIF(current_setting('app.current_business_id', true), '')::uuid; $$
                """
            )
        )
        for table in _TENANT_TABLES:
            conn.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
            conn.execute(text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"))
            conn.execute(
                text(f"DROP POLICY IF EXISTS tenant_access_policy ON {table}")
            )
            conn.execute(
                text(
                    f"CREATE POLICY tenant_access_policy ON {table} FOR ALL "
                    f"USING (business_id = app.current_business_id())"
                )
            )

        # Recreate the fn_set_updated_by trigger function + triggers that the
        # incremental migration chain adds (mirrors d6e7f8a9b0c1, a1b2c3d4e5f8,
        # b5c6d7e8f9a0, c8d9e0f1a2b3, c6d7e8f9a0b1). create_all() cannot emit
        # triggers, so without this the updated_by trigger tests fail in CI.
        print("Creating fn_set_updated_by trigger function ...")
        conn.execute(
            text(
                """
                CREATE OR REPLACE FUNCTION fn_set_updated_by()
                RETURNS TRIGGER
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    NEW.updated_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid;
                    RETURN NEW;
                END;
                $$;
                """
            )
        )
        for table in _UPDATED_BY_TABLES:
            conn.execute(
                text(f"DROP TRIGGER IF EXISTS trg_{table}_updated_by ON {table}")
            )
            conn.execute(
                text(
                    f"""
                    CREATE TRIGGER trg_{table}_updated_by
                        BEFORE UPDATE ON {table}
                        FOR EACH ROW
                        EXECUTE FUNCTION fn_set_updated_by();
                    """
                )
            )

        print("Creating non-superuser app_user role ...")
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
                        CREATE ROLE app_user LOGIN
                            NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
                    END IF;
                END
                $$
                """
            )
        )
        conn.execute(text("GRANT USAGE ON SCHEMA public TO app_user"))
        conn.execute(text("GRANT USAGE ON SCHEMA app TO app_user"))
        conn.execute(
            text(
                "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user"
            )
        )
        conn.execute(
            text(
                "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user"
            )
        )
        conn.execute(
            text(
                "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
                "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user"
            )
        )
        conn.execute(text("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user"))
        conn.execute(text("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_user"))

    # Stamp alembic at head so the version table matches the bootstrapped
    # schema. Best-effort — the tests don't depend on it.
    try:
        from alembic import command as alembic_command
        from alembic.config import Config as AlembicConfig

        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        cfg = AlembicConfig(os.path.join(backend_dir, "alembic.ini"))
        cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
        alembic_command.stamp(cfg, "head")
        print("Stamped alembic version table at head")
    except Exception as exc:  # noqa: BLE001 - stamping is best-effort
        print(f"WARNING: could not stamp alembic version table: {exc}", file=sys.stderr)

    print("Bootstrap complete.")


if __name__ == "__main__":
    main()
