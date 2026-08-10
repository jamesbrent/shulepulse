import { useState, useEffect } from 'react'
import {
  Settings, School, Bell, Lock, Save,
  CheckCircle, Eye, EyeOff, ChevronRight
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

export default function SettingsPage() {
  const { profile } = useAuthStore()
  const [activeTab, setActiveTab] = useState('school')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [showOldPwd, setShowOldPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [availableTerms, setAvailableTerms] = useState([])
  const [availableYears, setAvailableYears] = useState([])
  const [schoolTypes, setSchoolTypes] = useState([])

  const [schoolForm, setSchoolForm] = useState({
    name: '', email: '', phone: '', address: '',
    county: '', type: '', motto: '',
    current_term: '', current_year: new Date().getFullYear(),
  })

  const [notifForm, setNotifForm] = useState({
    fees_reminder: true,
    attendance_alert: true,
    grade_published: false,
    sms_enabled: false,
  })

  const [pwdForm, setPwdForm] = useState({
    old_password: '', new_password: '', confirm_password: ''
  })

  useEffect(() => { loadSchool(); fetchLookups() }, [])

  const fetchLookups = async () => {
    const [{ data: grades }, { data: schools }] = await Promise.all([
      supabase.from('grades').select('term, year').eq('school_id', profile.school_id),
      supabase.from('schools').select('type').eq('id', profile.school_id),
    ])
    if (grades) {
      const terms = [...new Set(grades.map(g => g.term).filter(Boolean))].sort()
      const years = [...new Set(grades.map(g => g.year).filter(Boolean))].sort()
      if (terms.length) setAvailableTerms(terms)
      if (years.length) setAvailableYears(years)
    }
    if (schools) {
      const types = [...new Set(schools.filter(s => s.type).map(s => s.type))].sort()
      if (types.length) setSchoolTypes(types)
    }
  }

  const loadSchool = async () => {
    const { data } = await supabase
      .from('schools')
      .select('*')
      .eq('id', profile.school_id)
      .single()
    if (data) {
      const cy = data.current_year || new Date().getFullYear()
      setSchoolForm({
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        county: data.county || '',
        type: data.type || '',
        motto: data.motto || '',
        current_term: data.current_term || '',
        current_year: cy,
      })
      if (data.notifications) setNotifForm(data.notifications)
    }
  }

  const flash = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const saveSchool = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    const { error: err } = await supabase
      .from('schools')
      .update({
        name: schoolForm.name,
        email: schoolForm.email,
        phone: schoolForm.phone,
        address: schoolForm.address,
        county: schoolForm.county,
        type: schoolForm.type,
        motto: schoolForm.motto,
        current_term: schoolForm.current_term,
        current_year: parseInt(schoolForm.current_year),
      })
      .eq('id', profile.school_id)
    setSaving(false)
    if (err) { setError(err.message); return }
    flash()
  }

  const saveNotifications = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    const { error: err } = await supabase
      .from('schools')
      .update({ notifications: notifForm })
      .eq('id', profile.school_id)
    setSaving(false)
    if (err) { setError(err.message); return }
    flash()
  }

  const savePassword = async (e) => {
    e.preventDefault()
    setError('')
    if (!pwdForm.old_password) {
      setError('Please enter your current password.')
      return
    }
    if (pwdForm.new_password !== pwdForm.confirm_password) {
      setError('New passwords do not match.')
      return
    }
    if (pwdForm.new_password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: pwdForm.old_password,
    })

    if (verifyError) {
      setSaving(false)
      setError('Current password is incorrect.')
      return
    }

    const { error: err } = await supabase.auth.updateUser({ password: pwdForm.new_password })
    setSaving(false)
    if (err) { setError(err.message); return }
    setPwdForm({ old_password: '', new_password: '', confirm_password: '' })
    flash()
  }

  const tabs = [
    { key: 'school', label: 'School Profile', icon: <School size={16} /> },
    { key: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
    { key: 'security', label: 'Security', icon: <Lock size={16} /> },
  ]

  return (
    <div className="settings-page">
      {/* Tab Nav */}
      <div className="settings-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`settings-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => { setActiveTab(t.key); setError(''); setSaved(false) }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {saved && (
        <div className="settings-success">
          <CheckCircle size={15} /> Changes saved successfully.
        </div>
      )}
      {error && <div className="form-error">{error}</div>}

      {/* ── School Profile Tab ── */}
      {activeTab === 'school' && (
        <form className="settings-card" onSubmit={saveSchool}>
          <div className="settings-card-header">
            <School size={18} />
            <h3>School Profile</h3>
          </div>

          <p className="form-section-label">Basic Information</p>
          <div className="form-grid">
            <div className="form-field full">
              <label>School Name *</label>
              <input
                required
                placeholder="e.g. Sunshine Academy"
                value={schoolForm.name}
                onChange={e => setSchoolForm({ ...schoolForm, name: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Email</label>
              <input
                type="email"
                placeholder="admin@school.ac.ke"
                value={schoolForm.email}
                onChange={e => setSchoolForm({ ...schoolForm, email: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Phone</label>
              <input
                placeholder="e.g. 0712345678"
                value={schoolForm.phone}
                onChange={e => setSchoolForm({ ...schoolForm, phone: e.target.value })}
              />
            </div>
            <div className="form-field full">
              <label>Address</label>
              <input
                placeholder="e.g. P.O. Box 1234, Nairobi"
                value={schoolForm.address}
                onChange={e => setSchoolForm({ ...schoolForm, address: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>County</label>
              <input
                placeholder="e.g. Nairobi"
                value={schoolForm.county}
                onChange={e => setSchoolForm({ ...schoolForm, county: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>School Type</label>
              <select
                value={schoolForm.type}
                onChange={e => setSchoolForm({ ...schoolForm, type: e.target.value })}
              >
                <option value="">Select type</option>
                {schoolTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-field full">
              <label>School Motto</label>
              <input
                placeholder="e.g. Excellence in Education"
                value={schoolForm.motto}
                onChange={e => setSchoolForm({ ...schoolForm, motto: e.target.value })}
              />
            </div>
          </div>

          <p className="form-section-label">Academic Calendar</p>
          <div className="form-grid">
            <div className="form-field">
              <label>Current Term</label>
              <select
                value={schoolForm.current_term}
                onChange={e => setSchoolForm({ ...schoolForm, current_term: e.target.value })}
              >
                {availableTerms.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Current Year</label>
              <select
                value={schoolForm.current_year}
                onChange={e => setSchoolForm({ ...schoolForm, current_year: e.target.value })}
              >
                {availableYears.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="settings-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={15} /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {/* ── Notifications Tab ── */}
      {activeTab === 'notifications' && (
        <form className="settings-card" onSubmit={saveNotifications}>
          <div className="settings-card-header">
            <Bell size={18} />
            <h3>Notification Preferences</h3>
          </div>
          <p className="settings-card-desc">
            Control which events trigger alerts to parents and staff.
          </p>

          <div className="notif-list">
            {[
              {
                key: 'fees_reminder',
                label: 'Fee Reminders',
                desc: 'Notify parents when fees are due or overdue',
              },
              {
                key: 'attendance_alert',
                label: 'Attendance Alerts',
                desc: 'Alert parents when a student is marked absent',
              },
              {
                key: 'grade_published',
                label: 'Grade Published',
                desc: 'Notify parents when term results are available',
              },
              {
                key: 'sms_enabled',
                label: 'SMS Notifications',
                desc: 'Send alerts via SMS in addition to in-app (charges apply)',
              },
            ].map(n => (
              <div key={n.key} className="notif-row">
                <div className="notif-info">
                  <p className="notif-label">{n.label}</p>
                  <p className="notif-desc">{n.desc}</p>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={notifForm[n.key]}
                    onChange={e => setNotifForm({ ...notifForm, [n.key]: e.target.checked })}
                  />
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </label>
              </div>
            ))}
          </div>

          <div className="settings-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={15} /> {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>
      )}

      {/* ── Security Tab ── */}
      {activeTab === 'security' && (
        <form className="settings-card" onSubmit={savePassword}>
          <div className="settings-card-header">
            <Lock size={18} />
            <h3>Change Password</h3>
          </div>
          <p className="settings-card-desc">
            Update your admin account password. Use at least 6 characters.
          </p>

          <div className="form-grid pwd-grid">
            <div className="form-field full">
              <label>Current Password</label>
              <div className="pwd-wrap">
                <input
                  required
                  type={showOldPwd ? 'text' : 'password'}
                  placeholder="Enter current password"
                  value={pwdForm.old_password}
                  onChange={e => setPwdForm({ ...pwdForm, old_password: e.target.value })}
                />
                <button type="button" className="pwd-eye" onClick={() => setShowOldPwd(v => !v)}>
                  {showOldPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div className="form-field full">
              <label>New Password</label>
              <div className="pwd-wrap">
                <input
                  required
                  type={showNewPwd ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  value={pwdForm.new_password}
                  onChange={e => setPwdForm({ ...pwdForm, new_password: e.target.value })}
                />
                <button type="button" className="pwd-eye" onClick={() => setShowNewPwd(v => !v)}>
                  {showNewPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div className="form-field full">
              <label>Confirm New Password</label>
              <div className="pwd-wrap">
                <input
                  required
                  type={showOldPwd ? 'text' : 'password'}
                  placeholder="Repeat new password"
                  value={pwdForm.confirm_password}
                  onChange={e => setPwdForm({ ...pwdForm, confirm_password: e.target.value })}
                />
                <button type="button" className="pwd-eye" onClick={() => setShowOldPwd(v => !v)}>
                  {showOldPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>

          <div className="settings-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              <Lock size={15} /> {saving ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}