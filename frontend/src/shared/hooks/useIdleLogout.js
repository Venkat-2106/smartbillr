import { useEffect, useRef } from 'react'
import useAuthStore from '../../store/authStore'
import api from '../../api/axios'
import { queryClient } from '../../app/queryClient'

const EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart']

export function useIdleLogout(timeoutMs = 60 * 60_000) {
  const token = useAuthStore((s) => s.token)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!token) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }

    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        try {
          await api.post('/auth/logout')
        } catch {
          // Backend unreachable or token already invalid — still clear locally
        } finally {
          queryClient.clear()
          useAuthStore.getState().clearAuth()
          window.location.href = '/login'
        }
      }, timeoutMs)
    }

    reset()

    for (const ev of EVENTS) {
      window.addEventListener(ev, reset, { passive: true })
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const ev of EVENTS) {
        window.removeEventListener(ev, reset, { passive: true })
      }
    }
  }, [token, timeoutMs])
}
