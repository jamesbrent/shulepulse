import { useFeatureAccess } from './FeatureAccessContext'
import FeatureLocked from './FeatureLocked'

export default function FeatureGate({ feature, features, requireAll = false, children, fallback }) {
  const { has, hasAny, hasAll, loading } = useFeatureAccess()
  const featureKey = Array.isArray(feature) ? feature[0] : feature

  if (loading) return null

  let allowed = false
  if (featureKey) {
    allowed = has(featureKey)
  } else if (features) {
    allowed = requireAll ? hasAll(features) : hasAny(features)
  } else {
    allowed = true
  }

  if (!allowed) {
    if (fallback) return fallback
    return <FeatureLocked featureKey={featureKey || features?.[0]} />
  }

  return children
}
