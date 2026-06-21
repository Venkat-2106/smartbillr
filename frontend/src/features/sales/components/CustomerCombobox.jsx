import React, { useState, useMemo, useRef, useEffect } from 'react';
import { selectStyle } from '../../../shared/components/FormField';

const dropItemStyle = {
  padding: '9px 14px',
  cursor: 'pointer',
  borderBottom: '1px solid var(--border)',
};

export default function CustomerCombobox({ customers = [], customerId, onChange, onAddNew }) {
  const [search, setSearch] = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  const boxRef = useRef(null);

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
  }

  function handleSelect(c) {
    onChange(c);
    setSearch('');
    setDropOpen(false);
  }

  function handleWalkIn() {
    onChange(null);
    setSearch('');
    setDropOpen(false);
  }

  function handleOpenAddNew() {
    setDropOpen(false);
    onAddNew?.(search.trim());
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
          type="text"
          value={displayText}
          onChange={handleInputChange}
          onFocus={() => setDropOpen(true)}
          placeholder="Walk-in or type name / phone…"
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

        {dropOpen && !customerId && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--r-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 200,
            maxHeight: 240,
            overflowY: 'auto',
          }}>
            <div onMouseDown={handleWalkIn} style={dropItemStyle}>
              <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 13 }}>
                Walk-in Customer (no account)
              </span>
            </div>
            <div
              onMouseDown={handleOpenAddNew}
              style={{
                ...dropItemStyle,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--accent-600)',
                fontWeight: 600,
                fontSize: 13,
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
              Add New Customer
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
                No customers match &quot;{search}&quot;
              </div>
            ) : (
              filtered.map(c => (
                <div key={c.cust_id} onMouseDown={() => handleSelect(c)} style={dropItemStyle}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
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
      {customerId && selectedCust && (
        <div style={{ fontSize: 11.5, color: 'var(--accent-600)', marginTop: 4, fontWeight: 600 }}>
          ✓ {selectedCust.cust_name}{selectedCust.cust_phone ? ` — ${selectedCust.cust_phone}` : ''}
        </div>
      )}
    </div>
  );
}
