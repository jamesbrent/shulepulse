export function gradeDisplay(g) {
  if (!g) return '—'
  if (g.status === 'unresolved' || g.status === 'pending') return '—'
  if (g.system === 'early') return g.band || '—'
  if (g.system === 'middle') return `${g.band} (${g.points}pts)`
  return g.band || g.grade || '—'
}

export function gradeShort(g) {
  if (!g) return '—'
  if (g.status === 'unresolved' || g.status === 'pending') return '—'
  return g.band || g.grade || '—'
}

export function pointsDisplay(g) {
  if (!g || g.points === null || g.points === undefined) return '—'
  return String(g.points)
}

export const BAND_ORDER = [
  'EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2', 'DE1', 'DE2',
  'EE', 'ME', 'AE', 'BE',
]

export function sortBands(bands) {
  return [...bands].sort((a, b) => {
    const ia = BAND_ORDER.indexOf(a)
    const ib = BAND_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return String(a).localeCompare(String(b))
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}

export function bandColor(band) {
  if (!band) return '#6b7280'
  const c = String(band)
  if (c.startsWith('EE')) return '#16a34a'
  if (c.startsWith('ME')) return '#2563eb'
  if (c.startsWith('AE')) return '#ca8a04'
  if (c.startsWith('BE')) return '#f97316'
  if (c.startsWith('DE')) return '#dc2626'
  return '#6b7280'
}

export function rawMarkOf(g) {
  if (!g) return null
  const isEnd = g.exam_type === 'End Term'
  const raw = isEnd
    ? (g.summative_score ?? g.exam_score ?? g.sba_score ?? g.cat_score)
    : (g.sba_score ?? g.cat_score ?? g.summative_score ?? g.exam_score)
  if (raw == null || Number.isNaN(Number(raw))) return null
  return Number(raw)
}

export function marksCell(g) {
  const raw = rawMarkOf(g)
  if (raw === null) return '—'
  const mx = g?.max_marks ? Number(g.max_marks) : null
  return mx ? `${raw}/${mx}` : String(raw)
}
