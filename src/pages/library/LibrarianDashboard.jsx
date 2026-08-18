import { useState, useEffect } from 'react'
import {
  LayoutDashboard, BookOpen, ArrowLeftRight, Users, Clock,
  BookMarked, Settings, BarChart3, LogOut, Menu, X, BookPlus,
  Receipt, Bell
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { basePath } from '../../lib/paths'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { useBrandingStore } from '../../features/branding/brandingStore'
import { useNoticeCount, markNoticesSeen } from '../../hooks/useNoticeCount'
import RoleSwitcher from '../../components/RoleSwitcher'
import { getSchoolId } from '../../lib/library'
import './LibrarianDashboard.css'
import LibraryOverview from './LibraryOverview'
import LibraryCatalogue from './LibraryCatalogue'
import LibraryBorrowReturn from './LibraryBorrowReturn'
import LibraryMembers from './LibraryMembers'
import LibraryOverdue from './LibraryOverdue'
import LibraryReservations from './LibraryReservations'
import LibraryManagement from './LibraryManagement'
import LibraryReports from './LibraryReports'
import LibraryFines from './LibraryFines'
import MemberProfile from './MemberProfile'
import NoticesPage from '../teacher/NoticesPage'

export default function LibrarianDashboard() {
  const { profile: authProfile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const { logoUrl, schoolName } = useBrandingStore()
  const [activeNav, setActiveNav] = useState('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [schoolId, setSchoolId] = useState(null)
  const [profileMemberId, setProfileMemberId] = useState(null)
  const notifCount = useNoticeCount(authProfile?.school_id, authProfile?.id)

  useEffect(() => {
    getSchoolId().then(setSchoolId)
  }, [])

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { key: 'catalogue', label: 'Book Catalogue', icon: <BookOpen size={16} /> },
    { key: 'borrow', label: 'Borrow / Return', icon: <ArrowLeftRight size={16} /> },
    { key: 'members', label: 'Members', icon: <Users size={16} /> },
    { key: 'overdue', label: 'Overdue', icon: <Clock size={16} /> },
    { key: 'reservations', label: 'Reservations', icon: <BookMarked size={16} /> },
    { key: 'fines', label: 'Fines', icon: <Receipt size={16} /> },
    { key: 'management', label: 'Management', icon: <Settings size={16} /> },
    { key: 'reports', label: 'Reports', icon: <BarChart3 size={16} /> },
    { key: 'notices', label: 'Notices', icon: <Bell size={16} /> },
  ]

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = basePath('/')
  }

  const pageTitles = {
    dashboard: 'Library Dashboard',
    catalogue: 'Book Catalogue',
    borrow: 'Borrow / Return',
    members: 'Library Members',
    overdue: 'Overdue Books',
    reservations: 'Reservations',
    fines: 'Fines & Payments',
    management: 'Library Management',
    reports: 'Library Reports',
    notices: 'Notices',
  }

  const renderContent = () => {
    if (!schoolId) return <div className="lib-loading" />
    if (profileMemberId) {
      return (
        <MemberProfile
          schoolId={schoolId}
          memberId={profileMemberId}
          school={school}
          onNavigate={setActiveNav}
          onBack={() => setProfileMemberId(null)}
        />
      )
    }
    switch (activeNav) {
      case 'dashboard':    return <LibraryOverview schoolId={schoolId} onNavigate={setActiveNav} />
      case 'catalogue':    return <LibraryCatalogue schoolId={schoolId} onNavigate={setActiveNav} />
      case 'borrow':       return <LibraryBorrowReturn schoolId={schoolId} onOpenMember={setProfileMemberId} />
      case 'members':      return <LibraryMembers schoolId={schoolId} onOpenMember={setProfileMemberId} />
      case 'overdue':      return <LibraryOverdue schoolId={schoolId} onOpenMember={setProfileMemberId} />
      case 'reservations': return <LibraryReservations schoolId={schoolId} />
      case 'fines':        return <LibraryFines schoolId={schoolId} term={currentTerm} year={currentYear} onOpenMember={setProfileMemberId} />
      case 'management':   return <LibraryManagement schoolId={schoolId} />
      case 'reports':      return <LibraryReports schoolId={schoolId} />
      case 'notices':      return <NoticesPage profile={authProfile} />
      default:             return <LibraryOverview schoolId={schoolId} onNavigate={setActiveNav} />
    }
  }

  return (
    <div className="lib-root">
      <button className="lib-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Open menu">
        <Menu size={20} />
      </button>

      {mobileOpen && <div className="lib-mobile-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className={`lib-sidebar ${mobileOpen ? 'open' : ''}`}>
        {mobileOpen && (
          <button className="lib-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        )}
        <div className="lib-sidebar-brand">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName || 'Logo'} style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div className="lib-sidebar-logo">{schoolName?.[0] || 'S'}</div>
          )}
          <span>{schoolName || 'School'}</span>
        </div>
        <div className="lib-sidebar-school">
          <div className="lib-school-avatar">{authProfile?.full_name?.[0]?.toUpperCase() || 'U'}</div>
          <div>
            <p className="lib-school-name">{authProfile?.full_name || 'User'}</p>
            <p className="lib-school-role">{authProfile?.role ? authProfile.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Librarian'}</p>
          </div>
        </div>
        <nav className="lib-sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.key}
              className={`lib-nav-item ${activeNav === item.key ? 'active' : ''}`}
              onClick={() => { setActiveNav(item.key); if (item.key === 'notices') markNoticesSeen(authProfile?.id); setMobileOpen(false) }}
            >
              <span className="lib-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.key === 'notices' && notifCount > 0 && <span className="nav-badge" style={{ background: '#ef4444', color: '#fff', borderRadius: '50%', fontSize: '10px', fontWeight: 700, padding: '1px 6px', marginLeft: 'auto' }}>{notifCount}</span>}
            </button>
          ))}
        </nav>
        <RoleSwitcher />
        <div className="lib-sidebar-footer">
          <button className="lib-logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="lib-main">
        <header className="lib-header">
          <div>
            <h1>{pageTitles[activeNav]}</h1>
            <p>{currentTerm ? `${currentTerm}, ${currentYear}` : `${currentYear}`} · {school?.name || ''}</p>
          </div>
          <div className="lib-header-actions">
            <button className="lib-btn-primary" onClick={() => { setActiveNav('borrow'); setMobileOpen(false) }}>
              <BookPlus size={15} /> New Loan
            </button>
            <div className="lib-avatar">
              {authProfile?.full_name?.[0]?.toUpperCase() || 'L'}
            </div>
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  )
}
