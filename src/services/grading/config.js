import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

const cachesBySchool = new Map()
const pendingBySchool = new Map()

function normalizeBands(rows = []) {
  return rows
    .map((b) => ({
      code: b.grade,
      level: Number(b.points) || null,
      points: Number(b.points) || null,
      min: Number(b.min_score),
      max: Number(b.max_score),
      label: b.label || `${b.min_score}–${b.max_score}`,
      color: String(b.grade || '').toLowerCase(),
    }))
    .sort((a, b) => (Number(a.min) || 0) - (Number(b.min) || 0))
}

function resolveSchoolId(schoolId) {
  if (schoolId) return schoolId
  const profile = useAuthStore.getState().profile
  return profile?.school_id || null
}

async function loadForSchool(schoolId) {
  const { data: systems, error: sysErr } = await supabase
    .from('grading_systems')
    .select('id, school_id, name, slug, is_default')
    .eq('school_id', schoolId)
  if (sysErr) throw sysErr

  const ids = (systems || []).map((s) => s.id)
  const { data: bands, error: bandErr } = ids.length
    ? await supabase
        .from('grading_bands')
        .select('system_id, grade, label, min_score, max_score, points, color, sort_order')
        .in('system_id', ids)
    : { data: [], error: null }
  if (bandErr) throw bandErr

  const bySystem = {}
  ;(bands || []).forEach((b) => {
    if (!bySystem[b.system_id]) bySystem[b.system_id] = []
    bySystem[b.system_id].push(b)
  })

  return (systems || []).map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    isDefault: !!s.is_default,
    bands: normalizeBands(bySystem[s.id] || []),
  }))
}

export async function loadGradingConfig(schoolId) {
  const sid = resolveSchoolId(schoolId)
  if (!sid) return
  if (cachesBySchool.has(sid)) return

  if (!pendingBySchool.has(sid)) {
    const p = (async () => {
      try {
        cachesBySchool.set(sid, await loadForSchool(sid))
      } catch (err) {
        console.error('[grading] failed to load configured grading systems:', err)
      } finally {
        pendingBySchool.delete(sid)
      }
    })()
    pendingBySchool.set(sid, p)
  }
  return pendingBySchool.get(sid)
}

export function refreshGradingConfig(schoolId) {
  const sid = resolveSchoolId(schoolId)
  if (!sid) {
    cachesBySchool.clear()
    return Promise.resolve()
  }
  cachesBySchool.delete(sid)
  pendingBySchool.delete(sid)
  return loadGradingConfig(sid)
}

export function getConfiguredBands(slug) {
  const sid = resolveSchoolId()
  const sys = (cachesBySchool.get(sid) || []).find((s) => s.slug === slug)
  return sys && sys.bands.length ? sys.bands : null
}
