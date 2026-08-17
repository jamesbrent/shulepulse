import { useState, useEffect, useRef } from 'react'
import {
  ClipboardList, Search, BarChart2, Users,
  BookOpen, Filter,
  CheckCircle, XCircle, Eye, ShieldCheck,
  Upload, File as FileIcon, AlertCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { uploadExamFile, validateExamFile, fetchExamUploadForGroup } from '../../utils/examUpload'
import { bandColor, sortBands, weightedScoreMean } from '../../services/grading'
import './Exams.css'

function Modal({ open, title, children, onClose, onConfirm, confirmLabel, danger }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Exams() {
  const { profile: authProfile } = useAuthStore()
  const [grades, setGrades] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterClass, setFilterClass] = useState('all')
  const [filterSubject, setFilterSubject] = useState('all')
  const [filterTerm, setFilterTerm] = useState('all')
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()))
  const [activeTab, setActiveTab] = useState('records')
  const [pendingExams, setPendingExams] = useState([])
  const [approving, setApproving] = useState(null)
  const [viewExam, setViewExam] = useState(null)
  const [profile, setProfile] = useState(null)

  const [rejectModal, setRejectModal] = useState({ open: false, examId: null })
  const [rejectReason, setRejectReason] = useState('')
  const [confirmApproveModal, setConfirmApproveModal] = useState({ open: false, examId: null })

  const [examUpload, setExamUpload] = useState(null)
  const [daFile, setDaFile] = useState(null)
  const [daFileError, setDaFileError] = useState('')
  const [daUploading, setDaUploading] = useState(false)
  const daFileInputRef = useRef(null)

  useEffect(() => {
    fetchProfile()
  }, [])

  useEffect(() => {
    if (profile?.school_id) {
      fetchData()
      fetchPending()
    }
  }, [profile?.school_id])

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()
    setProfile(data)
  }

  const fetchData = async () => {
    setLoading(true)

    const [classesRes, subjectsRes, gradesRes] = await Promise.all([
      supabase
        .from('classes')
        .select('id, class_name')
        .eq('school_id', profile?.school_id)
        .order('class_name'),
      supabase
        .from('subjects')
        .select('id, name')
        .eq('school_id', profile?.school_id)
        .order('name'),
      supabase
        .from('grades')
        .select('*, students(full_name, admission_number, class, stream)')
        .eq('school_id', profile?.school_id)
        .order('year', { ascending: false })
        .order('term', { ascending: false }),
    ])

    setClasses(classesRes.data || [])
    setSubjects(subjectsRes.data || [])
    setGrades(gradesRes.data || [])
    setLoading(false)
  }

  const fetchPending = async () => {
    if (!profile?.school_id) return
    const { data } = await supabase
      .from('grades')
      .select('*, students(full_name, class, stream, admission_number)')
      .eq('school_id', profile.school_id)
      .eq('status', 'submitted')
      .order('subject')
      .order('created_at', { ascending: false })

    const rows = data || []

    const teacherIds = [...new Set(rows.map(r => r.teacher_id).filter(Boolean))]
    let teacherMap = {}
    if (teacherIds.length) {
      const { data: teacherData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds)
      teacherMap = Object.fromEntries((teacherData || []).map(t => [t.id, t.full_name]))
    }

    const grouped = {}
    rows.forEach(g => {
      const key = `${g.subject}-${g.exam_type || 'End Term'}-${g.class_name}`
      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          subject: g.subject,
          examType: g.exam_type || 'End Term',
          className: g.class_name || '—',
          teacherName: teacherMap[g.teacher_id] || g.teacher_name || null,
          entries: [],
          createdAt: g.created_at,
        }
      }
      grouped[key].entries.push(g)
    })
    setPendingExams(Object.values(grouped))
  }

  const handleApprove = async (examId) => {
    setApproving(examId)
    const exam = pendingExams.find(e => e.id === examId)
    if (!exam) { setApproving(null); return }

    const ids = exam.entries.map(e => e.id)
    const { error } = await supabase
      .from('grades')
      .update({
        status: 'approved',
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: profile?.id,
      })
      .in('id', ids)

    if (!error) {
      setPendingExams(prev => prev.filter(e => e.id !== examId))
      if (viewExam?.id === examId) setViewExam(null)
      fetchData()
    }
    setApproving(null)
  }

  const handleReject = async (examId, reason) => {
    if (!reason) return
    setApproving(examId)
    const exam = pendingExams.find(e => e.id === examId)
    if (!exam) { setApproving(null); return }

    const ids = exam.entries.map(e => e.id)
    const { error } = await supabase
      .from('grades')
      .update({
        status: 'rejected',
        approved: false,
        approved_at: new Date().toISOString(),
        approved_by: profile?.id,
        rejection_reason: reason,
      })
      .in('id', ids)

    if (!error) {
      setPendingExams(prev => prev.filter(e => e.id !== examId))
      if (viewExam?.id === examId) setViewExam(null)
      fetchData()
    }
    setApproving(null)
  }

  const loadExamUpload = async (exam) => {
    if (!profile?.school_id) return
    try {
      const firstEntry = exam.entries?.[0]
      const data = await fetchExamUploadForGroup(profile.school_id, {
        subject: exam.subject,
        examType: exam.examType,
        className: exam.className,
        term: firstEntry?.term || (filterTerm !== 'all' ? filterTerm : undefined),
        year: firstEntry?.year || filterYear || undefined,
      })
      setExamUpload(data)
    } catch (err) {
      console.error('Failed to fetch exam upload:', err)
    }
  }

  const handleDaFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDaFileError('')
    const validation = validateExamFile(file)
    if (!validation.valid) {
      setDaFileError(validation.error)
      setDaFile(null)
      return
    }
    setDaFile(file)
  }

  const handleDaUpload = async () => {
    if (!daFile || !viewExam || !profile?.school_id) return
    setDaUploading(true)
    setDaFileError('')
    try {
      const result = await uploadExamFile(daFile, {
        schoolId: profile.school_id,
        subject: viewExam.subject,
        examType: viewExam.examType,
        className: viewExam.className,
        term: filterTerm !== 'all' ? filterTerm : undefined,
        year: filterYear || undefined,
        uploadedBy: profile?.id,
        uploadedByRole: 'admin',
      })
      setExamUpload(result)
      setDaFile(null)
      if (daFileInputRef.current) daFileInputRef.current.value = ''
    } catch (err) {
      setDaFileError('Upload failed: ' + err.message)
    } finally {
      setDaUploading(false)
    }
  }

  const terms = [...new Set(grades.map(g => g.term).filter(Boolean))].sort()
  const filtered = grades.filter(g => {
    if (filterClass !== 'all' && g.students?.class !== filterClass) return false
    if (filterSubject !== 'all' && g.subject !== filterSubject) return false
    if (filterTerm !== 'all' && g.term !== filterTerm) return false
    return true
  })

  const avgScore = (arr) => {
    if (!arr.length) return 0
    return Math.round(weightedScoreMean(arr))
  }

  const gradeDistribution = (arr) => {
    const dist = {}
    arr.forEach(g => {
      const grade = (g.grade || '').toUpperCase()
      if (grade) dist[grade] = (dist[grade] || 0) + 1
    })
    return dist
  }

  if (loading) return <div className="da-loading-state">Loading exam data...</div>

  const distrib = gradeDistribution(filtered)
  const totalFiltered = filtered.length

  if (viewExam) {
    const exam = viewExam
    const avg = exam.entries.length
      ? Math.round(exam.entries.reduce((s, g) => s + Number(g.total_score || 0), 0) / exam.entries.length)
      : 0

    return (
      <div>
        <Modal
          open={rejectModal.open}
          title="Reject Submission"
          onClose={() => { setRejectModal({ open: false, examId: null }); setRejectReason('') }}
          onConfirm={() => { handleReject(rejectModal.examId, rejectReason); setRejectModal({ open: false, examId: null }); setRejectReason('') }}
          confirmLabel="Reject"
          danger
        >
          <div style={{ padding: '0 16px' }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 10px' }}>Provide a reason for rejection. This will be recorded.</p>
            <textarea
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 80, resize: 'vertical', fontFamily: 'inherit', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
              placeholder="Reason for rejection..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
          </div>
        </Modal>

        <Modal
          open={confirmApproveModal.open}
          title="Confirm Approval"
          onClose={() => setConfirmApproveModal({ open: false, examId: null })}
          onConfirm={() => { handleApprove(confirmApproveModal.examId); setConfirmApproveModal({ open: false, examId: null }) }}
          confirmLabel="Approve & Publish"
        >
          <div style={{ padding: '0 16px' }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              Approve and publish these results? Students and parents will see them immediately.
            </p>
          </div>
        </Modal>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button className="exam-back-link" onClick={() => { setViewExam(null); setExamUpload(null); setDaFile(null); setDaFileError('') }}>
            ← Back to Pending
          </button>
          <span className="exam-back-meta">{exam.subject} · {exam.examType} · {exam.className}</span>
        </div>

        {examUpload && (
          <div className="da-card" style={{ padding: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <FileIcon size={18} color="#2563eb" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{examUpload.file_name}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                Uploaded by {examUpload.uploaded_by_role === 'admin' ? 'Admin (on behalf)' : examUpload.uploaded_by_role === 'hod' ? 'HOD' : 'Teacher'}
                {' · '}
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: examUpload.uploaded_by_role === 'admin' ? '#fef3c7' : '#dbeafe', color: examUpload.uploaded_by_role === 'admin' ? '#92400e' : '#1e40af', textTransform: 'capitalize' }}>
                  {examUpload.uploaded_by_role || 'teacher'} Upload
                </span>
              </p>
            </div>
            {examUpload.file_url && (
              <a href={examUpload.file_url} target="_blank" rel="noopener noreferrer" className="da-btn da-btn-ghost" style={{ textDecoration: 'none' }}>
                View File
              </a>
            )}
          </div>
        )}

        {!examUpload && (
          <div className="da-card" style={{ padding: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <AlertCircle size={16} color="#f59e0b" />
            <span style={{ fontSize: 13, color: '#92400e', fontWeight: 500 }}>No exam paper uploaded for this group.</span>
            <span style={{ fontSize: 13, color: '#64748b' }}>Upload on behalf of teacher:</span>
            <input type="file" accept=".pdf,.doc,.docx" ref={daFileInputRef} onChange={handleDaFileSelect} style={{ display: 'none' }} />
            <button className="da-btn da-btn-secondary" onClick={() => daFileInputRef.current?.click()} disabled={daUploading} style={{ fontSize: 12, padding: '6px 12px' }}>
              <Upload size={13} /> {daUploading ? 'Uploading...' : 'Upload Exam Paper'}
            </button>
            {daFile && (
              <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle size={13} /> {daFile.name}
                <button onClick={() => { setDaFile(null); setDaFileError(''); if (daFileInputRef.current) daFileInputRef.current.value = '' }}
                  style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0, fontSize: 12 }}>✕</button>
              </span>
            )}
            {daFile && (
              <button className="da-btn da-btn-primary" onClick={handleDaUpload} disabled={daUploading} style={{ fontSize: 12, padding: '6px 12px' }}>
                Confirm Upload
              </button>
            )}
            {daFileError && <span style={{ fontSize: 12, color: '#dc2626' }}>{daFileError}</span>}
          </div>
        )}

        <div className="da-card" style={{ padding: 20, marginTop: 8 }}>
          <div className="exam-detail-header">
            <div className="exam-detail-info">
              <h3>{exam.subject} - {exam.examType}</h3>
              <p>{exam.teacherName ? `Teacher: ${exam.teacherName} · ` : ''}{exam.entries.length} students · Avg: {avg}%</p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="da-table-full">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Adm No.</th>
                  <th>Class</th>
                  <th>Marks</th>
                  <th>Grade</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {exam.entries.map((g, i) => (
                  <tr key={g.id}>
                    <td className="da-text-muted">{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{g.students?.full_name || '—'}</td>
                    <td className="da-text-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{g.students?.admission_number || '—'}</td>
                    <td>{g.students?.class || '—'}{g.students?.stream ? ` ${g.students.stream}` : ''}</td>
                    <td style={{ fontWeight: 600 }}>{g.total_score ?? '—'}%</td>
                    <td><span className="da-badge">{g.grade || '—'}</span></td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{g.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="exam-detail-footer">
            <button className="da-btn da-btn-secondary" onClick={() => setRejectModal({ open: true, examId: exam.id })} disabled={approving === exam.id}>
              <XCircle size={14} /> {approving === exam.id ? 'Processing...' : 'Reject'}
            </button>
            <button className="da-btn da-btn-primary" onClick={() => setConfirmApproveModal({ open: true, examId: exam.id })} disabled={approving === exam.id}>
              <CheckCircle size={14} /> {approving === exam.id ? 'Approving...' : 'Approve & Publish'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Modal
        open={rejectModal.open}
        title="Reject Submission"
        onClose={() => { setRejectModal({ open: false, examId: null }); setRejectReason('') }}
        onConfirm={() => { handleReject(rejectModal.examId, rejectReason); setRejectModal({ open: false, examId: null }); setRejectReason('') }}
        confirmLabel="Reject"
        danger
      >
        <div style={{ padding: '0 16px' }}>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 10px' }}>Provide a reason for rejection.</p>
          <textarea
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 80, resize: 'vertical', fontFamily: 'inherit', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
            placeholder="Reason for rejection..."
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={confirmApproveModal.open}
        title="Confirm Approval"
        onClose={() => setConfirmApproveModal({ open: false, examId: null })}
        onConfirm={() => { handleApprove(confirmApproveModal.examId); setConfirmApproveModal({ open: false, examId: null }) }}
        confirmLabel="Approve & Publish"
      >
        <div style={{ padding: '0 16px' }}>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Approve and publish these results?</p>
        </div>
      </Modal>

      {/* Tabs */}
      <div className="exam-tabs">
        <button
          className={`exam-tab ${activeTab === 'records' ? 'exam-tab--active' : ''}`}
          onClick={() => setActiveTab('records')}
        >
          <ClipboardList size={14} /> All Records
        </button>
        <button
          className={`exam-tab ${activeTab === 'pending' ? 'exam-tab--active' : ''}`}
          onClick={() => { setActiveTab('pending'); fetchPending() }}
        >
          <ShieldCheck size={14} /> Pending Approvals
          {pendingExams.length > 0 && (
            <span className="exam-tab-badge">{pendingExams.length}</span>
          )}
        </button>
      </div>

      {activeTab === 'pending' && (
        <div>
          {pendingExams.length === 0 ? (
            <div className="exam-empty">
              <ClipboardList size={40} color="#cbd5e1" />
              <p>No pending approvals</p>
            </div>
          ) : (
            <div className="exam-pending-grid">
              {pendingExams.map(exam => {
                const avg = exam.entries.length
                  ? Math.round(exam.entries.reduce((s, g) => s + Number(g.total_score || 0), 0) / exam.entries.length)
                  : 0
                const passCount = exam.entries.filter(g => Number(g.total_score || 0) >= 50).length
                return (
                  <div key={exam.id} className="exam-pending-card">
                    <div className="exam-pending-top">
                      <div className="exam-pending-subject">
                        <div className="exam-pending-icon">
                          <BookOpen size={18} color="#d97706" />
                        </div>
                        <div>
                          <h4>{exam.subject}</h4>
                          <p>{exam.examType} · {exam.className}</p>
                        </div>
                      </div>
                      <span className="exam-pending-status">Pending</span>
                    </div>
                    <div className="exam-pending-stats">
                      <span><Users size={12} /> {exam.entries.length} students</span>
                      <span><BarChart2 size={12} /> Avg: {avg}%</span>
                      <span><CheckCircle size={12} /> {passCount} passed</span>
                    </div>
                    <p className="exam-pending-meta">
                      {exam.teacherName ? `Teacher: ${exam.teacherName} · ` : ''}{exam.createdAt ? new Date(exam.createdAt).toLocaleDateString() : ''}
                    </p>
                    <div className="exam-pending-actions">
                      <button className="da-btn da-btn-ghost" onClick={() => { setViewExam(exam); loadExamUpload(exam) }}>
                        <Eye size={13} /> Review
                      </button>
                      <button className="da-btn da-btn-primary da-btn-sm" onClick={() => setConfirmApproveModal({ open: true, examId: exam.id })} disabled={approving === exam.id}>
                        <CheckCircle size={13} /> {approving === exam.id ? '...' : 'Approve'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'records' && (
        <>
          <div className="da-summary">
            {[
              { label: 'Total Records', value: filtered.length, icon: <ClipboardList size={20} />, color: 'purple' },
              { label: 'Average Score', value: `${avgScore(filtered)}%`, icon: <BarChart2 size={20} />, color: 'blue' },
              { label: 'Subjects', value: subjects.length, icon: <BookOpen size={20} />, color: 'green' },
              { label: 'Classes', value: classes.length, icon: <Users size={20} />, color: 'amber' },
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

          <div className="da-toolbar" style={{ marginTop: 16 }}>
            <div className="da-toolbar-left">
              <select className="da-filter-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
                <option value="all">All Classes</option>
                {classes.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
              </select>
              <select className="da-filter-select" value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
                <option value="all">All Subjects</option>
                {subjects.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <select className="da-filter-select" value={filterTerm} onChange={e => setFilterTerm(e.target.value)}>
                <option value="all">All Terms</option>
                {terms.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {totalFiltered > 0 && (
            <div className="exam-grade-row">
              {sortBands(Object.keys(distrib)).map(grade => {
                const count = distrib[grade] || 0
                const pct = totalFiltered > 0 ? Math.round((count / totalFiltered) * 100) : 0
                return (
                  <div key={grade} className="exam-grade-card">
                    <div className="exam-grade-letter" style={{ color: bandColor(grade) }}>{grade}</div>
                    <div className="exam-grade-count">{count}</div>
                    <div className="exam-grade-pct">{pct}%</div>
                    <div className="exam-grade-bar">
                      <div className="exam-grade-bar-fill" style={{ width: `${pct}%`, background: bandColor(grade) }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="da-table-wrap" style={{ marginTop: 16 }}>
            <table className="da-table-full">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Adm No.</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Exam</th>
                  <th>Term</th>
                  <th>Year</th>
                  <th>Total</th>
                  <th>Grade</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>
                      No exam records match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map(g => (
                    <tr key={g.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="da-student-avatar-sm" style={{ width: 28, height: 28, fontSize: 10 }}>
                            {g.students?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                          </div>
                          {g.students?.full_name || '—'}
                        </div>
                      </td>
                      <td className="da-text-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{g.students?.admission_number || '—'}</td>
                      <td>{g.students?.class || '—'}</td>
                      <td><span className="da-subject-tag">{g.subject}</span></td>
                      <td>{g.exam_type || 'End Term'}</td>
                      <td>{g.term || '—'}</td>
                      <td>{g.year || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{g.total_score ?? '—'}</td>
                      <td><span className="da-badge">{g.grade || '—'}</span></td>
                      <td>
                        {g.status === 'approved' ? (
                          <span style={{ color: '#16a34a', fontSize: 12, fontWeight: 600 }}>Approved</span>
                        ) : g.status === 'submitted' ? (
                          <span style={{ color: '#2563eb', fontSize: 12, fontWeight: 600 }}>Submitted</span>
                        ) : g.status === 'rejected' ? (
                          <span style={{ color: '#dc2626', fontSize: 12, fontWeight: 600 }}>Rejected</span>
                        ) : (
                          <span style={{ color: '#d97706', fontSize: 12, fontWeight: 600 }}>Draft</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
