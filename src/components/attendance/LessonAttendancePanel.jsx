import { useState, useEffect, useMemo } from 'react'
import {
  ClipboardList, Save, Calendar, BookOpen, Clock, Users,
  CheckCircle, XCircle, UserMinus, Search, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import '../../components/attendance/AttendanceModule.css'

const STATUSES = [
  { key: 'present', label: 'Present', icon: <CheckCircle size={14} />, color: '#16a34a' },
  { key: 'absent', label: 'Absent', icon: <XCircle size={14} />, color: '#ef4444' },
  { key: 'late', label: 'Late', icon: <Clock size={14} />, color: '#f59e0b' },
  { key: 'excused', label: 'Excused', icon: <UserMinus size={14} />, color: '#2563eb' },
]

const DEFAULT_PERIODS = [
  { period: 1, start: '08:00', end: '08:40' },
  { period: 2, start: '08:40', end: '09:20' },
  { period: 3, start: '09:20', end: '10:00' },
  { period: 4, start: '10:20', end: '11:00' },
  { period: 5, start: '11:00', end: '11:40' },
  { period: 6, start: '11:40', end: '12:20' },
  { period: 7, start: '14:00', end: '14:40' },
  { period: 8, start: '14:40', end: '15:20' },
]

export default function LessonAttendancePanel({ profile, assignedClasses = [], isAdmin = false }) {
  const schoolId = profile?.school_id
  const authUid = profile?.id || profile?.profile_id
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [classes, setClasses] = useState(assignedClasses || [])
  const [subjects, setSubjects] = useState([])
  const [period, setPeriod] = useState(1)
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('08:40')
  const [filterClass, setFilterClass] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [students, setStudents] = useState([])
  const [attendance, setAttendance] = useState({})
  const [notes, setNotes] = useState({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [message, setMessage] = useState('')

  const fetchAllClasses = async () => {
    const { data } = await supabase.from('students').select('class').eq('school_id', schoolId).eq('status', 'active')
    const unique = [...new Set((data || []).map(s => s.class).filter(Boolean))].sort()
    setClasses(unique)
    if (!filterClass && unique.length > 0) setFilterClass(unique[0])
  }

  const fetchSubjects = async () => {
    if (!schoolId) return
    let query = supabase.from('subjects').select('id, name, code, category').eq('school_id', schoolId).order('name')

    if (!isAdmin) {
      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('profile_id', authUid)
        .maybeSingle()
      if (teacher) {
        const { data: assignments } = await supabase
          .from('teacher_subject_assignments')
          .select('subject_id')
          .eq('teacher_id', teacher.id)
        const ids = [...new Set((assignments || []).map(a => a.subject_id))]
        if (ids.length > 0) query = supabase.from('subjects').select('id, name, code, category').in('id', ids).order('name')
      }
    }

    const { data } = await query
    const list = data || []
    setSubjects(list)
    if (list.length > 0 && !subjectId) setSubjectId(list[0].id)
  }

  const fetchTimetableHint = async () => {
    const { data: tbl } = await supabase.from('classes').select('id, class_name').eq('school_id', schoolId).eq('class_name', filterClass).maybeSingle()
    if (!tbl) return
    const dayOfWeek = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' })
    const { data: slots } = await supabase
      .from('timetable_slots')
      .select('period, start_time, end_time, subject_id')
      .eq('class_id', tbl.id)
      .eq('day', dayOfWeek)
    const slot = (slots || []).find(s => s.period === period)
    if (slot) {
      if (slot.start_time && slot.end_time) {
        setStartTime(slot.start_time.slice(0, 5))
        setEndTime(slot.end_time.slice(0, 5))
      }
      if (slot.subject_id && !isAdmin) setSubjectId(slot.subject_id)
    } else {
      const def = DEFAULT_PERIODS.find(p => p.period === period)
      if (def) { setStartTime(def.start); setEndTime(def.end) }
    }
  }

  const fetchStudents = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('students')
      .select('id, full_name, admission_number, class, stream')
      .eq('school_id', schoolId)
      .eq('class', filterClass)
      .eq('status', 'active')
      .order('full_name')
    setStudents(data || [])
    setLoading(false)
  }

  const loadLessonAttendance = async () => {
    const startISO = `${date}T${startTime}:00`
    const endISO = `${date}T${endTime}:00`
    const { data: { user } } = await supabase.auth.getUser()
    const uid = user?.id || authUid
    const { data } = await supabase
      .from('lesson_attendance')
      .select('*')
      .eq('school_id', schoolId)
      .eq('class_name', filterClass)
      .eq('subject_id', subjectId)
      .eq('teacher_id', uid)
      .eq('period_start', startISO)
      .eq('period_end', endISO)
    const attMap = {}
    const notesMap = {}
    ;(data || []).forEach(r => {
      attMap[r.student_id] = r.status
      if (r.notes) notesMap[r.student_id] = r.notes
    })
    setAttendance(attMap)
    setNotes(notesMap)
    setSavedCount((data || []).length)
    setSaved(true)
  }

  useEffect(() => {
    if (isAdmin) fetchAllClasses()
    fetchSubjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, isAdmin])

  useEffect(() => {
    if (filterClass && subjectId && period) fetchTimetableHint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterClass, date, period])

  useEffect(() => {
    if (filterClass && subjectId) {
      fetchStudents()
      loadLessonAttendance()
    } else {
      setStudents([])
      setAttendance({})
      setNotes({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterClass, subjectId, date, period])

  const setStatus = (id, status) => setAttendance(prev => ({ ...prev, [id]: status }))
  const setNote = (id, val) => setNotes(prev => ({ ...prev, [id]: val }))

  const markAllPresent = () => { const m = {}; students.forEach(s => { m[s.id] = 'present' }); setAttendance(prev => ({ ...prev, ...m })) }
  const markAllAbsent = () => { const m = {}; students.forEach(s => { m[s.id] = 'absent' }); setAttendance(prev => ({ ...prev, ...m })) }

  const saveLesson = async () => {
    if (!filterClass || !subjectId) { setMessage('Select a class and subject first'); return }
    setSaving(true)
    setMessage('')
    const user = await supabase.auth.getUser()
    const uid = user?.data?.user?.id || authUid
    const periodStart = `${date}T${startTime}:00`
    const periodEnd = `${date}T${endTime}:00`
    const payload = students.map(s => ({
      school_id: schoolId,
      student_id: s.id,
      teacher_id: uid,
      subject_id: subjectId,
      class_name: filterClass,
      period_start: periodStart,
      period_end: periodEnd,
      status: attendance[s.id] || 'present',
      notes: notes[s.id] || '',
      created_by: uid,
    }))
    const { error } = await supabase
      .from('lesson_attendance')
      .upsert(payload, { onConflict: 'student_id,period_start,period_end' })
    if (error) {
      setMessage('Error saving lesson attendance: ' + error.message)
      setTimeout(() => setMessage(''), 5000)
    } else {
      setSavedCount(payload.length)
      setSaved(true)
      setMessage(`Lesson attendance saved for ${payload.length} student(s). Conflicting daily records can be reviewed on the Conflicts tab.`)
      setTimeout(() => setMessage(''), 5000)
    }
    setSaving(false)
  }

  const shiftDate = (dir) => {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + dir)
    setDate(d.toISOString().split('T')[0])
  }

  const filteredStudents = useMemo(() => {
    if (!search) return students
    const q = search.toLowerCase()
    return students.filter(s => s.full_name?.toLowerCase().includes(q) || s.admission_number?.toLowerCase().includes(q))
  }, [students, search])

  const counts = useMemo(() => {
    const get = s => attendance[s.id] || 'present'
    const p = filteredStudents.filter(s => get(s) === 'present').length
    const a = filteredStudents.filter(s => get(s) === 'absent').length
    const l = filteredStudents.filter(s => get(s) === 'late').length
    const e = filteredStudents.filter(s => get(s) === 'excused').length
    const total = filteredStudents.length || 1
    return { present: p, absent: a, late: l, excused: e, rate: Math.round((p / total) * 100) }
  }, [filteredStudents, attendance])

  const selectedSubject = subjects.find(s => s.id === subjectId)

  return (
    <div className="lam-card">
      {/* Controls */}
      <div className="lam-controls">
        <div className="lam-field">
          <label>Date</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button className="lam-input" onClick={() => shiftDate(-1)} style={{ cursor: 'pointer', minWidth: 34 }}><ChevronLeft size={14} /></button>
            <input className="lam-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            <button className="lam-input" onClick={() => shiftDate(1)} style={{ cursor: 'pointer', minWidth: 34 }}><ChevronRight size={14} /></button>
          </div>
        </div>
        <div className="lam-field">
          <label>Class</label>
          <select className="lam-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
            <option value="">Select class</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="lam-field">
          <label>Subject</label>
          <select className="lam-select" value={subjectId} onChange={e => setSubjectId(e.target.value)}>
            <option value="">Select subject</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="lam-field">
          <label>Period</label>
          <select className="lam-select" value={period} onChange={e => { setPeriod(Number(e.target.value)) }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(p => <option key={p} value={p}>Period {p}</option>)}
          </select>
        </div>
        <div className="lam-field">
          <label>Start</label>
          <input className="lam-input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
        </div>
        <div className="lam-field">
          <label>End</label>
          <input className="lam-input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
        </div>
        <div className="lam-spacer" />
        <div className="lam-field">
          <label>&nbsp;</label>
          <button className="lam-save-btn" onClick={saveLesson} disabled={saving || !filterClass || !subjectId || students.length === 0}>
            <Save size={14} /> {saving ? 'Saving...' : 'Save Lesson'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="lam-summary">
        <div className="lam-summary-stats">
          <span className="acx-legend-item"><span className="acx-dot" style={{ background: '#16a34a' }} /> Present {counts.present}</span>
          <span className="acx-legend-item"><span className="acx-dot" style={{ background: '#ef4444' }} /> Absent {counts.absent}</span>
          <span className="acx-legend-item"><span className="acx-dot" style={{ background: '#f59e0b' }} /> Late {counts.late}</span>
          <span className="acx-legend-item"><span className="acx-dot" style={{ background: '#2563eb' }} /> Excused {counts.excused}</span>
        </div>
        <div className="lam-summary-meta">
          <span className="acx-legend-item"><Calendar size={13} /> {new Date(date + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <span className="acx-legend-item"><BookOpen size={13} /> {selectedSubject?.name || 'Subject'}</span>
          <span className="acx-legend-item"><Clock size={13} /> P{period} {startTime} - {endTime}</span>
          <span className="acx-legend-item"><Users size={13} /> {filteredStudents.length} students</span>
          <span className="acx-legend-item" style={{ color: savedCount > 0 ? '#16a34a' : '#94a3b8' }}>
            {savedCount > 0 ? `\u2713 ${savedCount} saved` : 'Not yet saved'}
          </span>
        </div>
      </div>

      {message && <div className="ad-notification ad-notification--info">{message}</div>}

      {!filterClass || !subjectId ? (
        <div className="lam-empty">
          <ClipboardList size={40} color="#cbd5e1" />
          <p>Select class and subject to begin</p>
          <span>Lesson attendance applies to your class + subject for the selected period</span>
        </div>
      ) : (
        <>
          <div className="lam-row">
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="aaan-action" style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#fff' }} onClick={markAllPresent}>
                <CheckCircle size={12} /> All Present
              </button>
              <button className="aaan-action" style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#fff' }} onClick={markAllAbsent}>
                <XCircle size={12} /> All Absent
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Search size={13} color="#94a3b8" />
              <input
                className="lam-input"
                placeholder="Search students..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ minWidth: 200 }}
              />
            </div>
          </div>

          <div className="att-table-wrap">
            {loading ? (
              <p className="att-loading">Loading students...</p>
            ) : filteredStudents.length === 0 ? (
              <div className="lam-empty">
                <ClipboardList size={40} color="#cbd5e1" />
                <p>No students found in {filterClass}</p>
              </div>
            ) : (
              <table className="att-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Adm No.</th>
                    <th>Stream</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(s => {
                    const status = attendance[s.id] || 'present'
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="att-student-cell">
                            <div className="att-avatar">{s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                            <span className="att-student-name">{s.full_name}</span>
                          </div>
                        </td>
                        <td className="att-mono">{s.admission_number || '—'}</td>
                        <td>{s.stream || '—'}</td>
                        <td>
                          <div className="att-segmented">
                            {STATUSES.map(st => (
                              <button
                                key={st.key}
                                className={`att-seg-btn ${status === st.key ? 'active' : ''} ${st.key}`}
                                onClick={() => setStatus(s.id, st.key)}
                                style={status === st.key ? { background: st.color, borderColor: st.color } : {}}
                              >
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
            )}
          </div>

          <div className="lam-save-stats" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center', marginTop: 10 }}>
            {saved && <span style={{ fontSize: 12, color: '#16a34a' }}><CheckCircle size={12} /> {savedCount} record(s) saved</span>}
            <button className="lam-save-btn" onClick={saveLesson} disabled={saving || students.length === 0}>
              <Save size={14} /> {saving ? 'Saving...' : 'Save Lesson'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}