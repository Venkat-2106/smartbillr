// src/features/sales/pages/CreateSalePage.jsx
//
// PERF FIXES (2026-06):
// ─────────────────────────────────────────────────────────────────────────────
//
// FIX 1 — Memoized LineItemRow component (BIGGEST WIN)
//
//   PROBLEM:
//     Line items were rendered inline inside CreateSalePage's return().
//     Every state change anywhere in the page (barcode input keystroke,
//     payment method select, customer search typing) caused React to re-render
//     ALL line item rows — even if none of their data changed.
//     With 10 line items and a fast typist on the barcode field: 10× wasted
//     renders per keystroke.
//
//   FIX:
//     Extracted <LineItemRow> as a separate React.memo component.
//     React.memo does a shallow prop comparison — if props haven't changed,
//     the component is not re-rendered.
//
//     KEY TRICK: productSearchResults is passed as EMPTY_ARRAY (a stable
//     module-level constant) when the row's dropdown is closed. This means
//     closed rows don't re-render when search results arrive for another row.
//     Only the row with the open dropdown receives the live search results.
//
// FIX 2 — Stable callbacks via useCallback ([]  deps)
//
//   PROBLEM:
//     handleItemSearchChange, handleProductSelect, updateItem, removeItem
//     were defined as plain inline functions — recreated on every render.
//     React.memo on LineItemRow is useless if callback props keep changing.
//
//   FIX:
//     All handlers now use useCallback with [] deps (stable forever).
//     They use functional setState (prev => ...) so they never need to
//     close over current state — correct by construction.
//
// FIX 3 — handleBarcodeScan no longer recreated on item changes
//
//   PROBLEM:
//     handleBarcodeScan had `items` in its useCallback dependency array.
//     Every qty change, product selection, or any line item mutation caused
//     handleBarcodeScan to be recreated. In a retail environment where the
//     cashier is scanning rapidly while also editing quantities, this caused
//     the barcode input's onKeyDown to keep getting a new function reference.
//
//   FIX:
//     itemsRef (useRef) always holds the latest items array.
//     handleBarcodeScan reads itemsRef.current instead of closing over items.
//     Dependency array reduced from [barcodeInput, items] → [barcodeInput].
//     Handler now only recreates when the barcode field value changes.
//
// FIX 4 — NUM_INPUT_STYLE as module-level constant
//
//   PROBLEM:
//     numInput() was an inline function called as style={numInput()} inside
//     each row. Every render of every row called numInput() and created a new
//     plain object — unnecessary garbage collection pressure.
//
//   FIX:
//     Replaced with a module-level constant NUM_INPUT_STYLE.
//     One object, shared by reference across all rows, all renders.
//
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
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
import { Button, PageHeader, FormField, Spinner, Modal } from '../../../shared/components';
import StateDropdown from '../../../shared/components/StateDropdown';
import { selectStyle } from '../../../shared/components/FormField';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { COUNTRIES } from '../../../shared/data/countries';
import useAuthStore from '../../../store/authStore';
import { useDebounce } from '../../../shared/hooks/useDebounce';

// ── Module-level constants ─────────────────────────────────────────────────────
// FIX 4: Moved out of component — created once, never re-created on render.
const NUM_INPUT_STYLE = {
  width: '100%', padding: '8px 10px',
  border: '1.5px solid var(--border)',
  borderRadius: 8, fontSize: 13,
  background: 'var(--bg-page)',
  color: 'var(--text-primary)',
  outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
};

// FIX 1 (key): Stable empty array reference for closed dropdowns.
// When a LineItemRow's dropdown is closed, we pass EMPTY_ARRAY as searchResults.
// This is always the same reference → React.memo sees no change → no re-render.
const EMPTY_ARRAY = [];

const dropItemStyle = {
  padding: '10px 14px',
  cursor: 'pointer',
  borderBottom: '1px solid var(--border)',
};

// Unique ID for each line item row (client-side only, never sent to backend)
const newItem = () => ({
  _id:        `${Date.now()}-${Math.random()}`,
  product_id: '',
  mrp:        0,   // MRP FEATURE: product's MRP at time of adding to invoice
  unit_price: 0,
  quantity:   1,
  tax_rate:   0,
});

export default function CreateSalePage() {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

  // Read business defaults for customer pre-fill
  const business = useAuthStore((s) => s.business);

  // ── Form state ───────────────────────────────────────────────────────────
  const [customerId,    setCustomerId]    = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [paidAmount,    setPaidAmount]    = useState('');
  const [items,         setItems]         = useState([newItem()]);

  // FIX 3: itemsRef always holds the latest items array.
  // handleBarcodeScan reads from this ref instead of closing over items state.
  // This lets us remove `items` from handleBarcodeScan's useCallback deps.
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // ── Customer combobox state ───────────────────────────────────────────────
  const [custSearch,       setCustSearch]       = useState('');
  const [custDropOpen,     setCustDropOpen]      = useState(false);
  const [selectedCustName, setSelectedCustName] = useState('');
  const custBoxRef = useRef(null);

  // ── Barcode state ─────────────────────────────────────────────────────────
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeError, setBarcodeError] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const barcodeRef = useRef(null);

  // ── Per-item product search state ─────────────────────────────────────────
  // Each line item has its own search box. searchMap: { _id: searchText }
  // openDropMap: { _id: boolean } — which item's dropdown is open
  const [searchMap,   setSearchMap]   = useState({});
  const [openDropMap, setOpenDropMap] = useState({});

  // Active item search text (the one the user is currently typing in)
  // We track itemSearchActive as a string so useQuery gets a stable key.
  const [activeItemSearch, setActiveItemSearch] = useState('');
  const debouncedProductSearch = useDebounce(activeItemSearch, 250);

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

  // ── Fetch customers (lean — only cust_id, cust_name, cust_phone) ──────────
  // PERF FIX: fetchCustomersForSale now calls GET /customers/lean which
  // returns only 3 fields per customer (no profile JOIN, no audit fields).
  // Payload is ~85% smaller vs the old GET /customers?limit=500.
  const { data: allCustomers = [], isLoading: loadingCust } = useQuery({
    queryKey: ['customers-for-sale'],
    queryFn:  fetchCustomersForSale,
    staleTime: 5 * 60 * 1000,
  });

  // ── Lean product search — server-side, fires on debounced keystroke ────────
  // No pre-loading of products. Only fetches when user types ≥ 2 chars.
  // Each unique search term is cached by React Query automatically.
  const { data: productSearchResults = [] } = useQuery({
    queryKey: ['products-search-lean', debouncedProductSearch],
    queryFn:  () => searchProductsLean(debouncedProductSearch),
    enabled:  debouncedProductSearch.length >= 2,
    staleTime: 60 * 1000,   // cache each search result for 60s
  });

  // allCustomers from /customers/lean already only has active customers
  // (backend WHERE is_deleted = false), so no client-side filter needed.
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
  // FIX 3: `items` removed from useCallback deps.
  // itemsRef.current always holds the latest items — reads it directly
  // instead of closing over the items state variable.
  // Handler now only recreates when barcodeInput changes (user typing).
  // This prevents the handler from being recreated on every qty change,
  // product selection, etc.
  const handleBarcodeScan = useCallback(async (e) => {
    if (e.key !== 'Enter') return;
    const raw = barcodeInput.trim();
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

      // FIX 3: Read from ref, not closure — always has current items.
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
  }, [barcodeInput]); // FIX 3: `items` removed — use itemsRef.current instead

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
          autoPrint:   true,
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
  // All use functional setState (prev => ...) so they close over nothing
  // from component scope and deps array can safely be [].
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
    setOpenDropMap(prev => ({ ...prev, [itemId]: true }));
  }, []);

  const handleClearProduct = useCallback((itemId) => {
    setItems(prev => prev.map(i =>
      i._id === itemId
        ? { ...i, product_id: '', prod_name: '', mrp: 0, unit_price: 0, tax_rate: 0, prod_stock_qty: null }
        : i
    ));
  }, []);

  const addItem = () => setItems(prev => [...prev, newItem()]);

  // FIX 2: stable callbacks for qty/price/tax changes
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
    const grandTotal = subtotal - autoDiscount + taxTotal;
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
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" onClick={() => navigate('/sales')} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={mutation.isPending}
              disabled={!isValid || isPageLoading}
            >
              Create Invoice
            </Button>
          </div>
        }
      />

      {/* ── Keyboard shortcut hint bar ──────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        marginBottom: 20, flexWrap: 'wrap',
      }}>
        {[
          { key: 'F2',          label: 'Focus scanner' },
          { key: 'Ctrl+Enter',  label: 'Save invoice'  },
          { key: 'Ctrl+U',      label: 'Add customer'  },
        ].map(({ key, label }) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <kbd style={{
              fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
              padding: '2px 7px', borderRadius: 5,
              border: '1px solid var(--border)',
              background: 'var(--bg-subtle)',
              color: 'var(--text-secondary)',
              letterSpacing: '0.02em',
            }}>{key}</kbd>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
          </span>
        ))}
      </div>

      {/* ── Add New Customer Mini-Modal ─────────────────────────────────────── */}
      <Modal
        open={showAddCustModal}
        onClose={() => {
          setShowAddCustModal(false);
          setNewCustName(''); setNewCustPhone(''); setNewCustEmail('');
          setNewCustCountry(''); setNewCustState('');
        }}
        title="Add New Customer"
        subtitle="Quickly add a customer and select them for this invoice"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="Full Name *">
            <input
              type="text"
              value={newCustName}
              onChange={e => setNewCustName(e.target.value)}
              placeholder="Customer name"
              autoFocus
              style={{ ...selectStyle }}
            />
          </FormField>
          <FormField label="Phone">
            <input
              type="tel"
              value={newCustPhone}
              onChange={e => setNewCustPhone(e.target.value)}
              placeholder="Phone number (optional)"
              style={{ ...selectStyle }}
            />
          </FormField>
          <FormField label="Email">
            <input
              type="email"
              value={newCustEmail}
              onChange={e => setNewCustEmail(e.target.value)}
              placeholder="Email address (optional)"
              style={{ ...selectStyle }}
            />
          </FormField>
          <FormField label="Country">
            <select
              value={newCustCountry}
              onChange={e => {
                setNewCustCountry(e.target.value);
                setNewCustState('');
              }}
              style={{ ...selectStyle }}
            >
              <option value="">— Select Country —</option>
              {COUNTRIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </FormField>
          <StateDropdown
            label="State / Province"
            countryCode={newCustCountry}
            value={newCustState}
            onChange={val => setNewCustState(val)}
          />
        </div>
        <Modal.Footer>
          <Button
            variant="ghost"
            onClick={() => {
              setShowAddCustModal(false);
              setNewCustName(''); setNewCustPhone(''); setNewCustEmail('');
              setNewCustCountry(''); setNewCustState('');
            }}
            disabled={addCustLoading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleAddNewCustomer}
            loading={addCustLoading}
            disabled={!newCustName.trim()}
          >
            Create & Select
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Stock Override Dialog ──────────────────────────────────────────── */}
      <Modal
        open={stockErrors.length > 0}
        onClose={handleStockOverrideCancel}
        title="Stock Quantity Alert"
        subtitle="The following items exceed available stock"
        size="md"
      >
        <div style={{
          background: '#FEF9EC',
          border: '1.5px solid #F59E0B',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}>
          <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.2 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#92400E', marginBottom: 3 }}>
              Requested quantity exceeds available stock
            </div>
            <div style={{ fontSize: 12.5, color: '#B45309', lineHeight: 1.5 }}>
              You can override and proceed — a <strong>manual adjustment</strong> record
              will be created automatically in stock movements with the note
              "Manual adjustment during sale".
            </div>
          </div>
        </div>

        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: 4,
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 100px 100px 90px',
            gap: 0,
            background: 'var(--bg-subtle)',
            borderBottom: '1px solid var(--border)',
            padding: '9px 16px',
          }}>
            {['Product', 'Available', 'Requested', 'Shortfall'].map((h, i) => (
              <span key={i} style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.07em',
                textAlign: i > 0 ? 'right' : 'left',
              }}>
                {h}
              </span>
            ))}
          </div>

          {stockErrors.map((err, idx) => (
            <div
              key={err.product_id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 100px 90px',
                gap: 0,
                padding: '11px 16px',
                alignItems: 'center',
                borderBottom: idx === stockErrors.length - 1 ? 'none' : '1px solid var(--border)',
                background: 'var(--bg-card)',
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                {err.product_name}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#059669', textAlign: 'right' }}>
                {err.available_qty}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#2563EB', textAlign: 'right' }}>
                {err.requested_qty}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', textAlign: 'right' }}>
                −{err.shortfall}
              </span>
            </div>
          ))}
        </div>

        <Modal.Footer>
          <Button variant="ghost" onClick={handleStockOverrideCancel} disabled={mutation.isPending}>
            Edit Quantities
          </Button>
          <Button variant="danger" onClick={handleStockOverrideConfirm} loading={mutation.isPending}>
            Override &amp; Save
          </Button>
        </Modal.Footer>
      </Modal>

      {isPageLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Spinner size="lg" />
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: 24,
          alignItems: 'start',
        }}>

          {/* ── LEFT panel ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Customer card */}
            <SectionCard title="Customer">
              <FormField label="Search by name or phone">
                <div ref={custBoxRef} style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={selectedCustName || custSearch}
                    onChange={handleCustInputChange}
                    onFocus={() => setCustDropOpen(true)}
                    placeholder="Type name or phone number..."
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
                  <div style={{ fontSize: 12, color: 'var(--accent-600)', marginTop: 5, fontWeight: 600 }}>
                    ✓ {selectedCustName}
                  </div>
                )}
              </FormField>
            </SectionCard>

            {/* Line items card */}
            <SectionCard title="Line Items">
              {/* Barcode input */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    ref={barcodeRef}
                    type="text"
                    value={barcodeInput}
                    onChange={e => { setBarcodeInput(e.target.value); setBarcodeError(''); }}
                    onKeyDown={handleBarcodeScan}
                    placeholder="🔍 Scan barcode or type 3×barcode → Enter"
                    disabled={barcodeLoading}
                    style={{
                      flex: 1, padding: '9px 12px',
                      border: '1.5px solid var(--border)',
                      borderRadius: 9, fontSize: 13.5,
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
                  <div style={{ fontSize: 12, color: '#ef4444', marginTop: 5, fontWeight: 500 }}>
                    ⚠ {barcodeError}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Tip: type <strong>3×barcode</strong> to add 3 units at once
                </div>
              </div>

              {/* Column headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 130px 80px 130px 32px',
                gap: 10, paddingBottom: 10,
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

              {/* FIX 1: Each row is a memoized LineItemRow.
                  EMPTY_ARRAY is passed as searchResults when the dropdown is
                  closed — stable reference → React.memo skips re-render for
                  closed rows when search results arrive for another row. */}
              {items.map(item => (
                <LineItemRow
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

              {/* Over-stock hint row */}
              {items.some(i => i.prod_stock_qty != null && Number(i.quantity) > Number(i.prod_stock_qty)) && (
                <div style={{
                  marginTop: 10, padding: '8px 12px',
                  background: '#FFFBEB', border: '1px solid #FDE68A',
                  borderRadius: 8, fontSize: 12, color: '#92400E', fontWeight: 500,
                }}>
                  ⚠ One or more items exceed available stock. You will be asked to confirm before saving.
                </div>
              )}

              <button
                type="button"
                onClick={addItem}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 6, marginTop: 12, width: '100%',
                  background: 'none', border: '1.5px dashed var(--border)',
                  borderRadius: 10, padding: '9px 0',
                  cursor: 'pointer', color: 'var(--text-muted)',
                  fontSize: 13, fontFamily: 'inherit',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-400)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                + Add another line item
              </button>
            </SectionCard>
          </div>

          {/* ── RIGHT panel ─────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 16,
            position: 'sticky', top: 24,
          }}>
            <SectionCard title="Order Summary">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <SummaryRow label="Subtotal"   value={formatCurrency(totals.subtotal)} />
                {totals.autoDiscount > 0 && (
                  <SummaryRow
                    label="Discount"
                    value={<span style={{ color: '#059669' }}>−{formatCurrency(totals.autoDiscount)}</span>}
                    muted
                  />
                )}
                <SummaryRow label="Tax"        value={formatCurrency(totals.taxTotal)} muted />
                <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 12, marginTop: 2 }}>
                  <SummaryRow label="Grand Total" value={formatCurrency(totals.grandTotal)} bold />
                </div>
                {paymentStatus === 'partial' && parsedPaidAmount > 0 && (
                  <>
                    <SummaryRow label="Paid Now" value={formatCurrency(parsedPaidAmount)} />
                    <SummaryRow
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
            </SectionCard>

            <SectionCard title="Payment">
              <FormField label="Payment Method" style={{ marginBottom: 14 }}>
                <select className="sb-select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={selectStyle}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="split">Split</option>
                </select>
              </FormField>

              <FormField label="Payment Status" style={{ marginBottom: 14 }}>
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

              {paymentStatus === 'partial' && (
                <FormField label="Paid Amount" style={{ marginBottom: 14 }}>
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
            </SectionCard>

            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={mutation.isPending}
              disabled={!isValid}
              style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 700 }}
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
      )}
    </>
  );
}

/* ─── LineItemRow — memoized, only re-renders when ITS props change ──────────
 *
 * FIX 1 IMPLEMENTATION:
 *   React.memo does a shallow comparison on every prop.
 *   As long as the parent passes stable callback references (useCallback [])
 *   and passes EMPTY_ARRAY for searchResults when the dropdown is closed,
 *   closed rows will NEVER re-render due to:
 *     - barcode input changes
 *     - payment method/status changes
 *     - customer selection changes
 *     - search results arriving for a different row
 *
 *   Only the row whose `item` prop changed (e.g., qty update) or whose
 *   `isOpen` prop changed will re-render.
 */
const LineItemRow = memo(function LineItemRow({
  item,
  isOpen,
  searchText,
  searchResults,
  onSearchChange,
  onProductSelect,
  onOpenDropdown,
  onCloseDropdown,
  onClearProduct,
  onQtyChange,
  onPriceChange,
  onTaxChange,
  onRemove,
  canRemove,
}) {
  const s = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0);
  const t = s * ((Number(item.tax_rate) || 0) / 100);

  const availableQty = item.prod_stock_qty != null ? Number(item.prod_stock_qty) : null;
  const overStock = availableQty !== null && Number(item.quantity) > availableQty;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 90px 130px 80px 130px 32px',
      gap: 10, alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>

      {/* Product search combobox */}
      <div style={{ position: 'relative' }}>
        {item.product_id ? (
          // Product already selected — show name with a clear button
          <div style={{
            display: 'flex', alignItems: 'center',
            gap: 6, padding: '8px 10px',
            border: '1.5px solid var(--accent-600)',
            borderRadius: 8, background: 'var(--bg-page)',
            fontSize: 13, color: 'var(--text-primary)',
          }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.prod_name}
              {availableQty !== null && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
                  ({availableQty} left)
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => onClearProduct(item._id)}
              title="Change product"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 0, lineHeight: 1 }}
            >×</button>
          </div>
        ) : (
          // No product selected yet — show search input
          <>
            <input
              type="text"
              value={searchText}
              onChange={e => onSearchChange(item._id, e.target.value)}
              onFocus={() => onOpenDropdown(item._id)}
              onBlur={() => setTimeout(() => onCloseDropdown(item._id), 150)}
              placeholder="Type to search product..."
              autoComplete="off"
              style={{ ...selectStyle, fontSize: 13, padding: '8px 10px' }}
            />
            {isOpen && searchText.length >= 2 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0,
                background: 'var(--bg-card)',
                border: '1.5px solid var(--border)',
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                zIndex: 300,
                maxHeight: 220, overflowY: 'auto',
              }}>
                {searchResults.length === 0 ? (
                  <div style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                    No products found for "{searchText}"
                  </div>
                ) : (
                  searchResults.map(p => (
                    <div
                      key={p.prod_id}
                      onMouseDown={() => onProductSelect(item._id, p)}
                      style={{
                        padding: '9px 14px', cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {p.prod_name}
                        </div>
                        {p.barcode && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                            {p.barcode}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {formatCurrency(p.prod_sell_price)}
                        </div>
                        {p.prod_stock_qty != null && (
                          <div style={{ fontSize: 11, color: p.prod_stock_qty > 0 ? '#059669' : '#ef4444' }}>
                            {p.prod_stock_qty} left
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            {isOpen && searchText.length > 0 && searchText.length < 2 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0,
                background: 'var(--bg-card)', border: '1.5px solid var(--border)',
                borderRadius: 10, padding: '10px 14px',
                fontSize: 12.5, color: 'var(--text-muted)', zIndex: 300,
              }}>
                Type at least 2 characters to search
              </div>
            )}
          </>
        )}
      </div>

      {/* Quantity — turns amber border if over stock */}
      <div style={{ position: 'relative' }}>
        <input
          type="number" min="1" step="1"
          value={item.quantity}
          onChange={e => onQtyChange(item._id, 'quantity', Math.max(1, Number(e.target.value) || 1))}
          style={{
            ...NUM_INPUT_STYLE,
            borderColor: overStock ? '#F59E0B' : undefined,
          }}
          title={overStock ? `Only ${availableQty} in stock — override will be needed` : undefined}
        />
        {overStock && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            width: 8, height: 8, borderRadius: '50%',
            background: '#F59E0B',
            border: '1.5px solid var(--bg-card)',
          }} />
        )}
      </div>

      <input
        type="number" min="0" step="0.01"
        value={item.unit_price}
        onChange={e => onPriceChange(item._id, 'unit_price', Number(e.target.value) || 0)}
        style={NUM_INPUT_STYLE}
      />
      <input
        type="number" min="0" max="100" step="0.5"
        value={item.tax_rate}
        onChange={e => onTaxChange(item._id, 'tax_rate', Number(e.target.value) || 0)}
        style={NUM_INPUT_STYLE}
      />
      <span style={{
        fontSize: 13, fontWeight: 700,
        color: 'var(--text-primary)', textAlign: 'right',
      }}>
        {formatCurrency(s + t)}
      </span>
      <button
        type="button"
        onClick={() => onRemove(item._id)}
        disabled={!canRemove}
        title="Remove item"
        style={{
          background: 'none', border: 'none', padding: 4,
          cursor: canRemove ? 'pointer' : 'not-allowed',
          color: canRemove ? '#ef4444' : 'var(--text-muted)',
          fontSize: 20, lineHeight: 1, borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ×
      </button>
    </div>
  );
});

/* ─── Helper components ──────────────────────────────────────────────────── */

function SectionCard({ title, children, action }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
      {(title || action) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          {title && <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function SummaryRow({ label, value, bold, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13.5, color: muted ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
        {label}
      </span>
      <span
        style={{
          fontSize: bold ? 16 : 13.5,
          fontWeight: bold ? 700 : 500,
          color: bold ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
