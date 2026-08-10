import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  GraduationCap, ArrowUp, ArrowDown, Users, CheckCircle, X,
  LogOut, RefreshCw, ChevronDown, ChevronRight, Download,
  SlidersHorizontal, GripHorizontal
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import './PromotionsGraduation.css'

const NEXT_CLASS_MAP = {
  'PP1': 'PP2', 'PP2': 'Grade 1',
  'Grade 1': 'Grade 2', 'Grade 2': 'Grade 3',
  'Grade 3': 'Grade 4', 'Grade 4': 'Grade 5',
  'Grade 5': 'Grade 6', 'Grade 6': 'Grade 7',
  'Grade 7': 'Grade 8', 'Grade 8': 'Grade 9',
  'Grade 9': 'Graduated', 'Grade 10': 'Grade 11',
  'Grade 11': 'Graduated',
}

const PREV_CLASS_MAP = {
  'PP2': 'PP1', 'Grade 1': 'PP2',
  'Grade 2': 'Grade 1', 'Grade 3': 'Grade 2',
  'Grade 4': 'Grade 3', 'Grade 5': 'Grade 4',
  'Grade 6': 'Grade 5', 'Grade 7': 'Grade 6',
  'Grade 8': 'Grade 7', 'Grade 9': 'Grade 8',
  'Grade 10': 'Grade 9', 'Grade 11': 'Grade 10',
}

/* ─── Summary Card ─── */
function SummaryCard({ icon, label, value, color }) {
  return (
    <div className="pg-card" role="status">
      <div className="pg-card-icon" style={{ background: `${color}10`, color }}>
        {icon}
      </div>
      <div className="pg-card-content">
        <span className="pg-card-value">{value}</span>
        <span className="pg-card-label">{label}</span>
      </div>
    </div>
  )
}

/* ─── Class Section Header ─── */
function ClassSectionHeader({ className, count, expanded, onToggle, onPromoteAll, onDemoteAll, canPromote, canDemote, allChecked, onSelectAll }) {
  return (
    <div
      className={`pg-section ${expanded ? 'pg-section--open' : ''}`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${className}, ${count} students`}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
    >
      <div className="pg-section-left">
        <span className={`pg-chevron ${expanded ? 'pg-chevron--open' : ''}`}>
          <ChevronRight size={16} />
        </span>
        <input
          type="checkbox"
          className="pg-checkbox"
          checked={allChecked}
          onChange={e => { e.stopPropagation(); onSelectAll() }}
          onClick={e => e.stopPropagation()}
          aria-label={`Select all ${className} students`}
        />
        <span className="pg-section-name">{className}</span>
        <span className="pg-section-count">{count} student{count === 1 ? '' : 's'}</span>
      </div>
      <div className="pg-section-actions" onClick={e => e.stopPropagation()}>
        {canPromote && (
          <button className="pg-btn pg-btn--promote pg-btn--sm" onClick={onPromoteAll} aria-label={`Promote all ${className}`}>
            <ArrowUp size={14} /> Promote All
          </button>
        )}
        {canDemote && (
          <button className="pg-btn pg-btn--demote pg-btn--sm" onClick={onDemoteAll} aria-label={`Demote all ${className}`}>
            <ArrowDown size={14} /> Demote All
          </button>
        )}
      </div>
    </div>
  )
}

/* ─── Floating Action Panel ─── */
function FloatingActionPanel({ student, nextClass, prevClass, isGraduating, onPromote, onDemote, onGraduate, onClose }) {
  const panelRef = useRef(null)
  const [pos, setPos] = useState(() => ({ x: window.innerWidth - 380, y: Math.max(100, window.innerHeight / 2 - 150) }))
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
      setPos({ x: e.clientX - drag.current.offset.x, y: e.clientY - drag.current.offset.y })
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
      <div
        className="pg-float-panel"
        ref={panelRef}
        style={{ left: pos.x, top: pos.y }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Actions for ${student.full_name}`}
      >
        <div className="pg-float-header" onMouseDown={handleMouseDown}>
          <div className="pg-float-header-info">
            <GripHorizontal size={14} className="pg-float-grip" />
            <div>
              <span className="pg-float-name">{student.full_name}</span>
              <span className="pg-float-class">{student.class}{student.stream ? ` - ${student.stream}` : ''}</span>
            </div>
          </div>
          <button className="pg-float-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="pg-float-body">
          {isGraduating ? (
            <>
              <button className="pg-float-item pg-float-item--graduate" onClick={onGraduate}>
                <LogOut size={15} /> Graduate to Alumni
              </button>
              <div className="pg-float-sep" />
              <button className="pg-float-item" disabled>
                <ArrowUp size={15} /> <span className="pg-float-muted">No next class</span>
              </button>
              <button className="pg-float-item" disabled>
                <ArrowDown size={15} /> <span className="pg-float-muted">Cannot demote</span>
              </button>
            </>
          ) : (
            <>
              {nextClass && (
                <button className="pg-float-item pg-float-item--promote" onClick={onPromote}>
                  <ArrowUp size={15} /> Promote to {nextClass}
                </button>
              )}
              {prevClass && (
                <button className="pg-float-item pg-float-item--demote" onClick={onDemote}>
                  <ArrowDown size={15} /> Demote to {prevClass}
                </button>
              )}
              {!nextClass && !prevClass && (
                <button className="pg-float-item" disabled>No actions available</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ─── Student Row ─── */
function StudentRow({ student, isSelected, onSelect, onActionClick }) {
  const nextClass = NEXT_CLASS_MAP[student.class]
  const prevClass = PREV_CLASS_MAP[student.class]
  const isGraduating = nextClass === 'Graduated'
  const hasActions = nextClass || prevClass

  return (
    <div className="pg-row" role="row">
      <div className="pg-row-checkbox" role="cell">
        <input
          type="checkbox"
          className="pg-checkbox"
          checked={isSelected}
          onChange={() => onSelect(student.id)}
          aria-label={`Select ${student.full_name}`}
        />
      </div>
      <div className="pg-row-adm" role="cell">{student.admission_number}</div>
      <div className="pg-row-name" role="cell">{student.full_name}</div>
      <div className="pg-row-stream" role="cell">{student.stream || '—'}</div>
      <div className="pg-row-actions" role="cell">
          <button
            className="pg-action-btn"
            onClick={() => onActionClick(student)}
            disabled={!hasActions && !isGraduating}
            aria-haspopup="dialog"
            aria-label={`Actions for ${student.full_name}`}
          >
            <SlidersHorizontal size={14} />
            <span className="pg-action-label">Actions</span>
            <ChevronDown size={12} />
          </button>
      </div>
    </div>
  )
}

/* ─── Main Component ─── */
export default function PromotionsGraduation() {
  const { profile } = useAuthStore()
  const { school } = useSchool()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [confirmModal, setConfirmModal] = useState(null)
  const [expandedSections, setExpandedSections] = useState(new Set())
  const [promotedCount, setPromotedCount] = useState(0)
  const [actionPanel, setActionPanel] = useState(null)

  useEffect(() => { if (profile?.school_id) fetchStudents() }, [profile])

  const fetchStudents = async () => {
    setLoading(true); setError('')
    const { data } = await supabase
      .from('students')
      .select('id, full_name, admission_number, class, stream, status')
      .eq('school_id', profile.school_id)
      .eq('status', 'active')
      .order('class').order('full_name')
    setStudents(data || [])
    setLoading(false)
    if (data?.length > 0) setExpandedSections(new Set([...new Set(data.map(s => s.class))]))
  }

  const writeAudit = async (action, entityId, details) => {
    await supabase.from('audit_logs').insert({
      school_id: profile.school_id, action,
      details: { message: details, entity_type: 'student', entity_id: entityId },
      performed_by: profile?.id,
    })
  }

  const classGroups = {}
  students.forEach(s => { if (!classGroups[s.class]) classGroups[s.class] = []; classGroups[s.class].push(s) })

  const toggleSection = (cls) => setExpandedSections(p => { const n = new Set(p); n.has(cls) ? n.delete(cls) : n.add(cls); return n })
  const toggleSelect = (id) => setSelectedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSelectAll = () => { const ids = students.map(s => s.id); setSelectedIds(p => { const all = ids.every(id => p.has(id)); const n = new Set(p); ids.forEach(id => { all ? n.delete(id) : n.add(id) }); return n }) }
  const toggleSelectClass = (cls) => { const ids = classGroups[cls]?.map(s => s.id) || []; setSelectedIds(p => { const all = ids.every(id => p.has(id)); const n = new Set(p); ids.forEach(id => { all ? n.delete(id) : n.add(id) }); return n }) }

  const executePromotion = async (list, label) => {
    setProcessing(true); setError(''); const now = new Date().toISOString(); let c = 0
    try {
      for (const s of list) {
        const nc = NEXT_CLASS_MAP[s.class]; if (!nc) continue
        await supabase.from('students').update({
          class: nc === 'Graduated' ? s.class : nc, status: nc === 'Graduated' ? 'alumni' : 'active',
          exit_reason: nc === 'Graduated' ? 'Completed' : null, exit_date: nc === 'Graduated' ? now.slice(0, 10) : null,
          updated_at: now, updated_by: profile?.id,
        }).eq('id', s.id)
        await writeAudit(nc === 'Graduated' ? 'student_graduated' : 'student_promoted', s.id,
          `${s.full_name} (${s.admission_number}): ${s.class} → ${nc === 'Graduated' ? 'Graduated' : nc}`); c++
      }
      setConfirmModal(null); setPromotedCount(p => p + c)
      setSuccess(`${c} student${c === 1 ? '' : 's'} ${label}`); fetchStudents()
      setTimeout(() => setSuccess(''), 4000)
    } catch (e) { setError('Operation failed: ' + e.message) }
    setProcessing(false)
  }

  const executeDemotion = async (list, label) => {
    setProcessing(true); setError(''); const now = new Date().toISOString(); let c = 0
    try {
      for (const s of list) {
        const pc = PREV_CLASS_MAP[s.class]; if (!pc) continue
        await supabase.from('students').update({ class: pc, updated_at: now, updated_by: profile?.id }).eq('id', s.id)
        await writeAudit('student_demoted', s.id, `${s.full_name} (${s.admission_number}): ${s.class} → ${pc}`); c++
      }
      setConfirmModal(null)
      setSuccess(`${c} student${c === 1 ? '' : 's'} ${label}`); fetchStudents()
      setTimeout(() => setSuccess(''), 4000)
    } catch (e) { setError('Operation failed: ' + e.message) }
    setProcessing(false)
  }

  const handlePromoteAll = (cls) => { const list = students.filter(s => s.class === cls); const nc = NEXT_CLASS_MAP[cls]; setConfirmModal({ title: `Promote all ${list.length} students?`, subtitle: nc === 'Graduated' ? 'They will be marked as alumni.' : `All students move to ${nc}.`, type: 'promote', action: () => executePromotion(list, nc === 'Graduated' ? 'graduated' : `promoted to ${nc}`) }) }
  const handleDemoteAll = (cls) => { const list = students.filter(s => s.class === cls); const pc = PREV_CLASS_MAP[cls]; setConfirmModal({ title: `Demote all ${list.length} students?`, subtitle: `All students move back to ${pc}.`, type: 'demote', action: () => executeDemotion(list, `demoted to ${pc}`) }) }
  const handlePromoteSelected = () => { if (!selectedIds.size) return; const list = students.filter(s => selectedIds.has(s.id)); setConfirmModal({ title: `Promote ${list.length} selected students?`, subtitle: 'Students move to their next class. Graduating students become alumni.', type: 'promote', action: () => { setSelectedIds(new Set()); executePromotion(list, 'promoted') } }) }
  const handleDemoteSelected = () => { if (!selectedIds.size) return; const list = students.filter(s => selectedIds.has(s.id)); setConfirmModal({ title: `Demote ${list.length} selected students?`, subtitle: 'Students move to their previous class.', type: 'demote', action: () => { setSelectedIds(new Set()); executeDemotion(list, 'demoted') } }) }
  const handlePromoteOne = (s) => setConfirmModal({ title: `Promote ${s.full_name}?`, subtitle: `Move from ${s.class} to ${NEXT_CLASS_MAP[s.class]}.`, type: 'promote', action: () => executePromotion([s], `promoted to ${NEXT_CLASS_MAP[s.class]}`) })
  const handleDemoteOne = (s) => setConfirmModal({ title: `Demote ${s.full_name}?`, subtitle: `Move from ${s.class} to ${PREV_CLASS_MAP[s.class]}.`, type: 'demote', action: () => executeDemotion([s], `demoted to ${PREV_CLASS_MAP[s.class]}`) })
  const handleGraduateOne = (s) => setConfirmModal({ title: `Graduate ${s.full_name}?`, subtitle: 'This student will be marked as alumni.', type: 'graduate', action: async () => { setProcessing(true); setError(''); const now = new Date().toISOString(); try { await supabase.from('students').update({ status: 'alumni', exit_reason: 'Completed', exit_date: now.slice(0, 10), updated_at: now, updated_by: profile?.id }).eq('id', s.id); await writeAudit('student_graduated_manual', s.id, `${s.full_name} (${s.admission_number}) manually marked as alumni`); setConfirmModal(null); setSuccess(`${s.full_name} moved to alumni`); fetchStudents(); setTimeout(() => setSuccess(''), 4000) } catch (e) { setError('Failed: ' + e.message) } setProcessing(false) } })

  const handleExport = () => {
    const rows = [['Admission Number', 'Full Name', 'Class', 'Stream']]
    students.forEach(s => rows.push([s.admission_number, s.full_name, s.class, s.stream || '']))
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'students.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const selectedCount = selectedIds.size
  const groupEntries = Object.entries(classGroups).filter(([, list]) => list.length > 0)

  if (loading) return (
    <div className="pg-loading" role="status" aria-label="Loading students">
      <div className="pg-spinner" /><span>Loading students...</span>
    </div>
  )

  return (
    <div className="pg-root">
      {/* Toolbar */}
      <div className="pg-toolbar">
        <div className="pg-toolbar-left">
          <input
            type="checkbox"
            className="pg-checkbox"
            checked={students.length > 0 && students.every(s => selectedIds.has(s.id))}
            onChange={toggleSelectAll}
            aria-label="Select all students"
          />
          {selectedCount > 0 && (
            <span className="pg-toolbar-count">{selectedCount} selected</span>
          )}
        </div>
        <div className="pg-toolbar-right">
          {selectedCount > 0 && (
            <>
              <button className="pg-btn pg-btn--promote pg-btn--sm" onClick={handlePromoteSelected}>
                <ArrowUp size={14} /> Promote
              </button>
              <button className="pg-btn pg-btn--demote pg-btn--sm" onClick={handleDemoteSelected}>
                <ArrowDown size={14} /> Demote
              </button>
              <button className="pg-btn pg-btn--ghost pg-btn--sm" onClick={() => setSelectedIds(new Set())}>
                <X size={14} /> Clear
              </button>
              <div className="pg-toolbar-divider" />
            </>
          )}
          <button className="pg-btn pg-btn--outline pg-btn--sm" onClick={handleExport}>
            <Download size={14} /> Export
          </button>
          <button className="pg-btn pg-btn--icon pg-btn--sm" onClick={fetchStudents} aria-label="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="pg-alert pg-alert--error" role="alert">{error}</div>}
      {success && <div className="pg-alert pg-alert--success" role="status"><CheckCircle size={14} /> {success}</div>}

      {/* Summary */}
      <div className="pg-summary" role="region" aria-label="Statistics">
        <SummaryCard icon={<Users size={20} />} label="Total Students" value={students.length} color="#2563eb" />
        <SummaryCard icon={<CheckCircle size={20} />} label="Selected" value={selectedCount} color="#7c3aed" />
        <SummaryCard icon={<ArrowUp size={20} />} label="Promoted This Year" value={promotedCount} color="#16a34a" />
        <SummaryCard icon={<GraduationCap size={20} />} label="Pending Review" value={students.filter(s => NEXT_CLASS_MAP[s.class] === 'Graduated').length} color="#f59e0b" />
      </div>

      {/* Empty */}
      {students.length === 0 && (
        <div className="pg-empty" role="status">
          <GraduationCap size={48} color="#cbd5e1" />
          <p>No students available for promotion</p>
          <span>Students will appear here once admitted.</span>
        </div>
      )}

      {/* Table */}
      {students.length > 0 && (
        <div className="pg-table-wrap">
          {/* Column header */}
          <div className="pg-col-header">
            <div className="pg-col-header-cell pg-col--checkbox" />
            <div className="pg-col-header-cell pg-col--adm">Admission No.</div>
            <div className="pg-col-header-cell pg-col--name">Student</div>
            <div className="pg-col-header-cell pg-col--stream">Stream</div>
            <div className="pg-col-header-cell pg-col--actions">Actions</div>
          </div>

          {/* Groups */}
          {groupEntries.map(([cls, list]) => {
            const allChecked = list.every(s => selectedIds.has(s.id))
            return (
              <div key={cls} className="pg-group">
                <ClassSectionHeader
                  className={cls} count={list.length} expanded={expandedSections.has(cls)}
                  onToggle={() => toggleSection(cls)}
                  onPromoteAll={() => handlePromoteAll(cls)}
                  onDemoteAll={() => handleDemoteAll(cls)}
                  canPromote={!!NEXT_CLASS_MAP[cls]} canDemote={!!PREV_CLASS_MAP[cls]}
                  allChecked={allChecked} onSelectAll={() => toggleSelectClass(cls)}
                />
                {expandedSections.has(cls) && (
                  <div className="pg-group-body">
                    {list.map(s => (
                      <StudentRow key={s.id} student={s} isSelected={selectedIds.has(s.id)} onSelect={toggleSelect}
                        onActionClick={(student) => setActionPanel(student)} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Sticky Bulk Bar */}
      {selectedCount > 0 && (
        <div className="pg-bulk-bar" role="status" aria-label={`${selectedCount} students selected`}>
          <span className="pg-bulk-count">{selectedCount} student{selectedCount === 1 ? '' : 's'} selected</span>
          <div className="pg-bulk-actions">
            <button className="pg-btn pg-btn--promote pg-btn--sm" onClick={handlePromoteSelected}>
              <ArrowUp size={14} /> Promote Selected
            </button>
            <button className="pg-btn pg-btn--demote pg-btn--sm" onClick={handleDemoteSelected}>
              <ArrowDown size={14} /> Demote Selected
            </button>
            <button className="pg-btn pg-btn--ghost pg-btn--sm" onClick={() => setSelectedIds(new Set())}>
              <X size={14} /> Clear
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {confirmModal && (
        <div className="pg-modal-overlay" onClick={() => setConfirmModal(null)} role="dialog" aria-modal="true">
          <div className="pg-modal" onClick={e => e.stopPropagation()}>
            <div className="pg-modal-head">
              <h3>{confirmModal.title}</h3>
              <button className="pg-modal-close" onClick={() => setConfirmModal(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <p className="pg-modal-body">{confirmModal.subtitle}</p>
            <div className="pg-modal-foot">
              <button className="pg-btn pg-btn--outline pg-btn--sm" onClick={() => setConfirmModal(null)}>Cancel</button>
              <button className={`pg-btn pg-btn--sm ${confirmModal.type === 'demote' ? 'pg-btn--demote' : 'pg-btn--primary'}`} onClick={confirmModal.action} disabled={processing}>
                {processing ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {actionPanel && (
        <FloatingActionPanel
          student={actionPanel}
          nextClass={NEXT_CLASS_MAP[actionPanel.class]}
          prevClass={PREV_CLASS_MAP[actionPanel.class]}
          isGraduating={NEXT_CLASS_MAP[actionPanel.class] === 'Graduated'}
          onPromote={() => { setActionPanel(null); handlePromoteOne(actionPanel) }}
          onDemote={() => { setActionPanel(null); handleDemoteOne(actionPanel) }}
          onGraduate={() => { setActionPanel(null); handleGraduateOne(actionPanel) }}
          onClose={() => setActionPanel(null)}
        />
      )}
    </div>
  )
}
