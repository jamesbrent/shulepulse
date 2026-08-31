import { useState } from 'react'
import { enrollTotp, verifyTotpCode, listFactors } from '../features/auth/mfa'

// Inline TOTP setup panel rendered inside the login card (role-configurable).
// Enrolls the user, shows the QR + manual secret, and verifies a 6-digit code
// to activate the factor. All TOTP secrets are held by Supabase server-side.
export default function MfaSetup({ onDone, onCancel }) {
  const [step, setStep] = useState('enroll')
  const [qrCode, setQrCode] = useState('')
  const [otpauth, setOtpauth] = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const startEnroll = async () => {
    setBusy(true)
    setError('')
    const res = await enrollTotp()
    if (res.error || !res.factorId) {
      setError(res.error?.message || 'Unable to start MFA setup.')
      setBusy(false)
      return
    }
    const totp = res.data?.totp || {}
    setFactorId(res.factorId)
    setQrCode(totp.qr_code || '')
    setOtpauth(totp.otpauth_uri || '')
    setSecret(totp.secret || '')
    setStep('verify')
    setBusy(false)
  }

  const confirm = async () => {
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }
    setBusy(true)
    setError('')
    const res = await verifyTotpCode(factorId, code)
    if (res.error) {
      setError(res.error.message || 'Invalid code. Please try again.')
      setBusy(false)
      return
    }
    await listFactors()
    setBusy(false)
    onDone()
  }

  const cancel = () => onCancel()

  return (
    <div className="mfa-panel">
      {step === 'enroll' && (
        <>
          <h2 className="mfa-title">Set up two-factor authentication</h2>
          <p className="mfa-hint">
            Protect this account with an authenticator app. You&apos;ll scan a QR code and
            enter a one-time code to finish.
          </p>
          {error && <div className="login-error">{error}</div>}
          <button type="button" className="login-btn" onClick={startEnroll} disabled={busy}>
            {busy ? 'Preparing...' : 'Start setup'}
          </button>
          <button type="button" className="mfa-secondary-btn" onClick={cancel}>Not now</button>
        </>
      )}

      {step === 'verify' && (
        <>
          <h2 className="mfa-title">Scan this code</h2>
          <p className="mfa-hint">
            Open your authenticator app (Google Authenticator, Authy, etc.) and scan the QR
            code below. If you can&apos;t scan, enter the secret manually.
          </p>

          {qrCode ? (
            <img className="mfa-qr" src={qrCode} alt="Authenticator QR code" />
          ) : (
            <p className="mfa-secret-block">Secret: <code>{secret}</code></p>
          )}

          {otpauth && (
            <p className="mfa-secret-block">
              Manual entry (otpauth): <code className="mfa-secret-code">{otpauth}</code>
            </p>
          )}

          <div className="login-field">
            <label>6-digit code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="button" className="login-btn" onClick={confirm} disabled={busy || code.length < 6}>
            {busy ? 'Verifying...' : 'Verify & activate'}
          </button>
          <button type="button" className="mfa-secondary-btn" onClick={cancel}>Cancel</button>
        </>
      )}
    </div>
  )
}
