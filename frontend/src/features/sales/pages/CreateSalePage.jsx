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
import { Button, PageHeader, FormField, Spinner, Modal } from '../../../shared/components';
import StateDropdown from '../../../shared/components/StateDropdown';
import { selectStyle } from '../../../shared/components/FormField';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { COUNTRIES } from '../../../shared/data/countries';
import useAuthStore from '../../../store/authStore';
import { useDebounce } from '../../../shared/hooks/useDebounce';

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
  // resultsMap: { _id: [] } — React Query caches results by search term,
  //   but we store which item triggered which search.
  const [searchMap,   setSearchMap]   = useState({});
  const [openDropMap, setOpenDropMap] = useState({});

  // Active item search text (the one the user is currently typing in)
  // We track itemSearchActive as a string so useQuery gets a stable key.
  const [activeItemId,   setActiveItemId]   = useState(null);
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
  // stockErrors: the list returned by backend when stock is insufficient.
  // Each item: { product_id, product_name, available_qty, requested_qty, shortfall }
  // pendingBody: the full mutation body saved while the dialog is open,
  //              so we can resend it with allow_stock_override:true on confirm.
  const [stockErrors,  setStockErrors]  = useState([]);   // [] = dialog closed
  const [pendingBody,  setPendingBody]  = useState(null);

  // ── Fetch customers (pre-load — customer list is small, 500 max) ──────────
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

  const customers = useMemo(() => allCustomers.filter(c => !c.is_deleted), [allCustomers]);

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
  //
  // Shortcut map (all non-conflicting with browser defaults):
  //   F2              → focus barcode input (from anywhere on the page)
  //   Ctrl + Enter    → save invoice (submit)
  //   Ctrl + U        → open Add Customer modal
  //   Escape          → close any open dropdown / modal (handled by Modal component)
  //
  // Shortcuts are DISABLED when:
  //   - Focus is inside an <input>, <textarea>, or <select> (user is typing)
  //   - EXCEPT F2 which always works (it is a navigation key, not a character key)
  //   - A modal is open (Ctrl+Enter would accidentally double-submit)
  //
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const inInput = tag === 'input' || tag === 'textarea' || tag === 'select';
      const modalOpen = showAddCustModal || stockErrors.length > 0;

      // F2 — focus barcode input (always, even when typing elsewhere)
      if (e.key === 'F2') {
        e.preventDefault();
        barcodeRef.current?.focus();
        return;
      }

      // All remaining shortcuts are suppressed when typing in a field or modal is open
      if (inInput || modalOpen) return;

      // Ctrl + Enter — save invoice
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSubmitRef.current();
        return;
      }

      // Ctrl + U — open Add Customer modal
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
  // ↑ Re-register only when modal open state changes (so the inInput/modalOpen
  //   guards use fresh values). handleSubmit is accessed via ref, not closure.

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
    // Pre-fill name with whatever the user typed in the search box
    setNewCustName(custSearch.trim());
    setNewCustPhone('');
    setNewCustEmail('');
    // Default country and state to the business's own values — user can change them
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
      // Backend returns { message, customer: { cust_id, cust_name, ... } }
      // Unwrap the nested customer object before using it
      const created = res.customer;
      // Auto-select the newly created customer
      handleCustSelect({
        cust_id:    created.cust_id,
        cust_name:  created.cust_name,
        cust_phone: created.cust_phone || '',
      });
      // Refresh the customer list so this customer appears next time
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
  // Hardware scanners emit the barcode as keystrokes ending with Enter.
  // We call GET /products/barcode/{code} which hits the DB index directly —
  // no pre-loaded product array needed. Works at any catalog size.
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

      // product comes directly from backend (no wrapper) — has prod_id, prod_name, etc.
      const existing = items.find(i => i.product_id === product.prod_id);
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
      // Re-focus barcode input so next scan goes straight through
      setTimeout(() => barcodeRef.current?.focus(), 50);
    }
  }, [barcodeInput, items]);

  // ── Build mutation body (shared between first attempt and override) ───────
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
      // Invalidate lean product search cache so stock counts refresh next search
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

      // ── Stock override dialog trigger ────────────────────────────────────
      // Backend returns error_code = "INSUFFICIENT_STOCK" with a stock_errors
      // array when quantities exceed available stock.
      // We save the body that was attempted and open the dialog.
      if (responseData?.error_code === 'INSUFFICIENT_STOCK' && responseData?.stock_errors?.length > 0) {
        setStockErrors(responseData.stock_errors);
        setPendingBody(buildBody(false));   // save current body for override resend
        return;  // don't show toast — the dialog explains the problem
      }

      toast.error(responseData?.message || 'Failed to create invoice');
    },
  });

  // ── Stock override handlers ───────────────────────────────────────────────
  // Called when user clicks "Override & Save" in the dialog.
  const handleStockOverrideConfirm = () => {
    setStockErrors([]);
    setPendingBody(null);
    // Resend the exact same body with allow_stock_override: true
    mutation.mutate(buildBody(true));
  };

  const handleStockOverrideCancel = () => {
    setStockErrors([]);
    setPendingBody(null);
    // Do NOT reset the form — the user can edit quantities and try again
  };

  // ── Line item handlers ───────────────────────────────────────────────────
  // ── Per-item product search handlers ────────────────────────────────────
  // When a user types in a line item's product search box, we update the
  // search text for that item, open its dropdown, and trigger the debounced query.
  const handleItemSearchChange = (itemId, text) => {
    setSearchMap(prev => ({ ...prev, [itemId]: text }));
    setOpenDropMap(prev => ({ ...prev, [itemId]: true }));
    setActiveItemId(itemId);
    setActiveItemSearch(text);
  };

  // When a product is selected from the dropdown for a specific line item
  const handleProductSelect = (itemId, product) => {
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
    // Close dropdown and clear search text for this item
    setSearchMap(prev => ({ ...prev, [itemId]: '' }));
    setOpenDropMap(prev => ({ ...prev, [itemId]: false }));
    setActiveItemSearch('');
  };

  const addItem = () => setItems(prev => [...prev, newItem()]);

  const removeItem = (id) =>
    setItems(prev => prev.filter(i => i._id !== id));

  const updateItem = (id, field, value) =>
    setItems(prev => prev.map(item =>
      item._id === id ? { ...item, [field]: value } : item
    ));

  // ── Running totals (matches backend sales_final_amount formula exactly) ──
  // Backend formula: sales_total_amount - sales_discount + tax_total
  //   sales_total_amount = sum of (unit_price × qty)   ← what customer actually pays
  //   sales_discount     = sum of (prod_sell_price - unit_price) × qty per item
  //                        (auto-discount when staff sells below MRP)
  //   tax_total          = sum of (unit_price × qty × tax_rate%)
  // Grand Total = subtotal - autoDiscount + taxTotal
  // This matches sales_final_amount so the printed invoice is always consistent.
  const totals = useMemo(() => {
    let subtotal     = 0;
    let taxTotal     = 0;
    let autoDiscount = 0;
    items.forEach(item => {
      const s = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0);
      const t = s * ((Number(item.tax_rate) || 0) / 100);
      subtotal += s;
      taxTotal += t;

// MRP FEATURE: use item.mrp (snapped from prod_mrp when product was added).
      // Do NOT use product.prod_sell_price — that gives wrong discount figures.
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

  // ── Submit (first attempt — no override flag) ────────────────────────────
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

  // Ref so the keydown listener always calls the latest handleSubmit
  // without needing to be re-registered on every render.
  const handleSubmitRef = useRef(handleSubmit);
  useEffect(() => { handleSubmitRef.current = handleSubmit; });

  // Page is ready as soon as customers load — no product pre-load anymore
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
                setNewCustState('');   // reset state when country changes
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
      {/* Opens automatically when backend returns INSUFFICIENT_STOCK.         */}
      {/* Shows each problem item with available vs requested qty.             */}
      {/* "Override & Save" resends with allow_stock_override: true.           */}
      {/* "Edit Quantities" closes dialog without resetting the form.          */}
      <Modal
        open={stockErrors.length > 0}
        onClose={handleStockOverrideCancel}
        title="Stock Quantity Alert"
        subtitle="The following items exceed available stock"
        size="md"
      >
        {/* Warning banner */}
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

        {/* Table of problem items */}
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: 4,
        }}>
          {/* Header row */}
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

          {/* Data rows */}
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
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: '#059669',           // green — what's in stock
                textAlign: 'right',
              }}>
                {err.available_qty}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: '#2563EB',           // blue — what was requested
                textAlign: 'right',
              }}>
                {err.requested_qty}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: '#DC2626',           // red — the gap
                textAlign: 'right',
              }}>
                −{err.shortfall}
              </span>
            </div>
          ))}
        </div>

        <Modal.Footer>
          {/* Edit Quantities — close dialog, form stays intact */}
          <Button
            variant="ghost"
            onClick={handleStockOverrideCancel}
            disabled={mutation.isPending}
          >
            Edit Quantities
          </Button>

          {/* Override & Save — resend with allow_stock_override: true */}
          <Button
            variant="danger"
            onClick={handleStockOverrideConfirm}
            loading={mutation.isPending}
          >
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
                      {/* + Add New Customer button — always visible at bottom of dropdown */}
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
            <SectionCard
              title="Line Items"
            >
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

              {/* Item rows */}
              {items.map(item => {
                const s = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0);
                const t = s * ((Number(item.tax_rate) || 0) / 100);

                // Stock warning: stored directly on the item after selection
                const availableQty = item.prod_stock_qty != null ? Number(item.prod_stock_qty) : null;
                const overStock = availableQty !== null && Number(item.quantity) > availableQty;

                // Search results shown only when this item's dropdown is open
                const isOpen    = !!openDropMap[item._id];
                const itemQuery = searchMap[item._id] || '';

                return (
                  <div key={item._id} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 90px 130px 80px 130px 32px',
                    gap: 10, alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border)',
                  }}>

                    {/* Product search combobox — replaces <select> */}
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
                            onClick={() => {
                              setItems(prev => prev.map(i =>
                                i._id === item._id
                                  ? { ...i, product_id: '', prod_name: '', mrp: 0, unit_price: 0, tax_rate: 0, prod_stock_qty: null }
                                  : i
                              ));
                            }}
                            title="Change product"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 0, lineHeight: 1 }}
                          >×</button>
                        </div>
                      ) : (
                        // No product selected yet — show search input
                        <>
                          <input
                            type="text"
                            value={itemQuery}
                            onChange={e => handleItemSearchChange(item._id, e.target.value)}
                            onFocus={() => setOpenDropMap(prev => ({ ...prev, [item._id]: true }))}
                            onBlur={() => setTimeout(() => setOpenDropMap(prev => ({ ...prev, [item._id]: false })), 150)}
                            placeholder="Type to search product..."
                            autoComplete="off"
                            style={{ ...selectStyle, fontSize: 13, padding: '8px 10px' }}
                          />
                          {isOpen && itemQuery.length >= 2 && (
                            <div style={{
                              position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0,
                              background: 'var(--bg-card)',
                              border: '1.5px solid var(--border)',
                              borderRadius: 10,
                              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                              zIndex: 300,
                              maxHeight: 220, overflowY: 'auto',
                            }}>
                              {productSearchResults.length === 0 ? (
                                <div style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                                  No products found for "{itemQuery}"
                                </div>
                              ) : (
                                productSearchResults.map(p => (
                                  <div
                                    key={p.prod_id}
                                    onMouseDown={() => handleProductSelect(item._id, p)}
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
                          {isOpen && itemQuery.length > 0 && itemQuery.length < 2 && (
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
                        onChange={e =>
                          updateItem(item._id, 'quantity', Math.max(1, Number(e.target.value) || 1))}
                        style={{
                          ...numInput(),
                          borderColor: overStock ? '#F59E0B' : undefined,
                        }}
                        title={overStock
                          ? `Only ${availableQty} in stock — override will be needed`
                          : undefined}
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
                      onChange={e => updateItem(item._id, 'unit_price', Number(e.target.value) || 0)}
                      style={numInput()}
                    />
                    <input
                      type="number" min="0" max="100" step="0.5"
                      value={item.tax_rate}
                      onChange={e => updateItem(item._id, 'tax_rate', Number(e.target.value) || 0)}
                      style={numInput()}
                    />
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      color: 'var(--text-primary)', textAlign: 'right',
                    }}>
                      {formatCurrency(s + t)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(item._id)}
                      disabled={items.length === 1}
                      title="Remove item"
                      style={{
                        background: 'none', border: 'none', padding: 4,
                        cursor: items.length === 1 ? 'not-allowed' : 'pointer',
                        color: items.length === 1 ? 'var(--text-muted)' : '#ef4444',
                        fontSize: 20, lineHeight: 1, borderRadius: 6,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}

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
                      ...numInput(),
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

function numInput() {
  return {
    width: '100%', padding: '8px 10px',
    border: '1.5px solid var(--border)',
    borderRadius: 8, fontSize: 13,
    background: 'var(--bg-page)',
    color: 'var(--text-primary)',
    outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit',
  };
}

const dropItemStyle = {
  padding: '10px 14px',
  cursor: 'pointer',
  borderBottom: '1px solid var(--border)',
};