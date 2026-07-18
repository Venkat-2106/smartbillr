import useAuthStore from '../../store/authStore'
import { usePermissions } from './usePermissions'

const TIER_FEATURES = {
  suspended: { financial_reports: false, product_profit_view: false },
  trial:     { financial_reports: false, product_profit_view: false },
  monthly:   { financial_reports: true,  product_profit_view: true  },
  annual:    { financial_reports: true,  product_profit_view: true  },
  lifetime:  { financial_reports: true,  product_profit_view: true  },
}

export function useFeatureAccess(featureKey) {
  const subscription = useAuthStore(s => s.subscription)
  const { can } = usePermissions()

  const subType = subscription?.subscription_type ?? 'trial'
  const tierAllowed = TIER_FEATURES[subType]?.[featureKey] ?? false
  const permAllowed = can(featureKey === 'financial_reports' ? 'dashboard.financial' : 'view_product_profit')
  const allowed = permAllowed && tierAllowed

  return {
    allowed,
    reason: permAllowed && !tierAllowed ? subType : null,
  }
}
