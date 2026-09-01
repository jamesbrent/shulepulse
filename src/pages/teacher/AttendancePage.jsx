import { useState, useEffect, useMemo } from 'react'
import {
  ClipboardList, Calendar, AlertTriangle, TrendingUp, FileSpreadsheet,
  Clock, Users, Award, Activity, Target, BarChart3, Download,
  UserCheck, UserX, Save, Eye, BookOpen,
  ChevronRight, ChevronDown, School,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useFeatureAccess } from '../../features/access/FeatureAccessContext'
import '../../components/attendance/AttendanceShared.css'
import './AttendancePage.css'
import AttendanceFilters from '../../components/attendance/AttendanceFilters'
import AttendanceTable from '../../components/attendance/AttendanceTable'
import AttendanceTrends from '../../components/attendance/AttendanceTrends'
import StudentAnalytics from '../../components/attendance/StudentAnalytics'
import ExportPanel from '../../components/attendance/ExportPanel'
import LessonAttendancePanel from '../../components/attendance/LessonAttendancePanel'
import { exportAttendanceCSV, exportAttendancePDF } from '../../services/attendance/exportAttendance'

export default function AttendancePage({ profile }) {
  const { has } = useFeatureAccess()
  const hasLesson = has('students.attendance.lesson')
  const [records, setRecords] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('all')
  const [filterStream, setFilterStream] = useState('')
  const [streams, setStreams] = useState([])
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
  const [attendance, setAttendance] = useState({})
  const [notes, setNotes] = useState({})
  const [classes, setClasses] = useState([])
  const [activeTab, setActiveTab] = useState('mark')
  const [notifications, setNotifications] = useState([])
  const [submitted, setSubmitted] = useState(false)
  const [teacherRec, setTeacherRec] = useState(null)
  const [teacherName, setTeacherName] = useState('')
  const [activityFeed, setActivityFeed] = useState([])
  const [todaySlots, setTodaySlots] = useState([])

  useEffect(() => { fetchTeacherInfo() }, [profile])
  useEffect(() => {
    if (activeTab === 'mark' && teacherRec) {
      fetchStudents()
      loadExistingAttendance()
    } else if (activeTab === 'history') {
      fetchRecords()
    }
  }, [filterDate, filterClass, activeTab, teacherRec])
  useEffect(() => {
    if (activeTab === 'mark' && classes.length > 0 && teacherRec) {
      fetchActivityFeed()
    }
  }, [activeTab, classes, teacherRec, filterDate])

  const fetchTeacherInfo = async () => {
    if (!profile?.school_id) return
    const { data } = await supabase
      .from('teachers')
      .select('id, full_name')
      .eq('email', profile.email)
      .eq('school_id', profile.school_id)
      .maybeSingle()
    if (!data) return
    setTeacherRec(data)
    setTeacherName(data.full_name || 'Teacher')

    const { data: slots } = await supabase
      .from('timetable_slots')
      .select('class_id, classes(class_name)')
      .eq('teacher_id', data.id)
    const unique = [...new Set((slots || []).map(s => s.classes?.class_name?.trim()).filter(Boolean))].sort()
    setClasses(unique)
    if (unique.length > 0 && filterClass === 'all') {
      setFilterClass(unique[0])
    }

    const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' })
    const { data: slotsToday } = await supabase
      .from('timetable_slots')
      .select('*, classes(class_name), subjects(name)')
      .eq('teacher_id', data.id)
      .eq('day', weekday)
      .order('start_time')
    setTodaySlots(slotsToday || [])
    const { data: allStudents } = await supabase
      .from('students')
      .select('stream')
      .eq('school_id', profile.school_id)
      .eq('status', 'active')
    const uniqueStreams = [...new Set((allStudents || []).map(s => s.stream).filter(Boolean))].sort()
    setStreams(uniqueStreams)
  }

  const fetchStudents = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('students')
      .select('id, full_name, admission_number, class')
      .eq('school_id', profile.school_id)
      .eq('status', 'active')
      .order('full_name')
    setStudents(data || [])
    setLoading(false)
  }

  const loadExistingAttendance = async () => {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('school_id', profile.school_id)
      .eq('date', filterDate)
    const attMap = {}
    const notesMap = {}
    let hasSubmitted = false
    if (data) {
      data.forEach(r => {
        attMap[r.student_id] = r.status
        if (r.notes) notesMap[r.student_id] = r.notes
        if (r.teacher_id === teacherRec?.id) hasSubmitted = true
      })
    }
    setAttendance(attMap)
    setNotes(notesMap)
    setSubmitted(hasSubmitted)
  }

  const fetchRecords = async () => {
    setLoading(true)
    let query = supabase
      .from('attendance')
      .select('*, students(full_name, admission_number, class)')
      .eq('school_id', profile.school_id)
      .eq('date', filterDate)
      .order('created_at', { ascending: false })
    if (filterClass !== 'all') {
      query = query.eq('students.class', filterClass)
    }
    const { data } = await query
    const recs = (data || []).filter(r => r.students)
    setRecords(recs)
    setLoading(false)
  }

  const fetchActivityFeed = async () => {
    if (!teacherRec || classes.length === 0) return
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const { data: recentData } = await supabase
      .from('attendance')
      .select('date, class_name, created_at, teacher_name')
      .eq('school_id', profile.school_id)
      .in('class_name', classes)
      .gte('date', weekAgo.toISOString().split('T')[0])
      .order('created_at', { ascending: false })
      .limit(20)
    if (!recentData) return
    const seen = new Set()
    const feed = []
    recentData.forEach(r => {
      const key = `${r.date}_${r.class_name}`
      if (!seen.has(key)) {
        seen.add(key)
        const isToday = r.date === filterDate
        const isYesterday = r.date === new Date(Date.now() - 86400000).toISOString().split('T')[0]
        let timeLabel
        if (isToday) timeLabel = 'Today'
        else if (isYesterday) timeLabel = 'Yesterday'
        else timeLabel = new Date(r.date + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
        feed.push({
          type: 'saved',
          message: `${r.class_name} attendance ${isToday ? 'saved' : 'recorded'}`,
          time: timeLabel,
          teacher: r.teacher_name,
        })
      }
    })
    setActivityFeed(feed.slice(0, 10))
  }

  const setStatus = (studentId, status) => {
    setAttendance(prev => ({ ...prev, [studentId]: status }))
  }
  const setNote = (studentId, value) => {
    setNotes(prev => ({ ...prev, [studentId]: value }))
  }
  const markAllPresent = () => {
    const allPresent = {}
    students.forEach(s => { allPresent[s.id] = 'present' })
    setAttendance(prev => ({ ...prev, ...allPresent }))
  }
  const markAllAbsent = () => {
    const allAbsent = {}
    students.forEach(s => { allAbsent[s.id] = 'absent' })
    setAttendance(prev => ({ ...prev, ...allAbsent }))
  }
  const resetAttendance = () => {
    const reset = {}
    students.forEach(s => { reset[s.id] = 'present' })
    setAttendance(prev => ({ ...prev, ...reset }))
  }

  const fmtTime = (t) => {
    if (!t) return ''
    const [h, m] = String(t).split(':').map(Number)
    if (isNaN(h)) return t
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hh = h % 12 === 0 ? 12 : h % 12
    return `${hh}:${String(m || 0).padStart(2, '0')} ${ampm}`
  }

  const classBadge = (cn) => {
    if (!cn) return '?'
    return cn.replace(/^(Form|Grade|Class|Standard)\s*/i, '').split(' ')[0]
  }

  const scrollToMarksheet = () => {
    document.getElementById('att-mobile-marksheet')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const markClass = (cls) => {
    if (!cls) return
    setFilterClass(cls)
    setActiveTab('mark')
    requestAnimationFrame(scrollToMarksheet)
  }

  const saveAttendance = async () => {
    if (submitted) {
      alert('Attendance has already been submitted for this date. Contact admin to override.')
      return
    }
    setSaving(true)
    setSaved(false)
    const email = profile?.email || (await supabase.auth.getUser()).data.user?.email
    const records = students
      .filter(s => filterClass === 'all' || s.class === filterClass)
      .map(s => ({
        school_id: profile.school_id,
        student_id: s.id,
        date: filterDate,
        status: attendance[s.id] || 'present',
        notes: notes[s.id] || '',
        class_name: s.class,
        teacher_name: teacherRec?.full_name || email,
        teacher_id: teacherRec?.id,
      }))
    const { error } = await supabase
      .from('attendance')
      .upsert(records, { onConflict: 'student_id,date' })
    if (error) {
      alert('Error saving: ' + error.message)
    } else {
      setSaved(true)
      setSubmitted(true)
      const absences = records.filter(r => r.status === 'absent')
      const className = filterClass !== 'all' ? filterClass : 'Multiple classes'
      setActivityFeed(prev => [
        { type: 'saved', message: `${className} attendance saved`, time: 'Just now', teacher: teacherRec?.full_name },
        ...prev,
      ].slice(0, 10))
      if (absences.length > 0) {
        setNotifications([{ type: 'warning', message: `${absences.length} student(s) marked absent` }])
        setTimeout(() => setNotifications([]), 5000)
      }
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  const handleExportCSV = () => {
    if (records.length === 0) { alert('No records to export.'); return }
    exportAttendanceCSV(records, `attendance_${filterDate}.csv`)
  }
  const handleExportPDF = () => {
    if (records.length === 0) { alert('No records to export.'); return }
    exportAttendancePDF(records, {
      school: profile?.schools,
      title: 'Attendance Report',
      date: formattedDate,
    })
  }

  const formattedDate = new Date(filterDate + 'T00:00:00').toLocaleDateString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
  const todayStr = new Date().toISOString().split('T')[0]

  const classData = useMemo(() => {
    const map = {}
    students.forEach(s => {
      if (filterClass !== 'all' && s.class !== filterClass) return
      const cls = s.class
      if (!map[cls]) map[cls] = { total: 0, present: 0, absent: 0, late: 0, excused: 0, marked: 0 }
      map[cls].total++
      const status = attendance[s.id]
      if (status) {
        map[cls].marked++
        if (status === 'present') map[cls].present++
        else if (status === 'absent') map[cls].absent++
        else if (status === 'late') map[cls].late++
        else if (status === 'excused') map[cls].excused++
      }
    })
    return map
  }, [students, attendance, filterClass])

  const kpiData = useMemo(() => {
    const present = Object.values(classData).reduce((s, d) => s + d.present, 0)
    const absent = Object.values(classData).reduce((s, d) => s + d.absent, 0)
    const late = Object.values(classData).reduce((s, d) => s + d.late, 0)
    const marked = present + absent + late + Object.values(classData).reduce((s, d) => s + d.excused, 0)
    const rate = marked > 0 ? Math.round((present / marked) * 100) : 0
    return { present, absent, late, marked, total: Object.values(classData).reduce((s, d) => s + d.total, 0), rate }
  }, [classData])

  const insights = useMemo(() => {
    const entries = Object.entries(classData)
      .filter(([, d]) => d.marked > 0)
      .map(([c, d]) => ({ c, rate: Math.round((d.present / d.marked) * 100) }))
    const sorted = [...entries].sort((a, b) => b.rate - a.rate)
    return {
      highest: sorted.length > 0 ? sorted[0] : null,
      lowest: sorted.length > 0 ? [...sorted].reverse()[0] : null,
    }
  }, [classData])

  if (!teacherRec && loading) return (
    <div className="ad-load">
      <div className="ad-spin" />
      <span>Loading attendance...</span>
    </div>
  )

  if (classes.length === 0) {
    return (
      <div className="ad-dash">
        <div className="empty-att">
          <ClipboardList size={40} color="#cbd5e1" />
          <p>No classes assigned to you</p>
          <span>Classes appear here once assigned in the timetable</span>
        </div>
      </div>
    )
  }

  return (
    <div className="ad-dash">

      <div className="att-tabs">
        <button className={`att-tab ${activeTab === 'mark' ? 'active' : ''}`} onClick={() => setActiveTab('mark')}>
          <ClipboardList size={14} /> Mark Attendance
        </button>
        <button className={`att-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          <TrendingUp size={14} /> Records
        </button>
        <button className={`att-tab ${activeTab === 'export' ? 'active' : ''}`} onClick={() => setActiveTab('export')}>
          <FileSpreadsheet size={14} /> Export & Reports
        </button>
        {hasLesson && (
          <button className={`att-tab ${activeTab === 'lesson' ? 'active' : ''}`} onClick={() => setActiveTab('lesson')}>
            <BookOpen size={14} /> Lesson Attendance
          </button>
        )}
      </div>

      {activeTab === 'mark' && (
        <div className="desktop-attendance-layout">

          <div className="ad-header">
            <div className="ad-header-top">
              <h2 className="ad-header-title"><ClipboardList size={22} /> Attendance</h2>
              <div className="ad-header-actions">
                {saved && <span className="ad-saved-badge">Saved!</span>}
                <button
                  className="ad-btn ad-btn--primary ad-btn--lg"
                  onClick={saveAttendance}
                  disabled={saving || submitted}
                >
                  <Save size={15} />
                  {saving ? 'Saving...' : 'Save Attendance'}
                </button>
              </div>
            </div>
            <div className="ad-status">
              <span className="ad-pill ad-pill--blue"><Award size={12} /> {teacherName}</span>
              <span className="ad-pill ad-pill--green">
                <Calendar size={12} /> {formattedDate}
                {filterDate === todayStr && <span style={{ marginLeft: 4 }}>&bull; Today</span>}
              </span>
              <span className="ad-pill ad-pill--purple"><Users size={12} /> {classes.length} Classes</span>
              <span className="ad-pill ad-pill--amber">
                <TrendingUp size={12} /> Rate: {kpiData.rate}%
              </span>
            </div>
          </div>

          <div className="ad-kpi-grid">
            <div className="ad-kpi">
              <div className="ad-kpi-top">
                <div>
                  <p className="ad-kpi-val">{kpiData.present}</p>
                  <p className="ad-kpi-label">Present</p>
                </div>
                <div className="ad-kpi-icon ad-kpi-icon--green"><UserCheck size={20} /></div>
              </div>
              <p className="ad-kpi-sub">Students present today</p>
            </div>
            <div className="ad-kpi">
              <div className="ad-kpi-top">
                <div>
                  <p className="ad-kpi-val">{kpiData.absent}</p>
                  <p className="ad-kpi-label">Absent</p>
                </div>
                <div className="ad-kpi-icon ad-kpi-icon--red"><UserX size={20} /></div>
              </div>
              <p className="ad-kpi-sub">Students absent today</p>
            </div>
            <div className="ad-kpi">
              <div className="ad-kpi-top">
                <div>
                  <p className="ad-kpi-val">{kpiData.late}</p>
                  <p className="ad-kpi-label">Late</p>
                </div>
                <div className="ad-kpi-icon ad-kpi-icon--amber"><Clock size={20} /></div>
              </div>
              <p className="ad-kpi-sub">Late arrivals</p>
            </div>
            <div className="ad-kpi">
              <div className="ad-kpi-top">
                <div>
                  <p className="ad-kpi-val">{kpiData.rate}%</p>
                  <p className="ad-kpi-label">Attendance Rate</p>
                </div>
                <div className="ad-kpi-icon ad-kpi-icon--blue"><TrendingUp size={20} /></div>
              </div>
              <p className="ad-kpi-sub">Overall attendance today</p>
            </div>
          </div>

          <div className="ad-layout">
            <div className="ad-main">
              {notifications.map((n, i) => (
                <div key={i} className={`ad-notification ad-notification--${n.type}`}>
                  {n.type === 'warning' && <AlertTriangle size={14} />}
                  {n.message}
                </div>
              ))}

              <AttendanceFilters
                filterDate={filterDate}
                onDateChange={setFilterDate}
                filterClass={filterClass}
                onClassChange={setFilterClass}
                classes={classes}
                showAllOption={true}
                search={search}
                onSearchChange={setSearch}
                onMarkAllPresent={markAllPresent}
                onMarkAllAbsent={markAllAbsent}
                onResetAll={resetAttendance}
                onSave={saveAttendance}
                saving={saving}
                saved={saved}
                canSave={students.length > 0 && !submitted}
                showBulkActions={students.length > 0}
                showSave={false}
              />

              {submitted && (
                <div className="ad-notification ad-notification--info">
                  <AlertTriangle size={14} />
                  Attendance already submitted for this date. Contact admin to override.
                </div>
              )}

              <AttendanceTable
                students={students}
                attendance={attendance}
                onStatusChange={submitted ? undefined : setStatus}
                notes={notes}
                onNotesChange={submitted ? undefined : setNote}
                loading={loading}
                canEdit={!submitted}
                showNotes={true}
                showAdm={true}
                showClass={true}
                noStudentMessage="No students found for your assigned classes."
              />
            </div>

            <div className="ad-aside">
              <div className="ad-card">
                <div className="ad-card-hdr">
                  <Target size={16} color="#7C3AED" />
                  <h4>Attendance Insights</h4>
                </div>
                <div className="ad-insights">
                  <div className="ad-insight-row">
                    <span className="ad-insight-label">Overall Rate</span>
                    <span className={`ad-insight-val ${kpiData.rate >= 80 ? 'ad-insight-val--high' : kpiData.rate >= 50 ? 'ad-insight-val--mid' : 'ad-insight-val--low'}`}>
                      {kpiData.rate}%
                    </span>
                  </div>
                  <div className="ad-insight-row">
                    <span className="ad-insight-label">Highest Class</span>
                    <span className="ad-insight-val ad-insight-val--high">
                      {insights.highest ? `${insights.highest.c} (${insights.highest.rate}%)` : '—'}
                    </span>
                  </div>
                  <div className="ad-insight-row">
                    <span className="ad-insight-label">Lowest Class</span>
                    <span className="ad-insight-val ad-insight-val--low">
                      {insights.lowest ? `${insights.lowest.c} (${insights.lowest.rate}%)` : '—'}
                    </span>
                  </div>
                  <div className="ad-insight-divider" />
                  <div className="ad-insight-row">
                    <span className="ad-insight-label">Total Students</span>
                    <span className="ad-insight-val ad-insight-val--high">{kpiData.total}</span>
                  </div>
                  <div className="ad-insight-row">
                    <span className="ad-insight-label">Total Marked</span>
                    <span className="ad-insight-val ad-insight-val--high">{kpiData.marked}</span>
                  </div>
                  <div className="ad-insight-divider" />
                  <div className="ad-insight-row">
                    <span className="ad-insight-label">Frequently Absent</span>
                    <span className="ad-insight-val ad-insight-val--low">
                      {kpiData.absent > 3 ? `${kpiData.absent} today` : 'Minimal'}
                    </span>
                  </div>
                  <div className="ad-insight-row">
                    <span className="ad-insight-label">Late Arrivals</span>
                    <span className="ad-insight-val ad-insight-val--mid">{kpiData.late}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="ad-quick-actions">
            <button className="ad-qa-btn" onClick={() => {
              if (filterClass !== 'all') {
                document.querySelector('.att-toolbar')?.scrollIntoView({ behavior: 'smooth' })
              }
            }}>
              <div className="ad-qa-icon"><ClipboardList size={18} /></div>
              Mark Attendance
            </button>
            <button className="ad-qa-btn" onClick={() => setActiveTab('history')}>
              <div className="ad-qa-icon"><Eye size={18} /></div>
              View Records
            </button>
            <button className="ad-qa-btn" onClick={() => setActiveTab('export')}>
              <div className="ad-qa-icon"><BarChart3 size={18} /></div>
              Reports
            </button>
            <button className="ad-qa-btn" onClick={handleExportCSV}>
              <div className="ad-qa-icon"><Download size={18} /></div>
              Export
            </button>
            <button className="ad-qa-btn" onClick={() => {
              setNotifications(prev => [...prev, { type: 'info', message: 'Excused absences can be managed from the student row status buttons' }])
            }}>
              <div className="ad-qa-icon"><UserX size={18} /></div>
              Excused
            </button>
          </div>

          <div className="ad-recent-activity">
            <div className="ad-card-hdr">
              <Activity size={16} color="#2563EB" />
              <h4>Recent Activity</h4>
            </div>
            {activityFeed.length === 0 ? (
              <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>
                No recent activity
              </p>
            ) : (
              <div className="ad-feed">
                {activityFeed.map((item, i) => (
                  <div key={i} className="ad-feed-item">
                    <div className="ad-feed-dot ad-feed-dot--blue" />
                    <div className="ad-feed-text">
                      <div className="ad-feed-msg">{item.message}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {item.time}{item.teacher ? ` \u00B7 ${item.teacher}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Mobile: Mark Attendance ─────────────────────────── */}
      {activeTab === 'mark' && (
        <div className="mobile-attendance-layout">
          {profile?.schools?.school_name && (
            <div className="att-mob-school">
              <School size={14} />
              <span>{profile.schools.school_name}</span>
              <ChevronDown size={14} />
            </div>
          )}

          <div className="att-mob-title">
            <h3>Attendance</h3>
            <p>{formattedDate}</p>
          </div>

          <div className="att-card att-glance">
            <div className="att-card-head">
              <h4>Today at a Glance</h4>
              <ChevronRight size={18} />
            </div>
            <div className="att-glance-grid">
              <div className="att-glance-stat">
                <span className="att-glance-val att-glance-val--green">{kpiData.present}</span>
                <span className="att-glance-label">Present</span>
              </div>
              <div className="att-glance-stat">
                <span className="att-glance-val att-glance-val--red">{kpiData.absent}</span>
                <span className="att-glance-label">Absent</span>
              </div>
              <div className="att-glance-stat">
                <span className="att-glance-val att-glance-val--amber">{kpiData.late}</span>
                <span className="att-glance-label">Late</span>
              </div>
              <div className="att-glance-stat">
                <span className="att-glance-val att-glance-val--blue">{kpiData.rate}%</span>
                <span className="att-glance-label">Attendance Rate</span>
              </div>
            </div>
          </div>

          <div className="att-section-head">
            <h4>Classes Today</h4>
            <span className="att-badge">{todaySlots.length}</span>
          </div>
          <div className="att-classes-list">
            {todaySlots.map(slot => {
              const cn = slot.classes?.class_name?.trim() || ''
              const d = classData[cn] || { total: 0, marked: 0 }
              const done = d.total > 0 && d.marked >= d.total
              const tone = d.marked > 0 ? (done ? 'complete' : 'partial') : 'empty'
              const label = d.marked > 0 ? `${d.marked}/${d.total} marked` : 'Not marked'
              const empty = !cn || !slot.subjects?.name
              return (
                <div key={slot.id || cn} className="att-class-item" onClick={() => markClass(cn)}>
                  <div className="att-class-badge">{classBadge(cn)}</div>
                  <div className="att-class-body">
                    <div className="att-class-name">{cn || 'Free period'}</div>
                    <div className="att-class-time">
                      {fmtTime(slot.start_time)} – {fmtTime(slot.end_time)}
                    </div>
                    <div className="att-class-meta">
                      <span className={`att-class-subj ${empty ? 'att-class-subj--empty' : ''}`}>
                        {slot.subjects?.name || empty ? 'No subject' : slot.subjects?.name}
                      </span>
                      <span className={`att-class-status att-class-status--${tone}`}>{label}</span>
                    </div>
                  </div>
                  <button className="att-mark-btn" onClick={(e) => { e.stopPropagation(); markClass(cn) }}>
                    Mark
                  </button>
                  <ChevronRight size={18} className="att-class-chev" />
                </div>
              )
            })}
            {todaySlots.length === 0 && (
              <div className="att-empty">
                <ClipboardList size={28} color="#cbd5e1" />
                <p>No classes scheduled today</p>
                <span>Classes appear here once in the timetable</span>
              </div>
            )}
          </div>

          <div className="att-quickcard">
            <div className="att-quickcard-body">
              <h4>Quick Mark Attendance</h4>
              <p>Mark attendance for any class in just a few taps.</p>
            </div>
            <button className="att-quick-btn" onClick={scrollToMarksheet}>
              Quick Mark
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="att-mob-marksheet" id="att-mobile-marksheet">
            <div className="att-section-head">
              <h4>{filterClass === 'all' ? 'All Classes' : filterClass}</h4>
              <span className="att-badge">{students.length}</span>
            </div>
            <AttendanceFilters
              filterDate={filterDate}
              onDateChange={setFilterDate}
              filterClass={filterClass}
              onClassChange={setFilterClass}
              classes={classes}
              showAllOption={true}
              search={search}
              onSearchChange={setSearch}
              onMarkAllPresent={markAllPresent}
              onMarkAllAbsent={markAllAbsent}
              onResetAll={resetAttendance}
              onSave={saveAttendance}
              saving={saving}
              saved={saved}
              canSave={students.length > 0 && !submitted}
              showBulkActions={students.length > 0}
              showSave={false}
            />
            {submitted && (
              <div className="ad-notification ad-notification--info">
                <AlertTriangle size={14} />
                Attendance already submitted for this date. Contact admin to override.
              </div>
            )}
            <AttendanceTable
              students={students}
              attendance={attendance}
              onStatusChange={submitted ? undefined : setStatus}
              notes={notes}
              onNotesChange={submitted ? undefined : setNote}
              loading={loading}
              canEdit={!submitted}
              showNotes={true}
              showAdm={true}
              showClass={true}
              noStudentMessage="No students found for your assigned classes."
            />
            <button className="att-mob-save" onClick={saveAttendance} disabled={saving || submitted}>
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Attendance'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="desktop-attendance-layout">

          <div className="ad-header">
            <div className="ad-header-top">
              <h2 className="ad-header-title"><TrendingUp size={22} /> Attendance Records</h2>
            </div>
            <div className="ad-status">
              <span className="ad-pill ad-pill--blue"><Award size={12} /> {teacherName}</span>
              <span className="ad-pill ad-pill--green"><Calendar size={12} /> {formattedDate}</span>
              <span className="ad-pill ad-pill--purple"><Users size={12} /> {classes.length} Classes</span>
            </div>
          </div>

          <AttendanceFilters
            filterDate={filterDate}
            onDateChange={setFilterDate}
            filterClass={filterClass}
            onClassChange={setFilterClass}
            classes={classes}
            showAllOption={true}
            search={search}
            onSearchChange={setSearch}
            showExport={true}
            onExportCSV={handleExportCSV}
            onExportPDF={handleExportPDF}
          />

          <div className="att-filter-row">
            <p className="att-date-label">
              <Calendar size={13} /> {formattedDate}
              {filterDate === todayStr && <span className="today-badge">Today</span>}
            </p>
          </div>

          <AttendanceTable
            records={records}
            loading={loading}
            canEdit={false}
            showAdm={true}
            showClass={true}
            showTime={true}
            showNotes={true}
          />
        </div>
      )}

      {/* ─── Mobile: Records ─────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="mobile-attendance-layout">
          <div className="att-mob-title">
            <h3>Attendance Records</h3>
            <p>{formattedDate}</p>
          </div>
          <div className="att-card att-history-card">
            <AttendanceFilters
              filterDate={filterDate}
              onDateChange={setFilterDate}
              filterClass={filterClass}
              onClassChange={setFilterClass}
              classes={classes}
              showAllOption={true}
              search={search}
              onSearchChange={setSearch}
              showExport={true}
              onExportCSV={handleExportCSV}
              onExportPDF={handleExportPDF}
            />
          </div>
          <AttendanceTable
            records={records}
            loading={loading}
            canEdit={false}
            showAdm={true}
            showClass={true}
            showTime={true}
            showNotes={true}
          />
        </div>
      )}

      {activeTab === 'history' && (
        <div className="att-shared-analytics">
          <AttendanceTrends schoolId={profile.school_id} filterClass={filterClass} />
          <StudentAnalytics schoolId={profile.school_id} filterClass={filterClass} />
        </div>
      )}

      {activeTab === 'export' && (
        <ExportPanel
          schoolId={profile.school_id}
          classes={classes}
          streams={streams}
          filterClass={filterClass}
          filterStream={filterStream}
          onClassChange={setFilterClass}
          onStreamChange={setFilterStream}
          school={profile?.schools}
          currentTerm={profile?.schools?.current_term}
          currentYear={new Date().getFullYear()}
        />
      )}

      {activeTab === 'lesson' && hasLesson && (
        <LessonAttendancePanel profile={profile} assignedClasses={classes} />
      )}
    </div>
  )
}
