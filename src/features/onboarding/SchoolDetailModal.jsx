import { useState, useEffect } from 'react'
import {
  X, School, MapPin, Mail, Phone, Globe, CreditCard,
  Calendar, Users, GraduationCap, UserCheck, BookOpen,
  CheckCircle, XCircle, Clock, HardDrive, MessageSquare,
  Activity, Zap, Shield, RefreshCw, AlertTriangle,
  Download, ArrowUp, ArrowDown, Lock, Unlock, Edit,
  ToggleLeft, ToggleRight, DollarSign, Building2
} from 'lucide-react'
import { fetchSchoolStats, fetchSchoolRecentActivity, getModulesConfig } from '../superadmin/schoolService'

export default function SchoolDetailModal({ school, onClose, onEdit }) {
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const modules = getModulesConfig(school)

  useEffect(() => {
    loadData()
  }, [school.id])

  const loadData = async () => {
    setLoading(true)
    const [s, a] = await Promise.all([
      fetchSchoolStats(school.id),
      fetchSchoolRecentActivity(school.id),
    ])
    setStats(s)
    setActivity(a)
    setLoading(false)
  }

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
              <h4>Subscription Information</h4>
              <div className="sc-info-grid">
                <div className="sc-info-item">
                  <CreditCard size={14} />
                  <span className="sc-info-label">Plan</span>
                  <span className={`plan-badge ${school.plan}`}>{school.plan}</span>
                </div>
                <div className="sc-info-item">
                  <RefreshCw size={14} />
                  <span className="sc-info-label">Billing Cycle</span>
                  <span className="sc-info-value">{school.billing_cycle || 'Monthly'}</span>
                </div>
                <div className="sc-info-item">
                  <DollarSign size={14} />
                  <span className="sc-info-label">Amount</span>
                  <span className="sc-info-value">
                    KES {school.plan === 'basic' ? '2,500' : school.plan === 'pro' ? '5,000' : school.plan === 'enterprise' ? '10,000' : '—'}
                    /mo
                  </span>
                </div>
                <div className="sc-info-item">
                  <Calendar size={14} />
                  <span className="sc-info-label">Next Due</span>
                  <span className="sc-info-value">
                    {school.subscription_end
                      ? new Date(school.subscription_end).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </span>
                </div>
                <div className="sc-info-item">
                  <CheckCircle size={14} />
                  <span className="sc-info-label">Payment Status</span>
                  <span className="sc-info-value" style={{ color: daysLeft && daysLeft > 0 ? '#16a34a' : '#ef4444' }}>
                    {daysLeft && daysLeft > 0 ? 'Paid' : daysLeft === 0 ? 'Due' : '—'}
                  </span>
                </div>
              </div>
              <div className="sc-detail-actions" style={{ marginTop: 16 }}>
                <button className="btn-primary"><RefreshCw size={14} /> Renew</button>
                <button className="btn-secondary"><ArrowUp size={14} /> Upgrade</button>
                <button className="btn-secondary"><ArrowDown size={14} /> Downgrade</button>
              </div>
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


