import { useState, useEffect, useMemo } from 'react'
import {
  LayoutDashboard, ClipboardList, BarChart3, MessageSquare,
  Users, LogOut, Calendar, TrendingUp, CheckCircle, XCircle, Clock,
  Phone, Mail, UserCheck, BookOpen, Bell, Menu, X, PencilLine
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { basePath } from '../../lib/paths'
import { useAuthStore } from '../../store/authStore'
import AvatarUpload from '../../components/AvatarUpload'
import { useBrandingStore } from '../../features/branding/brandingStore'
import { useNoticeCount, markNoticesSeen } from '../../hooks/useNoticeCount'
import { weightedScoreMean } from '../../services/grading'
import TeacherAppHome from '../teacher/TeacherAppHome'
import AttendancePage from '../teacher/AttendancePage'
import MarksEntry from '../teacher/MarksEntry'
import '../teacher/MarksEntry.css'
import PerformanceTracker from './PerformanceTracker'
import './PerformanceTracker.css'
import ClassComments from './ClassComments'
import './ClassComments.css'
import ParentCommunication from './ParentCommunication'
import NoticesPage from '../teacher/NoticesPage'
import '../teacher/NoticesPage.css'
import SchoolSupportPage from '../../features/support/SchoolSupportPage'
import '../../features/support/SchoolSupportPage.css'
import ClassTeacherLibrary from '../library/ClassTeacherLibrary'
import TimetablePage from '../teacher/TimetablePage'
import '../teacher/TimetablePage.css'
import RoleSwitcher from '../../components/RoleSwitcher'
import TeacherMobileHeader from '../../components/TeacherMobileHeader'
import '../../components/TeacherMobileHeader.css'
import TeacherMobileNav from '../../components/TeacherMobileNav'
import '../../components/TeacherMobileNav.css'
import './ParentCommunication.css'
import './ClassTeacherDashboard.css'
import { useFeatureAccess } from '../../features/access/FeatureAccessContext'
import { CLASS_TEACHER_NAV_FEATURES, navItemAllowed } from '../../features/access/featureMap'
import FeatureGate from '../../features/access/FeatureGate'

const TERMS = ['Term 1', 'Term 2', 'Term 3']
const CURRENT_YEAR = new Date().getFullYear()

function timeAgo(isoDate) {
  if (!isoDate) return ''
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return `${Math.floor(hours / 24)} day${Math.floor(hours / 24) === 1 ? '' : 's'} ago`
}

const MOBILE_PRIMARY = [
  { key: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { key: 'timetable', label: 'Timetable', icon: Calendar },
  { key: 'attendance', label: 'Attendance', icon: ClipboardList },
  { key: 'marks', label: 'Marks', icon: PencilLine },
]

export default function ClassTeacherDashboard() {
  const { profile: authProfile } = useAuthStore()
  const { logoUrl, schoolName } = useBrandingStore()
  const { features, isSuperadmin } = useFeatureAccess()
  const [activeNav, setActiveNav] = useState('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [teacherData, setTeacherData] = useState(null)
  const [school, setSchool] = useState(null)
  const [currentTerm, setCurrentTerm] = useState('Term 1')
  const [currentYear, setCurrentYear] = useState(CURRENT_YEAR)
  const [stats, setStats] = useState({
    totalStudents: 0,
    attendanceRate: 0,
    averagePerformance: 0,
  })
  const [timetable, setTimetable] = useState([])
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const notifCount = useNoticeCount(authProfile?.school_id, authProfile?.id)

  useEffect(() => {
    fetchTeacherAndSchool()
  }, [])

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { key: 'attendance', label: 'Class Attendance', icon: <ClipboardList size={16} /> },
    { key: 'marks', label: 'Marks Entry', icon: <PencilLine size={16} /> },
    { key: 'performance', label: 'Performance Tracker', icon: <BarChart3 size={16} /> },
    { key: 'comments', label: 'Class Comments', icon: <MessageSquare size={16} /> },
    { key: 'communication', label: 'Parent Communication', icon: <Phone size={16} /> },
    { key: 'timetable', label: 'Timetable', icon: <Calendar size={16} /> },
    { key: 'notices', label: 'Notices', icon: <Bell size={16} /> },
    { key: 'library', label: 'Library', icon: <BookOpen size={16} /> },
    { key: 'support', label: 'Support', icon: <MessageSquare size={16} /> },
  ]

  const filteredNavItems = useMemo(() => {
    if (isSuperadmin) return navItems
    return navItems.filter((item) => navItemAllowed(item, CLASS_TEACHER_NAV_FEATURES, features))
  }, [features, isSuperadmin])

  useEffect(() => {
    if (isSuperadmin) return
    const item = navItems.find((i) => i.key === activeNav)
    if (item && !navItemAllowed(item, CLASS_TEACHER_NAV_FEATURES, features)) {
      setActiveNav('dashboard')
    }
  }, [features, activeNav, isSuperadmin])

  const fetchTeacherAndSchool = async () => {
    setLoading(true)
    const email = authProfile?.email || (await supabase.auth.getUser()).data.user?.email
    if (!email) { setLoading(false); return }

    const { data: teacher } = await supabase
      .from('teachers')
      .select('*, schools(*)')
      .eq('email', email)
      .single()

    if (!teacher) { setLoading(false); return }
    setTeacherData(teacher)
    setSchool(teacher.schools || null)
    setCurrentTerm(teacher.schools?.current_term || 'Term 1')
    setCurrentYear(teacher.schools?.current_year || CURRENT_YEAR)

    const tid = teacher.id || authProfile?.id

    const [timetableRes, noticesRes] = await Promise.all([
      supabase
        .from('timetable_slots')
        .select('*, classes(class_name), subjects(name)')
        .eq('teacher_id', tid)
        .eq('day', new Date().toLocaleDateString('en-US', { weekday: 'long' }))
        .order('start_time'),
      supabase
        .from('notices')
        .select('*, profiles(full_name)')
        .eq('school_id', teacher.school_id)
        .order('created_at', { ascending: false })
        .limit(3),
    ])
    setTimetable(timetableRes.data || [])
    setNotices(noticesRes.data || [])

    if (teacher.class || teacher.assigned_classes?.length) {
      await fetchClassStats(teacher)
    }
    setLoading(false)
  }

  const getAssignedClasses = (teacher) => {
    if (!teacher) return []
    return teacher.assigned_classes?.length ? teacher.assigned_classes : (teacher.class ? [teacher.class] : [])
  }

  const fetchClassStats = async (teacher) => {
    const classes = getAssignedClasses(teacher)
    if (classes.length === 0) return
    const schoolId = teacher.school_id

    const [studentRes, attendanceRes, gradeRes] = await Promise.all([
      supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .in('class', classes)
        .eq('status', 'active'),
      supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .in('class_name', classes)
        .eq('date', new Date().toISOString().split('T')[0])
        .eq('status', 'present'),
      supabase
        .from('grades')
        .select('total_score, max_marks')
        .eq('school_id', schoolId)
        .eq('term', currentTerm)
        .eq('year', currentYear)
        .in('class_name', classes)
        .in('status', ['approved', 'published']),
    ])

    const gradeRows = gradeRes.data || []
    const avg = gradeRows.length
      ? Math.round(weightedScoreMean(gradeRows))
      : 0

    setStats({
      totalStudents: studentRes.count || 0,
      attendanceRate: attendanceRes.count || 0,
      averagePerformance: avg,
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = basePath('/')
  }

  const handleMobileNav = (key) => {
    setMobileOpen(false)
    if (key === 'notices') markNoticesSeen(authProfile?.id)
    setActiveNav(key)
    window.scrollTo({ top: 0 })
  }

  // Mobile home helpers (mirrors teacher dashboard)
  const nowDate = new Date()
  const nowMins = nowDate.getHours() * 60 + nowDate.getMinutes()

  const scheduleRows = timetable.map((t) => {
    const [hs, ms] = (t.start_time || '00:00').split(':').map(Number)
    const [he, me] = (t.end_time || '00:00').split(':').map(Number)
    const startM = hs * 60 + ms
    const endM = he * 60 + me
    let status = 'upcoming'
    if (nowMins >= startM && nowMins <= endM) status = 'ongoing'
    else if (startM > nowMins && startM === Math.min(...(timetable.map(x => { const [a,b]=(x.start_time||'00:00').split(':').map(Number); return a*60+b }).filter(m => m > nowMins) || [0]))) status = 'next'
    return {
      id: t.id,
      startTime: t.start_time?.slice(0, 5),
      endTime: t.end_time?.slice(0, 5),
      subject: t.subjects?.name || t.subject,
      className: t.classes?.class_name?.trim() || t.class,
      room: t.room || t.venue || '',
      status,
    }
  })

  const mobileAnnouncements = notices.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    author: n.profiles?.full_name || 'Admin',
    timeAgo: timeAgo(n.created_at),
  }))

  const attendancePercent = stats.totalStudents > 0
    ? Math.round((stats.attendanceRate / stats.totalStudents) * 100)
    : 0

  const pageTitles = {
    dashboard: 'Class Teacher Dashboard',
    attendance: 'Class Attendance',
    marks: 'Marks Entry',
    performance: 'Performance Tracker',
    comments: 'Class Comments',
    communication: 'Parent Communication',
    timetable: 'Timetable',
    notices: 'Notices & Announcements',
    library: 'Library',
    support: 'Support Tickets',
  }

  const renderContent = () => {
    const classes = getAssignedClasses(teacherData || {})
    const sharedProps = { teacherData, currentTerm, currentYear, assignedClasses: classes }
    switch (activeNav) {
      case 'attendance':
        return <AttendancePage profile={authProfile} />
      case 'marks':
        return <MarksEntry profile={authProfile} />
      case 'performance':
        return <PerformanceTracker {...sharedProps} />
      case 'comments':
        return <ClassComments {...sharedProps} />
      case 'communication':
        return <ParentCommunication {...sharedProps} />
      case 'timetable':
        return <TimetablePage profile={authProfile} />
      case 'notices':
        return <NoticesPage profile={authProfile} />
      case 'library':
        return <ClassTeacherLibrary schoolId={teacherData?.school_id ?? school?.id} classes={getAssignedClasses(teacherData || {})} />
      case 'support':
        return <SchoolSupportPage />
      default:
        return renderDashboard()
    }
  }

  const renderDashboard = () => {
    if (loading) return <div className="ct-loading-state">Loading dashboard...</div>
    if (!teacherData) return <div className="ct-empty-state">No teacher record found. Contact the admin.</div>

    return (
      <>
        <div className="ct-desktop-dashboard">
          <div className="ct-welcome-banner">
            <div>
              <h2>Welcome, {teacherData.full_name || teacherData.name || 'Teacher'}</h2>
              <p>{school?.name || ''} · {getAssignedClasses(teacherData).join(', ') || 'No class assigned'}</p>
            </div>
            <div className="ct-avatar-large">
              {(teacherData.full_name || teacherData.name || 'T')?.[0]?.toUpperCase() || 'T'}
            </div>
          </div>

          <div className="ct-stats-grid">
            {[
              { label: 'Total Students', value: stats.totalStudents, icon: <Users size={20} />, color: '#2563eb' },
              { label: 'Present Today', value: stats.attendanceRate, suffix: `of ${stats.totalStudents}`, icon: <CheckCircle size={20} />, color: '#16a34a' },
              { label: 'Attendance Rate', value: `${attendancePercent}%`, icon: <TrendingUp size={20} />, color: '#7c3aed' },
              { label: 'Avg Performance', value: stats.averagePerformance ? `${stats.averagePerformance}%` : '—', icon: <BarChart3 size={20} />, color: '#ca8a04' },
            ].map((s) => (
              <div className="ct-stat-card" key={s.label}>
                <div className="ct-stat-icon" style={{ color: s.color }}>{s.icon}</div>
                <p className="ct-stat-label">{s.label}</p>
                <p className="ct-stat-value" style={{ color: s.color }}>{s.value}</p>
                {s.suffix && <p className="ct-stat-suffix">{s.suffix}</p>}
              </div>
            ))}
          </div>

          <div className="ct-grid">
            <div className="ct-card">
              <div className="ct-card-header">
                <h3>Quick Actions</h3>
              </div>
              <div className="ct-quick-actions">
                <button className="ct-quick-action-btn" onClick={() => { setActiveNav('attendance'); setMobileOpen(false) }}>
                  <ClipboardList size={20} />
                  <span>Mark Attendance</span>
                </button>
                <button className="ct-quick-action-btn" onClick={() => { setActiveNav('marks'); setMobileOpen(false) }}>
                  <PencilLine size={20} />
                  <span>Enter Marks</span>
                </button>
                <button className="ct-quick-action-btn" onClick={() => { setActiveNav('performance'); setMobileOpen(false) }}>
                  <BarChart3 size={20} />
                  <span>View Performance</span>
                </button>
                <button className="ct-quick-action-btn" onClick={() => { setActiveNav('comments'); setMobileOpen(false) }}>
                  <MessageSquare size={20} />
                  <span>Class Comments</span>
                </button>
                <button className="ct-quick-action-btn" onClick={() => { setActiveNav('communication'); setMobileOpen(false) }}>
                  <Phone size={20} />
                  <span>Contact Parents</span>
                </button>
              </div>
            </div>

            <div className="ct-card">
              <div className="ct-card-header">
                <h3>Class Information</h3>
              </div>
              <div className="ct-info-list">
                <div className="ct-info-item">
                  <span className="ct-info-label">Class</span>
                  <span className="ct-info-value">{getAssignedClasses(teacherData).join(', ') || '—'}</span>
                </div>
                <div className="ct-info-item">
                  <span className="ct-info-label">Students</span>
                  <span className="ct-info-value">{stats.totalStudents}</span>
                </div>
                <div className="ct-info-item">
                  <span className="ct-info-label">Term</span>
                  <span className="ct-info-value">{currentTerm} {currentYear}</span>
                </div>
                <div className="ct-info-item">
                  <span className="ct-info-label">Attendance Rate</span>
                  <span className="ct-info-value">{attendancePercent}%</span>
                </div>
                <div className="ct-info-item">
                  <span className="ct-info-label">Average Score</span>
                  <span className="ct-info-value">{stats.averagePerformance ? `${stats.averagePerformance}%` : '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className={`ct-root ${activeNav === 'dashboard' ? 'ct-ctah-active' : ''}`}>
      <button className="ct-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Open menu">
        <Menu size={20} />
      </button>

      <TeacherMobileHeader
        schoolName={schoolName}
        logoUrl={logoUrl}
        profile={authProfile}
        notifCount={notifCount}
        onOpenMore={() => setMoreOpen(true)}
        onOpenNotices={() => handleMobileNav('notices')}
      />

      <TeacherMobileNav
        items={filteredNavItems}
        primary={MOBILE_PRIMARY}
        activeNav={activeNav}
        onNavigate={handleMobileNav}
        notifCount={notifCount}
        profile={authProfile}
        schoolName={schoolName}
        onLogout={handleLogout}
        moreOpen={moreOpen}
        setMoreOpen={setMoreOpen}
      />

      {mobileOpen && <div className="ct-mobile-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className={`ct-sidebar ${mobileOpen ? 'open' : ''}`}>
        {mobileOpen && (
          <button className="ct-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        )}
        <div className="ct-sidebar-brand">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName || 'Logo'} style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div className="ct-sidebar-logo">{schoolName?.[0] || 'S'}</div>
          )}
          <span>{schoolName || 'School'}</span>
        </div>
        <div className="ct-sidebar-user">
          <AvatarUpload className="ct-user-avatar" size={36} fallbackChar="T" />
          <div>
            <p className="ct-user-name">{authProfile?.full_name || teacherData?.full_name || 'Teacher'}</p>
            <p className="ct-user-role">
              {authProfile?.role ? authProfile.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Class Teacher'}
            </p>
          </div>
        </div>
        <nav className="ct-sidebar-nav">
          {filteredNavItems.map((item) => (
            <button
              key={item.key}
              className={`ct-nav-item ${activeNav === item.key ? 'active' : ''}`}
              onClick={() => { setActiveNav(item.key); if (item.key === 'notices') markNoticesSeen(authProfile?.id); setMobileOpen(false) }}
            >
              <span className="ct-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.key === 'notices' && notifCount > 0 && <span className="nav-badge" style={{ background: '#ef4444', color: '#fff', borderRadius: '50%', fontSize: '10px', fontWeight: 700, padding: '1px 6px', marginLeft: 'auto' }}>{notifCount}</span>}
            </button>
          ))}
        </nav>
        <RoleSwitcher />
        <div className="ct-sidebar-footer">
          <button className="ct-logout-btn" onClick={() => { setMobileOpen(false); handleLogout() }}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="ct-main">
        <header className={`ct-header ${['attendance', 'marks', 'performance', 'comments', 'communication', 'timetable', 'notices', 'library', 'support'].includes(activeNav) ? 'ct-header-hide-mobile' : ''}`}>
          <div>
            <h1>{pageTitles[activeNav]}</h1>
            <p>{currentTerm ? `${currentTerm}, ${currentYear}` : `${currentYear}`} · {school?.name || ''}</p>
          </div>
          <div className="ct-header-actions">
            <div className="ct-avatar">
              {authProfile?.full_name?.[0]?.toUpperCase() || 'T'}
            </div>
          </div>
        </header>

        <FeatureGate feature={CLASS_TEACHER_NAV_FEATURES[activeNav]?.[0]}>
          {renderContent()}
        </FeatureGate>
      </main>

      <div className="ct-app-home">
        <TeacherAppHome
          teacher={{ name: authProfile?.full_name || teacherData?.full_name || 'Teacher', subjectRole: '', avatarUrl: authProfile?.photo_url || null }}
          school={{ name: schoolName || 'School', options: [] }}
          stats={{
            myClasses: getAssignedClasses(teacherData || {}).length,
            todaysLessons: timetable.length,
            pendingAssignments: 0,
            attendanceAverage: attendancePercent,
          }}
          schedule={scheduleRows}
          announcements={mobileAnnouncements}
          unreadNotifications={notifCount}
          activeNav="home"
          hideHeader
          hideNav
          onSelectNav={(key) => {
            if (key === 'home') return
            if (key === 'more') { setMoreOpen(true); return }
            if (key === 'classes') { handleMobileNav('attendance'); return }
            if (key === 'students') { handleMobileNav('attendance'); return }
            if (key === 'assignments') return
          }}
          onSelectSchool={() => {}}
          onQuickAction={(key) => {
            if (key === 'take-attendance') handleMobileNav('attendance')
            else if (key === 'enter-grades') handleMobileNav('marks')
            else if (key === 'view-performance') handleMobileNav('performance')
            else if (key === 'view-reports') handleMobileNav('comments')
          }}
          onViewTimetable={() => handleMobileNav('timetable')}
          onViewAllAnnouncements={() => handleMobileNav('notices')}
        />
      </div>
    </div>
  )
}
