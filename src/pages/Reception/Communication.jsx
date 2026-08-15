import { useState, useEffect } from 'react'
import { Bell, Plus, X, Send, Tag, Users, Calendar, User, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const CATEGORIES = [
  { value: 'general', label: 'General', color: '#64748b' },
  { value: 'academic', label: 'Academic', color: '#2563eb' },
  { value: 'event', label: 'Event', color: '#7c3aed' },
  { value: 'urgent', label: 'Urgent', color: '#dc2626' },
  { value: 'message', label: 'Message', color: '#0891b2' },
  { value: 'other', label: 'Other', color: '#ca8a04' },
]

const AUDIENCES = [
  { value: 'all', label: 'All Users' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'parents', label: 'Parents' },
  { value: 'students', label: 'Students' },
  { value: 'staff', label: 'Staff Only' },
]

export default function Communication({ profile }) {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', body: '', category: 'general', target_audience: 'all', priority: 'normal' })
  const [filterCategory, setFilterCategory] = useState('all')

  useEffect(() => {
    if (profile?.school_id) fetchNotices()
  }, [profile])

  const fetchNotices = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('notices')
      .select('*, profiles(full_name)')
      .eq('school_id', profile.school_id)
      .order('created_at', { ascending: false })
      .limit(100)
    setNotices(data || [])
    setLoading(false)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.body.trim()) return
    setCreating(true)
    setError('')
    const user = (await supabase.auth.getUser()).data.user
    const { error } = await supabase.from('notices').insert({
      school_id: profile.school_id,
      title: form.title.trim(),
      body: form.body.trim(),
      content: form.body.trim(),
      category: form.category,
      target_audience: form.target_audience,
      priority: form.priority,
      created_by: user?.id,
    })
    setCreating(false)
    if (error) {
      setError(error.message)
      return
    }
    setForm({ title: '', body: '', category: 'general', target_audience: 'all', priority: 'normal' })
    setShowForm(false)
    fetchNotices()
  }

  const handleDelete = async (n) => {
    if (!window.confirm('Delete this notice?')) return
    const { error } = await supabase.from('notices').delete().eq('id', n.id)
    if (!error) fetchNotices()
  }

  const getCategoryInfo = (cat) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[0]
  const filtered = filterCategory === 'all' ? notices : notices.filter(n => n.category === filterCategory)

  if (loading) return <div className="rcp-load"><div className="rcp-spin" /><span>Loading notices...</span></div>

  return (
    <div className="rcp-page">
      <div className="rcp-page-toolbar">
        <p className="rcp-page-toolbar-desc">Publish school-wide communication visible to parents, students and staff</p>
        <div className="rcp-page-toolbar-actions">
          <button className="rcp-btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New Notice</>}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rcp-card">
          <div className="rcp-card-hdr"><h3><Send size={16} /> Create New Notice</h3></div>
          {error && <div className="rcp-form-error">{error}</div>}
          <form onSubmit={handleCreate}>
            <div className="rcp-form-grid">
              <div className="rcp-form-field">
                <label>Title *</label>
                <input type="text" value={form.title} required
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Notice title..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="rcp-form-field">
                  <label><Tag size={11} /> Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="rcp-form-field">
                  <label><Users size={11} /> Audience</label>
                  <select value={form.target_audience} onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))}>
                    {AUDIENCES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="rcp-form-field full">
                <label>Message *</label>
                <textarea rows={4} value={form.body} required
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="Write the announcement here..." />
              </div>
            </div>
            <div className="rcp-form-actions">
              <button type="button" className="rcp-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="rcp-btn-primary" disabled={creating || !form.title.trim() || !form.body.trim()}>
                <Send size={14} /> {creating ? 'Publishing...' : 'Publish Notice'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rcp-filters">
        <select className="rcp-filter-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} notice{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rcp-empty">
          <Bell size={40} color="#cbd5e1" />
          <p>No notices yet</p>
          <span>School notices and announcements will appear here</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(n => {
            const catInfo = getCategoryInfo(n.category)
            return (
              <div key={n.id} className="rcp-card" style={{ padding: '18px 22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {n.priority === 'urgent' && <AlertTriangle size={15} color="#dc2626" />}
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{n.title}</h3>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${catInfo.color}15`, color: catInfo.color, textTransform: 'capitalize' }}>
                      {catInfo.label}
                    </span>
                    {n.target_audience && n.target_audience !== 'all' && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#f1f5f9', color: '#64748b', textTransform: 'capitalize' }}>
                        {n.target_audience}
                      </span>
                    )}
                    {n.priority === 'urgent' && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#fee2e2', color: '#dc2626' }}>Urgent</span>
                    )}
                  </div>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.body || n.content}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={12} /> {new Date(n.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {n.profiles?.full_name && (
                    <span style={{ fontSize: 12, color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <User size={12} /> {n.profiles.full_name}
                    </span>
                  )}
                  <button className="rcp-action-btn rcp-action-btn--danger" style={{ marginLeft: 'auto' }} onClick={() => handleDelete(n)}>
                    <X size={12} /> Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
