import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../../../store/authStore'
import Spinner from '../../../shared/components/Spinner'

export default function ProtectedRoute({ children, permission = null }) {
  const [hydrated, setHydrated] = useState(
    () => useAuthStore.persist?.hasHydrated?.() ?? true
  )
  const token       = useAuthStore((s) => s.token)
  const profile     = useAuthStore((s) => s.profile)
  // FIX (LOW-9 cleanup): permissions lives at profile.permissions, not a top-level
  // store field. The old s.permissions was always undefined → crashed .includes().
  const permissions = useAuthStore((s) => s.profile?.permissions)

  useEffect(() => {
    if (hydrated) return
    const unsub = useAuthStore.persist?.onFinishHydration?.(() => setHydrated(true))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (useAuthStore.persist?.hasHydrated?.()) setHydrated(true)
    return () => unsub?.()
  }, [hydrated])

  // FIXED Spinner prevents blank flash during hydration (replaced return null)
  if (!hydrated) return <Spinner center />

  if (!token || !profile) {
    return <Navigate to="/login" replace />
  }

  // Guard: permissions is [] until profile loads from API
  if (permission && !(permissions ?? []).includes(permission)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children ?? <Outlet />
}