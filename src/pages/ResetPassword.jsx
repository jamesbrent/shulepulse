import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { basePath } from '../lib/paths'
import './Login.css'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionReady(!!session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (!sessionReady) {
    return (
      <div className="login-root">
        <div className="login-left">
          <div className="login-brand">
            <div className="login-logo">SP</div>
            <span className="login-brand-name">ShulePulse</span>
          </div>
          <h1 className="login-headline">Reset your password</h1>
        </div>
        <div className="login-right">
          <div className="login-card">
            <p style={{ color: '#ef4444', textAlign: 'center', padding: '24px 0' }}>
              Invalid or expired reset link. Please request a new one.
            </p>
            <div style={{ textAlign: 'center' }}>
              <a href={basePath('/forgot-password')} style={{ color: '#2563eb', fontWeight: 500 }}>
                Request new reset link
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-root">
      <div className="login-left">
        <div className="login-brand">
          <div className="login-logo">SP</div>
          <span className="login-brand-name">ShulePulse</span>
        </div>
        <h1 className="login-headline">Create new password</h1>
        <p className="login-sub">Choose a strong password for your account.</p>
      </div>

      <div className="login-right">
        <div className="login-card">
          <h2 className="login-title">New password</h2>
          <p className="login-hint">Enter your new password below</p>

          {error && <div className="login-error">{error}</div>}

          {success ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ color: '#16a34a', fontWeight: 600, marginBottom: 8 }}>Password updated!</p>
              <p style={{ color: '#64748b', fontSize: 14 }}>
                Your password has been changed successfully.
              </p>
              <a href={basePath('/')} style={{ display: 'inline-block', marginTop: 20, color: '#2563eb', fontWeight: 500 }}>
                Sign in with new password
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label>New password</label>
                <input
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="login-field">
                <label>Confirm password</label>
                <input
                  type="password"
                  placeholder="Re-enter password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Updating...' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
