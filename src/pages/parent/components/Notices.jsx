import { useState, useEffect } from 'react'
import { Bell, Calendar, User, Filter } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

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

export default function Notices({ activeChild, school }) {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('all')
  const readIds = getReadIds()

  useEffect(() => {
    if (!school?.id) return
    fetchNotices()
  }, [school])

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

  if (loading) return <p className="loading-state">Loading notices...</p>

  return (
    <div className="notices-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Bell size={22} color="#2563eb" />
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Notices</h2>
          {unreadCount > 0 && <span className="nav-badge">{unreadCount} new</span>}
        </div>
        {categories.length > 1 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <Filter size={16} color="#94a3b8" />
            <select
              className="input-field"
              style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
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
        <div className="empty-att">
          <Bell size={40} color="#cbd5e1" />
          <p>No notices yet</p>
          <span>School notices and announcements will appear here</span>
        </div>
      ) : (
        <div className="notices-list-full">
          {filtered.map(n => {
            const isUnread = !readIds.includes(n.id)
            return (
              <div
                key={n.id}
                className={`notice-card-full ${isUnread ? 'notice-unread' : ''}`}
                onClick={() => markRead(n.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="notice-card-header">
                  <h3>{n.title}</h3>
                  {n.category && <span className={`notice-priority ${n.category.toLowerCase()}`}>{n.category}</span>}
                  {isUnread && <span className="notice-unread-dot" />}
                </div>
                <p className="notice-content">{n.body}</p>
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
