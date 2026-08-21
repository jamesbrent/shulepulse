import { useState, useMemo } from 'react'
import {
  Search, Filter, Users, GraduationCap, Briefcase, Shield, UserCheck,
  UserX, Eye, X, ChevronDown, Mail, Phone, Calendar, Building2,
  BookOpen, Award, AlertTriangle, RefreshCw,
} from 'lucide-react'
import useStaffDirectory from '../../hooks/useStaffDirectory'
import './StaffDirectory.css'

const CATEGORIES = ['All', 'Teaching', 'Non-Teaching', 'Administration']
const EMPLOYMENT_TYPES = ['All', 'Teaching', 'Non-Teaching', 'Administration']
const STATUS_OPTIONS = ['All', 'Active', 'Disabled', 'No Account']

const STATUS_COLORS = {
  Active: { bg: '#dcfce7', fg: '#15803d' },
  Disabled: { bg: '#fee2e2', fg: '#991b1b' },
  'No Account': { bg: '#f1f5f9', fg: '#64748b' },
}

const CAT_ICONS = {
  Teaching: <GraduationCap size={14} />,
  'Non-Teaching': <Briefcase size={14} />,
  Administration: <Shield size={14} />,
}

const CAT_COLORS = {
  Teaching: { bg: '#dbeafe', fg: '#1d4ed8' },
  'Non-Teaching': { bg: '#fef3c7', fg: '#92400e' },
  Administration: { bg: '#ede9fe', fg: '#6d28d9' },
}

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return '—' }
}

export default function StaffDirectory() {
  const { staff, stats, loading, error, refetch } = useStaffDirectory()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [department, setDepartment] = useState('All')
  const [empType, setEmpType] = useState('All')
  const [loginStatus, setLoginStatus] = useState('All')
  const [detail, setDetail] = useState(null)

  const departments = useMemo(() => {
    const set = new Set(staff.map((s) => s.department).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [staff])

  const filtered = useMemo(() => {
    return staff.filter((s) => {
      if (category !== 'All' && s.staffCategory !== category) return false
      if (department !== 'All' && s.department !== department) return false
      if (loginStatus === 'Active' && !s.hasLoginAccount) return false
      if (loginStatus === 'Disabled' && s.accountStatus !== 'Disabled') return false
      if (loginStatus === 'No Account' && s.hasLoginAccount) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const hay = [s.fullName, s.email, s.phone, s.employeeNumber, s.position, s.department].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [staff, category, department, loginStatus, search])

  if (loading) {
    return (
      <div className="sd-root">
        <div className="sd-loading">
          <div className="sd-spinner" />
          <p>Loading staff directory...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="sd-root">
        <div className="sd-error">
          <AlertTriangle size={28} />
          <h3>Failed to load staff</h3>
          <p>{error}</p>
          <button className="sd-btn-retry" onClick={refetch}><RefreshCw size={14} /> Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="sd-root">
      {/* Header */}
      <div className="sd-header">
        <div className="sd-header-text">
          <h2>Staff Directory</h2>
          <p>Manage and view all employees in your school</p>
        </div>
      </div>

      {/* Stats */}
      <div className="sd-stats">
        <div className="sd-stat">
          <div className="sd-stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}><Users size={16} /></div>
          <div><p className="sd-stat-val">{stats.total}</p><p className="sd-stat-lbl">Total Staff</p></div>
        </div>
        <div className="sd-stat">
          <div className="sd-stat-icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}><GraduationCap size={16} /></div>
          <div><p className="sd-stat-val">{stats.teaching}</p><p className="sd-stat-lbl">Teaching Staff</p></div>
        </div>
        <div className="sd-stat">
          <div className="sd-stat-icon" style={{ background: '#fef3c7', color: '#92400e' }}><Briefcase size={16} /></div>
          <div><p className="sd-stat-val">{stats.nonTeaching}</p><p className="sd-stat-lbl">Non-Teaching</p></div>
        </div>
        <div className="sd-stat">
          <div className="sd-stat-icon" style={{ background: '#ede9fe', color: '#6d28d9' }}><Shield size={16} /></div>
          <div><p className="sd-stat-val">{stats.admin}</p><p className="sd-stat-lbl">Administration</p></div>
        </div>
        <div className="sd-stat">
          <div className="sd-stat-icon" style={{ background: '#dcfce7', color: '#15803d' }}><UserCheck size={16} /></div>
          <div><p className="sd-stat-val">{stats.withLogin}</p><p className="sd-stat-lbl">With Login</p></div>
        </div>
        <div className="sd-stat">
          <div className="sd-stat-icon" style={{ background: '#f1f5f9', color: '#64748b' }}><UserX size={16} /></div>
          <div><p className="sd-stat-val">{stats.withoutLogin}</p><p className="sd-stat-lbl">No Login</p></div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="sd-toolbar">
        <div className="sd-search-wrap">
          <Search size={15} className="sd-search-icon" />
          <input className="sd-search" placeholder="Search by name, email, phone, employee number..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="sd-filter" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
        </select>
        <select className="sd-filter" value={department} onChange={(e) => setDepartment(e.target.value)}>
          {departments.map((d) => <option key={d} value={d}>{d === 'All' ? 'All Departments' : d}</option>)}
        </select>
        <select className="sd-filter" value={loginStatus} onChange={(e) => setLoginStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === 'All' ? 'All Login Status' : s}</option>)}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="sd-empty">
          <Users size={40} />
          <h3>No staff members found</h3>
          <p>Staff records will appear here once teachers, administrators, or non-teaching employees have been added to the system.</p>
        </div>
      ) : (
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead>
              <tr>
                <th>Staff Member</th>
                <th>Category</th>
                <th>Position / Role</th>
                <th>Department</th>
                <th>Contact</th>
                <th>Employment</th>
                <th>Login</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const catColor = CAT_COLORS[s.staffCategory] || CAT_COLORS['Non-Teaching']
                const statColor = STATUS_COLORS[s.accountStatus] || STATUS_COLORS['No Account']
                return (
                  <tr key={`${s.sourceType}-${s.sourceIds.teacherId || s.sourceIds.nonTeachingStaffId || s.sourceIds.profileId}`}>
                    <td>
                      <div className="sd-name-cell">
                        {s.photoUrl ? (
                          <img src={s.photoUrl} alt="" className="sd-avatar-img" />
                        ) : (
                          <div className="sd-avatar">{initials(s.fullName)}</div>
                        )}
                        <div>
                          <p className="sd-name">{s.fullName || 'Unnamed'}</p>
                          {s.employeeNumber && <p className="sd-emp-no">{s.employeeNumber}</p>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="sd-badge" style={{ background: catColor.bg, color: catColor.fg }}>
                        {CAT_ICONS[s.staffCategory]} {s.staffCategory}
                      </span>
                    </td>
                    <td>{s.position || '—'}</td>
                    <td>{s.department || '—'}</td>
                    <td>
                      <div className="sd-contact">
                        {s.phone && <span className="sd-contact-item"><Phone size={12} /> {s.phone}</span>}
                        {s.email && <span className="sd-contact-item"><Mail size={12} /> {s.email}</span>}
                        {!s.phone && !s.email && <span className="sd-contact-item sd-muted">—</span>}
                      </div>
                    </td>
                    <td>
                      <div className="sd-emp-info">
                        {s.employmentType && <span className="sd-cap">{s.employmentType}</span>}
                        {s.employmentStatus && (
                          <span className="sd-status-dot" style={{ color: s.employmentStatus === 'active' ? '#16a34a' : s.employmentStatus === 'on_leave' ? '#d97706' : '#dc2626' }}>
                            {s.employmentStatus === 'active' ? 'Active' : s.employmentStatus === 'on_leave' ? 'On Leave' : s.employmentStatus === 'terminated' ? 'Terminated' : s.employmentStatus}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="sd-badge sd-badge-sm" style={{ background: statColor.bg, color: statColor.fg }}>
                        {s.accountStatus}
                      </span>
                    </td>
                    <td>
                      <button className="sd-btn-eye" onClick={() => setDetail(s)} title="View details">
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="sd-table-footer">
            <span className="sd-table-count">{filtered.length} staff member{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && <StaffDetailModal staff={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function StaffDetailModal({ staff: s, onClose }) {
  const catColor = CAT_COLORS[s.staffCategory] || CAT_COLORS['Non-Teaching']
  return (
    <div className="sd-overlay" onClick={onClose}>
      <div className="sd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sd-modal-head">
          <h3>Staff Details</h3>
          <button className="sd-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="sd-modal-body">
          {/* Profile Header */}
          <div className="sd-detail-header">
            {s.photoUrl ? (
              <img src={s.photoUrl} alt="" className="sd-detail-avatar-img" />
            ) : (
              <div className="sd-detail-avatar">{initials(s.fullName)}</div>
            )}
            <div>
              <h2 className="sd-detail-name">{s.fullName || 'Unnamed'}</h2>
              <div className="sd-detail-meta">
                <span className="sd-badge" style={{ background: catColor.bg, color: catColor.fg }}>
                  {CAT_ICONS[s.staffCategory]} {s.staffCategory}
                </span>
                {s.position && <span className="sd-detail-position">{s.position}</span>}
                {s.employeeNumber && <span className="sd-detail-empno">{s.employeeNumber}</span>}
              </div>
            </div>
          </div>

          {/* Personal Info */}
          <div className="sd-section">
            <h4 className="sd-section-title">Personal Information</h4>
            <div className="sd-detail-grid">
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Full Name</span>
                <span className="sd-detail-val">{s.fullName || '—'}</span>
              </div>
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Email</span>
                <span className="sd-detail-val">{s.email || '—'}</span>
              </div>
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Phone</span>
                <span className="sd-detail-val">{s.phone || '—'}</span>
              </div>
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Gender</span>
                <span className="sd-detail-val sd-cap">{s.gender || '—'}</span>
              </div>
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Date of Birth</span>
                <span className="sd-detail-val">{fmtDate(s.dateOfBirth)}</span>
              </div>
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">National ID</span>
                <span className="sd-detail-val">{s.idNumber || '—'}</span>
              </div>
            </div>
          </div>

          {/* Employment Info */}
          <div className="sd-section">
            <h4 className="sd-section-title">Employment Information</h4>
            <div className="sd-detail-grid">
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Employee Number</span>
                <span className="sd-detail-val">{s.employeeNumber || '—'}</span>
              </div>
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Position</span>
                <span className="sd-detail-val">{s.position || '—'}</span>
              </div>
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Department</span>
                <span className="sd-detail-val">{s.department || '—'}</span>
              </div>
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Employment Type</span>
                <span className="sd-detail-val sd-cap">{s.employmentType || '—'}</span>
              </div>
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Status</span>
                <span className="sd-detail-val sd-cap">{s.employmentStatus || '—'}</span>
              </div>
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Date of Hire</span>
                <span className="sd-detail-val">{fmtDate(s.dateOfHire)}</span>
              </div>
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Qualification</span>
                <span className="sd-detail-val">{s.qualification || '—'}</span>
              </div>
              {s.salary != null && (
                <div className="sd-detail-item">
                  <span className="sd-detail-lbl">Salary</span>
                  <span className="sd-detail-val">KSh {Number(s.salary).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Teaching Info */}
          {s.sourceType === 'teacher' && (s.subjects.length > 0 || s.assignedClasses.length > 0 || s.hodDepartment || s.teachingLevel) && (
            <div className="sd-section">
              <h4 className="sd-section-title">Teaching Information</h4>
              <div className="sd-detail-grid">
                {s.subjects.length > 0 && (
                  <div className="sd-detail-item sd-detail-item-full">
                    <span className="sd-detail-lbl">Subjects</span>
                    <span className="sd-detail-val">{s.subjects.join(', ')}</span>
                  </div>
                )}
                {s.assignedClasses.length > 0 && (
                  <div className="sd-detail-item sd-detail-item-full">
                    <span className="sd-detail-lbl">Assigned Classes</span>
                    <span className="sd-detail-val">{s.assignedClasses.join(', ')}</span>
                  </div>
                )}
                {s.teachingLevel && (
                  <div className="sd-detail-item">
                    <span className="sd-detail-lbl">Teaching Level</span>
                    <span className="sd-detail-val sd-cap">{s.teachingLevel}</span>
                  </div>
                )}
                {s.hodDepartment && (
                  <div className="sd-detail-item">
                    <span className="sd-detail-lbl">HOD Department</span>
                    <span className="sd-detail-val">{s.hodDepartment}</span>
                  </div>
                )}
                {s.maximumLessonsPerWeek && (
                  <div className="sd-detail-item">
                    <span className="sd-detail-lbl">Max Lessons / Week</span>
                    <span className="sd-detail-val">{s.maximumLessonsPerWeek}</span>
                  </div>
                )}
                {s.maximumLessonsPerDay && (
                  <div className="sd-detail-item">
                    <span className="sd-detail-lbl">Max Lessons / Day</span>
                    <span className="sd-detail-val">{s.maximumLessonsPerDay}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* System Account */}
          <div className="sd-section">
            <h4 className="sd-section-title">System Account</h4>
            <div className="sd-detail-grid">
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Login Account</span>
                <span className="sd-detail-val">{s.hasLoginAccount ? 'Yes' : 'No'}</span>
              </div>
              {s.hasLoginAccount && (
                <>
                  <div className="sd-detail-item">
                    <span className="sd-detail-lbl">Account Status</span>
                    <span className="sd-detail-val">{s.accountStatus}</span>
                  </div>
                  {s.raw?.profile?.role && (
                    <div className="sd-detail-item">
                      <span className="sd-detail-lbl">Role</span>
                      <span className="sd-detail-val sd-cap">{s.raw.profile.role.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                  {s.raw?.profile?.roles && s.raw.profile.roles.length > 0 && (
                    <div className="sd-detail-item sd-detail-item-full">
                      <span className="sd-detail-lbl">All Roles</span>
                      <span className="sd-detail-val">{s.raw.profile.roles.map((r) => r.replace(/_/g, ' ')).join(', ')}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Debug: Source */}
          <div className="sd-section sd-section-debug">
            <h4 className="sd-section-title">Data Source (Debug)</h4>
            <div className="sd-detail-grid">
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Source Type</span>
                <span className="sd-detail-val">{s.sourceType}</span>
              </div>
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Teacher ID</span>
                <span className="sd-detail-val sd-mono">{s.sourceIds.teacherId || '—'}</span>
              </div>
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">NTS ID</span>
                <span className="sd-detail-val sd-mono">{s.sourceIds.nonTeachingStaffId || '—'}</span>
              </div>
              <div className="sd-detail-item">
                <span className="sd-detail-lbl">Profile ID</span>
                <span className="sd-detail-val sd-mono">{s.sourceIds.profileId || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
