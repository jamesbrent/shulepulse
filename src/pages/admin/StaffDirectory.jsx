import { useState, useMemo, useCallback } from 'react'
import {
  Search, Users, GraduationCap, Briefcase, Shield, UserCheck,
  UserX, Eye, X, Mail, Phone, AlertTriangle, RefreshCw,
  Download, UserPlus,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import useStaffDirectory from '../../hooks/useStaffDirectory'
import './StaffDirectory.css'

const CATEGORIES = ['All', 'Teaching', 'Non-Teaching', 'Administration']
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

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function StaffDirectory() {
  const { staff, stats, loading, error, refetch } = useStaffDirectory()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [department, setDepartment] = useState('All')
  const [loginStatus, setLoginStatus] = useState('All')
  const [detail, setDetail] = useState(null)
  const [creatingAccount, setCreatingAccount] = useState(null)
  const [showPassword, setShowPassword] = useState(null)

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

  const exportCsv = useCallback(() => {
    const headers = ['Name', 'Email', 'Phone', 'Category', 'Position', 'Department', 'Employee No', 'Employment Type', 'Status', 'Login Account', 'Date of Hire']
    const rows = filtered.map((s) => [
      s.fullName, s.email, s.phone, s.staffCategory, s.position, s.department,
      s.employeeNumber, s.employmentType, s.employmentStatus,
      s.hasLoginAccount ? s.accountStatus : 'No Account', s.dateOfHire || '',
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${(c || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `staff-directory-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filtered])

  const createLoginAccount = useCallback(async (rec) => {
    if (!rec.email) return
    setCreatingAccount(rec.sourceIds.teacherId || rec.sourceIds.nonTeachingStaffId)
    const password = generatePassword()
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: rec.email,
        password,
        options: { data: { full_name: rec.fullName, role: rec.sourceType === 'teacher' ? 'teacher' : 'teacher' } },
      })
      if (signUpError && !signUpError.message?.includes('already registered')) throw signUpError
      const userId = data?.user?.id
      if (userId) {
        await supabase.from('profiles').update({
          full_name: rec.fullName,
          role: 'teacher',
          roles: ['teacher'],
          school_id: rec.schoolId,
        }).eq('id', userId)
      }
      if (rec.sourceType === 'teacher' && rec.sourceIds.teacherId) {
        await supabase.from('teachers').update({ profile_id: userId }).eq('id', rec.sourceIds.teacherId)
      } else if (rec.sourceType === 'non_teaching' && rec.sourceIds.nonTeachingStaffId) {
        await supabase.from('non_teaching_staff').update({ profile_id: userId }).eq('id', rec.sourceIds.nonTeachingStaffId)
      }
      setShowPassword({ name: rec.fullName, email: rec.email, password })
      refetch()
    } catch (err) {
      setShowPassword({ name: rec.fullName, email: rec.email, password: null, error: err.message })
    }
    setCreatingAccount(null)
  }, [refetch])

  if (loading) {
    return (
      <div className="sd-root">
        <div className="sd-loading"><div className="sd-spinner" /><p>Loading staff directory...</p></div>
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
      <div className="sd-header">
        <div className="sd-header-text">
          <h2>Staff Directory</h2>
          <p>Manage and view all employees in your school</p>
        </div>
        <button className="sd-btn-export" onClick={exportCsv}><Download size={14} /> Export CSV</button>
      </div>

      <div className="sd-stats">
        <div className="sd-stat"><div className="sd-stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}><Users size={16} /></div><div><p className="sd-stat-val">{stats.total}</p><p className="sd-stat-lbl">Total Staff</p></div></div>
        <div className="sd-stat"><div className="sd-stat-icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}><GraduationCap size={16} /></div><div><p className="sd-stat-val">{stats.teaching}</p><p className="sd-stat-lbl">Teaching</p></div></div>
        <div className="sd-stat"><div className="sd-stat-icon" style={{ background: '#fef3c7', color: '#92400e' }}><Briefcase size={16} /></div><div><p className="sd-stat-val">{stats.nonTeaching}</p><p className="sd-stat-lbl">Non-Teaching</p></div></div>
        <div className="sd-stat"><div className="sd-stat-icon" style={{ background: '#ede9fe', color: '#6d28d9' }}><Shield size={16} /></div><div><p className="sd-stat-val">{stats.admin}</p><p className="sd-stat-lbl">Administration</p></div></div>
        <div className="sd-stat"><div className="sd-stat-icon" style={{ background: '#dcfce7', color: '#15803d' }}><UserCheck size={16} /></div><div><p className="sd-stat-val">{stats.withLogin}</p><p className="sd-stat-lbl">With Login</p></div></div>
        <div className="sd-stat"><div className="sd-stat-icon" style={{ background: '#f1f5f9', color: '#64748b' }}><UserX size={16} /></div><div><p className="sd-stat-val">{stats.withoutLogin}</p><p className="sd-stat-lbl">No Login</p></div></div>
      </div>

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

      {filtered.length === 0 ? (
        <div className="sd-empty">
          <Users size={40} />
          <h3>No staff members found</h3>
          <p>Staff records will appear here once teachers, administrators, or non-teaching employees have been added to the system.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="sd-table-wrap sd-desktop-only">
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
                {filtered.map((s) => (
                  <StaffRow key={`${s.sourceType}-${s.sourceIds.teacherId || s.sourceIds.nonTeachingStaffId || s.sourceIds.profileId}`} staff={s} onDetail={setDetail} onCreateAccount={createLoginAccount} creatingAccount={creatingAccount} />
                ))}
              </tbody>
            </table>
            <div className="sd-table-footer">
              <span className="sd-table-count">{filtered.length} staff member{filtered.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="sd-cards sd-mobile-only">
            {filtered.map((s) => (
              <StaffCard key={`card-${s.sourceType}-${s.sourceIds.teacherId || s.sourceIds.nonTeachingStaffId || s.sourceIds.profileId}`} staff={s} onDetail={setDetail} onCreateAccount={createLoginAccount} creatingAccount={creatingAccount} />
            ))}
            <div className="sd-cards-footer">{filtered.length} staff member{filtered.length !== 1 ? 's' : ''}</div>
          </div>
        </>
      )}

      {detail && <StaffDetailModal staff={detail} onClose={() => setDetail(null)} />}
      {showPassword && <PasswordModal data={showPassword} onClose={() => setShowPassword(null)} />}
    </div>
  )
}

function StaffRow({ staff: s, onDetail, onCreateAccount, creatingAccount }) {
  const catColor = CAT_COLORS[s.staffCategory] || CAT_COLORS['Non-Teaching']
  const statColor = STATUS_COLORS[s.accountStatus] || STATUS_COLORS['No Account']
  return (
    <tr>
      <td>
        <div className="sd-name-cell">
          {s.photoUrl ? <img src={s.photoUrl} alt="" className="sd-avatar-img" /> : <div className="sd-avatar">{initials(s.fullName)}</div>}
          <div>
            <p className="sd-name">{s.fullName || 'Unnamed'}</p>
            {s.employeeNumber && <p className="sd-emp-no">{s.employeeNumber}</p>}
          </div>
        </div>
      </td>
      <td><span className="sd-badge" style={{ background: catColor.bg, color: catColor.fg }}>{CAT_ICONS[s.staffCategory]} {s.staffCategory}</span></td>
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
          {s.employmentStatus && <span className="sd-status-dot" style={{ color: s.employmentStatus === 'active' ? '#16a34a' : s.employmentStatus === 'on_leave' ? '#d97706' : '#dc2626' }}>{s.employmentStatus === 'active' ? 'Active' : s.employmentStatus === 'on_leave' ? 'On Leave' : s.employmentStatus === 'terminated' ? 'Terminated' : s.employmentStatus}</span>}
        </div>
      </td>
      <td><span className="sd-badge sd-badge-sm" style={{ background: statColor.bg, color: statColor.fg }}>{s.accountStatus}</span></td>
      <td className="sd-actions-cell">
        {!s.hasLoginAccount && s.email && (
          <button className="sd-btn-create" disabled={creatingAccount === (s.sourceIds.teacherId || s.sourceIds.nonTeachingStaffId)} onClick={() => onCreateAccount(s)} title="Create login account">
            <UserPlus size={13} />
          </button>
        )}
        <button className="sd-btn-eye" onClick={() => onDetail(s)} title="View details"><Eye size={15} /></button>
      </td>
    </tr>
  )
}

function StaffCard({ staff: s, onDetail, onCreateAccount, creatingAccount }) {
  const catColor = CAT_COLORS[s.staffCategory] || CAT_COLORS['Non-Teaching']
  const statColor = STATUS_COLORS[s.accountStatus] || STATUS_COLORS['No Account']
  return (
    <div className="sd-card">
      <div className="sd-card-top">
        {s.photoUrl ? <img src={s.photoUrl} alt="" className="sd-card-avatar-img" /> : <div className="sd-card-avatar">{initials(s.fullName)}</div>}
        <div className="sd-card-info">
          <p className="sd-card-name">{s.fullName || 'Unnamed'}</p>
          <p className="sd-card-pos">{s.position || '—'}{s.department ? ` · ${s.department}` : ''}</p>
        </div>
        <button className="sd-btn-eye" onClick={() => onDetail(s)}><Eye size={15} /></button>
      </div>
      <div className="sd-card-meta">
        <span className="sd-badge" style={{ background: catColor.bg, color: catColor.fg }}>{s.staffCategory}</span>
        <span className="sd-badge sd-badge-sm" style={{ background: statColor.bg, color: statColor.fg }}>{s.accountStatus}</span>
        {s.employeeNumber && <span className="sd-card-empno">{s.employeeNumber}</span>}
      </div>
      <div className="sd-card-contact">
        {s.phone && <span><Phone size={11} /> {s.phone}</span>}
        {s.email && <span><Mail size={11} /> {s.email}</span>}
      </div>
      {!s.hasLoginAccount && s.email && (
        <button className="sd-btn-create-full" disabled={creatingAccount === (s.sourceIds.teacherId || s.sourceIds.nonTeachingStaffId)} onClick={() => onCreateAccount(s)}>
          <UserPlus size={13} /> Create Login Account
        </button>
      )}
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
          <div className="sd-detail-header">
            {s.photoUrl ? <img src={s.photoUrl} alt="" className="sd-detail-avatar-img" /> : <div className="sd-detail-avatar">{initials(s.fullName)}</div>}
            <div>
              <h2 className="sd-detail-name">{s.fullName || 'Unnamed'}</h2>
              <div className="sd-detail-meta">
                <span className="sd-badge" style={{ background: catColor.bg, color: catColor.fg }}>{CAT_ICONS[s.staffCategory]} {s.staffCategory}</span>
                {s.position && <span className="sd-detail-position">{s.position}</span>}
                {s.employeeNumber && <span className="sd-detail-empno">{s.employeeNumber}</span>}
              </div>
            </div>
          </div>

          <Section title="Personal Information">
            <DetailGrid items={[
              { label: 'Full Name', value: s.fullName },
              { label: 'Email', value: s.email },
              { label: 'Phone', value: s.phone },
              { label: 'Gender', value: s.gender, capitalize: true },
              { label: 'Date of Birth', value: fmtDate(s.dateOfBirth) },
              { label: 'National ID', value: s.idNumber },
            ]} />
          </Section>

          <Section title="Employment Information">
            <DetailGrid items={[
              { label: 'Employee Number', value: s.employeeNumber },
              { label: 'Position', value: s.position },
              { label: 'Department', value: s.department },
              { label: 'Employment Type', value: s.employmentType, capitalize: true },
              { label: 'Status', value: s.employmentStatus, capitalize: true },
              { label: 'Date of Hire', value: fmtDate(s.dateOfHire) },
              { label: 'Qualification', value: s.qualification },
              ...(s.salary != null ? [{ label: 'Salary', value: `KSh ${Number(s.salary).toLocaleString()}` }] : []),
            ]} />
          </Section>

          {s.sourceType === 'teacher' && (s.subjects.length > 0 || s.assignedClasses.length > 0 || s.hodDepartment || s.teachingLevel) && (
            <Section title="Teaching Information">
              <DetailGrid items={[
                ...(s.subjects.length > 0 ? [{ label: 'Subjects', value: s.subjects.join(', '), full: true }] : []),
                ...(s.assignedClasses.length > 0 ? [{ label: 'Assigned Classes', value: s.assignedClasses.join(', '), full: true }] : []),
                ...(s.teachingLevel ? [{ label: 'Teaching Level', value: s.teachingLevel, capitalize: true }] : []),
                ...(s.hodDepartment ? [{ label: 'HOD Department', value: s.hodDepartment }] : []),
                ...(s.maximumLessonsPerWeek ? [{ label: 'Max Lessons / Week', value: s.maximumLessonsPerWeek }] : []),
                ...(s.maximumLessonsPerDay ? [{ label: 'Max Lessons / Day', value: s.maximumLessonsPerDay }] : []),
              ]} />
            </Section>
          )}

          <Section title="System Account">
            <DetailGrid items={[
              { label: 'Login Account', value: s.hasLoginAccount ? 'Yes' : 'No' },
              ...(s.hasLoginAccount ? [
                { label: 'Account Status', value: s.accountStatus },
                ...(s.raw?.profile?.role ? [{ label: 'Role', value: s.raw.profile.role.replace(/_/g, ' '), capitalize: true }] : []),
                ...(s.raw?.profile?.roles?.length > 0 ? [{ label: 'All Roles', value: s.raw.profile.roles.map((r) => r.replace(/_/g, ' ')).join(', '), full: true }] : []),
              ] : []),
            ]} />
          </Section>

          <Section title="Data Source" debug>
            <DetailGrid items={[
              { label: 'Source Type', value: s.sourceType },
              { label: 'Teacher ID', value: s.sourceIds.teacherId || '—', mono: true },
              { label: 'NTS ID', value: s.sourceIds.nonTeachingStaffId || '—', mono: true },
              { label: 'Profile ID', value: s.sourceIds.profileId || '—', mono: true },
            ]} />
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children, debug }) {
  return (
    <div className={`sd-section${debug ? ' sd-section-debug' : ''}`}>
      <h4 className="sd-section-title">{title}</h4>
      {children}
    </div>
  )
}

function DetailGrid({ items }) {
  return (
    <div className="sd-detail-grid">
      {items.map((item, i) => (
        <div key={i} className={`sd-detail-item${item.full ? ' sd-detail-item-full' : ''}`}>
          <span className="sd-detail-lbl">{item.label}</span>
          <span className={`sd-detail-val${item.capitalize ? ' sd-cap' : ''}${item.mono ? ' sd-mono' : ''}`}>{item.value || '—'}</span>
        </div>
      ))}
    </div>
  )
}

function PasswordModal({ data, onClose }) {
  return (
    <div className="sd-overlay" onClick={onClose}>
      <div className="sd-modal sd-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="sd-modal-head">
          <h3>{data.error ? 'Account Creation Failed' : 'Login Credentials'}</h3>
          <button className="sd-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="sd-modal-body">
          {data.error ? (
            <div className="sd-password-error">
              <AlertTriangle size={20} />
              <p>{data.error}</p>
              {data.error.includes('already registered') && <p className="sd-hint">This email already has an account. The staff member can use their existing login.</p>}
            </div>
          ) : (
            <>
              <p className="sd-password-info">Login credentials for <strong>{data.name}</strong>:</p>
              <div className="sd-password-box">
                <div className="sd-password-row"><span className="sd-password-lbl">Email</span><span className="sd-password-val">{data.email}</span></div>
                <div className="sd-password-row"><span className="sd-password-lbl">Password</span><span className="sd-password-val sd-password-code">{data.password}</span></div>
              </div>
              <p className="sd-hint">Share these credentials securely with the staff member. They should change their password on first login.</p>
            </>
          )}
        </div>
        <div className="sd-modal-foot">
          <button className="sd-btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
