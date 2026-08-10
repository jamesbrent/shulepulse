import { useState, useEffect } from 'react'
import { X, Send, User, MessageSquare, Clock, ArrowLeft } from 'lucide-react'
import { fetchTicketMessages, replyToTicket, updateTicketStatus } from '../superadmin/supportService'

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'closed']
const PRIORITY_META = {
  low: { label: 'Low', color: '#16a34a', bg: '#dcfce7' },
  medium: { label: 'Medium', color: '#ca8a04', bg: '#fef9c3' },
  high: { label: 'High', color: '#ef4444', bg: '#fef2f2' },
  urgent: { label: 'Urgent', color: '#dc2626', bg: '#fef2f2' },
}

export default function TicketDetailModal({ ticket, onClose, onUpdated }) {
  const [messages, setMessages] = useState([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState(ticket.status)

  useEffect(() => {
    loadMessages()
  }, [ticket.id])

  const loadMessages = async () => {
    const data = await fetchTicketMessages(ticket.id)
    setMessages(data)
  }

  const handleSendReply = async () => {
    if (!reply.trim()) return
    setSending(true)
    try {
      await replyToTicket(ticket.id, reply.trim())
      setReply('')
      await loadMessages()
    } catch (err) {
      console.error(err)
    }
    setSending(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendReply()
    }
  }

  const handleStatusChange = async (newStatus) => {
    try {
      await updateTicketStatus(ticket.id, newStatus)
      setStatus(newStatus)
      onUpdated()
    } catch (err) {
      console.error(err)
    }
  }

  const priority = PRIORITY_META[ticket.priority] || { label: ticket.priority, color: '#64748b', bg: '#f1f5f9' }

  return (
    <div className="onboard-overlay" onClick={onClose}>
      <div className="onboard-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="onboard-header">
          <div className="onboard-header-left">
            <MessageSquare size={20} />
            <h2>{ticket.subject}</h2>
          </div>
          <button className="onboard-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="onboard-body">
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500, background: priority.bg, color: priority.color }}>
              {priority.label}
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />
              {new Date(ticket.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              <User size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />
              {ticket.profiles?.full_name || 'Unknown'}
            </span>
            {ticket.schools?.name && (
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {ticket.schools.name}
              </span>
            )}
          </div>

          {ticket.description && (
            <div style={{
              background: '#f8fafc', borderRadius: 8, padding: '12px 16px',
              marginBottom: 16, fontSize: 14, color: '#374151', lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}>
              {ticket.description}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  style={{
                    padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                    border: 'none', cursor: 'pointer', textTransform: 'capitalize',
                    background: status === s ? '#2563eb' : '#f1f5f9',
                    color: status === s ? '#fff' : '#475569',
                    transition: 'all 0.15s',
                  }}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, maxHeight: 280, overflowY: 'auto' }}>
            {messages.map((m) => (
              <div key={m.id} style={{
                display: 'flex', gap: 10,
                alignSelf: m.sender_id === ticket.created_by ? 'flex-start' : 'flex-end',
                maxWidth: '85%',
              }}>
                <div style={{
                  background: m.sender_id === ticket.created_by ? '#f1f5f9' : '#dbeafe',
                  borderRadius: 10,
                  borderBottomLeftRadius: m.sender_id === ticket.created_by ? 4 : 10,
                  borderBottomRightRadius: m.sender_id === ticket.created_by ? 10 : 4,
                  padding: '10px 14px',
                }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <User size={10} />
                    {m.profiles?.full_name || 'Unknown'}
                  </div>
                  <div style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{m.message}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                    {new Date(m.created_at).toLocaleString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 20 }}>
                No replies yet
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your reply... (Enter to send, Shift+Enter for new line)"
              style={{
                flex: 1, padding: '10px 14px', border: '1px solid #e2e8f0',
                borderRadius: 8, fontSize: 13, outline: 'none', resize: 'none',
                minHeight: 44, maxHeight: 120, fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleSendReply}
              disabled={sending || !reply.trim()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '10px 16px', background: '#2563eb', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                opacity: sending || !reply.trim() ? 0.5 : 1,
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
