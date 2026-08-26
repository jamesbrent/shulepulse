import { useState, useEffect } from 'react'
import {
  School, Plus, Download, Filter, Search, Eye,
  Edit, Key, MoreVertical, ChevronDown, Ban, CheckCircle,
  Calendar, Clock, Globe, Mail, Phone, MapPin, Building2,
  CreditCard, Users, GraduationCap, UserCheck, BookOpen,
  Trash2, Lock, Unlock, Speaker, ToggleLeft,
  ToggleRight, Loader, AlertTriangle, X, Copy, Check
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fetchAllSchools, fetchCounties, deleteSchool, toggleSchoolStatus } from '../../features/superadmin/schoolService'
import { logAction } from '../../features/audit/auditService'
import SchoolDetailModal from '../../features/onboarding/SchoolDetailModal'
import EditSchoolModal from '../../features/onboarding/EditSchoolModal'
import PlanChangeModal from '../../features/subscription/PlanChangeModal'
import './SchoolsPage.css'

const PLAN_OPTS = ['', 'basic', 'pro', 'enterprise']
const STATUS_OPTS = ['', 'active', 'trial', 'suspended']

export default function SchoolsPage({ onOnboard }) {
  const [schools, setSchools] = useState([])
  const [counties, setCounties] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [countyFilter, setCountyFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [toast, setToast] = useState(null)
  const [viewSchool, setViewSchool] = useState(null)
  const [editSchool, setEditSchool] = useState(null)
  const [changePlanSchool, setChangePlanSchool] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [adminPopup, setAdminPopup] = useState(null)
  const [adminPopupLoading, setAdminPopupLoading] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [generatingLink, setGeneratingLink] = useState(null)
  const [generatedLink, setGeneratedLink] = useState(null)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    loadData()
  }, [planFilter, countyFilter, statusFilter])

  useEffect(() => {
    fetchCounties().then(setCounties)
  }, [])

  const loadData = async () => {
    setLoading(true)
    const data = await fetchAllSchools({
      search: search || undefined,
      plan: planFilter || undefined,
      county: countyFilter || undefined,
      status: statusFilter || undefined,
    })
    setSchools(data)
    setLoading(false)
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleSearch = (e) => {
    e.preventDefault()
    loadData()
  }

  const handleExport = () => {
    const headers = ['School Code', 'Name', 'County', 'Type', 'Plan', 'Status', 'Phone', 'Email', 'Created']
    const rows = schools.map((s) => [
      s.school_code || '', s.name, s.county, s.type, s.plan, s.status, s.phone, s.email,
      s.created_at ? new Date(s.created_at).toLocaleDateString('en-KE') : '',
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v || ''}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `schools_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    showToast('Exported as CSV')
  }

  const handleToggleStatus = async (school) => {
    const newStatus = school.status === 'suspended' ? 'active' : 'suspended'
    try {
      await toggleSchoolStatus(school.id, school.name, newStatus)
      showToast(`"${school.name}" ${newStatus}`)
      loadData()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleDelete = async (school) => {
    if (!window.confirm(`Delete "${school.name}" permanently?`)) return
    try {
      await deleteSchool(school.id, school.name)
      showToast(`"${school.name}" deleted`)
      loadData()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleSendAnnouncement = async (school) => {
    const msg = prompt(`Send announcement to "${school.name}":\n\nEnter message:`)
    if (!msg) return
    await logAction({
      schoolId: school.id,
      action: 'school.announcement',
      details: { message: msg },
    })
    showToast(`Announcement sent to ${school.name}`)
  }

  const handleShowAdmins = async (school) => {
    setAdminPopupLoading(true)
    setAdminPopup(school)
    setGeneratedLink(null)
    setGeneratingLink(null)
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, phone')
      .eq('school_id', school.id)
      .eq('role', 'admin')
    setAdminPopup({ ...school, admins: data || [] })
    setAdminPopupLoading(false)
  }

  const handleGenerateLink = async (email) => {
    if (!adminPopup) return
    setGeneratingLink(email)
    setGeneratedLink(null)
    try {
      const { data, error } = await supabase.functions.invoke('generate-admin-link', {
        body: { school_id: adminPopup.id },
      })
      if (error) throw new Error(error.message)
      setGeneratedLink(data.url)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setGeneratingLink(null)
    }
  }

  const calcDaysLeft = (end) => {
    if (!end) return null
    const diff = Math.ceil((new Date(end) - new Date()) / (1000 * 60 * 60 * 24))
    return diff > 0 ? diff : 0
  }

  return (
    <div className="schools-page">
      <div className="schools-top-bar">
        <div className="schools-top-actions">
          <button className="btn-primary" onClick={onOnboard}>
            <Plus size={15} /> Add School
          </button>
          <button className="btn-secondary" onClick={handleExport}>
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      <div className="schools-filters">
        <form onSubmit={handleSearch} className="schools-search">
          <Search size={14} />
          <input placeholder="Search school name or code..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <div className="schools-filter-group">
          <Filter size={14} />
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
            <option value="">All Plans</option>
            <option value="basic">Basic</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <div className="schools-filter-group">
          <MapPin size={14} />
          <select value={countyFilter} onChange={(e) => setCountyFilter(e.target.value)}>
            <option value="">All Counties</option>
            {counties.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="schools-filter-group">
          <Building2 size={14} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading schools...</div>
      ) : schools.length === 0 ? (
        <div className="empty-state">
          <School size={32} />
          <p>No schools found</p>
        </div>
      ) : (
        <div className="schools-table-wrap">
          <table className="sc-table">
            <thead>
              <tr>
                <th>School</th>
                <th>County</th>
                <th>Students</th>
                <th>Teachers</th>
                <th>Plan</th>
                <th>Subscription</th>
                <th>Status</th>
                <th>Created On</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {schools.map((s) => {
                const daysLeft = calcDaysLeft(s.subscription_end)
                const studentCount = s.students?.[0]?.count || 0
                const teacherCount = s.teachers?.[0]?.count || 0
                return (
                  <tr key={s.id}>
                    <td className="sc-school-cell">
                      <div className="sc-school-avatar" style={{ background: s.primary_color || '#2563eb' }}>
                        {s.name?.[0] || '?'}
                      </div>
                      <div>
                        <div className="sc-school-name">{s.name}</div>
                        <div className="sc-school-code">{s.school_code || '—'}</div>
                      </div>
                    </td>
                    <td>{s.county || '—'}</td>
                    <td className="sc-stat-cell">{studentCount.toLocaleString()}</td>
                    <td className="sc-stat-cell">{teacherCount.toLocaleString()}</td>
                    <td><span className={`plan-badge ${s.plan}`}>{s.plan}</span></td>
                    <td className="sc-sub-cell">
                      {s.status === 'trial' ? (
                        <span className="sc-sub-badge trial">Trial</span>
                      ) : daysLeft !== null ? (
                        <>
                          <span className={`sc-sub-badge ${daysLeft < 30 ? 'expiring' : 'active'}`}>
                            {daysLeft} Days Left
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`sc-status-dot ${s.status}`} />
                      <span className="sc-status-label">{s.status}</span>
                    </td>
                    <td className="sc-date-cell">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="sc-actions-cell">
                      <button className="sc-action-btn" onClick={() => setViewSchool(s)} title="View School"><Eye size={15} /></button>
                      <button className="sc-action-btn" onClick={() => setEditSchool(s)} title="Edit School"><Edit size={15} /></button>
                      <button className="sc-action-btn" onClick={() => handleShowAdmins(s)} title="Login as Admin"><Key size={15} /></button>
                      <div className="sc-action-menu-wrap">
                        <button className="sc-action-btn" onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)} title="More Actions">
                          <MoreVertical size={15} />
                        </button>
                        {openMenuId === s.id && (
                          <div className="sc-action-menu">
                            <button onClick={() => { setOpenMenuId(null); setViewSchool(s) }}><Eye size={14} /> View Details</button>
                            <button onClick={() => { setOpenMenuId(null); setEditSchool(s) }}><Edit size={14} /> Edit School</button>
                            <button onClick={() => { setOpenMenuId(null); setChangePlanSchool(s) }}><CreditCard size={14} /> Change Plan</button>
                            <button onClick={() => { setOpenMenuId(null); handleSendAnnouncement(s) }}><Speaker size={14} /> Send Announcement</button>
                            <button onClick={() => { setOpenMenuId(null); handleToggleStatus(s) }}>
                              {s.status === 'suspended' ? <CheckCircle size={14} /> : <Ban size={14} />}
                              {s.status === 'suspended' ? 'Activate' : 'Suspend'}
                            </button>
                            <div className="sc-action-menu-divider" />
                            <button className="danger" onClick={() => { setOpenMenuId(null); handleDelete(s) }}><Trash2 size={14} /> Delete School</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div className="onboard-toast" style={{ background: toast.type === 'error' ? '#ef4444' : '#16a34a' }}>
          {toast.msg}
        </div>
      )}

      {viewSchool && (
        <SchoolDetailModal
          school={viewSchool}
          onClose={() => { setViewSchool(null); loadData() }}
          onEdit={() => { setViewSchool(null); setEditSchool(viewSchool) }}
        />
      )}
      {editSchool && (
        <EditSchoolModal
          school={editSchool}
          onClose={() => setEditSchool(null)}
          onSaved={() => { setEditSchool(null); showToast('School updated'); loadData() }}
        />
      )}
      {changePlanSchool && (
        <PlanChangeModal
          school={changePlanSchool}
          onClose={() => setChangePlanSchool(null)}
          onChanged={() => { showToast('Plan changed'); loadData() }}
        />
      )}

      {adminPopup && (
        <div className="sc-overlay" onClick={() => { setAdminPopup(null); setCopiedEmail(false); setGeneratedLink(null); setGeneratingLink(null) }}>
          <div className="sc-admin-popup" onClick={(e) => e.stopPropagation()}>
            <div className="sc-admin-popup-header">
              <div className="sc-admin-popup-avatar" style={{ background: adminPopup.primary_color || '#2563eb' }}>
                {adminPopup.name?.[0] || '?'}
              </div>
              <div>
                <h3>{adminPopup.name}</h3>
                <span className="text-muted">School Administrators</span>
              </div>
              <button className="sc-popup-close" onClick={() => { setAdminPopup(null); setCopiedEmail(false) }}><X size={16} /></button>
            </div>
            <div className="sc-admin-popup-body">
              {adminPopupLoading ? (
                <div className="loading-state">Loading admins...</div>
              ) : adminPopup.admins?.length === 0 ? (
                <div className="empty-state">No admin accounts found</div>
              ) : (
                adminPopup.admins?.map((a) => (
                  <div key={a.id} className="sc-admin-card">
                    <div className="sc-admin-card-avatar">
                      {a.full_name?.[0] || a.email?.[0] || '?'}
                    </div>
                    <div className="sc-admin-card-info">
                      <div className="sc-admin-card-name">{a.full_name || '—'}</div>
                      <div className="sc-admin-card-email">{a.email}</div>
                      {a.phone && <div className="sc-admin-card-phone">{a.phone}</div>}
                    </div>
                    <div className="sc-admin-card-actions">
                      <button
                        className="sc-admin-copy-btn"
                        onClick={() => { navigator.clipboard.writeText(a.email); setCopiedEmail(true); setTimeout(() => setCopiedEmail(false), 2000) }}
                        title="Copy email"
                      >
                        {copiedEmail ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      <button
                        className="sc-admin-link-btn"
                        onClick={() => handleGenerateLink(a.email)}
                        disabled={generatingLink === a.email}
                        title="Generate login link"
                      >
                        {generatingLink === a.email ? <Loader size={14} className="spin" /> : <Key size={14} />}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="sc-admin-popup-footer">
              {generatedLink ? (
                <div className="sc-admin-link-result">
                  <span className="sc-admin-link-label">Login link ready</span>
                  <div className="sc-admin-link-row">
                    <input type="text" readOnly value={generatedLink} className="sc-admin-link-input" onClick={(e) => e.target.select()} />
                    <button
                      className="sc-admin-copy-btn"
                      onClick={() => { navigator.clipboard.writeText(generatedLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }}
                      title="Copy link"
                    >
                      {linkCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              ) : (
                <span className="text-muted">Click <Key size={12} style={{ display: 'inline' }} /> to generate a magic login link for an admin</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
