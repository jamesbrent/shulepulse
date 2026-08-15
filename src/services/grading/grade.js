import { resolveProfile } from './resolve'
import { getProfile } from './profiles/presets'
import { getConfiguredBands } from './config'

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

function lookupConfiguredBand(bands, score) {
  const numeric = Number(score)
  const clamped = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : null
  if (clamped === null) return null
  let best = null
  for (const band of bands) {
    if (clamped >= band.min && (!best || band.min > best.min)) best = band
  }
  return best
}

export function getGrade(score, className) {
  const resolved = resolveProfile(className)
  if (resolved.status === 'unresolved') {
    return { ...UNRESOLVED_RESULT, reason: resolved.reason }
  }

  const configuredBands = getConfiguredBands(resolved.profile)
  if (configuredBands && configuredBands.length) {
    const band = lookupConfiguredBand(configuredBands, score)
    if (!band) return { ...PENDING_RESULT }
    const hasPoints = configuredBands.some((b) => Number(b.points) > 0)
    const pointsMax = configuredBands.length
      ? Math.max(...configuredBands.map((b) => Number(b.points) || 0))
      : null
    return {
      system: hasPoints ? 'middle' : 'early',
      profile: resolved.profile,
      status: 'active',
      band: band.code,
      level: band.level ?? band.points,
      points: band.points,
      pointsMax: pointsMax || null,
      label: band.label,
      color: band.color,
    }
  }

  const preset = getProfile(resolved.profile)
  if (!preset || preset.status === 'pending') return { ...PENDING_RESULT }
  const band = lookupBand(preset, score)
  if (!band) return { ...PENDING_RESULT }
  const pointsMax = preset.bands?.length
    ? Math.max(...preset.bands.map(b => (Number(b.points) || 0)))
    : null
  return {
    system: preset.system,
    profile: preset.id,
    status: preset.status,
    band: band.code,
    level: band.level,
    points: band.points,
    pointsMax: pointsMax || null,
    label: band.label,
    color: band.color,
  }
}
