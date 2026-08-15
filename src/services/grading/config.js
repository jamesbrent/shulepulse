import { supabase } from '../../lib/supabase'

let systemsCache = []
let pending = null

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

export async function loadGradingConfig() {
  if (pending) return pending
  pending = (async () => {
    try {
      const { data: systems, error: sysErr } = await supabase
        .from('grading_systems')
        .select('id, school_id, name, slug, is_default')
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

      systemsCache = (systems || []).map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        isDefault: !!s.is_default,
        bands: normalizeBands(bySystem[s.id] || []),
      }))
    } catch (err) {
      console.error('[grading] failed to load configured grading systems:', err)
      systemsCache = []
    } finally {
      pending = null
    }
  })()
  return pending
}

export function refreshGradingConfig() {
  systemsCache = []
  return loadGradingConfig()
}

export function getConfiguredBands(slug) {
  const sys = systemsCache.find((s) => s.slug === slug)
  return sys && sys.bands.length ? sys.bands : null
}
