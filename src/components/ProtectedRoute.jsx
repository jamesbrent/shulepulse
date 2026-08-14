import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const ROLE_ROUTES = {
  superadmin: '/superadmin',
  admin: '/admin',
  deputy_administrator: '/deputy-admin',
  bursar: '/bursar',
  registrar: '/registrar',
  reception: '/reception',
  hod: '/hod',
  teacher: '/teacher',
  class_teacher: '/class-teacher',
  parent: '/parent',
  student: '/student',
  librarian: '/library',
}

function hasRole(profile, role) {
  return profile?.role === role || profile?.roles?.includes(role)
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return

    if (!user) {
      navigate('/', { replace: true })
      return
    }

    const role = profile?.role
    if (allowedRoles && !allowedRoles.some(r => hasRole(profile, r))) {
      navigate(ROLE_ROUTES[role] || '/', { replace: true })
    }
  }, [user, profile, loading, navigate, allowedRoles])

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
  if (allowedRoles && !allowedRoles.some(r => hasRole(profile, r))) return null

  return children
}
