import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { ShortcutProvider } from '../shared/hooks/useShortcut'

// QueryClient = the brain that manages all API data caching
// We configure it once here and share it with the whole app
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,              // if API fails, try once more (not forever)
      staleTime: 5 * 60 * 1000,  // data stays "fresh" for 5 minutes
      refetchOnWindowFocus: false, // don't refetch just because user switches tabs
    },
  },
})

export default function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ShortcutProvider>
        {children}

        {/* Toast notifications — appears in top-right corner */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: '0.875rem',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          },
          success: {
            duration: 3000,
            iconTheme: { primary: '#16A34A', secondary: '#fff' },
          },
          error: {
            duration: 5500,
            iconTheme: { primary: '#DC2626', secondary: '#fff' },
          },
        }}
      />
      </ShortcutProvider>
    </QueryClientProvider>
  )
}