import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  createSale,
  fetchCustomersForSale,
  fetchProductsForSale,
} from '../api/salesApi';
import { Button, PageHeader, FormField, Spinner } from '../../../shared/components';
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
  const [notes,         setNotes]         = useState('');
  const [items,         setItems]         = useState([newItem()]);

  // ── Fetch customers and products for dropdowns ───────────────────────────
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

  // Active only
  const customers = useMemo(() => allCustomers.filter(c => !c.is_deleted), [allCustomers]);
  const products  = useMemo(() => allProducts.filter(p => !p.is_deleted),  [allProducts]);

  // ── Create sale mutation ─────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: createSale,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      const inv = data?.invoice_no || '';
      toast.success(`Invoice${inv ? ` ${inv}` : ''} created successfully!`);
      navigate('/sales');
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || 'Failed to create invoice'),
  });

  // ── Line item handlers ───────────────────────────────────────────────────
  const addItem = () => setItems(prev => [...prev, newItem()]);

  const removeItem = (id) =>
    setItems(prev => prev.filter(i => i._id !== id));

  // When a product is selected: auto-fill price and tax from product data
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

  // ── Running totals (computed client-side for display only) ────────────────
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

  // ── Validation: every item must have a product and qty ≥ 1 ───────────────
  const isValid = useMemo(() =>
    items.length > 0 &&
    items.every(i => i.product_id && Number(i.quantity) >= 1),
    [items]
  );

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!isValid) {
      toast.error('Select a product and enter a valid quantity for every line item.');
      return;
    }
    mutation.mutate({
      customer_id:          customerId || null,
      sales_payment_method: paymentMethod,
      sales_payment_status: paymentStatus,
      items: items.map(i => ({
        product_id:           i.product_id,
        sale_item_quantity:   Number(i.quantity),
        sale_item_unit_price: Number(i.unit_price),
        // tax_rate is NOT sent — backend reads it from the product record via DB trigger
      })),
    });
  };

  const isPageLoading = loadingCust || loadingProd;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '36px 40px', maxWidth: 1400, margin: '0 auto' }}>

      <PageHeader
        title="New Invoice"
        subtitle="Create a new sales invoice"
        back
        onBack={() => navigate('/sales')}
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button
              variant="ghost"
              onClick={() => navigate('/sales')}
              disabled={mutation.isPending}
            >
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

          {/* ── LEFT panel: customer + line items ─────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Customer card */}
            <SectionCard title="Customer">
              <FormField label="Select Customer">
                <select
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">Walk-in Customer (no account)</option>
                  {customers.map(c => (
                    <option key={c.cust_id} value={c.cust_id}>
                      {c.cust_name}{c.cust_phone ? ` — ${c.cust_phone}` : ''}
                    </option>
                  ))}
                </select>
              </FormField>
            </SectionCard>

            {/* Line items card */}
            <SectionCard
              title="Line Items"
              action={
                <Button variant="secondary" size="sm" onClick={addItem}>
                  + Add Item
                </Button>
              }
            >
              {/* Column headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 130px 80px 130px 32px',
                gap: 10,
                paddingBottom: 10,
                borderBottom: '1px solid var(--border)',
                marginBottom: 4,
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
                return (
                  <div key={item._id} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 90px 130px 80px 130px 32px',
                    gap: 10,
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border)',
                  }}>

                    {/* Product select */}
                    <select
                      value={item.product_id}
                      onChange={e => handleProductSelect(item._id, e.target.value)}
                      style={{ ...selectStyle, fontSize: 13, padding: '8px 10px' }}
                    >
                      <option value="">Select product...</option>
                      {products.map(p => (
                        <option key={p.prod_id} value={p.prod_id}>
                          {p.prod_name}
                          {p.prod_stock_qty != null
                            ? ` (${p.prod_stock_qty} in stock)` : ''}
                        </option>
                      ))}
                    </select>

                    {/* Quantity */}
                    <input
                      type="number" min="1" step="1"
                      value={item.quantity}
                      onChange={e =>
                        updateItem(item._id, 'quantity',
                          Math.max(1, Number(e.target.value) || 1))}
                      style={numInput()}
                    />

                    {/* Unit price */}
                    <input
                      type="number" min="0" step="0.01"
                      value={item.unit_price}
                      onChange={e =>
                        updateItem(item._id, 'unit_price', Number(e.target.value) || 0)}
                      style={numInput()}
                    />

                    {/* Tax rate */}
                    <input
                      type="number" min="0" max="100" step="0.5"
                      value={item.tax_rate}
                      onChange={e =>
                        updateItem(item._id, 'tax_rate', Number(e.target.value) || 0)}
                      style={numInput()}
                    />

                    {/* Row total (subtotal + tax) */}
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      color: 'var(--text-primary)', textAlign: 'right',
                    }}>
                      {formatCurrency(s + t)}
                    </span>

                    {/* Remove button */}
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

              {/* Dashed add row at bottom */}
              <button
                type="button"
                onClick={addItem}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 6, marginTop: 12, width: '100%',
                  background: 'none',
                  border: '1.5px dashed var(--border)',
                  borderRadius: 10, padding: '9px 0',
                  cursor: 'pointer', color: 'var(--text-muted)',
                  fontSize: 13, fontFamily: 'inherit',
                }}
                onMouseEnter={e =>
                  e.currentTarget.style.borderColor = 'var(--accent-400)'}
                onMouseLeave={e =>
                  e.currentTarget.style.borderColor = 'var(--border)'}
              >
                + Add another line item
              </button>
            </SectionCard>
          </div>

          {/* ── RIGHT panel: summary + payment ────────────────────────── */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 16,
            position: 'sticky', top: 24,
          }}>

            {/* Order summary */}
            <SectionCard title="Order Summary">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <SummaryRow label="Subtotal"   value={formatCurrency(totals.subtotal)} />
                <SummaryRow label="Tax"        value={formatCurrency(totals.taxTotal)} muted />
                <div style={{
                  borderTop: '1.5px solid var(--border)',
                  paddingTop: 12, marginTop: 2,
                }}>
                  <SummaryRow
                    label="Grand Total"
                    value={formatCurrency(totals.grandTotal)}
                    bold
                  />
                </div>
              </div>
            </SectionCard>

            {/* Payment details */}
            <SectionCard title="Payment">
              <FormField label="Payment Method" style={{ marginBottom: 14 }}>
                <select
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

              <FormField label="Payment Status" style={{ marginBottom: 14 }}>
                <select
                  value={paymentStatus}
                  onChange={e => setPaymentStatus(e.target.value)}
                  style={selectStyle}
                >
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="pending">Unpaid</option>
                </select>
              </FormField>

              <FormField label="Notes (optional)">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Any notes for this invoice..."
                  style={{
                    width: '100%', padding: '9px 12px',
                    border: '1.5px solid var(--border)',
                    borderRadius: 10, fontSize: 13.5,
                    background: 'var(--bg-page)',
                    color: 'var(--text-primary)',
                    outline: 'none', resize: 'vertical',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
              </FormField>
            </SectionCard>

            {/* Submit */}
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
              <p style={{
                fontSize: 12, color: 'var(--text-muted)',
                textAlign: 'center', margin: 0,
              }}>
                Select a product for every line item to continue.
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
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 16, padding: 24,
    }}>
      {(title || action) && (
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 20,
        }}>
          {title && (
            <h3 style={{
              margin: 0, fontSize: 15, fontWeight: 700,
              color: 'var(--text-primary)',
            }}>
              {title}
            </h3>
          )}
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
      <span style={{
        fontSize: 13.5,
        color: muted ? 'var(--text-muted)' : 'var(--text-secondary)',
      }}>
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