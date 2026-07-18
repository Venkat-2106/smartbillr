export const SUBSCRIPTION_DISPLAY_NAMES = {
  trial:    'Trial',
  monthly:  'Premium',
  annual:   'Pro',
  lifetime: 'Lifetime',
}

export const PLAN_ORDER = ['trial', 'monthly', 'annual', 'lifetime']

export const NEXT_TIER = {
  trial:    'monthly',
  monthly:  'annual',
  annual:   'lifetime',
}

export function getSubscriptionDisplayName(type) {
  return SUBSCRIPTION_DISPLAY_NAMES[type] || type || 'Trial'
}

export function isTrial(subscription) {
  return subscription?.subscription_type === 'trial'
}

export function isExpired(subscription) {
  return subscription?.is_expired === true
}

export function getNextTier(type) {
  return NEXT_TIER[type] || null
}
