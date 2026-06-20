"""
Tests for the fn_set_updated_by trigger — requires PostgreSQL.

These tests verify that the fn_set_updated_by trigger correctly reads the
app.current_user_id session variable and sets updated_by on UPDATE.

Skipped by default. Run against a real PostgreSQL database:

    $env:RUN_UPDATED_BY_TESTS=1
    pytest tests/test_updated_by_trigger.py -v

The database must have all migrations applied (including the
d6e7f8a9b0c1 migration) and must *not* be the production database.
"""
import os
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

pytestmark = pytest.mark.skipif(
    not os.getenv("RUN_UPDATED_BY_TESTS"),
    reason="set RUN_UPDATED_BY_TESTS=1 to run updated_by trigger tests (requires PostgreSQL)",
)


TABLES = ["categories", "expenses", "suppliers"]
TEST_UID = "cf3a5b2c-0a30-4c9e-81ff-4588acf89377"
ALT_UID = "deadbeef-0a30-4c9e-81ff-4588acf89377"
BIZ_ID = "550e8400-e29b-41d4-a716-446655440000"


def _is_postgresql(engine) -> bool:
    return engine.dialect.name == "postgresql"


def _setup_test_row(conn, table: str, pk_column: str, pk_val: str):
    """Insert a minimal row into the given table if it doesn't exist."""
    pk_val_str = str(pk_val)
    if table == "categories":
        conn.execute(
            text("""
                INSERT INTO categories (category_id, business_id, category_name)
                VALUES (:pk, :bid, 'Test Category')
                ON CONFLICT (category_id) DO NOTHING
            """),
            {"pk": pk_val_str, "bid": BIZ_ID},
        )
    elif table == "expenses":
        conn.execute(
            text("""
                INSERT INTO expenses (expense_id, business_id, expense_amount, expense_date)
                VALUES (:pk, :bid, 100.00, CURRENT_DATE)
                ON CONFLICT (expense_id) DO NOTHING
            """),
            {"pk": pk_val_str, "bid": BIZ_ID},
        )
    elif table == "suppliers":
        conn.execute(
            text("""
                INSERT INTO suppliers (supp_id, business_id, supp_name)
                VALUES (:pk, :bid, 'Test Supplier')
                ON CONFLICT (supp_id) DO NOTHING
            """),
            {"pk": pk_val_str, "bid": BIZ_ID},
        )


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


def test_trigger_fires_on_update(pg_engine):
    """Verify trg_{table}_updated_by sets updated_by from app.current_user_id."""
    pk = str(uuid.uuid4())

    with pg_engine.connect() as conn:
        trans = conn.begin()

        # Ensure the trigger function exists
        func_exists = conn.execute(
            text("SELECT 1 FROM pg_proc WHERE proname = 'fn_set_updated_by'")
        ).fetchone()
        assert func_exists is not None, (
            "fn_set_updated_by does not exist — did you forget to run the migration?"
        )

        for table in TABLES:
            pk_col = "category_id" if table == "categories" else ("expense_id" if table == "expenses" else "supp_id")
            name_col = "category_name" if table == "categories" else ("expense_amount" if table == "expenses" else "supp_name")
            update_val = "'Updated Name'" if table != "expenses" else "200.00"

            # Ensure the row exists
            _setup_test_row(conn, table, pk_col, pk)

            # Set the session variable to TEST_UID
            conn.execute(
                text("SET LOCAL app.current_user_id = :uid"),
                {"uid": TEST_UID},
            )

            # Perform the UPDATE
            if table == "expenses":
                conn.execute(
                    text(f"UPDATE {table} SET {name_col} = {update_val} WHERE {pk_col} = :pk"),
                    {"pk": pk},
                )
            else:
                conn.execute(
                    text(f"UPDATE {table} SET {name_col} = {update_val} WHERE {pk_col} = :pk"),
                    {"pk": pk},
                )

            # Verify updated_by was set by the trigger
            row = conn.execute(
                text(f"SELECT updated_by FROM {table} WHERE {pk_col} = :pk"),
                {"pk": pk},
            ).fetchone()

            assert row is not None, f"Row not found in {table}"
            assert row.updated_by is not None, (
                f"updated_by was NULL in {table} — trigger likely didn't fire"
            )
            assert str(row.updated_by) == TEST_UID, (
                f"updated_by in {table} is {row.updated_by}, expected {TEST_UID}"
            )

        trans.rollback()


def test_trigger_updates_to_new_user(pg_engine):
    """Verify updated_by changes when a different user performs the UPDATE."""
    pk = str(uuid.uuid4())

    with pg_engine.connect() as conn:
        trans = conn.begin()

        for table in TABLES:
            pk_col = "category_id" if table == "categories" else ("expense_id" if table == "expenses" else "supp_id")
            name_col = "category_name" if table == "categories" else ("expense_amount" if table == "expenses" else "supp_name")
            update_val = "'Changed Again'" if table != "expenses" else "300.00"

            _setup_test_row(conn, table, pk_col, pk)

            # Set to ALT_UID and update
            conn.execute(
                text("SET LOCAL app.current_user_id = :uid"),
                {"uid": ALT_UID},
            )

            if table == "expenses":
                conn.execute(
                    text(f"UPDATE {table} SET {name_col} = {update_val} WHERE {pk_col} = :pk"),
                    {"pk": pk},
                )
            else:
                conn.execute(
                    text(f"UPDATE {table} SET {name_col} = {update_val} WHERE {pk_col} = :pk"),
                    {"pk": pk},
                )

            row = conn.execute(
                text(f"SELECT updated_by FROM {table} WHERE {pk_col} = :pk"),
                {"pk": pk},
            ).fetchone()

            assert row is not None
            assert str(row.updated_by) == ALT_UID, (
                f"updated_by in {table} is {row.updated_by}, expected {ALT_UID}"
            )

        trans.rollback()


def test_trigger_sets_null_when_guc_unset(pg_engine):
    """Verify updated_by is NULL when app.current_user_id is not set."""
    pk = str(uuid.uuid4())

    with pg_engine.connect() as conn:
        trans = conn.begin()

        for table in TABLES:
            pk_col = "category_id" if table == "categories" else ("expense_id" if table == "expenses" else "supp_id")
            name_col = "category_name" if table == "categories" else ("expense_amount" if table == "expenses" else "supp_name")
            update_val = "'Unset Test'" if table != "expenses" else "400.00"

            _setup_test_row(conn, table, pk_col, pk)

            # Do NOT set app.current_user_id — leave it unset (empty string)
            conn.execute(text("SET LOCAL app.current_user_id = ''"))

            if table == "expenses":
                conn.execute(
                    text(f"UPDATE {table} SET {name_col} = {update_val} WHERE {pk_col} = :pk"),
                    {"pk": pk},
                )
            else:
                conn.execute(
                    text(f"UPDATE {table} SET {name_col} = {update_val} WHERE {pk_col} = :pk"),
                    {"pk": pk},
                )

            row = conn.execute(
                text(f"SELECT updated_by FROM {table} WHERE {pk_col} = :pk"),
                {"pk": pk},
            ).fetchone()

            # NULLIF('', true) returns NULL, so updated_by should be NULL
            assert row.updated_by is None, (
                f"updated_by in {table} should be NULL when GUC is unset, got {row.updated_by}"
            )

        trans.rollback()
