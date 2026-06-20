// src/features/auth/components/ProtectedRoute.jsx
//
// All access control uses permission codes only.

import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../../../store/authStore'

export default function ProtectedRoute({ children, permission = null }) {
  const token       = useAuthStore((s) => s.token)
  const profile     = useAuthStore((s) => s.profile)
  const permissions = useAuthStore((s) => s.permissions)

  // Not logged in → redirect to login
  if (!token || !profile) {
    return <Navigate to="/login" replace />
  }

  // Permission check → redirect to unauthorized page
  if (permission && !permissions.includes(permission)) {
    return <Navigate to="/unauthorized" replace />
  }

  // children is used when wrapping a layout (e.g. <ProtectedRoute><DashboardLayout /></ProtectedRoute>)
  // Outlet is used when nesting routes inside a Route element
  return children ?? <Outlet />
}