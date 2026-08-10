import { useState, useEffect } from 'react'
import { Bell, Calendar, User, Filter, Megaphone, Info, AlertTriangle, BookOpen } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const READ_KEY = 'sp_read_notices'

function getReadIds() {
  try { return JSON.parse(localStorage.getItem(READ_KEY) || '[]') } catch { return [] }
}

function markRead(id) {
  const ids = getReadIds()
  if (!ids.includes(id)) {
    ids.push(id)
    localStorage.setItem(READ_KEY, JSON.stringify(ids))
  }
}

const CATEGORY_ICONS = {
  urgent: <AlertTriangle size={16} />,
  event: <Calendar size={16} />,
  academic: <BookOpen size={16} />,
  message: <Info size={16} />,
  general: <Megaphone size={16} />,
  other: <Info size={16} />,
}

export default function NoticesPage({ school }) {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('all')
  const [refresh, setRefresh] = useState(0)
  const readIds = getReadIds()

  useEffect(() => {
    if (!school?.id) { setLoading(false); return }
    fetchNotices()
  }, [school?.id, refresh])

  const fetchNotices = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('notices')
      .select('*, profiles(full_name)')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false })
    setNotices(data || [])
    setLoading(false)
  }

  const categories = ['all', ...new Set(notices.map(n => n.category).filter(Boolean))]
  const filtered = category === 'all' ? notices : notices.filter(n => n.category === category)
  const unreadCount = notices.filter(n => !readIds.includes(n.id)).length

  if (loading) return (
    <div className="sp-loading-container">
      <div className="sp-loading-spinner" />
      <p>Loading notices...</p>
    </div>
  )

  return (
    <div className="sp-page">
      <div className="sp-toolbar">
        <div className="sp-toolbar-left">
          <span className="sp-badge">{filtered.length} notice{filtered.length !== 1 ? 's' : ''}</span>
          {unreadCount > 0 && <span className="sp-badge sp-badge-danger">{unreadCount} new</span>}
        </div>
        {categories.length > 1 && (
          <div className="sp-toolbar-right">
            <Filter size={15} color="#94a3b8" />
            <select
              className="sp-select"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {categories.map(c => (
                <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="sp-card">
          <div className="sp-empty-state">
            <Bell size={40} color="#94a3b8" />
            <p>No notices yet</p>
          </div>
        </div>
      ) : (
        <div className="sp-notice-list">
          {filtered.map(n => {
            const isUnread = !readIds.includes(n.id)
            return (
              <div
                key={n.id}
                className={`sp-notice-card ${isUnread ? 'unread' : ''}`}
                onClick={() => markRead(n.id)}
              >
                <div className="sp-notice-header">
                  <div className="sp-notice-title-wrap">
                    {CATEGORY_ICONS[n.category] || <Megaphone size={16} />}
                    <h4>{n.title}</h4>
                    {isUnread && <span className="sp-unread-dot" />}
                  </div>
                  {n.category && <span className="sp-chip">{n.category}</span>}
                </div>
                {n.body && <p className="sp-notice-body">{n.body}</p>}
                <div className="sp-notice-meta">
                  <span>
                    <Calendar size={12} />
                    {new Date(n.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {n.profiles?.full_name && (
                    <span><User size={12} /> {n.profiles.full_name}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
