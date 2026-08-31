import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ROLE_ROUTES, hasRole } from '../utils/roles'
import MfaChallenge from '../pages/MfaChallenge'

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, profile, loading, mfaChallengeRequired, completeMfa } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return

    if (!user || mfaChallengeRequired) return

    const role = profile?.role
    if (allowedRoles && !allowedRoles.some(r => hasRole(profile, r))) {
      navigate(ROLE_ROUTES[role] || '/', { replace: true })
    }
  }, [user, profile, loading, navigate, allowedRoles, mfaChallengeRequired])

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontFamily: 'Inter, sans-serif', color: '#64748b'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 36, height: 36, border: '3px solid #e2e8f0',
            borderTop: '3px solid #2563eb', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 12px'
          }} />
          <p style={{ fontSize: 14 }}>Loading ShulePulse...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    )
  }

  if (!user) return null

  // Hard MFA gate for persistent sessions (Google OAuth return / page reload).
  if (mfaChallengeRequired) {
    return (
      <div className="login-page" style={{ padding: 24 }}>
        <div className="login-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div style={{ width: '100%', maxWidth: 360 }}>
            <MfaChallenge onSuccess={completeMfa} />
          </div>
        </div>
      </div>
    )
  }

  if (allowedRoles && !allowedRoles.some(r => hasRole(profile, r))) return null

  return children
}
