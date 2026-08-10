import { useState, useEffect } from 'react'
import {
  ClipboardList, CheckCircle, XCircle, Clock, Calendar,
  ChevronLeft, ChevronRight, TrendingUp
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function AttendancePage({ student }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
  const [summary, setSummary] = useState({ present: 0, absent: 0, late: 0, total: 0 })

  useEffect(() => {
    if (student?.id) {
      fetchAttendance()
      fetchSummary()
    }
  }, [student?.id, filterDate])

  const fetchAttendance = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('student_id', student.id)
      .eq('date', filterDate)
      .order('created_at', { ascending: false })
    setRecords(data || [])
    setLoading(false)
  }

  const fetchSummary = async () => {
    const present = await supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('student_id', student.id).eq('status', 'present')
    const absent = await supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('student_id', student.id).eq('status', 'absent')
    const late = await supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('student_id', student.id).eq('status', 'late')
    setSummary({
      present: present.count || 0,
      absent: absent.count || 0,
      late: late.count || 0,
      total: (present.count || 0) + (absent.count || 0) + (late.count || 0),
    })
  }

  const changeDate = (days) => {
    const d = new Date(filterDate)
    d.setDate(d.getDate() + days)
    setFilterDate(d.toISOString().split('T')[0])
  }

  const rate = summary.total > 0 ? Math.round((summary.present / summary.total) * 100) : 0
  const formattedDate = new Date(filterDate + 'T00:00:00').toLocaleDateString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  if (loading && records.length === 0 && summary.total === 0) {
    return (
      <div className="sp-loading-container">
        <div className="sp-loading-spinner" />
        <p>Loading attendance...</p>
      </div>
    )
  }

  return (
    <div className="sp-page">
      <div className="sp-stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#f0fdf4', color: '#16a34a' }}><CheckCircle size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#16a34a' }}>{summary.present}</p>
            <p className="sp-stat-label">Present</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#fef2f2', color: '#dc2626' }}><XCircle size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#dc2626' }}>{summary.absent}</p>
            <p className="sp-stat-label">Absent</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#fefce8', color: '#ca8a04' }}><Clock size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#ca8a04' }}>{summary.late}</p>
            <p className="sp-stat-label">Late</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#eff6ff', color: '#2563eb' }}><TrendingUp size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#2563eb' }}>{rate}%</p>
            <p className="sp-stat-label">Attendance Rate</p>
          </div>
        </div>
      </div>

      <div className="sp-toolbar">
        <div className="sp-date-nav">
          <button className="sp-icon-btn" onClick={() => changeDate(-1)}><ChevronLeft size={16} /></button>
          <input
            type="date"
            className="sp-date-input"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
          />
          <button className="sp-icon-btn" onClick={() => changeDate(1)}><ChevronRight size={16} /></button>
        </div>
      </div>
      <p className="sp-date-label">
        <Calendar size={13} /> {formattedDate}
        {filterDate === new Date().toISOString().split('T')[0] && <span className="sp-badge">Today</span>}
      </p>

      <div className="sp-card">
        <div className="sp-card-header">
          <h3><ClipboardList size={16} /> Attendance Record</h3>
          {records.length > 0 && <span className="sp-badge">{records.length} entr{records.length !== 1 ? 'ies' : 'y'}</span>}
        </div>
        {records.length === 0 ? (
          <div className="sp-empty-state">
            <ClipboardList size={40} color="#94a3b8" />
            <p>No attendance record for this date</p>
          </div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Recorded At</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td>
                      <span className={`sp-status-badge ${r.status}`}>
                        {r.status === 'present' && <CheckCircle size={12} />}
                        {r.status === 'absent' && <XCircle size={12} />}
                        {r.status === 'late' && <Clock size={12} />}
                        {r.status}
                      </span>
                    </td>
                    <td>
                      {r.created_at
                        ? new Date(r.created_at).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
