import { useState, useEffect } from 'react'
import { ClipboardList, Plus, X, Search, Send, Phone, Users, BookOpen, Shield, GraduationCap, HeartPulse, Building2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

const CATEGORIES = [
  { value: 'fees', label: 'Fees / Finance', icon: 'banknote', route: 'Bursar (Finance)' },
  { value: 'academic', label: 'Academic', icon: 'book', route: 'Academic Office' },
  { value: 'library', label: 'Library', icon: 'library', route: 'Librarian' },
  { value: 'discipline', label: 'Discipline', icon: 'shield', route: 'Administrator' },
  { value: 'admission', label: 'Admission', icon: 'graduation', route: 'Registrar (Admissions)' },
  { value: 'medical', label: 'Medical / Sick Bay', icon: 'heart', route: 'Sick Bay' },
  { value: 'administration', label: 'Administration', icon: 'building', route: 'Administrator' },
  { value: 'general', label: 'General', icon: 'clipboard', route: 'Front Office' },
]

const STATUS_STYLE = {
  received: 'rcp-badge--amber',
  routed: 'rcp-badge--blue',
  resolved: 'rcp-badge--green',
  closed: 'rcp-badge--gray',
}

const STATUS_LABEL = {
  received: 'Received',
  routed: 'Routed',
  resolved: 'Resolved',
  closed: 'Closed',
}

const REQUESTER_TYPES = ['visitor', 'parent', 'student', 'staff', 'other']

function CategoryIcon({ name }) {
  const size = 14
  switch (name) {
    case 'banknote': return <Phone size={size} />
    case 'book': return <BookOpen size={size} />
    case 'library': return <BookOpen size={size} />
    case 'shield': return <Shield size={size} />
    case 'graduation': return <GraduationCap size={size} />
    case 'heart': return <HeartPulse size={size} />
    case 'building': return <Building2 size={size} />
    default: return <ClipboardList size={size} />
  }
}

export default function Requests({ onChanged }) {
  const { profile } = useAuthStore()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    requester_name: '', requester_phone: '', requester_type: 'visitor',
    category: 'general', subject: '', description: '', routed_to: '',
  })
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')

  useEffect(() => {
    if (profile?.school_id) fetchRequests()
  }, [profile])

  const fetchRequests = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('front_office_requests')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('created_at', { ascending: false })
      .limit(200)
    setRequests(data || [])
    setLoading(false)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.requester_name.trim() || !form.subject.trim()) return
    setCreating(true)
    setError('')
    const user = (await supabase.auth.getUser()).data.user
    const cat = CATEGORIES.find(c => c.value === form.category) || CATEGORIES[0]
    const { error } = await supabase.from('front_office_requests').insert({
      school_id: profile.school_id,
      requester_name: form.requester_name.trim(),
      requester_phone: form.requester_phone || null,
      requester_type: form.requester_type,
      category: form.category,
      subject: form.subject.trim(),
      description: form.description || null,
      routed_to: form.routed_to || cat.route,
      status: 'received',
      created_by: user?.id,
    })
    setCreating(false)
    if (error) {
      setError(error.message)
      return
    }
    setForm({ requester_name: '', requester_phone: '', requester_type: 'visitor', category: 'general', subject: '', description: '', routed_to: '' })
    setShowForm(false)
    fetchRequests()
    if (onChanged) onChanged()
  }

  const routeTo = async (r, routedTo) => {
    const { error } = await supabase
      .from('front_office_requests')
      .update({ routed_to: routedTo, status: 'routed', updated_at: new Date().toISOString() })
      .eq('id', r.id)
    if (!error) {
      fetchRequests()
      if (onChanged) onChanged()
    }
  }

  const setStatus = async (r, status) => {
    const { error } = await supabase
      .from('front_office_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', r.id)
    if (!error) {
      fetchRequests()
      if (onChanged) onChanged()
    }
  }

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete request "${r.subject}"?`)) return
    const { error } = await supabase.from('front_office_requests').delete().eq('id', r.id)
    if (!error) {
      fetchRequests()
      if (onChanged) onChanged()
    }
  }

  const filtered = requests.filter(r => {
    const q = search.toLowerCase()
    const matchesSearch = !q || [r.requester_name, r.requester_phone, r.subject, r.description, r.routed_to, r.category]
      .some(f => (f || '').toLowerCase().includes(q))
    const matchesStatus = filterStatus === 'all' || r.status === filterStatus
    const matchesCategory = filterCategory === 'all' || r.category === filterCategory
    return matchesSearch && matchesStatus && matchesCategory
  })

  const openCount = requests.filter(r => ['received', 'routed'].includes(r.status)).length

  if (loading) return <div className="rcp-load"><div className="rcp-spin" /><span>Loading requests...</span></div>

  return (
    <div className="rcp-page">
      <div className="rcp-page-header">
        <div>
          <h2>Requests & Routing</h2>
          <p>Log visitor / parent requests and direct them to the right department</p>
        </div>
        <div className="rcp-page-header-actions">
          <span className="rcp-badge rcp-badge--amber"><ClipboardList size={12} /> {openCount} open</span>
          <button className="rcp-btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Log Request</>}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rcp-card">
          <div className="rcp-card-hdr"><h3><ClipboardList size={16} /> Log a Request</h3></div>
          {error && <div className="rcp-form-error">{error}</div>}
          <form onSubmit={handleCreate}>
            <div className="rcp-form-grid">
              <div className="rcp-form-field">
                <label>Requester Name *</label>
                <input type="text" value={form.requester_name} required
                  onChange={e => setForm(f => ({ ...f, requester_name: e.target.value }))} />
              </div>
              <div className="rcp-form-field">
                <label>Phone</label>
                <input type="tel" value={form.requester_phone}
                  onChange={e => setForm(f => ({ ...f, requester_phone: e.target.value }))} />
              </div>
              <div className="rcp-form-field">
                <label>Requester Type</label>
                <select value={form.requester_type} onChange={e => setForm(f => ({ ...f, requester_type: e.target.value }))}>
                  {REQUESTER_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div className="rcp-form-field">
                <label>Category</label>
                <select
                  value={form.category}
                  onChange={e => {
                    const cat = CATEGORIES.find(c => c.value === e.target.value)
                    setForm(f => ({ ...f, category: e.target.value, routed_to: cat?.route || '' }))
                  }}
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="rcp-form-field full">
                <label>Subject *</label>
                <input type="text" value={form.subject} required
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="Short summary, e.g. 'Fee structure enquiry'" />
              </div>
              <div className="rcp-form-field full">
                <label>Description</label>
                <textarea rows={2} value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="More detail about what is being asked" />
              </div>
              <div className="rcp-form-field full">
                <label>Route To</label>
                <input type="text" value={form.routed_to}
                  onChange={e => setForm(f => ({ ...f, routed_to: e.target.value }))}
                  placeholder="Department / office" />
              </div>
            </div>
            <div className="rcp-form-actions">
              <button type="button" className="rcp-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="rcp-btn-primary" disabled={creating}>
                {creating ? 'Logging...' : 'Log Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rcp-filters">
        <div className="rcp-search-wrap">
          <Search size={15} className="rcp-search-icon" />
          <input className="rcp-search-input" placeholder="Search requester, subject, office..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="rcp-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="received">Received</option>
          <option value="routed">Routed</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select className="rcp-filter-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rcp-empty">
          <ClipboardList size={40} color="#cbd5e1" />
          <p>No requests found</p>
          <span>Log visitor and parent requests to keep the front desk organized</span>
        </div>
      ) : (
        <div className="rcp-table-wrap">
          <table className="rcp-table">
            <thead>
              <tr>
                <th>Requester</th>
                <th>Category</th>
                <th>Subject</th>
                <th>Routed To</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const cat = CATEGORIES.find(c => c.value === r.category) || CATEGORIES[0]
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="rcp-name-cell">
                        <div className="rcp-avatar-sm">{r.requester_name?.[0] || 'R'}</div>
                        <div>
                          {r.requester_name}
                          <small>{r.requester_phone || r.requester_type}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="rcp-badge rcp-badge--blue" style={{ textTransform: 'capitalize' }}>
                        <CategoryIcon name={cat.icon} /> {cat.label}
                      </span>
                    </td>
                    <td style={{ maxWidth: 280 }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.subject}</div>
                      {r.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>}
                    </td>
                    <td>{r.routed_to || '—'}</td>
                    <td><span className={`rcp-badge ${STATUS_STYLE[r.status] || 'rcp-badge--gray'}`}>{STATUS_LABEL[r.status] || r.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <select
                          className="rcp-filter-select"
                          style={{ padding: '5px 6px', fontSize: 12 }}
                          value={r.routed_to || ''}
                          onChange={e => routeTo(r, e.target.value)}
                        >
                          <option value="">Route to...</option>
                          {CATEGORIES.map(c => <option key={c.value} value={c.route}>{c.route}</option>)}
                        </select>
                        {r.status !== 'resolved' && r.status !== 'closed' && (
                          <button className="rcp-action-btn" onClick={() => setStatus(r, 'resolved')}>
                            <Send size={13} /> Resolve
                          </button>
                        )}
                        <button className="rcp-action-btn rcp-action-btn--danger" onClick={() => handleDelete(r)}><X size={13} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
