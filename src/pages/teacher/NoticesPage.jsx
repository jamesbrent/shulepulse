import { useState, useEffect } from 'react'
import { Bell, Calendar, User, Plus, X, Send, Tag, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { NOTICE_CREATE_ROLES } from '../../utils/roles'

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

export default function NoticesPage({ profile }) {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', category: 'general', target_audience: 'all', priority: 'normal' })
  const [filterCategory, setFilterCategory] = useState('all')
  const [userRole, setUserRole] = useState('')

  const canCreateNotice = NOTICE_CREATE_ROLES.includes(userRole)

  useEffect(() => {
    if (!profile?.school_id) return
    fetchUserRole()
    fetchNotices()
  }, [profile])

  const fetchUserRole = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()
    setUserRole(data?.role || '')
  }

  const fetchNotices = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('notices')
      .select('*, profiles(full_name)')
      .eq('school_id', profile.school_id)
      .order('created_at', { ascending: false })

    setNotices(data || [])
    setLoading(false)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.body.trim()) return
    setCreating(true)

    const { error } = await supabase.from('notices').insert({
      school_id: profile.school_id,
      title: form.title.trim(),
      body: form.body.trim(),
      category: form.category,
      target_audience: form.target_audience,
      created_by: (await supabase.auth.getUser()).data.user.id,
    })

    setCreating(false)
    if (!error) {
      setForm({ title: '', body: '', category: 'general', target_audience: 'all', priority: 'normal' })
      setShowForm(false)
      fetchNotices()
    }
  }

  const getCategoryInfo = (cat) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[0]
  const filtered = filterCategory === 'all' ? notices : notices.filter(n => n.category === filterCategory)

  if (loading) return <p className="loading-state">Loading notices...</p>

  return (
    <div className="notices-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="filter-select"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            style={{ height: 36, fontSize: 13 }}
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {notices.length > 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} notice{filtered.length !== 1 ? 's' : ''}</span>}
        </div>
        {canCreateNotice && (
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              borderRadius: 8, border: 'none', background: showForm ? '#e2e8f0' : '#2563eb',
              color: showForm ? '#475569' : '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New Notice</>}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
          padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Send size={16} color="#2563eb" /> Create New Notice
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Notice title..."
                required
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                  fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Tag size={12} /> Category
                </label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={12} /> Audience
                </label>
                <select
                  value={form.target_audience}
                  onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}
                >
                  {AUDIENCES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Message *</label>
            <textarea
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Write your notice here..."
              required
              rows={4}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Priority:</label>
            {['normal', 'urgent'].map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setForm(f => ({ ...f, priority: p }))}
                style={{
                  padding: '5px 14px', borderRadius: 6, border: `1.5px solid ${form.priority === p ? (p === 'urgent' ? '#dc2626' : '#2563eb') : '#e2e8f0'}`,
                  background: form.priority === p ? (p === 'urgent' ? '#fee2e2' : '#eff6ff') : '#fff',
                  color: form.priority === p ? (p === 'urgent' ? '#dc2626' : '#2563eb') : '#64748b',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={creating || !form.title.trim() || !form.body.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
                borderRadius: 8, border: 'none', background: creating ? '#93c5fd' : '#2563eb',
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer',
              }}
            >
              <Send size={14} /> {creating ? 'Publishing...' : 'Publish Notice'}
            </button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <div className="empty-att">
          <Bell size={40} color="#cbd5e1" />
          <p>No notices yet</p>
          <span>School notices and announcements will appear here</span>
        </div>
      ) : (
        <div className="notices-list-full">
          {filtered.map(n => {
            const catInfo = getCategoryInfo(n.category)
            return (
              <div key={n.id} className={`notice-card-full ${n.priority === 'urgent' ? 'urgent' : ''}`}>
                <div className="notice-card-header">
                  <div className="notice-title-row">
                    {n.priority === 'urgent' && <span className="urgent-icon">&#9888;</span>}
                    <h3>{n.title}</h3>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                      background: `${catInfo.color}15`, color: catInfo.color, textTransform: 'capitalize',
                    }}>
                      {catInfo.label}
                    </span>
                    {n.target_audience && n.target_audience !== 'all' && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                        background: '#f1f5f9', color: '#64748b', textTransform: 'capitalize',
                      }}>
                        {n.target_audience}
                      </span>
                    )}
                  </div>
                </div>
                <p className="notice-content">{n.body || n.content}</p>
                <div className="notice-meta">
                  <span><Calendar size={12} /> {new Date(n.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  {n.profiles?.full_name && <span><User size={12} /> {n.profiles.full_name}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
