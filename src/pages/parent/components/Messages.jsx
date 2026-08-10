import { useState, useEffect } from 'react'
import { MessageSquare, Send, Calendar, User, Paperclip } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

export default function Messages({ activeChild, school }) {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCompose, setShowCompose] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const schoolId = school?.id

  useEffect(() => {
    if (!schoolId) return
    supabase
      .from('notices')
      .select('*')
      .eq('school_id', schoolId)
      .in('category', ['message', 'general', 'announcement'])
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('fetchMessages:', error)
        setNotices(data || [])
        setLoading(false)
      })
  }, [schoolId])

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return
    setSending(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('notices').insert({
      school_id: schoolId,
      title: subject,
      body,
      category: 'message',
      created_by: user.id,
    })
    if (!error) {
      setSubject('')
      setBody('')
      setShowCompose(false)
    }
    setSending(false)
  }

  return (
    <div className="notices-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MessageSquare size={22} color="#2563eb" />
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Messages</h2>
        </div>
        <button className="btn-primary" onClick={() => setShowCompose(!showCompose)}>
          <Send size={15} />
          {showCompose ? 'Cancel' : 'New Message'}
        </button>
      </div>

      {showCompose && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3>Send Message to School</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              className="input-field"
              placeholder="Subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
            <textarea
              className="input-field"
              style={{ minHeight: 100, resize: 'vertical' }}
              placeholder="Type your message..."
              value={body}
              onChange={e => setBody(e.target.value)}
            />
            <button className="btn-primary" onClick={handleSend} disabled={sending}>
              <Send size={15} />
              {sending ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="loading-state">Loading messages...</p>
      ) : notices.length === 0 && !showCompose ? (
        <div className="empty-att">
          <MessageSquare size={40} color="#cbd5e1" />
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
