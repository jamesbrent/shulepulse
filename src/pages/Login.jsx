import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { basePath } from '../lib/paths'
import { fetchPlatformSettings, fetchMaintenanceStatus } from '../features/superadmin/platformSettingsService'
import { checkLoginSecurity, recordLoginAttempt, recordLoginSession } from '../features/auth/loginSecurity'
import { hasVerifiedMfa, isRoleMfaRequired } from '../features/auth/mfa'
import { useAuthStore } from '../store/authStore'
import logoImg from '../assets/logo.png'
import AnimatedDottedMap from '../components/AnimatedDottedMap'
import MaintenancePage from './MaintenancePage'
import MfaChallenge from './MfaChallenge'
import MfaSetup from './MfaSetup'
import './MaintenancePage.css'
import './Login.css'

function roleRoute(role) {
  switch (role) {
    case 'superadmin': return '/superadmin'
    case 'admin': return '/admin'
    case 'class_teacher': return '/class-teacher'
    case 'teacher': return '/teacher'
    case 'parent': return '/parent'
    case 'student': return '/student'
    case 'librarian': return '/library'
    case 'reception': return '/reception'
    case 'deputy_administrator': return '/deputy-admin'
    case 'registrar': return '/registrar'
    case 'hod': return '/hod'
    case 'bursar': return '/bursar'
    default: return '/admin'
  }
}

function redirectToDashboard(role) {
  window.location.href = basePath(roleRoute(role))
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [maintenance, setMaintenance] = useState(null)
  const [minPasswordLength, setMinPasswordLength] = useState(8)
  const [showMaintenanceLogin, setShowMaintenanceLogin] = useState(false)

  // view: 'login' | 'mfa' | 'mfa-setup'
  const [view, setView] = useState('login')
  const [pendingProfile, setPendingProfile] = useState(null)

  const completeMfa = useAuthStore((s) => s.completeMfa)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('session_expired') === '1') {
      setError('Your session has expired due to inactivity. Please sign in again.')
    }

    const schoolId = params.get('school')
    if (schoolId) {
      supabase.rpc('get_school_branding', { p_school_id: schoolId })
        .then(({ data }) => {
          if (!data || typeof data !== 'object') return
          const root = document.documentElement
          if (data.primary_color) root.style.setProperty('--color-primary', data.primary_color)
          if (data.secondary_color) root.style.setProperty('--color-secondary', data.secondary_color)
        })
        .catch(() => {})
    }

    fetchMaintenanceStatus()
      .then((s) => setMaintenance(s))
      .catch(() => {})

    fetchPlatformSettings()
      .then((s) => setMinPasswordLength(s.auth_security?.min_password_length || 8))
      .catch(() => {})

    // Google OAuth redirect return: verify the returned identity actually maps
    // to a school profile. If not, deny access (sign out) and show a message.
    if (params.get('google') === 'return') {
      handleGoogleReturn()
    }
  }, [])

  const handleGoogleReturn = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setError('Google sign-in did not complete. Please try again.')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, disabled, school_id')
      .eq('id', session.user.id)
      .single()

    // Deny: no profile, disabled account, or no school linkage (arbitrary account).
    const provisioned = profile?.school_id || profile?.role === 'superadmin'
    if (!profile || profile.disabled || !provisioned) {
      await supabase.auth.signOut()
      setError('This Google account is not registered to a school. Contact your administrator.')
      return
    }

    setPendingProfile(profile)

    // Role-required but not yet set up: offer inline setup (soft, can skip).
    const roleMfa = await isRoleMfaRequired(profile.role).catch(() => false)
    const hasMfa = await hasVerifiedMfa().catch(() => false)
    if (hasMfa) {
      setView('mfa')
      return
    }
    if (roleMfa) {
      setView('mfa-setup')
      return
    }

    redirectToDashboard(profile.role)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password.length < minPasswordLength) {
      setError(`Password must be at least ${minPasswordLength} characters.`)
      setLoading(false)
      return
    }

    try {
      const security = await checkLoginSecurity(email)
      if (!security.allowed) {
        setError(security.reason)
        setLoading(false)
        return
      }
    } catch {
      // proceed if check fails
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      recordLoginAttempt({ email, success: false }).catch(() => {})
      setError('Invalid email or password. Please try again.')
      setLoading(false)
      return
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role, disabled')
      .eq('id', data.user.id)
      .single()

    if (profileErr || !profile) {
      setError('Profile not found. Contact your administrator.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    if (profile.disabled) {
      setError('This account has been disabled. Contact your administrator.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    const role = profile.role

    recordLoginAttempt({ email, success: true }).catch(() => {})
    recordLoginSession(data.user.id).catch(() => {})

    setPendingProfile(profile)

    // MFA posture: verified factor -> force challenge; role-required but no
    // factor -> offer setup. Neither -> straight to dashboard.
    const hasMfa = await hasVerifiedMfa().catch(() => false)
    const roleMfa = await isRoleMfaRequired(role).catch(() => false)

    if (hasMfa) {
      setView('mfa')
      setLoading(false)
      return
    }
    if (roleMfa && !hasMfa) {
      setView('mfa-setup')
      setLoading(false)
      return
    }

    redirectToDashboard(role)
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError('')
    try {
      const redirectTo = `${window.location.origin}${basePath('/')}?google=return`
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      if (error) {
        setError(error.message || 'Unable to start Google sign-in. Please try again.')
        setGoogleLoading(false)
      }
    } catch (err) {
      setError(err.message || 'Unable to start Google sign-in. Please try again.')
      setGoogleLoading(false)
    }
  }

  const onMfaSuccess = async () => {
    await completeMfa()
    if (pendingProfile) {
      redirectToDashboard(pendingProfile.role)
    }
  }

  const renderFormView = () => {
    if (view === 'mfa') {
      return <MfaChallenge onSuccess={onMfaSuccess} />
    }
    if (view === 'mfa-setup') {
      return (
        <MfaSetup
          onCancel={() => redirectToDashboard(pendingProfile?.role || 'admin')}
          onDone={async () => {
            setView('mfa')
            await hasVerifiedMfa().catch(() => false)
          }}
        />
      )
    }
    return (
      <>
        <button type="button" className="login-google-btn" onClick={handleGoogle} disabled={googleLoading}>
          {googleLoading ? (
            <span className="login-btn-loading">
              <span className="login-spinner" />
              Connecting to Google...
            </span>
          ) : (
            <span className="login-google-inner">
              <svg className="login-google-icon" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
              </svg>
              Continue with Google
            </span>
          )}
        </button>

        <div className="login-divider">
          <span className="login-divider-line" />
          <span className="login-divider-text">or sign in with email</span>
          <span className="login-divider-line" />
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="login-field">
            <label>Email address</label>
            <input
              type="email"
              placeholder="you@school.ac.ke"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="login-field">
            <label>Password</label>
            <div className="password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>
          <div className="login-options">
            <label className="login-remember">
              <input type="checkbox" /> <span>Remember me</span>
            </label>
            <a href={basePath('/forgot-password')} className="login-forgot-link">Forgot password?</a>
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <span className="login-btn-loading">
                <span className="login-spinner" />
                Signing in...
              </span>
            ) : 'Sign in'}
          </button>
        </form>
      </>
    )
  }

  if (maintenance === null) return null

  if (maintenance?.enabled && !showMaintenanceLogin) {
    return (
      <>
        <MaintenancePage message={maintenance.message} />
        <button
          onClick={() => setShowMaintenanceLogin(true)}
          style={{
            position: 'fixed', bottom: 24, right: 24, background: '#1e293b',
            color: '#94a3b8', border: '1px solid #334155', borderRadius: 8,
            padding: '8px 16px', fontSize: 12, cursor: 'pointer', zIndex: 1001,
          }}
        >
          Admin Login
        </button>
      </>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* ── Left Panel: Login Form (dark) ── */}
        <div className="login-left">
          <div className="login-left-content">
            <div className="login-brand-row">
              <div className="login-logo-badge"><img src={logoImg} alt="ShulePulse" /></div>
              <span className="login-brand-name">ShulePulse</span>
            </div>

            <h1 className="login-title">{view === 'login' ? 'Welcome back' : 'Security verification'}</h1>
            <p className="login-hint">
              {view === 'login'
                ? 'Sign in to continue to your school management system'
                : 'Confirm your identity to finish signing in'}
            </p>

            {error && <div className="login-error">{error}</div>}

            {renderFormView()}

            {view === 'login' && (
              <div className="login-roles">
                <span>Portals:</span>
                {['Admin', 'Teacher', 'Parent', 'Student'].map((r) => (
                  <span key={r} className="role-badge">{r}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right Panel: Ecosystem Visualization (dark, animated) ── */}
        <div className="login-right">
          <AnimatedDottedMap />
        </div>
      </div>
      <div className="login-footer">
        <a href={basePath('/privacy-policy')} className="login-footer-link">Privacy Policy</a>
        <span className="login-footer-sep">&middot;</span>
        <a href={basePath('/terms-of-service')} className="login-footer-link">Terms of Service</a>
        <span className="login-footer-sep">&middot;</span>
        <span>&copy; {new Date().getFullYear()} ShulePulse</span>
      </div>
    </div>
  )
}
