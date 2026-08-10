import { useState, useEffect } from 'react'
import {
  LayoutDashboard, BookOpen, ArrowLeftRight, Users, Clock,
  BookMarked, Settings, BarChart3, LogOut, Menu, X, BookPlus
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { basePath } from '../../lib/paths'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { useBrandingStore } from '../../features/branding/brandingStore'
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

export default function LibrarianDashboard() {
  const { profile: authProfile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const { logoUrl, schoolName } = useBrandingStore()
  const [activeNav, setActiveNav] = useState('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [schoolId, setSchoolId] = useState(null)

  useEffect(() => {
    getSchoolId().then(setSchoolId)
  }, [])

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { key: 'catalogue', label: 'Book Catalogue', icon: <BookOpen size={18} /> },
    { key: 'borrow', label: 'Borrow / Return', icon: <ArrowLeftRight size={18} /> },
    { key: 'members', label: 'Members', icon: <Users size={18} /> },
    { key: 'overdue', label: 'Overdue', icon: <Clock size={18} /> },
    { key: 'reservations', label: 'Reservations', icon: <BookMarked size={18} /> },
    { key: 'management', label: 'Management', icon: <Settings size={18} /> },
    { key: 'reports', label: 'Reports', icon: <BarChart3 size={18} /> },
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
    management: 'Library Management',
    reports: 'Library Reports',
  }

  const renderContent = () => {
    if (!schoolId) return <div className="lib-loading" />
    switch (activeNav) {
      case 'dashboard':    return <LibraryOverview schoolId={schoolId} onNavigate={setActiveNav} />
      case 'catalogue':    return <LibraryCatalogue schoolId={schoolId} />
      case 'borrow':       return <LibraryBorrowReturn schoolId={schoolId} />
      case 'members':      return <LibraryMembers schoolId={schoolId} />
      case 'overdue':      return <LibraryOverdue schoolId={schoolId} />
      case 'reservations': return <LibraryReservations schoolId={schoolId} />
      case 'management':   return <LibraryManagement schoolId={schoolId} />
      case 'reports':      return <LibraryReports schoolId={schoolId} />
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
          <div className="lib-school-avatar">{school?.name?.[0] || 'L'}</div>
          <div>
            <p className="lib-school-name">{school?.name || 'Loading...'}</p>
            <p className="lib-school-role">Library</p>
          </div>
        </div>
        <nav className="lib-sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.key}
              className={`lib-nav-item ${activeNav === item.key ? 'active' : ''}`}
              onClick={() => { setActiveNav(item.key); setMobileOpen(false) }}
            >
              <span className="lib-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
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
