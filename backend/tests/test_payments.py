"""Payment API integration tests.

Tests the POST /v1/payments/ endpoint:
  - Successful payment recording
  - Overpayment rejection (payment > remaining balance)
  - Already-paid rejection (sale is fully paid)
  - Payment history retrieval (GET /v1/payments/sale/{id})

Dependencies required by the endpoint are mocked:
  - verify_token   → mock_auth fixture (bypasses real JWT + profile lookup)
  - get_db         → conftest override (SQLite in-memory)
  - record_payment_and_sync → SQLite-compatible patch
"""

from decimal import Decimal
import uuid
from unittest.mock import patch

import pytest
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session


# ── SQLite-compatible version of record_payment_and_sync ─────────────────────

def _sqlite_record_payment_and_sync(
    db, business_id, sale_id, sale_final,
    payment_amount, payment_method, new_status, cumulative_paid,
):
    # SQLite cannot bind Decimal natively; convert to float for the mock.
    sale_final = float(sale_final)
    payment_amount = float(payment_amount)
    cumulative_paid = float(cumulative_paid)
    new_payment_id = str(uuid.uuid4())

    # Deactivate existing active rows for this sale
    db.execute(
        sa_text("""
            UPDATE payments
            SET is_active = 0
            WHERE sale_id = :sale_id
              AND business_id = :bid
              AND is_active = 1
        """),
        {"sale_id": sale_id, "bid": business_id},
    )

    # Insert new payment row
    db.execute(
        sa_text("""
            INSERT INTO payments (
                payment_id, business_id, sale_id,
                payment_amount, payment_method,
                payment_status, is_active,
                cumulative_paid
            ) VALUES (
                :payment_id, :business_id, :sale_id,
                :payment_amount, :payment_method,
                :payment_status, 1,
                :cumulative_paid
            )
        """),
        {
            "payment_id": new_payment_id,
            "business_id": business_id,
            "sale_id": sale_id,
            "payment_amount": payment_amount,
            "payment_method": payment_method,
            "payment_status": new_status,
            "cumulative_paid": cumulative_paid,
        },
    )

    # Mirror status to sales table
    db.execute(
        sa_text("""
            UPDATE sales
            SET sales_payment_status = :status
            WHERE sales_id = :sid
              AND business_id = :bid
        """),
        {"status": new_status, "sid": sale_id, "bid": business_id},
    )

    return new_payment_id


# ── Helpers ──────────────────────────────────────────────────────────────────

def seed_sale(db: Session, business_id: uuid.UUID, final_amount: float = 1000.0):
    """Create a sale row and return its id."""
    sale_id = uuid.uuid4()
    db.execute(
        sa_text("""
            INSERT INTO sales (sales_id, business_id, invoice_no,
                               sales_total_amount, sales_discount,
                               cgst_total, sgst_total, igst_total,
                               tax_total, sales_final_amount,
                               sales_payment_status, is_deleted)
            VALUES (:sid, :bid, :inv, :total, 0, 0, 0, 0, 0, :final,
                    'unpaid', 0)
        """),
        {
            "sid": str(sale_id),
            "bid": str(business_id),
            "inv": f"INV-{sale_id}",
            "total": final_amount,
            "final": final_amount,
        },
    )
    db.commit()
    return sale_id


# ── Tests ────────────────────────────────────────────────────────────────────

class TestCreatePayment:
    """POST /v1/payments/"""

    @pytest.fixture(autouse=True)
    def _setup(self, mock_auth, db, seed_data):
        self.business_id = seed_data["business_id"]
        self.db = db

    def _patch_record_payment(self):
        return patch(
            "app.routers.payment.record_payment_and_sync",
            _sqlite_record_payment_and_sync,
        )

    def test_successful_payment_returns_201(self, client):
        """A valid payment against a sale records correctly."""
        sale_id = seed_sale(self.db, self.business_id, final_amount=1000.0)

        with self._patch_record_payment():
            resp = client.post(
                "/v1/payments/",
                json={
                    "sale_id": str(sale_id),
                    "payment_amount": 500.0,
                    "payment_method": "cash",
                },
            )

        assert resp.status_code == 201
        body = resp.json()
        assert body["message"] == "Payment recorded successfully"
        assert body["payment_status"] == "partial"
        assert body["this_payment"] == 500.0
        assert body["total_paid"] == 500.0
        assert body["remaining_balance"] == 500.0

        # Verify the payment row exists
        row = self.db.execute(
            sa_text(
                "SELECT payment_id FROM payments WHERE sale_id = :sid"
            ),
            {"sid": str(sale_id)},
        ).fetchone()
        assert row is not None

        # Sale status should have been mirrored
        sale_status = self.db.execute(
            sa_text(
                "SELECT sales_payment_status FROM sales WHERE sales_id = :sid"
            ),
            {"sid": str(sale_id)},
        ).scalar()
        assert sale_status == "partial"

    def test_overpayment_rejected(self, client):
        """Payment exceeding the remaining balance is blocked."""
        sale_id = seed_sale(self.db, self.business_id, final_amount=1000.0)

        # Simulate 500 already paid by inserting an active payment row
        payment_id = uuid.uuid4()
        self.db.execute(
            sa_text("""
                INSERT INTO payments (payment_id, business_id, sale_id,
                                      payment_amount, cumulative_paid,
                                      payment_method, payment_status,
                                      is_active)
                VALUES (:pid, :bid, :sid, 500, 500, 'cash', 'partial', 1)
            """),
            {
                "pid": str(payment_id),
                "bid": str(self.business_id),
                "sid": str(sale_id),
            },
        )
        self.db.commit()

        # Try paying 600 more (remaining balance is 500)
        with patch(
            "app.routers.payment.record_payment_and_sync",
            _sqlite_record_payment_and_sync,
        ):
            resp = client.post(
                "/v1/payments/",
                json={
                    "sale_id": str(sale_id),
                    "payment_amount": 600.0,
                    "payment_method": "cash",
                },
            )

        assert resp.status_code == 400
        body = resp.json()
        assert "exceeds the remaining balance" in body.get("message", "").lower()

    def test_already_paid_rejected(self, client):
        """Payment for a fully paid sale is blocked."""
        sale_id = seed_sale(self.db, self.business_id, final_amount=1000.0)

        # Simulate full payment
        payment_id = uuid.uuid4()
        self.db.execute(
            sa_text("""
                INSERT INTO payments (payment_id, business_id, sale_id,
                                      payment_amount, cumulative_paid,
                                      payment_method, payment_status,
                                      is_active)
                VALUES (:pid, :bid, :sid, 1000, 1000, 'cash', 'paid', 1)
            """),
            {
                "pid": str(payment_id),
                "bid": str(self.business_id),
                "sid": str(sale_id),
            },
        )
        self.db.commit()

        with patch(
            "app.routers.payment.record_payment_and_sync",
            _sqlite_record_payment_and_sync,
        ):
            resp = client.post(
                "/v1/payments/",
                json={
                    "sale_id": str(sale_id),
                    "payment_amount": 100.0,
                    "payment_method": "cash",
                },
            )

        assert resp.status_code == 400
        body = resp.json()
        assert "already fully paid" in body.get("message", "").lower()

    def test_sale_not_found_returns_404(self, client):
        """Payment for a non-existent sale is rejected."""
        fake_sale_id = uuid.uuid4()

        with self._patch_record_payment():
            resp = client.post(
                "/v1/payments/",
                json={
                    "sale_id": str(fake_sale_id),
                    "payment_amount": 100.0,
                    "payment_method": "cash",
                },
            )

        assert resp.status_code == 404
        body = resp.json()
        assert "not found" in body.get("message", "").lower()


class TestGetPaymentsBySale:
    """GET /v1/payments/sale/{sale_id}"""

    @pytest.fixture(autouse=True)
    def _setup(self, mock_auth, db, seed_data):
        self.business_id = seed_data["business_id"]
        self.db = db

    def test_returns_payment_history(self, client):
        """Returns all payment rows for a sale."""
        sale_id = seed_sale(self.db, self.business_id, final_amount=1000.0)

        # Insert two payments
        for i, amt in enumerate([400.0, 600.0]):
            self.db.execute(
                sa_text("""
                    INSERT INTO payments (payment_id, business_id, sale_id,
                                          payment_amount, cumulative_paid,
                                          payment_method, payment_status,
                                          is_active, payment_paid_at)
                    VALUES (:pid, :bid, :sid, :amt, :cum, 'cash',
                            :status, :active, datetime('now', :offset))
                """),
                {
                    "pid": str(uuid.uuid4()),
                    "bid": str(self.business_id),
                    "sid": str(sale_id),
                    "amt": amt,
                    "cum": 400.0 + amt if i == 1 else amt,
                    "status": "paid" if i == 1 else "partial",
                    "active": 1 if i == 1 else 0,
                    "offset": f"+{i} minutes",
                },
            )
        self.db.commit()

        resp = client.get(f"/v1/payments/sale/{sale_id}")

        assert resp.status_code == 200
        body = resp.json()
        assert body["sale_id"] == str(sale_id)
        assert body["total_paid"] == 1000.0
        assert body["current_status"] == "paid"
        assert len(body["payment_history"]) == 2

    def test_sale_not_found_returns_404(self, client):
        """History for a non-existent sale is rejected."""
        fake_id = uuid.uuid4()
        resp = client.get(f"/v1/payments/sale/{fake_id}")
        assert resp.status_code == 404


class TestCalculatePaymentStatus:
    """Pure unit tests for calculate_payment_status() — no DB, no mocks."""

    def test_pending_when_total_paid_zero(self):
        """total_paid == 0 → pending."""
        from app.utils.payment_helpers import calculate_payment_status
        assert calculate_payment_status(Decimal("0"), Decimal("100")) == "pending"

    def test_pending_when_total_paid_negative(self):
        """total_paid < 0 → pending."""
        from app.utils.payment_helpers import calculate_payment_status
        assert calculate_payment_status(Decimal("-10"), Decimal("100")) == "pending"

    def test_partial_when_total_paid_between_zero_and_final(self):
        """0 < total_paid < sale_final → partial."""
        from app.utils.payment_helpers import calculate_payment_status
        assert calculate_payment_status(Decimal("50"), Decimal("100")) == "partial"

    def test_paid_when_total_paid_equals_final(self):
        """total_paid == sale_final → paid."""
        from app.utils.payment_helpers import calculate_payment_status
        assert calculate_payment_status(Decimal("100"), Decimal("100")) == "paid"

    def test_paid_when_total_paid_exceeds_final(self):
        """total_paid > sale_final → paid (overpayment treated as paid)."""
        from app.utils.payment_helpers import calculate_payment_status
        assert calculate_payment_status(Decimal("150"), Decimal("100")) == "paid"
