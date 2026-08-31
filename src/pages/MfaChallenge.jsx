import { useState, useEffect } from 'react'
import { listFactors, verifyTotpCode } from '../features/auth/mfa'

// Inline TOTP challenge. Renders a 6-digit input and verifies the code against
// the user's verified factors. Used on the login card (email/password + Google)
// and as a hard gate in ProtectedRoute for persistent sessions.
export default function MfaChallenge({ onSuccess, onError }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [factors, setFactors] = useState([])

  useEffect(() => {
    listFactors()
      .then((f) => setFactors(f.filter((x) => x.status === 'verified')))
      .catch(() => setFactors([]))
  }, [])

  const submit = async () => {
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }
    if (factors.length === 0) {
      setError('No verified authenticator found. Contact your administrator.')
      return
    }
    setBusy(true)
    setError('')
    for (const factor of factors) {
      const res = await verifyTotpCode(factor.id, code)
      if (!res.error) {
        setBusy(false)
        if (onSuccess) onSuccess()
        return
      }
    }
    setError('Invalid code. Please try again.')
    setBusy(false)
  }

  return (
    <div className="mfa-panel">
      <h2 className="mfa-title">Two-factor authentication</h2>
      <p className="mfa-hint">
        Enter the 6-digit code from your authenticator app to continue.
      </p>

      <div className="login-field">
        <label>Authentication code</label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          value={code}
          maxLength={6}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          autoFocus
        />
      </div>

      {error && <div className="login-error">{error}</div>}

      <button type="button" className="login-btn" onClick={submit} disabled={busy || code.length < 6}>
        {busy ? 'Verifying...' : 'Verify'}
      </button>
    </div>
  )
}
