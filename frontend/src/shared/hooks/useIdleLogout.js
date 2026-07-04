import { useEffect, useRef } from 'react'
import useAuthStore from '../../store/authStore'

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
      timerRef.current = setTimeout(() => {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
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
