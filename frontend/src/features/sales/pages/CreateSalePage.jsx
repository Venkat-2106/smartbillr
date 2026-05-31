import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  createSale,
  fetchCustomersForSale,
  fetchProductsForSale,
} from '../api/salesApi';
import { Button, PageHeader, FormField, Spinner, Modal } from '../../../shared/components';
import { selectStyle } from '../../../shared/components/FormField';
import { formatCurrency } from '../../../shared/utils/formatCurrency';

// Unique ID for each line item row (client-side only, never sent to backend)
const newItem = () => ({
  _id:        `${Date.now()}-${Math.random()}`,
  product_id: '',
  unit_price: 0,
  quantity:   1,
  tax_rate:   0,
});

export default function CreateSalePage() {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

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
  const barcodeRef = useRef(null);

  // ── Stock override dialog state ───────────────────────────────────────────
  // stockErrors: the list returned by backend when stock is insufficient.
  // Each item: { product_id, product_name, available_qty, requested_qty, shortfall }
  // pendingBody: the full mutation body saved while the dialog is open,
  //              so we can resend it with allow_stock_override:true on confirm.
  const [stockErrors,  setStockErrors]  = useState([]);   // [] = dialog closed
  const [pendingBody,  setPendingBody]  = useState(null);

  // ── Fetch customers and products ─────────────────────────────────────────
  const { data: allCustomers = [], isLoading: loadingCust } = useQuery({
    queryKey: ['customers-for-sale'],
    queryFn:  fetchCustomersForSale,
    staleTime: 5 * 60 * 1000,
  });

  const { data: allProducts = [], isLoading: loadingProd } = useQuery({
    queryKey: ['products-for-sale'],
    queryFn:  fetchProductsForSale,
    staleTime: 5 * 60 * 1000,
  });

  const customers = useMemo(() => allCustomers.filter(c => !c.is_deleted), [allCustomers]);
  const products  = useMemo(() => allProducts.filter(p => !p.is_deleted),  [allProducts]);

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

  // Auto-focus barcode input once page finishes loading
  useEffect(() => {
    if (!loadingCust && !loadingProd) {
      barcodeRef.current?.focus();
    }
  }, [loadingCust, loadingProd]);

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

  // ── Barcode scan handler ─────────────────────────────────────────────────
  const handleBarcodeScan = useCallback((e) => {
    if (e.key !== 'Enter') return;
    const raw = barcodeInput.trim();
    if (!raw) return;

    let qty = 1, code = raw;
    const match = raw.match(/^(\d+)[×*x](.+)$/i);
    if (match) {
      qty  = Math.max(1, parseInt(match[1], 10));
      code = match[2].trim();
    }

    const product = products.find(p => p.barcode && p.barcode === code);

    if (!product) {
      setBarcodeError(`No product found for barcode: ${code}`);
      setBarcodeInput('');
      return;
    }

    setBarcodeError('');
    setBarcodeInput('');

    const existing = items.find(i => i.product_id === product.prod_id);
    if (existing) {
      setItems(prev => prev.map(i =>
        i._id === existing._id ? { ...i, quantity: i.quantity + qty } : i
      ));
    } else {
      setItems(prev => [...prev, {
        _id:        `${Date.now()}-${Math.random()}`,
        product_id: product.prod_id,
        unit_price: Number(product.prod_sell_price) || 0,
        quantity:   qty,
        tax_rate:   Number(product.tax_rate) || 0,
      }]);
    }
  }, [barcodeInput, items, products]);

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
      // Also refresh products so stock qty in dropdowns is up to date
      queryClient.invalidateQueries({ queryKey: ['products-for-sale'] });
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
  const addItem = () => setItems(prev => [...prev, newItem()]);

  const removeItem = (id) =>
    setItems(prev => prev.filter(i => i._id !== id));

  const handleProductSelect = (itemId, productId) => {
    const product = products.find(p => p.prod_id === productId);
    setItems(prev => prev.map(item => {
      if (item._id !== itemId) return item;
      if (!product) return { ...item, product_id: '' };
      return {
        ...item,
        product_id: productId,
        unit_price: Number(product.prod_sell_price) || 0,
        tax_rate:   Number(product.tax_rate)         || 0,
      };
    }));
  };

  const updateItem = (id, field, value) =>
    setItems(prev => prev.map(item =>
      item._id === id ? { ...item, [field]: value } : item
    ));

  // ── Running totals ────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let subtotal = 0, taxTotal = 0;
    items.forEach(item => {
      const s = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0);
      const t = s * ((Number(item.tax_rate) || 0) / 100);
      subtotal += s;
      taxTotal += t;
    });
    return { subtotal, taxTotal, grandTotal: subtotal + taxTotal };
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

  const isPageLoading = loadingCust || loadingProd;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '36px 40px', maxWidth: 1400, margin: '0 auto' }}>

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
              action={<Button variant="secondary" size="sm" onClick={addItem}>+ Add Item</Button>}
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
                    style={{
                      flex: 1, padding: '9px 12px',
                      border: '1.5px solid var(--border)',
                      borderRadius: 9, fontSize: 13.5,
                      background: 'var(--bg-page)',
                      color: 'var(--text-primary)',
                      outline: 'none', fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      borderColor: barcodeInput ? 'var(--accent-600)' : undefined,
                    }}
                  />
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

                // Look up available stock for this product to show inline warning
                const productData = products.find(p => p.prod_id === item.product_id);
                const availableQty = productData ? Number(productData.prod_stock_qty) : null;
                const overStock = availableQty !== null && Number(item.quantity) > availableQty;

                return (
                  <div key={item._id} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 90px 130px 80px 130px 32px',
                    gap: 10, alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <select
                      value={item.product_id}
                      onChange={e => handleProductSelect(item._id, e.target.value)}
                      style={{ ...selectStyle, fontSize: 13, padding: '8px 10px' }}
                    >
                      <option value="">Select product...</option>
                      {products.map(p => (
                        <option key={p.prod_id} value={p.prod_id}>
                          {p.prod_name}{p.prod_stock_qty != null ? ` (${p.prod_stock_qty} in stock)` : ''}
                        </option>
                      ))}
                    </select>

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
                      {/* Small dot indicator when over stock */}
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

              {/* Over-stock hint row — shows below grid when any item is over */}
              {items.some(item => {
                const p = products.find(pd => pd.prod_id === item.product_id);
                return p && Number(item.quantity) > Number(p.prod_stock_qty);
              }) && (
                <div style={{
                  marginTop: 10, padding: '8px 12px',
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: 8,
                  fontSize: 12, color: '#92400E', fontWeight: 500,
                }}>
                  ⚠ One or more items exceed available stock.
                  You will be asked to confirm before saving.
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
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={selectStyle}>
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
    </div>
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
      <span style={{
        fontSize: bold ? 16 : 13.5,
        fontWeight: bold ? 700 : 500,
        color: bold ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}>
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