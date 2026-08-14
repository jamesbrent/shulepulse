import { resolveProfile } from './resolve'
import { getProfile } from './profiles/presets'

export const CBESTAGES = ['EARLY', 'UPPER_PRIMARY', 'JUNIOR', 'SENIOR']

export function isCBCClass(className) {
  return resolveProfile(className).status !== 'unresolved'
}

export function stageForClass(className) {
  const resolved = resolveProfile(className)
  if (resolved.status === 'unresolved') return null
  const profile = getProfile(resolved.profile)
  return profile ? profile.stage : null
}
