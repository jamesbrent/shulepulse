import { useState, useEffect, useMemo } from 'react'
import {
  ClipboardList, Calendar, AlertTriangle, TrendingUp, FileSpreadsheet,
  ChevronLeft, ChevronRight, Search, CheckCircle, XCircle, Clock,
  UserMinus, Save, Send, CheckSquare, Square, RotateCcw, Users,
  BookOpen, AlertOctagon, BarChart3,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from './useSchool'
import { useFeatureAccess } from '../../features/access/FeatureAccessContext'
import AttendanceTrends from '../../components/attendance/AttendanceTrends'
import StudentAnalytics from '../../components/attendance/StudentAnalytics'
import ExportPanel from '../../components/attendance/ExportPanel'
import LessonAttendancePanel from '../../components/attendance/LessonAttendancePanel'
import AttendanceConflictsPanel from '../../components/attendance/AttendanceConflictsPanel'
import AttendanceAnalyticsPanel from '../../components/attendance/AttendanceAnalyticsPanel'
import { exportAttendanceCSV, exportAttendancePDF } from '../../services/attendance/exportAttendance'

const STATUSES = [
  { key: 'present', label: 'Present', icon: <CheckCircle size={12} />, color: '#16a34a' },
  { key: 'absent', label: 'Absent', icon: <XCircle size={12} />, color: '#ef4444' },
  { key: 'late', label: 'Late', icon: <Clock size={12} />, color: '#f59e0b' },
  { key: 'excused', label: 'Excused', icon: <UserMinus size={12} />, color: '#2563eb' },
]

export default function AttendancePage() {
  const { profile } = useAuthStore()
  const { currentTerm, currentYear } = useSchool()
  const { has } = useFeatureAccess()
  const hasLesson = has('students.attendance.lesson')
  const hasAnalytics = has('students.attendance.analytics')
  const [students, setStudents] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('all')
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
  const [attendance, setAttendance] = useState({})
  const [notes, setNotes] = useState({})
  const [classes, setClasses] = useState([])
  const [activeTab, setActiveTab] = useState('mark')
  const [selected, setSelected] = useState({})
  const [notifications, setNotifications] = useState([])
  const [streams, setStreams] = useState([])
  const [filterStream, setFilterStream] = useState('')

  useEffect(() => { fetchClasses() }, [])
  useEffect(() => {
    if (activeTab === 'mark') { fetchStudents(); loadExistingAttendance() }
    else { fetchRecords() }
  }, [filterDate, filterClass, activeTab])

  const fetchClasses = async () => {
    const { data } = await supabase.from('students').select('class, stream').eq('school_id', profile.school_id).eq('status', 'active')
    setClasses([...new Set((data || []).map(s => s.class).filter(Boolean))].sort())
    setStreams([...new Set((data || []).map(s => s.stream).filter(Boolean))].sort())
  }

  const fetchStudents = async () => {
    setLoading(true)
    let q = supabase.from('students').select('id, full_name, admission_number, class, stream').eq('school_id', profile.school_id).eq('status', 'active').order('full_name')
    if (filterClass !== 'all') q = q.eq('class', filterClass)
    const { data } = await q
    setStudents(data || [])
    setLoading(false)
  }

  const loadExistingAttendance = async () => {
    const { data } = await supabase.from('attendance').select('*').eq('school_id', profile.school_id).eq('date', filterDate)
    const attMap = {}, notesMap = {}
    ;(data || []).forEach(r => { attMap[r.student_id] = r.status; if (r.notes) notesMap[r.student_id] = r.notes })
    setAttendance(attMap); setNotes(notesMap)
  }

  const fetchRecords = async () => {
    setLoading(true)
    let q = supabase.from('attendance').select('*, students(full_name, admission_number, class)').eq('school_id', profile.school_id).eq('date', filterDate).order('created_at', { ascending: false })
    if (filterClass !== 'all') q = q.eq('students.class', filterClass)
    const { data } = await q
    setRecords((data || []).filter(r => r.students))
    setLoading(false)
  }

  const setStatus = (id, status) => setAttendance(prev => ({ ...prev, [id]: status }))
  const setNote = (id, val) => setNotes(prev => ({ ...prev, [id]: val }))
  const markAllPresent = () => { const m = {}; students.forEach(s => { m[s.id] = 'present' }); setAttendance(prev => ({ ...prev, ...m })) }
  const markAllAbsent = () => { const m = {}; students.forEach(s => { m[s.id] = 'absent' }); setAttendance(prev => ({ ...prev, ...m })) }
  const resetAll = () => { const m = {}; students.forEach(s => { m[s.id] = 'present' }); setAttendance(prev => ({ ...prev, ...m })); setNotes({}) }

  const toggleSelect = (id) => setSelected(prev => ({ ...prev, [id]: !prev[id] }))
  const toggleSelectAll = () => {
    const allSelected = filteredStudents.length > 0 && filteredStudents.every(s => selected[s.id])
    const m = {}
    filteredStudents.forEach(s => { m[s.id] = !allSelected })
    setSelected(prev => ({ ...prev, ...m }))
  }

  const saveAttendance = async (submit = false) => {
    setSaving(true); setSaved(false)
    const email = profile?.email || (await supabase.auth.getUser()).data.user?.email
    const payload = students.map(s => ({
      school_id: profile.school_id, student_id: s.id, date: filterDate,
      status: attendance[s.id] || 'present', notes: notes[s.id] || '',
      class_name: s.class, teacher_name: profile?.full_name || email,
    }))
    const { error } = await supabase.from('attendance').upsert(payload, { onConflict: 'student_id,date' })
    if (error) { alert('Error saving: ' + error.message) }
    else {
      setSaved(true); setLastSaved(new Date())
      const alerts = []
      const abs = payload.filter(r => r.status === 'absent')
      const lates = payload.filter(r => r.status === 'late')
      if (abs.length) alerts.push({ type: 'warning', message: `${abs.length} student(s) marked absent` })
      if (lates.length) alerts.push({ type: 'info', message: `${lates.length} student(s) marked late` })
      setNotifications(alerts); setTimeout(() => setNotifications([]), 5000)
      if (submit) alert('Attendance submitted successfully.')
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  const handleExportCSV = () => { if (records.length === 0) { alert('No records to export.'); return } exportAttendanceCSV(records, `attendance_${filterDate}.csv`) }
  const handleExportPDF = () => { if (records.length === 0) { alert('No records to export.'); return } exportAttendancePDF(records, { school: profile?.schools, title: 'Attendance Report', date: formattedDate }) }

  const shiftDate = (dir) => {
    const d = new Date(filterDate + 'T00:00:00')
    d.setDate(d.getDate() + dir)
    setFilterDate(d.toISOString().split('T')[0])
  }

  const today = new Date().toISOString().split('T')[0]
  const formattedDate = new Date(filterDate + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const filteredStudents = useMemo(() => {
    if (!search) return students
    const q = search.toLowerCase()
    return students.filter(s => s.full_name?.toLowerCase().includes(q) || s.admission_number?.toLowerCase().includes(q))
  }, [students, search])

  const counts = useMemo(() => {
    const p = students.filter(s => (attendance[s.id] || 'present') === 'present').length
    const a = students.filter(s => attendance[s.id] === 'absent').length
    const l = students.filter(s => attendance[s.id] === 'late').length
    const e = students.filter(s => attendance[s.id] === 'excused').length
    const total = p + a + l + e || 1
    return { present: p, absent: a, late: l, excused: e, rate: Math.round((p / total) * 100) }
  }, [students, attendance])

  const lastSavedStr = lastSaved ? lastSaved.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="att-page">
      {/* ── Tabs ── */}
      <div className="att-tabs">
        <button className={`att-tab ${activeTab === 'mark' ? 'active' : ''}`} onClick={() => setActiveTab('mark')}>
          <ClipboardList size={14} /> Mark Attendance
        </button>
        <button className={`att-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          <TrendingUp size={14} /> History & Reports
        </button>
        {hasLesson && (
          <>
            <button className={`att-tab ${activeTab === 'lesson' ? 'active' : ''}`} onClick={() => setActiveTab('lesson')}>
              <BookOpen size={14} /> Lesson Attendance
            </button>
            <button className={`att-tab ${activeTab === 'conflicts' ? 'active' : ''}`} onClick={() => setActiveTab('conflicts')}>
              <AlertOctagon size={14} /> Conflicts
            </button>
          </>
        )}
        {hasAnalytics && (
          <button className={`att-tab ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
            <BarChart3 size={14} /> Analytics
          </button>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
         MARK ATTENDANCE TAB
         ═══════════════════════════════════════════════════════ */}
      {activeTab === 'mark' && (
        <>
          {/* Summary Chips */}
          <div className="att-summary-row">
            <div className="att-chip green"><CheckCircle size={14} /><span className="att-chip-val">{counts.present}</span><span className="att-chip-lbl">Present</span></div>
            <div className="att-chip red"><XCircle size={14} /><span className="att-chip-val">{counts.absent}</span><span className="att-chip-lbl">Absent</span></div>
            <div className="att-chip amber"><Clock size={14} /><span className="att-chip-val">{counts.late}</span><span className="att-chip-lbl">Late</span></div>
            <div className="att-chip blue"><TrendingUp size={14} /><span className="att-chip-val">{counts.rate}%</span><span className="att-chip-lbl">Rate</span></div>
          </div>

          {/* Notifications */}
          {notifications.map((n, i) => (
            <div key={i} className={`att-notification ${n.type}`}>
              {n.type === 'warning' && <AlertTriangle size={14} />}
              {n.message}
            </div>
          ))}

          {/* Unified Control Toolbar */}
          <div className="att-control-bar">
            <div className="att-controls-left">
              <div className="att-date-nav">
                <button className="att-nav-btn" onClick={() => shiftDate(-1)}><ChevronLeft size={14} /></button>
                <input className="att-date-input" type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
                <button className="att-nav-btn" onClick={() => shiftDate(1)}><ChevronRight size={14} /></button>
                {filterDate === today && <span className="att-today-badge">Today</span>}
              </div>
              <select className="att-filter-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
                <option value="all">All Classes</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="att-search-wrap">
                <Search size={13} className="att-search-icon" />
                <input className="att-search-input" placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="att-controls-right">
              <button className="att-action-btn" onClick={markAllPresent} title="Mark All Present"><CheckCircle size={13} /> All Present</button>
              <button className="att-action-btn" onClick={markAllAbsent} title="Mark All Absent"><XCircle size={13} /> All Absent</button>
              <button className="att-action-btn" onClick={resetAll} title="Reset"><RotateCcw size={13} /> Reset</button>
            </div>
          </div>

          {/* Student Table */}
          {loading ? (
            <p className="att-loading">Loading students...</p>
          ) : filteredStudents.length === 0 ? (
            <div className="att-empty"><ClipboardList size={40} color="#cbd5e1" /><p>No students found</p><span>Select a class to begin</span></div>
          ) : (
            <div className="att-table-wrap">
              <table className="att-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <button className="att-check-btn" onClick={toggleSelectAll}>
                        {filteredStudents.length > 0 && filteredStudents.every(s => selected[s.id]) ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    </th>
                    <th>Student</th>
                    <th>Adm No.</th>
                    <th>Class</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(s => {
                    const status = attendance[s.id] || 'present'
                    return (
                      <tr key={s.id} className={selected[s.id] ? 'att-row-selected' : ''}>
                        <td>
                          <button className="att-check-btn" onClick={() => toggleSelect(s.id)}>
                            {selected[s.id] ? <CheckSquare size={16} color="#2563eb" /> : <Square size={16} />}
                          </button>
                        </td>
                        <td>
                          <div className="att-student-cell">
                            <div className="att-avatar">{s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                            <span className="att-student-name">{s.full_name}</span>
                          </div>
                        </td>
                        <td className="att-mono">{s.admission_number || '—'}</td>
                        <td>{s.class}{s.stream ? ` ${s.stream}` : ''}</td>
                        <td>
                          <div className="att-segmented">
                            {STATUSES.map(st => (
                              <button key={st.key} className={`att-seg-btn ${status === st.key ? 'active' : ''} ${st.key}`} onClick={() => setStatus(s.id, st.key)} style={status === st.key ? { background: st.color, borderColor: st.color } : {}}>
                                {st.icon} {st.label}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td>
                          <input className="att-note-input" placeholder="Note..." value={notes[s.id] || ''} onChange={e => setNote(s.id, e.target.value)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sticky Save Bar */}
          <div className="att-save-bar">
            <div className="att-save-stats">
              <span className="att-save-stat green"><CheckCircle size={13} /> {counts.present}</span>
              <span className="att-save-stat red"><XCircle size={13} /> {counts.absent}</span>
              <span className="att-save-stat amber"><Clock size={13} /> {counts.late}</span>
              <span className="att-save-time">Last saved: {lastSavedStr}</span>
            </div>
            <div className="att-save-actions">
              {saved && <span className="att-saved-badge"><CheckCircle size={13} /> Saved</span>}
              <button className="att-btn-save" onClick={() => saveAttendance(false)} disabled={saving || students.length === 0}>
                <Save size={14} /> {saving ? 'Saving...' : 'Save'}
              </button>
              <button className="att-btn-submit" onClick={() => saveAttendance(true)} disabled={saving || students.length === 0}>
                <Send size={14} /> Submit Final
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
         HISTORY & REPORTS TAB
         ═══════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <>
          <div className="att-control-bar">
            <div className="att-controls-left">
              <div className="att-date-nav">
                <button className="att-nav-btn" onClick={() => shiftDate(-1)}><ChevronLeft size={14} /></button>
                <input className="att-date-input" type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
                <button className="att-nav-btn" onClick={() => shiftDate(1)}><ChevronRight size={14} /></button>
                {filterDate === today && <span className="att-today-badge">Today</span>}
              </div>
              <select className="att-filter-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
                <option value="all">All Classes</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="att-controls-right">
              <button className="att-action-btn" onClick={handleExportCSV}><FileSpreadsheet size={13} /> CSV</button>
              <button className="att-action-btn" onClick={handleExportPDF}><FileSpreadsheet size={13} /> PDF</button>
            </div>
          </div>

          {loading ? (
            <p className="att-loading">Loading records...</p>
          ) : records.length === 0 ? (
            <div className="att-empty"><ClipboardList size={40} color="#cbd5e1" /><p>No records for this date</p></div>
          ) : (
            <div className="att-table-wrap">
              <table className="att-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Adm No.</th>
                    <th>Class</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Marked By</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      <td>
                        <div className="att-student-cell">
                          <div className="att-avatar">{r.students?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                          <span className="att-student-name">{r.students?.full_name}</span>
                        </div>
                      </td>
                      <td className="att-mono">{r.students?.admission_number || '—'}</td>
                      <td>{r.students?.class || '—'}</td>
                      <td><span className={`att-badge ${r.status}`}>{r.status}</span></td>
                      <td className="att-muted">{r.notes || '—'}</td>
                      <td className="att-muted">{r.teacher_name || '—'}</td>
                      <td className="att-muted">{r.created_at ? new Date(r.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <AttendanceTrends schoolId={profile.school_id} filterClass={filterClass} />
          <StudentAnalytics schoolId={profile.school_id} filterClass={filterClass} />

          <ExportPanel
            schoolId={profile.school_id} classes={classes} streams={streams}
            filterClass={filterClass} filterStream={filterStream}
            onClassChange={setFilterClass} onStreamChange={setFilterStream}
            school={profile?.schools} currentTerm={currentTerm} currentYear={currentYear}
          />
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
         LESSON ATTENDANCE TAB (Pro)
         ═══════════════════════════════════════════════════════ */}
      {activeTab === 'lesson' && hasLesson && (
        <LessonAttendancePanel profile={profile} isAdmin />
      )}

      {/* ═══════════════════════════════════════════════════════
         CONFLICTS TAB (Pro)
         ═══════════════════════════════════════════════════════ */}
      {activeTab === 'conflicts' && hasLesson && (
        <AttendanceConflictsPanel schoolId={profile.school_id} isAdmin />
      )}

      {/* ═══════════════════════════════════════════════════════
         ANALYTICS TAB (Enterprise)
         ═══════════════════════════════════════════════════════ */}
      {activeTab === 'analytics' && hasAnalytics && (
        <AttendanceAnalyticsPanel schoolId={profile.school_id} isAdmin />
      )}
    </div>
  )
}
