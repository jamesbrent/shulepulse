import { useState, useEffect } from 'react'
import {
  GraduationCap, Search, Mail, Phone, BookOpen,
  Users, Eye
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

export default function Teachers() {
  const { profile } = useAuthStore()
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterSubject, setFilterSubject] = useState('all')

  useEffect(() => {
    fetchTeachers()
  }, [profile?.school_id])

  const fetchTeachers = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('teachers')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('full_name')

    const normalised = (data || []).map(t => ({
      ...t,
      subjects: Array.isArray(t.subjects) ? t.subjects : [],
      departments: Array.isArray(t.departments) ? t.departments : [],
      classes_assigned: Array.isArray(t.classes_assigned) ? t.classes_assigned : [],
    }))

    setTeachers(normalised)
    setLoading(false)
  }

  const allSubjects = [...new Set(teachers.flatMap(t => t.subjects || []))].sort()

  const filtered = teachers.filter(t => {
    const s = search.toLowerCase()
    const matchSearch = !s || t.full_name?.toLowerCase().includes(s) || t.staff_number?.toLowerCase().includes(s) || t.email?.toLowerCase().includes(s)
    const matchSubject = filterSubject === 'all' || (t.subjects || []).includes(filterSubject)
    return matchSearch && matchSubject
  })

  if (loading) return <div className="da-loading-state">Loading teachers...</div>

  return (
    <div>
      <div className="da-summary">
        {[
          { label: 'Total Teachers', value: teachers.length, icon: <GraduationCap size={20} />, color: 'purple' },
          { label: 'Active', value: teachers.filter(t => t.status === 'active' || t.active_status !== false).length, icon: <Users size={20} />, color: 'green' },
          { label: 'With Subjects', value: teachers.filter(t => (t.subjects || []).length > 0).length, icon: <BookOpen size={20} />, color: 'blue' },
          { label: 'Assigned Classes', value: teachers.filter(t => (t.classes_assigned || []).length > 0).length, icon: <GraduationCap size={20} />, color: 'amber' },
        ].map(s => (
          <div key={s.label} className={`da-sum-card ${s.color}`}>
            {s.icon}
            <div>
              <p className="da-tsc-label">{s.label}</p>
              <p className="da-tsc-value">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="da-toolbar">
        <div className="da-toolbar-left">
          <div className="da-search-wrap">
            <Search size={14} className="da-search-icon" />
            <input className="da-search-input" placeholder="Search name or staff no..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="da-filter-select" value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
            <option value="all">All Subjects</option>
            {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <GraduationCap size={40} color="#cbd5e1" />
          <p>No teachers found</p>
        </div>
      ) : (
        <div className="da-table-wrap" style={{ marginTop: 16 }}>
          <table className="da-table-full">
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Staff No.</th>
                <th>Contact</th>
                <th>Subjects</th>
                <th>Classes Assigned</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id}>
                  <td>
                    <div className="da-student-name-cell">
                      <div className="da-student-avatar-sm">
                        {t.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      {t.full_name}
                    </div>
                  </td>
                  <td className="da-text-muted" style={{ fontFamily: 'monospace', fontSize: 13 }}>
                    {t.staff_number || t.employee_number || '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {t.email && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}>
                          <Mail size={12} color="#94a3b8" /> {t.email}
                        </span>
                      )}
                      {t.phone && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}>
                          <Phone size={12} color="#94a3b8" /> {t.phone}
                        </span>
                      )}
                      {!t.email && !t.phone && <span className="da-text-muted">—</span>}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(t.subjects || []).slice(0, 3).map(s => (
                        <span key={s} className="da-subject-tag">{s}</span>
                      ))}
                      {(t.subjects || []).length > 3 && (
                        <span className="da-subject-tag" style={{ background: '#f1f5f9', color: '#64748b' }}>
                          +{(t.subjects || []).length - 3}
                        </span>
                      )}
                      {!(t.subjects || []).length && <span className="da-text-muted">—</span>}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(t.classes_assigned || []).slice(0, 3).map(c => (
                        <span key={c} className="da-subject-tag" style={{ background: '#f3f0ff', color: '#7c3aed' }}>{c}</span>
                      ))}
                      {(t.classes_assigned || []).length > 3 && (
                        <span className="da-subject-tag" style={{ background: '#f1f5f9', color: '#64748b' }}>
                          +{(t.classes_assigned || []).length - 3}
                        </span>
                      )}
                      {!(t.classes_assigned || []).length && <span className="da-text-muted">—</span>}
                    </div>
                  </td>
                  <td>
                    <span className={`da-status-badge ${t.status === 'active' ? 'active' : t.status === 'on_leave' ? 'warning' : 'danger'}`}>
                      {t.status || 'active'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
