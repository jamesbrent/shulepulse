import { useState, useEffect } from 'react'
import { MessageSquare, Bell, Calendar } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function MessagesPage({ school }) {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const schoolId = school?.id

  useEffect(() => {
    if (!schoolId) return
    supabase
      .from('notices')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('fetchNotices:', error)
        setNotices(data || [])
        setLoading(false)
      })
  }, [schoolId])

  return (
    <div className="notices-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <MessageSquare size={22} color="#2563eb" />
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Messages</h2>
      </div>
      {loading ? (
        <p className="loading-state">Loading messages...</p>
      ) : notices.length === 0 ? (
        <div className="empty-att">
          <Bell size={40} color="#cbd5e1" />
          <p>No messages yet</p>
          <span>School notices and announcements will appear here</span>
        </div>
      ) : (
        <div className="notices-list-full">
          {notices.map(n => (
            <div key={n.id} className="notice-card-full">
              <div className="notice-card-header">
                <h3>{n.title}</h3>
                {n.category && <span className={`notice-priority ${n.category.toLowerCase()}`}>{n.category}</span>}
              </div>
              <p className="notice-content">{n.body}</p>
              <div className="notice-meta">
                <span><Calendar size={12} /> {new Date(n.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
