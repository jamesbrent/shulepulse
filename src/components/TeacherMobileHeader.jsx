import { Bell } from 'lucide-react'
import logoImg from '../assets/logo.png'
import './TeacherMobileHeader.css'

export default function TeacherMobileHeader({
  profile,
  notifCount = 0,
  onOpenMore,
  onOpenNotices,
}) {
  const initials = (profile?.full_name || 'T')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const avatarUrl = profile?.photo_url || null

  return (
    <header className="tmh-shell" aria-label="Teacher header">
      <div className="tmh-brand">
        <img src={logoImg} alt="" className="tmh-logo" />
        <span className="tmh-app-name">
          <span className="tmh-app-shule">Shule</span><span className="tmh-app-pulse">Pulse</span>
        </span>
      </div>

      <div className="tmh-actions">
        <button className="tmh-btn" onClick={onOpenNotices} aria-label="Open notices">
          <Bell size={20} />
          {notifCount > 0 && (
            <span className="tmh-badge">{notifCount > 9 ? '9+' : notifCount}</span>
          )}
        </button>
        <button className="tmh-avatar" onClick={onOpenMore} aria-label="Open profile menu">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="tmh-avatar-img" />
          ) : (
            initials || 'T'
          )}
        </button>
      </div>
    </header>
  )
}