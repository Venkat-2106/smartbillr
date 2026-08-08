// src/shared/components/ErrorBoundary.jsx
//
// WHY THIS EXISTS:
//   React does not catch errors thrown during render by default.
//   If any component throws (e.g., bad API response shape, null dereference),
//   the entire app unmounts and shows a blank white screen — there is no way
//   for the user to recover except a manual page refresh.
//
//   An Error Boundary wraps the app and catches those errors before they
//   reach the browser. Instead of a blank screen, the user sees a clear
//   "Something went wrong" message with a button to return to safety.
//
// WHY a class component:
//   Error Boundaries must be class components. React only exposes
//   getDerivedStateFromError() and componentDidCatch() on class components.
//   There is no functional hook equivalent as of React 18.
//
// HOW TO USE:
//   <ErrorBoundary>
//     <YourApp />
//   </ErrorBoundary>
//
//   Optionally pass a custom fallback:
//   <ErrorBoundary fallback={<MyCustomError />}>
//     ...
//   </ErrorBoundary>

import { Component } from 'react'

// FIX (2026-08-08): after a new deploy replaces Vite's hashed chunk
// filenames, a tab that was already open still references the OLD
// hashes. The resulting dynamic import() failure has a distinct,
// recognizable shape across browsers — matching on it lets us tell
// "stale deploy, a reload will fix this" apart from a genuine runtime
// bug, which a reload would NOT fix and shouldn't be retried.
const CHUNK_LOAD_ERROR_PATTERN = /fetch dynamically imported module|failed to load module script|failed to fetch|loading chunk|importing a module script failed/i

function isChunkLoadError(error) {
  return !!error?.message && CHUNK_LOAD_ERROR_PATTERN.test(error.message)
}

const RELOAD_FLAG_KEY = 'sb-chunk-reload-attempted'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, isRecovering: false }
  }

  // Called when a child component throws during render.
  // Returns the new state so the fallback UI is shown on the next render.
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  // Called after the error is caught. Good place for logging.
  componentDidCatch(error, info) {
    // In production you could send this to a logging service (e.g. Sentry):
    // logErrorToService(error, info.componentStack)
    console.error('[ErrorBoundary caught]', error, info.componentStack)

    if (isChunkLoadError(error)) {
      const alreadyAttempted = sessionStorage.getItem(RELOAD_FLAG_KEY)
      if (!alreadyAttempted) {
        // One silent reload attempt per tab session. sessionStorage
        // survives the reload itself (unlike component/in-memory state),
        // so a second failure after reloading falls through to the
        // normal error UI instead of looping forever.
        sessionStorage.setItem(RELOAD_FLAG_KEY, '1')
        this.setState({ isRecovering: true })
        window.location.reload()
      }
    }
  }

  handleReset() {
    // Navigate to dashboard and do a hard reload to clear all stale state
    window.location.href = '/dashboard'
  }

  render() {
    if (this.state.isRecovering) {
      // Reload is already in flight (see componentDidCatch) — show a
      // neutral loading state instead of "Something went wrong" for the
      // brief moment before the page actually reloads.
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: 'var(--bg-page)',
        }} />
      )
    }

    if (this.state.hasError) {
      // If the parent passed a custom fallback, show that instead
      if (this.props.fallback) return this.props.fallback

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '40px 24px',
          textAlign: 'center',
          background: 'var(--bg-page)',
          fontFamily: '"Plus Jakarta Sans", sans-serif',
        }}>
          {/* Icon */}
          <div style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            marginBottom: 24,
          }}>
            ⚠️
          </div>

          {/* Title */}
          <h2 style={{
            margin: 0,
            marginBottom: 10,
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.3px',
          }}>
            Something went wrong
          </h2>

          {/* Error message (only shown in dev — not in production) */}
          {import.meta.env.DEV && this.state.error?.message && (
            <p style={{
              margin: '0 0 6px',
              fontSize: 13,
              color: 'var(--text-muted)',
              maxWidth: 480,
              lineHeight: 1.5,
              fontFamily: 'monospace',
              background: 'var(--bg-subtle)',
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
            }}>
              {this.state.error.message}
            </p>
          )}

          <p style={{
            margin: '12px 0 28px',
            fontSize: 14,
            color: 'var(--text-muted)',
            maxWidth: 380,
            lineHeight: 1.6,
          }}>
            An unexpected error occurred. Your data is safe — click below to
            return to the dashboard.
          </p>

          {/* Back button */}
          <button
            onClick={() => this.handleReset()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 24px',
              background: 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '0.01em',
            }}
          >
            Return to Dashboard
          </button>
        </div>
      )
    }

    return this.props.children
  }
}