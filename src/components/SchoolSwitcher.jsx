import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Building2, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

export default function SchoolSwitcher() {
  const { profile, selectedSchool, selectSchool } = useAuthStore()
  const [schools, setSchools] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const isSuperadmin = profile?.role === 'superadmin'

  useEffect(() => {
    if (!isSuperadmin) return
    supabase.from('schools').select('*').order('name').then(({ data }) => setSchools(data || []))
  }, [isSuperadmin])

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!isSuperadmin) return null

  const activeSchool = selectedSchool || profile?.schools

  return (
    <div className="school-switcher" ref={ref}>
      <button className="school-switcher-btn" onClick={() => setOpen(!open)}>
        <Building2 size={14} />
        <span>{activeSchool?.name || 'Select School'}</span>
        <ChevronDown size={14} className={`school-switcher-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="school-switcher-dropdown">
          {schools.map((s) => (
            <button
              key={s.id}
              className={`school-switcher-item ${activeSchool?.id === s.id ? 'active' : ''}`}
              onClick={() => { selectSchool(s); setOpen(false) }}
            >
              <span>{s.name}</span>
              {activeSchool?.id === s.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
