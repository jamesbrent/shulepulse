import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../../store/authStore'
import {
  fetchSchoolFeatures,
  fetchFeatureCatalog,
  hasFeature as checkHas,
  hasAnyFeature as checkHasAny,
  hasAllFeatures as checkHasAll,
  invalidateCache,
} from './featureAccessService'

const FeatureAccessContext = createContext(null)

export function FeatureAccessProvider({ children }) {
  const profile = useAuthStore((s) => s.profile)
  const [features, setFeatures] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const isSuperadmin = profile?.role === 'superadmin'
  const schoolId = profile?.school_id

  const loadFeatures = useCallback(async () => {
    if (!schoolId && !isSuperadmin) {
      setFeatures([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const [featureList, catalogList] = await Promise.all([
        isSuperadmin
          ? fetchFeatureCatalog().then((c) => c.map((f) => f.feature_key))
          : fetchSchoolFeatures(schoolId),
        catalog.length === 0 ? fetchFeatureCatalog() : Promise.resolve(catalog),
      ])

      setFeatures(featureList)
      if (catalogList.length > 0) setCatalog(catalogList)
    } catch (err) {
      console.error('[FeatureAccess] load error:', err)
      setError(err.message)
      if (isSuperadmin) {
        setFeatures(catalog.map((f) => f.feature_key))
      }
    } finally {
      setLoading(false)
    }
  }, [schoolId, isSuperadmin])

  useEffect(() => {
    loadFeatures()
  }, [loadFeatures])

  const has = useCallback((featureKey) => {
    if (isSuperadmin) return true
    return checkHas(features, featureKey)
  }, [features, isSuperadmin])

  const hasAny = useCallback((featureKeys) => {
    if (isSuperadmin) return true
    return checkHasAny(features, featureKeys)
  }, [features, isSuperadmin])

  const hasAll = useCallback((featureKeys) => {
    if (isSuperadmin) return true
    return checkHasAll(features, featureKeys)
  }, [features, isSuperadmin])

  const refresh = useCallback(() => {
    invalidateCache()
    return loadFeatures()
  }, [loadFeatures])

  const getModuleFeatures = useCallback((module) => {
    return catalog.filter((f) => f.module === module)
  }, [catalog])

  const value = {
    features,
    catalog,
    loading,
    error,
    isSuperadmin,
    has,
    hasAny,
    hasAll,
    refresh,
    getModuleFeatures,
  }

  return (
    <FeatureAccessContext.Provider value={value}>
      {children}
    </FeatureAccessContext.Provider>
  )
}

export function useFeatureAccess() {
  const context = useContext(FeatureAccessContext)
  if (!context) {
    throw new Error('useFeatureAccess must be used within FeatureAccessProvider')
  }
  return context
}

export default FeatureAccessContext
