import { supabase } from '../../lib/supabase'
import { fetchPlatformSettings } from '../superadmin/platformSettingsService'

// ─── TOTP MFA (Supabase Native) ─────────────────────────────────────────────
// Uses the real Supabase MFA flow (supabase.auth.mfa). Supabase stores the TOTP
// secret server-side; the browser only ever holds the enrollment challenge while
// the user scans the QR code. If Supabase MFA is not enabled for the project
// (multi_factor_auth disabled), every call simply resolves to a clean "not
// available" result so normal login is never blocked.

const MFA_UNAVAILABLE = { available: false, reason: 'MFA is not enabled for this project.' }

function mfaApi() {
  return supabase.auth.mfa
}

export async function isMfaAvailable() {
  try {
    const api = mfaApi()
    if (!api || typeof api.listFactors !== 'function') return false
    return true
  } catch {
    return false
  }
}

// List the authenticated user's MFA factors, filtering to verified TOTP ones.
export async function listFactors() {
  const api = mfaApi()
  if (!api || typeof api.listFactors !== 'function') return []
  const { data, error } = await api.listFactors()
  if (error || !data) return []
  const factors = data.all || []
  return factors.filter((f) => f.factor_type === 'totp')
}

export async function hasVerifiedMfa() {
  const factors = await listFactors()
  return factors.some((f) => f.status === 'verified')
}

// Begin TOTP enrollment. Returns the enrollment object with qr_code, otpauth_uri
// and the raw secret; factor_id is required to complete verification.
export async function enrollTotp(friendlyName = 'ShulePulse authenticator') {
  const api = mfaApi()
  if (!api || typeof api.enroll !== 'function') {
    return { error: { message: MFA_UNAVAILABLE.reason } }
  }
  const { data, error } = await api.enroll({
    factorType: 'totp',
    friendlyName,
  })
  if (error) return { error }
  return { data, factorId: data?.id }
}

// Create a challenge for an enrolled factor, then verify a 6-digit TOTP code.
// On success the factor becomes (and stays) verified for the session.
export async function verifyTotpCode(factorId, code) {
  const api = mfaApi()
  if (!api || typeof api.challenge !== 'function' || typeof api.verify !== 'function') {
    return { error: { message: MFA_UNAVAILABLE.reason } }
  }

  const { data: challengeData, error: challengeError } = await api.challenge({ factorId })
  if (challengeError || !challengeData?.id) {
    return { error: challengeError || { message: 'Could not start authentication challenge.' } }
  }

  const { data, error } = await api.verify({
    factorId,
    challengeId: challengeData.id,
    code: String(code).trim(),
  })
  if (error) return { error }
  return { data }
}

// Resolve the MFA posture for an authenticated profile into a pair of flags the
// auth store / route guard can act on. Never throws; returns safe defaults so a
// project without MFA enabled behaves exactly as before.
export async function resolveMfaStatus(profile) {
  const role = profile?.role
  let factors = []
  try {
    factors = await listFactors()
  } catch {
    factors = []
  }
  const verified = factors.some((f) => f.status === 'verified')
  const required = await isRoleMfaRequired(role).catch(() => false)
  return {
    challengeRequired: verified,
    setupSuggested: required && !verified,
  }
}

// ─── Role-based MFA policy (configurable, not hardcoded) ────────────────────
// Reads auth_security.mfa_required_roles from platform settings. Returns true
// when the given role is on the required list and the flag two_factor_enabled
// is on. A safe default (empty list) means MFA is never forced out of the box.
export async function isRoleMfaRequired(role) {
  try {
    const settings = await fetchPlatformSettings()
    const auth = settings.auth_security || {}
    if (!auth.two_factor_enabled) return false
    const required = Array.isArray(auth.mfa_required_roles) ? auth.mfa_required_roles : []
    return required.includes(role)
  } catch {
    return false
  }
}
