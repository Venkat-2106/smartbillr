export default function TabBar({
  tabs = [],
  activeTab,
  onChange,
  variant = 'underline',
}) {
  if (variant === 'pills') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'var(--bg-subtle)',
        borderRadius: 'var(--r-lg)',
        padding: 4,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--r-md)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              background: activeTab === tab.key ? 'var(--bg-card)' : 'transparent',
              color: activeTab === tab.key ? 'var(--accent-600)' : 'var(--text-secondary)',
              boxShadow: activeTab === tab.key ? 'var(--shadow-xs)' : 'none',
              transition: 'background 0.14s, color 0.14s, box-shadow 0.14s',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}
            role="tab"
            aria-selected={activeTab === tab.key}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      borderBottom: '2px solid var(--border)',
      marginBottom: 24,
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none',
    }}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            color: activeTab === tab.key ? 'var(--accent-600)' : 'var(--text-muted)',
            borderBottom: activeTab === tab.key ? '2px solid var(--accent-600)' : '2px solid transparent',
            marginBottom: -2,
            transition: 'color 0.14s, border-color 0.14s',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            fontFamily: 'inherit',
          }}
          role="tab"
          aria-selected={activeTab === tab.key}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
