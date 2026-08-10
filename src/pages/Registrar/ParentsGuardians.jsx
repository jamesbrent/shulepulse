import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Search, X, Users, Phone, Mail, ChevronRight, MoreVertical,
  Eye, Edit2, MessageCircle, Shield, AlertTriangle, Download,
  RefreshCw, Clock, UserPlus, Archive, GraduationCap,
  Smartphone, GripHorizontal, UserCheck
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import './ParentsGuardians.css'

const ROWS_PER_PAGE = 15
const WhatsAppIcon = ({ size = 16 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="#25D366">
    <path d="M12.031 6.172c-3.328 0-6.047 2.719-6.047 6.047 0 1.078.281 2.109.82 3.047l-.516 1.875 1.922-.5c.89.484 1.906.734 2.953.734 3.328 0 6.047-2.719 6.047-6.047s-2.719-6.047-6.047-6.047zm0 10.969c-.938 0-1.852-.25-2.672-.734l-1.922.5.516-1.875c-.539-.938-.82-1.969-.82-3.047 0-2.781 2.266-5.047 5.047-5.047 2.781 0 5.047 2.266 5.047 5.047s-2.266 5.047-5.047 5.047zm2.766-3.844c-.141-.078-.844-.422-.969-.469-.125-.047-.219-.078-.312.078-.094.156-.359.469-.437.562-.078.094-.156.109-.3.031s-.609-.234-.117-.547c-.047-.031-.109-.078-.172-.109-.063-.031-.109-.047-.156.031s-.188.391-.234.469c-.047.078-.094.094-.234.016s-.594-.219-.113-.531c-.047-.031-.109-.078-.172-.109-.063-.031-.109-.047-.156.031s-.188.391-.234.469c-.047.078-.094.094-.234.016s-.594-.219-.113-.531c-.109-.078-.359-.281-.547-.359-.188-.078-.281-.031-.391.125s-.438.562-.438 1.359c0 .797.469 1.562.531 1.656s.859 1.328 2.078 1.844c1.219.516 1.219.344 1.438.312s.688-.281.782-.562c.094-.281.094-.531.0-.078-.562s-.047-.047-.094-.063z"/>
  </svg>
)

/* ── Floating Action Panel ── */
function FloatingActionPanel({ student, onClose, items }) {
  const [pos, setPos] = useState(() => ({ x: Math.max(16, window.innerWidth - 380), y: Math.max(80, window.innerHeight / 2 - 180) }))
  const drag = useRef({ active: false, offset: { x: 0, y: 0 } })

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleMouseDown = (e) => {
    drag.current.active = true
    drag.current.offset = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const handleMove = (e) => {
      if (!drag.current.active) return
      setPos(p => ({ x: e.clientX - drag.current.offset.x, y: e.clientY - drag.current.offset.y }))
    }
    const handleUp = () => {
      if (!drag.current.active) return
      drag.current.active = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp) }
  }, [])

  return createPortal(
    <div className="pg-overlay" onClick={onClose}>
      <div className="pg-float-panel" style={{ left: pos.x, top: pos.y }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="pg-float-header" onMouseDown={handleMouseDown}>
          <div className="pg-float-header-info">
            <GripHorizontal size={14} className="pg-float-grip" />
            <div>
              <span className="pg-float-name">{student.parent_name}</span>
              <span className="pg-float-class">{student.parent_phone || 'No phone'}</span>
            </div>
          </div>
          <button className="pg-float-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="pg-float-body">
          {items.map((item, i) => item.sep ? (
            <div key={`sep-${i}`} className="pg-float-sep" />
          ) : (
            <button key={i} className={`pg-float-item ${item.danger ? 'pg-float-item--danger' : ''}`} onClick={() => { item.onClick(); onClose() }}>
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ── Family Profile Drawer ── */
function FamilyDrawer({ parent, onClose }) {
  if (!parent) return null

  const childNames = [...new Set(parent.children.map(c => c.class))]
  const totalFees = parent.children.reduce((sum, c) => sum + (c.fee_balance || 0), 0)

  return createPortal(
    <div className="pg-drawer-overlay" onClick={onClose}>
      <div className="pg-drawer" onClick={e => e.stopPropagation()}>
        <div className="pg-drawer-header">
          <h3>Family Profile</h3>
          <button className="pg-drawer-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="pg-drawer-body">
          <div className="pg-drawer-profile">
            <div className="pg-drawer-avatar" style={{ background: '#2563EB' }}>
              {parent.parent_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h4>{parent.parent_name}</h4>
              <p className="pg-drawer-id">Guardian #PG-{String(parent.parent_phone?.slice(-4) || Math.floor(Math.random() * 9999)).padStart(4, '0')}</p>
            </div>
          </div>

          <div className="pg-drawer-section">
            <h5><Phone size={14} /> Contact Information</h5>
            <div className="pg-drawer-contact">
              {parent.parent_phone ? (
                <a href={`tel:${parent.parent_phone}`} className="pg-drawer-link"><Phone size={13} /> {parent.parent_phone}</a>
              ) : <span className="pg-drawer-missing"><AlertTriangle size={13} /> No phone</span>}
              {parent.parent_email ? (
                <a href={`mailto:${parent.parent_email}`} className="pg-drawer-link"><Mail size={13} /> {parent.parent_email}</a>
              ) : <span className="pg-drawer-missing"><AlertTriangle size={13} /> No email</span>}
              {parent.parent_phone && (
                <a href={`https://wa.me/${parent.parent_phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="pg-drawer-link">
                  <WhatsAppIcon size={14} /> WhatsApp
                </a>
              )}
            </div>
          </div>

          <div className="pg-drawer-section">
            <h5><GraduationCap size={14} /> Linked Students ({parent.children.length})</h5>
            <div className="pg-drawer-students">
              {parent.children.map(c => (
                <div key={c.id} className="pg-drawer-student">
                  <div className="pg-drawer-student-avatar" style={{ background: '#16A34A' }}>
                    {c.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="pg-drawer-student-info">
                    <span className="pg-drawer-student-name">{c.full_name}</span>
                    <span className="pg-drawer-student-class">{c.class}{c.stream ? ` ${c.stream}` : ''} · {c.admission_number}</span>
                  </div>
                  <div className="pg-drawer-student-balance">
                    <span className="pg-drawer-balance-label">Fee Balance</span>
                    <span className={`pg-drawer-balance-value ${(c.fee_balance || 0) > 0 ? 'pg-drawer-balance--due' : 'pg-drawer-balance--clear'}`}>
                      KES {Number(c.fee_balance || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pg-drawer-section">
            <h5><Shield size={14} /> Emergency Contact Status</h5>
            <div className="pg-drawer-status-list">
              <div className="pg-drawer-status-item"><span className="pg-drawer-status-label">Phone</span><span className={`pg-drawer-status-value ${parent.parent_phone ? 'pg-status--ok' : 'pg-status--missing'}`}>{parent.parent_phone ? 'Verified' : 'Missing'}</span></div>
              <div className="pg-drawer-status-item"><span className="pg-drawer-status-label">Email</span><span className={`pg-drawer-status-value ${parent.parent_email ? 'pg-status--ok' : 'pg-status--missing'}`}>{parent.parent_email ? 'Verified' : 'Missing'}</span></div>
              <div className="pg-drawer-status-item"><span className="pg-drawer-status-label">Linked Children</span><span className="pg-drawer-status-value pg-status--ok">{parent.children.length} student{parent.children.length === 1 ? '' : 's'}</span></div>
            </div>
          </div>

          <div className="pg-drawer-section">
            <h5><Clock size={14} /> Communication History</h5>
            <p className="pg-drawer-empty">No recent communication recorded.</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ── Main Component ── */
export default function ParentsGuardians() {
  const { profile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterRel, setFilterRel] = useState('')
  const [actionPanel, setActionPanel] = useState(null)
  const [drawerParent, setDrawerParent] = useState(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (profile?.school_id) fetchData()
  }, [profile])

  useEffect(() => { setPage(1) }, [search, filterClass, filterRel])

  const fetchData = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('students')
      .select('id, full_name, admission_number, class, stream, parent_name, parent_phone, parent_email, parent_relationship, fee_balance')
      .eq('school_id', profile.school_id)
      .eq('status', 'active')
      .not('parent_name', 'is', null)
      .order('parent_name')
    setStudents(data || [])
    setLoading(false)
  }

  const parentGroups = {}
  students.forEach(s => {
    const key = s.parent_name?.toLowerCase().trim() || 'unknown'
    if (!parentGroups[key]) {
      parentGroups[key] = {
        parent_name: s.parent_name,
        parent_phone: s.parent_phone,
        parent_email: s.parent_email,
        parent_relationship: s.parent_relationship,
        children: [],
      }
    }
    parentGroups[key].children.push(s)
  })

  const parentList = Object.values(parentGroups).filter(p => {
    if (search) {
      const q = search.toLowerCase()
      if (!p.parent_name?.toLowerCase().includes(q) && !p.parent_phone?.includes(q) &&
        !p.children.some(c => c.full_name?.toLowerCase().includes(q))) return false
    }
    if (filterClass) {
      if (!p.children.some(c => c.class === filterClass)) return false
    }
    if (filterRel) {
      const rel = (p.parent_relationship || '').toLowerCase()
      if (rel !== filterRel) return false
    }
    return true
  })

  const allClasses = [...new Set(students.map(s => s.class).filter(Boolean))].sort()
  const allRelationships = [...new Set(students.map(s => s.parent_relationship).filter(Boolean))]

  const totalParents = parentList.length
  const linkedStudents = parentList.reduce((sum, p) => sum + p.children.length, 0)
  const multiChild = parentList.filter(p => p.children.length > 1).length
  const missingContact = parentList.filter(p => !p.parent_phone || !p.parent_email).length

  const totalPages = Math.ceil(parentList.length / ROWS_PER_PAGE)
  const paginated = parentList.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  const avatarColor = (name) => {
    const colors = ['#2563EB', '#7C3AED', '#16A34A', '#CA8A04', '#DC2626', '#0891B2']
    let hash = 0; for (const c of (name || '')) hash = c.charCodeAt(0) + ((hash << 5) - hash)
    return colors[Math.abs(hash) % colors.length]
  }

  const relationshipMeta = {
    father: { label: 'Father', cls: 'pg-rel--father' },
    mother: { label: 'Mother', cls: 'pg-rel--mother' },
    guardian: { label: 'Guardian', cls: 'pg-rel--guardian' },
    sponsor: { label: 'Sponsor', cls: 'pg-rel--sponsor' },
    relative: { label: 'Relative', cls: 'pg-rel--relative' },
  }

  const getRelMeta = (rel) => relationshipMeta[rel?.toLowerCase()] || { label: rel || 'Parent', cls: 'pg-rel--other' }

  const getStatusMeta = (p) => {
    if (!p.parent_phone || !p.parent_email) return { label: 'Missing Contact', cls: 'pg-status--missing' }
    return { label: 'Active', cls: 'pg-status--active' }
  }

  const genGuardianCode = (p) => {
    const suffix = p.parent_phone?.slice(-4) || String(Math.floor(Math.random() * 9999)).padStart(4, '0')
    return `PG-${suffix}`
  }

  if (loading) return (
    <div className="pg-loading"><div className="pg-spinner" /><span>Loading parents & guardians...</span></div>
  )

  return (
    <div className="pg-root">
      <div className="pg-metrics">
        {[
          { label: 'Total Parents', value: totalParents, color: '#2563EB', bg: '#EFF6FF', icon: <Users size={18} /> },
          { label: 'Linked Students', value: linkedStudents, color: '#16A34A', bg: '#F0FDF4', icon: <GraduationCap size={18} /> },
          { label: 'Multi-Child Families', value: multiChild, color: '#7C3AED', bg: '#EDE9FE', icon: <Users size={18} /> },
          { label: 'Missing Contact', value: missingContact, color: '#F59E0B', bg: '#FEF3C7', icon: <AlertTriangle size={18} /> },
        ].map(m => (
          <div className="pg-metric" key={m.label}>
            <div className="pg-metric-icon" style={{ background: m.bg, color: m.color }}>{m.icon}</div>
            <div className="pg-metric-content">
              <span className="pg-metric-value" style={{ color: m.color }}>{m.value}</span>
              <span className="pg-metric-label">{m.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="pg-toolbar">
        <div className="pg-toolbar-left">
          <div className="pg-search-wrap">
            <Search size={14} className="pg-search-icon" />
            <input className="pg-search-input" placeholder="Search parent or student..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="pg-search-clear" onClick={() => setSearch('')}><X size={14} /></button>}
          </div>
        </div>
        <div className="pg-toolbar-right">
          <select className="pg-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
            <option value="">All Classes</option>
            {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="pg-select" value={filterRel} onChange={e => setFilterRel(e.target.value)}>
            <option value="">All Relationships</option>
            {allRelationships.map(r => <option key={r} value={r.toLowerCase()}>{r}</option>)}
          </select>
          <button className="pg-btn pg-btn--icon" onClick={fetchData} title="Refresh"><RefreshCw size={15} /></button>
          <button className="pg-btn pg-btn--icon" onClick={() => {
            const rows = [['Parent Name', 'Phone', 'Email', 'Children', 'Classes'].join(',')]
            parentList.forEach(p => rows.push(
              [p.parent_name, p.parent_phone || '', p.parent_email || '',
                p.children.length, [...new Set(p.children.map(c => c.class))].join('; ')].join(',')))
            const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = 'parents_guardians.csv'; a.click()
            URL.revokeObjectURL(url)
          }} title="Export CSV"><Download size={15} /></button>
        </div>
      </div>

      {parentList.length === 0 ? (
        <div className="pg-empty">
          <Users size={48} color="#CBD5E1" />
          <p className="pg-empty-title">No parents or guardians found</p>
          <p className="pg-empty-sub">No records match your current filters. Add student parent information to see them here.</p>
          {(search || filterClass || filterRel) && (
            <button className="pg-btn pg-btn--outline" onClick={() => { setSearch(''); setFilterClass(''); setFilterRel('') }}>Clear Filters</button>
          )}
        </div>
      ) : (
        <>
          <div className="pg-table-wrap">
            <table className="pg-table">
              <thead>
                <tr>
                  <th className="pg-th--parent">Parent</th>
                  <th className="pg-th--contact">Contact</th>
                  <th className="pg-th--students">Linked Students</th>
                  <th className="pg-th--rel">Relationship</th>
                  <th className="pg-th--status">Status</th>
                  <th className="pg-th--actions"></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((p, i) => {
                  const relMeta = getRelMeta(p.parent_relationship)
                  const statusMeta = getStatusMeta(p)
                  return (
                    <tr key={i} className="pg-row">
                      <td>
                        <div className="pg-parent-cell">
                          <div className="pg-avatar" style={{ background: avatarColor(p.parent_name) }}>
                            {p.parent_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="pg-parent-info">
                            <span className="pg-parent-name">{p.parent_name}</span>
                            <span className="pg-parent-code">Guardian #{genGuardianCode(p)}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="pg-contact-cell">
                          {p.parent_phone ? (
                            <a href={`tel:${p.parent_phone}`} className="pg-contact-phone">
                              <Phone size={12} /> {p.parent_phone}
                              <a href={`https://wa.me/${p.parent_phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="pg-contact-wa" title="WhatsApp">
                                <WhatsAppIcon size={14} />
                              </a>
                            </a>
                          ) : <span className="pg-contact-missing">No phone</span>}
                          {p.parent_email ? (
                            <a href={`mailto:${p.parent_email}`} className="pg-contact-email"><Mail size={12} /> {p.parent_email}</a>
                          ) : <span className="pg-contact-missing">No email</span>}
                        </div>
                      </td>
                      <td>
                        <div className="pg-chips">
                          {p.children.slice(0, 3).map(c => (
                            <span key={c.id} className="pg-chip" title={`${c.class}${c.stream ? ` ${c.stream}` : ''}`}>
                              {c.full_name?.split(' ')[0]}
                            </span>
                          ))}
                          {p.children.length > 3 && <span className="pg-chip pg-chip--more">+{p.children.length - 3}</span>}
                        </div>
                      </td>
                      <td><span className={`pg-rel-badge ${relMeta.cls}`}>{relMeta.label}</span></td>
                      <td><span className={`pg-status-badge ${statusMeta.cls}`}>{statusMeta.label}</span></td>
                      <td>
                        <button className="pg-action-btn" onClick={() => setActionPanel(p)} aria-label="Actions">
                          <MoreVertical size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pg-pagination">
              <span className="pg-page-info">Showing {((page - 1) * ROWS_PER_PAGE) + 1}–{Math.min(page * ROWS_PER_PAGE, parentList.length)} of {parentList.length}</span>
              <div className="pg-page-btns">
                <button className="pg-btn pg-btn--xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} className={`pg-btn pg-btn--xs ${page === p ? 'pg-btn--active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="pg-btn pg-btn--xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {actionPanel && (
        <FloatingActionPanel
          student={actionPanel}
          onClose={() => setActionPanel(null)}
          items={[
            { icon: <Users size={15} />, label: 'View Family Profile', onClick: () => { setDrawerParent(actionPanel) } },
            { icon: <Edit2 size={15} />, label: 'Edit Parent', onClick: () => {} },
            { icon: <Eye size={15} />, label: 'View Children', onClick: () => {} },
            { sep: true },
            { icon: <Smartphone size={15} />, label: 'Send SMS', onClick: () => { if (actionPanel.parent_phone) window.open(`sms:${actionPanel.parent_phone}`) } },
            { icon: <Mail size={15} />, label: 'Send Email', onClick: () => { if (actionPanel.parent_email) window.open(`mailto:${actionPanel.parent_email}`) } },
            { icon: <MessageCircle size={15} />, label: 'WhatsApp Message', onClick: () => { if (actionPanel.parent_phone) window.open(`https://wa.me/${actionPanel.parent_phone.replace(/[^0-9]/g, '')}`, '_blank') } },
            { sep: true },
            { icon: <UserPlus size={15} />, label: 'Link Another Student', onClick: () => {} },
            { icon: <Archive size={15} />, label: 'Archive Guardian', onClick: () => {}, danger: true },
          ]}
        />
      )}

      {drawerParent && (
        <FamilyDrawer parent={drawerParent} onClose={() => setDrawerParent(null)} />
      )}
    </div>
  )
}
