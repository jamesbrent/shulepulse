import { EARLY_PROFILE } from './early'
import { UPPER_PRIMARY_PROFILE } from './upperPrimary'
import { JUNIOR_PROFILE } from './junior'
import { SENIOR_PROFILE } from './senior'

export const CBEPROFILES = [EARLY_PROFILE, UPPER_PRIMARY_PROFILE, JUNIOR_PROFILE, SENIOR_PROFILE]

export function getProfile(id) {
  return CBEPROFILES.find(p => p.id === id) || null
}

export function getActiveProfiles() {
  return CBEPROFILES.filter(p => p.status !== 'pending' && p.status !== 'unresolved')
}
