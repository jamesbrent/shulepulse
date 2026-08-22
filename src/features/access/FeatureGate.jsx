import { useFeatureAccess } from './FeatureAccessContext'
import FeatureLocked from './FeatureLocked'

export default function FeatureGate({ feature, features, requireAll = false, children, fallback }) {
  const { has, hasAny, hasAll, loading } = useFeatureAccess()

  if (loading) return null

  let allowed = false
  if (feature) {
    allowed = has(feature)
  } else if (features) {
    allowed = requireAll ? hasAll(features) : hasAny(features)
  } else {
    allowed = true
  }

  if (!allowed) {
    if (fallback) return fallback
    return <FeatureLocked featureKey={feature || features?.[0]} />
  }

  return children
}
