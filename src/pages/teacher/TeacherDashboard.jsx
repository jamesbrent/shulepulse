import { useState, useEffect } from 'react'
import {
  LayoutDashboard, ClipboardList, BarChart2, Calendar,
  Bell, LogOut, Save, CheckCircle, XCircle, MessageSquare,
  BookOpen, Award, Menu, X, Library
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { basePath } from '../../lib/paths'
import './TeacherDashboard.css'
import AttendancePage from './AttendancePage'
import './AttendancePage.css'
import GradesPage from './GradesPage'
import './GradesPage.css'
import TimetablePage from './TimetablePage'
import './TimetablePage.css'
import NoticesPage from './NoticesPage'
import RoleSwitcher from '../../components/RoleSwitcher'
import './NoticesPage.css'
import MyClasses from './MyClasses'
import './MyClasses.css'
import MarksEntry from './MarksEntry'
import './MarksEntry.css'
import CBCCompetency from './CBCCompetency'
import './CBCCompetency.css'
import Comments from './Comments'
import './Comments.css'
import MyLibrary from '../library/MyLibrary'
import { useBrandingStore } from '../../features/branding/brandingStore'
import { useNoticeCount } from '../../hooks/useNoticeCount'
import SchoolSupportPage from '../../features/support/SchoolSupportPage'
import '../../features/support/SchoolSupportPage.css'

export default function TeacherDashboard() {
  const [activeNav, setActiveNav] = useState('dashboard')
  const [activeClass, setActiveClass] = useState(null)
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [attendance, setAttendance] = useState({})
  const [timetable, setTimetable] = useState([])
  const [stats, setStats] = useState({ classes: 0, students: 0, present: 0, pendingGrades: 0 })
  const [profile, setProfile] = useState(null)
  const [teacherId, setTeacherId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { logoUrl, schoolName } = useBrandingStore()
  const notifCount = useNoticeCount(profile?.school_id)

  useEffect(() => {
    fetchTeacherData()
  }, [])

  useEffect(() => {
    if (activeClass) fetchStudents(activeClass)
  }, [activeClass])

  const fetchTeacherData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*, schools(*)')
      .eq('id', user.id)
      .single()

    setProfile(profileData)

    // Look up the teachers table record (timetable_slots.teacher_id references teachers.id, not auth.users.id)
    const { data: teacherRec } = await supabase
      .from('teachers')
      .select('id')
      .eq('email', profileData.email)
      .eq('school_id', profileData.school_id)
      .maybeSingle()

    const tid = teacherRec?.id || user.id
    setTeacherId(tid)

    const { data: timetableData } = await supabase
      .from('timetable_slots')
      .select('*, classes(class_name), subjects(name)')
      .eq('teacher_id', tid)
      .eq('day', new Date().toLocaleDateString('en-US', { weekday: 'long' }))
      .order('start_time')

    setTimetable(timetableData || [])

    const uniqueClasses = [...new Set(timetableData?.map(t => t.classes?.class_name?.trim()).filter(Boolean) || [])]
    setClasses(uniqueClasses)
    if (uniqueClasses.length > 0) setActiveClass(uniqueClasses[0])

    const today = new Date().toISOString().split('T')[0]
    const { count: presentCount } = await supabase
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', tid)
      .eq('date', today)
      .eq('status', 'present')

    const { count: pendingGrades } = await supabase
      .from('grades')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', tid)
      .in('status', ['draft', 'submitted', 'rejected'])

    setStats({
      classes: uniqueClasses.length,
      students: 0,
      present: presentCount || 0,
      pendingGrades: pendingGrades || 0,
    })

    setLoading(false)
  }

  const fetchStudents = async (className) => {
    const { data: studentsData } = await supabase
      .from('students')
      .select('*')
      .eq('school_id', profile?.school_id)
      .eq('class', className)
      .eq('status', 'active')

    setStudents(studentsData || [])

    const today = new Date().toISOString().split('T')[0]
    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('*')
      .eq('date', today)
      .in('student_id', studentsData?.map(s => s.id) || [])

    const attendanceMap = {}
    studentsData?.forEach(s => { attendanceMap[s.id] = 'present' })
    attendanceData?.forEach(a => { attendanceMap[a.student_id] = a.status })
    setAttendance(attendanceMap)

    setStats(prev => ({ ...prev, students: studentsData?.length || 0 }))
  }

  const toggleAttendance = (studentId) => {
    setAttendance(prev => ({
      ...prev,
      [studentId]: prev[studentId] === 'present' ? 'absent' : 'present'
    }))
  }

  const saveAttendance = async () => {
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    if (!teacherId) { setSaving(false); return }

    const records = students.map(s => ({
      school_id: profile?.school_id,
      student_id: s.id,
      teacher_id: teacherId,
      date: today,
      status: attendance[s.id] || 'present',
    }))

    await supabase
      .from('attendance')
      .upsert(records, { onConflict: 'student_id,date' })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = basePath('/')
  }

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { key: 'attendance', label: 'Attendance', icon: <ClipboardList size={16} /> },
    { key: 'grades', label: 'Grades', icon: <BarChart2 size={16} /> },
    { key: 'timetable', label: 'Timetable', icon: <Calendar size={16} /> },
    { key: 'myclasses', label: 'My Classes', icon: <BookOpen size={16} /> },
    { key: 'marks', label: 'Marks Entry', icon: <BarChart2 size={16} /> },
    { key: 'cbc', label: 'CBC Competency', icon: <Award size={16} /> },
    { key: 'comments', label: 'Comments', icon: <MessageSquare size={16} /> },
    { key: 'library', label: 'Library', icon: <Library size={16} /> },
    { key: 'notices', label: 'Notices', icon: <Bell size={16} /> },
    { key: 'support', label: 'Support', icon: <MessageSquare size={16} /> },
  ]

  const pageTitles = {
    dashboard: 'Teacher Dashboard',
    attendance: 'Attendance',
    grades: 'Grades',
    timetable: 'Timetable',
    myclasses: 'My Classes',
    marks: 'Marks Entry',
    cbc: 'CBC Competency',
    comments: 'Comments',
    library: 'Library',
    notices: 'Notices',
    support: 'Support',
  }

  const renderContent = () => {
    switch (activeNav) {
      case 'attendance':
        return <AttendancePage profile={profile} />
      case 'grades':
        return <GradesPage profile={profile} />
      case 'timetable':
        return <TimetablePage profile={profile} />
      case 'myclasses':
        return <MyClasses profile={profile} />
      case 'marks':
        return <MarksEntry profile={profile} />
      case 'cbc':
        return <CBCCompetency profile={profile} />
      case 'comments':
        return <Comments profile={profile} />
      case 'library':
        return <MyLibrary schoolId={profile?.school_id} name={profile?.full_name} email={profile?.email} role="teacher" userId={profile?.id} />
      case 'notices':
        return <NoticesPage profile={profile} />
      case 'support':
        return <SchoolSupportPage />
      default:
        return renderDashboard()
    }
  }

  const renderDashboard = () => {
    if (loading) return <div className="loading-state">Loading dashboard...</div>
    return (
      <>
        <div className="teacher-stats">
          {[
            { label: 'My Classes', value: stats.classes, color: '#2563eb', icon: <Calendar size={20} /> },
            { label: 'Students Today', value: stats.students, color: '#16a34a', icon: <ClipboardList size={20} /> },
            { label: 'Present Today', value: stats.present, color: '#7c3aed', icon: <CheckCircle size={20} /> },
            { label: 'Pending Grades', value: stats.pendingGrades, color: '#ca8a04', icon: <BarChart2 size={20} /> },
          ].map((s) => (
            <div className="t-stat-card" key={s.label}>
              <div className="t-stat-icon" style={{ color: s.color }}>{s.icon}</div>
              <p className="t-stat-label">{s.label}</p>
              <p className="t-stat-value" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="teacher-grid">
          <div className="teacher-card">
            <div className="card-header">
              <h3>Mark Attendance</h3>
              <div className="class-tabs">
                {classes.length === 0 ? (
                  <p className="empty-state-inline">No classes assigned</p>
                ) : (
                  classes.map((c) => (
                    <button
                      key={c}
                      className={`class-tab ${activeClass === c ? 'active' : ''}`}
                      onClick={() => setActiveClass(c)}
                    >
                      {c}
                    </button>
                  ))
                )}
              </div>
            </div>

            {students.length === 0 ? (
              <p className="empty-state">No students found for this class</p>
            ) : (
              <div className="attendance-list">
                {students.map((s) => (
                  <div key={s.id} className="attendance-row">
                    <div className="student-info">
                      <div className="student-avatar-sm">
                        {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="student-name">{s.full_name}</p>
                        <p className="student-adm">{s.admission_number}</p>
                      </div>
                    </div>
                    <button
                      className={`attend-toggle ${attendance[s.id] === 'present' ? 'present' : 'absent'}`}
                      onClick={() => toggleAttendance(s.id)}
                    >
                      {attendance[s.id] === 'present' ? (
                        <><CheckCircle size={14} /> Present</>
                      ) : (
                        <><XCircle size={14} /> Absent</>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              className={`save-attendance-btn ${saved ? 'saved' : ''}`}
              onClick={saveAttendance}
              disabled={saving || students.length === 0}
            >
              {saved ? (
                <><CheckCircle size={16} /> Attendance Saved</>
              ) : (
                <><Save size={16} /> {saving ? 'Saving...' : 'Save Attendance'}</>
              )}
            </button>
          </div>

          <div className="teacher-side">
            <div className="teacher-card">
              <div className="card-header"><h3>Today's Timetable</h3></div>
              {timetable.length === 0 ? (
                <p className="empty-state">No classes scheduled today</p>
              ) : (
                <div className="timetable-list">
                  {timetable.map((t) => (
                    <div key={t.id} className="timetable-row">
                      <span className="timetable-time">
                        {t.start_time?.slice(0, 5)}
                      </span>
                      <div>
                        <p className="timetable-subject">{t.subjects?.name || t.subject}</p>
                        <p className="timetable-class">{t.classes?.class_name?.trim() || t.class}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="teacher-card">
              <div className="card-header"><h3>Attendance Summary</h3></div>
              <div className="summary-stats">
                <div className="summary-row">
                  <span>Total Students</span>
                  <strong>{students.length}</strong>
                </div>
                <div className="summary-row">
                  <span>Present</span>
                  <strong className="text-green">
                    {Object.values(attendance).filter(v => v === 'present').length}
                  </strong>
                </div>
                <div className="summary-row">
                  <span>Absent</span>
                  <strong className="text-red">
                    {Object.values(attendance).filter(v => v === 'absent').length}
                  </strong>
                </div>
                <div className="summary-row">
                  <span>Rate</span>
                  <strong className="text-blue">
                    {students.length > 0
                      ? Math.round((Object.values(attendance).filter(v => v === 'present').length / students.length) * 100)
                      : 0}%
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="teacher-root">
      <button className="teacher-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Open menu">
        <Menu size={20} />
      </button>

      {mobileOpen && <div className="teacher-mobile-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className={`teacher-sidebar ${mobileOpen ? 'open' : ''}`}>
        {mobileOpen && (
          <button className="teacher-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        )}
        <div className="sidebar-brand">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName || 'Logo'} style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div className="sidebar-logo">{schoolName?.[0] || 'S'}</div>
          )}
          <span>{schoolName || 'School'}</span>
        </div>
        <div className="teacher-profile">
          <div className="teacher-avatar">
            {profile?.full_name?.[0] || 'T'}
          </div>
          <div>
            <p className="teacher-name">{profile?.full_name || 'Teacher'}</p>
            <p className="teacher-role">Teacher</p>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${activeNav === item.key ? 'active' : ''}`}
              onClick={() => { setActiveNav(item.key); setMobileOpen(false) }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.key === 'notices' && notifCount > 0 && <span className="nav-badge" style={{ background: '#ef4444', color: '#fff', borderRadius: '50%', fontSize: '10px', fontWeight: 700, padding: '1px 6px', marginLeft: 'auto' }}>{notifCount}</span>}
            </button>
          ))}
        </nav>
        <RoleSwitcher />
        <div className="sidebar-footer">
          <button className="logout-btn" onClick={() => { handleLogout(); setMobileOpen(false) }}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="teacher-main">
        <header className="teacher-header">
          <div>
            <h1>{pageTitles[activeNav]}</h1>
            <p>{new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="header-actions">
            <button className="btn-primary" onClick={() => { setActiveNav('grades'); setMobileOpen(false) }}>
              <BarChart2 size={15} />
              Submit Grades
            </button>
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  )
}