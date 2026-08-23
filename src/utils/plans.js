export const PLAN_KEYS = ['basic', 'pro', 'enterprise']

export const PLAN_META = {
  basic: {
    label: 'Basic',
    color: '#16a34a',
    defaultPrice: 10000,
    description: 'Essential tools for small schools',
  },
  pro: {
    label: 'Pro',
    color: '#2563eb',
    defaultPrice: 15000,
    description: 'Advanced features for growing schools',
  },
  enterprise: {
    label: 'Enterprise',
    color: '#7c3aed',
    defaultPrice: 20000,
    description: 'Full suite for large institutions',
  },
}

export const PLAN_OPTIONS = PLAN_KEYS.map((key) => ({
  value: key,
  label: PLAN_META[key].label,
}))

export function getPlanLabel(key) {
  return PLAN_META[key]?.label || key
}

export function getPlanColor(key) {
  return PLAN_META[key]?.color || '#64748b'
}

export function getPlanPrice(plans, key) {
  if (!plans) return PLAN_META[key]?.defaultPrice || 0
  const found = Array.isArray(plans) ? plans.find((p) => p.key === key) : plans[key]
  return found?.monthly_price ?? found?.price ?? PLAN_META[key]?.defaultPrice ?? 0
}

export function getPlanAnnualPrice(plans, key) {
  if (!plans) return (PLAN_META[key]?.defaultPrice || 0) * 10
  const found = Array.isArray(plans) ? plans.find((p) => p.key === key) : plans[key]
  return found?.annual_price ?? (found?.monthly_price ?? PLAN_META[key]?.defaultPrice ?? 0) * 10
}
