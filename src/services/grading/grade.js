import { resolveProfile } from './resolve'
import { getProfile } from './profiles/presets'

export function lookupBand(profile, score) {
  const bands = profile.bands || []
  if (!bands.length) return null
  const numeric = Number(score)
  const clamped = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : null
  if (clamped === null) return null
  for (const band of bands) {
    if (clamped >= band.min) return band
  }
  return bands[bands.length - 1]
}

export const UNRESOLVED_RESULT = {
  system: 'unresolved',
  profile: null,
  status: 'unresolved',
  band: null,
  grade: null,
  level: null,
  points: null,
  pointsMax: null,
  label: 'Unresolved class profile — no grade issued',
  color: null,
  reason: 'unknown-class',
}

export const PENDING_RESULT = {
  system: 'senior',
  profile: 'senior',
  status: 'pending',
  band: null,
  grade: null,
  level: null,
  points: null,
  pointsMax: null,
  label: 'Pending verification — no grade issued',
  color: null,
}

export function getGrade(score, className) {
  const resolved = resolveProfile(className)
  if (resolved.status === 'unresolved') {
    return { ...UNRESOLVED_RESULT, reason: resolved.reason }
  }
  const profile = getProfile(resolved.profile)
  if (!profile || profile.status === 'pending') return { ...PENDING_RESULT }
  const band = lookupBand(profile, score)
  if (!band) return { ...PENDING_RESULT }
  const pointsMax = profile.bands?.length
    ? Math.max(...profile.bands.map(b => (Number(b.points) || 0)))
    : null
  return {
    system: profile.system,
    profile: profile.id,
    status: profile.status,
    band: band.code,
    level: band.level,
    points: band.points,
    pointsMax: pointsMax || null,
    label: band.label,
    color: band.color,
  }
}
