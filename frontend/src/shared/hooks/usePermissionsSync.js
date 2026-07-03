import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import useAuthStore from '../../store/authStore'
import api from '../../api/axios'
import toast from 'react-hot-toast'

export function usePermissionsSync() {
  const token = useAuthStore((s) => s.token)

  const { data: profile, error } = useQuery({
    queryKey: ['profile-permissions-sync'],
    queryFn: async () => {
      const res = await api.get('/profiles/me')
      return res.data
    },
    enabled: !!token,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
    meta: { isBackgroundSync: true },
  })

  useEffect(() => {
    if (!profile) return
    const current = useAuthStore.getState()
    const oldPerms = current.permissions ?? []
    const newPerms = profile.permissions ?? []

    const changed =
      oldPerms.length !== newPerms.length ||
      oldPerms.some((p) => !newPerms.includes(p))

    if (changed) {
      current.setProfile(profile)
      toast.success('Your permissions were updated by an admin.', { id: 'perm-sync' })
    }
  }, [profile])

  useEffect(() => {
    if (!error) return
    const status = error?.response?.status
    if (status === 403 || status === 404) {
      useAuthStore.getState().clearAuth()
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }
  }, [error])
}
