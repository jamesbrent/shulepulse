import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Calendar, BookOpen, ClipboardList,
  MoreHorizontal, X, LogOut,
} from 'lucide-react'
import './TeacherMobileNav.css'

const PRIMARY = [
  { key: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { key: 'timetable', label: 'Timetable', icon: Calendar },
  { key: 'myclasses', label: 'Classes', icon: BookOpen },
  { key: 'attendance', label: 'Attendance', icon: ClipboardList },
]

export default function TeacherMobileNav({
  items = [],
  activeNav,
  onNavigate,
  onNoticesSeen,
  notifCount = 0,
  profile,
  schoolName,
  onLogout,
}) {
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = moreOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [moreOpen])

  const isPrimary = (key) => PRIMARY.some((p) => p.key === key)
  const moreItems = items.filter((i) => !isPrimary(i.key))
  const moreActive = moreOpen || (activeNav && !isPrimary(activeNav))

  const go = (key, markSeen) => {
    setMoreOpen(false)
    document.body.style.overflow = ''
    if (markSeen) onNoticesSeen?.()
    onNavigate?.(key)
  }

  const initials = (profile?.full_name || 'T')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <>
      <nav className="tmn-nav" aria-label="Teacher mobile navigation">
        {PRIMARY.map((p) => {
          const Icon = p.icon
          const active = activeNav === p.key
          return (
            <button
              key={p.key}
              className={`tmn-item ${active ? 'tmn-item--active' : ''}`}
              onClick={() => go(p.key)}
              aria-label={p.label}
              aria-current={active ? 'page' : undefined}
            >
              <span className="tmn-item-icon"><Icon size={20} /></span>
              <span className="tmn-item-label">{p.label}</span>
            </button>
          )
        })}

        <button
          className={`tmn-item ${moreActive ? 'tmn-item--active' : ''}`}
          onClick={() => setMoreOpen((v) => !v)}
          aria-label="More options"
          aria-expanded={moreOpen}
        >
          <span className="tmn-item-icon">
            <MoreHorizontal size={20} />
            {notifCount > 0 && <span className="tmn-badge">{notifCount > 9 ? '9+' : notifCount}</span>}
          </span>
          <span className="tmn-item-label">More</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <div className="tmn-overlay" onClick={() => setMoreOpen(false)} />
          <div className="tmn-sheet" role="dialog" aria-label="More options">
            <div className="tmn-sheet-handle" />

            <div className="tmn-sheet-hdr">
              <div className="tmn-sheet-avatar">{initials || 'T'}</div>
              <div className="tmn-sheet-id">
                <p className="tmn-sheet-name">{profile?.full_name || 'Teacher'}</p>
                <p className="tmn-sheet-school">{schoolName || 'School'}</p>
              </div>
              <button className="tmn-sheet-close" onClick={() => setMoreOpen(false)} aria-label="Close menu">
                <X size={20} />
              </button>
            </div>

            <div className="tmn-more-grid">
              {moreItems.length === 0 ? (
                <p className="tmn-more-empty">No additional modules</p>
              ) : moreItems.map((item) => {
                const active = activeNav === item.key
                return (
                  <button
                    key={item.key}
                    className={`tmn-more-item ${active ? 'tmn-more-item--active' : ''}`}
                    onClick={() => go(item.key, item.key === 'notices')}
                  >
                    <span className="tmn-more-icon">{item.icon}</span>
                    <span className="tmn-more-label">{item.label}</span>
                    {item.key === 'notices' && notifCount > 0 && (
                      <span className="tmn-badge tmn-badge--sm">{notifCount > 9 ? '9+' : notifCount}</span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="tmn-sheet-footer">
              <button className="tmn-logout" onClick={() => { setMoreOpen(false); document.body.style.overflow = ''; onLogout?.() }}>
                <LogOut size={16} /> Logout
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}