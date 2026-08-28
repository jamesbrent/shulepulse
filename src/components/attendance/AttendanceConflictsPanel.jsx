import { useState, useEffect, useMemo } from 'react'
import {
  AlertTriangle, Clock, FileSpreadsheet, CheckCircle, XCircle,
  TrendingUp, Eye, UserMinus,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import '../../components/attendance/AttendanceModule.css'
import { exportConflictsCSV } from '../../services/attendance/exportAttendance'

const TYPE_META = {
  absent_vs_present: { label: 'Marked absent but present in class', color: '#ef4444', bg: '#fee2e2' },
  present_vs_absent: { label: 'Marked present but absent for lesson', color: '#f59e0b', bg: '#fef3c7' },
  absent_vs_late: { label: 'Marked absent but late for lesson', color: '#f59e0b', bg: '#fef3c7' },
  late_vs_present: { label: 'Late today but present in class', color: '#2563eb', bg: '#dbeafe' },
  unknown: { label: 'Discrepancy', color: '#64748b', bg: '#f1f5f9' },
}

function classify(dailyStatus, lessonStatus, includeLate) {
  if (dailyStatus === 'absent' && lessonStatus === 'present') return 'absent_vs_present'
  if (dailyStatus === 'present' && lessonStatus === 'absent') return 'present_vs_absent'
  if (dailyStatus === 'absent' && lessonStatus === 'late') return 'absent_vs_late'
  if (includeLate && dailyStatus === 'late' && lessonStatus === 'present') return 'late_vs_present'
  return 'unknown'
}

export default function AttendanceConflictsPanel({ schoolId, assignedClasses = [], isAdmin = false }) {
  const [conflicts, setConflicts] = useState([])
  const [subjects, setSubjects] = useState({})
  const [teachers, setTeachers] = useState({})
  const [classes, setClasses] = useState(assignedClasses || [])
  const [loading, setLoading] = useState(false)
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
  const [filterClass, setFilterClass] = useState('all')
  const [search, setSearch] = useState('')
  const [showLessonDetail, setShowLessonDetail] = useState(false)

  useEffect(() => {
    if (isAdmin && classes.length === 0) {
      supabase.from('students').select('class').eq('school_id', schoolId).eq('status', 'active')
        .then(({ data }) => setClasses([...new Set((data || []).map(s => s.class).filter(Boolean))].sort()))
    }
  }, [isAdmin, schoolId, classes.length])

  useEffect(() => {
    if (Object.keys(subjects).length === 0) {
      supabase.from('subjects').select('id, name').eq('school_id', schoolId)
        .then(({ data }) => {
          const map = {}
          ;(data || []).forEach(s => { map[s.id] = s.name })
          setSubjects(map)
        })
    }
  }, [schoolId, subjects])

  useEffect(() => {
    if (Object.keys(teachers).length === 0) {
      supabase.from('teachers').select('profile_id, full_name').eq('school_id', schoolId)
        .then(({ data }) => {
          const map = {}
          ;(data || []).forEach(t => { map[t.profile_id] = t.full_name })
          setTeachers(map)
        })
    }
  }, [schoolId, teachers])

  const fetchConflicts = async () => {
    setLoading(true)
    let q = supabase
      .from('attendance_conflicts')
      .select('*')
      .eq('date', filterDate)
      .order('class_name')
    if (filterClass !== 'all') q = q.eq('class_name', filterClass)
    const { data } = await q
    setConflicts(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchConflicts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, filterDate, filterClass])

  const filtered = useMemo(() => {
    if (!search) return conflicts
    const q = search.toLowerCase()
    return conflicts.filter(c => c.student_name?.toLowerCase().includes(q) || c.admission_number?.toLowerCase().includes(q))
  }, [conflicts, search])

  const kpis = useMemo(() => {
    const withTypes = filtered.map(c => ({ ...c, type: classify(c.daily_status, c.lesson_status, true) }))
    const total = withTypes.length
    const absentVsPresent = withTypes.filter(c => c.type === 'absent_vs_present').length
    const presentVsAbsent = withTypes.filter(c => c.type === 'present_vs_absent').length
    const absentVsLate = withTypes.filter(c => c.type === 'absent_vs_late').length
    return { total, absentVsPresent, presentVsAbsent, absentVsLate, list: withTypes }
  }, [filtered])

  const setClass = (e) => {
    setFilterClass(e.target.value)
  }

  const handleExport = () => {
    if (kpis.list.length === 0) { alert('No conflicts to export.'); return }
    exportConflictsCSV(kpis.list, subjects, teachers, `attendance_conflicts_${filterDate}.csv`)
  }

  const fmtLesson = (c) => {
    const t = c.period_start
      ? new Date(c.period_start).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
      : null
    return `${subjects[c.subject_id] || 'Subject'}${t ? ` \u00B7 ${t}` : ''}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="acx-kpis">
        <div className="acx-kpi">
          <div className="acx-kpi-icon" style={{ background: '#f3f4f6', color: '#374151' }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="acx-kpi-label">Conflicts Today</p>
            <p className="acx-kpi-value">{kpis.total}</p>
          </div>
        </div>
        <div className="acx-kpi">
          <div className="acx-kpi-icon" style={{ background: '#fee2e2', color: '#ef4444' }}>
            <XCircle size={20} />
          </div>
          <div>
            <p className="acx-kpi-label">Daily Absent · Lesson Present</p>
            <p className="acx-kpi-value">{kpis.absentVsPresent}</p>
          </div>
        </div>
        <div className="acx-kpi">
          <div className="acx-kpi-icon" style={{ background: '#fef3c7', color: '#f59e0b' }}>
            <Clock size={20} />
          </div>
          <div>
            <p className="acx-kpi-label">Daily Present · Lesson Absent</p>
            <p className="acx-kpi-value">{kpis.presentVsAbsent}</p>
          </div>
        </div>
        <div className="acx-kpi">
          <div className="acx-kpi-icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <p className="acx-kpi-label">Requires Review</p>
            <p className="acx-kpi-value">{kpis.absentVsLate}</p>
          </div>
        </div>
      </div>

      <div className="acx-controls">
        <div className="lam-field">
          <label>Date</label>
          <input className="lam-input" type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        </div>
        <div className="lam-field">
          <label>Class</label>
          <select className="lam-select" value={filterClass} onChange={setClass}>
            <option value="all">All Classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="lam-field">
          <label>Search</label>
          <input
            className="lam-input"
            placeholder="Search student..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 180 }}
          />
        </div>
        <div className="lam-spacer" />
        <label className="acx-legend" style={{ alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={showLessonDetail} onChange={e => setShowLessonDetail(e.target.checked)} />
          Show lesson detail
        </label>
        <button className="aan-export-btn csv" onClick={handleExport} disabled={kpis.list.length === 0}>
          <FileSpreadsheet size={14} /> Export CSV
        </button>
      </div>

      <div className="acx-legend" style={{ padding: '0 4px' }}>
        <span className="acx-legend-item"><span className="acx-dot" style={{ background: '#ef4444' }} /> Daily absent, present in class</span>
        <span className="acx-legend-item"><span className="acx-dot" style={{ background: '#f59e0b' }} /> Present but missed lesson</span>
        <span className="acx-legend-item"><span className="acx-dot" style={{ background: '#2563eb' }} /> Late today</span>
      </div>

      <div className="att-table-wrap" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
        {loading ? (
          <p className="att-loading" style={{ padding: 40 }}>Loading conflicts...</p>
        ) : kpis.list.length === 0 ? (
          <div className="lam-empty" style={{ border: 'none' }}>
            <Eye size={40} color="#cbd5e1" />
            <p>No attendance conflicts detected</p>
            <span>Conflicts appear when a student's daily status differs from their lesson attendance</span>
          </div>
        ) : (
          <table className="att-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Adm No.</th>
                <th>Class</th>
                <th>Daily Status</th>
                {showLessonDetail && <th>Lesson Status</th>}
                {showLessonDetail && <th>Lesson</th>}
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              {kpis.list.map((c, i) => {
                const meta = TYPE_META[c.type] || TYPE_META.unknown
                return (
                  <tr key={i}>
                    <td>
                      <div className="att-student-cell">
                        <div className="att-avatar">{c.student_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                        <span className="att-student-name">{c.student_name}</span>
                      </div>
                    </td>
                    <td className="att-mono">{c.admission_number || '—'}</td>
                    <td>{c.class_name || '—'}</td>
                    <td>
                      <span className={`att-badge ${c.daily_status || 'present'}`}>
                        {c.daily_status === 'absent' ? <XCircle size={12} /> : c.daily_status === 'late' ? <Clock size={12} /> : <CheckCircle size={12} />}
                        {c.daily_status}
                      </span>
                    </td>
                    {showLessonDetail && (
                      <td>
                        <span className={`att-badge ${c.lesson_status || ''}`}>
                          {c.lesson_status === 'absent' ? <XCircle size={12} /> : c.lesson_status === 'late' ? <Clock size={12} /> : <CheckCircle size={12} />}
                          {c.lesson_status}
                        </span>
                      </td>
                    )}
                    {showLessonDetail && (
                      <td className="text-muted" style={{ fontSize: 12 }}>
                        {fmtLesson(c)}{c.teacher_id ? ` \u00B7 ${teachers[c.teacher_id] || ''}` : ''}
                      </td>
                    )}
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: meta.color, background: meta.bg }}>
                        {c.type === 'absent_vs_present' ? <UserMinus size={11} /> : <AlertTriangle size={11} />}
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}