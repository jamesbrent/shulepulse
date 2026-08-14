import { useState, useEffect } from 'react'
import { UserPlus, Plus, X, Search, ChevronRight, Eye, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

const PIPELINE = [
  { value: 'enquiry', label: 'Enquiry', cls: 'rcp-badge--blue' },
  { value: 'applied', label: 'Applied', cls: 'rcp-badge--purple' },
  { value: 'documents_received', label: 'Documents Received', cls: 'rcp-badge--amber' },
  { value: 'admitted', label: 'Admitted', cls: 'rcp-badge--green' },
  { value: 'withdrawn', label: 'Withdrawn', cls: 'rcp-badge--gray' },
  { value: 'rejected', label: 'Rejected', cls: 'rcp-badge--red' },
]

const NEXT_STAGE = {
  enquiry: 'applied',
  applied: 'documents_received',
  documents_received: 'admitted',
}

const SOURCES = ['Walk-in', 'Phone call', 'Website / Online form', 'Referral', 'School tour', 'Open day', 'Other']

const CLASS_OPTIONS = ['PP1', 'PP2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9']

export default function Admissions({ onChanged }) {
  const { profile } = useAuthStore()
  const [prospects, setProspects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    full_name: '', date_of_birth: '', gender: '', guardian_name: '',
    guardian_phone: '', guardian_email: '', class_of_interest: '',
    previous_school: '', source: '', notes: '',
  })
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('all')
  const [showDetail, setShowDetail] = useState(null)
  const [existingStudents, setExistingStudents] = useState(new Set())

  useEffect(() => {
    if (profile?.school_id) {
      fetchProspects()
      fetchExistingStudents()
    }
  }, [profile])

  const fetchProspects = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('prospective_students')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('created_at', { ascending: false })
      .limit(200)
    setProspects(data || [])
    setLoading(false)
  }

  const fetchExistingStudents = async () => {
    const { data } = await supabase
      .from('students')
      .select('full_name')
      .eq('school_id', profile.school_id)
      .eq('status', 'active')
    setExistingStudents(new Set((data || []).map(s => s.full_name.toLowerCase())))
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.full_name.trim()) return
    setCreating(true)
    setError('')
    const user = (await supabase.auth.getUser()).data.user
    const { error } = await supabase.from('prospective_students').insert({
      school_id: profile.school_id,
      full_name: form.full_name.trim(),
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      guardian_name: form.guardian_name || null,
      guardian_phone: form.guardian_phone || null,
      guardian_email: form.guardian_email || null,
      class_of_interest: form.class_of_interest || null,
      previous_school: form.previous_school || null,
      source: form.source || null,
      notes: form.notes || null,
      status: 'enquiry',
      created_by: user?.id,
    })
    setCreating(false)
    if (error) {
      setError(error.message)
      return
    }
    setForm({ full_name: '', date_of_birth: '', gender: '', guardian_name: '', guardian_phone: '', guardian_email: '', class_of_interest: '', previous_school: '', source: '', notes: '' })
    setShowForm(false)
    fetchProspects()
    if (onChanged) onChanged()
  }

  const advanceStage = async (p) => {
    const next = NEXT_STAGE[p.status]
    if (!next) return
    const { error } = await supabase
      .from('prospective_students')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', p.id)
    if (!error) {
      fetchProspects()
      if (onChanged) onChanged()
    }
  }

  const setStage = async (p, status) => {
    const { error } = await supabase
      .from('prospective_students')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', p.id)
    if (!error) {
      fetchProspects()
      if (onChanged) onChanged()
    }
  }

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete admission record for ${p.full_name}?`)) return
    const { error } = await supabase.from('prospective_students').delete().eq('id', p.id)
    if (!error) {
      fetchProspects()
      if (onChanged) onChanged()
    }
  }

  const filtered = prospects.filter(p => {
    const q = search.toLowerCase()
    const matchesSearch = !q || [p.full_name, p.guardian_name, p.guardian_phone, p.class_of_interest, p.previous_school, p.source]
      .some(f => (f || '').toLowerCase().includes(q))
    const matchesStage = filterStage === 'all' || p.status === filterStage
    return matchesSearch && matchesStage
  })

  const counts = PIPELINE.reduce((acc, s) => ({ ...acc, [s.value]: prospects.filter(p => p.status === s.value).length }), {})

  if (loading) return <div className="rcp-load"><div className="rcp-spin" /><span>Loading admissions pipeline...</span></div>

  return (
    <div className="rcp-page">
      <div className="rcp-page-header">
        <div>
          <h2>Admissions Pipeline</h2>
          <p>Track prospective students from first enquiry to admission handover to the Registrar</p>
        </div>
        <div className="rcp-page-header-actions">
          <button className="rcp-btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New Inquiry</>}
          </button>
        </div>
      </div>

      <div className="rcp-stat-grid">
        {PIPELINE.filter(s => s.value !== 'withdrawn' && s.value !== 'rejected').map(s => (
          <div key={s.value} className="rcp-stat">
            <span className="rcp-stat-val" style={{ color: s.cls === 'rcp-badge--blue' ? '#1D4ED8' : s.cls === 'rcp-badge--purple' ? '#6D28D9' : s.cls === 'rcp-badge--amber' ? '#B45309' : '#16A34A' }}>{counts[s.value]}</span>
            <span className="rcp-stat-lbl">{s.label}</span>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="rcp-card">
          <div className="rcp-card-hdr"><h3><UserPlus size={16} /> Record New Admission Inquiry</h3></div>
          {error && <div className="rcp-form-error">{error}</div>}
          <form onSubmit={handleCreate}>
            <div className="rcp-form-grid">
              <div className="rcp-form-field">
                <label>Prospective Student Name *</label>
                <input type="text" value={form.full_name} required
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Full name of the child" />
              </div>
              <div className="rcp-form-field">
                <label>Date of Birth</label>
                <input type="date" value={form.date_of_birth}
                  onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
              </div>
              <div className="rcp-form-field">
                <label>Gender</label>
                <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                  <option value="">Select...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="rcp-form-field">
                <label>Class of Interest</label>
                <select value={form.class_of_interest} onChange={e => setForm(f => ({ ...f, class_of_interest: e.target.value }))}>
                  <option value="">Select class...</option>
                  {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="rcp-form-field">
                <label>Guardian Name</label>
                <input type="text" value={form.guardian_name}
                  onChange={e => setForm(f => ({ ...f, guardian_name: e.target.value }))}
                  placeholder="Parent / guardian" />
              </div>
              <div className="rcp-form-field">
                <label>Guardian Phone</label>
                <input type="tel" value={form.guardian_phone}
                  onChange={e => setForm(f => ({ ...f, guardian_phone: e.target.value }))}
                  placeholder="07XX XXX XXX" />
              </div>
              <div className="rcp-form-field">
                <label>Guardian Email</label>
                <input type="email" value={form.guardian_email}
                  onChange={e => setForm(f => ({ ...f, guardian_email: e.target.value }))}
                  placeholder="name@example.com" />
              </div>
              <div className="rcp-form-field">
                <label>Previous School</label>
                <input type="text" value={form.previous_school}
                  onChange={e => setForm(f => ({ ...f, previous_school: e.target.value }))} />
              </div>
              <div className="rcp-form-field">
                <label>Inquiry Source</label>
                <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                  <option value="">Select source...</option>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="rcp-form-field full">
                <label>Notes</label>
                <textarea rows={2} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Reason for inquiry, conversation summary..." />
              </div>
            </div>
            <div className="rcp-form-actions">
              <button type="button" className="rcp-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="rcp-btn-primary" disabled={creating}>
                {creating ? 'Saving...' : 'Save Inquiry'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rcp-filters">
        <div className="rcp-search-wrap">
          <Search size={15} className="rcp-search-icon" />
          <input className="rcp-search-input" placeholder="Search name, guardian, class..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="rcp-filter-select" value={filterStage} onChange={e => setFilterStage(e.target.value)}>
          <option value="all">All Stages</option>
          {PIPELINE.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rcp-empty">
          <UserPlus size={40} color="#cbd5e1" />
          <p>No admission records found</p>
          <span>Record the first inquiry to start the pipeline</span>
        </div>
      ) : (
        <div className="rcp-table-wrap">
          <table className="rcp-table">
            <thead>
              <tr>
                <th>Prospective Student</th>
                <th>Class of Interest</th>
                <th>Guardian</th>
                <th>Source</th>
                <th>Stage</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const stage = PIPELINE.find(s => s.value === p.status) || PIPELINE[0]
                const next = NEXT_STAGE[p.status]
                const isExisting = existingStudents.has((p.full_name || '').toLowerCase())
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="rcp-name-cell">
                        <div className="rcp-avatar-sm">{p.full_name?.[0] || 'P'}</div>
                        <div>
                          {p.full_name}
                          <small>{p.date_of_birth ? `DOB ${new Date(p.date_of_birth + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No DOB'}{isExisting ? ' • Already enrolled' : ''}</small>
                        </div>
                      </div>
                    </td>
                    <td>{p.class_of_interest || '—'}</td>
                    <td>
                      {p.guardian_name || '—'}
                      {p.guardian_phone && <small style={{ display: 'block', color: '#94a3b8' }}>{p.guardian_phone}</small>}
                    </td>
                    <td>{p.source || '—'}</td>
                    <td><span className={`rcp-badge ${stage.cls}`}>{stage.label}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {next && !isExisting && (
                          <button className="rcp-action-btn" onClick={() => advanceStage(p)}>
                            <ChevronRight size={13} /> Move to {PIPELINE.find(s => s.value === next)?.label}
                          </button>
                        )}
                        <button className="rcp-action-btn" onClick={() => setShowDetail(p)}><Eye size={13} /> View</button>
                        <select
                          className="rcp-filter-select"
                          style={{ padding: '5px 6px', fontSize: 12 }}
                          value={p.status}
                          onChange={e => setStage(p, e.target.value)}
                        >
                          {PIPELINE.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <button className="rcp-action-btn rcp-action-btn--danger" onClick={() => handleDelete(p)}><X size={13} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showDetail && (
        <div className="rcp-modal-overlay" onClick={() => setShowDetail(null)}>
          <div className="rcp-modal" onClick={e => e.stopPropagation()}>
            <div className="rcp-modal-header">
              <h3>Admission Record</h3>
              <button className="rcp-modal-close" onClick={() => setShowDetail(null)}><X size={15} /></button>
            </div>
            <div className="rcp-detail-grid">
              <div className="rcp-detail-item"><label>Student</label><span>{showDetail.full_name}</span></div>
              <div className="rcp-detail-item"><label>Date of Birth</label><span>{showDetail.date_of_birth ? new Date(showDetail.date_of_birth + 'T00:00:00').toLocaleDateString('en-KE') : '—'}</span></div>
              <div className="rcp-detail-item"><label>Gender</label><span>{showDetail.gender || '—'}</span></div>
              <div className="rcp-detail-item"><label>Class of Interest</label><span>{showDetail.class_of_interest || '—'}</span></div>
              <div className="rcp-detail-item"><label>Guardian</label><span>{showDetail.guardian_name || '—'}</span></div>
              <div className="rcp-detail-item"><label>Guardian Phone</label><span>{showDetail.guardian_phone || '—'}</span></div>
              <div className="rcp-detail-item"><label>Guardian Email</label><span>{showDetail.guardian_email || '—'}</span></div>
              <div className="rcp-detail-item"><label>Previous School</label><span>{showDetail.previous_school || '—'}</span></div>
              <div className="rcp-detail-item"><label>Source</label><span>{showDetail.source || '—'}</span></div>
              <div className="rcp-detail-item"><label>Status</label><span className="rcp-badge" style={{ alignSelf: 'flex-start' }}>{(PIPELINE.find(s => s.value === showDetail.status) || {}).label || showDetail.status}</span></div>
              <div className="rcp-detail-item"><label>Notes</label><span>{showDetail.notes || '—'}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
