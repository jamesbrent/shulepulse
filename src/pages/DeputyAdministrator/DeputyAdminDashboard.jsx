import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Users, GraduationCap, Calendar,
  ClipboardList, ShieldAlert, LogOut, ChevronRight,
  BookOpen, Search, AlertTriangle, CheckCircle, Clock,
  UserCheck, FileText, BarChart2, X, MessageSquare, Award, Bell, Menu
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { basePath } from '../../lib/paths'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import './DeputyAdminDashboard.css'
import RoleSwitcher from '../../components/RoleSwitcher'
import Students from './Students'
import Teachers from './Teachers'
import Timetable from './Timetable'
import Exams from './Exams'
import Discipline from './Discipline'
import Attendance from './Attendance'
import SupportTicket from './SupportTicket'
import CBCCompetency from './CBCCompetency'
import NoticesPage from '../teacher/NoticesPage'
import '../teacher/NoticesPage.css'

export default function DeputyAdminDashboard() {
  const { profile: authProfile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const [activeNav, setActiveNav] = useState('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [stats, setStats] = useState({
    totalStudents: 0,
    disciplineCases: 0,
    teachersCount: 0,
    examsActive: 0,
  })
  const [recentDiscipline, setRecentDiscipline] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [currentTerm, currentYear])

  const fetchDashboardData = async () => {
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const schoolId = profile?.school_id
    if (!schoolId) { setLoading(false); return }

    const [studentRes, disciplineRes, teacherRes, examRes, recentRes] = await Promise.all([
      supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('status', 'active'),
      supabase
        .from('discipline_records')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId),
      supabase
        .from('teachers')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId),
      supabase
        .from('grades')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId),
      supabase
        .from('discipline_records')
        .select('*, students(full_name, class, stream)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    setStats({
      totalStudents: studentRes.count || 0,
      disciplineCases: disciplineRes.count || 0,
      teachersCount: teacherRes.count || 0,
      examsActive: examRes.count || 0,
    })

    setRecentDiscipline(recentRes.data || [])
    setLoading(false)
  }

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { key: 'students', label: 'Students', icon: <Users size={18} /> },
    { key: 'teachers', label: 'Teachers', icon: <GraduationCap size={18} /> },
    { key: 'timetable', label: 'Timetable', icon: <Calendar size={18} /> },
    { key: 'attendance', label: 'Attendance', icon: <CheckCircle size={18} /> },
    { key: 'exams', label: 'Exams', icon: <ClipboardList size={18} /> },
    { key: 'discipline', label: 'Discipline', icon: <ShieldAlert size={18} /> },
    { key: 'support', label: 'Support', icon: <MessageSquare size={18} /> },
    { key: 'notices', label: 'Notices', icon: <Bell size={18} /> },
    { key: 'cbc', label: 'CBC Competency', icon: <Award size={18} /> },
  ]

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = basePath('/')
  }

  const pageTitles = {
    dashboard: 'Deputy Admin Dashboard',
    students: 'Student Discipline & Performance',
    teachers: 'Teacher Supervision',
    timetable: 'Timetable Oversight',
    attendance: 'Attendance Monitoring',
    exams: 'Examination Monitoring',
    discipline: 'Discipline Management',
    support: 'Support Tickets',
    notices: 'Notices & Announcements',
    cbc: 'CBC Competency',
  }

  const renderContent = () => {
    switch (activeNav) {
      case 'students':
        return <Students />
      case 'teachers':
        return <Teachers />
      case 'timetable':
        return <Timetable />
      case 'attendance':
        return <Attendance />
      case 'exams':
        return <Exams />
      case 'discipline':
        return <Discipline />
      case 'support':
        return <SupportTicket />
      case 'cbc':
        return <CBCCompetency />
      case 'notices':
        return <NoticesPage profile={authProfile} />
      default:
        return renderDashboard()
    }
  }

  const renderDashboard = () => {
    if (loading) return <div className="loading-state">Loading dashboard...</div>
    return (
      <>
        <div className="da-stats-grid">
          {[
            { label: 'Active Students', value: stats.totalStudents, change: 'Currently enrolled', color: '#2563eb', icon: <Users size={20} /> },
            { label: 'Discipline Cases', value: stats.disciplineCases, change: 'All time records', color: '#dc2626', icon: <ShieldAlert size={20} /> },
            { label: 'Teachers', value: stats.teachersCount, change: 'On staff', color: '#7c3aed', icon: <GraduationCap size={20} /> },
            { label: 'Exam Records', value: stats.examsActive, change: 'Grades recorded', color: '#ca8a04', icon: <ClipboardList size={20} /> },
          ].map((s) => (
            <div className="da-stat-card" key={s.label}>
              <div className="da-stat-icon" style={{ color: s.color }}>{s.icon}</div>
              <p className="da-stat-label">{s.label}</p>
              <p className="da-stat-value" style={{ color: s.color }}>{s.value}</p>
              <p className="da-stat-change">{s.change}</p>
            </div>
          ))}
        </div>

        <div className="da-grid">
          <div className="da-card">
            <div className="da-card-header">
              <h3>Recent Discipline Cases</h3>
              <button className="da-view-all" onClick={() => { setActiveNav('discipline'); setMobileOpen(false) }}>
                View all <ChevronRight size={14} />
              </button>
            </div>
            {recentDiscipline.length === 0 ? (
              <p className="da-empty-state">No discipline cases recorded</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="da-table" style={{ minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Offense</th>
                      <th>Action</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDiscipline.map((d) => (
                      <tr key={d.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{d.students?.full_name || '—'}</td>
                        <td>{d.students?.class || '—'}{d.students?.stream ? ` ${d.students.stream}` : ''}</td>
                        <td>{d.offense || d.offence || '—'}</td>
                        <td><span className="da-badge">{d.action_taken || d.action || '—'}</span></td>
                        <td style={{ color: '#64748b', fontSize: 13 }}>{d.date || d.created_at?.split('T')[0] || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="da-root">
      <button className="da-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Open menu">
        <Menu size={20} />
      </button>

      {mobileOpen && <div className="da-mobile-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className={`da-sidebar ${mobileOpen ? 'open' : ''}`}>
        {mobileOpen && (
          <button className="da-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        )}
        <div className="da-sidebar-brand">
          {school?.logo_url ? (
            <img src={school.logo_url} alt={school.name || 'Logo'} style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div className="da-sidebar-logo">{school?.name?.[0] || 'D'}</div>
          )}
          <span>{school?.name || 'School'}</span>
        </div>
        <div className="da-sidebar-school">
          <div className="da-school-avatar">{school?.name?.[0] || 'D'}</div>
          <div>
            <p className="da-school-name">{school?.name || 'Loading...'}</p>
            <p className="da-school-role">Deputy Admin</p>
          </div>
        </div>
        <nav className="da-sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`da-nav-item ${activeNav === item.key ? 'active' : ''}`}
              onClick={() => { setActiveNav(item.key); setMobileOpen(false) }}
            >
              <span className="da-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <RoleSwitcher />
        <div className="da-sidebar-footer">
          <button className="da-logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="da-main">
        <header className="da-header">
          <div>
            <h1>{pageTitles[activeNav]}</h1>
            <p>{currentTerm ? `${currentTerm}, ${currentYear}` : `${currentYear}`} · {school?.name || ''}</p>
          </div>
          <div className="da-header-actions">
            <div className="da-avatar">
              {authProfile?.full_name?.[0]?.toUpperCase() || 'DA'}
            </div>
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  )
}
