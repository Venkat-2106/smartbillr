import os
import re
import uuid
import base64
import time
from datetime import datetime, timedelta

from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("SUPABASE_JWT_SECRET", "dGVzdC1zZWNyZXQ=")  # "test-secret" base64
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text as sa_text, TextClause
from sqlalchemy.orm import Session as SASession, sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.schema import DefaultClause
import sqlalchemy.types as SATypes

# The app under test always runs against the in-memory SQLite engine below,
# regardless of DATABASE_URL (which only feeds the optional PostgreSQL-backed
# RLS tests). Patch the generic Uuid type so UUIDs bind correctly to SQLite.
# Raw-SQL tests against PostgreSQL are unaffected: text() parameters bypass
# the ORM bind processor.
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
# Import every model module so Base.metadata knows about all tables.
# Without this, FK resolution fails (e.g. businesses.current_plan_id -> plans)
# and table creation errors out.
import app.models.profile  # noqa: F401
import app.models.sale
import app.models.payment
import app.models.business
import app.models.business_counters
import app.models.customer
import app.models.rbac
import app.models.super_admin
import app.models.billing
import app.models.category
import app.models.expense
import app.models.product
import app.models.purchase
import app.models.purchase_return
import app.models.sale_item
import app.models.sales_return
import app.models.stock
import app.models.supplier
from app.main import app
from app.database import Base, get_db, get_async_db

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
    _SETCONFIG_RE = re.compile(r"^\s*SELECT\s+set_config\(", re.IGNORECASE)
    _ADVISORY_LOCK_RE = re.compile(r"^\s*SELECT\s+pg_try_advisory_xact_lock\(", re.IGNORECASE)
    _CAST_RE = re.compile(
        r"CAST\s*\(\s*(\:\w+)\s+AS\s+(uuid|timestamptz|timestamp)\s*\)", re.IGNORECASE
    )
    _FORUPDATE_RE = re.compile(r"\bFOR\s+UPDATE\b", re.IGNORECASE)
    _ILIKE_RE = re.compile(r"\bILIKE\b", re.IGNORECASE)
    _STRAGG_RE = re.compile(r"STRING_AGG\s*\(([^,]+),\s*'([^']*)'\)", re.IGNORECASE)

    def execute(self, statement, params=None, *args, **kwargs):
        if isinstance(statement, TextClause):
            sql = statement.text
            stripped = sql.strip()

            # Skip SET LOCAL (PostgreSQL-specific session variables)
            if self._SET_RE.fullmatch(stripped):
                return

            # Skip SELECT set_config(...) — PostgreSQL-only GUC helper used
            # by the async auth/RLS path (asyncpg cannot use SET with binds).
            if self._SETCONFIG_RE.match(stripped):
                return

            # pg_try_advisory_xact_lock is PostgreSQL-only; treat as acquired.
            if self._ADVISORY_LOCK_RE.match(stripped):
                return _FakeScalarResult(True)

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


class _FakeScalarResult:
    """Minimal stand-in for a Result when the statement was translated to a no-op."""

    rowcount = 1

    def __init__(self, value):
        self._value = value

    def scalar(self):
        return self._value

    def fetchone(self):
        return None

    def fetchall(self):
        return []

    def rows(self):
        return []


TestingSessionLocal = sessionmaker(class_=SQLiteCompatSession, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


class AsyncCompatSession:
    """Minimal async facade over a sync SQLiteCompatSession.

    Enables async dependencies (get_async_db) and verify_token to run against
    the same in-memory SQLite engine as the sync test sessions. Route handlers
    and middleware `await db.execute(...)` — the facade delegates to the sync
    session's execute() and returns the real Result object.
    """

    def __init__(self, sync_session):
        self._sync = sync_session

    async def execute(self, *args, **kwargs):
        return self._sync.execute(*args, **kwargs)

    async def commit(self):
        self._sync.commit()

    async def rollback(self):
        self._sync.rollback()

    async def close(self):
        self._sync.close()

    def __getattr__(self, name):
        return getattr(self._sync, name)


async def override_get_async_db():
    s = AsyncCompatSession(TestingSessionLocal())
    try:
        yield s
    finally:
        await s.close()


app.dependency_overrides[get_async_db] = override_get_async_db


@pytest.fixture(autouse=True)
def _clear_rate_limit_caches():
    """Reset the in-process rate-limit buckets before every test.

    All TestClient requests share the same "testclient" IP, so the real
    rate limiter (e.g. 5 req/min on /v1/business) would otherwise trip
    mid-suite purely because tests run back-to-back.
    """
    from app.middleware.ratelimit import (
        _ip_auth_cache, _user_admin_cache, _user_api_cache, _ip_api_cache,
    )
    _ip_auth_cache.clear()
    _user_admin_cache.clear()
    _user_api_cache.clear()
    _ip_api_cache.clear()
    yield


# ── Patch PostgreSQL server_defaults before table creation ───────────────
def _patch_server_defaults():
    for table in Base.metadata.tables.values():
        for col in table.columns:
            sd = col.server_default
            if sd is not None and hasattr(sd, "arg") and hasattr(sd.arg, "text"):
                t = sd.arg.text.strip()
                if t == "now()":
                    # SQLite requires DEFAULT (expr) to be parenthesised.
                    col.server_default = DefaultClause(sa_text("(datetime('now'))"))
                elif t.lower() == "true":
                    col.server_default = DefaultClause(sa_text("1"))
                elif t.lower() == "false":
                    col.server_default = DefaultClause(sa_text("0"))


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
#
# decode_token_payload() (app/middleware/auth.py) now requires RS256/ES256
# JWKS verification and rejects HS256 tokens (missing kid header).  Tests
# therefore mint RS256 tokens signed with a local test key and stub the
# JWKS endpoint via the `mock_jwks` fixture so the real decode path runs
# end-to-end without a network call.
_TEST_RSA_PRIVATE = rsa.generate_private_key(public_exponent=65537, key_size=2048)
TEST_RSA_PRIVATE_KEY_PEM = _TEST_RSA_PRIVATE.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.TraditionalOpenSSL,
    serialization.NoEncryption(),
)
TEST_RSA_PUBLIC_KEY_PEM = _TEST_RSA_PRIVATE.public_key().public_bytes(
    serialization.Encoding.PEM,
    serialization.PublicFormat.SubjectPublicKeyInfo,
)
TEST_JWKS_KID = "test-jwks-key"


def generate_token(sub: str, email: str = "test@example.com", expired: bool = False) -> str:
    import jwt as pyjwt
    now = time.time()
    payload = {
        "sub": sub,
        "email": email,
        "iat": int(now - 60),
        "exp": int(now - 10) if expired else int(now + 3600),
    }
    return pyjwt.encode(
        payload,
        TEST_RSA_PRIVATE_KEY_PEM,
        algorithm="RS256",
        headers={"kid": TEST_JWKS_KID},
    )


class _FakeSigningKey:
    def __init__(self, kid: str, key: str):
        self.kid = kid
        self.key = key


class _FakeJWKSClient:
    """Stub for PyJWKClient that resolves every token to the test public key."""

    def __init__(self, public_key_pem: str):
        self._public_key = public_key_pem

    def get_signing_key_from_jwt(self, token):
        return _FakeSigningKey(TEST_JWKS_KID, self._public_key)


@pytest.fixture
def mock_jwks(monkeypatch):
    """Point decode_token_payload at the local test JWKS (no network)."""
    from app.middleware import auth as auth_module

    client = _FakeJWKSClient(TEST_RSA_PUBLIC_KEY_PEM)
    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: client)
    return client


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

    # Clear in-memory auth/subscription caches so prior tests can't leak
    # stale entries (permissions, business suspension, logout) across tests.
    from app.middleware.auth import _permissions_cache, _business_users_index
    if _permissions_cache is not None:
        _permissions_cache.clear()
    _business_users_index.clear()
    from app.middleware.subscription import _subscription_cache, _user_business_cache, _sub_biz_index
    if _subscription_cache is not None:
        _subscription_cache.clear()
    _user_business_cache.clear()
    _sub_biz_index.clear()

    bid = "550e8400-e29b-41d4-a716-446655440000"
    uid_active = "cf3a5b2c-0a30-4c9e-81ff-4588acf89377"
    uid_inactive = "deadbeef-0a30-4c9e-81ff-4588acf89377"
    role_id = 1

    _now = datetime.now()
    trial_start = _now - timedelta(days=1)
    trial_end = _now + timedelta(days=29)

    # Business
    db.execute(
        sa_text("""
            INSERT INTO businesses (
                business_id, business_name,
                payment_status, subscription_type,
                trial_start_at, trial_end_at, is_active, auto_renew
            ) VALUES (
                :bid, :name,
                'pending', 'trial',
                :trial_start, :trial_end, 1, 1
            )
        """),
        {
            "bid": bid,
            "name": "Test Business",
            "trial_start": trial_start,
            "trial_end": trial_end,
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
