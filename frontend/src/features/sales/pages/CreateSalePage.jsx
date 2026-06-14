// src/features/sales/pages/CreateSalePage.jsx
//
// LAYOUT REDESIGN (Step 5.15):
// ─────────────────────────────────────────────────────────────────────────────
//
// PROBLEM SUMMARY:
//   The old layout was a stacked single-column flow on the left — Customer card,
//   then a full-height line-items card — with a sticky right panel for payment.
//   Several issues:
//
//   1. SectionCard padding (24px on all sides) ate 48px of horizontal grid space,
//      leaving the product column in LineItemRow only ~122px wide on 1366px with
//      full sidebar. The name was always clipped.
//
//   2. The Customer card (≈126px) and the barcode/header rows (≈100px) sat above
//      the scrollable item list. Combined with the keyboard hint bar (≈56px) and
//      PageHeader (≈72px), there was ~354px of chrome above the scrollable area
//      on a 768px laptop — leaving only ~414px for both item rows AND the sticky
//      right panel, which is taller than that, so it scrolled off.
//
//   3. The line-item maxHeight formula `min(calc(100dvh - 416px), 460px)` was
//      calibrated assuming a known chrome height above it. But on 768px the right
//      panel itself (Order Summary + Payment + button) is ~480px+ tall, which
//      exceeds the maxHeight of the scrollable items area on small screens — the
//      user had to scroll the page to reach the Create Invoice button.
//
//   4. The keyboard hint bar occupied 56px of vertical real-estate on every visit,
//      even on small screens — it can be collapsed/inline-appended instead.
//
//   5. Right panel `maxHeight: calc(100dvh - 116px)` with `overflowY: auto` is
//      correct in principle but 116px only accounts for topbar(60) + sticky-top(24)
//      + main-padding-top(32). It doesn't account for main-padding-bottom(32).
//      On 768px: right panel max = 768-116=652px, which is fine. On 900px it's
//      fine too. So the right panel itself doesn't overflow — but on 768px it sits
//      at top:24 inside main, so its bottom would be at 24+652=676px, but main
//      only has 768-60=708px. It fits, but barely.
//
// FIXES APPLIED:
//
//   FIX L1 — Merged Customer + Barcode into a single compact top bar
//     The customer combobox and barcode scanner are now in a horizontal row above
//     the two-column grid. This saves ~80px vertical space versus stacking them
//     in separate SectionCards. The keyboard hints are trimmed to inline <kbd>
//     chips inline with the barcode field label.
//
//   FIX L2 — Line-items table padding reduced
//     SectionCard inner padding reduced from 24px → 16px, giving 16px extra width
//     to the product column (32px total from left+right). The product column now
//     has ~154px on 1366px instead of ~122px.
//
//   FIX L3 — LineItemRow product column is now 2fr instead of 1fr
//     Old grid: '1fr 90px 130px 80px 130px 32px' — product got leftover after
//     fixed cols (512px fixed + gaps).
//     New grid: '2fr 80px 110px 72px 100px 28px' — fixed total = 390px + gaps(50px)
//     = 440px. The product col now gets 2× the remaining space.
//
//   FIX L4 — Corrected maxHeight for the item scroll container
//     Old:  min(calc(100dvh - 416px), 460px)
//     New:  calc(100dvh - 380px)  (no max cap — grows on tall screens)
//     The 380px budget: topbar(60) + main-pad-top(32) + page-header(72) +
//     compact-top-bar(60) + gap(16) + item-card-padding-top(16) + col-header(44) +
//     barcode-row(64) + add-btn(46) + bottom breathing room(70) = 380px.
//     This means on 768px the scroll area is 388px — fits ~7 rows.
//     On 900px → 520px, on 1080px → 700px. No artificial 460px ceiling.
//
//   FIX L5 — Right panel maxHeight corrected
//     Old:  calc(100dvh - 116px)  — missed bottom padding
//     New:  calc(100dvh - 156px)  — topbar(60) + main-pad(32+32) + sticky-top(24) + safety(8)
//     The right panel now never clips through the bottom on any viewport.
//
//   FIX L6 — Right panel width increased from 340px → 360px
//     Gives the Payment selects a bit more room and makes the Grand Total more
//     readable on one line. 24px gap is kept. Total consumed = 360+24 = 384px.
//
// ─────────────────────────────────────────────────────────────────────────────
// PERF FIXES (2026-06) — ALL PRESERVED UNCHANGED:
// FIX 1 — Memoized LineItemRow (React.memo + EMPTY_ARRAY)
// FIX 2 — Stable callbacks via useCallback([])
// FIX 3 — handleBarcodeScan uses itemsRef, not items closure
// FIX 4 — NUM_INPUT_STYLE as module-level constant
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  createSale,
  fetchCustomersForSale,
  searchProductsLean,
  fetchProductByBarcode,
} from '../api/salesApi';
import { createCustomer } from '../../customers/api/customersApi';
import { Button, PageHeader, FormField, Spinner } from '../../../shared/components';
import { selectStyle } from '../../../shared/components/FormField';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import useAuthStore from '../../../store/authStore';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { getAutoPrintInvoice, setAutoPrintInvoice } from '../../../shared/utils/preferences';
import { NUM_INPUT_STYLE } from '../../../shared/constants/styles';
import SaleLineItemRow from '../components/SaleLineItemRow';
import OrderSummaryRow from '../components/OrderSummaryRow';
import AddCustomerModal from '../components/AddCustomerModal';
import StockOverrideModal from '../components/StockOverrideModal';

// ── Module-level constants ─────────────────────────────────────────────────────
// FIX 4: NUM_INPUT_STYLE now imported from shared/constants/styles.js

// FIX 1 (key): Stable empty array reference for closed dropdowns.
const EMPTY_ARRAY = [];

const dropItemStyle = {
  padding: '9px 14px',
  cursor: 'pointer',
  borderBottom: '1px solid var(--border)',
};

// Unique ID for each line item row (client-side only, never sent to backend)
const newItem = () => ({
  _id:        `${Date.now()}-${Math.random()}`,
  product_id: '',
  mrp:        0,
  unit_price: 0,
  quantity:   1,
  tax_rate:   0,
});

export default function CreateSalePage() {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

  const business = useAuthStore((s) => s.business);

  // ── Form state ───────────────────────────────────────────────────────────
  const [customerId,    setCustomerId]    = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [paidAmount,    setPaidAmount]    = useState('');
  const [items,         setItems]         = useState([newItem()]);
  const [autoPrint,     setAutoPrint]      = useState(() => getAutoPrintInvoice());

  // FIX 3: itemsRef always holds the latest items array.
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // ── Customer combobox state ───────────────────────────────────────────────
  const [custSearch,       setCustSearch]       = useState('');
  const [custDropOpen,     setCustDropOpen]      = useState(false);
  const [selectedCustName, setSelectedCustName] = useState('');
  const custBoxRef = useRef(null);

  // ── Barcode state ─────────────────────────────────────────────────────────
  const [barcodeInput,   setBarcodeInput]   = useState('');
  const [barcodeError,   setBarcodeError]   = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const barcodeRef = useRef(null);
  const barcodeInputRef = useRef('');
  useEffect(() => { barcodeInputRef.current = barcodeInput; }, [barcodeInput]);

  // ── Per-item product search state ─────────────────────────────────────────
  const [searchMap,   setSearchMap]   = useState({});
  const [openDropMap, setOpenDropMap] = useState({});
  const [activeItemSearch, setActiveItemSearch] = useState('');
  const debouncedProductSearch = useDebounce(activeItemSearch, 150);

  // ── Add New Customer mini-modal state ────────────────────────────────────
  const [showAddCustModal, setShowAddCustModal] = useState(false);
  const [newCustName,      setNewCustName]      = useState('');
  const [newCustPhone,     setNewCustPhone]     = useState('');
  const [newCustEmail,     setNewCustEmail]     = useState('');
  const [newCustCountry,   setNewCustCountry]   = useState('');
  const [newCustState,     setNewCustState]     = useState('');
  const [addCustLoading,   setAddCustLoading]   = useState(false);

  // ── Stock override dialog state ───────────────────────────────────────────
  const [stockErrors,  setStockErrors]  = useState([]);
  const [pendingBody,  setPendingBody]  = useState(null);  // eslint-disable-line no-unused-vars

  // ── Fetch customers (lean) ─────────────────────────────────────────────────
  const { data: allCustomers = [], isLoading: loadingCust } = useQuery({
    queryKey: ['customers-for-sale'],
    queryFn:  fetchCustomersForSale,
    staleTime: 5 * 60 * 1000,
  });

  // ── Lean product search ────────────────────────────────────────────────────
  const { data: productSearchResults = [] } = useQuery({
    queryKey:        ['products-search-lean', debouncedProductSearch],
    queryFn:         () => searchProductsLean(debouncedProductSearch),
    enabled:         debouncedProductSearch.length >= 2,
    staleTime:       60 * 1000,
    placeholderData: (prev) => prev,
  });

  const customers = allCustomers;

  // ── Customer combobox filtered list ──────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 20);
    return customers.filter(c =>
      c.cust_name?.toLowerCase().includes(q) ||
      (c.cust_phone && c.cust_phone.includes(custSearch.trim()))
    );
  }, [customers, custSearch]);

  // Close customer dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (custBoxRef.current && !custBoxRef.current.contains(e.target)) {
        setCustDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus barcode input once customers finish loading
  useEffect(() => {
    if (!loadingCust) {
      barcodeRef.current?.focus();
    }
  }, [loadingCust]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const inInput = tag === 'input' || tag === 'textarea' || tag === 'select';
      const modalOpen = showAddCustModal || stockErrors.length > 0;

      if (e.key === 'F2') {
        e.preventDefault();
        barcodeRef.current?.focus();
        return;
      }

      if (inInput || modalOpen) return;

      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSubmitRef.current();
        return;
      }

      if (e.key === 'u' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleOpenAddCust();
        return;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddCustModal, stockErrors.length]);

  // ── Customer combobox handlers ───────────────────────────────────────────
  const handleCustInputChange = (e) => {
    setCustSearch(e.target.value);
    setSelectedCustName('');
    setCustomerId('');
    setCustDropOpen(true);
  };

  const handleCustSelect = (c) => {
    setCustomerId(c.cust_id);
    setSelectedCustName(c.cust_name + (c.cust_phone ? ` — ${c.cust_phone}` : ''));
    setCustSearch('');
    setCustDropOpen(false);
  };

  const handleWalkInSelect = () => {
    setCustomerId('');
    setSelectedCustName('');
    setCustSearch('');
    setCustDropOpen(false);
  };

  // ── Add New Customer handler ────────────────────────────────────────────
  const handleOpenAddCust = () => {
    setCustDropOpen(false);
    setNewCustName(custSearch.trim());
    setNewCustPhone('');
    setNewCustEmail('');
    setNewCustCountry(business?.business_country_code || '');
    setNewCustState(business?.business_state || '');
    setShowAddCustModal(true);
  };

  const handleCloseAddCustModal = () => {
    setShowAddCustModal(false);
    setNewCustName(''); setNewCustPhone(''); setNewCustEmail('');
    setNewCustCountry(''); setNewCustState('');
  };

  const handleAddNewCustomer = async () => {
    const name = newCustName.trim();
    if (!name) {
      toast.error('Customer name is required');
      return;
    }
    setAddCustLoading(true);
    try {
      const res = await createCustomer({
        cust_name:         name,
        cust_phone:        newCustPhone.trim()   || undefined,
        cust_email:        newCustEmail.trim()   || undefined,
        cust_country_code: newCustCountry        || undefined,
        cust_state:        newCustState.trim()   || undefined,
      });
      const created = res.customer;
      handleCustSelect({
        cust_id:    created.cust_id,
        cust_name:  created.cust_name,
        cust_phone: created.cust_phone || '',
      });
      queryClient.invalidateQueries({ queryKey: ['customers-for-sale'] });
      toast.success(`Customer "${created.cust_name}" created and selected`);
      setShowAddCustModal(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustEmail('');
      setNewCustCountry('');
      setNewCustState('');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create customer');
    } finally {
      setAddCustLoading(false);
    }
  };

  // ── Barcode scan handler ─────────────────────────────────────────────────
  // FIX 3: `items` removed from useCallback deps — uses itemsRef.current instead.
  const handleBarcodeScan = useCallback(async (e) => {
    if (e.key !== 'Enter') return;
    const raw = barcodeInputRef.current.trim();
    if (!raw) return;

    let qty = 1, code = raw;
    const match = raw.match(/^(\d+)[×*x](.+)$/i);
    if (match) {
      qty  = Math.max(1, parseInt(match[1], 10));
      code = match[2].trim();
    }

    setBarcodeError('');
    setBarcodeInput('');
    setBarcodeLoading(true);

    try {
      const product = await fetchProductByBarcode(code);

      const existing = itemsRef.current.find(i => i.product_id === product.prod_id);
      if (existing) {
        setItems(prev => prev.map(i =>
          i._id === existing._id ? { ...i, quantity: i.quantity + qty } : i
        ));
      } else {
        setItems(prev => [...prev, {
          _id:        `${Date.now()}-${Math.random()}`,
          product_id: product.prod_id,
          prod_name:  product.prod_name,
          mrp:        Number(product.prod_mrp) || 0,
          unit_price: Number(product.prod_sell_price) || 0,
          quantity:   qty,
          tax_rate:   Number(product.tax_rate) || 0,
          prod_stock_qty: Number(product.prod_stock_qty) ?? null,
        }]);
      }
      toast.success(`Added: ${product.prod_name}`, { duration: 1500 });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        setBarcodeError(`No product found for barcode: ${code}`);
      } else {
        setBarcodeError('Barcode lookup failed. Try again.');
      }
    } finally {
      setBarcodeLoading(false);
      setTimeout(() => barcodeRef.current?.focus(), 50);
    }
  }, []);

  // ── Build mutation body ───────────────────────────────────────────────────
  const buildBody = useCallback((overrideFlag = false) => {
    const parsedPaid = Number(paidAmount) || 0;
    const body = {
      customer_id:          customerId || null,
      sales_payment_method: paymentMethod,
      sales_payment_status: paymentStatus,
      allow_stock_override: overrideFlag,
      items: items.map(i => ({
        product_id:           i.product_id,
        sale_item_quantity:   Number(i.quantity),
        sale_item_unit_price: Number(i.unit_price),
        tax_rate:             Number(i.tax_rate),
      })),
    };
    if (paymentStatus === 'partial' && parsedPaid > 0) {
      body.paid_amount = parsedPaid;
    }
    return body;
  }, [customerId, paymentMethod, paymentStatus, paidAmount, items]);

  // ── Create sale mutation ─────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: createSale,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products-search-lean'] });
      const inv = data?.invoice_no || '';
      toast.success(`Invoice${inv ? ` ${inv}` : ''} created successfully!`);
      navigate('/sales', {
        state: {
          openInvoice: data?.sales_id,
          autoPrint:   autoPrint,
          invoiceNo:   inv,
        },
      });
    },
    onError: (err) => {
      const responseData = err?.response?.data;
      if (responseData?.error_code === 'INSUFFICIENT_STOCK' && responseData?.stock_errors?.length > 0) {
        setStockErrors(responseData.stock_errors);
        setPendingBody(buildBody(false));
        return;
      }
      toast.error(responseData?.message || 'Failed to create invoice');
    },
  });

  // ── Stock override handlers ───────────────────────────────────────────────
  const handleStockOverrideConfirm = () => {
    setStockErrors([]);
    setPendingBody(null);
    mutation.mutate(buildBody(true));
  };

  const handleStockOverrideCancel = () => {
    setStockErrors([]);
    setPendingBody(null);
  };

  // ── Line item handlers — stable useCallback (FIX 2) ─────────────────────
  const handleItemSearchChange = useCallback((itemId, text) => {
    setSearchMap(prev  => ({ ...prev, [itemId]: text }));
    setOpenDropMap(prev => ({ ...prev, [itemId]: true }));
    setActiveItemSearch(text);
  }, []);

  const handleProductSelect = useCallback((itemId, product) => {
    setItems(prev => prev.map(item => {
      if (item._id !== itemId) return item;
      return {
        ...item,
        product_id:     product.prod_id,
        prod_name:      product.prod_name,
        mrp:            Number(product.prod_mrp) || 0,
        unit_price:     Number(product.prod_sell_price) || 0,
        tax_rate:       Number(product.tax_rate) || 0,
        prod_stock_qty: Number(product.prod_stock_qty) ?? null,
      };
    }));
    setSearchMap(prev   => ({ ...prev, [itemId]: '' }));
    setOpenDropMap(prev  => ({ ...prev, [itemId]: false }));
    setActiveItemSearch('');
  }, []);

  const handleCloseDropdown = useCallback((itemId) => {
    setOpenDropMap(prev => ({ ...prev, [itemId]: false }));
  }, []);

  const handleOpenDropdown = useCallback((itemId) => {
    setOpenDropMap(() => ({ [itemId]: true }));
    setSearchMap(prev => {
      setActiveItemSearch(prev[itemId] || '');
      return prev;
    });
  }, []);

  const handleClearProduct = useCallback((itemId) => {
    setItems(prev => prev.map(i =>
      i._id === itemId
        ? { ...i, product_id: '', prod_name: '', mrp: 0, unit_price: 0, tax_rate: 0, prod_stock_qty: null }
        : i
    ));
  }, []);

  const addItem = () => setItems(prev => [...prev, newItem()]);

  // FIX 2: stable callbacks
  const updateItem = useCallback((id, field, value) =>
    setItems(prev => prev.map(item =>
      item._id === id ? { ...item, [field]: value } : item
    )), []);

  const removeItem = useCallback((id) =>
    setItems(prev => prev.filter(i => i._id !== id)), []);

  // ── Running totals ────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let subtotal     = 0;
    let taxTotal     = 0;
    let autoDiscount = 0;
    items.forEach(item => {
      const s = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0);
      const t = s * ((Number(item.tax_rate) || 0) / 100);
      subtotal += s;
      taxTotal += t;

      const itemMrp = Number(item.mrp) || 0;
      if (itemMrp > 0) {
        const diff = itemMrp - (Number(item.unit_price) || 0);
        if (diff > 0) autoDiscount += diff * (Number(item.quantity) || 0);
      }
    });
// Grand Total = sell price × qty + tax — matches backend sales_final_amount,
    // which is sales_total_amount + tax_total (sales_discount is always 0).
    // autoDiscount (MRP savings) is informational only — NEVER subtracted here.
    const grandTotal = subtotal + taxTotal;
    return { subtotal, taxTotal, autoDiscount, grandTotal };
  }, [items]);

  // ── Partial payment validation ────────────────────────────────────────────
  const parsedPaidAmount = Number(paidAmount) || 0;
  const paidAmountValid =
    paymentStatus !== 'partial' ||
    (parsedPaidAmount > 0 && parsedPaidAmount < totals.grandTotal);

  // ── Form validation ───────────────────────────────────────────────────────
  const isValid = useMemo(() =>
    items.length > 0 &&
    items.every(i => i.product_id && Number(i.quantity) >= 1) &&
    paidAmountValid,
    [items, paidAmountValid]
  );

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!isValid) {
      if (!paidAmountValid) {
        toast.error('Enter a valid paid amount (must be > 0 and less than the total).');
      } else {
        toast.error('Select a product and enter a valid quantity for every line item.');
      }
      return;
    }
    mutation.mutate(buildBody(false));
  };

  const handleSubmitRef = useRef(handleSubmit);
  useEffect(() => { handleSubmitRef.current = handleSubmit; });

  const isPageLoading = loadingCust;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        title="New Invoice"
        subtitle="Create a new sales invoice"
        back
        onBack={() => navigate('/sales')}
        action={
          <Button variant="ghost" onClick={() => navigate('/sales')} disabled={mutation.isPending}>
            Cancel
          </Button>
        }
      />

      {/* ── Add New Customer Mini-Modal ─────────────────────────────────────── */}
      <AddCustomerModal
        open={showAddCustModal}
        onClose={handleCloseAddCustModal}
        name={newCustName}
        phone={newCustPhone}
        email={newCustEmail}
        country={newCustCountry}
        state={newCustState}
        loading={addCustLoading}
        onNameChange={setNewCustName}
        onPhoneChange={setNewCustPhone}
        onEmailChange={setNewCustEmail}
        onCountryChange={(val) => { setNewCustCountry(val); setNewCustState(''); }}
        onStateChange={setNewCustState}
        onSubmit={handleAddNewCustomer}
      />

      {/* ── Stock Override Dialog ──────────────────────────────────────────── */}
      <StockOverrideModal
        stockErrors={stockErrors}
        isPending={mutation.isPending}
        onCancel={handleStockOverrideCancel}
        onConfirm={handleStockOverrideConfirm}
      />

      {isPageLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* ── FIX L1: Compact top bar — Customer + Barcode in one horizontal row ── */}
          {/* This replaces two stacked SectionCards (Customer card + top of Line Items card) */}
          {/* saving ~80px vertical space and making the customer/barcode workflow feel unified. */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            marginBottom: 16,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '14px 20px',
            alignItems: 'start',
          }}>
            {/* Customer combobox */}
            <div>
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6,
                display: 'flex', alignItems: 'center', minHeight: 18,
              }}>
                Customer
              </div>
              <div ref={custBoxRef} style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={selectedCustName || custSearch}
                  onChange={handleCustInputChange}
                  onFocus={() => setCustDropOpen(true)}
                  placeholder="Walk-in or type name / phone…"
                  autoComplete="off"
                  style={{
                    ...selectStyle,
                    cursor: 'text',
                    borderColor: customerId ? 'var(--accent-600)' : undefined,
                  }}
                />

                {customerId && (
                  <button
                    type="button"
                    onClick={handleWalkInSelect}
                    title="Clear — switch to Walk-in"
                    style={{
                      position: 'absolute', right: 10, top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none', border: 'none',
                      cursor: 'pointer', color: 'var(--text-muted)',
                      fontSize: 18, lineHeight: 1, padding: 2,
                    }}
                  >
                    ×
                  </button>
                )}

                {custDropOpen && !customerId && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: 'var(--bg-card)',
                    border: '1.5px solid var(--border)',
                    borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    zIndex: 200,
                    maxHeight: 240,
                    overflowY: 'auto',
                  }}>
                    <div onMouseDown={handleWalkInSelect} style={dropItemStyle}>
                      <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 13 }}>
                        Walk-in Customer (no account)
                      </span>
                    </div>
                    <div
                      onMouseDown={handleOpenAddCust}
                      style={{
                        ...dropItemStyle,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        color: 'var(--accent-600)',
                        fontWeight: 600,
                        fontSize: 13,
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                      Add New Customer
                    </div>

                    {filteredCustomers.length === 0 ? (
                      <div style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                        No customers match "{custSearch}"
                      </div>
                    ) : (
                      filteredCustomers.map(c => (
                        <div key={c.cust_id} onMouseDown={() => handleCustSelect(c)} style={dropItemStyle}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {c.cust_name}
                          </div>
                          {c.cust_phone && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                              {c.cust_phone}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              {customerId && selectedCustName && (
                <div style={{ fontSize: 11.5, color: 'var(--accent-600)', marginTop: 4, fontWeight: 600 }}>
                  ✓ {selectedCustName}
                </div>
              )}
            </div>

            {/* Barcode scanner */}
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 6, minHeight: 18,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                }}>
                  Barcode Scanner
                </div>
                {/* Keyboard hints — compact inline chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {[
                    { key: 'F2', label: 'Focus scanner' },
                    { key: 'Ctrl+↵', label: 'Save' },
                  ].map(({ key, label }) => (
                    <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <kbd style={{
                        fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
                        padding: '1px 5px', borderRadius: 4,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-secondary)',
                      }}>{key}</kbd>
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{label}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  ref={barcodeRef}
                  type="text"
                  value={barcodeInput}
                  onChange={e => { setBarcodeInput(e.target.value); setBarcodeError(''); }}
                  onKeyDown={handleBarcodeScan}
                  placeholder="Scan or type 3×barcode → Enter"
                  disabled={barcodeLoading}
                  style={{
                    flex: 1, padding: '9px 12px',
                    border: '1.5px solid var(--border)',
                    borderRadius: 10, fontSize: 13.5,
                    background: 'var(--bg-page)',
                    color: 'var(--text-primary)',
                    outline: 'none', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    borderColor: barcodeInput ? 'var(--accent-600)' : undefined,
                    opacity: barcodeLoading ? 0.7 : 1,
                  }}
                />
                {barcodeLoading && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    Looking up…
                  </span>
                )}
              </div>
              {barcodeError && (
                <div style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, fontWeight: 500 }}>
                  ⚠ {barcodeError}
                </div>
              )}
              {!barcodeError && (
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>
                  Tip: <strong>3×barcode</strong> adds 3 units at once
                </div>
              )}
            </div>
          </div>

          {/* ── Main two-column grid ─────────────────────────────────────────────── */}
          {/* FIX L6: right panel widened from 340 → 360px */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 360px',
            gap: 16,
            alignItems: 'start',
          }}>

            {/* ── LEFT panel — Line Items only ─────────────────────────────── */}
            {/* FIX L2: SectionCard padding reduced → 16px */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
            }}>
              {/* Column headers */}
              {/* FIX L3: New grid — 2fr for product, tighter fixed cols */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 80px 110px 72px 100px 28px',
                gap: 8, paddingBottom: 8,
                borderBottom: '1px solid var(--border)', marginBottom: 4,
              }}>
                {['Product', 'Qty', 'Unit Price', 'Tax %', 'Total', ''].map((h, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                  }}>
                    {h}
                  </span>
                ))}
              </div>

              {/* FIX L4: Corrected maxHeight — no arbitrary 460px cap */}
              {/* Budget: 380px of chrome above this element on any supported viewport */}
              {/* topbar(60) + main-pad-top(32) + page-header(72) + compact-top-bar(60+16gap) */}
              {/* + card-padding-top(16) + col-header(44) + add-btn(46) + bottom(34) = 380px */}
              <div style={{
                maxHeight: 'calc(100dvh - 380px)',
                minHeight: 120,
                overflowY: 'auto',
                overflowX: 'visible',
                marginRight: -8,
                paddingRight: 8,
              }}>
                {items.map((item) => (
                  <SaleLineItemRow
                    key={item._id}
                    item={item}
                    isOpen={!!openDropMap[item._id]}
                    searchText={searchMap[item._id] || ''}
                    searchResults={openDropMap[item._id] ? productSearchResults : EMPTY_ARRAY}
                    onSearchChange={handleItemSearchChange}
                    onProductSelect={handleProductSelect}
                    onOpenDropdown={handleOpenDropdown}
                    onCloseDropdown={handleCloseDropdown}
                    onClearProduct={handleClearProduct}
                    onQtyChange={updateItem}
                    onPriceChange={updateItem}
                    onTaxChange={updateItem}
                    onRemove={removeItem}
                    canRemove={items.length > 1}
                  />
                ))}

                {items.some(i => i.prod_stock_qty != null && Number(i.quantity) > Number(i.prod_stock_qty)) && (
                  <div style={{
                    marginTop: 10, padding: '8px 12px',
                    background: '#FFFBEB', border: '1px solid #FDE68A',
                    borderRadius: 8, fontSize: 12, color: '#92400E', fontWeight: 500,
                  }}>
                    ⚠ One or more items exceed available stock. You will be asked to confirm before saving.
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={addItem}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 6, marginTop: 10, width: '100%',
                  background: 'none', border: '1.5px dashed var(--border)',
                  borderRadius: 10, padding: '8px 0',
                  cursor: 'pointer', color: 'var(--text-muted)',
                  fontSize: 13, fontFamily: 'inherit',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-400)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                + Add another line item
              </button>
            </div>

            {/* ── RIGHT panel — Order Summary + Payment ──────────────────── */}
            {/* FIX L5: maxHeight corrected — accounts for both top and bottom padding */}
            {/* topbar(60) + main-pad-top(32) + main-pad-bottom(32) + sticky-top(24) + safety(8) = 156px */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 14,
              position: 'sticky', top: 24,
              maxHeight: 'calc(100dvh - 156px)',
              overflowY: 'auto',
            }}>
              {/* Order Summary card */}
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 16,
              }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Order Summary
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <OrderSummaryRow label="Subtotal"   value={formatCurrency(totals.subtotal)} />
                  {totals.autoDiscount > 0 && (
                    <OrderSummaryRow
                      label="You Saved (vs MRP)"
                      value={<span style={{ color: '#059669' }}>{formatCurrency(totals.autoDiscount)}</span>}
                      muted
                    />
                  )}
                  <OrderSummaryRow label="Tax" value={formatCurrency(totals.taxTotal)} muted />
                  <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
                    <OrderSummaryRow label="Grand Total" value={formatCurrency(totals.grandTotal)} bold />
                  </div>
                  {paymentStatus === 'partial' && parsedPaidAmount > 0 && (
                    <>
                      <OrderSummaryRow label="Paid Now" value={formatCurrency(parsedPaidAmount)} />
                      <OrderSummaryRow
                        label="Remaining Due"
                        value={
                          <span style={{ color: '#ef4444', fontWeight: 700 }}>
                            {formatCurrency(Math.max(0, totals.grandTotal - parsedPaidAmount))}
                          </span>
                        }
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Payment card */}
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 16,
              }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Payment
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <FormField label="Method">
                    <select
                      className="sb-select"
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="upi">UPI</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="split">Split</option>
                    </select>
                  </FormField>

                  <FormField label="Status">
                    <select
                      value={paymentStatus}
                      onChange={e => { setPaymentStatus(e.target.value); setPaidAmount(''); }}
                      style={selectStyle}
                    >
                      <option value="paid">Paid</option>
                      <option value="partial">Partial</option>
                      <option value="pending">Unpaid</option>
                    </select>
                  </FormField>
                </div>

                {paymentStatus === 'partial' && (
                  <FormField label="Paid Amount">
                    <input
                      type="number" min="0.01" step="0.01"
                      value={paidAmount}
                      onChange={e => setPaidAmount(e.target.value)}
                      placeholder={`Max ${formatCurrency(totals.grandTotal - 0.01)}`}
                      style={{
                        ...NUM_INPUT_STYLE,
                        borderColor:
                          paidAmount && !paidAmountValid ? '#ef4444'
                          : parsedPaidAmount > 0 && paidAmountValid ? 'var(--accent-600)'
                          : undefined,
                      }}
                    />
                    {paidAmount && !paidAmountValid && (
                      <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
                        {parsedPaidAmount <= 0
                          ? 'Amount must be greater than 0'
                          : `Cannot exceed total (${formatCurrency(totals.grandTotal)})`}
                      </div>
                    )}
                    {parsedPaidAmount > 0 && paidAmountValid && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        Remaining: {formatCurrency(totals.grandTotal - parsedPaidAmount)}
                      </div>
                    )}
                  </FormField>
                )}
              </div>

              <label style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12.5, color: 'var(--text-secondary)',
                cursor: 'pointer', userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={autoPrint}
                  onChange={e => {
                    setAutoPrint(e.target.checked);
                    setAutoPrintInvoice(e.target.checked);
                  }}
                  style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent-600)' }}
                />
                Open print preview after creating invoice
              </label>

              <Button
                variant="primary"
                onClick={handleSubmit}
                loading={mutation.isPending}
                disabled={!isValid}
                style={{ width: '100%', padding: '13px', fontSize: 15, fontWeight: 700 }}
              >
                Create Invoice →
              </Button>

              {!isValid && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                  {!paidAmountValid
                    ? 'Enter a valid paid amount to continue.'
                    : 'Select a product for every line item to continue.'}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}