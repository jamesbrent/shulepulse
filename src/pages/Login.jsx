import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { basePath } from '../lib/paths'
import logoImg from '../assets/logo.png'
import AnimatedDottedMap from '../components/AnimatedDottedMap'
import './Login.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const schoolId = params.get('school')
    if (!schoolId) return

    supabase.rpc('get_school_branding', { p_school_id: schoolId })
      .then(({ data }) => {
        if (!data || typeof data !== 'object') return
        const root = document.documentElement
        if (data.primary_color) root.style.setProperty('--color-primary', data.primary_color)
        if (data.secondary_color) root.style.setProperty('--color-secondary', data.secondary_color)
      })
      .catch(() => {})
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
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

    if (role === 'superadmin') window.location.href = basePath('/superadmin')
    else if (role === 'admin') window.location.href = basePath('/admin')
    else if (role === 'class_teacher') window.location.href = basePath('/class-teacher')
    else if (role === 'teacher') window.location.href = basePath('/teacher')
    else if (role === 'parent') window.location.href = basePath('/parent')
    else if (role === 'student') window.location.href = basePath('/student')
    else if (role === 'librarian') window.location.href = basePath('/library')
    else if (role === 'reception') window.location.href = basePath('/reception')
    else window.location.href = basePath('/admin')
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

            <h1 className="login-title">Welcome back</h1>
            <p className="login-hint">Sign in to continue to your school management system</p>

            {error && <div className="login-error">{error}</div>}

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

            <div className="login-roles">
              <span>Portals:</span>
              {['Admin', 'Teacher', 'Parent', 'Student'].map((r) => (
                <span key={r} className="role-badge">{r}</span>
              ))}
            </div>
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
        <span>&copy; {new Date().getFullYear()} ShulePulse &middot; BIMA Graphics</span>
      </div>
    </div>
  )
}
