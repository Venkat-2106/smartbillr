import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

// UI/UX Audit (2026-07-18) — Finding #13:
//   Added dirty-form protection: snapshot of initial form state via useState
//   initializer, useMemo for dirty comparison, window.confirm() on Back/Cancel,
//   and beforeunload handler when form is dirty. Prevents accidental data loss.
//   See UI_UX_AUDIT_REPORT.md
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Button, FormField, Modal } from '../../../shared/components';
import { selectStyle } from '../../../shared/components/FormField';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { getTaxLabel } from '../../../shared/utils/formatTax';
import { NUM_INPUT_STYLE } from '../../../shared/constants/styles';
import SaleLineItemRow from '../components/SaleLineItemRow';
import OrderSummaryRow from '../components/OrderSummaryRow';
import AddCustomerModal from '../components/AddCustomerModal';
import StockOverrideModal from '../components/StockOverrideModal';
import CustomerCombobox from '../components/CustomerCombobox';
import BarcodeScanner from '../components/BarcodeScanner';
import useCreateSale from '../hooks/useCreateSale';
import { useShortcut } from '../../../shared/hooks/useShortcut';
import useAuthStore from '../../../store/authStore';
import { usePermissions } from '../../../shared/hooks/usePermissions';
import SaleDetailDrawer from '../components/SaleDetailDrawer';
import { updateSaleStatus } from '../api/salesApi';

const EMPTY_ARRAY = [];

const CARD_STYLE = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 16,
};

const CARD_TITLE_STYLE = {
  margin: '0 0 14px',
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--text-primary)',
};

export default function CreateSalePage({ standalone = false }) {
  const navigate = useNavigate();
  const business  = useAuthStore(s => s.business);
  const country   = business?.business_country_code || 'IN';
  const isGstRegistered = business?.is_gst_registered || false;
  const taxLabel = getTaxLabel(country, isGstRegistered);
  const { isAdmin, isManager } = usePermissions();
  // Stock override RBAC: only admin/manager can approve selling below available
  // stock.  Staff see the StockOverrideModal but with a "ask a manager" message
  // and no override button.  Backend also enforces this (sale.py create_sale).
  const canOverrideStock = isAdmin || isManager;

  // ── Standalone mode: show invoice drawer + reset form after creation ──
  const [createdSale, setCreatedSale] = useState(null);
  const queryClient = useQueryClient();
  const statusMutation = useMutation({
    mutationFn: ({ id, status, paid_amount }) => updateSaleStatus(id, status, paid_amount),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sale', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['sales-trend'] });
      const msg = data?.data?.note || 'Payment status updated';
      toast.success(msg);
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || 'Failed to update status'),
  });

  const resetFormRef = useRef(null);

  const {
    customers, loadingCust,
    customerId, handleCustomerChange,
    barcodeInput, setBarcodeInput, barcodeError, setBarcodeError,
    barcodeLoading, barcodeRef, handleBarcodeScan,
    items, searchMap, openDropMap, productSearchResults,
    handleItemSearchChange, handleProductSelect,
    handleCloseDropdown, handleOpenDropdown, handleClearProduct,
    addItem, updateItem, removeItem,
    paymentMethod, setPaymentMethod, paymentStatus, setPaymentStatus,
    paidAmount, setPaidAmount,
    autoPrint, handleAutoPrintChange,
    showAddCustModal, newCustName, newCustPhone, newCustEmail,
    newCustCountry, newCustState, addCustLoading,
    setNewCustName, setNewCustPhone, setNewCustEmail,
    handleCountryChange, setNewCustState,
    handleCloseAddCustModal, handleAddNewCustomerSubmit,
    handleOpenAddCust,
    stockErrors, handleStockOverrideConfirm, handleStockOverrideCancel,
    totals, isValid,
    handleSubmit, isPending,
    parsedPaidAmount,
    shouldResetRef, resetForm,
  } = useCreateSale(standalone
    ? { onCreated: (data) => {
        setCreatedSale({
          sales_id:   data.sales_id,
          invoice_no: data.invoice_no,
          _autoPrint: data.autoPrint,
        });
        resetFormRef.current?.();
      }}
    : undefined
  );
  useEffect(() => { resetFormRef.current = resetForm; }, [resetForm]);

  const [addItemHovered, setAddItemHovered] = useState(false);
  const customerRef = useRef(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // ── Dirty-form protection ────────────────────────────────────────────────
  const [initialState] = useState(() => ({
    items: JSON.parse(JSON.stringify(items)),
    customerId,
    paymentMethod,
    paymentStatus,
    paidAmount,
  }))
  const isDirty = useMemo(() => (
    JSON.stringify(items) !== JSON.stringify(initialState.items) ||
    customerId !== initialState.customerId ||
    paymentMethod !== initialState.paymentMethod ||
    paymentStatus !== initialState.paymentStatus ||
    paidAmount !== initialState.paidAmount
  ), [items, customerId, paymentMethod, paymentStatus, paidAmount, initialState])

  const confirmLeave = useCallback(() => {
    if (!isDirty) return true
    return window.confirm('You have unsaved changes. Are you sure you want to leave?')
  }, [isDirty])

  useEffect(() => {
    const handler = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  useShortcut('alt+p', () => { addItem(); }, { preventDefault: true })
  useShortcut('ctrl+shift+c', () => {
    const selects = document.querySelectorAll('.sb-select')
    if (selects.length > 0) selects[0].focus()
    else customerRef.current?.querySelector('input,select')?.focus()
  }, { preventDefault: true })
  useShortcut('ctrl+m', () => { setPaymentStatus('paid'); }, { preventDefault: true })

  const handleSaveAndNew = useCallback(() => {
    if (!isValid) return;
    shouldResetRef.current = true;
    resetForm();
    handleSubmit();
  }, [isValid, shouldResetRef, resetForm, handleSubmit]);

  const handleSaveAndPrint = useCallback(() => {
    handleAutoPrintChange(true);
    handleSubmit();
  }, [handleAutoPrintChange, handleSubmit]);

  // FIX (2026-07-25): Only sum items that have a product selected.
  // The trailing empty placeholder row (from newItem()) has quantity: 1 but
  // no product_id — it must not contribute to the displayed total. Without
  // this guard the "Total Quantity" badge initialised at 1 on page load.
  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + (item.product_id ? (Number(item.quantity) || 0) : 0), 0),
    [items]
  );

  return (
    // FIX (2026-07-25): Flex-column wrapper fills the scrollable <main> area
    // so the line-items scroll region can flex to fill remaining viewport
    // height instead of relying on a hardcoded maxHeight calculation.
    // minHeight: 0 allows flex children to shrink below their content size.
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
    }}>
      {/* ── Modals ─────────────────────────────────────────────────── */}
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
        onCountryChange={handleCountryChange}
        onStateChange={setNewCustState}
        onSubmit={handleAddNewCustomerSubmit}
      />

      <StockOverrideModal
        stockErrors={stockErrors}
        isPending={isPending}
        onCancel={handleStockOverrideCancel}
        onConfirm={handleStockOverrideConfirm}
        canOverride={canOverrideStock}
      />

      {/* ── Preview Modal ──────────────────────────────────────────── */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Invoice Preview" size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Customer</div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {customers.find(c => c.cust_id === customerId)?.cust_name || 'Walk-in Customer'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Line Items</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.filter(i => i.product_id).map(item => (
                <div key={item._id} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                  gap: 12, alignItems: 'center',
                  padding: '8px 12px', borderRadius: 8,
                  background: 'var(--bg-subtle)',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.prod_name}</div>
                    {item.barcode && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.barcode}</div>}
                  </div>
                  <span style={{ color: 'var(--text-secondary)' }}>×{item.quantity}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{formatCurrency(item.unit_price, country)}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>
                    {formatCurrency(((Number(item.unit_price) || 0) * (Number(item.quantity) || 0)) * (1 + (Number(item.tax_rate) || 0) / 100), country)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Subtotal</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(totals.subtotal, country)}</span>
            </div>
            {totals.autoDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>You Saved</span>
                <span style={{ color: 'var(--success-text)' }}>{formatCurrency(totals.autoDiscount, country)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{taxLabel}</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(totals.taxTotal, country)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Grand Total</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 16 }}>{formatCurrency(totals.grandTotal, country)}</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Payment</div>
            <div style={{ display: 'flex', gap: 16, color: 'var(--text-secondary)' }}>
              <span>Method: <strong style={{ color: 'var(--text-primary)' }}>{paymentMethod}</strong></span>
              <span>Status: <strong style={{ color: 'var(--text-primary)' }}>{paymentStatus}</strong></span>
              {paymentStatus === 'partial' && parsedPaidAmount > 0 && (
                <span>Paid: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(parsedPaidAmount, country)}</strong></span>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Top action bar ─────────────────────────────────────────── */}
      {/* flexShrink: 0 — never compress the header within the flex layout */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, gap: 16, flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => { if (confirmLeave()) { standalone ? window.close() : navigate('/sales') } }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 13, fontWeight: 500,
              fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
              padding: 0, transition: 'color 0.14s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5m7-7l-7 7 7 7"/>
            </svg>
            Back
          </button>
          <h1 style={{
            margin: 0, fontSize: 22, fontWeight: 800,
            color: 'var(--text-primary)', letterSpacing: '-0.5px', lineHeight: 1.15,
            fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
          }}>
            Create Sales Invoice
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => { if (confirmLeave()) { standalone ? window.close() : navigate('/sales') } }} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={isPending} disabled={!isValid}>
            Save
          </Button>
          <Button variant="secondary" onClick={handleSaveAndNew} loading={isPending} disabled={!isValid}>
            Save & New
          </Button>
          <Button variant="secondary" onClick={handleSaveAndPrint} loading={isPending} disabled={!isValid}>
            Save & Print
          </Button>
          <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
            Preview
          </Button>
        </div>
      </div>

      {/* ── Customer + Payment Info cards ───────────────────────────── */}
      {/* className targets responsive CSS: stacks to single column at ≤900px.
          flexShrink: 0 — fixed section that must not compress. */}
      <div className="create-sale-info-grid" style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 16, marginBottom: 16, alignItems: 'start',
        flexShrink: 0,
      }}>
        <div style={CARD_STYLE}>
          <h3 style={CARD_TITLE_STYLE}>Customer Information</h3>
          <div ref={customerRef}>
            <CustomerCombobox
              customers={customers}
              customerId={customerId}
              onChange={handleCustomerChange}
              onAddNew={handleOpenAddCust}
              loading={loadingCust}
            />
          </div>
        </div>

        <div style={CARD_STYLE}>
          <h3 style={CARD_TITLE_STYLE}>Payment Information</h3>
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
                className="sb-select"
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
                placeholder={`Max ${formatCurrency(totals.grandTotal - 0.01, country)}`}
                style={{
                  ...NUM_INPUT_STYLE,
                  borderColor:
                    paidAmount && !(paymentStatus !== 'partial' || (Number(paidAmount) > 0 && Number(paidAmount) < totals.grandTotal))
                      ? 'var(--danger-text)'
                      : Number(paidAmount) > 0 && (paymentStatus !== 'partial' || (Number(paidAmount) > 0 && Number(paidAmount) < totals.grandTotal))
                        ? 'var(--accent-600)'
                        : undefined,
                }}
              />
              {paidAmount && !(paymentStatus !== 'partial' || (Number(paidAmount) > 0 && Number(paidAmount) < totals.grandTotal)) && (
                <div style={{ fontSize: 12, color: 'var(--danger-text)', marginTop: 4 }}>
                  {Number(paidAmount) <= 0
                    ? 'Amount must be greater than 0'
                    : `Cannot exceed total (${formatCurrency(totals.grandTotal, country)})`}
                </div>
              )}
              {Number(paidAmount) > 0 && (paymentStatus !== 'partial' || (Number(paidAmount) > 0 && Number(paidAmount) < totals.grandTotal)) && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Remaining: {formatCurrency(totals.grandTotal - Number(paidAmount), country)}
                </div>
              )}
            </FormField>
          )}
        </div>
      </div>

      {/* ── Main body: line items (left) + summary sidebar (right) ── */}
      {/* flex: 1 + minHeight: 0 — this grid fills all remaining vertical
          space in the page flex column. Responsive CSS narrows the sidebar
          at ≤1200px (300px) and stacks to single column at ≤900px. */}
      <div className="create-sale-grid" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 360px',
        gap: 16,
        alignItems: 'start',
        flex: 1,
        minHeight: 0,
      }}>
        {/* Left column — barcode + line items */}
        {/* flex: 1 + minHeight: 0 — propagate available height down to the
            line-items card so its scroll region can fill remaining space. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
          {/* Barcode Scanner */}
          <div style={CARD_STYLE}>
            <BarcodeScanner
              value={barcodeInput}
              onChange={(val) => { setBarcodeInput(val); setBarcodeError(''); }}
              onKeyDown={handleBarcodeScan}
              loading={barcodeLoading}
              error={barcodeError}
              inputRef={barcodeRef}
            />
          </div>

          {/* Line items table */}
          {/* flex column so the header stays fixed and the scroll region
              fills the remaining height (flex: 1 + minHeight: 0). */}
          <div style={{ ...CARD_STYLE, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Table header — flexShrink: 0 keeps it pinned above the scroll area */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr 90px 100px 72px 110px 72px 100px 28px',
              gap: 8, paddingBottom: 8,
              borderBottom: '1px solid var(--border)', marginBottom: 4,
              flexShrink: 0,
            }}>
              {['#', 'Product', 'Barcode', 'Qty', 'Unit Price', `${taxLabel} %`, 'Stock', 'Total', ''].map((h, i) => (
                <span key={i} style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Scrollable row area — flex: 1 + minHeight: 0 makes this
                fill the remaining height inside the flex-column card,
                replacing the old hardcoded maxHeight: calc(100dvh - 460px)
                which did not account for topbar + page padding. */}
            <div style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'visible',
              marginRight: -8,
              paddingRight: 8,
            }}>
              {items.map((item, index) => (
                <SaleLineItemRow
                  key={item._id}
                  serial={index + 1}
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
                  background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
                  borderRadius: 8, fontSize: 12, color: 'var(--warning-text)', fontWeight: 500,
                }}>
                  ⚠ One or more items exceed available stock. You will be asked to confirm before saving.
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={addItem}
              onMouseEnter={() => setAddItemHovered(true)}
              onMouseLeave={() => setAddItemHovered(false)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, marginTop: 10, width: '100%',
                background: 'none',
                border: `1.5px dashed ${addItemHovered ? 'var(--accent-400)' : 'var(--border)'}`,
                borderRadius: 'var(--r-md)', padding: '8px 0',
                cursor: 'pointer', color: addItemHovered ? 'var(--accent-600)' : 'var(--text-muted)',
                fontSize: 13, fontFamily: 'inherit',
                transition: 'border-color 0.15s, color 0.15s',
                flexShrink: 0,
              }}
            >
              + Add another line item
            </button>
          </div>
        </div>

        {/* Right column — summary sidebar */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 14,
          position: 'sticky', top: 24,
          maxHeight: 'calc(100dvh - 156px)',
          overflowY: 'auto',
        }}>
          <div style={CARD_STYLE}>
            <h3 style={CARD_TITLE_STYLE}>Order Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <OrderSummaryRow label="Total Items" value={items.filter(i => i.product_id).length} />
              <OrderSummaryRow label="Total Quantity" value={totalQuantity} />
              <OrderSummaryRow label="Subtotal"   value={formatCurrency(totals.subtotal, country)} />
              {totals.autoDiscount > 0 && (
                <OrderSummaryRow
                  label="You Saved (vs MRP)"
                  value={<span style={{ color: 'var(--success-text)' }}>{formatCurrency(totals.autoDiscount, country)}</span>}
                  muted
                />
              )}
              <OrderSummaryRow label={taxLabel} value={formatCurrency(totals.taxTotal, country)} muted />
              <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
                <OrderSummaryRow label="Grand Total" value={formatCurrency(totals.grandTotal, country)} bold />
              </div>
              {paymentStatus === 'partial' && parsedPaidAmount > 0 && (
                <>
                  <OrderSummaryRow label="Paid Now" value={formatCurrency(parsedPaidAmount, country)} />
                  <OrderSummaryRow
                    label="Remaining Due"
                    value={
                      <span style={{ color: 'var(--danger-text)', fontWeight: 700 }}>
                        {formatCurrency(Math.max(0, totals.grandTotal - parsedPaidAmount), country)}
                      </span>
                    }
                  />
                </>
              )}
            </div>
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13, color: 'var(--text-secondary)',
            cursor: 'pointer', userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={e => handleAutoPrintChange(e.target.checked)}
              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent-600)' }}
            />
            Open print preview after creating invoice
          </label>

          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isPending}
            disabled={!isValid}
            style={{ width: '100%', padding: '13px', fontSize: 15, fontWeight: 700 }}
          >
            Create Invoice →
          </Button>

          {!isValid && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
              {paymentStatus === 'partial' && (Number(paidAmount) <= 0 || Number(paidAmount) >= totals.grandTotal)
                ? 'Enter a valid paid amount to continue.'
                : 'Select a product for every line item to continue.'}
            </p>
          )}
        </div>
      </div>

      {/* ── Standalone: invoice detail drawer ──────────────────────── */}
      {standalone && createdSale && (
        <SaleDetailDrawer
          sale={createdSale}
          onClose={() => setCreatedSale(null)}
          statusMutation={statusMutation}
        />
      )}
    </div>
  );
}
