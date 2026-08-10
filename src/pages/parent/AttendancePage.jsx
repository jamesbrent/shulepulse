import { useState, useEffect } from 'react'
import {
  ClipboardList, CheckCircle, XCircle, Clock, TrendingUp,
  Calendar, ChevronLeft, ChevronRight
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function AttendancePage({ activeChild }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
  const [summary, setSummary] = useState({ present: 0, absent: 0, late: 0, total: 0 })

  useEffect(() => {
    if (activeChild) {
      fetchAttendance()
      fetchSummary()
    }
  }, [activeChild, filterDate])

  const fetchAttendance = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('attendance')
      .select('*, students(full_name, class, admission_number)')
      .eq('student_id', activeChild.id)
      .eq('date', filterDate)
      .order('created_at', { ascending: false })

    setRecords(data || [])
    setLoading(false)
  }

  const fetchSummary = async () => {
    const { count: presentCount } = await supabase
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', activeChild.id)
      .eq('status', 'present')

    const { count: absentCount } = await supabase
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', activeChild.id)
      .eq('status', 'absent')

    const { count: lateCount } = await supabase
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', activeChild.id)
      .eq('status', 'late')

    const total = (presentCount || 0) + (absentCount || 0) + (lateCount || 0)
    setSummary({
      present: presentCount || 0,
      absent: absentCount || 0,
      late: lateCount || 0,
      total,
    })
  }

  const changeDate = (days) => {
    const d = new Date(filterDate)
    d.setDate(d.getDate() + days)
    setFilterDate(d.toISOString().split('T')[0])
  }

  const attendanceRate = summary.total > 0
    ? Math.round((summary.present / summary.total) * 100)
    : 0

  const formattedDate = new Date(filterDate + 'T00:00:00').toLocaleDateString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  if (!activeChild) {
    return (
      <div className="empty-att">
        <ClipboardList size={40} color="#cbd5e1" />
        <p>Select a child to view attendance</p>
      </div>
    )
  }

  if (loading) return <p className="loading-state">Loading attendance...</p>

  return (
    <div className="attendance-page">
      <div className="att-summary">
        <div className="att-sum-card green">
          <CheckCircle size={20} />
          <div>
            <p className="asc-label">Present</p>
            <p className="asc-value">{summary.present}</p>
          </div>
        </div>
        <div className="att-sum-card red">
          <XCircle size={20} />
          <div>
            <p className="asc-label">Absent</p>
            <p className="asc-value">{summary.absent}</p>
          </div>
        </div>
        <div className="att-sum-card amber">
          <Clock size={20} />
          <div>
            <p className="asc-label">Late</p>
            <p className="asc-value">{summary.late}</p>
          </div>
        </div>
        <div className="att-sum-card blue">
          <TrendingUp size={20} />
          <div>
            <p className="asc-label">Attendance Rate</p>
            <p className="asc-value">{attendanceRate}%</p>
          </div>
          <div className="att-rate-track">
            <div className="att-rate-fill" style={{ width: `${attendanceRate}%` }} />
          </div>
        </div>
      </div>

      <div className="att-toolbar">
        <div className="date-nav">
          <button className="date-nav-btn" onClick={() => changeDate(-1)}>
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            className="date-input"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
          />
          <button className="date-nav-btn" onClick={() => changeDate(1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <p className="att-date-label">
        <Calendar size={13} /> {formattedDate}
        {filterDate === new Date().toISOString().split('T')[0] && (
          <span className="att-today-badge">Today</span>
        )}
      </p>

      {records.length === 0 ? (
        <div className="empty-att">
          <ClipboardList size={40} color="#cbd5e1" />
          <p>No attendance record for this date</p>
          <span>{activeChild.full_name} has no attendance entry on {formattedDate}</span>
        </div>
      ) : (
        <div className="att-table-wrap">
          <table className="att-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="student-name-cell">
                      <div className="student-avatar-sm">
                        {r.students?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      {r.students?.full_name}
                    </div>
                  </td>
                  <td>
                    <span className={`att-badge ${r.status}`}>
                      {r.status === 'present' && <CheckCircle size={12} />}
                      {r.status === 'absent' && <XCircle size={12} />}
                      {r.status === 'late' && <Clock size={12} />}
                      {r.status}
                    </span>
                  </td>
                  <td className="text-muted">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
