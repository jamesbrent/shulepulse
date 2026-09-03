import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { supabase } from '../lib/supabase'
import { basePath } from '../lib/paths'
import { Shield, ChevronDown, LogOut } from 'lucide-react'
import { ROLE_META } from '../utils/roles'
import { logAction } from '../features/audit/auditService'
import './RoleSwitcher.css'

export default function RoleSwitcher({ mobile = false }) {
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
    const oldRole = profile?.role
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', profile.id)
    if (error) { console.error('Role switch failed:', error); return }

    logAction({
      schoolId: profile.school_id,
      action: 'role_switch',
      details: {
        user_id: profile.id,
        user_name: profile.full_name,
        from_role: oldRole,
        to_role: newRole,
      },
    })

    setOpen(false)
    window.location.href = basePath(ROLE_META[newRole]?.route || '/')
  }

  const otherRoles = roles.filter(r => r !== profile?.role)
  // On mobile only show teacher/class-teacher/parent switch targets
  const mobileAllowed = ['class_teacher', 'parent']
  const visibleRoles = mobile ? otherRoles.filter(r => mobileAllowed.includes(r)) : otherRoles
  if (visibleRoles.length === 0) return null

  return (
    <div className="role-switcher" ref={ref}>
      <button className="role-switcher-trigger" onClick={() => setOpen(!open)}>
        <Shield size={14} />
        <span>{currentMeta.label}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="role-switcher-dropdown">
          {visibleRoles.map(r => {
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
