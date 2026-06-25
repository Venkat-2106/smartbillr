import os
import re
import uuid
import base64
import time
from datetime import datetime

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("SUPABASE_JWT_SECRET", "dGVzdC1zZWNyZXQ=")  # "test-secret" base64

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text as sa_text, TextClause
from sqlalchemy.orm import Session as SASession, sessionmaker
from sqlalchemy.pool import StaticPool
import sqlalchemy.types as SATypes

# Patch postgresql.UUID bind_processor to output str() (hyphenated) instead
# of .hex (no hyphens).  The app passes string UUIDs with hyphens everywhere,
# so the DB must store them in the same format for WHERE comparisons to match.
_orig_uuid_bind = SATypes.Uuid.bind_processor

def _patched_uuid_bind(self, dialect):
    process = _orig_uuid_bind(self, dialect)
    if self.as_uuid:
        def _wrapped(value):
            if value is not None:
                if isinstance(value, uuid.UUID):
                    return str(value)
                try:
                    return str(uuid.UUID(str(value)))
                except (ValueError, AttributeError):
                    return str(value)
            return None
        return _wrapped
    return process

SATypes.Uuid.bind_processor = _patched_uuid_bind
import app.models.profile   # ensure Profile is in Base.metadata.tables
import app.models.sale
import app.models.payment
import app.models.business
import app.models.business_counters
import app.models.customer
import app.models.rbac
import app.models.super_admin
from app.main import app
from app.database import Base, get_db

# ── SQLite engine (in-memory, shared across all sessions via StaticPool) ──
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=OFF")
    cursor.close()


# ── Session that translates PostgreSQL-specific SQL to SQLite ────────────
class SQLiteCompatSession(SASession):
    """Translates PostgreSQL SQL syntax to SQLite at execution time."""

    _SET_RE = re.compile(r"SET\s+(LOCAL\s+)?[\w.]+\s*=\s*:\w+", re.IGNORECASE)
    _CAST_RE = re.compile(
        r"CAST\s*\(\s*(\:\w+)\s+AS\s+(uuid|timestamptz|timestamp)\s*\)", re.IGNORECASE
    )
    _FORUPDATE_RE = re.compile(r"\bFOR\s+UPDATE\b", re.IGNORECASE)
    _ILIKE_RE = re.compile(r"\bILIKE\b", re.IGNORECASE)
    _STRAGG_RE = re.compile(r"STRING_AGG\s*\(([^,]+),\s*'([^']*)'\)", re.IGNORECASE)

    def execute(self, statement, params=None, *args, **kwargs):
        if isinstance(statement, TextClause):
            sql = statement.text

            # Skip SET LOCAL (PostgreSQL-specific session variables)
            if self._SET_RE.fullmatch(sql.strip()):
                return

            # STRING_AGG → GROUP_CONCAT
            sql = self._STRAGG_RE.sub(r"GROUP_CONCAT(\1, '\2')", sql)
            # CAST(:param AS uuid|timestamptz|timestamp) → :param
            sql = self._CAST_RE.sub(r"\1", sql)
            # FOR UPDATE → no-op
            sql = self._FORUPDATE_RE.sub("", sql)
            # ILIKE → LIKE (case-insensitive in SQLite via LIKE)
            sql = self._ILIKE_RE.sub("LIKE", sql)

            statement = sa_text(sql)

        return super().execute(statement, params, *args, **kwargs)


TestingSessionLocal = sessionmaker(class_=SQLiteCompatSession, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


# ── Patch PostgreSQL server_defaults before table creation ───────────────
def _patch_server_defaults():
    for table in Base.metadata.tables.values():
        for col in table.columns:
            sd = col.server_default
            if sd is not None and hasattr(sd, "arg") and hasattr(sd.arg, "text"):
                t = sd.arg.text.strip()
                if t == "now()":
                    col.server_default = sa_text("datetime('now')")
                elif t.lower() == "true":
                    col.server_default = sa_text("1")
                elif t.lower() == "false":
                    col.server_default = sa_text("0")


TEST_TABLES = [
    "businesses", "business_counters",
    "roles", "permissions", "role_permissions",
    "profiles", "customers", "sales", "payments",
    "super_admins",
]

# Materialized view table definitions (created as regular tables in SQLite)
MV_TABLES = {
    "mv_dashboard_summary": """
        CREATE TABLE IF NOT EXISTS mv_dashboard_summary (
            business_id           TEXT PRIMARY KEY,
            total_invoices        INTEGER DEFAULT 0,
            pending_payments      INTEGER DEFAULT 0,
            partial_count         INTEGER DEFAULT 0,
            pending_count         INTEGER DEFAULT 0,
            paid_count            INTEGER DEFAULT 0,
            total_revenue         REAL    DEFAULT 0,
            total_tax_collected   REAL    DEFAULT 0,
            total_cgst            REAL    DEFAULT 0,
            total_sgst            REAL    DEFAULT 0,
            total_igst            REAL    DEFAULT 0,
            outstanding_receivables REAL  DEFAULT 0,
            total_purchases       INTEGER DEFAULT 0,
            total_purchase_amount REAL    DEFAULT 0,
            total_purchase_discount REAL  DEFAULT 0,
            total_purchase_tax    REAL    DEFAULT 0,
            gross_profit          REAL    DEFAULT 0,
            total_collected       REAL    DEFAULT 0,
            total_expenses        REAL    DEFAULT 0,
            total_customers       INTEGER DEFAULT 0,
            total_products        INTEGER DEFAULT 0,
            total_suppliers       INTEGER DEFAULT 0,
            low_stock_alerts      INTEGER DEFAULT 0,
            inventory_value       REAL    DEFAULT 0
        )
    """,
    "mv_sales_trend_monthly": """
        CREATE TABLE IF NOT EXISTS mv_sales_trend_monthly (
            business_id   TEXT,
            year_month    TEXT,
            invoice_count INTEGER DEFAULT 0,
            revenue       REAL    DEFAULT 0,
            PRIMARY KEY (business_id, year_month)
        )
    """,
}


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Create only needed tables once per session."""
    _patch_server_defaults()
    for name in TEST_TABLES:
        if name in Base.metadata.tables:
            Base.metadata.tables[name].create(bind=engine, checkfirst=True)
    # Create materialized view tables as regular tables for test compatibility
    with engine.connect() as conn:
        for ddl in MV_TABLES.values():
            conn.execute(sa_text(ddl))
        conn.commit()
    yield
    with engine.connect() as conn:
        for name in reversed(list(MV_TABLES.keys())):
            conn.execute(sa_text(f"DROP TABLE IF EXISTS {name}"))
        conn.commit()
    for name in reversed(TEST_TABLES):
        if name in Base.metadata.tables:
            Base.metadata.tables[name].drop(bind=engine, checkfirst=True)


# ── Token generation helper ──────────────────────────────────────────────

def generate_token(sub: str, email: str = "test@example.com", expired: bool = False) -> str:
    import jwt as pyjwt
    now = time.time()
    payload = {
        "sub": sub,
        "email": email,
        "iat": int(now - 60),
        "exp": int(now - 10) if expired else int(now + 3600),
    }
    secret = base64.b64decode(os.environ["SUPABASE_JWT_SECRET"])
    return pyjwt.encode(payload, secret, algorithm="HS256")


# ── Seed data fixture ────────────────────────────────────────────────────

@pytest.fixture
def db():
    s = TestingSessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def seed_data(db):
    """Insert baseline reference data (business, counters, role, permissions).

    Uses raw SQL to bypass ORM UUID type-conversion issues with SQLite
    (the ORM's postgresql.UUID bind_processor stores hex without hyphens,
     but the application queries with hyphenated strings — raw SQL keeps
     them consistent).

    Clears test tables first so each test starts with a clean slate.
    """
    for name in reversed(TEST_TABLES):
        db.execute(Base.metadata.tables[name].delete())
    db.commit()

    bid = "550e8400-e29b-41d4-a716-446655440000"
    uid_active = "cf3a5b2c-0a30-4c9e-81ff-4588acf89377"
    uid_inactive = "deadbeef-0a30-4c9e-81ff-4588acf89377"
    role_id = 1

    # Business
    db.execute(
        sa_text("""
            INSERT INTO businesses (
                business_id, business_name,
                payment_status, subscription_type,
                trial_start_at, trial_end_at, is_active
            ) VALUES (
                :bid, :name,
                'pending', 'trial',
                :trial_start, :trial_end, 1
            )
        """),
        {
            "bid": bid,
            "name": "Test Business",
            "trial_start": datetime(2026, 6, 1, 0, 0, 0),
            "trial_end": datetime(2026, 7, 1, 0, 0, 0),
        },
    )
    db.execute(
        sa_text("INSERT INTO business_counters (business_id, invoice_counter) VALUES (:bid, 1)"),
        {"bid": bid},
    )

    # Roles
    db.execute(
        sa_text("INSERT INTO roles (id, name, description) VALUES (:id, 'admin', 'Administrator')"),
        {"id": role_id},
    )

    # Permissions
    db.execute(
        sa_text("INSERT INTO permissions (id, code, description) VALUES (1, 'payments.manage', 'Manage payments')"),
    )
    db.execute(
        sa_text("INSERT INTO permissions (id, code, description) VALUES (2, 'sales.delete', 'Delete sales')"),
    )

    # Role-permission mappings
    db.execute(
        sa_text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, 1)"),
        {"rid": role_id},
    )
    db.execute(
        sa_text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, 2)"),
        {"rid": role_id},
    )

    # Profiles
    db.execute(
        sa_text("""
            INSERT INTO profiles (id, business_id, full_name, email, role, is_active)
            VALUES (:uid, :bid, 'Active User', 'active@example.com', 'admin', 1)
        """),
        {"uid": uid_active, "bid": bid},
    )
    db.execute(
        sa_text("""
            INSERT INTO profiles (id, business_id, full_name, email, role, is_active)
            VALUES (:uid, :bid, 'Inactive User', 'inactive@example.com', 'staff', 0)
        """),
        {"uid": uid_inactive, "bid": bid},
    )

    # Seed materialized view data (mirrors the live data state above)
    for mv_name in list(MV_TABLES.keys()):
        db.execute(sa_text(f"DELETE FROM {mv_name}"))
    db.execute(
        sa_text("""
            INSERT OR REPLACE INTO mv_dashboard_summary
                (business_id, total_invoices, total_revenue, total_expenses,
                 total_customers, total_products, total_suppliers,
                 low_stock_alerts, inventory_value)
            VALUES (:bid, 0, 0, 0, 0, 0, 0, 0, 0)
        """),
        {"bid": bid},
    )

    # Super admin for platform-level management tests
    admin_uid = "00000000-0000-4000-a000-000000000001"
    db.execute(
        sa_text("""
            INSERT INTO super_admins (user_id)
            VALUES (:uid)
        """),
        {"uid": admin_uid},
    )
    db.execute(
        sa_text("""
            INSERT INTO profiles (id, business_id, full_name, email, role, is_active)
            VALUES (:uid, :bid, 'Super Admin', 'admin@example.com', 'super_admin', 1)
        """),
        {"uid": admin_uid, "bid": bid},
    )

    db.commit()

    return {
        "business_id": uuid.UUID(bid),
        "active_user_id": uuid.UUID(uid_active),
        "inactive_user_id": uuid.UUID(uid_inactive),
        "role_id": role_id,
    }


# ── Test client ──────────────────────────────────────────────────────────

@pytest.fixture
def client():
    return TestClient(app)


# ── Mock auth for payment tests ──────────────────────────────────────────

@pytest.fixture
def mock_auth(seed_data):
    """Override verify_token to skip real token validation (for payment tests)."""
    from app.middleware.auth import verify_token

    bid = str(seed_data["business_id"])
    uid = str(seed_data["active_user_id"])

    async def _dummy():
        return {
            "user_id": uid,
            "business_id": bid,
            "role": "admin",
            "permissions": {"payments.manage", "sales.delete"},
        }

    app.dependency_overrides[verify_token] = _dummy
    yield
    app.dependency_overrides.pop(verify_token, None)
