"""
Row-Level Security tests — requires PostgreSQL.

These tests are skipped by default. Run them against a real PostgreSQL
database with RLS enabled:

    $env:RUN_RLS_TESTS=1
    pytest tests/test_rls.py -v

The database must have all migrations applied (including the RLS migration)
and must *not* be the production database.
"""
import os
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

pytestmark = pytest.mark.skipif(
    not os.getenv("RUN_RLS_TESTS"),
    reason="set RUN_RLS_TESTS=1 to run RLS tests (requires PostgreSQL)",
)


def _is_postgresql(engine) -> bool:
    return engine.dialect.name == "postgresql"


def _insert_test_data(session: Session, business_id: str, prefix: str):
    """Insert a product and a customer for the given business."""
    # Seed the parent business row first (idempotent) so the product/customer
    # foreign keys are satisfied. FK checks are not RLS-filtered, but seeding
    # also keeps the schema consistent with a real tenant.
    session.execute(
        text(
            """
            INSERT INTO businesses (business_id, business_name)
            VALUES (:bid, :name)
            ON CONFLICT (business_id) DO NOTHING
            """
        ),
        {"bid": business_id, "name": f"{prefix} Business"},
    )
    session.execute(
        text(
            """
            INSERT INTO products (prod_id, business_id, prod_name, prod_sell_price, prod_cost_price, unit)
            VALUES (:pid, :bid, :name, 10.00, 7.00, 'pc')
            """
        ),
        {
            "pid": uuid.uuid4(),
            "bid": business_id,
            "name": f"{prefix} Product",
        },
    )
    session.execute(
        text(
            """
            INSERT INTO customers (cust_id, business_id, cust_name)
            VALUES (:cid, :bid, :name)
            """
        ),
        {
            "cid": uuid.uuid4(),
            "bid": business_id,
            "name": f"{prefix} Customer",
        },
    )
    session.commit()


def _count_products(session: Session) -> int:
    return session.execute(text("SELECT COUNT(*) FROM products")).scalar()


def _count_customers(session: Session) -> int:
    return session.execute(text("SELECT COUNT(*) FROM customers")).scalar()


# ── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def pg_engine():
    """Create a PostgreSQL engine using DATABASE_URL."""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        pytest.skip("DATABASE_URL not set")
    engine = create_engine(db_url)
    if not _is_postgresql(engine):
        pytest.skip("not a PostgreSQL database")
    yield engine
    engine.dispose()


@pytest.fixture
def clean_db(pg_engine):
    """Remove test data inserted during RLS tests.

    Deletes run under the row-level security policy, so each tenant's rows
    must be removed while the matching ``app.current_business_id`` is set.
    """
    yield
    with pg_engine.connect() as conn:
        trans = conn.begin()
        for tenant in (TestRLS.TENANT_A, TestRLS.TENANT_B):
            conn.execute(
                text("SET LOCAL app.current_business_id = :bid"),
                {"bid": tenant},
            )
            conn.execute(
                text("DELETE FROM products WHERE prod_name LIKE 'RLS_%'")
            )
            conn.execute(
                text("DELETE FROM customers WHERE cust_name LIKE 'RLS_%'")
            )
        trans.commit()


# ── Tests ──────────────────────────────────────────────────────────────────


class TestRLS:
    """Verify RLS isolates data between tenants when app.current_business_id is set."""

    TENANT_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"
    TENANT_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"

    def test_rls_blocks_cross_tenant_access(self, pg_engine, clean_db):
        """Tenant A must not see Tenant B's rows, and vice versa."""
        with pg_engine.connect() as conn_a:
            trans_a = conn_a.begin()
            conn_a.execute(
                text("SET LOCAL app.current_business_id = :bid"),
                {"bid": self.TENANT_A},
            )
            _insert_test_data(
                Session(conn_a), self.TENANT_A, "RLS_TenantA"
            )
            trans_a.commit()

        with pg_engine.connect() as conn_b:
            trans_b = conn_b.begin()
            conn_b.execute(
                text("SET LOCAL app.current_business_id = :bid"),
                {"bid": self.TENANT_B},
            )
            _insert_test_data(
                Session(conn_b), self.TENANT_B, "RLS_TenantB"
            )
            trans_b.commit()

        # Tenant A should only see its own products (1), not B's
        with pg_engine.connect() as conn_a:
            trans_a = conn_a.begin()
            conn_a.execute(
                text("SET LOCAL app.current_business_id = :bid"),
                {"bid": self.TENANT_A},
            )
            session_a = Session(conn_a)
            assert _count_products(session_a) == 1
            assert _count_customers(session_a) == 1
            trans_a.commit()

        # Tenant B should only see its own products (1), not A's
        with pg_engine.connect() as conn_b:
            trans_b = conn_b.begin()
            conn_b.execute(
                text("SET LOCAL app.current_business_id = :bid"),
                {"bid": self.TENANT_B},
            )
            session_b = Session(conn_b)
            assert _count_products(session_b) == 1
            assert _count_customers(session_b) == 1
            trans_b.commit()

    def test_rls_unset_setting_returns_zero_rows(self, pg_engine, clean_db):
        """When app.current_business_id is unset (empty), RLS returns zero rows."""
        with pg_engine.connect() as conn:
            trans = conn.begin()
            conn.execute(
                text("SET LOCAL app.current_business_id = :bid"),
                {"bid": self.TENANT_A},
            )
            _insert_test_data(
                Session(conn), self.TENANT_A, "RLS_Unset"
            )
            trans.commit()

        # Now query without setting app.current_business_id
        with pg_engine.connect() as conn:
            trans = conn.begin()
            conn.execute(
                text("SET LOCAL app.current_business_id = ''")
            )
            session = Session(conn)
            assert _count_products(session) == 0
            assert _count_customers(session) == 0
            trans.commit()

    def test_rls_superuser_bypasses_rls(self, pg_engine, clean_db):
        """A superuser (or table owner) can bypass RLS by not setting the parameter.

        This test verifies that RLS *is* enforced by showing that without
        setting the parameter, the superuser sees nothing (because
        current_setting returns NULL → current_business_id() returns NULL →
        business_id = NULL is never true).
        """
        with pg_engine.connect() as conn:
            trans = conn.begin()
            conn.execute(
                text("SET LOCAL app.current_business_id = :bid"),
                {"bid": self.TENANT_A},
            )
            _insert_test_data(
                Session(conn), self.TENANT_A, "RLS_Super"
            )
            trans.commit()

        # Without any SET LOCAL, the helper returns NULL → no rows visible
        with pg_engine.connect() as conn:
            trans = conn.begin()
            session = Session(conn)
            assert _count_products(session) == 0
            assert _count_customers(session) == 0
            trans.commit()
