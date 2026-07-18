// src/shared/hooks/usePermissions.js
//
// NEW FILE — create at this path.
//
// Clean hook for permission checks anywhere in the app.
// Components use this instead of calling useAuthStore directly for permissions.
//
// Usage:
//   const { can, canAny, isAdmin, role } = usePermissions()
//   if (can("sales.create")) { ... }
//   if (isAdmin) { ... }

import useAuthStore from "../../store/authStore";

export function usePermissions() {
  // FIX (LOW-9 cleanup): permissions lives at profile.permissions, not a top-level
  // store field. The old s.permissions was always undefined → can()/canAny()/canAll()
  // always returned false.
  const permissions = useAuthStore(s => s.profile?.permissions)
  const profile     = useAuthStore(s => s.profile)
  const role        = profile?.role ?? 'staff'

  return {
    permissions,
    role,

    // Single permission check
    can: (code) =>
      Array.isArray(permissions) && permissions.includes(code),

    // At least one of these permissions
    canAny: (...codes) =>
      Array.isArray(permissions) && codes.some(code => permissions.includes(code)),

    // Must have ALL of these permissions
    canAll: (...codes) =>
      Array.isArray(permissions) && codes.every(code => permissions.includes(code)),

    // Role shortcuts
    isAdmin:   role === 'admin',
    isManager: role === 'manager',
    isStaff:   role === 'staff',
  }
}