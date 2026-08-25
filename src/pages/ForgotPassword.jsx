import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { basePath } from '../lib/paths'
import logoImg from '../assets/logo.png'
import './Login.css'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + basePath('/reset-password'),
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="login-root">
      <div className="login-left">
        <div className="login-brand">
          <div className="login-logo"><img src={logoImg} alt="ShulePulse" /></div>
          <span className="login-brand-name">ShulePulse</span>
        </div>
        <h1 className="login-headline">Reset your password</h1>
        <p className="login-sub">We'll send you a link to create a new password.</p>
      </div>

      <div className="login-right">
        <div className="login-card">
          <h2 className="login-title">Forgot password?</h2>
          <p className="login-hint">Enter your email and we'll send you a reset link</p>

          {error && <div className="login-error">{error}</div>}

          {sent ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ color: '#16a34a', fontWeight: 600, marginBottom: 8 }}>Check your email</p>
              <p style={{ color: '#64748b', fontSize: 14 }}>
                We sent a password reset link to <strong>{email}</strong>
              </p>
              <a href={basePath('/')} style={{ display: 'inline-block', marginTop: 20, color: '#2563eb', fontWeight: 500 }}>
                Back to login
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="login-form">
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
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <a href={basePath('/')} style={{ color: '#64748b', fontSize: 14 }}>Back to login</a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
