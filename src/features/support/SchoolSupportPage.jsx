import { useState, useEffect } from 'react'
import {
  MessageSquare, Plus, Clock, ArrowLeft, Send, Loader,
  ChevronRight, Flag,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { createTicket, fetchSchoolTickets, fetchTicketMessages, replyToTicket } from '../superadmin/supportService'
import './SchoolSupportPage.css'

const STATUS_META = {
  open: { label: 'Open', color: '#2563eb', bg: '#dbeafe' },
  in_progress: { label: 'In Progress', color: '#ca8a04', bg: '#fef9c3' },
  escalated: { label: 'Escalated', color: '#dc2626', bg: '#fef2f2' },
  resolved: { label: 'Resolved', color: '#16a34a', bg: '#dcfce7' },
  closed: { label: 'Closed', color: '#94a3b8', bg: '#f1f5f9' },
}

const PRIORITY_META = {
  low: { label: 'Low', color: '#16a34a', bg: '#dcfce7' },
  medium: { label: 'Medium', color: '#ca8a04', bg: '#fef9c3' },
  high: { label: 'High', color: '#ef4444', bg: '#fef2f2' },
  critical: { label: 'Critical', color: '#dc2626', bg: '#fef2f2' },
}

const CATEGORY_OPTIONS = [
  { value: 'fees_payments', label: 'Fees & Payments' },
  { value: 'student_management', label: 'Student Management' },
  { value: 'exams_cbc', label: 'Exams / CBC' },
  { value: 'report_cards', label: 'Report Cards' },
  { value: 'login_auth', label: 'Login / Authentication' },
  { value: 'parent_portal', label: 'Parent Portal' },
  { value: 'system_bug', label: 'System Bug' },
  { value: 'subscription_billing', label: 'Subscription / Billing' },
  { value: 'other', label: 'Other' },
]

const TABS = [
  { key: 'my_tickets', label: 'My Tickets', icon: <MessageSquare size={15} /> },
  { key: 'create', label: 'Create Ticket', icon: <Plus size={15} /> },
]

function formatId(id) {
  if (!id) return 'SP-?'
  return `SP-${id.toString().substring(0, 6).toUpperCase()}`
}

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
}

export default function SchoolSupportPage() {
  const [activeTab, setActiveTab] = useState('my_tickets')
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailTicket, setDetailTicket] = useState(null)
  const [messages, setMessages] = useState([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState(null)
  const [schoolId, setSchoolId] = useState(null)

  const [form, setForm] = useState({
    subject: '', description: '', category: 'fees_payments', priority: 'medium',
  })
  const [submitting, setSubmitting] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('school_id').eq('id', user.id).single()
      if (data?.school_id) setSchoolId(data.school_id)
    })()
  }, [])

  useEffect(() => {
    if (activeTab === 'my_tickets') loadTickets()
  }, [activeTab])

  async function loadTickets() {
    setLoading(true)
    try {
      const data = await fetchSchoolTickets()
      setTickets(data)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  async function openDetail(ticket) {
    setDetailTicket(ticket)
    setReply('')
    try {
      const data = await fetchTicketMessages(ticket.id)
      setMessages(data)
    } catch (err) { console.error(err) }
  }

  async function handleSendReply() {
    if (!reply.trim() || !detailTicket) return
    setSending(true)
    try {
      await replyToTicket(detailTicket.id, reply.trim())
      setReply('')
      const data = await fetchTicketMessages(detailTicket.id)
      setMessages(data)
      loadTickets()
      showToast('Reply sent')
    } catch (err) { showToast(err.message, 'error') }
    setSending(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.subject.trim()) { showToast('Subject is required', 'error'); return }
    setSubmitting(true)
    try {
      if (!schoolId) { showToast('Could not determine your school', 'error'); setSubmitting(false); return }
      const ticket = await createTicket({
        schoolId,
        subject: form.subject,
        description: form.description,
        category: form.category,
        priority: form.priority,
      })
      showToast(`Ticket ${formatId(ticket.id)} created`)
      setForm({ subject: '', description: '', category: 'fees_payments', priority: 'medium' })
      setActiveTab('my_tickets')
      loadTickets()
    } catch (err) { showToast(err.message, 'error') }
    setSubmitting(false)
  }

  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in_progress' || t.status === 'escalated')
  const resolvedTickets = tickets.filter(t => t.status === 'resolved' || t.status === 'closed')

  const renderMyTickets = () => {
    if (detailTicket) {
      return (
        <div className="ssp-detail">
          <div className="ssp-detail-top">
            <button className="btn-secondary" onClick={() => setDetailTicket(null)}>
              <ArrowLeft size={14} /> Back
            </button>
            <h3>{detailTicket.subject}</h3>
            <span className="ssp-badge" style={{ background: STATUS_META[detailTicket.status]?.bg, color: STATUS_META[detailTicket.status]?.color }}>
              {STATUS_META[detailTicket.status]?.label || detailTicket.status}
            </span>
          </div>

          <div className="ssp-detail-meta">
            <span>ID: <strong>{formatId(detailTicket.id)}</strong></span>
            <span>
              <Flag size={12} />
              <span className="ssp-priority-dot" style={{ background: PRIORITY_META[detailTicket.priority]?.color }} />
              {PRIORITY_META[detailTicket.priority]?.label || detailTicket.priority}
            </span>
            <span><Clock size={12} /> {new Date(detailTicket.created_at).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          {detailTicket.description && (
            <div className="ssp-description">{detailTicket.description}</div>
          )}

          <div className="ssp-conversation">
            <h4>Conversation</h4>
            <div className="ssp-messages">
              {messages.length === 0 ? (
                <div className="empty-state" style={{ padding: 16 }}>No messages yet</div>
              ) : (
                messages.map((m) => {
                  const isSchool = m.sender_id === detailTicket.created_by
                  return (
                    <div key={m.id} className={`ssp-msg ${isSchool ? 'me' : 'them'}`}>
                      <div className="ssp-msg-avatar">
                        {m.profiles?.full_name?.[0] || m.profiles?.email?.[0] || '?'}
                      </div>
                      <div className="ssp-msg-body">
                        <div className="ssp-msg-hdr">
                          <strong>{m.profiles?.full_name || m.profiles?.email || 'Unknown'}</strong>
                          <span>{new Date(m.created_at).toLocaleString('en-KE', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p>{m.message}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {detailTicket.status !== 'closed' && detailTicket.status !== 'resolved' && (
              <div className="ssp-reply">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply() } }}
                  placeholder="Add a comment... (Enter to send)"
                  rows={2}
                />
                <button className="btn-primary" onClick={handleSendReply} disabled={sending || !reply.trim()}>
                  {sending ? <Loader size={14} className="spin" /> : <Send size={14} />} Send
                </button>
              </div>
            )}
          </div>
        </div>
      )
    }

    return (
      <>
        <div className="ssp-ticket-stats">
          <div className="ssp-stat-box">
            <span className="ssp-stat-num">{tickets.length}</span>
            <span className="ssp-stat-lbl">Total</span>
          </div>
          <div className="ssp-stat-box">
            <span className="ssp-stat-num" style={{ color: '#2563eb' }}>{openTickets.length}</span>
            <span className="ssp-stat-lbl">Open</span>
          </div>
          <div className="ssp-stat-box">
            <span className="ssp-stat-num" style={{ color: '#16a34a' }}>{resolvedTickets.length}</span>
            <span className="ssp-stat-lbl">Resolved</span>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="empty-state">
            <MessageSquare size={32} />
            <p>No tickets yet</p>
            <button className="btn-primary" onClick={() => setActiveTab('create')}>
              <Plus size={14} /> Create your first ticket
            </button>
          </div>
        ) : (
          <>
            <div className="ssp-tabs">
              <button className={`ssp-tab ${activeTab === 'my_tickets' ? 'active' : ''}`} onClick={() => { setActiveTab('my_tickets'); setDetailTicket(null) }}>All ({tickets.length})</button>
              <button className={`ssp-tab ${activeTab === 'openTab' ? 'active' : ''}`} onClick={() => { setActiveTab('openTab'); setDetailTicket(null) }}>Open ({openTickets.length})</button>
              <button className={`ssp-tab ${activeTab === 'resolvedTab' ? 'active' : ''}`} onClick={() => { setActiveTab('resolvedTab'); setDetailTicket(null) }}>Resolved ({resolvedTickets.length})</button>
            </div>
            <div className="ssp-table-wrap">
              <table className="ssp-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Subject</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Last Update</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(activeTab === 'openTab' ? openTickets : activeTab === 'resolvedTab' ? resolvedTickets : tickets).map((t) => (
                    <tr key={t.id} className="ssp-clickable" onClick={() => openDetail(t)}>
                      <td className="ssp-id">{formatId(t.id)}</td>
                      <td className="ssp-subject">{t.subject}</td>
                      <td className="ssp-category">{CATEGORY_OPTIONS.find(c => c.value === t.category)?.label || t.category}</td>
                      <td><span className="ssp-badge" style={{ background: STATUS_META[t.status]?.bg, color: STATUS_META[t.status]?.color }}>{STATUS_META[t.status]?.label || t.status}</span></td>
                      <td><span className="ssp-priority" style={{ color: PRIORITY_META[t.priority]?.color }}>{(PRIORITY_META[t.priority]?.label || t.priority)}</span></td>
                      <td className="ssp-time">{timeAgo(t.updated_at || t.created_at)}</td>
                      <td><ChevronRight size={14} className="ssp-chevron" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </>
    )
  }

  const renderCreate = () => (
    <form className="ssp-form" onSubmit={handleSubmit}>
      <h3>Submit a Support Ticket</h3>
      <p className="text-muted">Describe your issue and we'll route it to the right team.</p>

      <div className="ssp-field">
        <label>Subject *</label>
        <input value={form.subject} onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Brief title of the issue" required />
      </div>

      <div className="ssp-field">
        <label>Description</label>
        <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the issue in detail..." rows={4} />
      </div>

      <div className="ssp-row">
        <div className="ssp-field">
          <label>Category</label>
          <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}>
            {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="ssp-field">
          <label>Priority</label>
          <select value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))}>
            {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      <div className="ssp-form-actions">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? <Loader size={14} className="spin" /> : <Send size={14} />}
          Submit Ticket
        </button>
      </div>
    </form>
  )

  return (
    <div className="ssp-root">
      <div className="ssp-nav">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`ssp-nav-btn ${activeTab === t.key || (['openTab', 'resolvedTab'].includes(activeTab) && t.key === 'my_tickets') ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="ssp-content">
        {(activeTab === 'my_tickets' || activeTab === 'openTab' || activeTab === 'resolvedTab') && renderMyTickets()}
        {activeTab === 'create' && renderCreate()}
      </div>

      {toast && (
        <div className="onboard-toast" style={{ background: toast.type === 'error' ? '#ef4444' : '#16a34a' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
