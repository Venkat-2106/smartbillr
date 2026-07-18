import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';

// UI/UX Audit (2026-07-18) — Finding #13:
//   Added dirty-form protection: snapshot of initial form state via useState
//   initializer, useMemo for dirty comparison, window.confirm() on Back/Cancel,
//   and beforeunload handler when form is dirty. Prevents accidental data loss.
//   See UI_UX_AUDIT_REPORT.md
import { useNavigate } from 'react-router-dom';
import { Button, PageHeader, FormField } from '../../../shared/components';
import { selectStyle } from '../../../shared/components/FormField';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
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

const EMPTY_ARRAY = [];

export default function CreateSalePage() {
  const navigate = useNavigate();
  const business  = useAuthStore(s => s.business);
  const country   = business?.business_country_code || 'IN';
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
  } = useCreateSale();

  const [addItemHovered, setAddItemHovered] = useState(false);
  const customerRef = useRef(null);

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

  return (
    <>
      <PageHeader
        title="New Invoice"
        subtitle="Create a new sales invoice"
        back
        onBack={() => { if (confirmLeave()) navigate('/sales') }}
        action={
          <Button variant="ghost" onClick={() => { if (confirmLeave()) navigate('/sales') }} disabled={isPending}>
            Cancel
          </Button>
        }
      />

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
      />

      {/* FIX: Full-page spinner gate removed — form renders immediately.
          CustomerCombobox handles its own loading state via the `loading` prop. */}
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
            <div ref={customerRef}>
              <CustomerCombobox
                customers={customers}
                customerId={customerId}
                onChange={handleCustomerChange}
                onAddNew={handleOpenAddCust}
                loading={loadingCust}
              />
            </div>

            <BarcodeScanner
              value={barcodeInput}
              onChange={(val) => { setBarcodeInput(val); setBarcodeError(''); }}
              onKeyDown={handleBarcodeScan}
              loading={barcodeLoading}
              error={barcodeError}
              inputRef={barcodeRef}
            />
          </div>

          <div className="create-sale-grid" style={{
            display: 'grid',
            gridTemplateColumns: '1fr 360px',
            gap: 16,
            alignItems: 'start',
          }}>
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
            }}>
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
                }}
              >
                + Add another line item
              </button>
            </div>

            <div style={{
              display: 'flex', flexDirection: 'column', gap: 14,
              position: 'sticky', top: 24,
              maxHeight: 'calc(100dvh - 156px)',
              overflowY: 'auto',
            }}>
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
                  <OrderSummaryRow label="Subtotal"   value={formatCurrency(totals.subtotal, country)} />
                  {totals.autoDiscount > 0 && (
                    <OrderSummaryRow
                      label="You Saved (vs MRP)"
                      value={<span style={{ color: 'var(--success-text)' }}>{formatCurrency(totals.autoDiscount, country)}</span>}
                      muted
                    />
                  )}
                  <OrderSummaryRow label="Tax" value={formatCurrency(totals.taxTotal, country)} muted />
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
    </>
  );
}
