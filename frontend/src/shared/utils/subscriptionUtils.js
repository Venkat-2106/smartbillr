export const SUBSCRIPTION_DISPLAY_NAMES = {
  trial:     'Trial',
  basic:     'Basic',
  monthly:   'Basic',
  pro:       'Pro',
  annual:    'Pro',
  pro_yearly: 'Pro Yearly',
  lifetime:  'Lifetime',
}

export const PLAN_ORDER = ['trial', 'basic', 'pro', 'pro_yearly', 'lifetime']

export const NEXT_TIER = {
  trial:    'basic',
  basic:    'pro',
  pro:      'pro_yearly',
  pro_yearly: 'lifetime',
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
