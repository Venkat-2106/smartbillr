import { useEffect } from 'react'
import { createPortal } from 'react-dom'

function Kbd({ children }) {
  return <kbd style={{
    fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
    padding: '2px 6px', borderRadius: 5,
    border: '1px solid var(--border)',
    background: 'var(--bg-subtle)',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    display: 'inline-flex', alignItems: 'center', gap: 2,
  }}>{children}</kbd>
}

function KeyCombo({ keys }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {keys.split(' ').map((k, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>+</span>}
          <Kbd>{k}</Kbd>
        </span>
      ))}
    </span>
  )
}

const SECTIONS = [
  {
    title: 'Navigation',
    description: 'Go to any page instantly',
    shortcuts: [
      { keys: 'G D', label: 'Go to Dashboard' },
      { keys: 'G C', label: 'Go to Customers' },
      { keys: 'G S', label: 'Go to Sales' },
      { keys: 'G P', label: 'Go to Products' },
      { keys: 'G U', label: 'Go to Suppliers' },
      { keys: 'G T', label: 'Go to Stock' },
      { keys: 'G E', label: 'Go to Expenses' },
      { keys: 'G R', label: 'Go to Reports' },
      { keys: 'G H', label: 'Go to Settings' },
    ],
  },
  {
    title: 'Global Actions',
    description: 'Available from any screen',
    shortcuts: [
      { keys: 'Ctrl K', label: 'Open command palette' },
      { keys: '?', label: 'Show keyboard shortcuts' },
      { keys: 'Alt N', label: 'Create new record' },
      { keys: 'Ctrl F', label: 'Focus search' },
      { keys: 'F5', label: 'Refresh current data' },
      { keys: 'Esc', label: 'Close drawer / modal' },
    ],
  },
  {
    title: 'Sales',
    description: 'Invoice creation shortcuts',
    shortcuts: [
      { keys: 'Ctrl P', label: 'Add product line item' },
      { keys: 'Ctrl ⇧ C', label: 'Select customer' },
      { keys: 'Ctrl Enter', label: 'Create invoice' },
      { keys: 'F2', label: 'Focus barcode scanner' },
      { keys: 'Ctrl U', label: 'Add new customer' },
    ],
  },
  {
    title: 'Data Tables',
    description: 'Keyboard navigation on list pages',
    shortcuts: [
      { keys: '↑ ↓', label: 'Navigate rows' },
      { keys: 'Enter', label: 'Open selected row' },
      { keys: 'E', label: 'Edit selected row' },
      { keys: 'Delete', label: 'Delete selected row' },
      { keys: 'Space', label: 'Select / toggle row' },
      { keys: '⇧ ↑ / ⇧ ↓', label: 'Multi-select rows' },
    ],
  },
  {
    title: 'Forms',
    description: 'Form submission shortcuts',
    shortcuts: [
      { keys: 'Ctrl S', label: 'Save form (submit)' },
      { keys: 'Ctrl Enter', label: 'Submit form' },
      { keys: 'Esc', label: 'Cancel / close' },
    ],
  },
]

export default function ShortcutHelp({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      <div onClick={onClose} role="presentation" aria-hidden={true} style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.12s ease',
      }} />
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        pointerEvents: 'none',
      }}>
      <div style={{
        width: 'min(640px, calc(100vw - 48px))',
        maxHeight: 'min(560px, calc(100vh - 48px))',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-elevated)',
        display: 'flex', flexDirection: 'column',
        animation: 'scaleIn 0.18s var(--ease-spring) both',
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Keyboard Shortcuts</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>Press <Kbd>?</Kbd> anywhere to open this dialog</p>
          </div>
          <button onClick={onClose} aria-label="Close shortcuts help" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 18, padding: '4px 8px',
            borderRadius: 6, lineHeight: 1,
          }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 22px 18px' }}>
          {SECTIONS.map(section => (
            <div key={section.title}>
              <div style={{
                padding: '14px 0 4px',
              }}>
                <h3 style={{
                  fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0,
                }}>
                  {section.title}
                </h3>
                {section.description && (
                  <p style={{ fontSize: 12, color: 'var(--text-disabled)', margin: '2px 0 0' }}>{section.description}</p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {section.shortcuts.map(sc => (
                  <div key={sc.keys} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 0',
                  }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sc.label}</span>
                    <KeyCombo keys={sc.keys} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          padding: '10px 22px', borderTop: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text-muted)', textAlign: 'center',
        }}>
          Shortcuts are disabled while typing in input fields
        </div>
      </div>
      </div>
    </>,
    document.body
  )
}
