import { useState, useMemo, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import userGuideContent from '../SMARTBILLR_USER_GUIDE.md?raw'

function extractToc(markdown) {
  const headings = []
  const lines = markdown.split('\n')
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)/)
    if (match) {
      const level = match[1].length
      const text = match[2].replace(/`/g, '')
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .trim()
        .replace(/^-+|-+$/g, '')
      headings.push({ level, text, id })
    }
  }
  return headings
}

export default function UserGuidePage() {
  const [activeId, setActiveId] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const headingsRef = useRef([])

  const toc = useMemo(() => extractToc(userGuideContent), [])

  useEffect(() => {
    headingsRef.current = toc
      .filter(h => h.level <= 2)
      .map(h => document.getElementById(h.id))
      .filter(Boolean)
  }, [toc])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    )

    const els = headingsRef.current
    for (const el of els) {
      if (el) observer.observe(el)
    }
    return () => {
      for (const el of els) {
        if (el) observer.unobserve(el)
      }
    }
  }, [toc])

  function handleTocClick(id) {
    setActiveId(id)
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 120px)', position: 'relative' }}>
      {/* TOC SIDEBAR */}
      <aside
        style={{
          width: sidebarOpen ? 260 : 0,
          flexShrink: 0,
          overflow: 'hidden',
          transition: 'width 0.2s ease',
          position: 'sticky',
          top: 24,
          alignSelf: 'flex-start',
          maxHeight: 'calc(100vh - 160px)',
        }}
      >
        <div style={{
          width: 260,
          padding: '0 16px 0 0',
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 160px)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <span style={{
              fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-muted)',
            }}>
              Contents
            </span>
            <button
              onClick={() => setSidebarOpen(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 2,
                display: 'flex', alignItems: 'center',
              }}
              aria-label="Close sidebar"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
          <nav>
            {toc.filter(h => h.level <= 2).map((h) => (
              <button
                key={h.id}
                onClick={() => handleTocClick(h.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '5px 8px 5px ' + (h.level === 2 ? 20 : 8) + 'px',
                  fontSize: h.level === 1 ? 12.5 : 11.5,
                  fontWeight: activeId === h.id ? 700 : 500,
                  color: activeId === h.id ? 'var(--accent-600)' : 'var(--text-secondary)',
                  background: activeId === h.id ? 'var(--accent-50)' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  lineHeight: 1.4,
                  transition: 'all 0.12s',
                  fontFamily: 'inherit',
                }}
              >
                {h.text}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* TOGGLE BUTTON (when sidebar closed) */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            position: 'sticky', top: 24, alignSelf: 'flex-start',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 8px', cursor: 'pointer',
            color: 'var(--text-muted)', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
          }}
          aria-label="Open table of contents"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          TOC
        </button>
      )}

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
              User Guide
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', fontWeight: 400 }}>
              Complete documentation for SmartBillr — derived from the actual codebase
            </p>
          </div>
        </div>

        <div className="user-guide-content" style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '32px 40px',
          lineHeight: 1.7,
          fontSize: 14.5,
          color: 'var(--text-primary)',
          maxWidth: 900,
        }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children, ...props }) => {
                const id = String(children)
                  .toLowerCase()
                  .replace(/[^\w\s-]/g, '')
                  .replace(/\s+/g, '-')
                  .trim()
                  .replace(/^-+|-+$/g, '')
                return (
                  <h1 id={id} style={{
                    fontSize: 24, fontWeight: 700, color: 'var(--text-primary)',
                    margin: '40px 0 16px', paddingBottom: 8,
                    borderBottom: '2px solid var(--accent-600)',
                    letterSpacing: '-0.02em',
                    scrollMarginTop: 80,
                  }} {...props}>{children}</h1>
                )
              },
              h2: ({ children, ...props }) => {
                const id = String(children)
                  .toLowerCase()
                  .replace(/[^\w\s-]/g, '')
                  .replace(/\s+/g, '-')
                  .trim()
                  .replace(/^-+|-+$/g, '')
                return (
                  <h2 id={id} style={{
                    fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
                    margin: '32px 0 12px',
                    scrollMarginTop: 80,
                  }} {...props}>{children}</h2>
                )
              },
              h3: ({ children, ...props }) => {
                const id = String(children)
                  .toLowerCase()
                  .replace(/[^\w\s-]/g, '')
                  .replace(/\s+/g, '-')
                  .trim()
                  .replace(/^-+|-+$/g, '')
                return (
                  <h3 id={id} style={{
                    fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                    margin: '24px 0 8px',
                    scrollMarginTop: 80,
                  }} {...props}>{children}</h3>
                )
              },
              p: ({ children, ...props }) => (
                <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', lineHeight: 1.7 }} {...props}>{children}</p>
              ),
              ul: ({ children, ...props }) => (
                <ul style={{ margin: '0 0 14px', paddingLeft: 24, color: 'var(--text-secondary)', lineHeight: 1.7 }} {...props}>{children}</ul>
              ),
              ol: ({ children, ...props }) => (
                <ol style={{ margin: '0 0 14px', paddingLeft: 24, color: 'var(--text-secondary)', lineHeight: 1.7 }} {...props}>{children}</ol>
              ),
              li: ({ children, ...props }) => (
                <li style={{ marginBottom: 4 }} {...props}>{children}</li>
              ),
              a: ({ children, href, ...props }) => (
                <a href={href} style={{ color: 'var(--accent-600)', fontWeight: 500, textDecoration: 'none' }}
                  onClick={(e) => {
                    if (href?.startsWith('#')) {
                      e.preventDefault()
                      const id = href.slice(1)
                      const el = document.getElementById(id)
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  }}
                  {...props}>{children}</a>
              ),
              table: ({ children, ...props }) => (
                <div style={{ overflowX: 'auto', margin: '16px 0' }}>
                  <table style={{
                    width: '100%', borderCollapse: 'collapse',
                    fontSize: 13, lineHeight: 1.5,
                  }} {...props}>{children}</table>
                </div>
              ),
              thead: ({ children, ...props }) => (
                <thead style={{ background: 'var(--bg-subtle)' }} {...props}>{children}</thead>
              ),
              th: ({ children, ...props }) => (
                <th style={{
                  padding: '10px 14px', textAlign: 'left',
                  fontWeight: 700, color: 'var(--text-primary)',
                  borderBottom: '2px solid var(--border)',
                  fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                }} {...props}>{children}</th>
              ),
              td: ({ children, ...props }) => (
                <td style={{
                  padding: '10px 14px', borderBottom: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                }} {...props}>{children}</td>
              ),
              tr: ({ children, ...props }) => (
                <tr style={{ transition: 'background 0.1s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-subtle)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  {...props}>{children}</tr>
              ),
              code: ({ children, inline, ...props }) => (
                inline
                  ? <code style={{
                      background: 'var(--bg-subtle)', padding: '2px 6px',
                      borderRadius: 4, fontSize: '0.85em',
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      color: 'var(--accent-600)',
                    }} {...props}>{children}</code>
                  : <code style={{
                      display: 'block', background: 'var(--bg-page)',
                      padding: '14px 18px', borderRadius: 10,
                      fontSize: 13, lineHeight: 1.6,
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      border: '1px solid var(--border)',
                      overflowX: 'auto', margin: '16px 0',
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }} {...props}>{children}</code>
              ),
              pre: ({ children, ...props }) => (
                <div {...props}>{children}</div>
              ),
              blockquote: ({ children, ...props }) => (
                <blockquote style={{
                  margin: '16px 0', padding: '12px 18px',
                  borderLeft: '3px solid var(--accent-400)',
                  background: 'var(--bg-subtle)',
                  borderRadius: '0 8px 8px 0',
                  color: 'var(--text-secondary)',
                  fontSize: 13.5,
                }} {...props}>{children}</blockquote>
              ),
              hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />,
              strong: ({ children, ...props }) => (
                <strong style={{ fontWeight: 700, color: 'var(--text-primary)' }} {...props}>{children}</strong>
              ),
              em: ({ children, ...props }) => (
                <em style={{ fontStyle: 'italic' }} {...props}>{children}</em>
              ),
            }}
          >
            {userGuideContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
