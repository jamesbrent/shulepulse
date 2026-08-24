import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { basePath } from '../lib/paths'
import logoImg from '../assets/logo.png'
import AnimatedDottedMap from '../components/AnimatedDottedMap'
import './Login.css'

const FEATURES = [
  { icon: '📊', label: 'Student Management', desc: 'Track every learner' },
  { icon: '💰', label: 'Finance & Fees', desc: 'Smart billing engine' },
  { icon: '✅', label: 'Attendance', desc: 'Real-time tracking' },
  { icon: '📚', label: 'Academics', desc: 'Grades & reports' },
  { icon: '📈', label: 'Reports', desc: 'Analytics & insights' },
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
        {/* ── Left Panel: Branded Visual ── */}
        <div className="login-left">
          <AnimatedDottedMap />

          <div className="login-left-content">
            <div className="login-left-brand">
              <div className="login-left-logo"><img src={logoImg} alt="ShulePulse" /></div>
              <span className="login-left-name">ShulePulse</span>
            </div>

            <h1 className="login-headline">Run Your School Smarter</h1>
            <p className="login-sub">One intelligent platform connecting every part of your school.</p>

            <div className="login-features">
              {FEATURES.map((f) => (
                <div key={f.label} className="login-feature-card">
                  <span className="login-feature-icon">{f.icon}</span>
                  <div>
                    <div className="login-feature-label">{f.label}</div>
                    <div className="login-feature-desc">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="login-left-footer">
              <div className="login-stats">
                <div className="login-stat">
                  <span className="stat-num">500+</span>
                  <span className="stat-label">Schools</span>
                </div>
                <div className="login-stat">
                  <span className="stat-num">120K+</span>
                  <span className="stat-label">Students</span>
                </div>
                <div className="login-stat">
                  <span className="stat-num">47</span>
                  <span className="stat-label">Counties</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Panel: Login Form ── */}
        <div className="login-right">
          <div className="login-right-inner">
            <div className="login-form-header">
              <div className="login-form-logo"><img src={logoImg} alt="ShulePulse" /></div>
              <h2 className="login-title">Welcome back</h2>
              <p className="login-hint">Sign in to access your school management system.</p>
            </div>

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
      </div>
    </div>
  )
}
