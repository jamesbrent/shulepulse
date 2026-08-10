import { useState, useEffect, useRef } from 'react'
import { ClipboardList, Search, CheckCircle, XCircle, Eye, Clock, BookOpen, Users, Upload, File, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSchool } from '../admin/useSchool'
import { uploadExamFile, validateExamFile, fetchExamUploadForGroup } from '../../utils/examUpload'

function Modal({ open, title, children, onClose, onConfirm, confirmLabel, danger }) {
  if (!open) return null
  return (
    <div className="hod-dialog-overlay" onClick={onClose}>
      <div className="hod-dialog" onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#0f172a' }}>{title}</h3>
        {children}
        <div className="hod-dialog-actions" style={{ marginTop: 16 }}>
          <button className="hod-btn-secondary" onClick={onClose}>Cancel</button>
          <button className={danger ? 'hod-btn-danger' : 'hod-btn-primary'} onClick={onConfirm}>
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DeptExams() {
  const { currentTerm, currentYear } = useSchool()
  const [exams, setExams] = useState([])
  const [subjects, setSubjects] = useState([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(null)
  const [viewExam, setViewExam] = useState(null)
  const [schoolId, setSchoolId] = useState(null)

  const [rejectModal, setRejectModal] = useState({ open: false, examId: null })
  const [rejectReason, setRejectReason] = useState('')
  const [confirmApproveModal, setConfirmApproveModal] = useState({ open: false, examId: null })

  const [examUpload, setExamUpload] = useState(null)
  const [hodFile, setHodFile] = useState(null)
  const [hodFileError, setHodFileError] = useState('')
  const [hodUploading, setHodUploading] = useState(false)
  const hodFileInputRef = useRef(null)

  useEffect(() => {
    fetchExams()
    fetchSubjects()
  }, [currentTerm, currentYear, selectedSubject])

  const fetchSubjects = async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    if (!profile?.school_id) return
    setSchoolId(profile.school_id)

    const { data } = await supabase
      .from('subjects')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('name')

    setSubjects(data || [])
  }

  const fetchExams = async () => {
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const sid = profile?.school_id
    setSchoolId(sid)
    if (!sid) { setLoading(false); return }

    let query = supabase
      .from('grades')
      .select('*, students(full_name, class, stream, admission_number)')
      .eq('school_id', sid)
      .eq('term', currentTerm)
      .eq('year', currentYear)
      .eq('status', 'submitted')

    if (selectedSubject) query = query.eq('subject', selectedSubject)

    const { data } = await query.order('subject').order('students(class)')

    const grouped = {}
    ;(data || []).forEach(g => {
      const key = `${g.subject}-${g.exam_type || 'Endterm'}-${g.teacher_id || 'unknown'}-${g.students?.class || 'all'}`
      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          subject: g.subject,
          examType: g.exam_type || 'Endterm',
          entries: [],
          teacherName: g.teacher_name || 'Unknown',
          teacherId: g.teacher_id,
          createdAt: g.created_at,
          className: g.students?.class || null,
        }
      }
      grouped[key].entries.push(g)
    })

    setExams(Object.values(grouped))
    setLoading(false)
  }

  const handleApprove = async (examId) => {
    setApproving(examId)
    const exam = exams.find(e => e.id === examId)
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
      setExams(prev => prev.filter(e => e.id !== examId))
      if (viewExam?.id === examId) setViewExam(null)
    }
    setApproving(null)
  }

  const handleReject = async (examId, reason) => {
    if (!reason) return
    setApproving(examId)
    const exam = exams.find(e => e.id === examId)
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
      setExams(prev => prev.filter(e => e.id !== examId))
      if (viewExam?.id === examId) setViewExam(null)
    }
    setApproving(null)
  }

  const loadExamUpload = async (exam) => {
    if (!schoolId) return
    try {
      const data = await fetchExamUploadForGroup(schoolId, {
        subject: exam.subject,
        examType: exam.examType,
        className: exam.className,
        term: currentTerm,
        year: currentYear,
        uploadedBy: exam.teacherId,
      })
      setExamUpload(data)
    } catch (err) {
      console.error('Failed to fetch exam upload:', err)
    }
  }

  const handleHodFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setHodFileError('')
    const validation = validateExamFile(file)
    if (!validation.valid) {
      setHodFileError(validation.error)
      setHodFile(null)
      return
    }
    setHodFile(file)
  }

  const handleHodUpload = async () => {
    if (!hodFile || !viewExam || !schoolId) return
    setHodUploading(true)
    setHodFileError('')
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', (await supabase.auth.getUser()).data.user.id)
        .single()

      const result = await uploadExamFile(hodFile, {
        schoolId,
        subject: viewExam.subject,
        examType: viewExam.examType,
        className: viewExam.className,
        term: currentTerm,
        year: currentYear,
        uploadedBy: profile?.id,
        uploadedByRole: 'hod',
      })
      setExamUpload(result)
      setHodFile(null)
      if (hodFileInputRef.current) hodFileInputRef.current.value = ''
    } catch (err) {
      setHodFileError('Upload failed: ' + err.message)
    } finally {
      setHodUploading(false)
    }
  }

  const filtered = selectedSubject
    ? exams.filter(e => e.subject === selectedSubject)
    : exams

  if (loading) return <div className="loading-state">Loading examinations...</div>

  if (viewExam) {
    const exam = viewExam
    return (
      <div className="hod-sub-page">
        <Modal
          open={rejectModal.open}
          title="Reject Submission"
          onClose={() => { setRejectModal({ open: false, examId: null }); setRejectReason('') }}
          onConfirm={() => { handleReject(rejectModal.examId, rejectReason); setRejectModal({ open: false, examId: null }); setRejectReason('') }}
          confirmLabel="Reject"
          danger
        >
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 10px' }}>Provide a reason for rejection. This will be recorded in the audit trail.</p>
          <textarea
            className="hod-sp-search-input"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
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
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
            Are you sure you want to approve and publish these results? This will make them visible to students and parents.
          </p>
        </Modal>

        <div className="hod-sp-header">
          <button className="hod-btn-secondary" onClick={() => { setViewExam(null); setExamUpload(null); setHodFile(null); setHodFileError('') }}>
            ← Back to Exams
          </button>
          <span className="hod-sp-term-badge">{exam.subject} · {exam.examType}</span>
        </div>

        {examUpload && (
          <div className="hod-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <File size={18} color="#2563eb" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{examUpload.file_name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                  Uploaded by {examUpload.uploaded_by_role === 'hod' ? 'HOD (on behalf of teacher)' : examUpload.profiles?.full_name || 'Teacher'}
                  {' · '}
                  <span className="hod-badge" style={{
                    background: examUpload.uploaded_by_role === 'hod' ? '#f3e8ff' : '#dbeafe',
                    color: examUpload.uploaded_by_role === 'hod' ? '#7c3aed' : '#2563eb',
                    textTransform: 'capitalize', fontSize: 11,
                  }}>
                    {examUpload.uploaded_by_role === 'hod' ? 'HOD Upload' : 'Teacher Upload'}
                  </span>
                </p>
              </div>
              {examUpload.file_url && (
                <a href={examUpload.file_url} target="_blank" rel="noopener noreferrer" className="hod-btn-ghost" style={{ textDecoration: 'none' }}>
                  View File
                </a>
              )}
            </div>
          </div>
        )}

        {!examUpload && (
          <div className="hod-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <AlertCircle size={16} color="#f59e0b" />
              <span style={{ fontSize: 13, color: '#92400e', fontWeight: 500 }}>No exam paper uploaded for this group.</span>
              <span style={{ fontSize: 13, color: '#64748b' }}>You can upload on behalf of the teacher:</span>
              <input type="file" accept=".pdf,.doc,.docx" ref={hodFileInputRef} onChange={handleHodFileSelect} style={{ display: 'none' }} />
              <button className="hod-btn-secondary" onClick={() => hodFileInputRef.current?.click()} disabled={hodUploading} style={{ fontSize: 12, padding: '6px 12px' }}>
                <Upload size={13} /> {hodUploading ? 'Uploading...' : 'Upload Exam Paper'}
              </button>
              {hodFile && (
                <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={13} /> {hodFile.name}
                  <button onClick={() => { setHodFile(null); setHodFileError(''); if (hodFileInputRef.current) hodFileInputRef.current.value = '' }}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0, fontSize: 12 }}>✕</button>
                </span>
              )}
              {hodFile && (
                <button className="hod-btn-primary" onClick={handleHodUpload} disabled={hodUploading} style={{ fontSize: 12, padding: '6px 12px' }}>
                  Confirm Upload
                </button>
              )}
              {hodFileError && <span style={{ fontSize: 12, color: '#dc2626' }}>{hodFileError}</span>}
            </div>
          </div>
        )}

        <div className="hod-card">
          <div className="hod-card-header">
            <h3>{exam.subject} - {exam.examType} Results</h3>
            <span style={{ fontSize: 13, color: '#64748b' }}>Teacher: {exam.teacherName} · {exam.entries.length} students</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="hod-table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Adm No.</th>
                  <th>Class</th>
                  <th>Stream</th>
                  <th>CAT Score</th>
                  <th>Exam Score</th>
                  <th>Total</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                {exam.entries.map((g) => (
                  <tr key={g.id}>
                    <td style={{ fontWeight: 500 }}>{g.students?.full_name || '—'}</td>
                    <td className="hod-monospace">{g.students?.admission_number || '—'}</td>
                    <td>{g.students?.class || '—'}</td>
                    <td>{g.students?.stream || '—'}</td>
                    <td>{g.sba_score ?? g.cat_score ?? '—'}</td>
                    <td>{g.summative_score ?? g.exam_score ?? '—'}</td>
                    <td style={{ fontWeight: 600 }}>{g.total_score ?? '—'}%</td>
                    <td><span className="hod-sp-grade-chip">{g.grade || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="hod-btn-secondary" onClick={() => setRejectModal({ open: true, examId: exam.id })} disabled={approving === exam.id}>
              <XCircle size={15} /> {approving === exam.id ? 'Processing...' : 'Reject'}
            </button>
            <button className="hod-btn-primary" onClick={() => setConfirmApproveModal({ open: true, examId: exam.id })} disabled={approving === exam.id}>
              <CheckCircle size={15} /> {approving === exam.id ? 'Approving...' : 'Approve & Publish'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="hod-sub-page">
      <Modal
        open={rejectModal.open}
        title="Reject Submission"
        onClose={() => { setRejectModal({ open: false, examId: null }); setRejectReason('') }}
        onConfirm={() => { handleReject(rejectModal.examId, rejectReason); setRejectModal({ open: false, examId: null }); setRejectReason('') }}
        confirmLabel="Reject"
        danger
      >
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 10px' }}>Provide a reason for rejection.</p>
        <textarea
          className="hod-sp-search-input"
          style={{ width: '100%', boxSizing: 'border-box', minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
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
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Approve and publish these results?</p>
      </Modal>

      <div className="hod-sp-header">
        <div className="hod-sp-filters">
          <div className="hod-sp-search-wrap">
            <Search size={14} className="hod-sp-search-icon" />
            <select
              className="hod-sp-select"
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
            >
              <option value="">All Subjects</option>
              {subjects.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          <span className="hod-sp-term-badge">{currentTerm} {currentYear}</span>
        </div>
        <span style={{ fontSize: 13, color: '#64748b' }}>{filtered.length} exam{filtered.length !== 1 ? 's' : ''} pending</span>
      </div>

      {filtered.length === 0 ? (
        <div className="hod-card">
          <div className="empty-state">
            <ClipboardList size={40} color="#cbd5e1" />
            <p>No pending examinations for approval</p>
          </div>
        </div>
      ) : (
        <div className="hod-exam-grid">
          {filtered.map((exam) => {
            const avgScore = exam.entries.length
              ? Math.round(exam.entries.reduce((s, g) => s + Number(g.total_score || 0), 0) / exam.entries.length)
              : 0
            const passCount = exam.entries.filter(g => Number(g.total_score || 0) >= 50).length

            return (
              <div key={exam.id} className="hod-exam-card">
                <div className="hod-exam-card-head">
                  <div className="hod-exam-icon">
                    <BookOpen size={20} />
                  </div>
                  <span className="hod-badge hod-badge-low">Pending</span>
                </div>
                <h4 className="hod-exam-title">{exam.subject}</h4>
                <p className="hod-exam-type">{exam.examType} Examination</p>
                <div className="hod-exam-meta">
                  <span><Users size={13} /> {exam.entries.length} students</span>
                  <span><Clock size={13} /> {exam.createdAt ? new Date(exam.createdAt).toLocaleDateString() : '—'}</span>
                </div>
                <div className="hod-exam-stats">
                  <div className="hod-exam-stat">
                    <span className="hod-exam-stat-value">{avgScore}%</span>
                    <span className="hod-exam-stat-label">Average</span>
                  </div>
                  <div className="hod-exam-stat">
                    <span className="hod-exam-stat-value">{passCount}</span>
                    <span className="hod-exam-stat-label">Passed</span>
                  </div>
                  <div className="hod-exam-stat">
                    <span className="hod-exam-stat-value">{exam.teacherName.split(' ')[0]}</span>
                    <span className="hod-exam-stat-label">Teacher</span>
                  </div>
                </div>
                <div className="hod-exam-actions">
                  <button className="hod-btn-ghost" onClick={() => { setViewExam(exam); loadExamUpload(exam) }}>
                    <Eye size={14} /> Review
                  </button>
                  <button className="hod-btn-primary small" onClick={() => setConfirmApproveModal({ open: true, examId: exam.id })} disabled={approving === exam.id}>
                    <CheckCircle size={14} /> {approving === exam.id ? '...' : 'Approve'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
