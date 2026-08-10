import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Users, Search, X, Printer, Download, ChevronRight,
  ChevronDown, MoreHorizontal, Eye, Edit3, ArrowRightLeft,
  Archive, AlertTriangle, Heart, Shield, Clock, CheckCircle
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmtDate } from '../admin/fees/utils/feesHelpers'
import './Students.css'

const PAGE_SIZE = 15

/* ─── Status Badge ─── */
function StatusBadge({ status }) {
  const map = {
    active: 'stu-badge--active',
    alumni: 'stu-badge--alumni',
    transferred: 'stu-badge--transferred',
    inactive: 'stu-badge--inactive',
  }
  return (
    <span className={`stu-badge ${map[status] || 'stu-badge--active'}`}>
      {status || 'unknown'}
    </span>
  )
}

/* ─── Avatar ─── */
function Avatar({ name, size = 'md' }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '??'
  return (
    <div className={`stu-avatar stu-avatar--${size}`}>
      {initials}
    </div>
  )
}

/* ─── Row Dropdown ─── */
function RowDropdown({ student, onView, onEdit, onTransfer, onArchive }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const handleKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey) }
  }, [open])

  return (
    <div className="stu-dd-wrap" ref={ref}>
      <button
        className={`stu-dd-trigger ${open ? 'stu-dd-trigger--active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${student.full_name}`}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="stu-dd-menu" role="menu">
          <button className="stu-dd-item" role="menuitem" onClick={() => { setOpen(false); onView(student) }}>
            <Eye size={14} /> View Profile
          </button>
          <button className="stu-dd-item" role="menuitem" onClick={() => { setOpen(false); onEdit(student) }}>
            <Edit3 size={14} /> Edit Record
          </button>
          <button className="stu-dd-item" role="menuitem" onClick={() => { setOpen(false); onTransfer(student) }}>
            <ArrowRightLeft size={14} /> Transfer Student
          </button>
          <div className="stu-dd-sep" />
          <button className="stu-dd-item stu-dd-item--danger" role="menuitem" onClick={() => { setOpen(false); onArchive(student) }}>
            <Archive size={14} /> Archive
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Main Component ─── */
export default function Students() {
  const { profile } = useAuthStore()
  const { school } = useSchool()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterStream, setFilterStream] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [view, setView] = useState('list')
  const [profileTab, setProfileTab] = useState('info')

  useEffect(() => { if (profile?.school_id) fetchStudents() }, [profile?.school_id])

  const fetchStudents = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('created_at', { ascending: false })
    setStudents(data || [])
    setLoading(false)
  }

  const stats = useMemo(() => ({
    total: students.length,
    active: students.filter(s => s.status === 'active').length,
    transferred: students.filter(s => s.status === 'transferred').length,
    alumni: students.filter(s => s.status === 'alumni').length,
  }), [students])

  const classes = useMemo(() => [...new Set(students.map(s => s.class).filter(Boolean))].sort(), [students])
  const streams = useMemo(() => [...new Set(students.map(s => s.stream).filter(Boolean))].sort(), [students])

  const filtered = useMemo(() => {
    let list = students
    if (filterStatus) list = list.filter(s => s.status === filterStatus)
    if (filterClass) list = list.filter(s => s.class === filterClass)
    if (filterStream) list = list.filter(s => s.stream === filterStream)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        (s.full_name || '').toLowerCase().includes(q) ||
        (s.admission_number || '').toLowerCase().includes(q) ||
        (s.parent_name || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [students, filterStatus, filterClass, filterStream, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => { setPage(1) }, [search, filterClass, filterStream, filterStatus])

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    const rows = filtered.map((s, i) =>
      `<tr><td style="text-align:center">${i + 1}</td><td>${s.admission_number || ''}</td><td>${s.full_name}</td><td>${s.class || ''}</td><td>${s.stream || ''}</td><td>${s.parent_name || ''}</td><td>${s.parent_phone || ''}</td><td>${s.status || ''}</td></tr>`
    ).join('')
    printWindow.document.write(`
      <html><head><title>Student Records</title>
      <style>
        @page{size:A4 landscape;margin:10mm}*{font-family:Arial,sans-serif}
        .ph{text-align:center;margin-bottom:10px}
        .ph h2{margin:0;font-size:18px}
        table{width:100%;border-collapse:collapse;border:2px solid #111}
        th,td{border:1px solid #111;padding:6px 8px;font-size:11px;text-align:left}
        th{background:#f1f5f9}
        .pf{text-align:center;font-size:10px;color:#999;margin-top:12px}
      </style>
      </head><body>
      <div class="ph"><h2>${school?.name || ''} - Student Records</h2></div>
      <table><thead><tr><th>No.</th><th>Adm No</th><th>Full Name</th><th>Class</th><th>Stream</th><th>Parent</th><th>Phone</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="pf">Generated on ${new Date().toLocaleDateString()} | ${filtered.length} student${filtered.length === 1 ? '' : 's'}</div>
      </body></html>
    `)
    printWindow.document.close()
    printWindow.onload = () => { printWindow.focus(); printWindow.print() }
  }

  const handleExport = () => {
    const rows = [['Admission Number', 'Full Name', 'Class', 'Stream', 'Parent', 'Phone', 'Status']]
    filtered.forEach(s => rows.push([
      s.admission_number || '', s.full_name || '', s.class || '', s.stream || '',
      s.parent_name || '', s.parent_phone || '', s.status || '',
    ]))
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'students.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleViewProfile = (s) => { setSelectedStudent(s); setView('profile'); setProfileTab('info') }
  const handleEdit = (s) => { /* placeholder */ }
  const handleTransfer = (s) => { /* placeholder */ }
  const handleArchive = (s) => { /* placeholder */ }

  /* ─── Profile View ─── */
  if (view === 'profile' && selectedStudent) {
    const s = selectedStudent
    const infoFields = [
      ['Admission No', s.admission_number], ['Full Name', s.full_name],
      ['Class', s.class], ['Stream', s.stream], ['Gender', s.gender],
      ['Date of Birth', s.date_of_birth], ['Date Admitted', fmtDate(s.created_at)],
      ['Nationality', s.nationality], ['Religion', s.religion],
      ['Home Address', s.home_address], ['County', s.county],
      ['Sub County', s.sub_county], ['Ward', s.ward],
      ['Phone', s.phone], ['Email', s.email],
      ['Day/Boarding', s.day_boarding], ['Previous School', s.previous_school],
      ['UPI Number', s.upi_number], ['NEMIS Number', s.nemis_number],
      ['Birth Certificate', s.birth_cert_number], ['Status', s.status],
    ]
    const medicalFields = [['Blood Group', s.blood_group], ['Allergies', s.allergies], ['Medical Conditions', s.medical_conditions]]
    const parentFields = [['Parent Name', s.parent_name], ['Parent Phone', s.parent_phone], ['Parent Email', s.parent_email]]

    return (
      <div className="stu-root">
        <div className="stu-profile-header">
          <button className="stu-btn stu-btn--ghost" onClick={() => { setView('list'); setSelectedStudent(null) }}>
            <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /> Back
          </button>
          <div className="stu-profile-identity">
            <Avatar name={s.full_name} size="lg" />
            <div>
              <h2>{s.full_name}</h2>
              <p>{s.admission_number} — {s.class}{s.stream ? ` ${s.stream}` : ''}</p>
            </div>
          </div>
          <StatusBadge status={s.status} />
        </div>

        <div className="stu-profile-tabs">
          {[
            { key: 'info', label: 'Personal Info', icon: <Users size={14} /> },
            { key: 'medical', label: 'Medical', icon: <Heart size={14} /> },
            { key: 'parent', label: 'Parent/Guardian', icon: <Shield size={14} /> },
            { key: 'history', label: 'History', icon: <Clock size={14} /> },
          ].map(tab => (
            <button key={tab.key} className={`stu-tab ${profileTab === tab.key ? 'stu-tab--active' : ''}`}
              onClick={() => setProfileTab(tab.key)}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {profileTab === 'info' && (
          <div className="stu-info-grid">
            {infoFields.filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="stu-info-item"><label>{label}</label><span>{value}</span></div>
            ))}
          </div>
        )}

        {profileTab === 'medical' && (
          <div className="stu-card">
            {medicalFields.filter(([, v]) => v).length === 0 ? (
              <p className="stu-empty-text">No medical information recorded</p>
            ) : (
              <div className="stu-info-grid">
                {medicalFields.filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="stu-info-item"><label>{label}</label><span>{value}</span></div>
                ))}
              </div>
            )}
            {(s.allergies || s.medical_conditions) && (
              <div className="stu-medical-alert">
                <AlertTriangle size={16} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
                <div>
                  <strong>Medical Alert</strong>
                  {s.allergies && <p>Allergies: {s.allergies}</p>}
                  {s.medical_conditions && <p>Condition: {s.medical_conditions}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {profileTab === 'parent' && (
          <div className="stu-card">
            {parentFields.filter(([, v]) => v).length === 0 ? (
              <p className="stu-empty-text">No parent/guardian information recorded</p>
            ) : (
              <div className="stu-info-grid">
                {parentFields.filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="stu-info-item"><label>{label}</label><span>{value}</span></div>
                ))}
              </div>
            )}
          </div>
        )}

        {profileTab === 'history' && (
          <div className="stu-card">
            <h4>Student Timeline</h4>
            <div className="stu-timeline">
              {s.created_at && (
                <div className="stu-timeline-item">
                  <div className="stu-timeline-dot" style={{ background: '#2563EB' }} />
                  <div><p className="stu-timeline-title">Admitted</p><p className="stu-timeline-desc">{fmtDate(s.created_at)} — Class: {s.class}</p></div>
                </div>
              )}
              {s.updated_at && s.updated_at !== s.created_at && (
                <div className="stu-timeline-item">
                  <div className="stu-timeline-dot" style={{ background: '#F59E0B' }} />
                  <div><p className="stu-timeline-title">Record Updated</p><p className="stu-timeline-desc">{fmtDate(s.updated_at)}</p></div>
                </div>
              )}
              <div className="stu-timeline-item">
                <div className="stu-timeline-dot" style={{ background: '#16A34A' }} />
                <div><p className="stu-timeline-title">Current Status</p><p className="stu-timeline-desc">{s.status} in {s.class}{s.stream ? ` ${s.stream}` : ''}</p></div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ─── List View ─── */
  return (
    <div className="stu-root">
      {/* Metric Chips */}
      <div className="stu-chips">
        <div className="stu-chip"><span className="stu-chip-value">{stats.total}</span><span className="stu-chip-label">Total</span></div>
        <div className="stu-chip stu-chip--active"><span className="stu-chip-value">{stats.active}</span><span className="stu-chip-label">Active</span></div>
        <div className="stu-chip stu-chip--transferred"><span className="stu-chip-value">{stats.transferred}</span><span className="stu-chip-label">Transferred</span></div>
        <div className="stu-chip stu-chip--alumni"><span className="stu-chip-value">{stats.alumni}</span><span className="stu-chip-label">Alumni</span></div>
      </div>

      {/* Toolbar */}
      <div className="stu-toolbar">
        <div className="stu-toolbar-left">
          <div className="stu-search-wrap">
            <Search size={14} className="stu-search-icon" />
            <input className="stu-search-input" placeholder="Search name, adm no, parent..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="stu-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="stu-select" value={filterStream} onChange={e => setFilterStream(e.target.value)}>
            <option value="">All Streams</option>
            {streams.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="stu-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="transferred">Transferred</option>
            <option value="alumni">Alumni</option>
          </select>
        </div>
        <div className="stu-toolbar-right">
          <button className="stu-btn stu-btn--outline stu-btn--sm" onClick={handlePrint}>
            <Printer size={14} /> Print
          </button>
          <button className="stu-btn stu-btn--outline stu-btn--sm" onClick={handleExport}>
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Alerts */}
      {loading ? (
        <div className="stu-loading">Loading students...</div>
      ) : filtered.length === 0 ? (
        <div className="stu-empty">
          <Users size={40} color="#CBD5E1" />
          <p>No students found</p>
          <span>{search || filterClass || filterStream || filterStatus ? 'Try adjusting your filters' : 'Students will appear here once admitted'}</span>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="stu-table-wrap">
            <div className="stu-table-scroll">
              <table className="stu-table">
                <thead>
                  <tr>
                    <th className="stu-th--student">Student</th>
                    <th className="stu-th--class">Class</th>
                    <th className="stu-th--stream">Stream</th>
                    <th className="stu-th--parent">Parent</th>
                    <th className="stu-th--status">Status</th>
                    <th className="stu-th--actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(s => (
                    <tr key={s.id}>
                      <td>
                        <div className="stu-student-cell">
                          <Avatar name={s.full_name} />
                          <div className="stu-student-info">
                            <span className="stu-student-name">{s.full_name}</span>
                            <span className="stu-student-adm">{s.admission_number}</span>
                          </div>
                        </div>
                      </td>
                      <td>{s.class || '—'}</td>
                      <td>{s.stream || '—'}</td>
                      <td>
                        <div className="stu-parent-cell">
                          <span className="stu-parent-name">{s.parent_name || '—'}</span>
                          {s.parent_phone && <span className="stu-parent-phone">{s.parent_phone}</span>}
                        </div>
                      </td>
                      <td><StatusBadge status={s.status} /></td>
                      <td>
                        <RowDropdown student={s} onView={handleViewProfile} onEdit={handleEdit} onTransfer={handleTransfer} onArchive={handleArchive} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="stu-pagination">
            <span className="stu-page-info">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="stu-page-btns">
              <button className="stu-btn stu-btn--icon stu-btn--xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <button className="stu-btn stu-btn--icon stu-btn--xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
