"""Unit tests for pure functions in sale_service.py.

Tests discrete conversion/calculation helpers that don't depend on
a database session — calculate_total_amount() and parse_sale_error().
"""

from decimal import Decimal
from collections import namedtuple

from app.services.sale_service import calculate_total_amount, parse_sale_error


# ── Helpers ───────────────────────────────────────────────────────────────────

Item = namedtuple("Item", ["sale_item_unit_price", "sale_item_quantity"])


# ── calculate_total_amount() ──────────────────────────────────────────────────

class TestCalculateTotalAmount:
    """Pure function: unit_price × quantity summed across items."""

    def test_empty_items_returns_zero(self):
        assert calculate_total_amount([]) == Decimal("0")

    def test_single_item(self):
        items = [Item(Decimal("10.00"), 3)]
        assert calculate_total_amount(items) == Decimal("30.00")

    def test_multiple_items(self):
        items = [
            Item(Decimal("10.00"), 3),
            Item(Decimal("25.50"), 2),
        ]
        assert calculate_total_amount(items) == Decimal("81.00")

    def test_items_with_large_quantities(self):
        items = [Item(Decimal("1.99"), 100)]
        assert calculate_total_amount(items) == Decimal("199.00")

    def test_zero_price_item(self):
        items = [Item(Decimal("0"), 5)]
        assert calculate_total_amount(items) == Decimal("0")

    def test_zero_quantity_item(self):
        items = [Item(Decimal("10.00"), 0)]
        assert calculate_total_amount(items) == Decimal("0")


# ── parse_sale_error() ────────────────────────────────────────────────────────

class TestParseSaleError:
    """Pure function: extract user-facing error from backend exception text."""

    def test_insufficient_stock_exact_message(self):
        """Just 'Insufficient stock' with no details → falls back to generic message."""
        msg = "Insufficient stock"
        assert parse_sale_error(msg) == "Insufficient stock for one or more items"

    def test_insufficient_stock_with_details(self):
        """Extra detail after 'Insufficient stock' is captured up to first \"."""
        msg = 'Insufficient stock for "Widget A" — only 3 available'
        result = parse_sale_error(msg)
        assert result == "Insufficient stock for"
        assert '"' not in result

    def test_insufficient_stock_stops_at_newline(self):
        """Extraction stops at the first newline."""
        msg = "Insufficient stock for Widget A\nSome other error"
        result = parse_sale_error(msg)
        assert result == "Insufficient stock for Widget A"
        assert "\n" not in result

    def test_insufficient_stock_stops_at_double_quote(self):
        """Extraction stops before the first double quote."""
        msg = 'Insufficient stock for "Widget A" is the issue'
        result = parse_sale_error(msg)
        assert result == "Insufficient stock for"
        assert '"' not in result

    def test_insufficient_stock_stops_at_backslash(self):
        """Extraction stops before the first backslash."""
        msg = "Insufficient stock for Widget \\ A"
        result = parse_sale_error(msg)
        assert result == "Insufficient stock for Widget"
        assert "\\" not in result

    def test_generic_error_message(self):
        """Non-stock error → generic fallback."""
        msg = "Connection timeout"
        assert parse_sale_error(msg) == "An unexpected error occurred. Please try again."

    def test_empty_error_message(self):
        """Empty string → generic fallback."""
        assert parse_sale_error("") == "An unexpected error occurred. Please try again."
