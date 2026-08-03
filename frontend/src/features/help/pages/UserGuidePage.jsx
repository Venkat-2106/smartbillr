import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import userGuideContent from '../SMARTBILLR_USER_GUIDE.md?raw'

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim()
    .replace(/^-+|-+$/g, '')
}

function extractToc(markdown) {
  const headings = []
  const lines = markdown.split('\n')
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)/)
    if (match) {
      const level = match[1].length
      const text = match[2].replace(/`/g, '')
      headings.push({ level, text, id: slugify(text) })
    }
  }
  return headings
}

export default function UserGuidePage() {
  const navigate = useNavigate()
  const [activeId, setActiveId] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 900
  )
  const firstParaRef = useRef(true)

  const toc = useMemo(() => extractToc(userGuideContent), [])
  const tocItems = useMemo(() => toc.filter((h) => h.level === 2), [toc])

  useEffect(() => {
    const els = tocItems.map((h) => document.getElementById(h.id)).filter(Boolean)
    let rafId = null

    const update = () => {
      rafId = null
      const offset = 120
      let current = ''
      for (const el of els) {
        if (el.getBoundingClientRect().top <= offset) {
          current = el.id
        } else {
          break
        }
      }
      setActiveId(current)
    }

    const onScroll = () => {
      if (rafId == null) rafId = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [tocItems])

  function handleTocClick(id) {
    setActiveId(id)
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleBack() {
    const idx = window.history.state?.idx
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1)
    } else {
      navigate('/')
    }
  }

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        background: 'var(--topbar-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--topbar-border)',
      }}>
        <div style={{
          maxWidth: 1120,
          margin: '0 auto',
          padding: '12px clamp(20px, 4vw, 32px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <button
            onClick={() => navigate('/')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
            }}
            aria-label="SmartBillr home"
          >
            <span style={{
              width: 26, height: 26, borderRadius: 8,
              background: 'var(--accent-600)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px',
              flexShrink: 0,
            }}>SB</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              SmartBillr
            </span>
            <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }} aria-hidden>·</span>
            <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>User Guide</span>
          </button>

          <button
            onClick={handleBack}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)',
              padding: '7px 10px', borderRadius: 8, transition: 'color .15s, background .15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-subtle)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent' }}
            aria-label="Go back"
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5m7-7l-7 7 7 7" />
            </svg>
            Back
          </button>
        </div>
      </header>

      {/* ── Page ────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <div aria-hidden style={{
          position: 'absolute',
          top: -20, left: '50%', transform: 'translateX(-50%)',
          width: 'min(960px, 100%)', height: 420,
          pointerEvents: 'none', zIndex: 0,
          background: 'radial-gradient(60% 60% at 50% 0%, var(--accent-glow), transparent 70%)',
        }} />

        <div style={{
          position: 'relative', zIndex: 1,
          maxWidth: 1120,
          margin: '0 auto',
          padding: '56px clamp(20px, 4vw, 40px) 120px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 56,
        }}>
          {/* ── TOC sidebar ─────────────────────────────────────────────── */}
          <aside
            style={{
              width: sidebarOpen ? 224 : 0,
              flexShrink: 0,
              overflow: 'hidden',
              transition: 'width 0.2s ease',
              position: 'sticky',
              top: 80,
              alignSelf: 'flex-start',
              maxHeight: 'calc(100vh - 120px)',
            }}
          >
            <div style={{
              width: 224,
              paddingRight: 8,
              overflowY: 'auto',
              maxHeight: 'calc(100vh - 120px)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 20,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.1em', color: 'var(--text-muted)',
                }}>
                  On this page
                </span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: 2,
                    display: 'flex', alignItems: 'center', borderRadius: 4,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                  aria-label="Close contents"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <nav aria-label="Table of contents" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {tocItems.map((h) => {
                  const active = activeId === h.id
                  return (
                    <button
                      key={h.id}
                      onClick={() => handleTocClick(h.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', textAlign: 'left',
                        padding: '8px 10px',
                        fontSize: 13.5,
                        fontWeight: active ? 700 : 500,
                        lineHeight: 1.45,
                        color: active ? 'var(--accent-600)' : 'var(--text-secondary)',
                        background: active ? 'var(--accent-glow)' : 'transparent',
                        border: 'none', borderRadius: 8, cursor: 'pointer',
                        transition: 'background .15s, color .15s',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = 'var(--bg-subtle)'
                          e.currentTarget.style.color = 'var(--text-primary)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--text-secondary)'
                        }
                      }}
                      aria-current={active ? 'true' : undefined}
                    >
                      <span style={{
                        width: 3, height: 14, borderRadius: 2, flexShrink: 0,
                        background: active ? 'var(--accent-600)' : 'transparent',
                        transition: 'background .15s',
                      }} />
                      <span style={{ flex: 1 }}>{h.text}</span>
                    </button>
                  )
                })}
              </nav>
            </div>
          </aside>

          {/* ── TOC toggle (when closed) ─────────────────────────────────── */}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              style={{
                position: 'sticky', top: 80, alignSelf: 'flex-start',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
                color: 'var(--text-secondary)', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                boxShadow: 'var(--shadow-sm)',
                letterSpacing: '0.02em',
              }}
              aria-label="Open table of contents"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Contents
            </button>
          )}

          {/* ── Reading column ──────────────────────────────────────────── */}
          <main style={{
            flex: '1 1 auto',
            minWidth: 0,
            maxWidth: 780,
            margin: '0 auto',
          }}>
            <div style={{
              fontSize: 15,
              lineHeight: 1.8,
              color: 'var(--text-secondary)',
            }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children, ...props }) => (
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '99px',
                          background: 'var(--accent-600)', flexShrink: 0,
                        }} />
                        <span style={{
                          fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em',
                          textTransform: 'uppercase', color: 'var(--accent-600)',
                        }}>
                          SmartBillr Documentation
                        </span>
                      </div>
                      <h1
                        id={slugify(String(children))}
                        style={{
                          fontSize: 36, fontWeight: 800,
                          letterSpacing: '-0.03em', lineHeight: 1.15,
                          color: 'var(--text-primary)', margin: 0,
                          scrollMarginTop: 96,
                        }}
                        {...props}
                      >{children}</h1>
                    </div>
                  ),
                  h2: ({ children, ...props }) => (
                    <h2
                      id={slugify(String(children))}
                      style={{
                        fontSize: 22, fontWeight: 700,
                        letterSpacing: '-0.02em', lineHeight: 1.3,
                        color: 'var(--text-primary)',
                        margin: '48px 0 14px',
                        scrollMarginTop: 96,
                      }}
                      {...props}
                    >{children}</h2>
                  ),
                  h3: ({ children, ...props }) => (
                    <h3
                      id={slugify(String(children))}
                      style={{
                        fontSize: 16.5, fontWeight: 700,
                        letterSpacing: '-0.01em',
                        color: 'var(--text-primary)',
                        margin: '28px 0 8px',
                        scrollMarginTop: 96,
                      }}
                      {...props}
                    >{children}</h3>
                  ),
                  p: ({ children, ...props }) => {
                    const isLead = firstParaRef.current
                    if (isLead) firstParaRef.current = false
                    return (
                      <p style={{
                        margin: isLead ? '0 0 24px' : '0 0 16px',
                        fontSize: isLead ? 17 : 15,
                        lineHeight: isLead ? 1.75 : 1.8,
                        color: isLead ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }} {...props}>{children}</p>
                    )
                  },
                  ul: ({ children, ...props }) => (
                    <ul style={{
                      margin: '0 0 20px', paddingLeft: 22,
                      lineHeight: 1.8, color: 'var(--text-secondary)',
                    }} {...props}>{children}</ul>
                  ),
                  ol: ({ children, ...props }) => (
                    <ol style={{
                      margin: '0 0 20px', paddingLeft: 22,
                      lineHeight: 1.8, color: 'var(--text-secondary)',
                    }} {...props}>{children}</ol>
                  ),
                  li: ({ children, ...props }) => (
                    <li style={{ marginBottom: 6, paddingLeft: 2 }} {...props}>{children}</li>
                  ),
                  a: ({ children, href, ...props }) => (
                    <a
                      href={href}
                      style={{
                        color: 'var(--accent-600)', fontWeight: 500,
                        textDecoration: 'underline',
                        textDecorationColor: 'var(--accent-200)',
                        textUnderlineOffset: 3,
                      }}
                      onClick={(e) => {
                        if (href?.startsWith('#')) {
                          e.preventDefault()
                          const id = href.slice(1)
                          const el = document.getElementById(id)
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                      }}
                      {...props}
                    >{children}</a>
                  ),
                  table: ({ children, ...props }) => (
                    <div style={{
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      overflow: 'hidden',
                      margin: '24px 0',
                      boxShadow: 'var(--shadow-sm)',
                    }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{
                          width: '100%', borderCollapse: 'collapse',
                          fontSize: 13.5, lineHeight: 1.6,
                        }} {...props}>{children}</table>
                      </div>
                    </div>
                  ),
                  thead: ({ children, ...props }) => (
                    <thead style={{ background: 'var(--bg-subtle)' }} {...props}>{children}</thead>
                  ),
                  th: ({ children, ...props }) => (
                    <th style={{
                      padding: '12px 16px', textAlign: 'left',
                      fontWeight: 700, color: 'var(--text-primary)',
                      borderBottom: '1px solid var(--border-hover)',
                      fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em',
                      whiteSpace: 'nowrap',
                    }} {...props}>{children}</th>
                  ),
                  td: ({ children, ...props }) => (
                    <td style={{
                      padding: '12px 16px', borderBottom: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                    }} {...props}>{children}</td>
                  ),
                  tr: ({ children, ...props }) => (
                    <tr style={{ transition: 'background 0.12s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                      {...props}>{children}</tr>
                  ),
                  code: ({ children, inline, ...props }) => (
                    inline
                      ? <code style={{
                          background: 'var(--bg-subtle)', padding: '2px 7px',
                          borderRadius: 5, fontSize: '0.85em',
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          color: 'var(--accent-600)',
                          border: '1px solid var(--border)',
                        }} {...props}>{children}</code>
                      : <code style={{
                          display: 'block',
                          background: 'var(--bg-subtle)',
                          padding: '18px 20px',
                          borderRadius: 12,
                          fontSize: 13, lineHeight: 1.7,
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          border: '1px solid var(--border)',
                          overflowX: 'auto', margin: '24px 0',
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
                      margin: '24px 0', padding: '16px 20px',
                      display: 'flex', gap: 14,
                      borderRadius: 12,
                      background: 'var(--accent-glow)',
                      border: '1px solid var(--accent-ring)',
                      color: 'var(--text-secondary)',
                      fontSize: 14.5, lineHeight: 1.7,
                    }} {...props}>
                      <span aria-hidden style={{
                        width: 3, borderRadius: 2, flexShrink: 0,
                        background: 'var(--accent-600)', alignSelf: 'stretch',
                      }} />
                      <div>{children}</div>
                    </blockquote>
                  ),
                  hr: () => (
                    <div style={{
                      border: 'none', borderTop: '1px solid var(--border)',
                      margin: '40px 0',
                    }} />
                  ),
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

            {/* ── Page footer ───────────────────────────────────────────── */}
            <div style={{
              marginTop: 56, paddingTop: 24,
              borderTop: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 16,
            }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
                SmartBillr · Documentation
              </span>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)',
                  padding: '6px 8px', borderRadius: 8, transition: 'color .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-600)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
                aria-label="Back to top"
              >
                Back to top
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5m-7 7l7-7 7 7" />
                </svg>
              </button>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
