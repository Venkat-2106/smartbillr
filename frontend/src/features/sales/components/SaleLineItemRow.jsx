// src/features/sales/components/SaleLineItemRow.jsx
//
// Memoized single line-item row for the Create Invoice page.
// Only re-renders when ITS own props change (React.memo).
//
// PERF NOTES (preserved from original):
//   FIX 1  — Wrapped in React.memo so parent re-renders do not cascade here.
//   FIX L3 — Grid template '2fr 80px 110px 72px 100px 28px' matches the
//             column header row in CreateSalePage — product gets 2× the
//             remaining space (~240-400px on typical viewports).
//
// NUM_INPUT_STYLE is declared at module level (not inside the component) so it
// is created once, never re-created on render — same pattern as CreateSalePage.
//
// Extracted from CreateSalePage.jsx (Step 5.16 refactor) — zero behaviour change.

import { memo, useRef } from 'react';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { selectStyle } from '../../../shared/components/FormField';
import { NUM_INPUT_STYLE } from '../../../shared/constants/styles';
import ProductSearchDropdownPortal from './ProductSearchDropdownPortal';

const SaleLineItemRow = memo(function SaleLineItemRow({
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
  const comboRef = useRef(null);

  return (
    /* FIX L3: grid template matches updated header */
    <div style={{
      display: 'grid',
      gridTemplateColumns: '2fr 80px 110px 72px 100px 28px',
      gap: 8, alignItems: 'center',
      padding: '9px 0',
      borderBottom: '1px solid var(--border)',
    }}>

      {/* Product search combobox */}
      <div ref={comboRef} style={{ position: 'relative' }}>
        {item.product_id ? (
          <div style={{
            display: 'flex', alignItems: 'center',
            gap: 6, padding: '7px 9px',
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
          <>
            <input
              type="text"
              value={searchText}
              onChange={e => onSearchChange(item._id, e.target.value)}
              onFocus={() => onOpenDropdown(item._id)}
              onBlur={() => setTimeout(() => onCloseDropdown(item._id), 150)}
              placeholder="Type to search…"
              autoComplete="off"
              style={{ ...selectStyle, fontSize: 13, padding: '7px 9px' }}
            />
            {isOpen && searchText.length >= 2 && (
              <ProductSearchDropdownPortal anchorRef={comboRef}>
              <div style={{
                background: 'var(--bg-card)',
                border: '1.5px solid var(--border)',
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
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
                        transition: 'background 0.1s',
                      }}
                      className="search-result-item"
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
              </ProductSearchDropdownPortal>
            )}
            {isOpen && searchText.length > 0 && searchText.length < 2 && (
              <ProductSearchDropdownPortal anchorRef={comboRef}>
              <div style={{
                background: 'var(--bg-card)', border: '1.5px solid var(--border)',
                borderRadius: 10, padding: '10px 14px',
                fontSize: 12.5, color: 'var(--text-muted)',
              }}>
                Type at least 2 characters to search
              </div>
              </ProductSearchDropdownPortal>
            )}
          </>
        )}
      </div>

      {/* Quantity */}
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

export default SaleLineItemRow;