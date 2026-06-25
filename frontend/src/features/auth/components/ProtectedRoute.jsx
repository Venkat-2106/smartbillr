import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../../../store/authStore'

export default function ProtectedRoute({ children, permission = null }) {
  const token       = useAuthStore((s) => s.token)
  const profile     = useAuthStore((s) => s.profile)
  const permissions = useAuthStore((s) => s.permissions)

  if (!token || !profile) {
    return <Navigate to="/login" replace />
  }

  if (permission && !permissions.includes(permission)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children ?? <Outlet />
}