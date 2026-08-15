import { useState, useEffect } from 'react'
import { DoorOpen, Plus, X, Search, LogOut, User, Building2, Phone, StickyNote } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

const DEPARTMENTS = ['Front Office', 'Academic Office', 'Finance / Bursar', 'Administration', 'Library', 'Medical / Sick Bay', 'Other']

const PURPOSE_OPTIONS = [
  'Admission inquiry', 'Fee payment / enquiry', 'Meeting with staff', 'Parent meeting',
  'Deliver documents', 'Library visit', 'Medical / sick bay', 'School visit / tour',
  'Vendor / supplier', 'Maintenance', 'Other',
]

const STATUS_STYLE = {
  checked_in: 'rcp-badge--green',
  checked_out: 'rcp-badge--gray',
}

export default function Visitors({ onChanged }) {
  const { profile } = useAuthStore()
  const [visitors, setVisitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    full_name: '', phone: '', id_number: '', organization: '',
    purpose: '', person_to_see: '', department: '', notes: '',
  })
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showDetail, setShowDetail] = useState(null)

  useEffect(() => {
    if (profile?.school_id) fetchVisitors()
  }, [profile])

  const fetchVisitors = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('visitors')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('created_at', { ascending: false })
      .limit(200)
    setVisitors(data || [])
    setLoading(false)
  }

  const handleCheckIn = async (e) => {
    e.preventDefault()
    if (!form.full_name.trim() || !form.purpose) return
    setCreating(true)
    setError('')
    const user = (await supabase.auth.getUser()).data.user
    const { error } = await supabase.from('visitors').insert({
      school_id: profile.school_id,
      full_name: form.full_name.trim(),
      phone: form.phone || null,
      id_number: form.id_number || null,
      organization: form.organization || null,
      purpose: form.purpose,
      person_to_see: form.person_to_see || null,
      department: form.department || null,
      notes: form.notes || null,
      check_in_at: new Date().toISOString(),
      status: 'checked_in',
      created_by: user?.id,
    })
    setCreating(false)
    if (error) {
      setError(error.message)
      return
    }
    setForm({ full_name: '', phone: '', id_number: '', organization: '', purpose: '', person_to_see: '', department: '', notes: '' })
    setShowForm(false)
    fetchVisitors()
    if (onChanged) onChanged()
  }

  const handleCheckOut = async (v) => {
    const { error } = await supabase
      .from('visitors')
      .update({ status: 'checked_out', check_out_at: new Date().toISOString() })
      .eq('id', v.id)
    if (!error) {
      fetchVisitors()
      if (onChanged) onChanged()
    }
  }

  const handleDelete = async (v) => {
    if (!window.confirm(`Delete visitor record for ${v.full_name}?`)) return
    const { error } = await supabase.from('visitors').delete().eq('id', v.id)
    if (!error) {
      fetchVisitors()
      if (onChanged) onChanged()
    }
  }

  const filtered = visitors.filter(v => {
    const q = search.toLowerCase()
    const matchesSearch = !q || [v.full_name, v.organization, v.purpose, v.person_to_see, v.phone, v.id_number]
      .some(f => (f || '').toLowerCase().includes(q))
    const matchesStatus = filterStatus === 'all' || v.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const onSite = visitors.filter(v => v.status === 'checked_in')

  if (loading) return <div className="rcp-load"><div className="rcp-spin" /><span>Loading visitors...</span></div>

  return (
    <div className="rcp-page">
      <div className="rcp-page-toolbar">
        <p className="rcp-page-toolbar-desc">Record who enters and leaves the school, and why they are here</p>
        <div className="rcp-page-toolbar-actions">
          <span className="rcp-badge rcp-badge--green">
            <DoorOpen size={12} /> {onSite.length} on campus now
          </span>
          <button className="rcp-btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Check In Visitor</>}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rcp-card">
          <div className="rcp-card-hdr">
            <h3><DoorOpen size={16} /> Check In Visitor</h3>
          </div>
          {error && <div className="rcp-form-error">{error}</div>}
          <form onSubmit={handleCheckIn}>
            <div className="rcp-form-grid">
              <div className="rcp-form-field">
                <label>Full Name *</label>
                <input type="text" value={form.full_name} required
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="e.g. James Otieno" />
              </div>
              <div className="rcp-form-field">
                <label>Phone</label>
                <input type="tel" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="07XX XXX XXX" />
              </div>
              <div className="rcp-form-field">
                <label>ID / Passport Number</label>
                <input type="text" value={form.id_number}
                  onChange={e => setForm(f => ({ ...f, id_number: e.target.value }))}
                  placeholder="National ID or passport" />
              </div>
              <div className="rcp-form-field">
                <label>Organization</label>
                <input type="text" value={form.organization}
                  onChange={e => setForm(f => ({ ...f, organization: e.target.value }))}
                  placeholder="Company / institution" />
              </div>
              <div className="rcp-form-field">
                <label>Purpose of Visit *</label>
                <select value={form.purpose} required onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}>
                  <option value="">Select purpose...</option>
                  {PURPOSE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="rcp-form-field">
                <label>Department</label>
                <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="rcp-form-field">
                <label>Person to See</label>
                <input type="text" value={form.person_to_see}
                  onChange={e => setForm(f => ({ ...f, person_to_see: e.target.value }))}
                  placeholder="Name of staff member" />
              </div>
              <div className="rcp-form-field full">
                <label>Notes</label>
                <textarea rows={2} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional context for this visit" />
              </div>
            </div>
            <div className="rcp-form-actions">
              <button type="button" className="rcp-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="rcp-btn-primary" disabled={creating}>
                {creating ? 'Checking in...' : 'Check In'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rcp-filters">
        <div className="rcp-search-wrap">
          <Search size={15} className="rcp-search-icon" />
          <input className="rcp-search-input" placeholder="Search name, org, purpose..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="rcp-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="checked_in">On Campus</option>
          <option value="checked_out">Checked Out</option>
        </select>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rcp-empty">
          <DoorOpen size={40} color="#cbd5e1" />
          <p>No visitors found</p>
          <span>Check in a visitor to start the register</span>
        </div>
      ) : (
        <div className="rcp-table-wrap">
          <table className="rcp-table">
            <thead>
              <tr>
                <th>Visitor</th>
                <th>Organization</th>
                <th>Purpose</th>
                <th>Person to See</th>
                <th>Checked In</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id}>
                  <td>
                    <div className="rcp-name-cell">
                      <div className="rcp-avatar-sm">{v.full_name?.[0] || 'V'}</div>
                      <div>
                        {v.full_name}
                        <small>{v.phone || v.id_number || 'No contact'}</small>
                      </div>
                    </div>
                  </td>
                  <td>{v.organization || '—'}</td>
                  <td>{v.purpose}</td>
                  <td>{v.person_to_see || (v.department ? v.department : '—')}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{v.check_in_at ? new Date(v.check_in_at).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                  <td>
                    <span className={`rcp-badge ${STATUS_STYLE[v.status] || 'rcp-badge--gray'}`}>
                      {v.status === 'checked_in' ? 'On Campus' : 'Checked Out'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="rcp-action-btn" onClick={() => setShowDetail(v)}>
                        <StickyNote size={13} /> View
                      </button>
                      {v.status === 'checked_in' && (
                        <button className="rcp-action-btn" onClick={() => handleCheckOut(v)}>
                          <LogOut size={13} /> Check Out
                        </button>
                      )}
                      <button className="rcp-action-btn rcp-action-btn--danger" onClick={() => handleDelete(v)}>
                        <X size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showDetail && (
        <div className="rcp-modal-overlay" onClick={() => setShowDetail(null)}>
          <div className="rcp-modal" onClick={e => e.stopPropagation()}>
            <div className="rcp-modal-header">
              <h3>Visitor Details</h3>
              <button className="rcp-modal-close" onClick={() => setShowDetail(null)}><X size={15} /></button>
            </div>
            <div className="rcp-detail-grid">
              <div className="rcp-detail-item">
                <label><User size={11} /> Full Name</label>
                <span>{showDetail.full_name}</span>
              </div>
              <div className="rcp-detail-item">
                <label><Phone size={11} /> Phone</label>
                <span>{showDetail.phone || '—'}</span>
              </div>
              <div className="rcp-detail-item">
                <label>ID / Passport</label>
                <span>{showDetail.id_number || '—'}</span>
              </div>
              <div className="rcp-detail-item">
                <label><Building2 size={11} /> Organization</label>
                <span>{showDetail.organization || '—'}</span>
              </div>
              <div className="rcp-detail-item">
                <label>Purpose</label>
                <span>{showDetail.purpose || '—'}</span>
              </div>
              <div className="rcp-detail-item">
                <label>Person to See</label>
                <span>{showDetail.person_to_see || showDetail.department || '—'}</span>
              </div>
              <div className="rcp-detail-item">
                <label>Checked In</label>
                <span>{showDetail.check_in_at ? new Date(showDetail.check_in_at).toLocaleString('en-KE') : '—'}</span>
              </div>
              <div className="rcp-detail-item">
                <label>Checked Out</label>
                <span>{showDetail.check_out_at ? new Date(showDetail.check_out_at).toLocaleString('en-KE') : 'Still on campus'}</span>
              </div>
              <div className="rcp-detail-item">
                <label>Status</label>
                <span className="rcp-badge" style={{ alignSelf: 'flex-start' }}>{showDetail.status === 'checked_in' ? 'On Campus' : 'Checked Out'}</span>
              </div>
              <div className="rcp-detail-item">
                <label>Notes</label>
                <span>{showDetail.notes || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
