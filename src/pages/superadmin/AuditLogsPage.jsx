import { useState, useEffect } from 'react'
import {
  History, Search, Filter, School, User, Clock,
  Plus, Edit, Trash2, Ban, CheckCircle
} from 'lucide-react'
import { fetchAuditLogs, AUDIT_ACTIONS } from '../../features/audit/auditService'
import './AuditLogsPage.css'

const ACTION_META = {
  'school.onboarded':  { label: 'Onboarded',  icon: Plus,       color: '#16a34a' },
  'school.edited':     { label: 'Edited',     icon: Edit,       color: '#2563eb' },
  'school.deleted':    { label: 'Deleted',    icon: Trash2,     color: '#ef4444' },
  'school.suspended':  { label: 'Suspended',  icon: Ban,        color: '#ca8a04' },
  'school.reactivated': { label: 'Reactivated', icon: CheckCircle, color: '#16a34a' },
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadLogs()
  }, [actionFilter])

  const loadLogs = async () => {
    setLoading(true)
    const data = await fetchAuditLogs({ action: actionFilter || undefined, search: search || undefined })
    setLogs(data)
    setLoading(false)
  }

  const handleSearch = (e) => {
    e.preventDefault()
    loadLogs()
  }

  return (
    <div className="audit-page">
      <div className="audit-filters">
        <div className="audit-filter-group">
          <Filter size={14} />
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">All Actions</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>{ACTION_META[a]?.label || a}</option>
            ))}
          </select>
        </div>
        <form onSubmit={handleSearch} className="audit-search">
          <Search size={14} />
          <input
            placeholder="Search school or admin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
      </div>

      {loading ? (
        <div className="loading-state">Loading audit logs...</div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <History size={32} />
          <p>No audit logs found</p>
        </div>
      ) : (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>School</th>
                <th>Action</th>
                <th>Performed By</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const meta = ACTION_META[log.action] || { label: log.action, icon: History, color: '#64748b' }
                const ActionIcon = meta.icon
                return (
                  <tr key={log.id}>
                    <td className="audit-time">
                      <Clock size={12} />
                      {new Date(log.performed_at).toLocaleString('en-KE', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="audit-school">
                      <School size={14} />
                      {log.schools?.name || <span className="text-muted">—</span>}
                    </td>
                    <td>
                      <span className="audit-action-badge" style={{ background: `${meta.color}15`, color: meta.color }}>
                        <ActionIcon size={12} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="audit-admin">
                      <User size={14} />
                      {log.profiles?.full_name || <span className="text-muted">Unknown</span>}
                    </td>
                    <td className="audit-details">
                      {log.details && Object.keys(log.details).length > 0
                        ? <code>{JSON.stringify(log.details)}</code>
                        : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
