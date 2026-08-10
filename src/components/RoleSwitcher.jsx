import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { supabase } from '../lib/supabase'
import { basePath } from '../lib/paths'
import { Shield, ChevronDown, LogOut } from 'lucide-react'
import './RoleSwitcher.css'

const ROLE_META = {
  superadmin:            { label: 'Super Admin',      color: '#0f172a', route: '/superadmin' },
  admin:                { label: 'Admin',             color: '#2563eb', route: '/admin' },
  deputy_administrator: { label: 'Deputy Admin',      color: '#2563eb', route: '/deputy-admin' },
  bursar:               { label: 'Bursar',            color: '#16a34a', route: '/bursar' },
  registrar:            { label: 'Registrar',         color: '#ca8a04', route: '/registrar' },
  hod:                  { label: 'HOD',               color: '#7c3aed', route: '/hod' },
  teacher:              { label: 'Teacher',           color: '#64748b', route: '/teacher' },
  class_teacher:        { label: 'Class Teacher',     color: '#dc2626', route: '/class-teacher' },
  parent:               { label: 'Parent',            color: '#0891b2', route: '/parent' },
  student:              { label: 'Student',           color: '#d97706', route: '/student' },
}

export default function RoleSwitcher() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const roles = profile?.roles?.filter(Boolean) || (profile?.role ? [profile.role] : [])
  if (roles.length <= 1) return null

  const currentMeta = ROLE_META[profile?.role] || { label: profile?.role || 'Unknown', color: '#94a3b8' }

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const switchRole = async (newRole) => {
    if (newRole === profile?.role) { setOpen(false); return }
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', profile.id)
    if (error) { console.error('Role switch failed:', error); return }
    setOpen(false)
    window.location.href = basePath(ROLE_META[newRole]?.route || '/')
  }

  const otherRoles = roles.filter(r => r !== profile?.role)

  return (
    <div className="role-switcher" ref={ref}>
      <button className="role-switcher-trigger" onClick={() => setOpen(!open)}>
        <Shield size={14} />
        <span>{currentMeta.label}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="role-switcher-dropdown">
          {otherRoles.map(r => {
            const meta = ROLE_META[r]
            if (!meta) return null
            return (
              <button key={r} className="role-switcher-option" onClick={() => switchRole(r)}>
                <span className="role-switcher-dot" style={{ background: meta.color }} />
                <span>Switch to {meta.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
