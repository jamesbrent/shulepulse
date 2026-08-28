import { useState, useEffect, useMemo } from 'react'
import {
  UserPlus, Save, X, Users, Download, RefreshCw,
  Search, ChevronLeft, ChevronRight, ArrowUpCircle,
  AlertCircle, CheckCircle, GraduationCap, UserCheck, Key
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { createStudentAuth, bulkCreateStudentAuth, generateAdmissionNumber } from '../../services/students/studentService'
import './Admissions.css'

const CLASS_GROUPS = [
  { label: 'Pre-Primary', options: ['PP1', 'PP2'] },
  { label: 'Lower Primary', options: ['Grade 1', 'Grade 2', 'Grade 3'] },
  { label: 'Upper Primary', options: ['Grade 4', 'Grade 5', 'Grade 6'] },
  { label: 'Junior School', options: ['Grade 7', 'Grade 8', 'Grade 9'] },
  { label: 'Senior School', options: ['Grade 10', 'Grade 11'] },
]

const EMPTY_FORM = {
  full_name: '', admission_number: '', class: '', stream: '',
  date_of_birth: '', gender: '', phone: '', email: '',
  nationality: '', county: '', sub_county: '', ward: '',
  previous_school: '', day_boarding: '',
  nemis_number: '', upi_number: '', birth_cert_number: '',
  parent_name: '', parent_phone: '', parent_email: '',
  medical_conditions: '', allergies: '', blood_group: '',
}

const PAGE_SIZE = 10

/* ─── Summary Card ─── */
function SummaryCard({ icon, label, value, color }) {
  return (
    <div className="adm-card" role="status">
      <div className="adm-card-icon" style={{ background: `${color}10`, color }}>
        {icon}
      </div>
      <div className="adm-card-content">
        <span className="adm-card-value">{value}</span>
        <span className="adm-card-label">{label}</span>
      </div>
    </div>
  )
}

/* ─── Status Badge ─── */
function StatusBadge({ status }) {
  const map = {
    active: 'adm-badge--active',
    alumni: 'adm-badge--alumni',
    transferred: 'adm-badge--transferred',
  }
  return (
    <span className={`adm-badge ${map[status] || 'adm-badge--active'}`}>
      {status || 'unknown'}
    </span>
  )
}

export default function Admissions({ onSuccess }) {
  const { profile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [creatingLogins, setCreatingLogins] = useState(false)
  const [loginResult, setLoginResult] = useState('')
  const [existingLogins, setExistingLogins] = useState(new Set())

  useEffect(() => { fetchStudents() }, [])

  const fetchStudents = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('created_at', { ascending: false })
    setStudents(data || [])

    if (data && data.length > 0) {
      const emails = data.filter(s => s.email).map(s => s.email)
      if (emails.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('email')
          .in('email', emails)
          .eq('role', 'student')
        setExistingLogins(new Set((profiles || []).map(p => p.email)))
      }
    }
    setLoading(false)
  }

  const stats = useMemo(() => ({
    total: students.length,
    active: students.filter(s => s.status === 'active').length,
    transferred: students.filter(s => s.status === 'transferred').length,
    alumni: students.filter(s => s.status === 'alumni').length,
  }), [students])

  const filtered = useMemo(() => {
    let list = students
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        (s.full_name || '').toLowerCase().includes(q) ||
        (s.admission_number || '').toLowerCase().includes(q) ||
        (s.class || '').toLowerCase().includes(q)
      )
    }
    if (statusFilter) list = list.filter(s => s.status === statusFilter)
    return list
  }, [students, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => { setPage(1) }, [search, statusFilter])

  const generateAdmNumber = async () => {
    // Read-only next-number preview (server-side, correct per school+year).
    try {
      return await generateAdmissionNumber(profile.school_id)
    } catch {
      return ''
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')

    if (!form.full_name.trim()) { setError('Full name is required'); setSaving(false); return }
    if (!form.class) { setError('Class is required'); setSaving(false); return }

    const now = new Date().toISOString()
    const admNumber = form.admission_number || null

    const payload = {
      school_id: profile.school_id,
      admission_number: admNumber,
      full_name: form.full_name.trim(),
      class: form.class,
      stream: form.stream || null,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      phone: form.phone || null,
      email: form.email || null,
      nationality: form.nationality || null,
      home_address: null,
      county: form.county || null,
      sub_county: form.sub_county || null,
      ward: form.ward || null,
      previous_school: form.previous_school || null,
      day_boarding: form.day_boarding || null,
      nemis_number: form.nemis_number || null,
      upi_number: form.upi_number || null,
      birth_cert_number: form.birth_cert_number || null,
      medical_conditions: form.medical_conditions || null,
      allergies: form.allergies || null,
      blood_group: form.blood_group || null,
      photo_url: null,
      parent_name: form.parent_name || null,
      parent_phone: form.parent_phone || null,
      parent_email: form.parent_email || null,
      status: 'active',
      created_by: profile?.id,
      created_at: now,
      updated_at: now,
    }

    try {
      const { data: inserted, error: insertError } = await supabase
        .from('students')
        .insert(payload)
        .select('admission_number')
        .single()
      if (insertError) throw insertError

      const assigned = inserted?.admission_number || admNumber || ''

      if (form.email) {
        try {
          await createStudentAuth({ full_name: form.full_name.trim(), email: form.email }, profile.school_id)
        } catch (authErr) {
          setSuccess(`Admitted "${form.full_name}" — ${assigned} (Login account: ${authErr.message})`)
        }
      }

      setSuccess(`Admitted "${form.full_name}" — ${assigned}${form.email ? ' (login created)' : ''}`)
      const adm = await generateAdmNumber()
      setForm({ ...EMPTY_FORM, admission_number: adm })
      fetchStudents()
      if (onSuccess) onSuccess()
    } catch (err) { setError(err.message) }
    setSaving(false)
  }

  const handleClear = async () => {
    const adm = await generateAdmNumber()
    setForm({ ...EMPTY_FORM, admission_number: adm })
    setError(''); setSuccess('')
  }

  const handleExport = () => {
    const rows = [['Admission Number', 'Full Name', 'Class', 'Stream', 'Status', 'Date']]
    filtered.forEach(s => rows.push([
      s.admission_number, s.full_name, s.class || '', s.stream || '', s.status || '',
      s.created_at ? new Date(s.created_at).toLocaleDateString() : '',
    ]))
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'admissions.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const setFormField = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleBulkCreateLogins = async () => {
    setCreatingLogins(true); setLoginResult('')
    try {
      const result = await bulkCreateStudentAuth(profile.school_id)
      setLoginResult(`Created ${result.created}. Reset ${result.reset}. ${result.skipped} failed.`)
      fetchStudents()
    } catch (err) { setLoginResult(err.message) }
    setCreatingLogins(false)
  }

  const handleCreateSingleLogin = async (student) => {
    if (!student.email) { setLoginResult(`${student.full_name}: no email address`); return }
    try {
      await createStudentAuth(student, profile.school_id)
      setExistingLogins(prev => new Set([...prev, student.email]))
      setLoginResult(`Login created for ${student.full_name}. A temporary password has been generated and provided via email.`)
    } catch (err) { setLoginResult(`${student.full_name}: ${err.message}`) }
  }

  return (
    <div className="adm-root">
      {/* Actions Row */}
      <div className="adm-actions-row">
        <div className="adm-actions-left">
          <button className="adm-btn adm-btn--outline adm-btn--sm" onClick={handleExport}>
            <Download size={14} /> Export
          </button>
          <button className="adm-btn adm-btn--outline adm-btn--sm" onClick={fetchStudents}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="adm-btn adm-btn--primary adm-btn--sm" onClick={handleBulkCreateLogins} disabled={creatingLogins}>
            <Key size={14} /> {creatingLogins ? 'Creating...' : 'Create All Logins'}
          </button>
        </div>
      </div>

      {loginResult && <div className="adm-alert adm-alert--success" role="status"><Key size={14} /> {loginResult}
        <button onClick={() => setLoginResult('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
      </div>}

      {/* Summary */}
      <div className="adm-summary" role="region" aria-label="Admissions statistics">
        <SummaryCard icon={<Users size={20} />} label="Total Students" value={stats.total} color="#2563EB" />
        <SummaryCard icon={<UserCheck size={20} />} label="Active" value={stats.active} color="#16A34A" />
        <SummaryCard icon={<ArrowUpCircle size={20} />} label="Transferred" value={stats.transferred} color="#F59E0B" />
        <SummaryCard icon={<GraduationCap size={20} />} label="Alumni" value={stats.alumni} color="#7C3AED" />
      </div>

      {/* Alerts */}
      {error && <div className="adm-alert adm-alert--error" role="alert"><AlertCircle size={14} /> {error}</div>}
      {success && <div className="adm-alert adm-alert--success" role="status"><CheckCircle size={14} /> {success}</div>}

      {/* 40/60 Layout */}
      <div className="adm-layout">
        {/* LEFT — Quick Admission Form (40%) */}
        <div className="adm-form-card">
          <div className="adm-form-header">
            <h3>Quick Admission</h3>
            <span className="adm-form-sub">{currentTerm || 'New'} {currentYear}</span>
          </div>
          <form onSubmit={handleSubmit} className="adm-form">
            {/* Personal Details */}
            <div className="adm-section-label">Personal Details</div>
            <div className="adm-form-grid">
              <div className="adm-field adm-field--full">
                <label>Full Name <span className="adm-required">*</span></label>
                <input required placeholder="e.g. Jane Wanjiku Kamau" value={form.full_name} onChange={e => setFormField('full_name', e.target.value)} />
              </div>
              <div className="adm-field">
                <label>Admission No.</label>
                <div className="adm-input-row">
                  <input placeholder="Auto-generated" value={form.admission_number} onChange={e => setFormField('admission_number', e.target.value)} />
                  <button type="button" className="adm-btn-auto" onClick={async () => { const adm = await generateAdmNumber(); setFormField('admission_number', adm) }}>Auto</button>
                </div>
              </div>
              <div className="adm-field">
                <label>Date of Birth</label>
                <input type="date" value={form.date_of_birth} onChange={e => setFormField('date_of_birth', e.target.value)} />
              </div>
              <div className="adm-field">
                <label>Gender</label>
                <select value={form.gender} onChange={e => setFormField('gender', e.target.value)}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div className="adm-field">
                <label>Nationality</label>
                <input placeholder="e.g. Kenyan" value={form.nationality} onChange={e => setFormField('nationality', e.target.value)} />
              </div>
            </div>

            {/* Contact Information */}
            <div className="adm-section-label">Contact Information</div>
            <div className="adm-form-grid">
              <div className="adm-field">
                <label>Phone</label>
                <input placeholder="0712 345 678" value={form.phone} onChange={e => setFormField('phone', e.target.value)} />
              </div>
              <div className="adm-field">
                <label>Email</label>
                <input type="email" placeholder="student@email.com" value={form.email} onChange={e => setFormField('email', e.target.value)} />
              </div>
              <div className="adm-field">
                <label>County</label>
                <input placeholder="e.g. Nairobi" value={form.county} onChange={e => setFormField('county', e.target.value)} />
              </div>
              <div className="adm-field">
                <label>Sub County</label>
                <input placeholder="e.g. Kasarani" value={form.sub_county} onChange={e => setFormField('sub_county', e.target.value)} />
              </div>
              <div className="adm-field">
                <label>Ward</label>
                <input placeholder="e.g. Roysambu" value={form.ward} onChange={e => setFormField('ward', e.target.value)} />
              </div>
            </div>

            {/* Academic Information */}
            <div className="adm-section-label">Academic Information</div>
            <div className="adm-form-grid">
              <div className="adm-field">
                <label>Class <span className="adm-required">*</span></label>
                <select required value={form.class} onChange={e => setFormField('class', e.target.value)}>
                  <option value="">Select class</option>
                  {CLASS_GROUPS.map(g => (
                    <optgroup key={g.label} label={g.label}>
                      {g.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="adm-field">
                <label>Stream</label>
                <input placeholder="e.g. East" value={form.stream} onChange={e => setFormField('stream', e.target.value)} />
              </div>
              <div className="adm-field">
                <label>Day / Boarding</label>
                <select value={form.day_boarding} onChange={e => setFormField('day_boarding', e.target.value)}>
                  <option value="">Select</option>
                  <option value="day">Day Scholar</option>
                  <option value="boarding">Boarding</option>
                </select>
              </div>
              <div className="adm-field">
                <label>Previous School</label>
                <input placeholder="Previous school" value={form.previous_school} onChange={e => setFormField('previous_school', e.target.value)} />
              </div>
            </div>

            {/* Parent / Guardian */}
            <div className="adm-section-label">Parent / Guardian</div>
            <div className="adm-form-grid">
              <div className="adm-field adm-field--full">
                <label>Parent Name</label>
                <input placeholder="e.g. John Kamau" value={form.parent_name} onChange={e => setFormField('parent_name', e.target.value)} />
              </div>
              <div className="adm-field">
                <label>Parent Phone</label>
                <input placeholder="0712 345 678" value={form.parent_phone} onChange={e => setFormField('parent_phone', e.target.value)} />
              </div>
              <div className="adm-field">
                <label>Parent Email</label>
                <input type="email" placeholder="parent@email.com" value={form.parent_email} onChange={e => setFormField('parent_email', e.target.value)} />
              </div>
            </div>

            {/* Footer */}
            <div className="adm-form-footer">
              <button type="button" className="adm-btn adm-btn--outline" onClick={handleClear}>
                <X size={14} /> Clear
              </button>
              <button type="submit" className="adm-btn adm-btn--primary" disabled={saving}>
                <Save size={14} /> {saving ? 'Admitting...' : 'Save Admission'}
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT — Recent Admissions (60%) */}
        <div className="adm-recent-card">
          <div className="adm-recent-header">
            <h3>Recent Admissions</h3>
            <span className="adm-recent-count">{filtered.length} student{filtered.length === 1 ? '' : 's'}</span>
          </div>

          {/* Filters */}
          <div className="adm-filters">
            <div className="adm-search-wrap">
              <Search size={14} className="adm-search-icon" />
              <input
                className="adm-search-input"
                placeholder="Search by name, adm no, class..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select className="adm-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="transferred">Transferred</option>
              <option value="alumni">Alumni</option>
            </select>
            <button className="adm-btn adm-btn--outline adm-btn--sm" onClick={fetchStudents}>
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="adm-loading">Loading...</div>
          ) : paginated.length === 0 ? (
            <div className="adm-empty">
              <Users size={40} color="#CBD5E1" />
              <p>No admissions found</p>
              <span>{search || statusFilter ? 'Try adjusting your filters' : 'Students will appear here once admitted'}</span>
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th className="adm-th--adm">Admission No.</th>
                    <th className="adm-th--name">Name</th>
                    <th className="adm-th--class">Class</th>
                    <th className="adm-th--status">Status</th>
                    <th className="adm-th--action">Login</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(s => (
                    <tr key={s.id}>
                      <td className="adm-td-mono">{s.admission_number || '—'}</td>
                      <td className="adm-td-name">{s.full_name}</td>
                      <td>{s.class || '—'}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td>
                        {s.email && !existingLogins.has(s.email) ? (
                          <button className="adm-btn adm-btn--ghost adm-btn--xs" onClick={() => handleCreateSingleLogin(s)} title="Create login account">
                            <Key size={12} /> Login
                          </button>
                        ) : s.email ? (
                          <span className="adm-td-mono" style={{ fontSize: '0.75rem', color: '#16A34A' }}>✓ Has login</span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>No email</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div className="adm-pagination">
              <span className="adm-page-info">
                Page {page} of {totalPages}
              </span>
              <div className="adm-page-btns">
                <button className="adm-btn adm-btn--icon adm-btn--xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft size={14} />
                </button>
                <button className="adm-btn adm-btn--icon adm-btn--xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
