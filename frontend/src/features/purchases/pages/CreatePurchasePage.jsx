// src/features/purchases/pages/CreatePurchasePage.jsx
//
// Create Purchase page — mirrors CreateSalePage architecture exactly.
//
// ARCHITECTURE:
//   - Supplier selection via lean combobox (GET /suppliers/lean)
//   - Product search via lean search (GET /products/search?q=)
//   - Line items: quantity + unit (cost) price + tax rate from product
//   - Right panel: Order summary + Payment status
//   - Submits POST /purchases with items array
//   - On success: redirects to /purchases
//
// PERF:
//   - React.memo PurchaseLineItemRow (same FIX 1 pattern as CreateSalePage)
//   - useCallback([]) for all stable handlers (FIX 2)
//   - EMPTY_ARRAY stable reference for closed dropdowns (FIX 1 key)
//   - Module-level NUM_INPUT_STYLE constant (FIX 4)
//   - No product pre-loading — server-side search on demand (≥2 chars)

import { useState, useMemo, useCallback } from 'react'
import { useNavigate }          from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast }                from 'react-hot-toast'
import { createPurchase, fetchSuppliersLean } from '../api/purchasesApi'
import { searchProductsLean }   from '../../sales/api/salesApi'
import { Button, PageHeader, FormField, Spinner } from '../../../shared/components'
import { selectStyle }          from '../../../shared/components/FormField'
import { formatCurrency }       from '../../../shared/utils/formatCurrency'
import useAuthStore             from '../../../store/authStore'
import { useDebounce }          from '../../../shared/hooks/useDebounce'
import PurchaseLineItemRow      from '../components/PurchaseLineItemRow'
import PurchaseOrderSummaryRow  from '../components/PurchaseOrderSummaryRow'
import PurchaseSectionCard      from '../components/PurchaseSectionCard'
import { NUM_INPUT_STYLE } from '../../../shared/constants/styles'

// Stable empty array — passed to closed dropdown rows so React.memo skips re-render
const EMPTY_ARRAY = []

const dropItemStyle = {
  padding: '10px 14px',
  cursor: 'pointer',
  borderBottom: '1px solid var(--border)',
}

// Unique line item ID (client-side only, never sent to backend)
const newItem = () => ({
  _id:        `${Date.now()}-${Math.random()}`,
  product_id: '',
  prod_name:  '',
  unit_price: 0,   // cost/purchase price
  quantity:   1,
  tax_rate:   0,
})

export default function CreatePurchasePage() {
  const navigate    = useNavigate()
  const queryClient = useQueryClient()

  // ── Form state ───────────────────────────────────────────────────────────
  const [suppId,        setSuppId]        = useState('')
  const [paymentStatus, setPaymentStatus] = useState('pending')
  const [discount,      setDiscount]      = useState('')
  const [items,         setItems]         = useState([newItem()])

  // ── Supplier combobox state ───────────────────────────────────────────────
  const [suppSearch,       setSuppSearch]       = useState('')
  const [suppDropOpen,     setSuppDropOpen]      = useState(false)
  const [selectedSuppName, setSelectedSuppName] = useState('')

  // ── Per-item product search state ─────────────────────────────────────────
  const [searchMap,        setSearchMap]   = useState({})
  const [openDropMap,      setOpenDropMap] = useState({})
  const [activeItemSearch, setActiveItemSearch] = useState('')
  const debouncedProductSearch = useDebounce(activeItemSearch, 250)

  // ── Fetch lean supplier list ──────────────────────────────────────────────
  const { data: allSuppliers = [], isLoading: loadingSupp } = useQuery({
    queryKey: ['suppliers-lean'],
    queryFn:  fetchSuppliersLean,
    staleTime: 5 * 60 * 1000,
  })

  // ── Lean product search — fires on debounced keystroke (≥2 chars) ─────────
  const { data: productSearchResults = [] } = useQuery({
    queryKey: ['products-search-lean', debouncedProductSearch],
    queryFn:  () => searchProductsLean(debouncedProductSearch),
    enabled:  debouncedProductSearch.length >= 2,
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  })

  // ── Supplier combobox filtered list ──────────────────────────────────────
  const filteredSuppliers = useMemo(() => {
    const q = suppSearch.trim().toLowerCase()
    if (!q) return allSuppliers.slice(0, 30)
    return allSuppliers.filter(s =>
      s.supp_name?.toLowerCase().includes(q) ||
      (s.supp_phone && s.supp_phone.includes(suppSearch.trim()))
    )
  }, [allSuppliers, suppSearch])

  // ── Supplier combobox handlers ───────────────────────────────────────────
  const handleSuppInputChange = (e) => {
    setSuppSearch(e.target.value)
    setSelectedSuppName('')
    setSuppId('')
    setSuppDropOpen(true)
  }

  const handleSuppSelect = (s) => {
    setSuppId(s.supp_id)
    setSelectedSuppName(s.supp_name + (s.supp_phone ? ` — ${s.supp_phone}` : ''))
    setSuppSearch('')
    setSuppDropOpen(false)
  }

  const handleWalkInSelect = () => {
    setSuppId('')
    setSelectedSuppName('')
    setSuppSearch('')
    setSuppDropOpen(false)
  }

  // ── Add-item button hover state ───────────────────────────────────────────
  const [addBtnHovered, setAddBtnHovered] = useState(false)

  // ── Line item handlers — stable useCallback ([]) ─────────────────────────
  const handleItemSearchChange = useCallback((itemId, text) => {
    setSearchMap(prev   => ({ ...prev, [itemId]: text }))
    setOpenDropMap(prev => ({ ...prev, [itemId]: true }))
    setActiveItemSearch(text)
  }, [])

  const handleProductSelect = useCallback((itemId, product) => {
    setItems(prev => prev.map(item => {
      if (item._id !== itemId) return item
      return {
        ...item,
        product_id: product.prod_id,
        prod_name:  product.prod_name,
        unit_price: Number(product.prod_cost_price) || 0,
        tax_rate:   Number(product.tax_rate) || 0,
      }
    }))
    setSearchMap(prev   => ({ ...prev, [itemId]: '' }))
    setOpenDropMap(prev => ({ ...prev, [itemId]: false }))
    setActiveItemSearch('')
  }, [])

  const handleCloseDropdown = useCallback((itemId) => {
    setOpenDropMap(prev => ({ ...prev, [itemId]: false }))
    setSearchMap(prev => ({ ...prev, [itemId]: '' }))
    setActiveItemSearch('')
  }, [])

  const handleOpenDropdown = useCallback((itemId) => {
    setOpenDropMap(prev => ({ ...prev, [itemId]: true }))
  }, [])

  const handleClearProduct = useCallback((itemId) => {
    setItems(prev => prev.map(i =>
      i._id === itemId
        ? { ...i, product_id: '', prod_name: '', unit_price: 0, tax_rate: 0 }
        : i
    ))
  }, [])

  const addItem = () => setItems(prev => [...prev, newItem()])

  const updateItem = useCallback((id, field, value) =>
    setItems(prev => prev.map(item =>
      item._id === id ? { ...item, [field]: value } : item
    )), [])

  const removeItem = useCallback((id) =>
    setItems(prev => prev.filter(i => i._id !== id)), [])

  // ── Running totals ────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let subtotal = 0
    let taxTotal = 0
    items.forEach(item => {
      const s = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0)
      const t = s * ((Number(item.tax_rate) || 0) / 100)
      subtotal += s
      taxTotal += t
    })
    const discountAmt = Number(discount) || 0
    const grandTotal  = subtotal - discountAmt + taxTotal
    return { subtotal, taxTotal, discountAmt, grandTotal }
  }, [items, discount])

  // ── Form validation ───────────────────────────────────────────────────────
  const isValid = useMemo(() =>
    items.length > 0 &&
    items.every(i => i.product_id && Number(i.quantity) >= 1 && Number(i.unit_price) >= 0),
    [items]
  )

  // ── Build POST body ───────────────────────────────────────────────────────
  const buildBody = useCallback(() => ({
    supp_id:            suppId || null,
    pur_discount:       Number(discount) || 0,
    pur_payment_status: paymentStatus,
    items: items.map(i => ({
      product_id:      i.product_id,
      pur_item_qty:    Number(i.quantity),
      item_unit_price: Number(i.unit_price),
    })),
  }), [suppId, discount, paymentStatus, items])

  // ── Create purchase mutation ─────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: createPurchase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['products-search-lean'] })
      toast.success('Purchase created successfully!')
      navigate('/purchases')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to create purchase')
    },
  })

  const handleSubmit = () => {
    if (!isValid) {
      toast.error('Select a product and enter a valid quantity for every line item.')
      return
    }
    mutation.mutate(buildBody())
  }

  const isPageLoading = loadingSupp

  return (
    <>
      <PageHeader
        title="New Purchase"
        subtitle="Record a stock purchase from a supplier"
        back
        onBack={() => navigate('/purchases')}
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" onClick={() => navigate('/purchases')} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={mutation.isPending}
              disabled={!isValid || isPageLoading}
            >
              Create Purchase
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

          {/* ── LEFT panel ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Supplier card */}
            <PurchaseSectionCard title="Supplier">
              <FormField label="Search by name or phone">
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={selectedSuppName || suppSearch}
                    onChange={handleSuppInputChange}
                    onFocus={() => setSuppDropOpen(true)}
                    onBlur={() => setTimeout(() => setSuppDropOpen(false), 150)}
                    placeholder="Type supplier name or phone…"
                    autoComplete="off"
                    style={{
                      ...selectStyle,
                      cursor: 'text',
                      borderColor: suppId ? 'var(--accent-600)' : undefined,
                    }}
                  />

                  {suppId && (
                    <button
                      type="button"
                      onClick={handleWalkInSelect}
                      title="Clear supplier"
                      style={{
                        position: 'absolute', right: 10, top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none', border: 'none',
                        cursor: 'pointer', color: 'var(--text-muted)',
                        fontSize: 18, lineHeight: 1, padding: 2,
                      }}
                    >×</button>
                  )}

                  {suppDropOpen && !suppId && (
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
                          No Supplier (cash purchase)
                        </span>
                      </div>
                      {filteredSuppliers.length === 0 ? (
                        <div style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                          No suppliers match "{suppSearch}"
                        </div>
                      ) : (
                        filteredSuppliers.map(s => (
                          <div key={s.supp_id} onMouseDown={() => handleSuppSelect(s)} style={dropItemStyle}>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {s.supp_name}
                            </div>
                            {s.supp_phone && (
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                                {s.supp_phone}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {suppId && selectedSuppName && (
                  <div style={{ fontSize: 12, color: 'var(--accent-600)', marginTop: 5, fontWeight: 600 }}>
                    ✓ {selectedSuppName}
                  </div>
                )}
              </FormField>
            </PurchaseSectionCard>

            {/* Line items card */}
            <PurchaseSectionCard title="Line Items">
              {/* Column headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 130px 70px 130px 32px',
                gap: 10, paddingBottom: 10,
                borderBottom: '1px solid var(--border)', marginBottom: 4,
              }}>
                {['Product', 'Qty', 'Cost Price', 'Tax %', 'Total', ''].map((h, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                  }}>
                    {h}
                  </span>
                ))}
              </div>

              {items.map(item => (
                <PurchaseLineItemRow
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

              <button
                type="button"
                onClick={addItem}
                onMouseEnter={() => setAddBtnHovered(true)}
                onMouseLeave={() => setAddBtnHovered(false)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 6, marginTop: 12, width: '100%',
                  background: 'none', border: `1.5px dashed ${addBtnHovered ? 'var(--accent-400)' : 'var(--border)'}`,
                  borderRadius: 10, padding: '9px 0',
                  cursor: 'pointer', color: 'var(--text-muted)',
                  fontSize: 13, fontFamily: 'inherit',
                }}
              >
                + Add another line item
              </button>
            </PurchaseSectionCard>
          </div>

          {/* ── RIGHT panel ─────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 16,
            position: 'sticky', top: 24,
            maxHeight: 'calc(100dvh - 156px)',
            overflowY: 'auto',
          }}>
            <PurchaseSectionCard title="Order Summary">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <PurchaseOrderSummaryRow label="Subtotal" value={formatCurrency(totals.subtotal)} />
                {totals.taxTotal > 0 && (
                  <PurchaseOrderSummaryRow label="Tax" value={formatCurrency(totals.taxTotal)} muted />
                )}
                {totals.discountAmt > 0 && (
                  <PurchaseOrderSummaryRow
                    label="Discount"
                    value={<span style={{ color: '#059669' }}>−{formatCurrency(totals.discountAmt)}</span>}
                    muted
                  />
                )}
                <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 12, marginTop: 2 }}>
                  <PurchaseOrderSummaryRow label="Grand Total" value={formatCurrency(totals.grandTotal)} bold />
                </div>
              </div>
            </PurchaseSectionCard>

            <PurchaseSectionCard title="Payment">
              <FormField label="Discount (flat amount)" style={{ marginBottom: 14 }}>
                <input
                  type="number" min="0" step="0.01"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  placeholder="0.00"
                  style={NUM_INPUT_STYLE}
                />
              </FormField>

              <FormField label="Payment Status" style={{ marginBottom: 0 }}>
                <select
                  value={paymentStatus}
                  onChange={e => setPaymentStatus(e.target.value)}
                  style={selectStyle}
                >
                  <option value="pending">Unpaid (Pending)</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                </select>
              </FormField>
            </PurchaseSectionCard>

            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={mutation.isPending}
              disabled={!isValid}
              style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 700 }}
            >
              Create Purchase →
            </Button>

            {!isValid && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                Select a product for every line item to continue.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
