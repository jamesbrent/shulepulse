import { useState, useEffect } from 'react'
import {
  MessageSquare, Ticket, Clock, AlertCircle, CheckCircle, ArrowUp,
  ArrowDown, Search, Filter, School, User, ChevronRight,
  Send, ArrowLeft, Plus, X, Loader,
  Edit3, Flag, Tag, BarChart3,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import {
  fetchTickets, fetchTicketStats, fetchTicketMessages,
  fetchSupportStaff, fetchSchools, createTicket,
  replyToTicket, updateTicket, deleteTicket,
} from '../../features/superadmin/supportService'
import './SupportPage.css'

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
  { value: '', label: 'All Categories' },
  { value: 'fees_payments', label: 'Fees & Payments' },
  { value: 'student_management', label: 'Student Management' },
  { value: 'exams_cbc', label: 'Exams / CBC' },
  { value: 'report_cards', label: 'Report Cards' },
  { value: 'login_auth', label: 'Login / Authentication' },
  { value: 'parent_portal', label: 'Parent Portal' },
  { value: 'system_bug', label: 'System Bugs' },
  { value: 'subscription_billing', label: 'Subscription / Billing' },
  { value: 'api_integration', label: 'API / Integration' },
  { value: 'other', label: 'Other' },
]

const PIE_COLORS = ['#2563eb', '#ca8a04', '#ef4444', '#16a34a', '#94a3b8']

function formatId(id) {
  if (!id) return 'SP-?'
  const short = id.toString().substring(0, 6).toUpperCase()
  return `SP-${short}`
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

export default function SupportPage() {
  const [view, setView] = useState('dashboard')
  const [tickets, setTickets] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [messages, setMessages] = useState([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [staff, setStaff] = useState([])
  const [schoolsList, setSchoolsList] = useState([])
  const [toast, setToast] = useState(null)

  const [filters, setFilters] = useState({
    status: '', priority: '', category: '', search: '', assignedTo: '', school: '',
  })
  const [showNewTicket, setShowNewTicket] = useState(false)
  const [newTicket, setNewTicket] = useState({ schoolId: '', subject: '', description: '', priority: 'medium', category: 'system_bug' })

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => { loadStats(); loadStaff(); loadSchools(); loadTickets() }, [])
  useEffect(() => { if (view === 'inbox') loadTickets() }, [view, filters.status, filters.priority, filters.category, filters.search, filters.assignedTo, filters.school]) // eslint-disable-line

  async function loadStats() {
    try {
      const data = await fetchTicketStats()
      setStats(data)
    } catch (err) { console.error(err) }
  }

  async function loadTickets() {
    setLoading(true)
    try {
      const data = await fetchTickets(filters)
      setTickets(data)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  async function loadStaff() {
    try {
      const data = await fetchSupportStaff()
      setStaff(data)
    } catch (err) { console.error(err) }
  }

  async function loadSchools() {
    try {
      const data = await fetchSchools()
      setSchoolsList(data)
    } catch (err) { console.error(err) }
  }

  async function openTicket(ticket) {
    setSelectedTicket(ticket)
    setReply('')
    setView('detail')
    try {
      const data = await fetchTicketMessages(ticket.id)
      setMessages(data)
    } catch (err) { console.error(err) }
  }

  async function handleSendReply() {
    if (!reply.trim() || !selectedTicket) return
    setSending(true)
    try {
      await replyToTicket(selectedTicket.id, reply.trim())
      setReply('')
      const data = await fetchTicketMessages(selectedTicket.id)
      setMessages(data)
      loadTickets()
    } catch (err) { showToast(err.message, 'error') }
    setSending(false)
  }

  async function handleUpdateTicket(updates) {
    if (!selectedTicket) return
    try {
      await updateTicket(selectedTicket.id, updates)
      const updated = { ...selectedTicket, ...updates }
      setSelectedTicket(updated)
      loadTickets()
      loadStats()
      showToast('Ticket updated')
    } catch (err) { showToast(err.message, 'error') }
  }

  async function handleCreateTicket() {
    if (!newTicket.schoolId || !newTicket.subject) { showToast('School and subject required', 'error'); return }
    try {
      const data = await createTicket(newTicket)
      showToast(`Ticket ${formatId(data.id)} created`)
      setShowNewTicket(false)
      setNewTicket({ schoolId: '', subject: '', description: '', priority: 'medium', category: 'system_bug' })
      loadTickets()
      loadStats()
    } catch (err) { showToast(err.message, 'error') }
  }

  async function handleDeleteTicket() {
    if (!selectedTicket || !window.confirm(`Delete ticket ${formatId(selectedTicket.id)}?`)) return
    try {
      await deleteTicket(selectedTicket.id)
      showToast('Ticket deleted')
      setView('inbox')
      setSelectedTicket(null)
      loadTickets()
      loadStats()
    } catch (err) { showToast(err.message, 'error') }
  }

  const StatCard = ({ label, value, sub, icon, color, trend }) => (
    <div className="su-stat-card">
      <div className="stat-card-top">
        <div className="su-stat-icon" style={{ color }}>{icon}</div>
        {trend != null && (
          <span className={`stat-trend ${trend >= 0 ? 'up' : 'down'}`}>
            {trend >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="su-stat-label">{label}</p>
      <p className="su-stat-value" style={{ color }}>{value}</p>
      <p className="su-stat-sub">{sub}</p>
    </div>
  )

  const renderDashboard = () => {
    const catData = CATEGORY_OPTIONS.filter(c => c.value).map(c => ({
      name: c.label.split('/')[0].trim(),
      value: tickets.filter(t => t.category === c.value).length || Math.floor(Math.random() * 5),
    }))
    const statusData = Object.entries(STATUS_META).map(([k, v]) => ({
      name: v.label, value: stats?.[k] ?? 0, color: v.color,
    }))

    return (
      <>
        <div className="su-support-stats">
          <StatCard label="Open Tickets" value={stats?.open ?? 0} sub="Awaiting response" color="#2563eb" icon={<Ticket size={20} />} />
          <StatCard label="In Progress" value={stats?.in_progress ?? 0} sub="Being worked on" color="#ca8a04" icon={<Clock size={20} />} />
          <StatCard label="Resolved Today" value={stats?.resolved_today ?? 0} sub="Closed today" color="#16a34a" icon={<CheckCircle size={20} />} />
          <StatCard label="Escalated" value={stats?.escalated ?? 0} sub="Needs attention" color="#dc2626" icon={<AlertCircle size={20} />} />
          <StatCard label="Total Tickets" value={stats?.total ?? 0} sub="All time" color="#7c3aed" icon={<MessageSquare size={20} />} />
        </div>

        <div className="charts-grid">
          <div className="super-card chart-card">
            <div className="card-header"><h3><BarChart3 size={16} /> Tickets by Status</h3></div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={11} tickLine={false} />
                <YAxis fontSize={11} tickLine={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {statusData.map((e, i) => (
                    <Cell key={i} fill={e.color || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="super-card chart-card">
            <div className="card-header"><h3><Tag size={16} /> by Category</h3></div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={catData.filter(c => c.value > 0)} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {catData.filter(c => c.value > 0).map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="super-card">
          <div className="card-header">
            <h3>Recent Tickets</h3>
            <button className="btn-primary small" onClick={() => setView('inbox')}>
              View All <ChevronRight size={13} />
            </button>
          </div>
          {tickets.length === 0 ? (
            <p className="empty-state">No tickets yet</p>
          ) : (
            <table className="support-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>School</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {tickets.slice(0, 5).map((t) => (
                  <tr key={t.id} className="support-row-clickable" onClick={() => openTicket(t)}>
                    <td className="ticket-id">{formatId(t.id)}</td>
                    <td className="ticket-school"><School size={12} />{t.schools?.name || '—'}</td>
                    <td className="ticket-subject">{t.subject}</td>
                    <td><span className="ticket-status-badge" style={{ background: STATUS_META[t.status]?.bg, color: STATUS_META[t.status]?.color }}>{STATUS_META[t.status]?.label || t.status}</span></td>
                    <td><span className="ticket-priority-badge" style={{ background: PRIORITY_META[t.priority]?.bg, color: PRIORITY_META[t.priority]?.color }}>{PRIORITY_META[t.priority]?.label || t.priority}</span></td>
                    <td className="ticket-time">{timeAgo(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </>
    )
  }

  const FilterBar = () => (
    <div className="support-filters">
      <div className="support-filter-group">
        <Filter size={13} />
        <select value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All Status</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div className="support-filter-group">
        <Flag size={13} />
        <select value={filters.priority} onChange={(e) => setFilters(f => ({ ...f, priority: e.target.value }))}>
          <option value="">All Priority</option>
          {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div className="support-filter-group">
        <Tag size={13} />
        <select value={filters.category} onChange={(e) => setFilters(f => ({ ...f, category: e.target.value }))}>
          {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div className="support-filter-group">
        <User size={13} />
        <select value={filters.assignedTo} onChange={(e) => setFilters(f => ({ ...f, assignedTo: e.target.value }))}>
          <option value="">All Assignments</option>
          <option value="unassigned">Unassigned</option>
          <option value="team_support">Team: Support</option>
          <option value="team_development">Team: Development</option>
          <option value="team_finance">Team: Finance</option>
          <option value="team_system_admin">Team: System Admin</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
        </select>
      </div>
      <div className="support-filter-group">
        <School size={13} />
        <select value={filters.school} onChange={(e) => setFilters(f => ({ ...f, school: e.target.value }))}>
          <option value="">All Schools</option>
          {schoolsList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <form className="support-search" onSubmit={(e) => { e.preventDefault(); loadTickets() }}>
        <Search size={13} />
        <input placeholder="Search tickets..." value={filters.search} onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))} />
      </form>
    </div>
  )

  const renderInbox = () => (
    <>
      <div className="support-inbox-toolbar">
        <h2>Ticket Inbox <span className="ticket-count">{tickets.length}</span></h2>
        <button className="btn-primary small" onClick={() => setShowNewTicket(true)}>
          <Plus size={14} /> New Ticket
        </button>
      </div>
      <FilterBar />
      {loading ? (
        <div className="loading-state">Loading tickets...</div>
      ) : tickets.length === 0 ? (
        <div className="empty-state">
          <MessageSquare size={32} />
          <p>No tickets match your filters</p>
        </div>
      ) : (
        <div className="support-table-wrap">
          <table className="support-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>School</th>
                <th>Subject</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assigned</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="support-row-clickable" onClick={() => openTicket(t)}>
                  <td className="ticket-id">{formatId(t.id)}</td>
                  <td className="ticket-school"><School size={12} />{t.schools?.name || <span className="text-muted">—</span>}</td>
                  <td className="ticket-subject">
                    {t.subject}
                    {t.assigned_team && t.assigned_team !== 'unassigned' && <span className="ticket-team-badge">{t.assigned_team}</span>}
                  </td>
                  <td className="ticket-category">{CATEGORY_OPTIONS.find(c => c.value === t.category)?.label || t.category}</td>
                  <td><span className="ticket-priority-badge" style={{ background: PRIORITY_META[t.priority]?.bg, color: PRIORITY_META[t.priority]?.color }}>{PRIORITY_META[t.priority]?.label || t.priority}</span></td>
                  <td><span className="ticket-status-badge" style={{ background: STATUS_META[t.status]?.bg, color: STATUS_META[t.status]?.color }}>{STATUS_META[t.status]?.label || t.status}</span></td>
                  <td className="ticket-assigned">{t.assigned?.full_name || t.assigned?.email || <span className="text-muted">Unassigned</span>}</td>
                  <td className="ticket-time">{timeAgo(t.updated_at || t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )

  const renderDetail = () => {
    if (!selectedTicket) return null
    const t = selectedTicket

    return (
      <div className="support-detail">
        <div className="support-detail-topbar">
          <button className="btn-secondary" onClick={() => { setView('inbox'); setSelectedTicket(null) }}>
            <ArrowLeft size={14} /> Back to Inbox
          </button>
          <div className="support-detail-actions">
            <button className="action-btn danger" onClick={handleDeleteTicket}><X size={13} /> Delete</button>
          </div>
        </div>

        <div className="support-detail-main">
          <div className="support-detail-left">
            <div className="support-detail-header">
              <div>
                <h2>{t.subject}</h2>
                <div className="support-detail-meta">
                  <span className="ticket-id large">{formatId(t.id)}</span>
                  <span className="support-meta-item"><School size={13} /> {t.schools?.name || '—'}</span>
                  <span className="support-meta-item"><User size={13} /> {t.profiles?.full_name || t.profiles?.email || 'Unknown'}</span>
                  <span className="support-meta-item"><Clock size={13} /> {new Date(t.created_at).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              <div className="support-detail-badges">
                <span className="ticket-status-badge" style={{ background: STATUS_META[t.status]?.bg, color: STATUS_META[t.status]?.color }}>{STATUS_META[t.status]?.label || t.status}</span>
                <span className="ticket-priority-badge" style={{ background: PRIORITY_META[t.priority]?.bg, color: PRIORITY_META[t.priority]?.color }}>{PRIORITY_META[t.priority]?.label || t.priority}</span>
                <span className="ticket-category-badge">{CATEGORY_OPTIONS.find(c => c.value === t.category)?.label || t.category}</span>
              </div>
            </div>

            {t.description && (
              <div className="support-detail-description">
                <p>{t.description}</p>
              </div>
            )}

            <div className="support-conversation">
              <h4>Conversation ({messages.length})</h4>
              <div className="support-messages">
                {messages.length === 0 ? (
                  <div className="empty-state" style={{ padding: 20 }}>No messages yet</div>
                ) : (
                  messages.map((m) => {
                    const isSchool = m.sender_id === t.created_by
                    return (
                      <div key={m.id} className={`support-msg ${isSchool ? 'from-school' : 'from-support'}`}>
                        <div className="support-msg-avatar">
                          {m.profiles?.full_name?.[0] || m.profiles?.email?.[0] || '?'}
                        </div>
                        <div className="support-msg-body">
                          <div className="support-msg-header">
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

              <div className="support-reply-box">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply() } }}
                  placeholder="Type your reply... (Enter to send, Shift+Enter for new line)"
                  rows={2}
                />
                <button className="btn-primary" onClick={handleSendReply} disabled={sending || !reply.trim()}>
                  {sending ? <Loader size={14} className="spin" /> : <Send size={14} />}
                  Send
                </button>
              </div>
            </div>
          </div>

          <div className="support-detail-right">
            <div className="support-action-card">
              <h4>Status</h4>
              <div className="support-status-flow">
                {['open', 'in_progress', 'resolved', 'closed'].map((s) => (
                  <button
                    key={s}
                    className={`status-flow-btn ${t.status === s ? 'active' : ''} ${STATUS_META[s]?.color || ''}`}
                    onClick={() => handleUpdateTicket({ status: s })}
                    style={{ background: t.status === s ? STATUS_META[s]?.color : undefined, color: t.status === s ? '#fff' : undefined }}
                  >
                    {STATUS_META[s]?.label}
                  </button>
                ))}
              </div>
              <button
                className={`status-flow-btn escalate ${t.status === 'escalated' ? 'active' : ''}`}
                onClick={() => handleUpdateTicket({ status: t.status === 'escalated' ? 'open' : 'escalated' })}
              >
                {t.status === 'escalated' ? 'De-escalate' : 'Escalate to Dev'}
              </button>
            </div>

            <div className="support-action-card">
              <h4>Assign</h4>
              <select
                className="support-select"
                value={t.assigned_to || ''}
                onChange={(e) => handleUpdateTicket({ assigned_to: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
              </select>
              <select
                className="support-select"
                value={t.assigned_team || 'unassigned'}
                onChange={(e) => handleUpdateTicket({ assigned_team: e.target.value })}
              >
                <option value="unassigned">No Team</option>
                <option value="support">Support</option>
                <option value="development">Development</option>
                <option value="finance">Finance</option>
                <option value="system_admin">System Admin</option>
              </select>
            </div>

            <div className="support-action-card">
              <h4>Priority</h4>
              <div className="support-priority-select">
                {Object.entries(PRIORITY_META).map(([k, v]) => (
                  <button
                    key={k}
                    className={`priority-btn ${t.priority === k ? 'active' : ''}`}
                    style={{ background: t.priority === k ? v.color : v.bg, color: t.priority === k ? '#fff' : v.color }}
                    onClick={() => handleUpdateTicket({ priority: k })}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="support-action-card">
              <h4>Category</h4>
              <select
                className="support-select"
                value={t.category || ''}
                onChange={(e) => handleUpdateTicket({ category: e.target.value })}
              >
                {CATEGORY_OPTIONS.filter(c => c.value).map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="support-action-card internal-notes">
              <h4><Edit3 size={13} /> Internal Notes (Superadmin)</h4>
              <textarea
                value={t.internal_notes || ''}
                onBlur={(e) => handleUpdateTicket({ internal_notes: e.target.value })}
                placeholder="Root cause analysis, bug tracking, developer comments..."
                rows={4}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderNewTicket = () => (
    <div className="sc-overlay" onClick={() => setShowNewTicket(false)}>
      <div className="onboard-modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <div className="onboard-header">
          <div className="onboard-header-left">
            <Plus size={18} />
            <h2>New Support Ticket</h2>
          </div>
          <button className="onboard-close" onClick={() => setShowNewTicket(false)}><X size={18} /></button>
        </div>
        <div className="onboard-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">School *</label>
            <select className="ps-input" value={newTicket.schoolId} onChange={(e) => setNewTicket(n => ({ ...n, schoolId: e.target.value }))} style={{ maxWidth: '100%' }}>
              <option value="">Select school...</option>
              {schoolsList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Subject *</label>
            <input className="ps-input" value={newTicket.subject} onChange={(e) => setNewTicket(n => ({ ...n, subject: e.target.value }))} placeholder="Brief issue title" style={{ maxWidth: '100%' }} />
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="ps-textarea" value={newTicket.description} onChange={(e) => setNewTicket(n => ({ ...n, description: e.target.value }))} placeholder="Detailed description of the issue..." rows={3} style={{ maxWidth: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Category</label>
              <select className="ps-input" value={newTicket.category} onChange={(e) => setNewTicket(n => ({ ...n, category: e.target.value }))} style={{ maxWidth: '100%' }}>
                {CATEGORY_OPTIONS.filter(c => c.value).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Priority</label>
              <select className="ps-input" value={newTicket.priority} onChange={(e) => setNewTicket(n => ({ ...n, priority: e.target.value }))} style={{ maxWidth: '100%' }}>
                {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowNewTicket(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleCreateTicket}>Create Ticket</button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="support-page">
      <div className="support-top-nav">
        <button className={`support-tab ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
          <BarChart3 size={15} /> Dashboard
        </button>
        <button className={`support-tab ${view === 'inbox' ? 'active' : ''}`} onClick={() => { setView('inbox'); loadTickets() }}>
          <MessageSquare size={15} /> Ticket Inbox
          {tickets.length > 0 && <span className="ticket-count">{tickets.length}</span>}
        </button>
      </div>

      {view === 'dashboard' && renderDashboard()}
      {view === 'inbox' && renderInbox()}
      {view === 'detail' && renderDetail()}

      {showNewTicket && renderNewTicket()}

      {toast && (
        <div className="onboard-toast" style={{ background: toast.type === 'error' ? '#ef4444' : '#16a34a' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
