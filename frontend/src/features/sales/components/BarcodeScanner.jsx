
export default function BarcodeScanner({
  value,
  onChange,
  onKeyDown,
  loading = false,
  error = '',
  inputRef,
  disabled = false,
}) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6, minHeight: 18,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          Barcode Scanner
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {[
            { key: 'F2', label: 'Focus scanner' },
            { key: 'Ctrl+↵', label: 'Save' },
          ].map(({ key, label }) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <kbd style={{
                fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
                padding: '1px 5px', borderRadius: 4,
                border: '1px solid var(--border)',
                background: 'var(--bg-subtle)',
                color: 'var(--text-secondary)',
              }}>{key}</kbd>
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{label}</span>
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); }}
          onKeyDown={onKeyDown}
          placeholder="Scan or type 3×barcode → Enter"
          disabled={disabled || loading}
          style={{
            flex: 1, padding: '9px 12px',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--r-md)', fontSize: 13,
            background: 'var(--bg-page)',
            color: 'var(--text-primary)',
            outline: 'none', fontFamily: 'inherit',
            boxSizing: 'border-box',
            borderColor: value ? 'var(--accent-600)' : undefined,
            opacity: loading ? 0.7 : 1,
          }}
        />
        {loading && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Looking up…
          </span>
        )}
      </div>
      {error && (
        <div style={{ fontSize: 11.5, color: 'var(--danger-text)', marginTop: 4, fontWeight: 500 }}>
          ⚠ {error}
        </div>
      )}
      {!error && (
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>
          Tip: <strong>3×barcode</strong> adds 3 units at once
        </div>
      )}
    </div>
  );
}
