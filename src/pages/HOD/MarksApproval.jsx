import { useState, useEffect } from 'react'
import {
  Search, CheckCircle2, XCircle, Eye, Lock, Unlock,
  AlertTriangle, Filter, Clock, Users, BarChart2,
  ShieldCheck, Download, ChevronDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSchool } from '../admin/useSchool'
import { marksCell } from '../../services/grading'
import './MarksApproval.css'

const TABS = [
  { key: 'tracking', label: 'Entry Tracking', icon: Users },
  { key: 'pending', label: 'Pending Approval', icon: Clock },
  { key: 'moderation', label: 'Bulk Moderation', icon: BarChart2 },
  { key: 'audit', label: 'Audit Log', icon: Filter },
]

const STATUS_COLORS = {
  complete: { bg: '#DCFCE7', color: '#16A34A', label: 'Complete' },
  partial: { bg: '#FEF3C7', color: '#D97706', label: 'In Progress' },
  none: { bg: '#FEE2E2', color: '#EF4444', label: 'Not Started' },
  submitted: { bg: '#DBEAFE', color: '#2563EB', label: 'Submitted' },
  approved: { bg: '#DCFCE7', color: '#16A34A', label: 'Approved' },
  rejected: { bg: '#FEE2E2', color: '#EF4444', label: 'Rejected' },
}

function Badge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.none
  return (
    <span className="ma-badge" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function ProgressBar({ value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const color = pct === 100 ? '#16A34A' : pct > 0 ? '#F59E0B' : '#EF4444'
  return (
    <div className="ma-progress">
      <div className="ma-progress-track">
        <div className="ma-progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="ma-progress-label">{pct}%</span>
    </div>
  )
}

function Avatar({ name, size = 36 }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'
  return (
    <div className="ma-avatar" style={{ width: size, height: size, fontSize: size * 0.35 }}>
      {initials}
    </div>
  )
}

function Modal({ open, title, children, onClose, onConfirm, confirmLabel, danger }) {
  if (!open) return null
  return (
    <div className="ma-dialog-overlay" onClick={onClose}>
      <div className="ma-dialog" onClick={e => e.stopPropagation()}>
        <h3 className="ma-dialog-title">{title}</h3>
        {children}
        <div className="ma-dialog-actions">
          <button className="ma-btn-secondary" onClick={onClose}>Cancel</button>
          <button className={danger ? 'ma-btn-danger' : 'ma-btn-primary'} onClick={onConfirm}>
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MarksApproval() {
  const { currentTerm, currentYear } = useSchool()

  const [activeTab, setActiveTab] = useState('tracking')
  const [loading, setLoading] = useState(true)
  const [schoolId, setSchoolId] = useState(null)
  const [teacherEntries, setTeacherEntries] = useState([])
  const [pendingExams, setPendingExams] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [selectedExam, setSelectedExam] = useState(null)
  const [search, setSearch] = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [subjects, setSubjects] = useState([])
  const [classes, setClasses] = useState([])

  const [modExamGroup, setModExamGroup] = useState('')
  const [modGraceMarks, setModGraceMarks] = useState(0)
  const [modThreshold, setModThreshold] = useState(40)
  const [modMultiplier, setModMultiplier] = useState(1)
  const [modPreview, setModPreview] = useState([])
  const [applying, setApplying] = useState(false)

  const [auditFilter, setAuditFilter] = useState('')
  const [auditDateFrom, setAuditDateFrom] = useState('')
  const [auditDateTo, setAuditDateTo] = useState('')

  const [approving, setApproving] = useState(null)

  const [rejectModal, setRejectModal] = useState({ open: false, examId: null })
  const [rejectReason, setRejectReason] = useState('')
  const [confirmApproveModal, setConfirmApproveModal] = useState({ open: false, examId: null })
  const [confirmModerationModal, setConfirmModerationModal] = useState(false)

  const fetchSchoolId = async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()
    return profile?.school_id
  }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const sid = await fetchSchoolId()
      setSchoolId(sid)
      if (!sid) { setLoading(false); return }
      await Promise.all([fetchSubjects(sid), fetchClasses(sid), fetchTeacherEntries(sid), fetchPendingExams(sid), fetchAuditLogs(sid)])
      setLoading(false)
    }
    init()
  }, [currentTerm, currentYear])

  const fetchSubjects = async (sid) => {
    const { data } = await supabase
      .from('subjects')
      .select('*')
      .eq('school_id', sid)
      .order('name')
    setSubjects(data || [])
  }

  const fetchClasses = async (sid) => {
    const { data } = await supabase
      .from('students')
      .select('class')
      .eq('school_id', sid)
      .eq('status', 'active')
    setClasses([...new Set((data || []).map(s => s.class).filter(Boolean))].sort())
  }

  const fetchTeacherEntries = async (sid) => {
    let q = supabase
      .from('grades')
      .select('teacher_id, subject, status, id')
      .eq('school_id', sid)
    if (currentTerm) q = q.eq('term', currentTerm)
    q = q.eq('year', currentYear)
    const { data } = await q

    const teacherIds = [...new Set((data || []).map(g => g.teacher_id).filter(Boolean))]
    let teacherMap = {}
    if (teacherIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds)
      teacherMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]))
    }

    const entries = {}
    ;(data || []).forEach(g => {
      const name = teacherMap[g.teacher_id] || 'Unknown'
      const subject = g.subject || 'Unknown'
      if (!entries[name]) entries[name] = { name, subjects: {} }
      if (!entries[name].subjects[subject]) {
        entries[name].subjects[subject] = { total: 0, submitted: 0 }
      }
      entries[name].subjects[subject].total++
      if (g.status === 'approved' || g.status === 'submitted') {
        entries[name].subjects[subject].submitted++
      }
    })

    setTeacherEntries(Object.values(entries))
  }

  const fetchPendingExams = async (sid) => {
    let query = supabase
      .from('grades')
      .select('*, students(full_name, class, stream, admission_number)')
      .eq('school_id', sid)
    if (currentTerm) query = query.eq('term', currentTerm)
    query = query
      .eq('year', currentYear)
      .eq('status', 'submitted')

    if (filterSubject) query = query.eq('subject', filterSubject)
    if (filterClass) query = query.eq('students.class', filterClass)

    const { data } = await query.order('subject').order('students(class)')

    const rows = data || []
    const teacherIds = [...new Set(rows.map(g => g.teacher_id).filter(Boolean))]
    let teacherMap = {}
    if (teacherIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds)
      teacherMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]))
    }

    const grouped = {}
    rows.forEach(g => {
      const className = g.students?.class || g.class_name || 'Unknown'
      const stream = g.students?.stream || ''
      const key = `${g.subject}-${g.exam_type || 'End Term'}-${className}${stream ? ` ${stream}` : ''}`
      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          subject: g.subject,
          examType: g.exam_type || 'End Term',
          className: `${className}${stream ? ` ${stream}` : ''}`,
          entries: [],
          teacherName: teacherMap[g.teacher_id] || 'Unknown',
          createdAt: g.created_at,
        }
      }
      grouped[key].entries.push(g)
    })

    setPendingExams(Object.values(grouped))
  }

  const fetchAuditLogs = async (sid) => {
    const { data } = await supabase
      .from('grade_audit_logs')
      .select('*, profiles!performed_by(full_name)')
      .eq('school_id', sid)
      .order('performed_at', { ascending: false })
      .limit(100)

    setAuditLogs(data || [])
  }

  useEffect(() => {
    if (schoolId && activeTab === 'pending') fetchPendingExams(schoolId)
  }, [filterSubject, filterClass, activeTab])

  useEffect(() => {
    if (schoolId && activeTab === 'audit') fetchAuditLogs(schoolId)
  }, [activeTab])

  const handleApprove = async (examId) => {
    setApproving(examId)
    const exam = pendingExams.find(e => e.id === examId)
    if (!exam) { setApproving(null); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const ids = exam.entries.map(e => e.id)
    const { error } = await supabase
      .from('grades')
      .update({ status: 'approved', approved: true, approved_at: new Date().toISOString(), approved_by: profile?.id })
      .in('id', ids)

    if (!error) {
      setPendingExams(prev => prev.filter(e => e.id !== examId))
      setSelectedExam(null)
      fetchTeacherEntries(schoolId)
    }
    setApproving(null)
  }

  const handleReject = async (examId, reason) => {
    if (!reason) return

    setApproving(examId)
    const exam = pendingExams.find(e => e.id === examId)
    if (!exam) { setApproving(null); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const ids = exam.entries.map(e => e.id)
    const { error } = await supabase
      .from('grades')
      .update({ status: 'rejected', approved: false, approved_at: new Date().toISOString(), approved_by: profile?.id, rejection_reason: reason })
      .in('id', ids)

    if (!error) {
      setPendingExams(prev => prev.filter(e => e.id !== examId))
      setSelectedExam(null)
      fetchTeacherEntries(schoolId)
    }
    setApproving(null)
  }

  const loadModPreview = async () => {
    if (!modExamGroup || !schoolId) return
    const [subject, ...rest] = modExamGroup.split('::')
    const examType = rest.join('::')

    let query = supabase
      .from('grades')
      .select('id, total_score, students(full_name), cat_score, exam_score')
      .eq('school_id', schoolId)
    if (currentTerm) query = query.eq('term', currentTerm)
    query = query
      .eq('year', currentYear)
      .eq('subject', subject)
      .eq('exam_type', examType)
      .order('students(full_name)')

    const { data } = await query

    const preview = (data || []).map(g => {
      const original = Number(g.total_score || 0)
      let adjusted = original

      if (modGraceMarks > 0 && original < modThreshold) {
        adjusted = Math.min(100, original + Number(modGraceMarks))
      }

      if (modMultiplier !== 1) {
        adjusted = Math.min(100, Math.round(adjusted * Number(modMultiplier)))
      }

      return {
        id: g.id,
        name: g.students?.full_name || '—',
        original,
        adjusted,
        changed: original !== adjusted,
      }
    })

    setModPreview(preview)
  }

  const applyModeration = async () => {
    setApplying(true)
    const updates = modPreview.filter(p => p.changed)

    for (const p of updates) {
      await supabase
        .from('grades')
        .update({ total_score: p.adjusted })
        .eq('id', p.id)
    }

    setModPreview([])
    setModGraceMarks(0)
    setModMultiplier(1)
    setModExamGroup('')
    if (schoolId) fetchTeacherEntries(schoolId)
    setApplying(false)
  }

  const getTeacherStatus = (teacher) => {
    const subjects = Object.values(teacher.subjects)
    const total = subjects.reduce((s, sub) => s + sub.total, 0)
    const submitted = subjects.reduce((s, sub) => s + sub.submitted, 0)
    if (submitted === total && total > 0) return 'complete'
    if (submitted > 0) return 'partial'
    return 'none'
  }

  const getTeacherStats = (teacher) => {
    const subjects = Object.values(teacher.subjects)
    const total = subjects.reduce((s, sub) => s + sub.total, 0)
    const submitted = subjects.reduce((s, sub) => s + sub.submitted, 0)
    return { total, submitted }
  }

  const teacherSearch = teacherEntries.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  const summaryStats = {
    total: teacherEntries.length,
    complete: teacherEntries.filter(t => getTeacherStatus(t) === 'complete').length,
    partial: teacherEntries.filter(t => getTeacherStatus(t) === 'partial').length,
    none: teacherEntries.filter(t => getTeacherStatus(t) === 'none').length,
  }

  const filteredPending = pendingExams.filter(e => {
    if (search && !e.subject.toLowerCase().includes(search.toLowerCase()) && !e.teacherName.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const filteredAudit = auditLogs.filter(log => {
    if (auditFilter && log.action !== auditFilter) return false
    if (auditDateFrom && new Date(log.performed_at) < new Date(auditDateFrom)) return false
    if (auditDateTo && new Date(log.performed_at) > new Date(auditDateTo + 'T23:59:59')) return false
    return true
  })

  const examGroupsForMod = pendingExams.reduce((acc, e) => {
    const key = `${e.subject}::${e.examType}`
    if (!acc.find(a => a.key === key)) {
      acc.push({ key, label: `${e.subject} — ${e.examType}` })
    }
    return acc
  }, [])

  if (loading) return <div className="ma-loading">Loading marks approval...</div>

  return (
    <div className="ma-page">
      {/* Modals */}
      <Modal
        open={rejectModal.open}
        title="Reject Submission"
        onClose={() => { setRejectModal({ open: false, examId: null }); setRejectReason('') }}
        onConfirm={() => { handleReject(rejectModal.examId, rejectReason); setRejectModal({ open: false, examId: null }); setRejectReason('') }}
        confirmLabel="Reject"
        danger
      >
        <p className="ma-dialog-desc">
          Please provide a reason for rejecting this submission. This will be recorded in the audit trail.
        </p>
        <textarea
          className="ma-textarea"
          placeholder="Reason for rejection..."
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
        />
      </Modal>

      <Modal
        open={confirmApproveModal.open}
        title="Confirm Approval"
        onClose={() => setConfirmApproveModal({ open: false, examId: null })}
        onConfirm={() => { handleApprove(confirmApproveModal.examId); setConfirmApproveModal({ open: false, examId: null }) }}
        confirmLabel="Approve & Publish"
      >
        <p className="ma-dialog-desc">
          Are you sure you want to approve and publish these results? This action will make the grades visible to students and parents.
        </p>
      </Modal>

      <Modal
        open={confirmModerationModal}
        title="Confirm Moderation"
        onClose={() => setConfirmModerationModal(false)}
        onConfirm={() => { applyModeration(); setConfirmModerationModal(false) }}
        confirmLabel="Apply Changes"
        danger
      >
        <p className="ma-dialog-desc">
          You are about to modify <strong>{modPreview.filter(p => p.changed).length}</strong> student scores. This action will be recorded in the audit trail.
        </p>
        <div className="ma-dialog-warning">
          Changes cannot be undone automatically. Please review the preview carefully before confirming.
        </div>
      </Modal>

      {/* ── KPI Cards ── */}
      <div className="ma-kpi-row">
        <div className="ma-kpi-card">
          <div className="ma-kpi-content">
            <p className="ma-kpi-value" style={{ color: '#7C3AED' }}>{summaryStats.total}</p>
            <p className="ma-kpi-label">Total Teachers</p>
          </div>
          <div className="ma-kpi-icon" style={{ background: '#F5F3FF', color: '#7C3AED' }}>
            <Users size={18} />
          </div>
        </div>
        <div className="ma-kpi-card">
          <div className="ma-kpi-content">
            <p className="ma-kpi-value" style={{ color: '#16A34A' }}>{summaryStats.complete}</p>
            <p className="ma-kpi-label">Completed</p>
          </div>
          <div className="ma-kpi-icon" style={{ background: '#F0FDF4', color: '#16A34A' }}>
            <CheckCircle2 size={18} />
          </div>
        </div>
        <div className="ma-kpi-card">
          <div className="ma-kpi-content">
            <p className="ma-kpi-value" style={{ color: '#F59E0B' }}>{summaryStats.partial}</p>
            <p className="ma-kpi-label">In Progress</p>
          </div>
          <div className="ma-kpi-icon" style={{ background: '#FFFBEB', color: '#F59E0B' }}>
            <Clock size={18} />
          </div>
        </div>
        <div className="ma-kpi-card">
          <div className="ma-kpi-content">
            <p className="ma-kpi-value" style={{ color: '#EF4444' }}>{summaryStats.none}</p>
            <p className="ma-kpi-label">Not Started</p>
          </div>
          <div className="ma-kpi-icon" style={{ background: '#FEF2F2', color: '#EF4444' }}>
            <AlertTriangle size={18} />
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="ma-tabs">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              className={`ma-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════
          TAB: ENTRY TRACKING
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'tracking' && (
        <div className="ma-section">
          {/* Toolbar */}
          <div className="ma-toolbar">
            <div className="ma-toolbar-left">
              <div className="ma-search-wrap">
                <Search size={14} className="ma-search-icon" />
                <input
                  className="ma-search-input"
                  placeholder="Search teachers..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <select className="ma-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">All Status</option>
                <option value="complete">Completed</option>
                <option value="partial">In Progress</option>
                <option value="none">Not Started</option>
              </select>
            </div>
            <button className="ma-btn-secondary">
              <Download size={14} /> Export Queue
            </button>
          </div>

          {/* Table */}
          {teacherSearch.length === 0 ? (
            <div className="ma-empty">
              <ShieldCheck size={48} color="#CBD5E1" />
              <p className="ma-empty-title">No submissions available</p>
              <p className="ma-empty-desc">Teacher mark submissions will appear here once entries are submitted for approval.</p>
              <button className="ma-btn-primary" onClick={() => setActiveTab('tracking')}>
                <Users size={14} /> Open Entry Tracking
              </button>
            </div>
          ) : (
            <div className="ma-table-wrap">
              <table className="ma-table">
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th>Subjects</th>
                    <th>Total Entries</th>
                    <th>Submitted</th>
                    <th>Pending</th>
                    <th style={{ width: 180 }}>Progress</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherSearch.map(t => {
                    const { total, submitted } = getTeacherStats(t)
                    const pending = total - submitted
                    const status = getTeacherStatus(t)
                    const subjectNames = Object.keys(t.subjects).join(', ')

                    if (filterStatus && status !== filterStatus) return null

                    return (
                      <tr key={t.name}>
                        <td>
                          <div className="ma-teacher-cell">
                            <Avatar name={t.name} />
                            <span className="ma-teacher-name">{t.name}</span>
                          </div>
                        </td>
                        <td className="ma-subjects-cell">{subjectNames}</td>
                        <td>{total}</td>
                        <td style={{ color: '#16A34A', fontWeight: 600 }}>{submitted}</td>
                        <td style={{ color: pending > 0 ? '#EF4444' : '#16A34A', fontWeight: 600 }}>{pending}</td>
                        <td><ProgressBar value={submitted} max={total} /></td>
                        <td><Badge status={status} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: PENDING APPROVAL
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'pending' && (
        <>
          {selectedExam ? (
            <div className="ma-section">
              <div className="ma-toolbar">
                <button className="ma-btn-secondary" onClick={() => setSelectedExam(null)}>
                  ← Back to Exams
                </button>
                <span className="ma-exam-badge">{selectedExam.subject} · {selectedExam.examType}</span>
              </div>
              <div className="ma-card">
                <div className="ma-card-header">
                  <h3 className="ma-card-title">{selectedExam.subject} — {selectedExam.examType} Results</h3>
                  <span className="ma-card-meta">Teacher: {selectedExam.teacherName} · {selectedExam.entries.length} students</span>
                </div>
                <div className="ma-table-wrap">
                  <table className="ma-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Adm No.</th>
                        <th>Class</th>
                        <th>Stream</th>
                        <th>Marks</th>
                        <th>Total</th>
                        <th>Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedExam.entries.map((g) => (
                        <tr key={g.id}>
                          <td>
                            <div className="ma-teacher-cell">
                              <Avatar name={g.students?.full_name} size={28} />
                              <span className="ma-teacher-name">{g.students?.full_name || '—'}</span>
                            </div>
                          </td>
                          <td className="ma-mono">{g.students?.admission_number || '—'}</td>
                          <td>{g.students?.class || '—'}</td>
                          <td>{g.students?.stream || '—'}</td>
                          <td>{marksCell(g)}</td>
                          <td style={{ fontWeight: 600 }}>{g.total_score ?? '—'}%</td>
                          <td><span className="ma-grade-chip">{g.grade || '—'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ma-card-actions">
                  <button className="ma-btn-secondary" onClick={() => setRejectModal({ open: true, examId: selectedExam.id })} disabled={approving === selectedExam.id}>
                    <XCircle size={14} /> {approving === selectedExam.id ? 'Processing...' : 'Reject'}
                  </button>
                  <button className="ma-btn-primary" onClick={() => setConfirmApproveModal({ open: true, examId: selectedExam.id })} disabled={approving === selectedExam.id}>
                    <CheckCircle2 size={14} /> {approving === selectedExam.id ? 'Approving...' : 'Approve & Publish'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="ma-section">
              {/* Toolbar */}
              <div className="ma-toolbar">
                <div className="ma-toolbar-left">
                  <div className="ma-search-wrap">
                    <Search size={14} className="ma-search-icon" />
                    <input
                      className="ma-search-input"
                      placeholder="Search by subject or teacher..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <select className="ma-filter-select" value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
                    <option value="">All Subjects</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                  <select className="ma-filter-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
                    <option value="">All Classes</option>
                    {classes.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <span className="ma-count-badge">{filteredPending.length} pending</span>
              </div>

              {filteredPending.length === 0 ? (
                <div className="ma-empty">
                  <CheckCircle2 size={48} color="#CBD5E1" />
                  <p className="ma-empty-title">No pending examinations</p>
                  <p className="ma-empty-desc">All submitted exams have been reviewed. New submissions will appear here.</p>
                </div>
              ) : (
                <div className="ma-exam-grid">
                  {filteredPending.map((exam) => {
                    const avgScore = exam.entries.length
                      ? Math.round(exam.entries.reduce((s, g) => s + Number(g.total_score || 0), 0) / exam.entries.length)
                      : 0
                    const passCount = exam.entries.filter(g => Number(g.total_score || 0) >= 50).length

                    return (
                      <div key={exam.id} className="ma-exam-card">
                        <div className="ma-exam-head">
                          <div className="ma-exam-icon">
                            <BarChart2 size={18} />
                          </div>
                          <span className="ma-badge-pending">Pending</span>
                        </div>
                        <h4 className="ma-exam-title">{exam.subject}</h4>
                        <p className="ma-exam-type">{exam.examType} Examination</p>
                        <div className="ma-exam-meta">
                          <span><Users size={12} /> {exam.entries.length} students</span>
                          <span><Clock size={12} /> {exam.createdAt ? new Date(exam.createdAt).toLocaleDateString() : '—'}</span>
                        </div>
                        <div className="ma-exam-stats">
                          <div className="ma-exam-stat">
                            <span className="ma-exam-stat-val">{avgScore}%</span>
                            <span className="ma-exam-stat-lbl">Average</span>
                          </div>
                          <div className="ma-exam-stat">
                            <span className="ma-exam-stat-val">{passCount}</span>
                            <span className="ma-exam-stat-lbl">Passed</span>
                          </div>
                          <div className="ma-exam-stat">
                            <span className="ma-exam-stat-val">{exam.teacherName.split(' ')[0]}</span>
                            <span className="ma-exam-stat-lbl">Teacher</span>
                          </div>
                        </div>
                        <div className="ma-exam-actions">
                          <button className="ma-btn-ghost" onClick={() => setSelectedExam(exam)}>
                            <Eye size={13} /> Review
                          </button>
                          <button className="ma-btn-primary ma-btn-sm" onClick={() => setConfirmApproveModal({ open: true, examId: exam.id })} disabled={approving === exam.id}>
                            <CheckCircle2 size={13} /> {approving === exam.id ? '...' : 'Approve'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: BULK MODERATION
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'moderation' && (
        <div className="ma-section">
          <div className="ma-card">
            <div className="ma-card-header">
              <h3 className="ma-card-title">Grade Moderation Tools</h3>
              <span className="ma-card-meta">
                <Lock size={12} /> Changes are logged in the audit trail
              </span>
            </div>
            <div className="ma-form-grid">
              <div className="ma-form-field">
                <label className="ma-form-label">Exam Group</label>
                <select className="ma-form-select" value={modExamGroup} onChange={e => setModExamGroup(e.target.value)}>
                  <option value="">Select exam group...</option>
                  {examGroupsForMod.map(g => (
                    <option key={g.key} value={g.key}>{g.label}</option>
                  ))}
                </select>
              </div>
              <div className="ma-form-field">
                <label className="ma-form-label">Score Multiplier</label>
                <input type="number" className="ma-form-input" value={modMultiplier} onChange={e => setModMultiplier(Number(e.target.value))} step="0.05" min="0.5" max="1.5" />
              </div>
              <div className="ma-form-field">
                <label className="ma-form-label">Grace Marks</label>
                <input type="number" className="ma-form-input" value={modGraceMarks} onChange={e => setModGraceMarks(Number(e.target.value))} min="0" max="30" />
              </div>
              <div className="ma-form-field">
                <label className="ma-form-label">Threshold</label>
                <input type="number" className="ma-form-input" value={modThreshold} onChange={e => setModThreshold(Number(e.target.value))} min="0" max="100" />
              </div>
            </div>
            <div className="ma-card-actions">
              <button className="ma-btn-secondary" onClick={loadModPreview} disabled={!modExamGroup}>
                <Eye size={14} /> Preview Changes
              </button>
            </div>
          </div>

          {modPreview.length > 0 && (
            <div className="ma-card">
              <div className="ma-card-header">
                <h3 className="ma-card-title">Before / After Preview</h3>
                <span className="ma-card-meta">
                  {modPreview.filter(p => p.changed).length} of {modPreview.length} scores will change
                </span>
              </div>
              <div className="ma-table-wrap">
                <table className="ma-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Original Score</th>
                      <th>Adjusted Score</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modPreview.map(p => (
                      <tr key={p.id} className={p.changed ? 'ma-row-highlight' : ''}>
                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                        <td>{p.original}%</td>
                        <td style={{ fontWeight: 600, color: p.changed ? '#16A34A' : '#374151' }}>{p.adjusted}%</td>
                        <td>
                          {p.changed ? (
                            <span className="ma-change-positive">+{p.adjusted - p.original}</span>
                          ) : (
                            <span className="ma-change-none">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ma-card-actions">
                <button className="ma-btn-secondary" onClick={() => setModPreview([])}>Cancel</button>
                <button className="ma-btn-primary" onClick={() => setConfirmModerationModal(true)} disabled={applying}>
                  {applying ? 'Applying...' : 'Apply Moderation'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: AUDIT LOG
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'audit' && (
        <div className="ma-section">
          <div className="ma-card">
            <div className="ma-card-header">
              <h3 className="ma-card-title">Grade Audit Trail</h3>
              <div className="ma-toolbar-left">
                <select className="ma-filter-select" value={auditFilter} onChange={e => setAuditFilter(e.target.value)}>
                  <option value="">All Actions</option>
                  <option value="created">Created</option>
                  <option value="updated">Updated</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="moderated">Moderated</option>
                </select>
                <input type="date" className="ma-form-input" style={{ width: 140 }} value={auditDateFrom} onChange={e => setAuditDateFrom(e.target.value)} />
                <span style={{ color: '#94A3B8', fontSize: 12 }}>to</span>
                <input type="date" className="ma-form-input" style={{ width: 140 }} value={auditDateTo} onChange={e => setAuditDateTo(e.target.value)} />
              </div>
            </div>

            {filteredAudit.length === 0 ? (
              <div className="ma-empty">
                <Filter size={48} color="#CBD5E1" />
                <p className="ma-empty-title">No audit records found</p>
                <p className="ma-empty-desc">Audit trail entries will appear here as grades are created, updated, approved, or rejected.</p>
              </div>
            ) : (
              <div className="ma-audit-list">
                {filteredAudit.map((log, i) => {
                  const actionColors = {
                    created: '#16A34A',
                    updated: '#F59E0B',
                    approved: '#2563EB',
                    rejected: '#EF4444',
                    moderated: '#7C3AED',
                  }
                  const color = actionColors[log.action] || '#64748B'

                  return (
                    <div key={log.id || i} className="ma-audit-item">
                      <div className="ma-audit-dot" style={{ background: color }} />
                      <div className="ma-audit-content">
                        <div className="ma-audit-header">
                          <span className="ma-badge" style={{ background: color + '18', color, textTransform: 'capitalize' }}>
                            {log.action}
                          </span>
                          <span className="ma-audit-user">{log.profiles?.full_name || 'System'}</span>
                          <span className="ma-audit-time">
                            {log.performed_at ? new Date(log.performed_at).toLocaleString() : '—'}
                          </span>
                        </div>
                        {log.details && (
                          <p className="ma-audit-detail">{log.details}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
