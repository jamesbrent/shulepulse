import { useState, useEffect, useRef, useCallback } from 'react'
import { Settings, FileText, Clock, BarChart3, Info, CheckCircle, AlertCircle, Filter, Upload, X, File, ChevronRight, ArrowLeft, Download, Eye, Plus, Trash2, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSchool } from '../admin/useSchool'
import { useGradingConfig, useExamTypeConfig } from '../../hooks/useSchoolConfig'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const BUCKET = 'exam-papers'

function GradeCard({ g, onEdit, onDelete }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
      background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9',
      position: 'relative',
    }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: g.color, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{g.grade}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{g.label || `${g.min_score}–${g.max_score}`}</div>
        {g.points > 0 && <div style={{ fontSize: 11, color: '#7c3aed' }}>{g.points} pts</div>}
      </div>
      {(onEdit || onDelete) && (
        <div style={{ display: 'flex', gap: 4 }}>
          {onEdit && <button onClick={() => onEdit(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#7c3aed' }}><Settings size={13} /></button>}
          {onDelete && <button onClick={() => onDelete(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#dc2626' }}><Trash2 size={13} /></button>}
        </div>
      )}
    </div>
  )
}

export default function ExamSetup() {
  const { currentTerm, currentYear } = useSchool()
  const { systems: gradingSystems, loading: gradingLoading, defaultSystem, getBands, refresh: refreshGrading } = useGradingConfig()
  const { examTypes, loading: examTypesLoading, examMap, getMax, refresh: refreshExamTypes } = useExamTypeConfig()
  const [activeTab, setActiveTab] = useState('grading')
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState([])
  const [classes, setClasses] = useState([])
  const [timetableSlots, setTimetableSlots] = useState([])
  const [filterSubject, setFilterSubject] = useState('')
  const [questionPapers, setQuestionPapers] = useState([])
  const [uploading, setUploading] = useState(false)

  // Drill-down state for Papers tab
  const [drillLevel, setDrillLevel] = useState(1)
  const [selectedSubject, setSelectedSubject] = useState(null)
  const [selectedClass, setSelectedClass] = useState(null)
  const [uploadingExamType, setUploadingExamType] = useState(null)
  const [previewPaper, setPreviewPaper] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const fileInputRef = useRef(null)

  // Grading editor state
  const [editingSystem, setEditingSystem] = useState(null) // system object being edited
  const [editingBand, setEditingBand] = useState(null) // band being edited (null = new)
  const [bandForm, setBandForm] = useState({ grade: '', label: '', min_score: 0, max_score: 100, points: 0, color: '#64748b' })
  const [savingBand, setSavingBand] = useState(false)

  // Exam type editor state
  const [editingExamType, setEditingExamType] = useState(null) // exam type being edited (null = new)
  const [examTypeForm, setExamTypeForm] = useState({ name: '', label: '', max_marks: 100, weightage: 0, description: '' })
  const [savingExamType, setSavingExamType] = useState(false)

  // New system state
  const [newSystemName, setNewSystemName] = useState('')
  const [newSystemSlug, setNewSystemSlug] = useState('')
  const [savingSystem, setSavingSystem] = useState(false)

  const tabs = [
    { key: 'grading', label: 'Grading Configuration', icon: <BarChart3 size={16} /> },
    { key: 'weightage', label: 'Exam Types & Weightage', icon: <Settings size={16} /> },
    { key: 'papers', label: 'Question Papers', icon: <FileText size={16} /> },
    { key: 'timetable', label: 'Exam Timetable', icon: <Clock size={16} /> },
  ]

  const isLoading = loading || gradingLoading || examTypesLoading

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const schoolId = profile?.school_id
    if (!schoolId) { setLoading(false); return }

    const [subjectsRes, timetableRes, papersRes, classesRes] = await Promise.all([
      supabase.from('subjects').select('*').eq('school_id', schoolId).order('name'),
      supabase.from('timetable_slots')
        .select('*, subjects(name), classes(class_name)')
        .eq('school_id', schoolId)
        .order('day')
        .order('start_time'),
      supabase.from('question_papers')
        .select('*, subjects(name)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false }),
      supabase.from('classes')
        .select('id, class_name')
        .eq('school_id', schoolId)
        .order('class_name'),
    ])

    setSubjects(subjectsRes.data || [])
    setTimetableSlots(timetableRes.data || [])
    setQuestionPapers(papersRes.data || [])
    setClasses(classesRes.data || [])
    setLoading(false)
  }

  const filteredSlots = filterSubject
    ? timetableSlots.filter(s => s.subjects?.name === filterSubject)
    : timetableSlots

  const groupedByDay = DAYS.reduce((acc, day) => {
    acc[day] = filteredSlots.filter(s => s.day === day)
    return acc
  }, {})

  const uniqueSubjectsInTimetable = [...new Set(timetableSlots.map(s => s.subjects?.name).filter(Boolean))]

  const getPaper = (subjectId, classId, examType) => {
    return questionPapers.find(p => {
      if (p.subject_id !== subjectId) return false
      if (p.exam_type !== examType) return false
      if (p.class_id) return p.class_id === classId
      const clsObj = classes.find(c => c.id === classId)
      return (p.class_name || null) === (clsObj?.class_name || null)
    }) || null
  }

  const getSubjectPaperCount = (subjectId) => {
    let uploaded = 0
    classes.forEach(cls => {
      examTypes.forEach(ex => {
        if (getPaper(subjectId, cls.id, ex.name)) uploaded++
      })
    })
    return { uploaded, total: classes.length * examTypes.length }
  }

  const getClassPaperCount = (subjectId, classId) => {
    let uploaded = 0
    examTypes.forEach(ex => {
      if (getPaper(subjectId, classId, ex.name)) uploaded++
    })
    return { uploaded, total: examTypes.length }
  }

  const handleFileClick = (subject, cls, examType) => {
    setUploadingExamType({ subject, cls, examType })
    setTimeout(() => fileInputRef.current?.click(), 50)
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !uploadingExamType) return

    const { subject, cls, examType } = uploadingExamType
    setUploading(true)
    try {
      const userId = (await supabase.auth.getUser()).data.user.id
      const { data: profile } = await supabase
        .from('profiles')
        .select('school_id, role')
        .eq('id', userId)
        .single()

      const schoolId = profile?.school_id
      const userRole = profile?.role
      if (!schoolId) return

      const isHod = userRole === 'hod'
      const uploadStatus = isHod ? 'approved' : 'pending'

      const safeSubject = (subject.id).replace(/[^a-zA-Z0-9]/g, '_')
      const safeClass = (cls?.id || 'all').replace(/[^a-zA-Z0-9]/g, '_')
      const safeExam = (examType).replace(/[^a-zA-Z0-9]/g, '_')
      const filePath = `${schoolId}/question_papers/${safeSubject}_${safeClass}_${safeExam}_${Date.now()}_${file.name}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { upsert: false })

      if (uploadError) throw uploadError

      const basePayload = {
        school_id: schoolId,
        subject_id: subject.id,
        exam_type: examType,
        class_name: cls?.class_name || null,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        status: uploadStatus,
        uploaded_by: userId,
        uploaded_by_role: isHod ? 'hod' : 'teacher',
        term: currentTerm,
        year: currentYear,
      }

      // Try with class_id (post-migration), fall back without it (pre-migration)
      let dbError = null
      try {
        const withClassId = { ...basePayload, class_id: cls?.id || null }
        const res = await supabase.from('question_papers').upsert(withClassId, {
          onConflict: 'school_id,subject_id,class_id,exam_type,term,year',
        })
        dbError = res.error
      } catch {
        dbError = true
      }

      // If that failed (column doesn't exist), fall back to pre-migration schema
      if (dbError && dbError?.code === 'PGRST204') {
        const legacyPayload = { ...basePayload }
        delete legacyPayload.class_id
        delete legacyPayload.exam_type
        delete legacyPayload.uploaded_by_role
        const res = await supabase.from('question_papers').upsert(legacyPayload, {
          onConflict: 'school_id,subject_id,class_name,term,year',
        })
        if (res.error) throw res.error
      } else if (dbError) {
        throw dbError
      }

      setQuestionPapers(prev => {
        const filtered = prev.filter(p => {
          if (p.subject_id !== subject.id) return true
          if (p.exam_type !== examType) return true
          if (p.class_id) return p.class_id !== cls?.id
          return (p.class_name || null) !== (cls?.class_name || null)
        })
        return [{
          subject_id: subject.id,
          class_id: cls?.id || null,
          class_name: cls?.class_name || null,
          exam_type: examType,
          file_name: file.name,
          status: uploadStatus,
          subjects: { name: subject.name },
        }, ...filtered]
      })
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
      setUploadingExamType(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemovePaper = async (paper) => {
    const label = `${paper.subjects?.name || 'this subject'}${paper.class_name ? ` (${paper.class_name})` : ''} — ${paper.exam_type}`
    if (!window.confirm(`Remove question paper for ${label}?`)) return

    try {
      if (paper.file_path) {
        await supabase.storage.from(BUCKET).remove([paper.file_path])
      }
      await supabase.from('question_papers').delete().eq('id', paper.id)
      setQuestionPapers(prev => prev.filter(p => p.id !== paper.id))
    } catch (err) {
      console.error('Remove failed:', err)
    }
  }

  const resolveFileUrl = async (paper) => {
    if (!paper.file_path) return null
    for (const bucket of [BUCKET, 'documents']) {
      try {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(paper.file_path, 3600)
        if (!error && data?.signedUrl) return data.signedUrl
      } catch { continue }
    }
    return null
  }

  const handleDownloadPaper = async (paper) => {
    const url = await resolveFileUrl(paper)
    if (!url) { console.error('Download failed: file not found in any storage bucket'); return }
    const a = document.createElement('a')
    a.href = url
    a.download = paper.file_name || 'question_paper'
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const paperStatusConfig = {
    approved: { bg: '#dcfce7', color: '#16a34a', label: 'Approved', icon: <CheckCircle size={13} /> },
    pending: { bg: '#fef9c3', color: '#a16207', label: 'Pending Review', icon: <Clock size={13} /> },
    rejected: { bg: '#fee2e2', color: '#dc2626', label: 'Rejected', icon: <AlertCircle size={13} /> },
    not_uploaded: { bg: '#f1f5f9', color: '#64748b', label: 'Not Uploaded', icon: <AlertCircle size={13} /> },
  }

  // ── Breadcrumb ───────────────────────────────────────────────
  const Breadcrumbs = () => {
    const crumbs = [{ label: 'All Subjects', onClick: () => { setDrillLevel(1); setSelectedSubject(null); setSelectedClass(null) } }]
    if (selectedSubject) crumbs.push({ label: selectedSubject.name, onClick: () => { setDrillLevel(2); setSelectedClass(null) } })
    if (selectedClass) crumbs.push({ label: selectedClass.class_name, onClick: null })
    if (uploadingExamType) crumbs.push({ label: uploadingExamType.examType, onClick: null })

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {crumbs.map((crumb, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <ChevronRight size={12} color="#94a3b8" />}
            {crumb.onClick ? (
              <button
                onClick={crumb.onClick}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  fontSize: 13, fontWeight: i === crumbs.length - 1 ? 600 : 500,
                  color: i === crumbs.length - 1 ? '#0f172a' : '#7c3aed',
                }}
              >
                {crumb.label}
              </button>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{crumb.label}</span>
            )}
          </span>
        ))}
      </div>
    )
  }

  // ── Level 1: Subjects Grid ──────────────────────────────────
  const renderSubjectsLevel = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="hod-card">
        <div className="hod-card-header">
          <h3>Question Papers</h3>
          <span style={{ fontSize: 12, color: '#64748b' }}>{currentTerm || 'Current Term'} {currentYear}</span>
        </div>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
          Select a subject to manage exam papers by class and exam type.
        </p>

        {subjects.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13,
            background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0',
          }}>
            <FileText size={36} color="#cbd5e1" style={{ marginBottom: 8 }} />
            <p style={{ margin: 0 }}>No subjects found. Add subjects in the admin panel first.</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}>
            {subjects.map(sub => {
              const { uploaded, total } = getSubjectPaperCount(sub.id)
              const pct = total > 0 ? Math.round((uploaded / total) * 100) : 0
              return (
                <button
                  key={sub.id}
                  onClick={() => { setSelectedSubject(sub); setDrillLevel(2) }}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 10,
                    padding: '16px', background: '#fff', borderRadius: 10,
                    border: '1px solid #e2e8f0', cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{sub.name}</div>
                      {sub.code && (
                        <span style={{ fontSize: 11, color: '#64748b' }}>{sub.code}</span>
                      )}
                    </div>
                    <ChevronRight size={16} color="#94a3b8" />
                  </div>
                  <div style={{ marginTop: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#64748b' }}>Papers uploaded</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: uploaded > 0 ? '#16a34a' : '#94a3b8' }}>
                        {uploaded}/{total}
                      </span>
                    </div>
                    <div style={{ height: 4, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`, borderRadius: 99,
                        background: pct === 100 ? '#16a34a' : '#7c3aed',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  // ── Level 2: Classes Grid ───────────────────────────────────
  const renderClassesLevel = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Breadcrumbs />
      <div className="hod-card">
        <div className="hod-card-header">
          <h3>{selectedSubject?.name} — Classes</h3>
          <button
            className="hod-btn-ghost"
            onClick={() => { setDrillLevel(1); setSelectedSubject(null) }}
            style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <ArrowLeft size={14} /> Back
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
          Select a class to manage exam papers for {selectedSubject?.name}.
        </p>

        {classes.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13,
            background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0',
          }}>
            <p style={{ margin: 0 }}>No classes found. Add classes in the admin panel first.</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}>
            {classes.map(cls => {
              const { uploaded, total } = getClassPaperCount(selectedSubject?.id, cls.id)
              const pct = total > 0 ? Math.round((uploaded / total) * 100) : 0
              return (
                <button
                  key={cls.id}
                  onClick={() => { setSelectedClass(cls); setDrillLevel(3) }}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 10,
                    padding: '16px', background: '#fff', borderRadius: 10,
                    border: '1px solid #e2e8f0', cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{cls.class_name}</div>
                    <ChevronRight size={16} color="#94a3b8" />
                  </div>
                  <div style={{ marginTop: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#64748b' }}>Exam papers</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: uploaded > 0 ? '#16a34a' : '#94a3b8' }}>
                        {uploaded}/{total}
                      </span>
                    </div>
                    <div style={{ height: 4, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`, borderRadius: 99,
                        background: pct === 100 ? '#16a34a' : '#7c3aed',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  // ── Level 3: Exam Type Selection + Upload ───────────────────
  const renderExamTypesLevel = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Breadcrumbs />
      <div className="hod-card">
        <div className="hod-card-header">
          <h3>{selectedSubject?.name} — {selectedClass?.class_name}</h3>
          <button
            className="hod-btn-ghost"
            onClick={() => { setDrillLevel(2); setSelectedClass(null) }}
            style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <ArrowLeft size={14} /> Back
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
          Select an exam type to upload or replace the question paper.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}>
          {examTypes.map(exam => {
            const paper = getPaper(selectedSubject?.id, selectedClass?.id, exam.name)
            const status = paper ? paperStatusConfig[paper.status] : paperStatusConfig.not_uploaded
            return (
              <div key={exam.name} style={{
                border: '1px solid #e2e8f0', borderRadius: 12, padding: 20,
                display: 'flex', flexDirection: 'column', gap: 14,
                background: '#fff',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#0f172a' }}>{exam.name}</h4>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                    background: exam.weightage >= 50 ? '#f3e8ff' : '#f1f5f9',
                    color: exam.weightage >= 50 ? '#7c3aed' : '#64748b',
                  }}>{exam.weightage}%</span>
                </div>

                <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{exam.description || exam.label}</p>

                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', background: '#f8fafc', borderRadius: 8,
                }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>Max Marks</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{exam.max_marks}</span>
                </div>

                {/* Status badge */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: 8,
                  background: status.bg, color: status.color,
                  fontSize: 12, fontWeight: 500,
                }}>
                  {status.icon} {status.label}
                  {paper?.file_name && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.8, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <File size={10} /> {paper.file_name}
                    </span>
                  )}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {paper && (
                    <button
                      className="hod-btn-ghost"
                      onClick={async () => {
                        const url = await resolveFileUrl(paper)
                        setPreviewUrl(url || '')
                        setPreviewPaper(paper)
                      }}
                      title="Preview"
                      style={{ fontSize: 13, padding: '8px 10px', color: '#7c3aed' }}
                    >
                      <Eye size={14} />
                    </button>
                  )}
                  {paper && (
                    <button
                      className="hod-btn-ghost"
                      onClick={() => handleDownloadPaper(paper)}
                      title="Download"
                      style={{ fontSize: 13, padding: '8px 10px' }}
                    >
                      <Download size={14} />
                    </button>
                  )}
                  <button
                    className="hod-btn-primary"
                    onClick={() => handleFileClick(selectedSubject, selectedClass, exam.name)}
                    disabled={uploading}
                    style={{ flex: 1, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Upload size={14} />
                    {uploading && uploadingExamType?.examType === exam.name ? 'Uploading…' : paper ? 'Replace' : 'Upload'}
                  </button>
                  {paper && (
                    <button
                      className="hod-btn-danger"
                      onClick={() => handleRemovePaper(paper)}
                      style={{ fontSize: 13, padding: '8px 12px' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  const renderPapersTab = () => {
    if (drillLevel === 1) return renderSubjectsLevel()
    if (drillLevel === 2) return renderClassesLevel()
    return renderExamTypesLevel()
  }

  // ── CRUD: Grading Bands ──────────────────────────────────────
  const handleSaveBand = async (systemId) => {
    setSavingBand(true)
    try {
      const payload = {
        school_id: (await supabase.auth.getUser()).data.user ? (await supabase.from('profiles').select('school_id').eq('id', (await supabase.auth.getUser()).data.user.id).single()).data?.school_id : null,
        system_id: systemId,
        grade: bandForm.grade.trim(),
        label: bandForm.label.trim(),
        min_score: Number(bandForm.min_score),
        max_score: Number(bandForm.max_score),
        points: Number(bandForm.points),
        color: bandForm.color,
        sort_order: editingBand?.sort_order || 0,
      }
      if (!payload.school_id || !payload.grade) return

      if (editingBand?.id) {
        const { error } = await supabase.from('grading_bands').update({
          grade: payload.grade, label: payload.label, min_score: payload.min_score,
          max_score: payload.max_score, points: payload.points, color: payload.color,
        }).eq('id', editingBand.id)
        if (error) throw error
      } else {
        // Get next sort_order
        const bands = getBands(gradingSystems.find(s => s.id === systemId)?.slug)
        payload.sort_order = bands.length + 1
        const { error } = await supabase.from('grading_bands').insert(payload)
        if (error) throw error
      }
      setEditingBand(null)
      setBandForm({ grade: '', label: '', min_score: 0, max_score: 100, points: 0, color: '#64748b' })
      refreshGrading()
    } catch (err) {
      console.error('Save band failed:', err)
    } finally {
      setSavingBand(false)
    }
  }

  const handleDeleteBand = async (band) => {
    if (!window.confirm(`Delete grade "${band.grade}" from this system?`)) return
    try {
      await supabase.from('grading_bands').delete().eq('id', band.id)
      refreshGrading()
    } catch (err) {
      console.error('Delete band failed:', err)
    }
  }

  // ── CRUD: Grading Systems ────────────────────────────────────
  const handleCreateSystem = async () => {
    if (!newSystemName.trim() || !newSystemSlug.trim()) return
    setSavingSystem(true)
    try {
      const userId = (await supabase.auth.getUser()).data.user.id
      const { data: profile } = await supabase.from('profiles').select('school_id').eq('id', userId).single()
      const { error } = await supabase.from('grading_systems').insert({
        school_id: profile?.school_id,
        name: newSystemName.trim(),
        slug: newSystemSlug.trim().toLowerCase(),
        is_default: gradingSystems.length === 0,
      })
      if (error) throw error
      setNewSystemName('')
      setNewSystemSlug('')
      refreshGrading()
    } catch (err) {
      console.error('Create system failed:', err)
    } finally {
      setSavingSystem(false)
    }
  }

  const handleSetDefaultSystem = async (system) => {
    try {
      // Unset all defaults
      await supabase.from('grading_systems').update({ is_default: false }).eq('school_id', system.school_id)
      // Set this one
      await supabase.from('grading_systems').update({ is_default: true }).eq('id', system.id)
      refreshGrading()
    } catch (err) {
      console.error('Set default failed:', err)
    }
  }

  const handleDeleteSystem = async (system) => {
    if (!window.confirm(`Delete grading system "${system.name}"? This will also remove all its grade bands.`)) return
    try {
      await supabase.from('grading_systems').delete().eq('id', system.id)
      refreshGrading()
    } catch (err) {
      console.error('Delete system failed:', err)
    }
  }

  // ── CRUD: Exam Types ─────────────────────────────────────────
  const handleSaveExamType = async () => {
    setSavingExamType(true)
    try {
      const userId = (await supabase.auth.getUser()).data.user.id
      const { data: profile } = await supabase.from('profiles').select('school_id').eq('id', userId).single()
      const payload = {
        school_id: profile?.school_id,
        name: examTypeForm.name.trim(),
        label: examTypeForm.label.trim(),
        max_marks: Number(examTypeForm.max_marks),
        weightage: Number(examTypeForm.weightage),
        description: examTypeForm.description.trim(),
        sort_order: editingExamType?.sort_order || examTypes.length + 1,
      }
      if (!payload.school_id || !payload.name) return

      if (editingExamType?.id) {
        const { error } = await supabase.from('exam_type_config').update({
          name: payload.name, label: payload.label, max_marks: payload.max_marks,
          weightage: payload.weightage, description: payload.description,
        }).eq('id', editingExamType.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('exam_type_config').insert(payload)
        if (error) throw error
      }
      setEditingExamType(null)
      setExamTypeForm({ name: '', label: '', max_marks: 100, weightage: 0, description: '' })
      refreshExamTypes()
    } catch (err) {
      console.error('Save exam type failed:', err)
    } finally {
      setSavingExamType(false)
    }
  }

  const handleDeleteExamType = async (et) => {
    if (!window.confirm(`Delete exam type "${et.name}"?`)) return
    try {
      await supabase.from('exam_type_config').delete().eq('id', et.id)
      refreshExamTypes()
    } catch (err) {
      console.error('Delete exam type failed:', err)
    }
  }

  // ── Other tabs (unchanged) ──────────────────────────────────
  const renderGradingTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* New system form */}
      <div className="hod-card">
        <div className="hod-card-header">
          <h3>Add Grading System</h3>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>System Name</label>
            <input value={newSystemName} onChange={e => setNewSystemName(e.target.value)} placeholder="e.g. Senior School"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Slug (key)</label>
            <input value={newSystemSlug} onChange={e => setNewSystemSlug(e.target.value)} placeholder="e.g. senior"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
          </div>
          <button className="hod-btn-primary" onClick={handleCreateSystem} disabled={savingSystem || !newSystemName.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13 }}>
            <Plus size={14} /> {savingSystem ? 'Saving…' : 'Add System'}
          </button>
        </div>
      </div>

      {/* Grading systems */}
      {gradingSystems.map(sys => (
        <div key={sys.id} className="hod-card">
          <div className="hod-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0 }}>{sys.name}</h3>
              {sys.is_default && <span style={{ fontSize: 11, background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>Default</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {!sys.is_default && (
                <button className="hod-btn-ghost" onClick={() => handleSetDefaultSystem(sys)} style={{ fontSize: 12, padding: '6px 10px' }}>Set Default</button>
              )}
              <button className="hod-btn-danger" onClick={() => handleDeleteSystem(sys)} style={{ fontSize: 12, padding: '6px 10px' }}><Trash2 size={13} /></button>
            </div>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
            Slug: <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>{sys.slug}</code> — {sys.bands.length} grade band{sys.bands.length !== 1 ? 's' : ''}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 16 }}>
            {sys.bands.map(b => (
              <GradeCard key={b.id} g={b}
                onEdit={(band) => { setEditingSystem(sys); setEditingBand(band); setBandForm({ grade: band.grade, label: band.label || '', min_score: band.min_score, max_score: band.max_score, points: band.points, color: band.color }) }}
                onDelete={handleDeleteBand}
              />
            ))}
          </div>

          {/* Add/Edit band form */}
          {(editingSystem?.id === sys.id || (!editingSystem && gradingSystems.indexOf(sys) === 0)) && (
            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 10 }}>
                {editingBand ? `Edit: ${editingBand.grade}` : 'Add New Grade Band'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Grade</label>
                  <input value={bandForm.grade} onChange={e => setBandForm(f => ({ ...f, grade: e.target.value }))} placeholder="A+"
                    style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Label</label>
                  <input value={bandForm.label} onChange={e => setBandForm(f => ({ ...f, label: e.target.value }))} placeholder="Excellent"
                    style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Min Score</label>
                  <input type="number" value={bandForm.min_score} onChange={e => setBandForm(f => ({ ...f, min_score: e.target.value }))}
                    style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Max Score</label>
                  <input type="number" value={bandForm.max_score} onChange={e => setBandForm(f => ({ ...f, max_score: e.target.value }))}
                    style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Points</label>
                  <input type="number" value={bandForm.points} onChange={e => setBandForm(f => ({ ...f, points: e.target.value }))}
                    style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Color</label>
                  <input type="color" value={bandForm.color} onChange={e => setBandForm(f => ({ ...f, color: e.target.value }))}
                    style={{ width: '100%', padding: '4px', border: '1px solid #e2e8f0', borderRadius: 6, height: 32 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="hod-btn-primary" onClick={() => handleSaveBand(sys.id)} disabled={savingBand || !bandForm.grade.trim()}
                  style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Save size={13} /> {savingBand ? 'Saving…' : editingBand ? 'Update Band' : 'Add Band'}
                </button>
                {editingBand && (
                  <button className="hod-btn-ghost" onClick={() => { setEditingBand(null); setBandForm({ grade: '', label: '', min_score: 0, max_score: 100, points: 0, color: '#64748b' }) }}
                    style={{ fontSize: 13 }}>Cancel</button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {gradingSystems.length === 0 && !gradingLoading && (
        <div className="hod-card" style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          <BarChart3 size={40} color="#cbd5e1" style={{ marginBottom: 8 }} />
          <p style={{ margin: 0 }}>No grading systems configured yet. Add one above.</p>
        </div>
      )}
    </div>
  )

  const renderWeightageTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Exam types list */}
      <div className="hod-card">
        <div className="hod-card-header">
          <h3>Exam Type Breakdown</h3>
          <span style={{ fontSize: 12, color: '#64748b' }}>Total weightage: {examTypes.reduce((s, e) => s + e.weightage, 0)}%</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {examTypes.map(exam => (
            <div key={exam.id} style={{
              border: '1px solid #e2e8f0', borderRadius: 12, padding: 20,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#0f172a' }}>{exam.name}</h4>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                    background: exam.weightage >= 50 ? '#f3e8ff' : '#f1f5f9',
                    color: exam.weightage >= 50 ? '#7c3aed' : '#64748b',
                  }}>{exam.weightage}%</span>
                  <button onClick={() => { setEditingExamType(exam); setExamTypeForm({ name: exam.name, label: exam.label, max_marks: exam.max_marks, weightage: exam.weightage, description: exam.description || '' }) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', padding: 4 }}><Settings size={14} /></button>
                  <button onClick={() => handleDeleteExamType(exam)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}><Trash2 size={14} /></button>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{exam.label}</p>
              {exam.description && <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{exam.description}</p>}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', background: '#f8fafc', borderRadius: 8,
              }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Max Marks</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{exam.max_marks}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit exam type form */}
      <div className="hod-card">
        <div className="hod-card-header">
          <h3>{editingExamType ? `Edit: ${editingExamType.name}` : 'Add New Exam Type'}</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Name (key)</label>
            <input value={examTypeForm.name} onChange={e => setExamTypeForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. CAT 1"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Display Label</label>
            <input value={examTypeForm.label} onChange={e => setExamTypeForm(f => ({ ...f, label: e.target.value }))} placeholder="Continuous Assessment Test 1"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Max Marks</label>
            <input type="number" value={examTypeForm.max_marks} onChange={e => setExamTypeForm(f => ({ ...f, max_marks: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Weightage %</label>
            <input type="number" value={examTypeForm.weightage} onChange={e => setExamTypeForm(f => ({ ...f, weightage: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Description</label>
            <input value={examTypeForm.description} onChange={e => setExamTypeForm(f => ({ ...f, description: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="hod-btn-primary" onClick={handleSaveExamType} disabled={savingExamType || !examTypeForm.name.trim()}
            style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Save size={13} /> {savingExamType ? 'Saving…' : editingExamType ? 'Update Exam Type' : 'Add Exam Type'}
          </button>
          {editingExamType && (
            <button className="hod-btn-ghost" onClick={() => { setEditingExamType(null); setExamTypeForm({ name: '', label: '', max_marks: 100, weightage: 0, description: '' }) }}
              style={{ fontSize: 13 }}>Cancel</button>
          )}
        </div>
      </div>

      {/* Contribution bar chart */}
      {examTypes.length > 0 && (
        <div className="hod-card">
          <div className="hod-card-header">
            <h3>Contribution to Final Grade</h3>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
            Visual breakdown of how each exam type contributes to the final weighted score.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {examTypes.map(exam => (
              <div key={exam.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 50px', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{exam.name}</span>
                <div style={{ height: 24, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${exam.weightage}%`, borderRadius: 99,
                    background: exam.weightage >= 50 ? '#7c3aed' : '#a78bfa', transition: 'width 0.4s',
                  }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', textAlign: 'right' }}>{exam.weightage}%</span>
              </div>
            ))}
          </div>
          {examTypes.length > 0 && (
            <div style={{
              marginTop: 16, padding: '12px 16px', background: '#f3e8ff', borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Info size={16} color="#7c3aed" />
              <span style={{ fontSize: 13, color: '#6d28d9' }}>
                Final Score = {examTypes.map(e => `(${e.name} × ${(e.weightage / 100).toFixed(2)})`).join(' + ')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )

  const renderTimetableTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="hod-sp-header">
        <div className="hod-sp-filters">
          <div className="hod-sp-search-wrap">
            <Filter size={14} className="hod-sp-search-icon" />
            <select
              className="hod-sp-select"
              value={filterSubject}
              onChange={e => setFilterSubject(e.target.value)}
            >
              <option value="">All Subjects</option>
              {uniqueSubjectsInTimetable.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <span className="hod-sp-term-badge">{currentTerm || 'Current Term'} {currentYear}</span>
        </div>
        <span style={{ fontSize: 13, color: '#64748b' }}>
          {filteredSlots.length} slot{filteredSlots.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filteredSlots.length === 0 ? (
        <div className="hod-card">
          <div className="empty-state">
            <Clock size={40} color="#cbd5e1" />
            <p>No timetable slots found{filterSubject ? ` for ${filterSubject}` : ''}</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {DAYS.map(day => {
            const daySlots = groupedByDay[day]
            if (!daySlots || daySlots.length === 0) return null
            return (
              <div key={day} className="hod-card" style={{ padding: 18 }}>
                <h4 style={{
                  margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: '#7c3aed',
                  paddingBottom: 10, borderBottom: '1px solid #f1f5f9',
                }}>{day}</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {daySlots.map(slot => (
                    <div key={slot.id} style={{
                      padding: '10px 12px', background: '#f8fafc', borderRadius: 8,
                      border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                          {slot.subjects?.name || '\u2014'}
                        </span>
                        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
                          {slot.start_time || ''} \u2013 {slot.end_time || ''}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        {slot.classes?.class_name || '\u2014'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderTabContent = () => {
    if (isLoading) return <div className="loading-state">Loading exam setup data...</div>
    switch (activeTab) {
      case 'grading': return renderGradingTab()
      case 'weightage': return renderWeightageTab()
      case 'papers': return renderPapersTab()
      case 'timetable': return renderTimetableTab()
      default: return null
    }
  }

  return (
    <div className="hod-sub-page">
      <div className="hod-tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`hod-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      {renderTabContent()}

      {/* Preview Modal */}
      {previewPaper && (
        <div
          className="hod-dialog-overlay"
          onClick={() => setPreviewPaper(null)}
          style={{ zIndex: 1000 }}
        >
          <div
            className="hod-dialog"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 900, width: '95vw', height: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 20px', borderBottom: '1px solid #e2e8f0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <File size={16} color="#7c3aed" />
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
                    {previewPaper.file_name || 'Question Paper'}
                  </h3>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    {previewPaper.subjects?.name} — {previewPaper.class_name} — {previewPaper.exam_type}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="hod-btn-ghost"
                  onClick={() => handleDownloadPaper(previewPaper)}
                  style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <Download size={14} /> Download
                </button>
                <button
                  className="hod-btn-ghost"
                  onClick={() => setPreviewPaper(null)}
                  style={{ fontSize: 13, padding: '6px 10px' }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', background: '#f1f5f9' }}>
              {previewUrl ? (
                previewPaper.file_name?.endsWith('.pdf') || previewPaper.file_path?.endsWith('.pdf') ? (
                  <iframe
                    src={previewUrl}
                    title="Paper Preview"
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                ) : (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', height: '100%', gap: 16, color: '#64748b',
                  }}>
                    <File size={48} color="#cbd5e1" />
                    <p style={{ margin: 0, fontSize: 14 }}>Preview not available for this file type.</p>
                    <button
                      className="hod-btn-primary"
                      onClick={() => handleDownloadPaper(previewPaper)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Download size={14} /> Download to view
                    </button>
                  </div>
                )
              ) : (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', height: '100%', gap: 16, color: '#64748b',
                }}>
                  <File size={48} color="#cbd5e1" />
                  <p style={{ margin: 0, fontSize: 14 }}>No file URL available.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
