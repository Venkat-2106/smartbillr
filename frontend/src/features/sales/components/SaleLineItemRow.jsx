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

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { selectStyle } from '../../../shared/components/FormField';
import { NUM_INPUT_STYLE } from '../../../shared/constants/styles';
import useAuthStore from '../../../store/authStore';
import {
  DropdownMenu,
  DropdownMenuScroll,
  DropdownMenuItem,
  DropdownMenuEmpty,
  DropdownMenuHint,
} from '../../../shared/components/DropdownMenu';
import ProductSearchDropdownPortal from './ProductSearchDropdownPortal';

const SaleLineItemRow = memo(function SaleLineItemRow({
  item,
  serial,
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
  const scrollRef = useRef(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const business  = useAuthStore(s => s.business);
  const country   = business?.business_country_code || 'IN';

  useEffect(() => {
    if (scrollRef.current && highlightedIndex >= 0) {
      const el = scrollRef.current.children[highlightedIndex];
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const onSearchKeyDown = useCallback((e) => {
    if (!isOpen || searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % searchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev <= 0 ? searchResults.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      onProductSelect(item._id, searchResults[highlightedIndex]);
    } else if (e.key === 'Escape') {
      onCloseDropdown(item._id);
    }
  }, [isOpen, searchResults, highlightedIndex, onProductSelect, onCloseDropdown, item._id]);

  const resetHighlight = useCallback(() => setHighlightedIndex(-1), []);

  return (
    /* FIX L3: grid template matches updated header — 8 columns */
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px 1fr 90px 100px 72px 110px 72px 100px 28px',
      gap: 8, alignItems: 'center',
      padding: '9px 0',
      borderBottom: '1px solid var(--border)',
    }}>

      {/* Serial number */}
      <span style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
        textAlign: 'center',
      }}>
        {serial}
      </span>

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
              placeholder="Type to search…"
              autoComplete="off"
              style={{ ...selectStyle, fontSize: 13, padding: '7px 9px' }}
            />
            {isOpen && searchText.length >= 2 && (
              <ProductSearchDropdownPortal anchorRef={comboRef}>
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
                      highlighted={idx === highlightedIndex}
                      onMouseDown={() => onProductSelect(item._id, p)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
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
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {formatCurrency(p.prod_sell_price, country)}
                        </div>
                        {p.prod_stock_qty != null && (
                          <div style={{ fontSize: 11, color: p.prod_stock_qty > 0 ? 'var(--success-text)' : 'var(--danger-text)', marginTop: 1 }}>
                            {p.prod_stock_qty} left
                          </div>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
                </DropdownMenuScroll>
              </DropdownMenu>
              </ProductSearchDropdownPortal>
            )}
            {isOpen && searchText.length > 0 && searchText.length < 2 && (
              <ProductSearchDropdownPortal anchorRef={comboRef}>
              <DropdownMenu>
                <DropdownMenuHint>
                  Type at least 2 characters to search
                </DropdownMenuHint>
              </DropdownMenu>
              </ProductSearchDropdownPortal>
            )}
          </>
        )}
      </div>

      {/* Barcode */}
      <span style={{
        fontSize: 12, color: 'var(--text-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        lineHeight: 1.4,
      }}>
        {item.barcode || '—'}
      </span>

      {/* Quantity */}
      <div style={{ position: 'relative' }}>
        <input
          type="number" min="1" step="1"
          value={item.quantity}
          onChange={e => onQtyChange(item._id, 'quantity', Math.max(1, Number(e.target.value) || 1))}
          style={{
            ...NUM_INPUT_STYLE,
            borderColor: overStock ? 'var(--warning)' : undefined,
          }}
          title={overStock ? `Only ${availableQty} in stock — override will be needed` : undefined}
        />
        {overStock && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--warning)',
            border: '1.5px solid var(--bg-card)',
          }} />
        )}
      </div>

      {/* Unit Price */}

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

      {/* Stock */}
      <span style={{
        fontSize: 12, fontWeight: 600,
        color: availableQty !== null
          ? availableQty === 0
            ? 'var(--danger-text)'
            : overStock
              ? 'var(--warning-text)'
              : 'var(--text-secondary)'
          : 'var(--text-muted)',
        textAlign: 'center',
      }}>
        {availableQty !== null ? availableQty : '—'}
      </span>

      <span style={{
        fontSize: 13, fontWeight: 700,
        color: 'var(--text-primary)', textAlign: 'right',
      }}>
        {formatCurrency(s + t, country)}
      </span>
      <button
        type="button"
        onClick={() => onRemove(item._id)}
        disabled={!canRemove}
        title="Remove item"
        style={{
          background: 'none', border: 'none', padding: 4,
          cursor: canRemove ? 'pointer' : 'not-allowed',
          color: canRemove ? 'var(--danger-text)' : 'var(--text-muted)',
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