import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Users, UserPlus, ClipboardList, PhoneCall, FileText,
  CalendarDays, Bell, BookOpen, ChevronRight, LogOut, RefreshCw, Printer,
  Clock, CheckCircle, AlertCircle, Activity, TrendingUp, TrendingDown,
  DoorOpen, StickyNote, Search, ExternalLink, Menu, X, Shield, Briefcase,
  Mail, MessageSquare
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { basePath } from '../../lib/paths'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { useBrandingStore } from '../../features/branding/brandingStore'
import { useNoticeCount, markNoticesSeen } from '../../hooks/useNoticeCount'
import RoleSwitcher from '../../components/RoleSwitcher'
import './ReceptionDashboard.css'
import Visitors from './Visitors'
import Appointments from './Appointments'
import Admissions from './Admissions'
import StudentsView from './StudentsView'
import ParentsView from './ParentsView'
import Communication from './Communication'
import CalendarView from './CalendarView'
import Requests from './Requests'
import Reports from './Reports'

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { key: 'dashboard', label: 'Front Office Desk', icon: <LayoutDashboard size={15} /> },
    ],
  },
  {
    label: 'Front Office',
    items: [
      { key: 'visitors', label: 'Visitor Register', icon: <DoorOpen size={15} /> },
      { key: 'appointments', label: 'Appointments', icon: <CalendarDays size={15} /> },
    ],
  },
  {
    label: 'Student Administration',
    items: [
      { key: 'students', label: 'Student Lookup', icon: <Users size={15} /> },
      { key: 'parents', label: 'Parents & Guardians', icon: <Shield size={15} /> },
      { key: 'admissions', label: 'Admissions Pipeline', icon: <UserPlus size={15} /> },
    ],
  },
  {
    label: 'Communication',
    items: [
      { key: 'notices', label: 'Notices & Announcements', icon: <Bell size={15} /> },
      { key: 'calendar', label: 'School Calendar', icon: <CalendarDays size={15} /> },
    ],
  },
  {
    label: 'Administration',
    items: [
      { key: 'requests', label: 'Requests & Routing', icon: <ClipboardList size={15} /> },
      { key: 'reports', label: 'Front Office Reports', icon: <FileText size={15} /> },
    ],
  },
]

export default function ReceptionDashboard() {
  const { profile: authProfile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const { logoUrl, schoolName } = useBrandingStore()
  const [activeNav, setActiveNav] = useState('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [stats, setStats] = useState({
    visitorsOnSite: 0, visitorsToday: 0, appointmentsToday: 0,
    openRequests: 0, prospects: 0, activeStudents: 0, upcomingEvents: 0,
  })
  const [recentActivity, setRecentActivity] = useState([])
  const notifCount = useNoticeCount(authProfile?.school_id, authProfile?.id)

  useEffect(() => {
    fetchFrontDeskData()
  }, [currentTerm, currentYear])

  const fetchFrontDeskData = async () => {
    setLoading(true)
    const schoolId = authProfile?.school_id
    if (!schoolId) { setLoading(false); return }

    const now = new Date()
    const today = now.toISOString().split('T')[0]

    const [
      onSite, visitsToday, apptsToday, requestsRes,
      prospectsRes, studentsRes, eventsRes, visitorsRecent,
      apptsRecent, prospectsRecent, requestsRecent
    ] = await Promise.all([
      supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'checked_in'),
      supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).gte('created_at', now.toISOString().split('T')[0]),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('appointment_date', today).neq('status', 'cancelled'),
      supabase.from('front_office_requests').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).in('status', ['received', 'routed']),
      supabase.from('prospective_students').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).neq('status', 'withdrawn').neq('status', 'rejected'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
      supabase.from('school_events').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).gte('date', today),
      supabase.from('visitors').select('id,full_name,organization,purpose,check_in_at,status').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(5),
      supabase.from('appointments').select('id,visitor_name,person_to_see,appointment_date,appointment_time,status').eq('school_id', schoolId).gte('appointment_date', today).order('appointment_date', { ascending: true }).limit(5),
      supabase.from('prospective_students').select('id,full_name,class_of_interest,status,created_at').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(5),
      supabase.from('front_office_requests').select('id,requester_name,category,subject,status,created_at').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(5),
    ])

    setStats({
      visitorsOnSite: onSite.count || 0,
      visitorsToday: visitsToday.count || 0,
      appointmentsToday: apptsToday.count || 0,
      openRequests: requestsRes.count || 0,
      prospects: prospectsRes.count || 0,
      activeStudents: studentsRes.count || 0,
      upcomingEvents: eventsRes.count || 0,
    })

    const activity = []
    ;(visitorsRecent?.data || []).forEach(v => {
      activity.push({
        type: 'visitor', msg: `${v.full_name} ${v.status === 'checked_out' ? 'checked out' : 'checked in'}`,
        time: v.check_in_at || v.created_at, icon: 'visitor',
      })
    })
    ;(apptsRecent?.data || []).forEach(a => {
      activity.push({
        type: 'appointment', msg: `${a.visitor_name} → ${a.person_to_see} (${a.status})`,
        time: `${a.appointment_date}T${a.appointment_time || '00:00'}`, icon: 'appointment',
      })
    })
    ;(prospectsRecent?.data || []).forEach(p => {
      activity.push({
        type: 'prospect', msg: `${p.full_name} — ${p.status}`, time: p.created_at, icon: 'prospect',
      })
    })
    ;(requestsRecent?.data || []).forEach(r => {
      activity.push({
        type: 'request', msg: `${r.subject} — ${r.category}`, time: r.created_at, icon: 'request',
      })
    })
    activity.sort((a, b) => new Date(b.time) - new Date(a.time))
    setRecentActivity(activity.slice(0, 8))
    setUpdatedAt(now)
    setLoading(false)
  }

  const handleLogout = async () => {
    setMobileOpen(false)
    await supabase.auth.signOut()
    window.location.href = basePath('/')
  }

  const pageTitles = {
    dashboard: 'Front Office Desk',
    visitors: 'Visitor Register',
    appointments: 'Appointments',
    students: 'Student Lookup',
    parents: 'Parents & Guardians',
    admissions: 'Admissions Pipeline',
    notices: 'Notices & Announcements',
    calendar: 'School Calendar',
    requests: 'Requests & Routing',
    reports: 'Front Office Reports',
  }

  const renderContent = () => {
    switch (activeNav) {
      case 'visitors': return <Visitors onChanged={() => fetchFrontDeskData()} />
      case 'appointments': return <Appointments onChanged={() => fetchFrontDeskData()} />
      case 'students': return <StudentsView />
      case 'parents': return <ParentsView />
      case 'admissions': return <Admissions onChanged={() => fetchFrontDeskData()} />
      case 'notices': return <Communication profile={authProfile} />
      case 'calendar': return <CalendarView onChanged={() => fetchFrontDeskData()} />
      case 'requests': return <Requests onChanged={() => fetchFrontDeskData()} />
      case 'reports': return <Reports />
      default: return renderDashboard()
    }
  }

  const fmtTimeAgo = (dateStr) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    const diff = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
  }

  const renderDashboard = () => {
    if (loading) {
      return (
        <div className="rcp-load">
          <div className="rcp-spin" />
          <span>Loading front office...</span>
        </div>
      )
    }

    const kpiCards = [
      {
        label: 'On Campus Now', value: stats.visitorsOnSite, color: '#0F766E',
        icon: <Users size={20} />, iconCls: 'rcp-kpi-icon--teal',
        trend: `${stats.visitorsToday} checked in today`, trendDir: 'up',
        sub: 'Visitors currently on site',
      },
      {
        label: "Today's Appointments", value: stats.appointmentsToday, color: '#1D4ED8',
        icon: <CalendarDays size={20} />, iconCls: 'rcp-kpi-icon--blue',
        trend: 'Scheduled meetings', trendDir: 'flat',
        sub: 'Meetings for the day',
      },
      {
        label: 'Open Requests', value: stats.openRequests, color: '#B45309',
        icon: <ClipboardList size={20} />, iconCls: 'rcp-kpi-icon--amber',
        trend: 'Awaiting routing', trendDir: 'flat',
        sub: 'Received or in progress',
      },
      {
        label: 'Admission Inquiries', value: stats.prospects, color: '#6D28D9',
        icon: <UserPlus size={20} />, iconCls: 'rcp-kpi-icon--purple',
        trend: 'Active pipeline', trendDir: 'up',
        sub: 'Prospective students',
      },
      {
        label: 'Active Students', value: stats.activeStudents, color: '#16A34A',
        icon: <Users size={20} />, iconCls: 'rcp-kpi-icon--green',
        trend: 'Enrolled this term', trendDir: 'up',
        sub: `${currentTerm || 'Term'} ${currentYear}`,
      },
      {
        label: 'Upcoming Events', value: stats.upcomingEvents, color: '#0891B2',
        icon: <CalendarDays size={20} />, iconCls: 'rcp-kpi-icon--cyan',
        trend: 'On the calendar', trendDir: 'flat',
        sub: 'Events ahead',
      },
    ]

    const actions = [
      { label: 'Check In Visitor', desc: 'Record a visitor', icon: <DoorOpen size={18} />, iconCls: 'rcp-action-icon--teal', nav: 'visitors' },
      { label: 'Book Appointment', desc: 'Schedule a meeting', icon: <CalendarDays size={18} />, iconCls: 'rcp-action-icon--blue', nav: 'appointments' },
      { label: 'Look Up Student', desc: 'Find a student record', icon: <Search size={18} />, iconCls: 'rcp-action-icon--green', nav: 'students' },
      { label: 'New Inquiry', desc: 'Admissions pipeline', icon: <UserPlus size={18} />, iconCls: 'rcp-action-icon--purple', nav: 'admissions' },
      { label: 'Route a Request', desc: 'Direct to a department', icon: <ClipboardList size={18} />, iconCls: 'rcp-action-icon--amber', nav: 'requests' },
      { label: 'Publish Notice', desc: 'Announcement for all', icon: <Bell size={18} />, iconCls: 'rcp-action-icon--cyan', nav: 'notices' },
      { label: 'Add Event', desc: 'School calendar', icon: <CalendarDays size={18} />, iconCls: 'rcp-action-icon--gray', nav: 'calendar' },
      { label: 'Print Report', desc: 'Front office summary', icon: <Printer size={18} />, iconCls: 'rcp-action-icon--red', nav: 'reports' },
    ]

    return (
      <div className="rcp-dash">
        <div className="rcp-status">
          <span className="rcp-pill rcp-pill--teal">
            {currentTerm || 'Term'} • {currentYear}
          </span>
          <span className="rcp-pill rcp-pill--blue">Reception / Secretary</span>
          <span className="rcp-status-updated">
            <Clock size={12} />
            Updated {updatedAt ? fmtTimeAgo(updatedAt) : '—'}
          </span>
        </div>

        <div className="rcp-kpi-grid">
          {kpiCards.map(k => (
            <div key={k.label} className="rcp-kpi">
              <div className="rcp-kpi-top">
                <div className={`rcp-kpi-icon ${k.iconCls}`}>{k.icon}</div>
                <span className={`rcp-kpi-trend rcp-kpi-trend--${k.trendDir}`}>
                  {k.trendDir === 'up' ? <TrendingUp size={12} /> : k.trendDir === 'down' ? <TrendingDown size={12} /> : <Clock size={12} />}
                  {k.trend}
                </span>
              </div>
              <p className="rcp-kpi-val" style={{ color: k.color }}>{k.value}</p>
              <p className="rcp-kpi-label">{k.label}</p>
              <p className="rcp-kpi-sub">{k.sub}</p>
            </div>
          ))}
        </div>

        <div className="rcp-two-col">
          <div className="rcp-card">
            <div className="rcp-card-hdr">
              <h3><Activity size={16} /> Front Office Activity</h3>
              {recentActivity.length > 0 && (
                <button className="rcp-btn-primary small" onClick={() => { setActiveNav('visitors'); setMobileOpen(false) }}>
                  <ExternalLink size={13} /> View Log
                </button>
              )}
            </div>
            {recentActivity.length === 0 ? (
              <p style={{ fontSize: 13, color: '#94A3B8', padding: '12px 0', margin: 0 }}>
                No front office activity yet today
              </p>
            ) : (
              <div className="rcp-feed">
                {recentActivity.map((a, i) => (
                  <div key={i} className="rcp-feed-item">
                    <div className={`rcp-feed-icon rcp-feed-icon--${a.icon}`}>
                      {a.icon === 'visitor' ? <DoorOpen size={14} /> :
                       a.icon === 'appointment' ? <CalendarDays size={14} /> :
                       a.icon === 'prospect' ? <UserPlus size={14} /> :
                       a.icon === 'request' ? <ClipboardList size={14} /> :
                       a.icon === 'event' ? <CalendarDays size={14} /> :
                       <Activity size={14} />}
                    </div>
                    <div className="rcp-feed-text"><div className="rcp-feed-msg">{a.msg}</div></div>
                    <span className="rcp-feed-time">{fmtTimeAgo(a.time)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rcp-card">
            <div className="rcp-card-hdr">
              <h3><AlertCircle size={16} /> Desk Notes</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { icon: <CheckCircle size={14} />, iconCls: 'rcp-kpi-icon--green', text: 'Direct all fee enquiries to the Bursar (Finance).' },
                { icon: <CheckCircle size={14} />, iconCls: 'rcp-kpi-icon--blue', text: 'Academic questions go to the Academic Office / HODs.' },
                { icon: <CheckCircle size={14} />, iconCls: 'rcp-kpi-icon--purple', text: 'Admission intake is managed by the Registrar.' },
                { icon: <CheckCircle size={14} />, iconCls: 'rcp-kpi-icon--cyan', text: 'Library visits: direct to the Librarian.' },
              ].map((n, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#FAFAFA', border: '1px solid var(--rcp-border-lt)', borderRadius: 10, padding: '10px 12px' }}>
                  <span className={`rcp-kpi-icon ${n.iconCls}`} style={{ width: 28, height: 28, borderRadius: 8 }}>{n.icon}</span>
                  <span style={{ fontSize: 13, color: '#475569', lineHeight: 1.45 }}>{n.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rcp-card">
          <div className="rcp-card-hdr">
            <h3>Quick Actions</h3>
            <button className="rcp-btn-secondary small" onClick={fetchFrontDeskData}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          <div className="rcp-actions">
            {actions.map(a => (
              <button key={a.label} className="rcp-action" onClick={() => { setActiveNav(a.nav); setMobileOpen(false) }}>
                <div className={`rcp-action-icon ${a.iconCls}`}>{a.icon}</div>
                <span className="rcp-action-lbl">{a.label}</span>
                <span className="rcp-action-desc">{a.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const flatNav = NAV_GROUPS.flatMap(g => g.items)

  return (
    <div className="rcp-root">
      <button className="rcp-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Open menu">
        <Menu size={20} />
      </button>

      {mobileOpen && <div className="rcp-mobile-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className={`rcp-sidebar ${mobileOpen ? 'open' : ''}`}>
        {mobileOpen && (
          <button className="rcp-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        )}
        <div className="rcp-sidebar-brand">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName || 'Logo'} style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'cover' }} />
          ) : (
            <div className="rcp-sidebar-logo">{schoolName?.[0] || 'S'}</div>
          )}
          <span>{schoolName || 'School'}</span>
        </div>
        <div className="rcp-sidebar-school">
          <div className="rcp-school-avatar">{authProfile?.full_name?.[0]?.toUpperCase() || 'U'}</div>
          <div>
            <p className="rcp-school-name">{authProfile?.full_name || 'User'}</p>
            <p className="rcp-school-plan">{authProfile?.role ? authProfile.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Receptionist'}</p>
          </div>
        </div>
        <nav className="rcp-sidebar-nav">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="rcp-nav-group">
              <div className="rcp-nav-group-label">{group.label}</div>
              {group.items.map(item => (
                <button
                  key={item.key}
                  className={`rcp-nav-item ${activeNav === item.key ? 'active' : ''}`}
                  onClick={() => { setActiveNav(item.key); if (item.key === 'notices') markNoticesSeen(authProfile?.id); setMobileOpen(false) }}
                >
                  <span className="rcp-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.key === 'notices' && notifCount > 0 && <span className="nav-badge" style={{ background: '#ef4444', color: '#fff', borderRadius: '50%', fontSize: '10px', fontWeight: 700, padding: '1px 6px', marginLeft: 'auto' }}>{notifCount}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <RoleSwitcher />
        <div className="rcp-sidebar-footer">
          <button className="rcp-logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="rcp-main">
        <header className="rcp-header">
          <div>
            <h1>{pageTitles[activeNav]}</h1>
            <p className="rcp-header-sub">
              {currentTerm ? `${currentTerm}, ${currentYear}` : `${currentYear}`} · {school?.name || ''}
            </p>
          </div>
          <div className="rcp-header-actions">
            <button className="rcp-btn-secondary" onClick={fetchFrontDeskData} style={{ padding: '9px 14px' }}>
              <RefreshCw size={14} />
            </button>
            <div className="rcp-admin-avatar">
              {authProfile?.full_name?.[0]?.toUpperCase() || 'RC'}
            </div>
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  )
}
