import AppRouter from './app/router'
import ErrorBoundary from './shared/components/ErrorBoundary'

// App.jsx is now just a shell — the router handles everything.
// ErrorBoundary wraps everything so a render crash shows a friendly screen
// instead of a blank white page with no recovery path.
export default function App() {
  return (
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  )
}