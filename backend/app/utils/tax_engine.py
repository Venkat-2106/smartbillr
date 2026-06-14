# app/utils/tax_engine.py
#
# ─────────────────────────────────────────────────────────────────────────────
# SMARTBILLR GLOBAL TAX DETERMINATION ENGINE
# ─────────────────────────────────────────────────────────────────────────────
#
# Single source of truth for all Python-side tax calculations.
# The DB trigger (fn_sale_stock_movement) handles Sales tax in the database.
# Everything else — Purchases, future Quotations, Proforma Invoices, etc. —
# uses this module.
#
# TAX DETERMINATION RULES
# ───────────────────────
# Step 1: business_country != "IN"  → generic tax only (no CGST/SGST/IGST)
#
# Step 2: Business is India → apply GST rules:
#   Rule 1: counterparty_country explicitly non-India → IGST (cross-border)
#   Rule 2: counterparty country is India + state blank → CGST + SGST (default)
#   Rule 3: counterparty country is India + same state  → CGST + SGST (intrastate)
#   Rule 4: counterparty country is India + diff state  → IGST (interstate)
#
# EXTENSIBILITY
# ─────────────
# To add a new country tax engine (e.g. US nexus-based Sales Tax):
#   1. Add a function: calculate_us_sales_tax(...)
#   2. Add a dispatch branch in _determine_tax_type()
#   3. Nothing in the India path changes.
# ─────────────────────────────────────────────────────────────────────────────

from decimal import Decimal
from typing import Optional


def calculate_item_tax(
    unit_price:                Decimal,
    quantity:                  int,
    tax_rate:                  Decimal,
    business_country_code:     str,
    business_state:            str,
    counterparty_country_code: Optional[str],
    counterparty_state:        Optional[str],
) -> dict:
    """
    Calculate tax breakdown for a single line item.

    counterparty = customer (for Sales) or supplier (for Purchases).

    Returns:
        subtotal             — unit_price × quantity
        cgst_amount          — India intrastate CGST portion
        sgst_amount          — India intrastate SGST portion
        igst_amount          — India interstate / cross-border IGST
        generic_tax_total    — tax for non-India businesses (stored as tax_total)
        item_tax_total       — total tax (cgst+sgst+igst OR generic)
        item_total_with_tax  — subtotal + item_tax_total
        tax_type             — "cgst_sgst" | "igst" | "generic"
    """
    subtotal  = unit_price * quantity
    total_tax = (subtotal * tax_rate) / Decimal("100")

    tax_type = _determine_tax_type(
        business_country_code     = (business_country_code or "").strip().upper(),
        business_state            = (business_state or "").strip().lower(),
        counterparty_country_code = (counterparty_country_code or "").strip().upper(),
        counterparty_state        = (counterparty_state or "").strip().lower(),
    )

    cgst        = Decimal("0")
    sgst        = Decimal("0")
    igst        = Decimal("0")
    generic_tax = Decimal("0")

    if tax_type == "cgst_sgst":
        cgst = (total_tax / Decimal("2")).quantize(Decimal("0.01"))
        sgst = (total_tax / Decimal("2")).quantize(Decimal("0.01"))
    elif tax_type == "igst":
        igst = total_tax.quantize(Decimal("0.01"))
    else:
        generic_tax = total_tax.quantize(Decimal("0.01"))

    item_tax_total = cgst + sgst + igst + generic_tax

    return {
        "subtotal":            subtotal,
        "cgst_amount":         cgst,
        "sgst_amount":         sgst,
        "igst_amount":         igst,
        "generic_tax_total":   generic_tax,
        "item_tax_total":      item_tax_total,
        "item_total_with_tax": subtotal + item_tax_total,
        "tax_type":            tax_type,
    }


def _determine_tax_type(
    business_country_code:     str,
    business_state:            str,
    counterparty_country_code: str,
    counterparty_state:        str,
) -> str:
    """
    Returns "cgst_sgst", "igst", or "generic".
    All inputs must already be stripped/uppercased/lowercased by the caller.
    """

    # Step 1: Non-Indian business → generic tax only
    if business_country_code != "IN":
        return "generic"

    # Step 2: Indian business — apply GST rules

    # Rule 1: Counterparty is outside India → IGST (cross-border supply)
    # Blank counterparty_country_code = treat as India (walk-in / unknown).
    if counterparty_country_code and counterparty_country_code != "IN":
        return "igst"

    # Rule 2: Both in India, counterparty state blank → default intrastate
    # Rationale: missing state should never incorrectly trigger IGST.
    if not counterparty_state:
        return "cgst_sgst"

    # Rule 3: Both in India, same state → intrastate (CGST + SGST)
    if business_state == counterparty_state:
        return "cgst_sgst"

    # Rule 4: Both in India, different states → interstate (IGST)
    return "igst"