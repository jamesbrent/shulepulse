import { useState, useEffect } from 'react'
import { Bell, Calendar, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function NoticesPage({ school }) {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)

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

  if (loading) return <p className="loading-state">Loading notices...</p>

  return (
    <div className="notices-page">
      {notices.length === 0 ? (
        <div className="empty-att">
          <Bell size={40} color="#cbd5e1" />
          <p>No notices yet</p>
          <span>School notices and announcements will appear here</span>
        </div>
      ) : (
        <div className="notices-list-full">
          {notices.map(n => (
            <div key={n.id} className="notice-card-full">
              <div className="notice-card-header">
                <h3>{n.title}</h3>
              </div>
              <p className="notice-content">{n.body}</p>
              <div className="notice-meta">
                <span><Calendar size={12} /> {new Date(n.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                {n.profiles?.full_name && <span><User size={12} /> {n.profiles.full_name}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
