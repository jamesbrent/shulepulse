import { useState, useEffect } from 'react'
import { X, School, CreditCard, UserCheck, Check, ChevronLeft, ChevronRight, Building2, MapPin, Globe, Phone, Mail, Palette, ShieldCheck, LogOut, Loader } from 'lucide-react'
import { onboardSchool } from './onboardingService'
import { fetchCounties, fetchSchoolTypes, fetchPlans } from './onboardingData'
import { basePath } from '../../lib/paths'
import './OnboardSchoolModal.css'

const STEPS = ['School Details', 'Plan & Branding', 'Admin Account', 'Confirm']

export default function OnboardSchoolModal({ onClose }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const [counties, setCounties] = useState([])
  const [schoolTypes, setSchoolTypes] = useState([])
  const [plans, setPlans] = useState([])
  const [loadingRefs, setLoadingRefs] = useState(true)

  useEffect(() => {
    Promise.all([fetchCounties(), fetchSchoolTypes(), fetchPlans()])
      .then(([c, t, p]) => {
        setCounties(c)
        setSchoolTypes(t)
        setPlans(p)
      })
      .catch(() => {})
      .finally(() => setLoadingRefs(false))
  }, [])

  const [school, setSchool] = useState({
    name: '',
    county: '',
    type: '',
    address: '',
    phone: '',
    email: '',
    plan: '',
    primaryColor: '#2563eb',
    secondaryColor: '#16a34a',
  })

  const [admin, setAdmin] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  useEffect(() => {
    if (schoolTypes.length > 0 && !school.type) {
      setSchool((prev) => ({ ...prev, type: schoolTypes[0] }))
    }
  }, [schoolTypes])

  useEffect(() => {
    if (plans.length > 0 && !school.plan) {
      const recommended = plans.find((p) => p.recommended) || plans[0]
      setSchool((prev) => ({ ...prev, plan: recommended.key }))
    }
  }, [plans])

  const updateSchool = (field, value) => {
    setSchool((prev) => ({ ...prev, [field]: value }))
  }

  const updateAdmin = (field, value) => {
    setAdmin((prev) => ({ ...prev, [field]: value }))
  }

  const canProceed = () => {
    if (step === 0) return school.name.trim() && school.county && school.type
    if (step === 1) return school.plan
    if (step === 2) {
      return (
        admin.fullName.trim() &&
        admin.email.trim() &&
        admin.password.length >= 6 &&
        admin.password === admin.confirmPassword
      )
    }
    return true
  }

  const handleNext = () => {
    if (!canProceed()) return
    setStep((prev) => Math.min(prev + 1, STEPS.length - 1))
  }

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 0))
  }

  const handleSubmit = async () => {
    setSaving(true)
    setError('')

    try {
      await onboardSchool({ school, admin })
      setDone(true)
      setTimeout(() => {
        window.location.href = basePath('/')
      }, 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDone = () => {
    window.location.href = basePath('/')
  }

  if (loadingRefs) {
    return (
      <div className="onboard-overlay">
        <div className="onboard-modal" onClick={(e) => e.stopPropagation()} style={{ alignItems: 'center', justifyContent: 'center', padding: 60 }}>
          <Loader size={24} className="spin" />
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="onboard-overlay">
        <div className="onboard-modal onboard-success" onClick={(e) => e.stopPropagation()}>
          <div className="onboard-success-inner">
            <div className="success-icon-wrap">
              <Check size={32} />
            </div>
            <h2>School Onboarded!</h2>
            <p className="success-sub">
              <strong>{school.name}</strong> has been created and the admin account is ready.
            </p>

            <div className="success-creds">
              <div className="cred-row">
                <span>Admin Email</span>
                <span className="cred-value">{admin.email}</span>
              </div>
              <div className="cred-row">
                <span>Password</span>
                <span className="cred-value">{admin.password}</span>
              </div>
            </div>

            <p className="success-note">
              Share these credentials with the school admin. You'll be redirected to the login page shortly.
            </p>

            <button className="btn-primary" onClick={handleDone}>
              <LogOut size={16} /> Go to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="onboard-overlay" onClick={onClose}>
      <div className="onboard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="onboard-header">
          <div className="onboard-header-left">
            <School size={20} />
            <h2>Onboard New School</h2>
          </div>
          <button className="onboard-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="onboard-progress">
          {STEPS.map((label, i) => (
            <div key={label} className={`progress-step ${i <= step ? 'done' : ''} ${i === step ? 'active' : ''}`}>
              <div className="step-indicator">
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              <span className="step-label">{label}</span>
            </div>
          ))}
        </div>

        <div className="onboard-body">
          {error && <div className="onboard-error">{error}</div>}

          {step === 0 && (
            <div className="onboard-step">
              <h3>School Information</h3>
              <p className="step-hint">Enter the basic details of the school you're onboarding.</p>
              <div className="form-grid two-col">
                <div className="form-field">
                  <label><School size={14} /> School Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Moi High School"
                    value={school.name}
                    onChange={(e) => updateSchool('name', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label><MapPin size={14} /> County</label>
                  <select value={school.county} onChange={(e) => updateSchool('county', e.target.value)}>
                    <option value="">Select county</option>
                    {counties.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label><Building2 size={14} /> School Type</label>
                  <select value={school.type} onChange={(e) => updateSchool('type', e.target.value)}>
                    {schoolTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label><Phone size={14} /> Phone Number</label>
                  <input
                    type="tel"
                    placeholder="+254 7XX XXX XXX"
                    value={school.phone}
                    onChange={(e) => updateSchool('phone', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label><Mail size={14} /> Email Address</label>
                  <input
                    type="email"
                    placeholder="school@example.com"
                    value={school.email}
                    onChange={(e) => updateSchool('email', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label><Globe size={14} /> Physical Address</label>
                  <input
                    type="text"
                    placeholder="e.g. 123 Kenyatta Ave"
                    value={school.address}
                    onChange={(e) => updateSchool('address', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="onboard-step">
              <h3>Plan & Branding</h3>
              <p className="step-hint">Choose a subscription plan and customize the school's theme.</p>

              <div className="plan-cards">
                {plans.map((p) => (
                  <div
                    key={p.key}
                    className={`plan-card ${school.plan === p.key ? 'selected' : ''} ${p.recommended ? 'recommended' : ''}`}
                    onClick={() => updateSchool('plan', p.key)}
                  >
                    {p.recommended && <span className="plan-badge-rec">Recommended</span>}
                    <h4>{p.label}</h4>
                    <div className="plan-price">{p.price}<span>/mo</span></div>
                    <ul>
                      {p.features.map((f, i) => (
                        <li key={i}><Check size={12} /> {f}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="form-grid two-col" style={{ marginTop: 24 }}>
                <div className="form-field">
                  <label><Palette size={14} /> Primary Color</label>
                  <div className="color-picker-wrap">
                    <input
                      type="color"
                      value={school.primaryColor}
                      onChange={(e) => updateSchool('primaryColor', e.target.value)}
                    />
                    <span>{school.primaryColor}</span>
                  </div>
                </div>
                <div className="form-field">
                  <label><Palette size={14} /> Secondary Color</label>
                  <div className="color-picker-wrap">
                    <input
                      type="color"
                      value={school.secondaryColor}
                      onChange={(e) => updateSchool('secondaryColor', e.target.value)}
                    />
                    <span>{school.secondaryColor}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="onboard-step">
              <h3>School Admin Account</h3>
              <p className="step-hint">Create the admin account for this school. They'll use these credentials to log in.</p>
              <div className="form-grid two-col">
                <div className="form-field full-width">
                  <label><UserCheck size={14} /> Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. John Kamau"
                    value={admin.fullName}
                    onChange={(e) => updateAdmin('fullName', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label><Mail size={14} /> Admin Email</label>
                  <input
                    type="email"
                    placeholder="admin@school.ac.ke"
                    value={admin.email}
                    onChange={(e) => updateAdmin('email', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label><ShieldCheck size={14} /> Temporary Password</label>
                  <input
                    type="password"
                    placeholder="Min. 6 characters"
                    value={admin.password}
                    onChange={(e) => updateAdmin('password', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label><ShieldCheck size={14} /> Confirm Password</label>
                  <input
                    type="password"
                    placeholder="Repeat password"
                    value={admin.confirmPassword}
                    onChange={(e) => updateAdmin('confirmPassword', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="onboard-step">
              <h3>Review & Confirm</h3>
              <p className="step-hint">Please review the information before submitting.</p>

              <div className="review-grid">
                <div className="review-section">
                  <h4><School size={14} /> School Details</h4>
                  <div className="review-row"><span>Name</span><span>{school.name}</span></div>
                  <div className="review-row"><span>County</span><span>{school.county}</span></div>
                  <div className="review-row"><span>Type</span><span>{school.type}</span></div>
                  <div className="review-row"><span>Phone</span><span>{school.phone || '—'}</span></div>
                  <div className="review-row"><span>Email</span><span>{school.email || '—'}</span></div>
                  <div className="review-row"><span>Address</span><span>{school.address || '—'}</span></div>
                </div>

                <div className="review-section">
                  <h4><CreditCard size={14} /> Plan</h4>
                  <div className="review-row"><span>Plan</span><span className="plan-tag">{school.plan}</span></div>
                  <div className="review-row">
                    <span>Colors</span>
                    <span className="color-dots">
                      <span className="dot" style={{ background: school.primaryColor }} />
                      <span className="dot" style={{ background: school.secondaryColor }} />
                    </span>
                  </div>
                </div>

                <div className="review-section">
                  <h4><UserCheck size={14} /> Admin Account</h4>
                  <div className="review-row"><span>Name</span><span>{admin.fullName}</span></div>
                  <div className="review-row"><span>Email</span><span>{admin.email}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="onboard-footer">
          {step > 0 && (
            <button className="btn-ghost" onClick={handleBack}>
              <ChevronLeft size={16} /> Back
            </button>
          )}
          <div className="onboard-footer-right">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            {step < STEPS.length - 1 ? (
              <button className="btn-primary" onClick={handleNext} disabled={!canProceed()}>
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Onboarding...' : 'Complete Onboarding'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
