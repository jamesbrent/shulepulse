import { getProfile } from './profiles/presets'

export const PROFILES_BY_CLASS = [
  { match: /pp1|pp2|pre-primary|preprimary|grade\s*[123](?!\d)/i, profile: 'early' },
  { match: /grade\s*[456](?!\d)/i, profile: 'upperPrimary' },
  { match: /grade\s*[789](?!\d)/i, profile: 'junior' },
  { match: /grade\s*(?:10|11|12)(?!\d)/i, profile: 'senior' },
]

export function resolveProfile(className = '') {
  const c = String(className || '').toLowerCase().trim()
  if (!c) {
    return { profile: null, system: 'unresolved', status: 'unresolved', reason: 'empty-class' }
  }
  for (const rule of PROFILES_BY_CLASS) {
    if (rule.match.test(c)) {
      const profile = getProfile(rule.profile)
      if (!profile) {
        return { profile: null, system: 'unresolved', status: 'unresolved', reason: 'missing-profile' }
      }
      return { profile: profile.id, system: profile.system, status: profile.status }
    }
  }
  return { profile: null, system: 'unresolved', status: 'unresolved', reason: 'unknown-class' }
}

export function resolveSystem(className = '') {
  return resolveProfile(className).system
}
