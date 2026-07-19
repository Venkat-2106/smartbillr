// shared/components/ImportGuidelines.jsx
//
// Reusable collapsible guidance panel for Bulk Import pages.
// Shows required/optional fields, business rules, and common mistakes
// to help users prepare valid import files before uploading.
//
// USAGE:
//
//   import { ImportGuidelines } from '../../../shared/components'
//   import { PRODUCT_GUIDELINES } from '../../../shared/utils/importGuidelines'
//
//   <ImportGuidelines guidelines={PRODUCT_GUIDELINES} />

import { useState } from 'react'
import { downloadTemplateCsv } from '../utils/csvExport'
import toast from 'react-hot-toast'

// ── Static SVG icons ─────────────────────────────────────────────────────────

function InfoIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, transition: 'transform 150ms ease', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--success-text, #16A34A)' }}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--warning-text, #D97706)' }}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function AlertTriangleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#B45309' }}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function LightbulbIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--accent-600, #2563EB)' }}>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd"
        d="M10 3a.75.75 0 01.75.75v7.19l2.47-2.47a.75.75 0 111.06 1.06l-3.75 3.75a.75.75 0 01-1.06 0L5.72 9.53a.75.75 0 111.06-1.06L9.25 10.94V3.75A.75.75 0 0110 3zM3.25 15a.75.75 0 000 1.5h13.5a.75.75 0 000-1.5H3.25z"
        clipRule="evenodd" />
    </svg>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ImportGuidelines({
  guidelines,   // { title, description, fields, rules, tips }
  columns,      // optional: template column definitions for download
  sampleRows,   // optional: sample data rows for template
  templateName, // optional: template filename (without extension)
}) {
  const [open, setOpen] = useState(false)

  if (!guidelines) return null

  const { title, description, warning, fields, rules, tips } = guidelines
  const requiredFields = fields?.filter(f => f.required) || []
  const optionalFields = fields?.filter(f => !f.required) || []

  function handleDownloadTemplate() {
    if (!columns) return
    try {
      downloadTemplateCsv(templateName || 'import', columns, sampleRows || [])
      toast.success('Downloaded import template')
    } catch {
      toast.error('Failed to download template')
    }
  }

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 12,
      background: 'var(--bg-card)',
      marginBottom: 20,
      overflow: 'hidden',
    }}>
      {/* Header — always visible, clickable to toggle */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '12px 16px', border: 'none', background: 'none',
          cursor: 'pointer', textAlign: 'left',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ color: 'var(--accent-600)' }}>
          <InfoIcon size={18} />
        </span>
        <span style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          flex: 1, lineHeight: 1.4,
        }}>
          {title || 'Import Guidelines'}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>
          <ChevronIcon open={open} />
        </span>
      </button>

      {/* Expandable content */}
      {open && (
        <div style={{
          padding: '0 16px 16px',
          borderTop: '1px solid var(--border)',
        }}>
          {/* Description */}
          {description && (
            <p style={{
              fontSize: 13, color: 'var(--text-secondary)',
              margin: '14px 0 0 0', lineHeight: 1.5,
            }}>
              {description}
            </p>
          )}

          {/* Important Warning Banner */}
          {warning?.length > 0 && (
            <div style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
              border: '1.5px solid #F59E0B',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <span style={{ marginTop: 1 }}>
                  <AlertTriangleIcon />
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#92400E', lineHeight: 1.4 }}>
                  Important
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 24 }}>
                {warning.map((msg, i) => (
                  <span key={i} style={{ fontSize: 12.5, color: '#78350F', lineHeight: 1.5, fontWeight: 500 }}>
                    {msg}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Before You Import checklist */}
          {requiredFields.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{
                fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                margin: '0 0 10px 0',
              }}>
                Required Fields
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {requiredFields.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                    <CheckCircleIcon />
                    <div>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{f.name}</span>
                      {f.note && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                          — {f.note}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {optionalFields.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <h4 style={{
                fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                margin: '0 0 10px 0',
              }}>
                Optional Fields
              </h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '4px 16px',
              }}>
                {optionalFields.map((f, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{f.name}</span>
                    {f.note && (
                      <span style={{ color: 'var(--text-muted)' }}> — {f.note}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Business Rules */}
          {rules?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <h4 style={{
                fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                margin: '0 0 10px 0',
              }}>
                Business Rules
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {rules.map((rule, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <WarningIcon />
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tips */}
          {tips?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <h4 style={{
                fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                margin: '0 0 10px 0',
              }}>
                Tips
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {tips.map((tip, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <LightbulbIcon />
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Download Template Button */}
          {columns && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8,
                  border: '1.5px solid var(--border)', background: 'var(--bg-card)',
                  color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'border-color 150ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-500)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <DownloadIcon />
                Download Template
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
