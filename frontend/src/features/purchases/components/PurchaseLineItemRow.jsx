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

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { selectStyle }    from '../../../shared/components/FormField'
import { NUM_INPUT_STYLE } from '../../../shared/constants/styles'
import useAuthStore from '../../../store/authStore'
import {
  DropdownMenu,
  DropdownMenuScroll,
  DropdownMenuItem,
  DropdownMenuEmpty,
  DropdownMenuHint,
} from '../../../shared/components/DropdownMenu'

const PurchaseLineItemRow = memo(function PurchaseLineItemRow({
  item,
  priceError,
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
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const scrollRef = useRef(null)
  const business  = useAuthStore(s => s.business)
  const country   = business?.business_country_code || 'IN'

  useEffect(() => {
    if (scrollRef.current && highlightedIndex >= 0) {
      const el = scrollRef.current.children[highlightedIndex]
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  const onSearchKeyDown = useCallback((e) => {
    if (!isOpen || searchResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => (prev + 1) % searchResults.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => (prev <= 0 ? searchResults.length - 1 : prev - 1))
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault()
      onProductSelect(item._id, searchResults[highlightedIndex])
    } else if (e.key === 'Escape') {
      onCloseDropdown(item._id)
    }
  }, [isOpen, searchResults, highlightedIndex, onProductSelect, onCloseDropdown, item._id])

  const resetHighlight = useCallback(() => setHighlightedIndex(-1), [])
  const s = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0)
  const t = s * ((Number(item.tax_rate) || 0) / 100)
  // COST-ABOVE-SELL FEATURE: only meaningful once a product is selected and
  // has a real sell price — sell_price of 0 means "not set", not "free".
  const isCostAboveSell = item.product_id && item.sell_price > 0 &&
    Number(item.unit_price) > item.sell_price

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
              onChange={e => { onSearchChange(item._id, e.target.value); resetHighlight(); }}
              onFocus={() => onOpenDropdown(item._id)}
              onBlur={() => setTimeout(() => { onCloseDropdown(item._id); resetHighlight(); }, 150)}
              onKeyDown={onSearchKeyDown}
              placeholder="Type to search product…"
              autoComplete="off"
              style={{ ...selectStyle, fontSize: 13, padding: '8px 10px' }}
            />
            {isOpen && searchText.length >= 2 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0,
                zIndex: 300,
              }}>
                <DropdownMenu>
                  <DropdownMenuScroll ref={scrollRef}>
                  {searchResults.length === 0 ? (
                    <DropdownMenuEmpty>
                      No products found for &quot;{searchText}&quot;
                    </DropdownMenuEmpty>
                  ) : (
                    searchResults.map((p, idx) => (
                      <DropdownMenuItem
                        key={p.prod_id}
                        highlighted={idx === highlightedIndex || hoveredProd === p.prod_id}
                        onMouseDown={() => onProductSelect(item._id, p)}
                        onMouseEnter={() => { setHoveredProd(p.prod_id); setHighlightedIndex(idx); }}
                        onMouseLeave={() => setHoveredProd(null)}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {p.prod_name}
                          </div>
                          {p.barcode && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              {p.barcode}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            Cost: {formatCurrency(p.prod_cost_price || 0, country)}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                            Stock: {p.prod_stock_qty ?? '—'}
                          </div>
                        </div>
                      </DropdownMenuItem>
                    ))
                  )}
                  </DropdownMenuScroll>
                </DropdownMenu>
              </div>
            )}
            {isOpen && searchText.length > 0 && searchText.length < 2 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0,
                zIndex: 300,
              }}>
                <DropdownMenu>
                  <DropdownMenuHint>
                    Type at least 2 characters to search
                  </DropdownMenuHint>
                </DropdownMenu>
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
      <div style={{ position: 'relative' }}>
        <input
          type="number" min="0" step="0.01"
          value={item.unit_price}
          onChange={e => onPriceChange(item._id, 'unit_price', Number(e.target.value) || 0)}
          style={{
            ...NUM_INPUT_STYLE,
            borderColor: priceError ? 'var(--danger-border, #ef4444)' : undefined,
          }}
        />
        {priceError && (
          <div style={{ fontSize: 11, color: 'var(--danger-text, #ef4444)', marginTop: 2, lineHeight: 1.3 }}>
            Enter a unit price
          </div>
        )}
        {isCostAboveSell && (
          <div
            className="badge-warning"
            title={`Cost price exceeds the current sell price of ${formatCurrency(item.sell_price, country)}`}
            style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 3,
              fontSize: 10, padding: '2px 6px', borderRadius: 5,
              border: '1px solid', whiteSpace: 'nowrap', zIndex: 5,
            }}
          >
            Above sell price
          </div>
        )}
      </div>

      {/* Tax % */}
      <input
        type="number" min="0" max="100" step="0.5"
        value={item.tax_rate}
        onChange={e => onTaxChange(item._id, 'tax_rate', Number(e.target.value) || 0)}
        style={NUM_INPUT_STYLE}
      />

      {/* Line total */}
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>
        {formatCurrency(s + t, country)}
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