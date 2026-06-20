from decimal import Decimal
from app.utils.tax_engine import calculate_item_tax


def test_cgst_sgst_rounding_odd_tax():
    """CGST + SGST must always equal total_tax, even for odd amounts."""
    # 3 units × ₹10.00/unit = ₹30.00 subtotal
    # 5% tax = ₹1.50 → half = ₹0.75 each → total 0.75+0.75 = 1.50 ✓
    # (happy path — even split)
    result = calculate_item_tax(
        unit_price=Decimal("10.00"),
        quantity=3,
        tax_rate=Decimal("5"),
        business_country_code="IN",
        business_state="karnataka",
        counterparty_country_code="IN",
        counterparty_state="karnataka",
    )
    assert result["cgst_amount"] + result["sgst_amount"] == Decimal("1.50")

    # 1 unit × ₹9.99/unit = ₹9.99 subtotal
    # 5% tax = ₹0.4995 → half = ₹0.24975 each
    # ROUND_DOWN CGST = 0.24, SGST = 0.4995 - 0.24 = 0.2595 → 0.26
    # CGST + SGST = 0.24 + 0.26 = 0.50 = total_tax ✓
    result = calculate_item_tax(
        unit_price=Decimal("9.99"),
        quantity=1,
        tax_rate=Decimal("5"),
        business_country_code="IN",
        business_state="karnataka",
        counterparty_country_code="IN",
        counterparty_state="karnataka",
    )
    total = (Decimal("9.99") * Decimal("5")) / Decimal("100")
    assert result["cgst_amount"] + result["sgst_amount"] == total.quantize(Decimal("0.01"))

    # 1 unit × ₹0.99/unit = ₹0.99 subtotal
    # 18% tax = ₹0.1782 → half = ₹0.0891 each
    # ROUND_DOWN CGST = 0.08, SGST = 0.1782 - 0.08 = 0.0982 → 0.10
    # CGST + SGST = 0.08 + 0.10 = 0.18 = total_tax ✓
    result = calculate_item_tax(
        unit_price=Decimal("0.99"),
        quantity=1,
        tax_rate=Decimal("18"),
        business_country_code="IN",
        business_state="karnataka",
        counterparty_country_code="IN",
        counterparty_state="karnataka",
    )
    total = (Decimal("0.99") * Decimal("18")) / Decimal("100")
    assert result["cgst_amount"] + result["sgst_amount"] == total.quantize(Decimal("0.01"))


def test_igst_rounding():
    """IGST is a single value — no split, just rounded to 2 dp."""
    result = calculate_item_tax(
        unit_price=Decimal("9.99"),
        quantity=1,
        tax_rate=Decimal("5"),
        business_country_code="IN",
        business_state="karnataka",
        counterparty_country_code="US",
        counterparty_state="",
    )
    total = (Decimal("9.99") * Decimal("5")) / Decimal("100")
    assert result["igst_amount"] == total.quantize(Decimal("0.01"))
    assert result["cgst_amount"] == Decimal("0")
    assert result["sgst_amount"] == Decimal("0")


def test_generic_tax_rounding():
    """Non-India business — single generic_tax_total, rounded to 2 dp."""
    result = calculate_item_tax(
        unit_price=Decimal("9.99"),
        quantity=1,
        tax_rate=Decimal("5"),
        business_country_code="US",
        business_state="",
        counterparty_country_code="US",
        counterparty_state="",
    )
    total = (Decimal("9.99") * Decimal("5")) / Decimal("100")
    assert result["generic_tax_total"] == total.quantize(Decimal("0.01"))
    assert result["cgst_amount"] == Decimal("0")
    assert result["sgst_amount"] == Decimal("0")
    assert result["igst_amount"] == Decimal("0")
