function App() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        background: 'var(--color-card)',
        padding: '3rem 4rem',
        borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        border: '1px solid #e2e8f0',
        textAlign: 'center'
      }}>
        <div style={{ marginBottom: '0.75rem' }}>
          <span style={{
            fontFamily: 'Georgia, serif',
            fontSize: '2.8rem',
            fontWeight: '800',
            color: 'var(--color-primary)',
            letterSpacing: '-1px'
          }}>
            Smart<span style={{ color: 'var(--color-success)' }}>Billr</span>
          </span>
        </div>
        <p style={{
          fontSize: '0.85rem',
          color: 'var(--color-text-secondary)',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          marginBottom: '1.5rem'
        }}>
          Billing · Inventory · Growth
        </p>
        <div style={{
          padding: '0.5rem 1.5rem',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: '999px',
          color: 'var(--color-success)',
          fontSize: '0.85rem',
        }}>
          ✅ Frontend is working
        </div>
      </div>
    </div>
  )
}

export default App