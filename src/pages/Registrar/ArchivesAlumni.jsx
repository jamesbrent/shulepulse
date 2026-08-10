import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Archive, Search, ChevronRight, Users, GraduationCap,
  Download, RefreshCw, Calendar, MoreVertical, X, Eye,
  Lock, Unlock, ArrowUp, ArrowDown, Clock, FileText,
  UserCheck, AlertTriangle, GripHorizontal, RotateCcw
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmtDate } from '../admin/fees/utils/feesHelpers'
import './ArchivesAlumni.css'

const ROWS_PER_PAGE = 15

function FloatingActionPanel({ student, onClose, items }) {
  const [pos, setPos] = useState(() => ({ x: Math.max(16, window.innerWidth - 380), y: Math.max(80, window.innerHeight / 2 - 200) }))
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
    <div className="aa-overlay" onClick={onClose}>
      <div className="aa-float-panel" style={{ left: pos.x, top: pos.y }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="aa-float-header" onMouseDown={handleMouseDown}>
          <div className="aa-float-header-info">
            <GripHorizontal size={14} className="aa-float-grip" />
            <div>
              <span className="aa-float-name">{student.full_name}</span>
              <span className="aa-float-class">{student.admission_number} — {student.class}{student.stream ? ` ${student.stream}` : ''}</span>
            </div>
          </div>
          <button className="aa-float-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="aa-float-body">
          {items.map((item, i) => item.sep ? (
            <div key={`sep-${i}`} className="aa-float-sep" />
          ) : (
            <button key={i} className={`aa-float-item ${item.danger ? 'aa-float-item--danger' : ''} ${item.warning ? 'aa-float-item--warning' : ''}`} onClick={() => { item.onClick(); onClose() }}>
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function ArchivesAlumni() {
  const { profile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const [activeTab, setActiveTab] = useState('alumni')
  const [allData, setAllData] = useState({ alumni: [], archived: [], withdrawn: [] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [actionPanel, setActionPanel] = useState(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (profile?.school_id) fetchAll()
  }, [profile])

  useEffect(() => { setPage(1) }, [search, filterYear, activeTab])

  const fetchAll = async () => {
    setLoading(true)
    const schoolId = profile.school_id

    const [alumniRes, archivedRes, withdrawnRes] = await Promise.all([
      supabase.from('students').select('*').eq('school_id', schoolId).eq('status', 'alumni').order('full_name'),
      supabase.from('students').select('*').eq('school_id', schoolId).eq('status', 'inactive').order('full_name'),
      supabase.from('students').select('*').eq('school_id', schoolId).eq('status', 'transferred').order('full_name'),
    ])

    setAllData({
      alumni: alumniRes.data || [],
      archived: archivedRes.data || [],
      withdrawn: withdrawnRes.data || [],
    })
    setLoading(false)
  }

  const years = [...new Set([
    ...allData.alumni.map(s => s.updated_at ? new Date(s.updated_at).getFullYear() : null),
    ...allData.archived.map(s => s.updated_at ? new Date(s.updated_at).getFullYear() : null),
    ...allData.withdrawn.map(s => s.updated_at ? new Date(s.updated_at).getFullYear() : null),
  ].filter(Boolean))].sort((a, b) => b - a)

  const currentKey = activeTab
  const currentData = allData[currentKey] || []

  const filtered = currentData.filter(s => {
    if (search) {
      const q = search.toLowerCase()
      if (!s.full_name?.toLowerCase().includes(q) && !s.admission_number?.toLowerCase().includes(q)) return false
    }
    if (filterYear) {
      const year = s.updated_at ? new Date(s.updated_at).getFullYear() : null
      if (year !== Number(filterYear)) return false
    }
    return true
  })

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE)
  const paginated = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  const tabMeta = {
    alumni: { label: 'Alumni', icon: <GraduationCap size={15} />, color: '#7C3AED' },
    archived: { label: 'Archived', icon: <Archive size={15} />, color: '#64748B' },
    withdrawn: { label: 'Withdrawn', icon: <Users size={15} />, color: '#F59E0B' },
  }

  const statusMeta = {
    alumni: { label: 'Alumni', cls: 'aa-badge--alumni' },
    inactive: { label: 'Archived', cls: 'aa-badge--archived' },
    transferred: { label: 'Withdrawn', cls: 'aa-badge--withdrawn' },
  }

  const avatarColor = (name) => {
    const colors = ['#2563EB', '#7C3AED', '#16A34A', '#CA8A04', '#DC2626', '#0891B2']
    let hash = 0; for (const c of (name || '')) hash = c.charCodeAt(0) + ((hash << 5) - hash)
    return colors[Math.abs(hash) % colors.length]
  }

  const getActionItems = (s) => {
    const items = [
      { icon: <Eye size={15} />, label: 'View Profile', onClick: () => {} },
      { sep: true },
    ]
    if (s.status === 'inactive') {
      items.push({ icon: <RotateCcw size={15} />, label: 'Restore Record', onClick: () => handleRestore(s) })
    }
    if (s.status === 'transferred') {
      items.push({ icon: <RotateCcw size={15} />, label: 'Restore Record', onClick: () => handleRestore(s) })
      items.push({ icon: <ArrowUp size={15} />, label: 'Move to Alumni', onClick: () => handleMoveToAlumni(s) })
    }
    if (s.status === 'alumni') {
      items.push({ icon: <Archive size={15} />, label: 'Move to Archived', onClick: () => handleArchive(s) })
    }
    items.push({ sep: true })
    items.push({ icon: <Download size={15} />, label: 'Download Archive PDF', onClick: () => handleDownloadPDF(s) })
    items.push({ icon: <Clock size={15} />, label: 'View Audit Trail', onClick: () => handleAuditTrail(s) })
    items.push({ sep: true })
    items.push({ icon: <Lock size={15} />, label: 'Permanently Archive', onClick: () => handlePermanentArchive(s), danger: true })
    return items
  }

  const handleRestore = async (s) => {
    await supabase.from('students').update({ status: 'active', updated_at: new Date().toISOString(), updated_by: profile?.id }).eq('id', s.id)
    fetchAll()
  }

  const handleMoveToAlumni = async (s) => {
    await supabase.from('students').update({ status: 'alumni', updated_at: new Date().toISOString(), updated_by: profile?.id }).eq('id', s.id)
    fetchAll()
  }

  const handleArchive = async (s) => {
    await supabase.from('students').update({ status: 'inactive', updated_at: new Date().toISOString(), updated_by: profile?.id }).eq('id', s.id)
    fetchAll()
  }

  const handlePermanentArchive = async (s) => {
    await supabase.from('students').update({ status: 'archived_permanent', updated_at: new Date().toISOString(), updated_by: profile?.id }).eq('id', s.id)
    fetchAll()
  }

  const handleDownloadPDF = (s) => {
    const docId = `ARC/${currentYear}/${String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0')}`
    const date = new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })
    const schName = school?.name || 'Our School'
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Archive — ${s.full_name}</title><style>@page{size:A4;margin:18mm 20mm}body{font-family:'Times New Roman',serif;color:#111;line-height:1.6}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:6px 8px;border:1px solid #ccc;font-size:10pt}td:first-child{background:#f9f9f9;font-weight:600;width:35%}h2{text-align:center;color:#1e3a5f;margin-bottom:4px}.meta{text-align:center;color:#666;font-size:9pt;margin-bottom:20px;border-bottom:2px solid #1e3a5f;padding-bottom:10px}</style></head><body><div class="meta"><h2>${schName}</h2><div>Archive Document: ${docId} | ${date}</div></div><h2>STUDENT ARCHIVE RECORD</h2><table><tr><td>Full Name</td><td>${s.full_name}</td></tr><tr><td>Admission Number</td><td>${s.admission_number || '—'}</td></tr><tr><td>Class</td><td>${s.class || '—'}${s.stream ? ' ' + s.stream : ''}</td></tr><tr><td>Gender</td><td>${s.gender || '—'}</td></tr><tr><td>Status</td><td>${s.status}</td></tr><tr><td>Exit Date</td><td>${s.exit_date || '—'}</td></tr><tr><td>Exit Reason</td><td>${s.exit_reason || '—'}</td></tr></table></body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `Archive_${s.admission_number || s.full_name.replace(/\s+/g, '_')}.html`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleAuditTrail = async (s) => {
    const { data } = await supabase
      .from('audit_logs')
      .select('action, details, created_at')
      .eq('details->>entity_id', String(s.id))
      .order('created_at', { ascending: false })
      .limit(5)
    const msg = data?.length ? data.map(l => `${l.action} (${fmtDate(l.created_at)})`).join('\n') : 'No audit records found.'
    alert(msg)
  }

  const handleViewProfile = (s) => {
    window.open(`/registrar/students?view=detail&id=${s.id}`, '_blank')
  }

  if (loading) return (
    <div className="aa-loading"><div className="aa-spinner" /><span>Loading records...</span></div>
  )

  return (
    <div className="aa-root">
      <div className="aa-metrics">
        {[
          { label: 'Alumni', value: allData.alumni.length, color: '#7C3AED', bg: '#F5F3FF', icon: <GraduationCap size={18} /> },
          { label: 'Archived', value: allData.archived.length, color: '#64748B', bg: '#F1F5F9', icon: <Archive size={18} /> },
          { label: 'Withdrawn', value: allData.withdrawn.length, color: '#F59E0B', bg: '#FEF3C7', icon: <Users size={18} /> },
        ].map(m => (
          <div className="aa-metric" key={m.label}>
            <div className="aa-metric-icon" style={{ background: m.bg, color: m.color }}>{m.icon}</div>
            <div className="aa-metric-content">
              <span className="aa-metric-value" style={{ color: m.color }}>{m.value}</span>
              <span className="aa-metric-label">{m.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="aa-tabs">
        {Object.entries(tabMeta).map(([key, meta]) => (
          <button
            key={key}
            className={`aa-tab ${activeTab === key ? 'aa-tab--active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {meta.icon}
            {meta.label} <span className="aa-tab-count">{allData[key].length}</span>
          </button>
        ))}
      </div>

      <div className="aa-toolbar">
        <div className="aa-toolbar-left">
          <div className="aa-search-wrap">
            <Search size={14} className="aa-search-icon" />
            <input className="aa-search-input" placeholder="Search name or admission no..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="aa-search-clear" onClick={() => setSearch('')}><X size={14} /></button>}
          </div>
        </div>
        <div className="aa-toolbar-right">
          <select className="aa-select" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
            <option value="">All Years</option>
            {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
          <button className="aa-btn aa-btn--icon" onClick={fetchAll} title="Refresh"><RefreshCw size={15} /></button>
          <button className="aa-btn aa-btn--icon" onClick={() => {
            const rows = [['Full Name', 'Adm No', 'Class', 'Status', 'Date'].join(',')]
            filtered.forEach(s => rows.push([s.full_name, s.admission_number, s.class, s.status, s.updated_at ? fmtDate(s.updated_at) : ''].join(',')))
            const csv = rows.join('\n')
            const blob = new Blob([csv], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = `${activeTab}_records.csv`; a.click()
            URL.revokeObjectURL(url)
          }} title="Export CSV"><Download size={15} /></button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="aa-empty">
          <Archive size={48} color="#CBD5E1" />
          <p className="aa-empty-title">No records found</p>
          <p className="aa-empty-sub">No {tabMeta[activeTab]?.label?.toLowerCase()} records match your current filters.</p>
          {(search || filterYear) && (
            <button className="aa-btn aa-btn--outline" onClick={() => { setSearch(''); setFilterYear('') }}>Clear Filters</button>
          )}
        </div>
      ) : (
        <>
          <div className="aa-table-wrap">
            <table className="aa-table">
              <thead>
                <tr>
                  <th className="aa-th--student">Student</th>
                  <th className="aa-th--class">Class</th>
                  <th className="aa-th--stream">Stream</th>
                  <th className="aa-th--status">Status</th>
                  <th className="aa-th--date">Date</th>
                  <th className="aa-th--actions"></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(s => {
                  const meta = statusMeta[s.status] || { label: s.status, cls: '' }
                  return (
                    <tr key={s.id} className="aa-row">
                      <td>
                        <div className="aa-student-cell">
                          <div className="aa-avatar" style={{ background: avatarColor(s.full_name) }}>
                            {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="aa-student-info">
                            <span className="aa-student-name">{s.full_name}</span>
                            <span className="aa-student-adm">{s.admission_number}</span>
                          </div>
                        </div>
                      </td>
                      <td className="aa-cell-class">{s.class || '—'}</td>
                      <td className="aa-cell-stream">{s.stream || '—'}</td>
                      <td><span className={`aa-badge ${meta.cls}`}>{meta.label}</span></td>
                      <td className="aa-cell-date">{s.updated_at ? fmtDate(s.updated_at) : '—'}</td>
                      <td>
                        <button className="aa-action-btn" onClick={() => setActionPanel(s)} aria-label="Actions">
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
            <div className="aa-pagination">
              <span className="aa-page-info">Showing {((page - 1) * ROWS_PER_PAGE) + 1}–{Math.min(page * ROWS_PER_PAGE, filtered.length)} of {filtered.length}</span>
              <div className="aa-page-btns">
                <button className="aa-btn aa-btn--xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} className={`aa-btn aa-btn--xs ${page === p ? 'aa-btn--active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="aa-btn aa-btn--xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {actionPanel && (
        <FloatingActionPanel
          student={actionPanel}
          onClose={() => setActionPanel(null)}
          items={getActionItems(actionPanel)}
        />
      )}
    </div>
  )
}
