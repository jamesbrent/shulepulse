import { useState, useEffect } from 'react'
import {
  X, School, MapPin, Mail, Phone, Globe, CreditCard,
  Calendar, Users, GraduationCap, UserCheck, BookOpen,
  CheckCircle, XCircle, Clock, HardDrive, MessageSquare,
  Activity, Zap, Shield, RefreshCw, AlertTriangle,
  Download, ArrowUp, ArrowDown, Lock, Unlock, Edit,
  ToggleLeft, ToggleRight, DollarSign, Building2, Loader, Save, Pause, Play
} from 'lucide-react'
import { fetchSchoolStats, fetchSchoolRecentActivity, getModulesConfig } from '../superadmin/schoolService'
import { supabase } from '../../lib/supabase'
import {
  fetchAllPlans, fetchSchoolFeatures, fetchFeatureCatalog,
  fetchSchoolOverrides, setSchoolOverride, removeSchoolOverride,
  updateSchoolPlan, suspendSchool, reactivateSchool, setTrialSchool,
  invalidateCache
} from '../access/featureAccessService'

export default function SchoolDetailModal({ school: initialSchool, onClose, onEdit }) {
  const [school, setSchool] = useState(initialSchool)
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [plans, setPlans] = useState([])
  const [catalog, setCatalog] = useState([])
  const [schoolFeatures, setSchoolFeatures] = useState([])
  const [overrides, setOverrides] = useState([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const modules = getModulesConfig(school)

  useEffect(() => {
    loadData()
  }, [school.id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [s, a, plansData, catalogData] = await Promise.all([
        fetchSchoolStats(school.id),
        fetchSchoolRecentActivity(school.id),
        fetchAllPlans(),
        fetchFeatureCatalog(),
      ])
      setStats(s)
      setActivity(a)
      setPlans(plansData)
      setCatalog(catalogData)

      const [features, overridesData] = await Promise.all([
        fetchSchoolFeatures(school.id),
        fetchSchoolOverrides(school.id),
      ])
      setSchoolFeatures(features)
      setOverrides(overridesData)
    } catch (err) {
      console.error('[SchoolDetail] load error:', err)
    }
    setLoading(false)
  }

  const daysLeft = school.subscription_end
    ? Math.ceil((new Date(school.subscription_end) - new Date()) / (1000 * 60 * 60 * 24))
    : null

  const showToast = (type, message) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  const handlePlanChange = async (newPlanKey) => {
    setSaving(true)
    try {
      await updateSchoolPlan(school.id, newPlanKey)
      setSchool((prev) => ({ ...prev, plan: newPlanKey }))
      invalidateCache()
      await loadData()
      showToast('success', `Plan changed to ${newPlanKey}`)
    } catch (err) {
      showToast('error', err.message)
    }
    setSaving(false)
  }

  const handleSuspend = async () => {
    setSaving(true)
    try {
      await suspendSchool(school.id)
      setSchool((prev) => ({ ...prev, subscription_status: 'suspended' }))
      invalidateCache()
      showToast('success', 'School suspended')
    } catch (err) {
      showToast('error', err.message)
    }
    setSaving(false)
  }

  const handleReactivate = async () => {
    setSaving(true)
    try {
      await reactivateSchool(school.id, school.plan || 'basic')
      setSchool((prev) => ({ ...prev, subscription_status: 'active' }))
      invalidateCache()
      showToast('success', 'School reactivated')
    } catch (err) {
      showToast('error', err.message)
    }
    setSaving(false)
  }

  const handleTrial = async (days = 14) => {
    setSaving(true)
    try {
      await setTrialSchool(school.id, school.plan || 'basic', days)
      const end = new Date()
      end.setDate(end.getDate() + days)
      setSchool((prev) => ({ ...prev, subscription_status: 'trial', subscription_end: end.toISOString() }))
      invalidateCache()
      showToast('success', `Trial started (${days} days)`)
    } catch (err) {
      showToast('error', err.message)
    }
    setSaving(false)
  }

  const handleExtend = async (days = 30) => {
    setSaving(true)
    try {
      const currentEnd = school.subscription_end ? new Date(school.subscription_end) : new Date()
      if (currentEnd < new Date()) currentEnd.setTime(Date.now())
      currentEnd.setDate(currentEnd.getDate() + days)
      const { error } = await supabase.from('schools').update({ subscription_end: currentEnd.toISOString() }).eq('id', school.id)
      if (error) throw new Error(error.message)
      setSchool((prev) => ({ ...prev, subscription_end: currentEnd.toISOString() }))
      showToast('success', `Extended by ${days} days`)
    } catch (err) {
      showToast('error', err.message)
    }
    setSaving(false)
  }

  const handleOverrideToggle = async (featureKey, currentEnabled) => {
    setSaving(true)
    try {
      const isPlanFeature = (planFeatures || []).includes(featureKey)
      if (isPlanFeature && currentEnabled) {
        await setSchoolOverride(school.id, featureKey, false)
      } else if (!isPlanFeature && !currentEnabled) {
        await removeSchoolOverride(school.id, featureKey)
      } else if (!currentEnabled) {
        await setSchoolOverride(school.id, featureKey, true)
      } else {
        await removeSchoolOverride(school.id, featureKey)
      }
      const [features, overridesData] = await Promise.all([
        fetchSchoolFeatures(school.id),
        fetchSchoolOverrides(school.id),
      ])
      setSchoolFeatures(features)
      setOverrides(overridesData)
      invalidateCache()
    } catch (err) {
      showToast('error', err.message)
    }
    setSaving(false)
  }

  const planFeatures = schoolFeatures

  const activePlan = plans.find((p) => p.key === school.plan)

  const tabs = ['overview', 'modules', 'subscription', 'features', 'admins', 'activity']

  const daysLeft = school.subscription_end
    ? Math.ceil((new Date(school.subscription_end) - new Date()) / (1000 * 60 * 60 * 24))
    : null

  const tabs = ['overview', 'modules', 'subscription', 'admins', 'activity']

  const schoolInfo = [
    { label: 'County', value: school.county, icon: MapPin },
    { label: 'School Code', value: school.school_code, icon: Shield },
    { label: 'Email', value: school.email, icon: Mail },
    { label: 'Phone', value: school.phone, icon: Phone },
    { label: 'Website', value: school.website, icon: Globe },
    { label: 'Address', value: school.address, icon: MapPin },
    { label: 'Category', value: school.type, icon: Building2 },
  ]

  const statItems = [
    { label: 'Students', value: stats?.studentCount || 0, icon: GraduationCap, color: '#2563eb' },
    { label: 'Teachers', value: stats?.teacherCount || 0, icon: UserCheck, color: '#7c3aed' },
    { label: 'Parents', value: stats?.parentCount || 0, icon: Users, color: '#16a34a' },
    { label: 'Classes', value: stats?.classCount || 0, icon: BookOpen, color: '#ca8a04' },
    { label: 'Subjects', value: stats?.subjectCount || 0, icon: BookOpen, color: '#0891b2' },
  ]

  return (
    <div className="onboard-overlay" onClick={onClose}>
      <div className="onboard-modal sc-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="onboard-header">
          <div className="onboard-header-left">
            <div className="sc-detail-avatar" style={{ background: school.primary_color || '#2563eb' }}>
              {school.name?.[0] || 'S'}
            </div>
            <div>
              <h2 style={{ margin: 0 }}>{school.name}</h2>
              <span style={{ fontSize: 12, color: '#64748b' }}>{school.school_code || '—'} · {school.county || '—'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`sc-status-dot ${school.status}`} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%' }} />
            <span style={{ fontSize: 13, fontWeight: 500, textTransform: 'capitalize' }}>{school.status}</span>
            <button className="onboard-close" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="sc-detail-tabs">
          {tabs.map((t) => (
            <button
              key={t}
              className={`sc-tab ${activeTab === t ? 'active' : ''}`}
              onClick={() => setActiveTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="onboard-body sc-detail-body">
          {loading ? (
            <div className="loading-state">Loading...</div>
          ) : activeTab === 'overview' ? (
            <>
              <div className="sc-detail-section">
                <h4>School Information</h4>
                <div className="sc-info-grid">
                  {schoolInfo.map((item) => {
                    const Icon = item.icon
                    return (
                      <div key={item.label} className="sc-info-item">
                        <Icon size={14} />
                        <span className="sc-info-label">{item.label}</span>
                        <span className="sc-info-value">{item.value || '—'}</span>
                      </div>
                    )
                  })}
                  <div className="sc-info-item">
                    <CreditCard size={14} />
                    <span className="sc-info-label">Current Plan</span>
                    <span className={`plan-badge ${school.plan}`} style={{ fontSize: 12 }}>{school.plan}</span>
                  </div>
                </div>
              </div>

              <div className="sc-detail-section">
                <h4>Statistics</h4>
                <div className="sc-stats-grid">
                  {statItems.map((item) => (
                    <div key={item.label} className="sc-stat-box" style={{ borderLeftColor: item.color }}>
                      <item.icon size={18} color={item.color} />
                      <div className="sc-stat-box-value" style={{ color: item.color }}>{item.value.toLocaleString()}</div>
                      <div className="sc-stat-box-label">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="sc-detail-section">
                <h4>Storage & Usage</h4>
                <div className="sc-usage-grid">
                  <div className="sc-usage-item">
                    <div className="sc-usage-header"><HardDrive size={14} /> Storage</div>
                    <div className="sc-usage-bar">
                      <div className="sc-usage-fill" style={{ width: `${Math.min(100, (school.storage_used || 0) / (school.storage_limit || 10240) * 100)}%` }} />
                    </div>
                    <div className="sc-usage-label">{(school.storage_used || 0).toFixed(1)} GB / {(school.storage_limit || 10240)} MB</div>
                  </div>
                  <div className="sc-usage-item">
                    <div className="sc-usage-header"><Activity size={14} /> Monthly Logins</div>
                    <div className="sc-usage-value">{school.monthly_logins || 0}</div>
                  </div>
                  <div className="sc-usage-item">
                    <div className="sc-usage-header"><Zap size={14} /> SMS</div>
                    <div className="sc-usage-bar">
                      <div className="sc-usage-fill" style={{ width: `${Math.min(100, (school.sms_used || 0) / (school.sms_limit || 5000) * 100)}%`, background: '#7c3aed' }} />
                    </div>
                    <div className="sc-usage-label">{(school.sms_used || 0).toLocaleString()} / {(school.sms_limit || 5000).toLocaleString()}</div>
                  </div>
                  <div className="sc-usage-item">
                    <div className="sc-usage-header"><Mail size={14} /> Emails Sent</div>
                    <div className="sc-usage-bar">
                      <div className="sc-usage-fill" style={{ width: `${Math.min(100, (school.emails_sent || 0) / (school.emails_limit || 50000) * 100)}%`, background: '#ca8a04' }} />
                    </div>
                    <div className="sc-usage-label">{(school.emails_sent || 0).toLocaleString()} / {(school.emails_limit || 50000).toLocaleString()}</div>
                  </div>
                </div>
              </div>

              <div className="sc-detail-actions">
                <button className="btn-primary" onClick={onEdit}><Edit size={14} /> Edit School</button>
                <button className="btn-secondary"><RefreshCw size={14} /> Renew</button>
                <button className="btn-secondary"><ArrowUp size={14} /> Upgrade</button>
                <button className="btn-secondary"><ArrowDown size={14} /> Downgrade</button>
              </div>
            </>
          ) : activeTab === 'modules' ? (
            <div className="sc-detail-section">
              <h4>Module Status</h4>
              <div className="sc-modules-grid">
                {modules.map((m) => (
                  <div key={m.key} className={`sc-module-item ${m.enabled ? 'enabled' : 'disabled'}`}>
                    {m.enabled ? <CheckCircle size={16} color="#16a34a" /> : <XCircle size={16} color="#94a3b8" />}
                    <span>{m.label}</span>
                    <span className="sc-module-badge">{m.enabled ? 'Enabled' : 'Disabled'}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === 'subscription' ? (
            <div className="sc-detail-section">
              {toast && (
                <div className={`sc-toast ${toast.type}`}>
                  {toast.type === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  {toast.message}
                </div>
              )}
              <h4>Subscription Management</h4>
              <div className="sc-info-grid">
                <div className="sc-info-item">
                  <CreditCard size={14} />
                  <span className="sc-info-label">Plan</span>
                  <span className={`plan-badge ${school.plan}`}>{school.plan || 'none'}</span>
                </div>
                <div className="sc-info-item">
                  <RefreshCw size={14} />
                  <span className="sc-info-label">Status</span>
                  <span className={`sc-status-badge ${school.subscription_status || 'active'}`}>
                    {school.subscription_status || 'active'}
                  </span>
                </div>
                <div className="sc-info-item">
                  <DollarSign size={14} />
                  <span className="sc-info-label">Amount</span>
                  <span className="sc-info-value">
                    KES {(activePlan?.monthly_price || 0).toLocaleString()}/mo
                  </span>
                </div>
                <div className="sc-info-item">
                  <Calendar size={14} />
                  <span className="sc-info-label">Started</span>
                  <span className="sc-info-value">
                    {school.subscription_start
                      ? new Date(school.subscription_start).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </span>
                </div>
                <div className="sc-info-item">
                  <Calendar size={14} />
                  <span className="sc-info-label">Expires</span>
                  <span className="sc-info-value" style={{ color: daysLeft !== null && daysLeft <= 7 ? '#ef4444' : undefined }}>
                    {school.subscription_end
                      ? new Date(school.subscription_end).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
                      : 'No expiry'}
                  </span>
                </div>
                <div className="sc-info-item">
                  <Clock size={14} />
                  <span className="sc-info-label">Days Left</span>
                  <span className="sc-info-value" style={{
                    color: daysLeft === null ? '#64748b' : daysLeft <= 0 ? '#ef4444' : daysLeft <= 7 ? '#ca8a04' : '#16a34a'
                  }}>
                    {daysLeft === null ? '—' : daysLeft <= 0 ? 'Expired' : `${daysLeft} days`}
                  </span>
                </div>
              </div>

              <div className="sc-sub-section" style={{ marginTop: 20 }}>
                <h5>Change Plan</h5>
                <div className="sc-plan-options">
                  {plans.filter((p) => p.is_active !== false).map((p) => (
                    <button
                      key={p.key}
                      className={`sc-plan-option ${school.plan === p.key ? 'current' : ''}`}
                      onClick={() => handlePlanChange(p.key)}
                      disabled={saving || school.plan === p.key}
                    >
                      <span className="sc-plan-option-name">{p.label}</span>
                      <span className="sc-plan-option-price">KES {(p.monthly_price || 0).toLocaleString()}/mo</span>
                      {school.plan === p.key && <CheckCircle size={14} color="#16a34a" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sc-sub-section" style={{ marginTop: 20 }}>
                <h5>Subscription Actions</h5>
                <div className="sc-detail-actions" style={{ flexWrap: 'wrap' }}>
                  {school.subscription_status === 'suspended' ? (
                    <button className="btn-primary" onClick={handleReactivate} disabled={saving}>
                      {saving ? <Loader size={14} className="spin" /> : <Play size={14} />} Reactivate
                    </button>
                  ) : (
                    <button className="btn-secondary" onClick={handleSuspend} disabled={saving} style={{ color: '#ef4444' }}>
                      <Pause size={14} /> Suspend
                    </button>
                  )}
                  <button className="btn-secondary" onClick={() => handleTrial(14)} disabled={saving}>
                    <Calendar size={14} /> Start Trial (14d)
                  </button>
                  <button className="btn-secondary" onClick={() => handleExtend(30)} disabled={saving}>
                    <RefreshCw size={14} /> Extend 30 Days
                  </button>
                  <button className="btn-secondary" onClick={() => handleExtend(90)} disabled={saving}>
                    <RefreshCw size={14} /> Extend 90 Days
                  </button>
                </div>
              </div>

              <div className="sc-sub-section" style={{ marginTop: 20 }}>
                <h5>Enabled Features ({schoolFeatures.length})</h5>
                <div className="sc-feature-tags">
                  {schoolFeatures.map((fk) => {
                    const feat = catalog.find((f) => f.feature_key === fk)
                    return (
                      <span key={fk} className="sc-feature-tag enabled">
                        {feat?.label || fk}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : activeTab === 'features' ? (
            <div className="sc-detail-section">
              {toast && (
                <div className={`sc-toast ${toast.type}`}>
                  {toast.type === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  {toast.message}
                </div>
              )}
              <h4>Feature Access Control</h4>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
                Toggle features on/off for this school. Overrides the plan defaults.
              </p>
              {[...new Set(catalog.map((f) => f.module))].map((mod) => {
                const modFeatures = catalog.filter((f) => f.module === mod)
                if (modFeatures.length === 0) return null
                return (
                  <div key={mod} className="sc-feature-module">
                    <div className="sc-feature-module-title">{mod}</div>
                    <div className="sc-feature-module-list">
                      {modFeatures.map((feat) => {
                        const isEnabled = schoolFeatures.includes(feat.feature_key)
                        const isPlanDefault = (planFeatures || []).includes(feat.feature_key)
                        const override = overrides.find((o) => o.feature_key === feat.feature_key)
                        const isOverridden = !!override

                        return (
                          <div
                            key={feat.feature_key}
                            className={`sc-feature-toggle-item ${isEnabled ? 'enabled' : 'disabled'} ${isOverridden ? 'overridden' : ''}`}
                          >
                            <div className="sc-feature-toggle-info">
                              <span className="sc-feature-toggle-label">{feat.label}</span>
                              <span className="sc-feature-toggle-meta">
                                {isPlanDefault ? 'Plan default' : isOverridden ? (override.enabled ? 'Override: ON' : 'Override: OFF') : 'Not in plan'}
                              </span>
                            </div>
                            <button
                              className={`sc-feature-toggle-btn ${isEnabled ? 'on' : 'off'}`}
                              onClick={() => handleOverrideToggle(feat.feature_key, isEnabled)}
                              disabled={saving}
                            >
                              {isEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : activeTab === 'admins' ? (
            <div className="sc-detail-section">
              <h4>School Admins</h4>
              {stats?.admins && stats.admins.length > 0 ? (
                <table className="sc-inner-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.admins.map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 500 }}>{a.full_name || '—'}</td>
                        <td style={{ color: '#64748b' }}>{a.email}</td>
                        <td><span className="plan-badge" style={{ textTransform: 'capitalize' }}>{a.role}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="sc-mini-btn" title="Reset Password"><Lock size={12} /></button>
                            <button className="sc-mini-btn" title="Login As"><Shield size={12} /></button>
                            <button className="sc-mini-btn danger" title="Remove"><X size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-muted" style={{ fontSize: 13 }}>No school admins found</p>
              )}
            </div>
          ) : activeTab === 'activity' ? (
            <div className="sc-detail-section">
              <h4>Recent Activity</h4>
              {activity.length > 0 ? (
                <div className="sc-activity-list">
                  {activity.map((a, i) => (
                    <div key={i} className="sc-activity-item">
                      <Clock size={14} color="#94a3b8" />
                      <div className="sc-activity-content">
                        <span className="sc-activity-action">{a.action}</span>
                        <span className="sc-activity-time">
                          {new Date(a.performed_at).toLocaleDateString('en-KE', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted" style={{ fontSize: 13 }}>No recent activity</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}


