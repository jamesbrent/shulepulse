import { useState, useEffect } from 'react'
import { Search, Shield, Phone, Mail, X, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

export default function ParentsView() {
  const { profile } = useAuthStore()
  const [parents, setParents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (profile?.school_id) fetchParents()
  }, [profile])

  const fetchParents = async () => {
    setLoading(true)
    const [profilesRes, studentsRes] = await Promise.all([
      supabase.from('profiles')
        .select('id, full_name, email, phone, role, roles')
        .eq('school_id', profile.school_id)
        .eq('role', 'parent'),
      supabase.from('students')
        .select('id, full_name, class, stream, guardian_name, guardian_phone, guardian_email, parent_id')
        .eq('school_id', profile.school_id)
        .order('full_name'),
    ])

    const students = studentsRes.data || []
    const portalParents = (profilesRes.data || []).map(p => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      hasPortal: true,
      children: students.filter(s => s.parent_id === p.id),
    }))

    const byName = new Map()
    students.forEach(s => {
      if (!s.guardian_name) return
      const key = s.guardian_name.toLowerCase()
      if (!byName.has(key)) {
        byName.set(key, {
          id: `g-${key}`,
          full_name: s.guardian_name,
          phone: s.guardian_phone,
          email: s.guardian_email,
          hasPortal: false,
          children: [],
        })
      }
      byName.get(key).children.push(s)
    })

    const existingPortal = new Set(portalParents.map(p => p.full_name?.toLowerCase()))
    const listedParents = [...portalParents]
    byName.forEach((p, key) => {
      if (!existingPortal.has(key)) listedParents.push(p)
    })

    setParents(listedParents.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')))
    setLoading(false)
  }

  const filtered = parents.filter(p => {
    const q = search.toLowerCase()
    if (!q) return true
    return [p.full_name, p.phone, p.email].some(f => (f || '').toLowerCase().includes(q)) ||
      p.children.some(c => [c.full_name, c.class].some(f => (f || '').toLowerCase().includes(q)))
  })

  if (loading) return <div className="rcp-load"><div className="rcp-spin" /><span>Loading parents...</span></div>

  return (
    <div className="rcp-page">
      <div className="rcp-page-header">
        <div>
          <h2>Parents & Guardians</h2>
          <p>Front desk directory for parents and guardians — read only</p>
        </div>
        <span className="rcp-badge rcp-badge--teal"><Shield size={12} /> {parents.length} records</span>
      </div>

      <div className="rcp-filters">
        <div className="rcp-search-wrap">
          <Search size={15} className="rcp-search-icon" />
          <input className="rcp-search-input" placeholder="Search parent or student..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} parent{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rcp-empty">
          <Shield size={40} color="#cbd5e1" />
          <p>No parent records found</p>
          <span>Parents appear here once linked to a student or given a portal account</span>
        </div>
      ) : (
        <div className="rcp-table-wrap">
          <table className="rcp-table">
            <thead>
              <tr>
                <th>Parent / Guardian</th>
                <th>Contact</th>
                <th>Children</th>
                <th>Portal</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td>
                    <div className="rcp-name-cell">
                      <div className="rcp-avatar-sm">{p.full_name?.[0] || 'P'}</div>
                      <div>{p.full_name}</div>
                    </div>
                  </td>
                  <td>
                    {p.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Phone size={12} color="#94a3b8" /> {p.phone}</div>}
                    {p.email && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Mail size={12} color="#94a3b8" /> {p.email}</div>}
                    {!p.phone && !p.email && <span style={{ color: '#94a3b8' }}>No contact</span>}
                  </td>
                  <td>
                    {p.children.length === 0 ? (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    ) : (
                      <div>
                        {p.children.slice(0, 2).map(c => (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                            <Users size={11} color="#94a3b8" /> {c.full_name}{c.class ? ` (${c.class})` : ''}
                          </div>
                        ))}
                        {p.children.length > 2 && <small style={{ color: '#94a3b8' }}>+{p.children.length - 2} more</small>}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`rcp-badge ${p.hasPortal ? 'rcp-badge--green' : 'rcp-badge--gray'}`}>
                      {p.hasPortal ? 'Portal account' : 'Contact only'}
                    </span>
                  </td>
                  <td><button className="rcp-action-btn" onClick={() => setDetail(p)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="rcp-modal-overlay" onClick={() => setDetail(null)}>
          <div className="rcp-modal" onClick={e => e.stopPropagation()}>
            <div className="rcp-modal-header">
              <h3>Parent / Guardian</h3>
              <button className="rcp-modal-close" onClick={() => setDetail(null)}><X size={15} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div className="rcp-avatar-sm" style={{ width: 56, height: 56, fontSize: 18 }}>{detail.full_name?.[0] || 'P'}</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{detail.full_name}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  {detail.phone || 'No phone'}{detail.email ? ` • ${detail.email}` : ''}
                </div>
                <span className={`rcp-badge ${detail.hasPortal ? 'rcp-badge--green' : 'rcp-badge--gray'}`} style={{ marginTop: 4 }}>
                  {detail.hasPortal ? 'Portal account' : 'Contact only'}
                </span>
              </div>
            </div>
            <div className="rcp-form-section"><Users size={11} /> Children at School</div>
            {detail.children.length === 0 ? (
              <p style={{ fontSize: 13, color: '#94a3b8' }}>No children linked to this record.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail.children.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 10, padding: '10px 14px' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{c.full_name}</span>
                    <span style={{ fontSize: 12, color: '#64748b' }}>{c.class || 'No class'}{c.stream ? ` ${c.stream}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
