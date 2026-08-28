import { useState, useEffect, useMemo } from 'react'
import {
  AlertTriangle, FileSpreadsheet, Award, BookOpen, CheckCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import '../../components/attendance/AttendanceModule.css'
import AttendanceTrends from './AttendanceTrends'
import StudentAnalytics from './StudentAnalytics'
import { exportLessonAttendanceCSV } from '../../services/attendance/exportAttendance'

export default function AttendanceAnalyticsPanel({ schoolId, assignedClasses = [], isAdmin = false }) {
  const [classes, setClasses] = useState(assignedClasses || [])
  const [range, setRange] = useState('14') // days
  const [lessonRecords, setLessonRecords] = useState([])
  const [dailySummary, setDailySummary] = useState({ total: 0, present: 0, absent: 0, late: 0, excused: 0 })
  const [loading, setLoading] = useState(true)
  const [filterClass, setFilterClass] = useState('all')

  useEffect(() => {
    if (isAdmin && classes.length === 0) {
      supabase.from('students').select('class').eq('school_id', schoolId).eq('status', 'active')
        .then(({ data }) => setClasses([...new Set((data || []).map(s => s.class).filter(Boolean))].sort()))
    }
  }, [isAdmin, schoolId, classes.length])

  const fetchData = async () => {
    setLoading(true)
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - Number(range))

    const startStr = start.toISOString().split('T')[0]
    const endStr = end.toISOString().split('T')[0]

    let q = supabase
      .from('lesson_attendance')
      .select('*, students(full_name, admission_number, class), subjects(name, code)')
      .eq('school_id', schoolId)
      .gte('period_start', `${startStr}T00:00:00`)
      .lte('period_end', `${endStr}T23:59:59`)
    if (filterClass !== 'all') q = q.eq('class_name', filterClass)
    const { data: lessonData } = await q
    const lessons = lessonData || []
    setLessonRecords(lessons)

    let qd = supabase
      .from('attendance')
      .select('status')
      .eq('school_id', schoolId)
      .gte('date', startStr)
      .lte('date', endStr)
    if (filterClass !== 'all') qd = qd.eq('class_name', filterClass)
    const { data: dailyData } = await qd
    const sum = { total: 0, present: 0, absent: 0, late: 0, excused: 0 }
    ;(dailyData || []).forEach(r => {
      sum.total++
      if (r.status === 'present') sum.present++
      else if (r.status === 'absent') sum.absent++
      else if (r.status === 'late') sum.late++
      else if (r.status === 'excused') sum.excused++
    })
    setDailySummary(sum)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, range, filterClass])

  const lessonStats = useMemo(() => {
    const get = r => r.status || 'present'
    const present = lessonRecords.filter(r => get(r) === 'present').length
    const absent = lessonRecords.filter(r => get(r) === 'absent').length
    const late = lessonRecords.filter(r => get(r) === 'late').length
    const excused = lessonRecords.filter(r => get(r) === 'excused').length
    const marked = present + absent + late + excused
    const rate = marked > 0 ? Math.round((present / marked) * 100) : 0
    return { total: marked, present, absent, late, excused, rate }
  }, [lessonRecords])

  const bySubject = useMemo(() => {
    const map = {}
    lessonRecords.forEach(r => {
      const sid = r.subject_id
      if (!map[sid]) map[sid] = { subject: r.subjects?.name || sid, total: 0, present: 0 }
      map[sid].total++
      if ((r.status || 'present') === 'present') map[sid].present++
    })
    return Object.values(map)
      .map(s => ({ ...s, rate: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0 }))
      .sort((a, b) => b.rate - a.rate)
  }, [lessonRecords])

  const alerts = useMemo(() => {
    const map = {}
    lessonRecords.forEach(r => {
      if ((r.status || 'present') === 'absent') {
        const sid = r.student_id
        if (!map[sid]) map[sid] = { name: r.students?.full_name || 'Student', adm: r.students?.admission_number || '', count: 0 }
        map[sid].count++
      }
    })
    return Object.values(map).filter(a => a.count >= 3).sort((a, b) => b.count - a.count)
  }, [lessonRecords])

  const handleExport = () => {
    if (lessonRecords.length === 0) { alert('No lesson attendance records in this period.'); return }
    exportLessonAttendanceCSV(lessonRecords, `lesson_attendance_last_${range}d.csv`)
  }

  const maxRate = Math.max(1, ...bySubject.map(s => s.rate))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Controls */}
      <div className="acx-controls">
        <div className="lam-field">
          <label>Period</label>
          <select className="lam-select" value={range} onChange={e => setRange(e.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
        <div className="lam-field">
          <label>Class</label>
          <select className="lam-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
            <option value="all">All Classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="lam-spacer" />
        <button className="aan-export-btn csv" onClick={handleExport} disabled={lessonRecords.length === 0}>
          <FileSpreadsheet size={14} /> Export Lesson Data
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading analytics...</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="aan-kpis">
            <div className="aan-kpi">
              <span className="aan-kpi-label">Daily Attendance Rate</span>
              <span className="aan-kpi-value">{dailySummary.total > 0 ? Math.round((dailySummary.present / dailySummary.total) * 100) : 0}%</span>
              <span className="aan-kpi-sub">{dailySummary.present} present of {dailySummary.total} marked</span>
            </div>
            <div className="aan-kpi">
              <span className="aan-kpi-label">Lesson Attendance Rate</span>
              <span className="aan-kpi-value">{lessonStats.rate}%</span>
              <span className="aan-kpi-sub">{lessonStats.present} present of {lessonStats.total} lessons</span>
            </div>
            <div className="aan-kpi">
              <span className="aan-kpi-label">Lessons Marked</span>
              <span className="aan-kpi-value">{lessonStats.total}</span>
              <span className="aan-kpi-sub">{lessonStats.absent} absent · {lessonStats.late} late · {lessonStats.excused} excused</span>
            </div>
            <div className="aan-kpi">
              <span className="aan-kpi-label">At-Risk Students ({alerts.length})</span>
              <span className="aan-kpi-value" style={{ color: alerts.length > 0 ? '#ef4444' : '#16a34a' }}>{alerts.length}</span>
              <span className="aan-kpi-sub">3+ lesson absences in period</span>
            </div>
          </div>

          <div className="aan-grid">
            {/* Subject performance */}
            <div className="aan-panel">
              <div className="aan-panel-header">
                <h4 className="aan-panel-title"><BookOpen size={15} color="#7C3AED" /> Subject Attendance Rate</h4>
              </div>
              <div className="aan-panel-body">
                {bySubject.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 20 }}>No lesson attendance data yet</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {bySubject.map(s => (
                      <div key={s.subject}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>{s.subject}</span>
                          <span style={{ fontWeight: 700, color: s.rate >= 80 ? '#16a34a' : s.rate >= 50 ? '#f59e0b' : '#ef4444' }}>{s.rate}% <span style={{ fontWeight: 400, color: '#94a3b8' }}>({s.total})</span></span>
                        </div>
                        <div style={{ height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ width: `${(s.rate / maxRate) * 100}%`, height: '100%', background: s.rate >= 80 ? '#16a34a' : s.rate >= 50 ? '#f59e0b' : '#ef4444', borderRadius: 999, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* At-risk alerts */}
            <div className="aan-panel">
              <div className="aan-panel-header">
                <h4 className="aan-panel-title"><AlertTriangle size={15} color="#dc2626" /> Low Attendance Alerts</h4>
              </div>
              <div className="aan-panel-body">
                {alerts.length === 0 ? (
                  <div className="aan-alert ok">
                    <CheckCircle size={16} color="#16a34a" />
                    <span className="aan-alert-name">All students within attendance threshold</span>
                  </div>
                ) : (
                  <div className="aan-alert-list">
                    {alerts.slice(0, 8).map(a => (
                      <div key={a.adm || a.name} className="aan-alert">
                        <Award size={15} color="#dc2626" />
                        <span className="aan-alert-name">{a.name} <span className="aan-alert-meta">({a.adm || '—'})</span></span>
                        <span className="aan-alert-count">{a.count}x absent</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="aan-note" style={{ marginTop: 12 }}>Students with 3 or more lesson absences in the selected period.</p>
              </div>
            </div>
          </div>

          {/* Trends + student analytics (reuse existing) */}
          <AttendanceTrends schoolId={schoolId} filterClass={filterClass === 'all' ? '' : filterClass} />
          <StudentAnalytics schoolId={schoolId} filterClass={filterClass === 'all' ? '' : filterClass} />

        </>
      )}
    </div>
  )
}