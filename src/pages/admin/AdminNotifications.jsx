import { useState, useEffect } from 'react'
import {
  Bell, Plus, Trash2, Calendar, User, Send, X, Megaphone,
  AlertTriangle, Info, BookOpen, Search, RefreshCw,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

const CATEGORIES = [
  { value: 'general', label: 'General', icon: <Megaphone size={14} />, color: '#64748b' },
  { value: 'urgent', label: 'Urgent', icon: <AlertTriangle size={14} />, color: '#dc2626' },
  { value: 'event', label: 'Event', icon: <Calendar size={14} />, color: '#2563eb' },
  { value: 'academic', label: 'Academic', icon: <BookOpen size={14} />, color: '#16a34a' },
  { value: 'message', label: 'Message', icon: <Info size={14} />, color: '#7c3aed' },
  { value: 'other', label: 'Other', icon: <Info size={14} />, color: '#94a3b8' },
]

const AUDIENCES = ['all', 'teachers', 'parents', 'students', 'staff']

const CATEGORY_ICON = {
  urgent: <AlertTriangle size={16} />,
  event: <Calendar size={16} />,
  academic: <BookOpen size={16} />,
  message: <Info size={16} />,
  general: <Megaphone size={16} />,
  other: <Info size={16} />,
}

const emptyForm = { title: '', body: '', category: 'general', target_audience: 'all' }

export default function AdminNotifications() {
  const { profile } = useAuthStore()
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterAudience, setFilterAudience] = useState('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(null)

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

  useEffect(() => {
    if (!profile?.school_id) return
    fetchNotices()
  }, [profile])

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('notices')
      .insert({
        school_id: profile.school_id,
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category,
        target_audience: form.target_audience,
        created_by: profile.id,
      })
    if (!error) {
      setForm(emptyForm)
      setShowForm(false)
      await fetchNotices()
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this notice?')) return
    await supabase.from('notices').delete().eq('id', id)
    await fetchNotices()
  }

  const filtered = notices.filter(n => {
    if (filterCategory !== 'all' && n.category !== filterCategory) return false
    if (filterAudience !== 'all' && n.target_audience !== filterAudience) return false
    if (search) {
      const q = search.toLowerCase()
      if (!n.title?.toLowerCase().includes(q) && !n.body?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const getCategoryMeta = (cat) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[0]

  const formatDate = (d) => {
    const dt = new Date(d)
    return dt.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const formatTime = (d) => {
    const dt = new Date(d)
    return dt.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) return <div className="adm-notif-loading">Loading notifications...</div>

  return (
    <div className="adm-notif-page">
      <div className="adm-notif-toolbar">
        <div className="adm-notif-toolbar-left">
          <span className="adm-notif-count">{filtered.length} notice{filtered.length !== 1 ? 's' : ''}</span>
          <div className="adm-notif-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search notices..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="adm-notif-filter-select"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select
            className="adm-notif-filter-select"
            value={filterAudience}
            onChange={e => setFilterAudience(e.target.value)}
          >
            <option value="all">All Audiences</option>
            {AUDIENCES.map(a => <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>)}
          </select>
        </div>
        <div className="adm-notif-toolbar-right">
          <button className="adm-notif-btn-secondary" onClick={fetchNotices}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="adm-notif-btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? <X size={14} /> : <Plus size={14} />}
            {showForm ? 'Cancel' : 'New Notice'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="adm-notif-create-form">
          <h4><Send size={16} /> Create Notice</h4>
          <div className="adm-notif-form-row">
            <div className="adm-notif-form-group" style={{ flex: 2 }}>
              <label>Title</label>
              <input
                type="text"
                placeholder="Notice title"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="adm-notif-form-group">
              <label>Category</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="adm-notif-form-group">
              <label>Audience</label>
              <select
                value={form.target_audience}
                onChange={e => setForm({ ...form, target_audience: e.target.value })}
              >
                {AUDIENCES.map(a => <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="adm-notif-form-group">
            <label>Body</label>
            <textarea
              rows={3}
              placeholder="Notice content..."
              value={form.body}
              onChange={e => setForm({ ...form, body: e.target.value })}
            />
          </div>
          <div className="adm-notif-form-actions">
            <button
              className="adm-notif-btn-primary"
              onClick={handleCreate}
              disabled={saving || !form.title.trim()}
            >
              <Send size={14} /> {saving ? 'Sending...' : 'Send Notice'}
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="adm-notif-empty">
          <Bell size={40} />
          <p>No notices found</p>
          <span>Click "New Notice" to create one</span>
        </div>
      ) : (
        <div className="adm-notif-list">
          {filtered.map(n => {
            const cat = getCategoryMeta(n.category)
            const isExpanded = expanded === n.id
            return (
              <div
                key={n.id}
                className={`adm-notif-card ${isExpanded ? 'expanded' : ''}`}
              >
                <div className="adm-notif-card-top" onClick={() => setExpanded(isExpanded ? null : n.id)}>
                  <div className="adm-notif-card-icon" style={{ background: `${cat.color}14`, color: cat.color }}>
                    {CATEGORY_ICON[n.category] || <Megaphone size={16} />}
                  </div>
                  <div className="adm-notif-card-body">
                    <div className="adm-notif-card-header">
                      <h4>{n.title}</h4>
                      <div className="adm-notif-card-badges">
                        <span className="adm-notif-badge" style={{ background: `${cat.color}14`, color: cat.color }}>
                          {cat.label}
                        </span>
                        <span className="adm-notif-badge adm-notif-badge-audience">
                          {n.target_audience === 'all' ? 'Everyone' : n.target_audience}
                        </span>
                      </div>
                    </div>
                    {n.body && !isExpanded && (
                      <p className="adm-notif-card-preview">{n.body.length > 100 ? n.body.slice(0, 100) + '...' : n.body}</p>
                    )}
                    {n.body && isExpanded && (
                      <p className="adm-notif-card-full">{n.body}</p>
                    )}
                    <div className="adm-notif-card-meta">
                      <span><Calendar size={12} /> {formatDate(n.created_at)} at {formatTime(n.created_at)}</span>
                      {n.profiles?.full_name && <span><User size={12} /> {n.profiles.full_name}</span>}
                    </div>
                  </div>
                  <button
                    className="adm-notif-delete"
                    onClick={(e) => { e.stopPropagation(); handleDelete(n.id) }}
                    title="Delete notice"
                  >
                    <Trash2 size={14} />
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
