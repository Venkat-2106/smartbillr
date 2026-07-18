import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../../../store/authStore'

export default function AdminProtectedRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)

  if (!token || !isSuperAdmin) {
    return <Navigate to="/admin/login" replace />
  }

  return children ?? <Outlet />
}

