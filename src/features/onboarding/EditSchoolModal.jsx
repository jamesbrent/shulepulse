import { useState, useEffect } from 'react'
import { X, School, MapPin, Building2, Phone, Mail, Globe, CreditCard, Palette, Loader } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fetchCounties, fetchSchoolTypes } from './onboardingData'
import { logAction } from '../audit/auditService'

export default function EditSchoolModal({ school, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [counties, setCounties] = useState([])
  const [schoolTypes, setSchoolTypes] = useState([])

  const [form, setForm] = useState({
    name: school.name || '',
    county: school.county || '',
    type: school.type || '',
    phone: school.phone || '',
    email: school.email || '',
    address: school.address || '',
    plan: school.plan || 'basic',
    primary_color: school.primary_color || '#2563eb',
    secondary_color: school.secondary_color || '#16a34a',
    status: school.status || 'active',
  })

  useEffect(() => {
    Promise.all([fetchCounties(), fetchSchoolTypes()])
      .then(([c, t]) => {
        setCounties(c)
        setSchoolTypes(t)
      })
      .catch(() => {})
  }, [])

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { error: err } = await supabase
      .from('schools')
      .update({
        name: form.name,
        county: form.county,
        type: form.type,
        phone: form.phone,
        email: form.email,
        address: form.address,
        plan: form.plan,
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        status: form.status,
      })
      .eq('id', school.id)

    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    logAction({
      schoolId: school.id,
      action: 'school.edited',
      details: { schoolName: school.name, changes: form },
    })
    onSaved()
  }

  return (
    <div className="onboard-overlay" onClick={onClose}>
      <div className="onboard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="onboard-header">
          <div className="onboard-header-left">
            <School size={20} />
            <h2>Edit School</h2>
          </div>
          <button className="onboard-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="onboard-body">
          {error && <div className="onboard-error">{error}</div>}

          <div className="form-grid two-col">
            <div className="form-field">
              <label><School size={14} /> School Name</label>
              <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} required />
            </div>
            <div className="form-field">
              <label><MapPin size={14} /> County</label>
              <select value={form.county} onChange={(e) => update('county', e.target.value)}>
                <option value="">Select county</option>
                {counties.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label><Building2 size={14} /> Category</label>
              <select value={form.type} onChange={(e) => update('type', e.target.value)}>
                {schoolTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label><Phone size={14} /> Phone</label>
              <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
            </div>
            <div className="form-field">
              <label><Mail size={14} /> Email</label>
              <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
            </div>
            <div className="form-field">
              <label><Globe size={14} /> Address</label>
              <input type="text" value={form.address} onChange={(e) => update('address', e.target.value)} />
            </div>
            <div className="form-field">
              <label><CreditCard size={14} /> Plan</label>
              <select value={form.plan} onChange={(e) => update('plan', e.target.value)}>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="form-field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => update('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="trial">Trial</option>
              </select>
            </div>
            <div className="form-field">
              <label><Palette size={14} /> Primary Color</label>
              <div className="color-picker-wrap">
                <input type="color" value={form.primary_color} onChange={(e) => update('primary_color', e.target.value)} />
                <span>{form.primary_color}</span>
              </div>
            </div>
            <div className="form-field">
              <label><Palette size={14} /> Secondary Color</label>
              <div className="color-picker-wrap">
                <input type="color" value={form.secondary_color} onChange={(e) => update('secondary_color', e.target.value)} />
                <span>{form.secondary_color}</span>
              </div>
            </div>
          </div>
        </form>

        <div className="onboard-footer">
          <div className="onboard-footer-right">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
