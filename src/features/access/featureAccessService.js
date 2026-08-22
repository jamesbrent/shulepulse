import { supabase } from '../../lib/supabase'

let _featureCache = null
let _cacheSchoolId = null
let _cacheTimestamp = 0
const CACHE_TTL = 60000

export async function fetchSchoolFeatures(schoolId) {
  if (!schoolId) return []

  const now = Date.now()
  if (_featureCache && _cacheSchoolId === schoolId && now - _cacheTimestamp < CACHE_TTL) {
    return _featureCache
  }

  const { data, error } = await supabase.rpc('get_school_features', {
    p_school_id: schoolId,
  })

  if (error) {
    console.error('[FeatureAccess] fetch error:', error)
    return []
  }

  const features = (data || []).map((row) => row.feature_key)
  _featureCache = features
  _cacheSchoolId = schoolId
  _cacheTimestamp = now
  return features
}

export async function checkSchoolFeature(schoolId, featureKey) {
  if (!schoolId || !featureKey) return false

  const { data, error } = await supabase.rpc('school_has_feature', {
    p_school_id: schoolId,
    p_feature_key: featureKey,
  })

  if (error) {
    console.error('[FeatureAccess] check error:', error)
    return false
  }

  return !!data
}

export async function fetchFeatureCatalog() {
  const { data, error } = await supabase
    .from('feature_catalog')
    .select('*')
    .order('sort_order')

  if (error) {
    console.error('[FeatureAccess] catalog fetch error:', error)
    return []
  }
  return data || []
}

export async function fetchPlanFeatures(planKey) {
  const { data, error } = await supabase
    .from('plan_features')
    .select('feature_key')
    .eq('plan_key', planKey)

  if (error) {
    console.error('[FeatureAccess] plan features fetch error:', error)
    return []
  }
  return (data || []).map((r) => r.feature_key)
}

export async function setPlanFeatures(planKey, featureKeys) {
  const { error: delErr } = await supabase
    .from('plan_features')
    .delete()
    .eq('plan_key', planKey)

  if (delErr) throw new Error(delErr.message)

  if (featureKeys.length > 0) {
    const rows = featureKeys.map((fk) => ({ plan_key: planKey, feature_key: fk }))
    const { error: insErr } = await supabase.from('plan_features').insert(rows)
    if (insErr) throw new Error(insErr.message)
  }

  invalidateCache()
  return true
}

export async function fetchSchoolOverrides(schoolId) {
  const { data, error } = await supabase
    .from('school_feature_overrides')
    .select('feature_key, enabled')
    .eq('school_id', schoolId)

  if (error) {
    console.error('[FeatureAccess] overrides fetch error:', error)
    return []
  }
  return data || []
}

export async function setSchoolOverride(schoolId, featureKey, enabled) {
  const { error } = await supabase
    .from('school_feature_overrides')
    .upsert(
      { school_id: schoolId, feature_key: featureKey, enabled },
      { onConflict: 'school_id,feature_key' }
    )

  if (error) throw new Error(error.message)
  invalidateCache()
  return true
}

export async function removeSchoolOverride(schoolId, featureKey) {
  const { error } = await supabase
    .from('school_feature_overrides')
    .delete()
    .eq('school_id', schoolId)
    .eq('feature_key', featureKey)

  if (error) throw new Error(error.message)
  invalidateCache()
  return true
}

export async function fetchAllPlans() {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .order('sort_order')

  if (error) {
    console.error('[FeatureAccess] plans fetch error:', error)
    return []
  }
  return data || []
}

export async function createPlan({ key, label, monthly_price, annual_price, description, color, bg, recommended }) {
  const { error } = await supabase.from('plans').insert({
    key,
    label,
    monthly_price: monthly_price || 0,
    annual_price: annual_price || 0,
    price_label: `KES ${(monthly_price || 0).toLocaleString()}`,
    description: description || '',
    color: color || '#475569',
    bg: bg || '#f1f5f9',
    recommended: recommended || false,
    features: [],
  })

  if (error) throw new Error(error.message)
  return true
}

export async function updatePlan(planId, updates) {
  const payload = { ...updates }
  if (payload.monthy_price !== undefined) {
    payload.price_label = `KES ${Number(payload.monthly_price).toLocaleString()}`
  }

  const { error } = await supabase
    .from('plans')
    .update(payload)
    .eq('id', planId)

  if (error) throw new Error(error.message)
  return true
}

export async function updateSchoolPlan(schoolId, planKey, options = {}) {
  const now = new Date().toISOString()
  const update = { plan: planKey, subscription_start: now }

  if (options.subscription_end) update.subscription_end = options.subscription_end
  if (options.subscription_status) update.subscription_status = options.subscription_status
  if (options.billing_cycle) update.billing_cycle = options.billing_cycle

  const { error } = await supabase
    .from('schools')
    .update(update)
    .eq('id', schoolId)

  if (error) throw new Error(error.message)
  invalidateCache()
  return true
}

export async function suspendSchool(schoolId) {
  return updateSchoolPlan(schoolId, null, { subscription_status: 'suspended' })
}

export async function reactivateSchool(schoolId, planKey) {
  return updateSchoolPlan(schoolId, planKey, { subscription_status: 'active' })
}

export async function setTrialSchool(schoolId, planKey, days = 14) {
  const end = new Date()
  end.setDate(end.getDate() + days)
  return updateSchoolPlan(schoolId, planKey, {
    subscription_status: 'trial',
    subscription_end: end.toISOString(),
  })
}

export function invalidateCache() {
  _featureCache = null
  _cacheSchoolId = null
  _cacheTimestamp = 0
}

export function getCachedFeatures() {
  return _featureCache || []
}

export function hasFeature(features, featureKey) {
  return features.includes(featureKey)
}

export function hasAnyFeature(features, featureKeys) {
  return featureKeys.some((fk) => features.includes(fk))
}

export function hasAllFeatures(features, featureKeys) {
  return featureKeys.every((fk) => features.includes(fk))
}
