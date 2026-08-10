import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

/**
 * useGradingConfig(schoolId?)
 * ──────────────────────────
 * Fetches grading systems + bands for the current school.
 *
 * Returns:
 *   systems        — Array of { id, name, slug, is_default, bands: [...] }
 *   loading        — boolean
 *   defaultSystem  — the system with is_default=true (or first)
 *   getBands(slug) — returns bands array for a given slug
 *   getGrade(score, slug) — returns the matching band object
 *   refresh()      — re-fetch from Supabase
 */
export function useGradingConfig(schoolIdProp) {
  const { profile } = useAuthStore()
  const schoolId = schoolIdProp || profile?.school_id

  const [systems, setSystems] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchConfig = useCallback(async () => {
    if (!schoolId) { setLoading(false); return }
    setLoading(true)

    const { data: sysRows, error: sysErr } = await supabase
      .from('grading_systems')
      .select('id, name, slug, is_default')
      .eq('school_id', schoolId)
      .order('name')

    if (sysErr || !sysRows) { setSystems([]); setLoading(false); return }

    const systemIds = sysRows.map(s => s.id)

    const { data: bandRows } = await supabase
      .from('grading_bands')
      .select('id, system_id, grade, label, min_score, max_score, points, color, sort_order')
      .in('system_id', systemIds.length ? systemIds : ['00000000-0000-0000-0000-000000000000'])
      .order('sort_order')

    const bandMap = {}
    ;(bandRows || []).forEach(b => {
      if (!bandMap[b.system_id]) bandMap[b.system_id] = []
      bandMap[b.system_id].push(b)
    })

    const merged = sysRows.map(s => ({
      ...s,
      bands: bandMap[s.id] || [],
    }))

    setSystems(merged)
    setLoading(false)
  }, [schoolId])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  const defaultSystem = systems.find(s => s.is_default) || systems[0] || null

  const getBands = (slug) => {
    const sys = systems.find(s => s.slug === slug)
    return sys?.bands || []
  }

  const getGrade = (score, slug) => {
    const bands = getBands(slug)
    return bands.find(b => score >= b.min_score && score <= b.max_score) || null
  }

  return { systems, loading, defaultSystem, getBands, getGrade, refresh: fetchConfig }
}

/**
 * useExamTypeConfig(schoolId?)
 * ─────────────────────────────
 * Fetches exam type configuration for the current school.
 *
 * Returns:
 *   examTypes  — Array of { id, name, label, max_marks, weightage, description, sort_order }
 *   loading    — boolean
 *   examMap    — { [name]: { ...config } } for quick lookup
 *   getMax(name) — returns max_marks for a given exam type name
 *   refresh()  — re-fetch
 */
export function useExamTypeConfig(schoolIdProp) {
  const { profile } = useAuthStore()
  const schoolId = schoolIdProp || profile?.school_id

  const [examTypes, setExamTypes] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchConfig = useCallback(async () => {
    if (!schoolId) { setLoading(false); return }
    setLoading(true)

    const { data, error } = await supabase
      .from('exam_type_config')
      .select('id, name, label, max_marks, weightage, description, sort_order')
      .eq('school_id', schoolId)
      .order('sort_order')

    setExamTypes(error ? [] : (data || []))
    setLoading(false)
  }, [schoolId])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  const examMap = {}
  examTypes.forEach(et => { examMap[et.name] = et })

  const getMax = (name) => examMap[name]?.max_marks || 100

  return { examTypes, loading, examMap, getMax, refresh: fetchConfig }
}