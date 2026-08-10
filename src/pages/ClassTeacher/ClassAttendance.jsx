import { useState, useEffect, useRef } from 'react'
import {
  ClipboardList, Calendar, AlertTriangle, TrendingUp, FileSpreadsheet,
  ChevronLeft, ChevronRight, Search, Save, RotateCcw, FileText,
  CheckCircle, XCircle, Clock, UserMinus, ChevronDown, MessageSquare,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { exportAttendanceCSV, exportAttendancePDF } from '../../services/attendance/exportAttendance'
import ExportPanel from '../../components/attendance/ExportPanel'
import './ClassAttendance.css'

const STATUS_META = {
  present: { icon: <CheckCircle size={14} />, label: 'Present', cls: 'present' },
  absent: { icon: <XCircle size={14} />, label: 'Absent', cls: 'absent' },
  late: { icon: <Clock size={14} />, label: 'Late', cls: 'late' },
  excused: { icon: <UserMinus size={14} />, label: 'Excused', cls: 'excused' },
}

const BULK_OPTIONS = [
  { value: 'present', label: 'Mark All Present', icon: <CheckCircle size={14} /> },
  { value: 'absent', label: 'Mark All Absent', icon: <XCircle size={14} /> },
  { value: 'late', label: 'Mark All Late', icon: <Clock size={14} /> },
  { value: 'excused', label: 'Mark All Excused', icon: <UserMinus size={14} /> },
  { value: 'reset', label: 'Reset All', icon: <RotateCcw size={14} /> },
]

function StatCard({ label, value, color, bg, icon }) {
  return (
    <div className="ct-att-stat">
      <div className="ct-att-stat-icon" style={{ color, background: bg }}>{icon}</div>
      <div className="ct-att-stat-info">
        <span className="ct-att-stat-label">{label}</span>
        <span className="ct-att-stat-value" style={{ color }}>{value}</span>
      </div>
    </div>
  )
}

function StudentRowWithNote({ student, status, onStatusChange, note, onNoteChange, showClass }) {
  const [noteOpen, setNoteOpen] = useState(false)
  const current = status || 'present'

  return (
    <>
      <tr>
        <td>
          <div className="ct-att-student-cell">
            <div className="ct-att-avatar">
              {student.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="ct-att-student-info">
              <span className="ct-att-student-name">{student.full_name}</span>
              {showClass && <span className="ct-att-student-meta">{student.class}{student.stream ? ` - ${student.stream}` : ''}</span>}
            </div>
          </div>
        </td>
        <td>
          <div className="ct-segmented">
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <button
                key={key}
                className={`ct-seg-btn ${meta.cls} ${current === key ? 'active' : ''}`}
                onClick={() => onStatusChange(student.id, key)}
                title={meta.label}
              >
                {meta.icon}
              </button>
            ))}
          </div>
        </td>
        <td>
          <button className="ct-note-toggle" onClick={() => setNoteOpen(!noteOpen)} title="Add note">
            <MessageSquare size={14} />
            {note && <span className="ct-note-dot" />}
          </button>
        </td>
      </tr>
      {noteOpen && (
        <tr className="ct-note-row">
          <td colSpan={3}>
            <input
              className="ct-note-input"
              placeholder="Add a note for this student..."
              value={note || ''}
              onChange={(e) => onNoteChange(student.id, e.target.value)}
              autoFocus
            />
          </td>
        </tr>
      )}
    </>
  )
}

export default function ClassAttendance({ teacherData, currentTerm, currentYear, assignedClasses = [] }) {
  const [students, setStudents] = useState([])
  const [records, setRecords] = useState([])
  const [attendance, setAttendance] = useState({})
  const [notes, setNotes] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('mark')
  const [notifications, setNotifications] = useState([])
  const [filterStream, setFilterStream] = useState('')
  const [filterClass, setFilterClass] = useState('all')
  const [streams, setStreams] = useState([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const bulkRef = useRef(null)

  const today = new Date().toISOString().split('T')[0]
  const [filterDate, setFilterDate] = useState(today)

  const fetchStudents = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('students')
      .select('id, full_name, admission_number, class, stream')
      .eq('school_id', teacherData.school_id)
      .in('class', assignedClasses)
      .eq('status', 'active')
      .order('full_name')
    setStudents(data || [])
    const uniqueStreams = [...new Set((data || []).map(s => s.stream).filter(Boolean))].sort()
    setStreams(uniqueStreams)
    setLoading(false)
  }

  const loadExistingAttendance = async () => {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('school_id', teacherData.school_id)
      .eq('date', filterDate)
    const attMap = {}
    const notesMap = {}
    if (data) {
      data.forEach(r => {
        attMap[r.student_id] = r.status
        if (r.notes) notesMap[r.student_id] = r.notes
      })
    }
    setAttendance(attMap)
    setNotes(notesMap)
  }

  const fetchHistory = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('attendance')
      .select('*, students(full_name, admission_number, class)')
      .eq('school_id', teacherData.school_id)
      .eq('date', filterDate)
      .in('class_name', assignedClasses)
    const recs = (data || []).filter(r => r.students)
    setRecords(recs)
    setLoading(false)
  }

  useEffect(() => {
    const handler = (e) => {
      if (bulkRef.current && !bulkRef.current.contains(e.target)) setBulkOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (assignedClasses.length > 0) {
      fetchStudents()
    }
  }, [teacherData, assignedClasses])

  useEffect(() => {
    if (!teacherData?.school_id) return
    if (activeTab === 'mark') {
      loadExistingAttendance()
    } else {
      fetchHistory()
    }
  }, [filterDate, activeTab, teacherData])

  const setStatus = (studentId, status) => {
    setAttendance(prev => ({ ...prev, [studentId]: status }))
  }

  const setNote = (studentId, value) => {
    setNotes(prev => ({ ...prev, [studentId]: value }))
  }

  const bulkAction = (action) => {
    if (action === 'reset') {
      const reset = {}
      students.forEach(s => { reset[s.id] = 'present' })
      setAttendance(prev => ({ ...prev, ...reset }))
    } else {
      const all = {}
      students.forEach(s => { all[s.id] = action })
      setAttendance(prev => ({ ...prev, ...all }))
    }
    setBulkOpen(false)
  }

  const saveAttendance = async () => {
    setSaving(true)
    setSaved(false)
    const { data: { user } } = await supabase.auth.getUser()

    const recs = students.map(s => ({
      school_id: teacherData.school_id,
      student_id: s.id,
      date: filterDate,
      status: attendance[s.id] || 'present',
      notes: notes[s.id] || '',
      class_name: s.class,
      teacher_name: teacherData.full_name || teacherData.name || user?.email,
      teacher_id: user?.id || null,
    }))

    const { error } = await supabase
      .from('attendance')
      .upsert(recs, { onConflict: 'student_id,date' })

    if (error) {
      alert('Error saving attendance: ' + error.message)
    } else {
      setSaved(true)
      const absences = recs.filter(r => r.status === 'absent')
      if (absences.length > 0) {
        setNotifications([{ type: 'warning', message: `${absences.length} student(s) marked absent` }])
        setTimeout(() => setNotifications([]), 6000)
      }
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  const handleExportCSV = () => {
    if (filteredRecords.length === 0) { alert('No records to export.'); return }
    exportAttendanceCSV(filteredRecords, `attendance_${filterDate}.csv`)
  }

  const handleExportPDF = () => {
    if (filteredRecords.length === 0) { alert('No records to export.'); return }
    exportAttendancePDF(filteredRecords, {
      school: teacherData?.schools,
      title: 'Attendance Report',
      date: formattedDate,
    })
  }

  const changeDate = (days) => {
    const d = new Date(filterDate)
    d.setDate(d.getDate() + days)
    setFilterDate(d.toISOString().split('T')[0])
  }

  const hasStudents = students.length > 0

  const filteredStudents = students.filter(s => {
    if (filterClass !== 'all' && s.class !== filterClass) return false
    if (filterStream && s.stream !== filterStream) return false
    if (search) {
      const q = search.toLowerCase()
      if (!s.full_name?.toLowerCase().includes(q) && !s.admission_number?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const filteredRecords = records.filter(r => {
    if (filterClass !== 'all' && r.students?.class !== filterClass && r.class_name !== filterClass) return false
    if (search) {
      const q = search.toLowerCase()
      if (!r.students?.full_name?.toLowerCase().includes(q) && !r.students?.admission_number?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const formattedDate = new Date(filterDate + 'T00:00:00').toLocaleDateString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  const present = filteredStudents.filter(s => (attendance[s.id] || 'present') === 'present').length
  const absent = filteredStudents.filter(s => attendance[s.id] === 'absent').length
  const late = filteredStudents.filter(s => attendance[s.id] === 'late').length
  const excused = filteredStudents.filter(s => attendance[s.id] === 'excused').length
  const total = filteredStudents.length
  const rate = total > 0 ? Math.round((present / total) * 100) : 0

  return (
    <div className="ct-attendance-page">
      <div className="ct-att-tabs">
        <button
          className={`ct-att-tab ${activeTab === 'mark' ? 'active' : ''}`}
          onClick={() => setActiveTab('mark')}
        >
          <ClipboardList size={14} /> Mark Attendance
        </button>
        <button
          className={`ct-att-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <TrendingUp size={14} /> View Records
        </button>
        <button
          className={`ct-att-tab ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          <FileSpreadsheet size={14} /> Export & Reports
        </button>
      </div>

      {activeTab === 'mark' && (
        <>
          <div className="ct-att-summary">
            <StatCard label="Present" value={present} color="#16a34a" bg="#dcfce7" icon={<CheckCircle size={18} />} />
            <StatCard label="Absent" value={absent} color="#dc2626" bg="#fee2e2" icon={<XCircle size={18} />} />
            <StatCard label="Late" value={late} color="#ca8a04" bg="#fef9c3" icon={<Clock size={18} />} />
            <StatCard label="Excused" value={excused} color="#2563eb" bg="#dbeafe" icon={<UserMinus size={18} />} />
            <StatCard label="Rate" value={`${rate}%`} color="#2563eb" bg="#dbeafe" icon={<TrendingUp size={18} />} />
          </div>

          <div className="ct-att-toolbar">
            <div className="ct-att-toolbar-left">
              <div className="ct-date-nav">
                <button className="ct-date-nav-btn" onClick={() => changeDate(-1)}>
                  <ChevronLeft size={16} />
                </button>
                <input
                  type="date"
                  className="ct-date-input"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
                <button className="ct-date-nav-btn" onClick={() => changeDate(1)}>
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="ct-search-wrap">
                <Search size={14} className="ct-search-icon" />
                <input
                  className="ct-search-input"
                  placeholder="Search student..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="ct-filter-select"
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
              >
                {assignedClasses.length > 1 && <option value="all">All Classes</option>}
                {assignedClasses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {streams.length > 0 && (
                <select
                  className="ct-filter-select"
                  value={filterStream}
                  onChange={(e) => setFilterStream(e.target.value)}
                >
                  <option value="">All Streams</option>
                  {streams.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="ct-att-actions">
              {hasStudents && (
                <div className="ct-bulk-wrap" ref={bulkRef}>
                  <button className="ct-bulk-trigger" onClick={() => setBulkOpen(!bulkOpen)}>
                    Bulk Actions <ChevronDown size={14} />
                  </button>
                  {bulkOpen && (
                    <div className="ct-bulk-dropdown">
                      {BULK_OPTIONS.map(opt => (
                        <button key={opt.value} className="ct-bulk-option" onClick={() => bulkAction(opt.value)}>
                          {opt.icon} {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {hasStudents && (
                <div className="ct-save-wrap">
                  <button className="ct-save-btn" onClick={saveAttendance} disabled={saving}>
                    <Save size={15} />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  {saved && <span className="ct-saved-badge">Saved!</span>}
                </div>
              )}
            </div>
          </div>

          {filterDate === today && (
            <div className="ct-today-indicator">
              <Calendar size={13} /> Today
            </div>
          )}

          {notifications.map((n, i) => (
            <div key={i} className={`ct-att-notification ${n.type}`}>
              {n.type === 'warning' && <AlertTriangle size={14} />}
              {n.message}
            </div>
          ))}

          <div className="ct-att-table-wrap">
            {loading ? (
              <p className="ct-loading-state">Loading attendance...</p>
            ) : filteredStudents.length === 0 ? (
              <div className="ct-empty-att">
                <ClipboardList size={40} color="#cbd5e1" />
                <p>{filterClass !== 'all' ? `No students in ${filterClass}` : `No students found in ${assignedClasses.join(', ') || 'assigned classes'}`}</p>
              </div>
            ) : (
              <table className="ct-att-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(s => (
                    <StudentRowWithNote
                      key={s.id}
                      student={s}
                      status={attendance[s.id]}
                      onStatusChange={setStatus}
                      note={notes[s.id]}
                      onNoteChange={setNote}
                      showClass={assignedClasses.length > 1}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === 'history' && (
        <>
          <div className="ct-att-toolbar">
            <div className="ct-att-toolbar-left">
              <div className="ct-date-nav">
                <button className="ct-date-nav-btn" onClick={() => changeDate(-1)}>
                  <ChevronLeft size={16} />
                </button>
                <input
                  type="date"
                  className="ct-date-input"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
                <button className="ct-date-nav-btn" onClick={() => changeDate(1)}>
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="ct-search-wrap">
                <Search size={14} className="ct-search-icon" />
                <input
                  className="ct-search-input"
                  placeholder="Search student..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="ct-filter-select"
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
              >
                {assignedClasses.length > 1 && <option value="all">All Classes</option>}
                {assignedClasses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="ct-att-actions">
              <div className="ct-export-group">
                <button className="ct-export-btn csv" onClick={handleExportCSV}>
                  <FileSpreadsheet size={14} /> CSV
                </button>
                <button className="ct-export-btn pdf" onClick={handleExportPDF}>
                  <FileText size={14} /> PDF
                </button>
              </div>
            </div>
          </div>

          {filterDate === today && (
            <div className="ct-today-indicator">
              <Calendar size={13} /> Today
            </div>
          )}

          <div className="ct-att-table-wrap">
            {loading ? (
              <p className="ct-loading-state">Loading records...</p>
            ) : filteredRecords.length === 0 ? (
              <div className="ct-empty-att">
                <ClipboardList size={40} color="#cbd5e1" />
                <p>No attendance records for this date</p>
                <span>Records appear here once teachers mark attendance</span>
              </div>
            ) : (
              <table className="ct-att-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Status</th>
                    <th>Time</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map(r => (
                    <tr key={r.id}>
                      <td>
                        <div className="ct-att-student-cell">
                          <div className="ct-att-avatar">
                            {r.students?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div className="ct-att-student-info">
                            <span className="ct-att-student-name">{r.students?.full_name}</span>
                            {assignedClasses.length > 1 && <span className="ct-att-student-meta">{r.students?.class}</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`ct-att-badge ${r.status || 'present'}`}>
                          {STATUS_META[r.status]?.icon}
                          {STATUS_META[r.status]?.label || 'Present'}
                        </span>
                      </td>
                      <td className="ct-text-muted">
                        {r.created_at
                          ? new Date(r.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="ct-text-muted">{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === 'export' && (
        <ExportPanel
          schoolId={teacherData.school_id}
          classes={assignedClasses}
          streams={streams}
          filterClass={filterClass === 'all' ? (assignedClasses[0] || '') : filterClass}
          filterStream={filterStream}
          onClassChange={setFilterClass}
          onStreamChange={setFilterStream}
          school={teacherData?.schools}
          currentTerm={currentTerm}
          currentYear={currentYear}
          assignedClasses={assignedClasses}
        />
      )}
    </div>
  )
}
