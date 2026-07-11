import React, { useState, useMemo, useRef, useEffect } from 'react';
import { selectStyle } from '../../../shared/components/FormField';
import {
  DropdownMenu,
  DropdownMenuScroll,
  DropdownMenuItem,
  DropdownMenuEmpty,
} from '../../../shared/components/DropdownMenu';

export default function CustomerCombobox({ customers = [], customerId, onChange, onAddNew, loading = false }) {
  const [search, setSearch] = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  const selectedCust = useMemo(() => {
    if (!customerId) return null;
    return customers.find(c => c.cust_id === customerId) || null;
  }, [customers, customerId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers.slice(0, 20);
    return customers.filter(c =>
      c.cust_name?.toLowerCase().includes(q) ||
      (c.cust_phone && c.cust_phone.includes(search.trim()))
    );
  }, [customers, search]);

  const itemCount = filtered.length + 2;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleInputChange(e) {
    setSearch(e.target.value);
    onChange(null);
    setDropOpen(true);
    setHighlightedIndex(-1);
  }

  function handleSelect(c) {
    onChange(c);
    setSearch('');
    setDropOpen(false);
    setHighlightedIndex(-1);
  }

  function handleWalkIn() {
    onChange(null);
    setSearch('');
    setDropOpen(false);
    setHighlightedIndex(-1);
  }

  function handleOpenAddNew() {
    setDropOpen(false);
    setHighlightedIndex(-1);
    onAddNew?.(search.trim());
  }

  function handleKeyDown(e) {
    if (!dropOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setDropOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % itemCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev <= 0 ? itemCount - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex === 0) {
        handleWalkIn();
      } else if (highlightedIndex === 1) {
        handleOpenAddNew();
      } else if (highlightedIndex >= 2 && highlightedIndex - 2 < filtered.length) {
        handleSelect(filtered[highlightedIndex - 2]);
      }
    } else if (e.key === 'Escape') {
      setDropOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.blur();
    }
  }

  const displayText = selectedCust
    ? selectedCust.cust_name + (selectedCust.cust_phone ? ` — ${selectedCust.cust_phone}` : '')
    : search;

  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6,
        display: 'flex', alignItems: 'center', minHeight: 18,
      }}>
        Customer
      </div>
      <div ref={boxRef} style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={loading ? '' : displayText}
          onChange={handleInputChange}
          onFocus={() => { if (!loading) setDropOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'Loading customers…' : 'Walk-in or type name / phone…'}
          disabled={loading}
          autoComplete="off"
          style={{
            ...selectStyle,
            cursor: loading ? 'wait' : 'text',
            opacity: loading ? 0.6 : 1,
            borderColor: customerId ? 'var(--accent-600)' : undefined,
          }}
        />

        {customerId && (
          <button
            type="button"
            onClick={handleWalkIn}
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

        {dropOpen && !customerId && !loading && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            zIndex: 200,
          }}>
            <DropdownMenu>
              <DropdownMenuScroll maxHeight={240}>
                <DropdownMenuItem
                  highlighted={highlightedIndex === 0}
                  onMouseDown={handleWalkIn}
                  onMouseEnter={() => setHighlightedIndex(0)}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
                    Walk-in Customer
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    no account
                  </span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  highlighted={highlightedIndex === 1}
                  onMouseDown={handleOpenAddNew}
                  onMouseEnter={() => setHighlightedIndex(1)}
                  style={{ color: 'var(--accent-600)', fontWeight: 600, fontSize: 13 }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                    Add New Customer
                  </span>
                </DropdownMenuItem>

                {filtered.length === 0 ? (
                  <DropdownMenuEmpty>
                    No customers match &quot;{search}&quot;
                  </DropdownMenuEmpty>
                ) : (
                  filtered.map((c, idx) => (
                    <DropdownMenuItem
                      key={c.cust_id}
                      highlighted={highlightedIndex === idx + 2}
                      onMouseDown={() => handleSelect(c)}
                      onMouseEnter={() => setHighlightedIndex(idx + 2)}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {c.cust_name}
                        </div>
                        {c.cust_phone && (
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                            {c.cust_phone}
                          </div>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuScroll>
            </DropdownMenu>
          </div>
        )}
      </div>
      {customerId && selectedCust && (
        <div style={{ fontSize: 11.5, color: 'var(--accent-600)', marginTop: 4, fontWeight: 600 }}>
          ✓ {selectedCust.cust_name}{selectedCust.cust_phone ? ` — ${selectedCust.cust_phone}` : ''}
        </div>
      )}
    </div>
  );
}
