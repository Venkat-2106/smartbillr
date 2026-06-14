export default function ComingSoon({ name }) {
  return (
    <div style={{ animation: 'fadeUp 0.22s cubic-bezier(0.22,1,0.36,1) both' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 28, fontWeight: 800, color: 'var(--text-primary)',
          letterSpacing: '-0.5px', margin: 0, marginBottom: 6,
        }}>
          {name}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
          Manage your {name.toLowerCase()} from here
        </p>
      </div>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{
            height: 36, width: 240,
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 9,
          }} />
          <div style={{
            height: 36, width: 120,
            background: 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
            borderRadius: 9,
            opacity: 0.15,
          }} />
        </div>

        <div style={{
          padding: '80px 32px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 72, height: 72,
            borderRadius: '50%',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            marginBottom: 4,
          }}>
            🚧
          </div>

          <div>
            <h3 style={{
              fontSize: 16, fontWeight: 700,
              color: 'var(--text-primary)', margin: 0, marginBottom: 6,
            }}>
              {name} — Coming Soon
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
              This page is under construction.<br />
              Backend APIs are ready — UI coming in next step.
            </p>
          </div>

          <div style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--accent-50)',
            border: '1px solid var(--accent-ring)',
            borderRadius: 99,
            padding: '5px 14px',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-600)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-600)' }}>
              Phase 5 — In Progress
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
