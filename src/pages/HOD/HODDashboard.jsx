import { useState, useEffect, useMemo } from 'react'
import {
  LayoutDashboard, BarChart2, GraduationCap, ClipboardList,
  LogOut, Upload, ChevronRight, BookOpen, Settings, ShieldCheck,
  Bell, MessageSquare, Menu, X
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { basePath } from '../../lib/paths'
import { useAuthStore } from '../../store/authStore'
import AvatarUpload from '../../components/AvatarUpload'
import { useSchool } from '../admin/useSchool'
import { useBrandingStore } from '../../features/branding/brandingStore'
import { useNoticeCount, markNoticesSeen } from '../../hooks/useNoticeCount'
import { weightedScoreMean } from '../../services/grading'
import './HODDashboard.css'
import SubjectPerformance from './SubjectPerformance'
import TeacherReview from './TeacherReview'
import DeptExams from './DeptExams'
import ExamSetup from './ExamSetup'
import MarksApproval from './MarksApproval'
import DeptAnalytics from './DeptAnalytics'
import NoticesPage from '../teacher/NoticesPage'
import '../teacher/NoticesPage.css'
import SchoolSupportPage from '../../features/support/SchoolSupportPage'
import '../../features/support/SchoolSupportPage.css'
import RoleSwitcher from '../../components/RoleSwitcher'
import LibraryContent from '../library/LibraryContent'
import { useFeatureAccess } from '../../features/access/FeatureAccessContext'
import { HOD_NAV_FEATURES } from '../../features/access/featureMap'
import FeatureGate from '../../features/access/FeatureGate'

export default function HODDashboard() {
  const { profile: authProfile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const { logoUrl, schoolName } = useBrandingStore()
  const { features, isSuperadmin } = useFeatureAccess()
  const [activeNav, setActiveNav] = useState('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [stats, setStats] = useState({
    totalSubjects: 0,
    avgPerformance: 0,
    teacherCount: 0,
    pendingExams: 0,
  })
  const [subjectSummary, setSubjectSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const notifCount = useNoticeCount(authProfile?.school_id, authProfile?.id)

  useEffect(() => {
    fetchDashboardData()
  }, [currentTerm, currentYear])

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { key: 'exam_setup', label: 'Exam Setup', icon: <Settings size={16} /> },
    { key: 'marks_approval', label: 'Marks Approval', icon: <ShieldCheck size={16} /> },
    { key: 'analytics', label: 'Performance Analytics', icon: <BarChart2 size={16} /> },
    { key: 'teacher_review', label: 'Teacher Review', icon: <GraduationCap size={16} /> },
    { key: 'notices', label: 'Notices', icon: <Bell size={16} /> },
    { key: 'library', label: 'Library', icon: <BookOpen size={16} /> },
    { key: 'support', label: 'Support', icon: <MessageSquare size={16} /> },
  ]

  const filteredNavItems = useMemo(() => {
    if (isSuperadmin) return navItems
    return navItems.filter((item) => {
      const required = HOD_NAV_FEATURES[item.key]
      if (!required) return true
      return required.some((f) => features.includes(f))
    })
  }, [features, isSuperadmin])

  useEffect(() => {
    if (isSuperadmin || activeNav === 'dashboard') return
    const required = HOD_NAV_FEATURES[activeNav]
    if (required && !required.some((f) => features.includes(f))) {
      setActiveNav('dashboard')
    }
  }, [features, activeNav, isSuperadmin])

  const fetchDashboardData = async () => {
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const schoolId = profile?.school_id
    if (!schoolId) { setLoading(false); return }

    const [subjectsRes, teachersRes, gradesRes] = await Promise.all([
      supabase
        .from('subjects')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId),
      supabase
        .from('teachers')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('status', 'active'),
      supabase
        .from('grades')
        .select('subject, total_score, max_marks')
        .eq('school_id', schoolId)
        .eq('term', currentTerm)
        .eq('year', currentYear),
    ])

    const gradeData = gradesRes.data || []
    const avgPerf = gradeData.length
      ? Math.round(weightedScoreMean(gradeData))
      : 0

    const subjMap = {}
    gradeData.forEach(g => {
      if (!subjMap[g.subject]) subjMap[g.subject] = { wtotal: 0, wcount: 0, count: 0 }
      const w = Number(g.max_marks) || 100
      subjMap[g.subject].wtotal += Number(g.total_score || 0) * w
      subjMap[g.subject].wcount += w
      subjMap[g.subject].count += 1
    })

    const summary = Object.entries(subjMap).map(([name, d]) => ({
      name,
      avg: d.wcount > 0 ? Math.round(d.wtotal / d.wcount) : 0,
      count: d.count,
    })).sort((a, b) => b.avg - a.avg)

    setStats({
      totalSubjects: subjectsRes.count || 0,
      avgPerformance: avgPerf,
      teacherCount: teachersRes.count || 0,
      pendingExams: gradeData.filter(g => !g.grade).length,
    })
    setSubjectSummary(summary)
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = basePath('/')
  }

  const pageTitles = {
    dashboard: 'HOD Dashboard',
    exam_setup: 'Pre-Exam Setup & Configuration',
    marks_approval: 'Marks Verification & Approval',
    analytics: 'Departmental Performance Analytics',
    subject_performance: 'Subject Performance Analysis',
    teacher_review: 'Teacher Performance Review',
    dept_exams: 'Departmental Examinations',
    notices: 'Notices & Announcements',
    library: 'Library',
    support: 'Support Tickets',
  }

  const renderContent = () => {
    switch (activeNav) {
      case 'exam_setup':
        return <ExamSetup />
      case 'marks_approval':
        return <MarksApproval />
      case 'analytics':
        return <DeptAnalytics />
      case 'subject_performance':
        return <SubjectPerformance />
      case 'teacher_review':
        return <TeacherReview />
      case 'dept_exams':
        return <DeptExams />
      case 'notices':
        return <NoticesPage profile={authProfile} />
      case 'library':
        return <LibraryContent schoolId={authProfile?.school_id} school={school} profile={authProfile} />
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
        <div className="hod-stats-grid">
          {[
            { label: 'Subjects', value: stats.totalSubjects, change: 'In department', color: '#2563eb', icon: <BookOpen size={20} /> },
            { label: 'Avg Performance', value: `${stats.avgPerformance}%`, change: `${currentTerm || 'Current'} ${currentYear}`, color: '#16a34a', icon: <BarChart2 size={20} /> },
            { label: 'Teachers', value: stats.teacherCount, change: 'Active staff', color: '#7c3aed', icon: <GraduationCap size={20} /> },
            { label: 'Pending Exams', value: stats.pendingExams, change: 'Awaiting approval', color: '#ca8a04', icon: <ClipboardList size={20} /> },
          ].map((s) => (
            <div className="hod-stat-card" key={s.label}>
              <div className="hod-stat-icon" style={{ color: s.color }}>{s.icon}</div>
              <p className="hod-stat-label">{s.label}</p>
              <p className="hod-stat-value" style={{ color: s.color }}>{s.value}</p>
              <p className="hod-stat-change">{s.change}</p>
            </div>
          ))}
        </div>

        <div className="hod-grid hod-grid-2">
          <div className="hod-card">
            <div className="hod-card-header">
              <h3>Subject Performance Summary</h3>
              <button className="hod-view-all" onClick={() => setActiveNav('analytics')}>
                View all <ChevronRight size={14} />
              </button>
            </div>
            {subjectSummary.length === 0 ? (
              <p className="empty-state">No grade data available this term</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="hod-table" style={{ minWidth: 500 }}>
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Average Score</th>
                      <th>Entries</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectSummary.slice(0, 8).map((s) => (
                      <tr key={s.name}>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td style={{ color: s.avg >= 50 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{s.avg}%</td>
                        <td style={{ color: '#64748b' }}>{s.count}</td>
                        <td>
                          <span className={`hod-badge ${s.avg >= 50 ? 'hod-badge-good' : 'hod-badge-low'}`}>
                            {s.avg >= 50 ? 'Good' : 'Needs Improvement'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="hod-card">
            <div className="hod-card-header">
              <h3>Quick Actions</h3>
            </div>
            <div className="hod-quick-actions">
              {[
                { key: 'exam_setup', label: 'Exam Setup', desc: 'Configure grading & exam types', icon: <Settings size={18} />, color: '#2563eb' },
                { key: 'marks_approval', label: 'Marks Approval', desc: 'Review & approve submitted marks', icon: <ShieldCheck size={18} />, color: '#16a34a' },
                { key: 'analytics', label: 'Analytics', desc: 'Department performance insights', icon: <BarChart2 size={18} />, color: '#7c3aed' },
              ].map((a) => (
                <button
                  key={a.key}
                  className="hod-quick-action-btn"
                  onClick={() => setActiveNav(a.key)}
                >
                  <div className="hod-quick-action-icon" style={{ background: a.color + '14', color: a.color }}>{a.icon}</div>
                  <div>
                    <p className="hod-quick-action-label">{a.label}</p>
                    <p className="hod-quick-action-desc">{a.desc}</p>
                  </div>
                  <ChevronRight size={16} className="hod-quick-action-arrow" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="hod-root">
      <button className="hod-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Open menu">
        <Menu size={20} />
      </button>

      {mobileOpen && <div className="hod-mobile-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className={`hod-sidebar ${mobileOpen ? 'open' : ''}`}>
        {mobileOpen && (
          <button className="hod-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        )}
        <div className="hod-sidebar-brand">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName || 'Logo'} style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div className="hod-sidebar-logo">{schoolName?.[0] || 'H'}</div>
          )}
          <span>{schoolName || 'School'}</span>
        </div>
        <div className="hod-sidebar-school">
          <AvatarUpload className="hod-school-avatar" size={36} />
          <div>
            <p className="hod-school-name">{authProfile?.full_name || 'User'}</p>
            <p className="hod-school-role">{authProfile?.role ? authProfile.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Head of Department'}</p>
          </div>
        </div>
        <nav className="hod-sidebar-nav">
          {filteredNavItems.map((item) => (
            <button
              key={item.key}
              className={`hod-nav-item ${activeNav === item.key ? 'active' : ''}`}
              onClick={() => { setActiveNav(item.key); if (item.key === 'notices') markNoticesSeen(authProfile?.id); setMobileOpen(false) }}
            >
              <span className="hod-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.key === 'notices' && notifCount > 0 && <span className="nav-badge" style={{ background: '#ef4444', color: '#fff', borderRadius: '50%', fontSize: '10px', fontWeight: 700, padding: '1px 6px', marginLeft: 'auto' }}>{notifCount}</span>}
            </button>
          ))}
        </nav>
        <RoleSwitcher />
        <div className="hod-sidebar-footer">
          <button className="hod-logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="hod-main">
        <header className="hod-header">
          <div>
            <h1>{pageTitles[activeNav]}</h1>
            <p>{currentTerm ? `${currentTerm}, ${currentYear}` : `${currentYear}`} · {school?.name || ''}</p>
          </div>
          <div className="hod-header-actions">
            <div className="hod-avatar">
              {authProfile?.full_name?.[0]?.toUpperCase() || 'H'}
            </div>
          </div>
        </header>

        <FeatureGate feature={HOD_NAV_FEATURES[activeNav]?.[0]}>
          {renderContent()}
        </FeatureGate>
      </main>
    </div>
  )
}
