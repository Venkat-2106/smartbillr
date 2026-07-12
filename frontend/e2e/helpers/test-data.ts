let counter = 0

export function uniqueCategoryName(prefix = 'E2E Test'): string {
  counter++
  const ts = Date.now().toString(36)
  return `${prefix} ${ts}-${counter}`
}

export function longCategoryName(length = 101): string {
  return 'A'.repeat(length)
}

export function resetCounter() {
  counter = 0
}
