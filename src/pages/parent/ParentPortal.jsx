import { useState, useEffect } from 'react'
import {
  LayoutDashboard, BarChart2, DollarSign, ClipboardList,
  Bell, MessageSquare, LogOut, Phone, CreditCard,
  TrendingUp, TrendingDown, Minus, CheckCircle, Users,
  ChevronDown
} from 'lucide-react'

const WhatsAppIcon = ({ size = 16 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="#fff">
    <path d="M12.031 6.172c-3.328 0-6.047 2.719-6.047 6.047 0 1.078.281 2.109.82 3.047l-.516 1.875 1.922-.5c.89.484 1.906.734 2.953.734 3.328 0 6.047-2.719 6.047-6.047s-2.719-6.047-6.047-6.047zm0 10.969c-.938 0-1.852-.25-2.672-.734l-1.922.5.516-1.875c-.539-.938-.82-1.969-.82-3.047 0-2.781 2.266-5.047 5.047-5.047 2.781 0 5.047 2.266 5.047 5.047s-2.266 5.047-5.047 5.047zm2.766-3.844c-.141-.078-.844-.422-.969-.469-.125-.047-.219-.078-.312.078-.094.156-.359.469-.437.562-.078.094-.156.109-.3.031s-.609-.234-.117-.547c-.047-.031-.109-.078-.172-.109-.063-.031-.109-.047-.156.031s-.188.391-.234.469c-.047.078-.094.094-.234.016s-.594-.219-.113-.531c-.047-.031-.109-.078-.172-.109-.063-.031-.109-.047-.156.031s-.188.391-.234.469c-.047.078-.094.094-.234.016s-.594-.219-.113-.531c-.109-.078-.359-.281-.547-.359-.188-.078-.281-.031-.391.125s-.438.562-.438 1.359c0 .797.469 1.562.531 1.656s.859 1.328 2.078 1.844c1.219.516 1.219.344 1.438.312s.688-.281.782-.562c.094-.281.094-.531.0-.078-.562s-.047-.047-.094-.063z"/>
  </svg>
)
import { supabase } from '../../lib/supabase'
import { basePath } from '../../lib/paths'
import './ParentPortal.css'
import './AcademicResultsPage.css'
import './AttendancePage.css'
import './FeePaymentsPage.css'
import './NoticesPage.css'
import './MessagesPage.css'
import Overview from './components/Overview'
import AcademicResults from './components/AcademicResults'
import Attendance from './components/Attendance'
import FeePayments from './components/FeePayments'
import Messages from './components/Messages'
import Notices from './components/Notices'
import { useBrandingStore } from '../../features/branding/brandingStore'
import RoleSwitcher from '../../components/RoleSwitcher'

export default function ParentPortal() {
  const [activeNav, setActiveNav] = useState('dashboard')
  const [children, setChildren] = useState([])
  const [activeChild, setActiveChild] = useState(null)
  const [school, setSchool] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showChildDropdown, setShowChildDropdown] = useState(false)
  const { logoUrl, schoolName } = useBrandingStore()

  useEffect(() => {
    fetchParentData()
  }, [])

  const fetchParentData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('*, schools(*)')
      .eq('id', user.id)
      .single()

    if (profile?.schools) setSchool(profile.schools)

    const { data: childrenData } = await supabase
      .from('students')
      .select('*')
      .eq('parent_id', user.id)
      .eq('status', 'active')

    setChildren(childrenData || [])
    if (childrenData?.length > 0) setActiveChild(childrenData[0])
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = basePath('/')
  }

  const navItems = [
    { key: 'dashboard', label: 'Overview', icon: <LayoutDashboard size={18} /> },
    { key: 'grades', label: 'Academic Results', icon: <BarChart2 size={18} /> },
    { key: 'attendance', label: 'Attendance', icon: <ClipboardList size={18} /> },
    { key: 'fees', label: 'Fees & Payments', icon: <DollarSign size={18} /> },
    { key: 'messages', label: 'Messages', icon: <MessageSquare size={18} /> },
    { key: 'notices', label: 'Notices', icon: <Bell size={18} /> },
  ]

  const pageTitles = {
    dashboard: 'Overview',
    grades: 'Academic Results',
    attendance: 'Attendance',
    fees: 'Fees & Payments',
    messages: 'Messages',
    notices: 'Notices',
  }

  const renderContent = () => {
    switch (activeNav) {
      case 'grades':
        return <AcademicResults activeChild={activeChild} school={school} />
      case 'fees':
        return <FeePayments activeChild={activeChild} school={school} />
      case 'attendance':
        return <Attendance activeChild={activeChild} />
      case 'notices':
        return <Notices activeChild={activeChild} school={school} />
      case 'messages':
        return <Messages activeChild={activeChild} school={school} />
      default:
        return <Overview activeChild={activeChild} school={school} />
    }
  }

  return (
    <div className="parent-root">
      <aside className="parent-sidebar">
        <div className="sidebar-brand">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName || 'Logo'} style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div className="sidebar-logo">{schoolName?.[0] || 'S'}</div>
          )}
          <span>{schoolName || 'School'}</span>
        </div>

        <div className="parent-profile">
          <div className="parent-avatar">
            {school?.name?.[0] || 'P'}
          </div>
          <div>
            <p className="parent-name">Parent Portal</p>
            <p className="parent-role">
              <Users size={11} /> {children.length} {children.length === 1 ? 'child' : 'children'}
            </p>
          </div>
        </div>

        {children.length > 1 && (
          <div className="sidebar-section">
            <p className="sidebar-section-label">Viewing:</p>
            <div className="sidebar-child-selector" onClick={() => setShowChildDropdown(!showChildDropdown)}>
              <span className="sidebar-child-name">{activeChild?.full_name}</span>
              <ChevronDown size={14} />
            </div>
            {showChildDropdown && (
              <div className="sidebar-child-dropdown">
                {children.map(c => (
                  <button
                    key={c.id}
                    className={`sidebar-child-option ${activeChild?.id === c.id ? 'active' : ''}`}
                    onClick={() => { setActiveChild(c); setShowChildDropdown(false) }}
                  >
                    <span className="child-option-avatar">
                      {c.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </span>
                    <span>{c.full_name}</span>
                    {c.class && <span className="child-option-class">{c.class}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {children.length === 1 && (
          <div className="sidebar-section">
            <p className="sidebar-section-label">Child:</p>
            <div className="sidebar-child-single">
              <span className="sidebar-child-name">{activeChild?.full_name}</span>
              {activeChild?.class && <span className="child-option-class">{activeChild.class}</span>}
            </div>
          </div>
        )}

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${activeNav === item.key ? 'active' : ''}`}
              onClick={() => setActiveNav(item.key)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <RoleSwitcher />

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="parent-main">
        <header className="parent-header">
          <div>
            <h1>{pageTitles[activeNav]}</h1>
            <p>{school?.name || ''} · {school?.current_term || 'Current Term'}, {school?.current_year || new Date().getFullYear()}</p>
          </div>
          <div className="header-actions">
            {school?.phone && (
              <a href={`tel:${school.phone}`} className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Phone size={15} />
                {school.phone}
              </a>
            )}
            {school?.phone && (
              <a
                href={`https://wa.me/${school.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#25d366', color: '#fff', borderColor: '#25d366' }}
              >
                <WhatsAppIcon size={16} />
                WhatsApp
              </a>
            )}
            {!school?.phone && (
              <button className="btn-secondary" disabled>
                <Phone size={15} />
                No phone on file
              </button>
            )}
            <button className="btn-primary" onClick={() => setActiveNav('fees')}>
              <CreditCard size={15} />
              Pay Fees
            </button>
          </div>
        </header>

        {loading ? (
          <div className="loading-state">Loading portal...</div>
        ) : !activeChild ? (
          <div className="empty-att">
            <Users size={40} color="#cbd5e1" />
            <p>No children linked to your account</p>
            <span>Please contact the school to link your children</span>
          </div>
        ) : (
          renderContent()
        )}
      </main>
    </div>
  )
}
