// src/features/purchases/components/PurchaseLineItemRow.jsx
//
// Memoized single line-item row for the Create Purchase page.
// Only re-renders when ITS own props change (React.memo).
//
// PERF NOTES (preserved from original):
//   - Wrapped in React.memo so parent re-renders do not cascade here.
//   - Closed rows receive EMPTY_ARRAY as searchResults → no re-render on search.
//   - Stable handler refs via useCallback in the parent (CreatePurchasePage).
//
// NOTE: Unlike SaleLineItemRow, the product dropdown here is a plain
// position:absolute panel — no DropdownPortal needed. The purchases page
// does not have a scrollable overflow container above the rows, so clipping
// is not an issue.
//
// NUM_INPUT_STYLE is declared at module level (not inside the component) so it
// is created once, never re-created on render — same pattern as CreatePurchasePage.
//
// Extracted from CreatePurchasePage.jsx (Step 5.16 refactor) — zero behaviour change.

import { memo, useState } from 'react'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { selectStyle }    from '../../../shared/components/FormField'
import { NUM_INPUT_STYLE } from '../../../shared/constants/styles'

const PurchaseLineItemRow = memo(function PurchaseLineItemRow({
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
  const [hoveredProd, setHoveredProd] = useState(null)
  const s = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0)
  const t = s * ((Number(item.tax_rate) || 0) / 100)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 80px 130px 70px 130px 32px',
      gap: 10, alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>

      {/* Product search combobox */}
      <div style={{ position: 'relative' }}>
        {item.product_id ? (
          <div style={{
            display: 'flex', alignItems: 'center',
            gap: 6, padding: '8px 10px',
            border: '1.5px solid var(--accent-600)',
            borderRadius: 8, background: 'var(--bg-page)',
            fontSize: 13, color: 'var(--text-primary)',
          }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.prod_name}
            </span>
            <button
              type="button"
              onClick={() => onClearProduct(item._id)}
              title="Change product"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 0, lineHeight: 1 }}
            >×</button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={searchText}
              onChange={e => onSearchChange(item._id, e.target.value)}
              onFocus={() => onOpenDropdown(item._id)}
              onBlur={() => setTimeout(() => onCloseDropdown(item._id), 150)}
              placeholder="Type to search product…"
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
                      onMouseEnter={() => setHoveredProd(p.prod_id)}
                      onMouseLeave={() => setHoveredProd(null)}
                      style={{
                        padding: '9px 14px', cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: hoveredProd === p.prod_id ? 'var(--bg-subtle)' : 'transparent',
                      }}
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
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          Cost: {formatCurrency(p.prod_cost_price || 0)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          Stock: {p.prod_stock_qty ?? '—'}
                        </div>
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

      {/* Quantity */}
      <input
        type="number" min="1" step="1"
        value={item.quantity}
        onChange={e => onQtyChange(item._id, 'quantity', Math.max(1, Number(e.target.value) || 1))}
        style={NUM_INPUT_STYLE}
      />

      {/* Unit (cost) price */}
      <input
        type="number" min="0" step="0.01"
        value={item.unit_price}
        onChange={e => onPriceChange(item._id, 'unit_price', Number(e.target.value) || 0)}
        style={NUM_INPUT_STYLE}
      />

      {/* Tax % */}
      <input
        type="number" min="0" max="100" step="0.5"
        value={item.tax_rate}
        onChange={e => onTaxChange(item._id, 'tax_rate', Number(e.target.value) || 0)}
        style={NUM_INPUT_STYLE}
      />

      {/* Line total */}
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>
        {formatCurrency(s + t)}
      </span>

      {/* Remove */}
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
      >×</button>
    </div>
  )
})

export default PurchaseLineItemRow