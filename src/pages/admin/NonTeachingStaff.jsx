import { useState, useEffect } from 'react'
import {
  Users, Plus, Search, X, Save, Edit, Trash2,
  Phone, Mail, AlertTriangle, CheckCircle, Filter,
  Briefcase, Building2, User
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import './NonTeachingStaff.css'

const DEPARTMENTS = ['Administration', 'Finance', 'Kitchen', 'Transport', 'Security', 'Maintenance', 'ICT', 'HR', 'Cleaning', 'Other']
const EMPLOYMENT_TYPES = ['permanent', 'contract', 'casual', 'intern']
const STATUSES = ['active', 'on_leave', 'terminated']
const CURRENT_YEAR = new Date().getFullYear()

const STATUS_META = {
  active: { label: 'Active', color: 'green' },
  on_leave: { label: 'On Leave', color: 'amber' },
  terminated: { label: 'Terminated', color: 'red' },
}

const EMPTY_FORM = {
  full_name: '', email: '', phone: '', employee_number: '',
  job_title: '', department: '', gender: '', date_of_birth: '',
  date_of_hire: '', salary: '', employment_type: 'permanent',
  qualification: '', status: 'active', notes: '',
}

export default function NonTeachingStaff() {
  const { profile } = useAuthStore()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [showProfile, setShowProfile] = useState(false)

  useEffect(() => { fetchStaff() }, [])

  const fetchStaff = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('non_teaching_staff')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('full_name')
    setStaff(data || [])
    setLoading(false)
  }

  const genEmployeeNo = () => `NTS/${CURRENT_YEAR}/${String(staff.length + 1).padStart(3, '0')}`

  const filtered = staff.filter(s => {
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!(s.full_name || '').toLowerCase().includes(q) &&
          !(s.employee_number || '').toLowerCase().includes(q) &&
          !(s.job_title || '').toLowerCase().includes(q)) return false
    }
    if (filterDept !== 'all' && s.department !== filterDept) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    return true
  })

  const stats = {
    total: staff.length,
    active: staff.filter(s => s.status === 'active').length,
    on_leave: staff.filter(s => s.status === 'on_leave').length,
    terminated: staff.filter(s => s.status === 'terminated').length,
  }

  const openAdd = () => {
    setEditTarget(null)
    setForm({ ...EMPTY_FORM, employee_number: genEmployeeNo() })
    setError(''); setShowModal(true)
  }

  const openEdit = (s) => {
    setEditTarget(s)
    setForm({
      full_name: s.full_name || '', email: s.email || '', phone: s.phone || '',
      employee_number: s.employee_number || '', job_title: s.job_title || '',
      department: s.department || '', gender: s.gender || '',
      date_of_birth: s.date_of_birth || '', date_of_hire: s.date_of_hire || '',
      salary: s.salary || '', employment_type: s.employment_type || 'permanent',
      qualification: s.qualification || '', status: s.status || 'active',
      notes: s.notes || '',
    })
    setError(''); setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    if (!form.full_name.trim()) { setError('Full name is required'); setSaving(false); return }

    const payload = {
      school_id: profile.school_id,
      full_name: form.full_name.trim(),
      employee_number: form.employee_number || genEmployeeNo(),
      job_title: form.job_title || null,
      department: form.department || null,
      email: form.email || null,
      phone: form.phone || null,
      gender: form.gender || null,
      date_of_birth: form.date_of_birth || null,
      date_of_hire: form.date_of_hire || null,
      salary: form.salary ? parseFloat(form.salary) : null,
      employment_type: form.employment_type,
      status: form.status,
      qualification: form.qualification || null,
      notes: form.notes || null,
    }

    let err
    if (editTarget) {
      const { error: e } = await supabase.from('non_teaching_staff').update(payload).eq('id', editTarget.id)
      err = e
    } else {
      const { error: e } = await supabase.from('non_teaching_staff').insert(payload)
      err = e
    }

    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); setShowModal(false); setForm({ ...EMPTY_FORM }); fetchStaff()
  }

  const handleDelete = async (s) => {
    if (!confirm(`Delete ${s.full_name}?`)) return
    await supabase.from('non_teaching_staff').delete().eq('id', s.id)
    fetchStaff()
  }

  const cycleStatus = async (s) => {
    const next = s.status === 'active' ? 'on_leave' : s.status === 'on_leave' ? 'terminated' : 'active'
    await supabase.from('non_teaching_staff').update({ status: next }).eq('id', s.id)
    fetchStaff()
  }

  const setF = (field, val) => setForm(prev => ({ ...prev, [field]: val }))

  return (
    <div className="nts-root">
      {/* Summary Cards */}
      <div className="nts-summary">
        <div className="nts-stat-card"><p className="nts-stat-val" style={{ color: '#2563eb' }}>{stats.total}</p><p className="nts-stat-lbl">Total Staff</p></div>
        <div className="nts-stat-card"><p className="nts-stat-val" style={{ color: '#16a34a' }}>{stats.active}</p><p className="nts-stat-lbl">Active</p></div>
        <div className="nts-stat-card"><p className="nts-stat-val" style={{ color: '#d97706' }}>{stats.on_leave}</p><p className="nts-stat-lbl">On Leave</p></div>
        <div className="nts-stat-card"><p className="nts-stat-val" style={{ color: '#dc2626' }}>{stats.terminated}</p><p className="nts-stat-lbl">Terminated</p></div>
      </div>

      {/* Toolbar */}
      <div className="nts-toolbar">
        <div className="nts-search-wrap">
          <Search size={14} className="nts-search-icon" />
          <input className="nts-search" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="nts-filter" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
          <option value="all">All Departments</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="nts-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>)}
        </select>
        <button className="nts-btn-primary" onClick={openAdd}><Plus size={14} /> Add Staff</button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="nts-loading">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="nts-empty">
          <Users size={40} color="#CBD5E1" />
          <p>No non-teaching staff found</p>
          <span>{search || filterDept !== 'all' || filterStatus !== 'all' ? 'Try adjusting your filters' : 'Click "Add Staff" to get started'}</span>
        </div>
      ) : (
        <div className="nts-table-wrap">
          <table className="nts-table">
            <thead>
              <tr>
                <th>Employee No.</th>
                <th>Full Name</th>
                <th>Job Title</th>
                <th>Department</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td className="nts-mono">{s.employee_number || '—'}</td>
                  <td className="nts-name-cell">
                    <div className="nts-avatar">{(s.full_name || '?')[0].toUpperCase()}</div>
                    <span>{s.full_name}</span>
                  </td>
                  <td>{s.job_title || '—'}</td>
                  <td>{s.department || '—'}</td>
                  <td>{s.phone || '—'}</td>
                  <td>
                    <button className={`nts-badge nts-badge--${STATUS_META[s.status]?.color || 'green'}`} onClick={() => cycleStatus(s)} title="Click to cycle status">
                      {STATUS_META[s.status]?.label || s.status}
                    </button>
                  </td>
                  <td>
                    <div className="nts-actions">
                      <button className="nts-btn-icon" onClick={() => { setSelectedStaff(s); setShowProfile(true) }} title="View Profile"><User size={14} /></button>
                      <button className="nts-btn-icon" onClick={() => openEdit(s)} title="Edit"><Edit size={14} /></button>
                      <button className="nts-btn-icon nts-btn-icon--del" onClick={() => handleDelete(s)} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="nts-overlay" onClick={() => setShowModal(false)}>
          <div className="nts-modal" onClick={e => e.stopPropagation()}>
            <div className="nts-modal-header">
              <h3>{editTarget ? 'Edit Staff' : 'Add Non-Teaching Staff'}</h3>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            {error && <div className="nts-alert nts-alert--error"><AlertTriangle size={14} /> {error}</div>}
            <form onSubmit={handleSubmit} className="nts-modal-body">
              <div className="nts-form-grid">
                <div className="nts-field nts-field--full">
                  <label>Full Name <span className="nts-required">*</span></label>
                  <input required value={form.full_name} onChange={e => setF('full_name', e.target.value)} placeholder="e.g. John Mwangi" />
                </div>
                <div className="nts-field">
                  <label>Employee Number</label>
                  <input value={form.employee_number} onChange={e => setF('employee_number', e.target.value)} placeholder="Auto-generated" />
                </div>
                <div className="nts-field">
                  <label>Job Title</label>
                  <input value={form.job_title} onChange={e => setF('job_title', e.target.value)} placeholder="e.g. Driver, Cook, Security Guard" />
                </div>
                <div className="nts-field">
                  <label>Department</label>
                  <select value={form.department} onChange={e => setF('department', e.target.value)}>
                    <option value="">Select</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="nts-field">
                  <label>Employment Type</label>
                  <select value={form.employment_type} onChange={e => setF('employment_type', e.target.value)}>
                    {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div className="nts-field">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} placeholder="email@example.com" />
                </div>
                <div className="nts-field">
                  <label>Phone</label>
                  <input value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="0712 345 678" />
                </div>
                <div className="nts-field">
                  <label>Gender</label>
                  <select value={form.gender} onChange={e => setF('gender', e.target.value)}>
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div className="nts-field">
                  <label>Date of Birth</label>
                  <input type="date" value={form.date_of_birth} onChange={e => setF('date_of_birth', e.target.value)} />
                </div>
                <div className="nts-field">
                  <label>Date of Hire</label>
                  <input type="date" value={form.date_of_hire} onChange={e => setF('date_of_hire', e.target.value)} />
                </div>
                <div className="nts-field">
                  <label>Salary (KES)</label>
                  <input type="number" min="0" value={form.salary} onChange={e => setF('salary', e.target.value)} placeholder="0" />
                </div>
                <div className="nts-field">
                  <label>Qualification</label>
                  <input value={form.qualification} onChange={e => setF('qualification', e.target.value)} placeholder="e.g. KCSE, Diploma" />
                </div>
                <div className="nts-field">
                  <label>Status</label>
                  <select value={form.status} onChange={e => setF('status', e.target.value)}>
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>)}
                  </select>
                </div>
                <div className="nts-field nts-field--full">
                  <label>Notes</label>
                  <textarea rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Any additional notes..." />
                </div>
              </div>
              <div className="nts-modal-footer">
                <button type="button" className="nts-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="nts-btn-primary" disabled={saving}>
                  <Save size={14} /> {saving ? 'Saving...' : editTarget ? 'Update' : 'Add Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfile && selectedStaff && (
        <div className="nts-overlay" onClick={() => setShowProfile(false)}>
          <div className="nts-modal nts-modal-md" onClick={e => e.stopPropagation()}>
            <div className="nts-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="nts-avatar nts-avatar--lg">{(selectedStaff.full_name || '?')[0].toUpperCase()}</div>
                <div>
                  <h3>{selectedStaff.full_name}</h3>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{selectedStaff.employee_number}</span>
                </div>
              </div>
              <button onClick={() => setShowProfile(false)}><X size={18} /></button>
            </div>
            <div className="nts-modal-body">
              <div className="nts-profile-grid">
                {[
                  { label: 'Job Title', value: selectedStaff.job_title },
                  { label: 'Department', value: selectedStaff.department },
                  { label: 'Email', value: selectedStaff.email },
                  { label: 'Phone', value: selectedStaff.phone },
                  { label: 'Gender', value: selectedStaff.gender },
                  { label: 'Date of Birth', value: selectedStaff.date_of_birth },
                  { label: 'Date of Hire', value: selectedStaff.date_of_hire },
                  { label: 'Employment Type', value: selectedStaff.employment_type },
                  { label: 'Salary', value: selectedStaff.salary ? `KES ${Number(selectedStaff.salary).toLocaleString()}` : null },
                  { label: 'Qualification', value: selectedStaff.qualification },
                  { label: 'Status', value: STATUS_META[selectedStaff.status]?.label || selectedStaff.status },
                  { label: 'Notes', value: selectedStaff.notes },
                ].map(item => item.value ? (
                  <div key={item.label} className="nts-profile-item">
                    <span className="nts-profile-lbl">{item.label}</span>
                    <span className="nts-profile-val">{item.value}</span>
                  </div>
                ) : null)}
              </div>
            </div>
            <div className="nts-modal-footer">
              <button className="nts-btn-secondary" onClick={() => setShowProfile(false)}>Close</button>
              <button className="nts-btn-primary" onClick={() => { setShowProfile(false); openEdit(selectedStaff) }}><Edit size={14} /> Edit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
