import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../../../store/authStore'

export default function ProtectedRoute({ children, permission = null }) {
  const [hydrated, setHydrated] = useState(
    () => useAuthStore.persist?.hasHydrated?.() ?? true
  )
  const token       = useAuthStore((s) => s.token)
  const profile     = useAuthStore((s) => s.profile)
  const permissions = useAuthStore((s) => s.permissions)

  useEffect(() => {
    if (hydrated) return
    const unsub = useAuthStore.persist?.onFinishHydration?.(() => setHydrated(true))
    if (useAuthStore.persist?.hasHydrated?.()) setHydrated(true)
    return () => unsub?.()
  }, [hydrated])

  if (!hydrated) return null

  if (!token || !profile) {
    return <Navigate to="/login" replace />
  }

  if (permission && !permissions.includes(permission)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children ?? <Outlet />
}