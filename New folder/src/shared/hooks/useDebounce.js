import { useState, useEffect } from 'react'

/**
 * Delays updating a value until the user stops typing.
 *
 * Usage:
 *   const debouncedSearch = useDebounce(searchText, 400)
 *   useEffect(() => { fetchResults(debouncedSearch) }, [debouncedSearch])
 *
 * @param {any} value - The value to debounce (usually a search string)
 * @param {number} delay - Milliseconds to wait (default: 400)
 */
export function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Cleanup: cancel the timer if value changes before delay is up
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}