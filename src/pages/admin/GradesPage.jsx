import { useState, useEffect, useRef } from 'react'
import {
  BarChart2, Plus, Search, X, Save, Award,
  TrendingUp, BookOpen, CheckCircle, Printer,
  Users, Star, ArrowUp, ArrowDown, Download, ShieldCheck,
  Eye, XCircle, Upload, File as FileIcon, AlertCircle,
} from 'lucide-react'
import { ReportCard, getCBEGrade, fetchStudentComments } from '../../components/students/ReportCard'
import { weightedScoreMean } from '../../services/grading'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from './useSchool'
import { useExamTypeConfig } from '../../hooks/useSchoolConfig'
import {
  fetchBulkData, fetchBulkDataWithExtras, bulkPrint, downloadBulkZip, exportBulkPack,
} from './grades/utils/bulkReportCards'
import { uploadExamFile, validateExamFile, fetchExamUploadForGroup } from '../../utils/examUpload'

// ── Constants ────────────────────────────────────────────────
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

const TERMS = ['Term 1', 'Term 2', 'Term 3']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

// ── Previous term helper ──────────────────────────────────────
const getPrevTerm = (term, year) => {
  if (term === 'Term 1') return { term: 'Term 3', year: year - 1 }
  if (term === 'Term 2') return { term: 'Term 1', year }
  return { term: 'Term 2', year }
}

// Helper to pick the CSS-friendly band/grade string used for cbe-* classes
const cbeClassKey = (cbe) => (cbe.band || cbe.grade || 'me1').toLowerCase()

// ── Main Component ────────────────────────────────────────────
export default function GradesPage() {
  const { profile } = useAuthStore()
  const { currentTerm, currentYear: schoolYear } = useSchool()
  const { examTypes: examTypeConfig, examMap, getMax } = useExamTypeConfig()

  // ── State ─────────────────────────────────────────────────
  const [grades, setGrades]           = useState([])
  const [prevGrades, setPrevGrades]   = useState([])  // previous term — for most improved
  const [students, setStudents]       = useState([])
  const [classes, setClasses]         = useState([])
  const [subjectsList, setSubjectsList] = useState([])
  const [school, setSchool]           = useState(null)
  const [loading, setLoading]         = useState(true)
  const [activeTab, setActiveTab]     = useState('grades') // grades | analytics | report | bulk

  // Filters
  const [search, setSearch]             = useState('')
  const [filterTerm, setFilterTerm]     = useState('')
  const [filterYear, setFilterYear]     = useState('')
  const [filterClass, setFilterClass]   = useState('all')
  const [filterSubject, setFilterSubject] = useState('all')

  // Modal
  const [showModal, setShowModal]       = useState(false)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')
  const [form, setForm]                 = useState({
    student_id: '', subject: '', exam_type: 'Opener', term: '', year: '',
    cat1: '', cat2: '', et: '',
  })

  // Report card
  const [reportStudent, setReportStudent] = useState(null)
  const [reportGrades, setReportGrades]   = useState([])
  const [reportTeacherComment, setReportTeacherComment] = useState('')

  // Bulk
  const [filterExam, setFilterExam]       = useState('')
  const [bulkEntries, setBulkEntries]     = useState([])
  const [bulkLoading, setBulkLoading]     = useState(false)
  const [bulkProgress, setBulkProgress]   = useState({ current: 0, total: 0 })

  // Pending approvals
  const [pendingExams, setPendingExams]   = useState([])
  const [approving, setApproving]         = useState(null)
  const [viewExam, setViewExam]           = useState(null)

  // Rejection / approval modals
  const [rejectModal, setRejectModal]     = useState({ open: false, examId: null })
  const [rejectReason, setRejectReason]   = useState('')
  const [confirmApproveModal, setConfirmApproveModal] = useState({ open: false, examId: null })

  // Exam file upload (admin on behalf)
  const [examUpload, setExamUpload]       = useState(null)
  const [adminFile, setAdminFile]         = useState(null)
  const [adminFileError, setAdminFileError] = useState('')
  const [adminUploading, setAdminUploading] = useState(false)
  const adminFileInputRef = useRef(null)

  // ── Init ──────────────────────────────────────────────────
  useEffect(() => {
    fetchStudents()
    fetchSubjects()
    fetchSchool()
  }, [])

  useEffect(() => {
    if (currentTerm && !filterTerm) {
      setFilterTerm(currentTerm)
      setForm(f => ({ ...f, term: currentTerm }))
    }
    if (schoolYear && !filterYear) {
      setFilterYear(schoolYear)
      setForm(f => ({ ...f, year: schoolYear }))
    }
  }, [currentTerm, schoolYear])

  useEffect(() => {
    fetchGrades()
  }, [filterTerm, filterYear, filterClass, filterSubject])

  useEffect(() => {
    fetchPending()
  }, [profile?.school_id])

  // ── Fetches ───────────────────────────────────────────────
  const fetchSchool = async () => {
    const { data } = await supabase
      .from('schools')
      .select('name, logo_url')
      .eq('id', profile.school_id)
      .single()
    setSchool(data)
  }

  const fetchStudents = async () => {
    const [{ data: studentData }, { data: classData }] = await Promise.all([
      supabase.from('students')
        .select('id, full_name, class, admission_number')
        .eq('school_id', profile.school_id)
        .eq('status', 'active')
        .order('full_name'),
      supabase.from('classes')
        .select('id, class_name')
        .eq('school_id', profile.school_id)
        .order('class_name'),
    ])
    setStudents(studentData || [])
    setClasses(classData || [])
  }

  const fetchSubjects = async () => {
    const { data } = await supabase
      .from('subjects')
      .select('id, name')
      .eq('school_id', profile.school_id)
      .order('name')
    setSubjectsList(data || [])
  }

  const fetchGrades = async () => {
    if (!filterTerm || !filterYear) return
    setLoading(true)

    // Current term
    const { data } = await supabase
      .from('grades')
      .select('*, students(full_name, class, admission_number)')
      .eq('school_id', profile.school_id)
      .eq('term', filterTerm)
      .eq('year', filterYear)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    const g = (data || []).filter(r => r.students)
    setGrades(g)

    // Previous term for "most improved"
    const prev = getPrevTerm(filterTerm, parseInt(filterYear))
    const { data: prevData } = await supabase
      .from('grades')
      .select('student_id, subject, total_score, students(full_name, class)')
      .eq('school_id', profile.school_id)
      .eq('term', prev.term)
      .eq('year', prev.year)
    setPrevGrades(prevData || [])

    setLoading(false)
  }

  // ── Pending Approvals ────────────────────────────────────
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

    // Fetch teacher names for all distinct teacher_ids in one go
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
      const className = g.students?.class || g.class_name || '—'
      const key = `${g.subject}-${g.exam_type || 'End Term'}-${className}-${g.term}-${g.year}`
      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          subject: g.subject,
          examType: g.exam_type || 'End Term',
          className,
          teacherName: teacherMap[g.teacher_id] || null,
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
      fetchGrades()
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
      fetchGrades()
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
        term: firstEntry?.term || filterTerm,
        year: firstEntry?.year || parseInt(filterYear),
      })
      setExamUpload(data)
    } catch (err) {
      console.error('Failed to fetch exam upload:', err)
    }
  }

  const handleAdminFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAdminFileError('')
    const validation = validateExamFile(file)
    if (!validation.valid) {
      setAdminFileError(validation.error)
      setAdminFile(null)
      return
    }
    setAdminFile(file)
  }

  const handleAdminUpload = async () => {
    if (!adminFile || !viewExam || !profile?.school_id) return
    setAdminUploading(true)
    setAdminFileError('')
    try {
      const result = await uploadExamFile(adminFile, {
        schoolId: profile.school_id,
        subject: viewExam.subject,
        examType: viewExam.examType,
        className: viewExam.className,
        term: filterTerm,
        year: parseInt(filterYear),
        uploadedBy: profile?.id,
        uploadedByRole: 'admin',
      })
      setExamUpload(result)
      setAdminFile(null)
      if (adminFileInputRef.current) adminFileInputRef.current.value = ''
    } catch (err) {
      setAdminFileError('Upload failed: ' + err.message)
    } finally {
      setAdminUploading(false)
    }
  }

  // ── Save Grade ────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')

    const c1  = parseFloat(form.cat1)  || 0
    const c2  = parseFloat(form.cat2)  || 0
    const et  = parseFloat(form.et) || 0
    if (!form.cat1 && !form.cat2 && !form.et) { setError('At least one exam mark required'); setSaving(false); return }
    const max = getMax(form.exam_type) || 100
    const raw = form.exam_type === 'Opener' ? c1 : form.exam_type === 'Midterm' ? c2 : et
    const totalPct = Math.round((raw / max) * 100)

    const student = students.find(s => s.id === form.student_id)
    const cbe = getCBEGrade(totalPct, student?.class || '')

    if (cbe.status === 'unresolved' || cbe.status === 'pending') {
      setError(cbe.status === 'pending'
        ? `Cannot save grade for ${student?.class || 'this student'} — the senior grade profile is pending verification`
        : `Cannot save grade for ${student?.class || 'this student'} — the class grade profile is not configured`)
      setSaving(false)
      return
    }

    const payload = {
      school_id:        profile.school_id,
      student_id:       form.student_id,
      subject:          form.subject,
      exam_type:        form.exam_type,
      term:             form.term,
      year:             parseInt(form.year),
      sba_score:        raw,
      summative_score:  0,
      cat_score:        form.exam_type === 'End Term' ? 0 : raw,
      exam_score:       form.exam_type === 'End Term' ? raw : 0,
      total_score:      totalPct,
      max_marks:        max,
      class_name:       student?.class || null,
      grade:            cbe.grade  || cbe.band  || null,
      cbe_band:         cbe.band   || cbe.grade || null,
      points:           cbe.points || null,
      performance_level: cbe.label || null,
      teacher_id:       profile.id,
      updated_at:       new Date().toISOString(),
    }

    const { error: err } = await supabase
      .from('grades')
      .upsert(payload, { onConflict: 'student_id,subject,exam_type,term,year', ignoreDuplicates: false })

    if (err) { setError(err.message); setSaving(false); return }

    setSaving(false)
    setShowModal(false)
    setForm({ student_id: '', subject: '', exam_type: examTypeConfig[0]?.name || 'Opener', term: filterTerm, year: filterYear, cat1: '', cat2: '', et: '' })
    fetchGrades()
  }

  // ── Open Add Grade ─────────────────────────────────────────
  const openAddGrade = () => {
    setForm({ student_id: '', subject: '', exam_type: examTypeConfig[0]?.name || 'Opener', term: filterTerm, year: filterYear, cat1: '', cat2: '', et: '' })
    setError('')
    setShowModal(true)
  }

  // ── Open Report Card ──────────────────────────────────────
  const openReportCard = async (student) => {
    const sg = grades.filter(g => g.student_id === student.id)
    setReportGrades(sg)
    setReportStudent(student)
    setReportTeacherComment('')
    if (profile?.school_id && student?.id) {
      const comment = await fetchStudentComments(profile.school_id, student.id, filterTerm, parseInt(filterYear))
      setReportTeacherComment(comment)
    }
  }

  // ── Derived Analytics ─────────────────────────────────────
  const filtered = grades.filter(g => {
    const s = search.toLowerCase()
    const matchSearch  = !s || g.students?.full_name?.toLowerCase().includes(s) ||
      g.students?.admission_number?.toLowerCase().includes(s)
    const matchClass   = filterClass === 'all' || g.students?.class === filterClass
    const matchSubject = filterSubject === 'all' || g.subject === filterSubject
    return matchSearch && matchClass && matchSubject
  })

  // Summary cards
  const summary = {
    total:   grades.length,
    avg:     grades.length ? Math.round(weightedScoreMean(grades)) : 0,
    highest: Math.max(...grades.map(g => Number(g.total_score || 0)), 0),
    lowest:  grades.length ? Math.min(...grades.map(g => Number(g.total_score || 0))) : 0,
  }

  // Mean per subject
  const subjectMeans = subjectsList.map(s => {
    const sg = grades.filter(g => g.subject === s.name)
    const avg = sg.length
      ? Math.round(weightedScoreMean(sg))
      : null
    return { name: s.name, avg, count: sg.length }
  }).filter(s => s.count > 0).sort((a, b) => b.avg - a.avg)

  // Mean per student (across all subjects this term)
  const studentMeans = students.map(s => {
    const sg = grades.filter(g => g.student_id === s.id)
    const avg = sg.length
      ? Math.round(weightedScoreMean(sg))
      : null
    const totalPts = sg.reduce((a, g) => a + (g.points || 0), 0)
    return { ...s, avg, totalPts, subjectCount: sg.length }
  }).filter(s => s.avg !== null).sort((a, b) => b.avg - a.avg)

  // Mean per class
  const classMeans = classes.map(c => {
    const cg = grades.filter(g => g.students?.class === c.class_name)
    const avg = cg.length
      ? Math.round(cg.reduce((a, g) => a + (g.total_score || 0), 0) / cg.length)
      : null
    return { ...c, avg, count: cg.length }
  }).filter(c => c.avg !== null).sort((a, b) => b.avg - a.avg)

  // Most improved — compare avg score this term vs previous term
  const mostImproved = students.map(s => {
    const curr = grades.filter(g => g.student_id === s.id)
    const prev = prevGrades.filter(g => g.student_id === s.id)
    if (!curr.length || !prev.length) return null
    const currAvg = curr.reduce((a, g) => a + (g.total_score || 0), 0) / curr.length
    const prevAvg = prev.reduce((a, g) => a + (g.total_score || 0), 0) / prev.length
    const improvement = Math.round(currAvg - prevAvg)
    return { ...s, currAvg: Math.round(currAvg), prevAvg: Math.round(prevAvg), improvement }
  }).filter(Boolean).filter(s => s.improvement > 0).sort((a, b) => b.improvement - a.improvement).slice(0, 10)

  // Live preview in form
  const pC1  = parseFloat(form.cat1)  || 0
  const pC2  = parseFloat(form.cat2)  || 0
  const pET  = parseFloat(form.et) || 0
  const previewRaw = form.exam_type === 'Opener' ? pC1 : form.exam_type === 'Midterm' ? pC2 : pET
  const previewMax = getMax(form.exam_type) || 100
  const previewTotal = previewRaw ? Math.round((previewRaw / previewMax) * 100) : 0
  const previewStudent = students.find(s => s.id === form.student_id)
  const previewCBE = (form.cat1 || form.cat2 || form.et)
    ? getCBEGrade(previewTotal, previewStudent?.class || '')
    : null

  const prevTermLabel = (() => {
    const p = getPrevTerm(filterTerm, parseInt(filterYear))
    return `${p.term} ${p.year}`
  })()

  return (
    <div className="grades-page">

      {/* ── Summary Cards ── */}
      <div className="grades-summary">
        {[
          { label: 'Total Records', value: summary.total,     icon: <BookOpen size={20} />,   color: 'blue'   },
          { label: 'Class Average', value: `${summary.avg}%`, icon: <BarChart2 size={20} />,  color: 'purple' },
          { label: 'Highest Score', value: `${summary.highest}%`, icon: <TrendingUp size={20} />, color: 'green' },
          { label: 'Lowest Score',  value: `${summary.lowest}%`,  icon: <ArrowDown size={20} />,  color: 'red'   },
          { label: 'Most Improved', value: mostImproved[0]?.full_name?.split(' ')[0] || '—',
            icon: <Star size={20} />, color: 'amber' },
        ].map(s => (
          <div key={s.label} className={`grade-sum-card ${s.color}`}>
            <div className="gsc-icon">{s.icon}</div>
            <div>
              <p className="gsc-label">{s.label}</p>
              <p className="gsc-value">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="grades-tabs">
        {[
          { key: 'grades',    label: 'Grade Records',  icon: <BookOpen size={14} />  },
          { key: 'analytics', label: 'Analytics',      icon: <BarChart2 size={14} /> },
          { key: 'report',    label: 'Report Cards',   icon: <Printer size={14} />   },
          { key: 'bulk',      label: 'Bulk Reports',   icon: <Users size={14} />     },
          { key: 'approvals', label: 'Approve Pending', icon: <ShieldCheck size={14} />, badge: pendingExams.length },
        ].map(t => (
          <button key={t.key}
            className={`grades-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}>
            {t.icon} {t.label}
            {t.badge > 0 && (
              <span style={{
                background: '#dc2626', color: '#fff', borderRadius: 99,
                padding: '1px 6px', fontSize: 10, fontWeight: 700, marginLeft: 4,
              }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="grades-toolbar">
        <div className="grades-toolbar-left">
          <div className="search-wrap">
            <Search size={14} className="search-icon" />
            <input className="search-input" placeholder="Search student..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="filter-select" value={filterTerm} onChange={e => setFilterTerm(e.target.value)}>
            {TERMS.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="filter-select" value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))}>
            {YEARS.map(y => <option key={y}>{y}</option>)}
          </select>
          <select className="filter-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
            <option value="all">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
          </select>
          <select className="filter-select" value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
            <option value="all">All Subjects</option>
            {subjectsList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={openAddGrade}>
          <Plus size={15} /> Add Grade
        </button>
      </div>

      {/* ══════════════════════════════════════════
          TAB: GRADE RECORDS
      ══════════════════════════════════════════ */}
      {activeTab === 'grades' && (
        loading ? <p className="loading-state">Loading grades...</p>
        : filtered.length === 0 ? (
          <div className="empty-grades">
            <BarChart2 size={40} color="#cbd5e1" />
            <p>No grades for {filterTerm} {filterYear}</p>
            <button className="btn-primary" onClick={openAddGrade}>
              <Plus size={14} /> Add Grade
            </button>
          </div>
        ) : (
          <div className="grades-table-wrap">
            <table className="grades-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Exam</th>
                  <th>Score</th>
                  <th>Total %</th>
                  <th>CBE Band</th>
                  <th>Points</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(g => {
                  const cbe = getCBEGrade(g.total_score || 0, g.students?.class || '')
                  return (
                    <tr key={g.id}>
                      <td>
                        <div className="student-name-cell">
                          <div className="student-avatar-sm">
                            {g.students?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <p className="sname">{g.students?.full_name || '—'}</p>
                            <p className="sadm">{g.students?.admission_number || ''}</p>
                          </div>
                        </div>
                      </td>
                      <td>{g.students?.class || '—'}</td>
                      <td className="subject-cell">{g.subject}</td>
                      <td>{g.exam_type || 'End Term'}</td>
                      <td>{g.cat_score ?? g.sba_score ?? '—'}</td>
                      <td><strong>{g.total_score ?? '—'}%</strong></td>
                      <td>
                        <span className={`cbe-badge cbe-${cbeClassKey(cbe)}`}>
                          {cbe.band || cbe.grade || '—'}
                        </span>
                      </td>
                      <td>
                        <strong>{cbe.points ?? '—'}</strong>
                        {cbe.system === 'middle' && <span className="pts-max"> /8</span>}
                      </td>
                      <td>
                        <button className="action-btn" title="Open preview"
                          onClick={() => openReportCard(g.students)}>
                          <Printer size={12} /> Card
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ══════════════════════════════════════════
          TAB: ANALYTICS
      ══════════════════════════════════════════ */}
      {activeTab === 'analytics' && (
        <div className="grades-analytics">

          {/* Mean per Subject */}
          <div className="ga-card">
            <p className="ga-title"><BarChart2 size={15} /> Mean Score per Subject</p>
            {subjectMeans.length === 0
              ? <p className="text-muted">No data yet.</p>
              : subjectMeans.map(s => {
                  const cbe = getCBEGrade(s.avg, filterClass !== 'all' ? filterClass : '')
                  return (
                    <div key={s.name} className="ga-bar-row">
                      <span className="ga-bar-label">{s.name}</span>
                      <div className="ga-bar-track">
                        <div className="ga-bar-fill" style={{ width: `${s.avg}%`, background: s.avg >= 58 ? '#10b981' : s.avg >= 41 ? '#f59e0b' : '#ef4444' }} />
                      </div>
                      <span className="ga-bar-val">{s.avg}%</span>
                      <span className={`cbe-badge cbe-${cbe.band ? cbeClassKey(cbe) : 'unresolved'}`}>{cbe.band || '—'}</span>
                      <span className="ga-count">{s.count} records</span>
                    </div>
                  )
                })
            }
          </div>

          {/* Mean per Class */}
          <div className="ga-card">
            <p className="ga-title"><Users size={15} /> Mean Score per Class</p>
            {classMeans.length === 0
              ? <p className="text-muted">No data yet.</p>
              : classMeans.map(c => (
                <div key={c.id} className="ga-bar-row">
                  <span className="ga-bar-label">{c.class_name}</span>
                  <div className="ga-bar-track">
                    <div className="ga-bar-fill" style={{ width: `${c.avg}%`, background: '#7c3aed' }} />
                  </div>
                  <span className="ga-bar-val">{c.avg}%</span>
                  <span className="ga-count">{c.count} records</span>
                </div>
              ))
            }
          </div>

          {/* Top Students */}
          <div className="ga-card">
            <p className="ga-title"><Award size={15} /> Top Students — {filterTerm} {filterYear}</p>
            {studentMeans.length === 0
              ? <p className="text-muted">No data yet.</p>
              : studentMeans.slice(0, 10).map((s, i) => {
                  const cbe = getCBEGrade(s.avg, s.class || '')
                  return (
                    <div key={s.id} className="ga-student-row">
                      <span className="ga-rank">{i + 1}</span>
                      <div className="student-avatar-sm" style={{ width: 28, height: 28, fontSize: 9 }}>
                        {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="ga-student-info">
                        <span className="ga-student-name">{s.full_name}</span>
                        <span className="ga-student-class">{s.class}</span>
                      </div>
                      <span className="ga-student-avg">{s.avg}%</span>
                      <span className={`cbe-badge cbe-${cbeClassKey(cbe)}`}>
                        {cbe.band || cbe.grade}
                      </span>
                      <button className="action-btn" onClick={() => openReportCard(s)}>
                        <Printer size={11} /> Card
                      </button>
                    </div>
                  )
                })
            }
          </div>

          {/* Most Improved */}
          <div className="ga-card">
            <p className="ga-title"><ArrowUp size={15} /> Most Improved vs {prevTermLabel}</p>
            {mostImproved.length === 0
              ? <p className="text-muted">No comparison data yet — need grades from {prevTermLabel}.</p>
              : mostImproved.map((s, i) => (
                <div key={s.id} className="ga-student-row">
                  <span className="ga-rank">{i + 1}</span>
                  <div className="student-avatar-sm" style={{ width: 28, height: 28, fontSize: 9 }}>
                    {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="ga-student-info">
                    <span className="ga-student-name">{s.full_name}</span>
                    <span className="ga-student-class">{s.class}</span>
                  </div>
                  <span className="ga-student-avg">{s.prevAvg}% → {s.currAvg}%</span>
                  <span className="ga-improvement">+{s.improvement}%</span>
                </div>
              ))
            }
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: REPORT CARDS
      ══════════════════════════════════════════ */}
      {activeTab === 'report' && (
        <div className="grades-report-list">
          <p className="ga-title" style={{ marginBottom: 12 }}>
            <Printer size={15} /> Select a student to generate their report card for {filterTerm} {filterYear}
          </p>
          {studentMeans.length === 0
            ? <p className="text-muted">No grade data for this term/year yet.</p>
            : (
              <div className="report-student-grid">
                {studentMeans.map(s => (
                  <div key={s.id} className="report-student-card" onClick={() => openReportCard(s)}>
                    <div className="student-avatar-sm">
                      {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="sname">{s.full_name}</p>
                      <p className="sadm">{s.class} · {s.subjectCount} subjects · avg {s.avg}%</p>
                    </div>
                    <Printer size={14} color="#7c3aed" />
                  </div>
                ))}
              </div>
            )
          }
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: BULK REPORT CARDS
      ══════════════════════════════════════════ */}
      {activeTab === 'bulk' && (
        <div className="gbulk-wrap">
          <div className="gbulk-filters">
            <select className="filter-select" value={filterExam} onChange={e => setFilterExam(e.target.value)}>
              <option value="">All Exams</option>
              {examTypeConfig.map(et => <option key={et.name} value={et.name}>{et.name}</option>)}
            </select>
            <button className="btn-primary" disabled={bulkLoading}
              onClick={async () => {
                setBulkLoading(true); setBulkEntries([])
                const entries = await fetchBulkDataWithExtras(
                  profile.school_id,
                  filterClass === 'all' ? null : filterClass,
                  filterTerm, filterYear, filterExam
                )
                setBulkEntries(entries)
                setBulkLoading(false)
              }}>
              {bulkLoading ? 'Loading...' : <><Award size={15} /> Generate Report Cards</>}
            </button>
          </div>

          {bulkLoading && <p className="text-muted">Fetching report data…</p>}

          {bulkEntries.length > 0 && (
            <>
              <div className="gbulk-summary">
                <span><strong>{bulkEntries.length}</strong> students</span>
                <span><strong>{bulkEntries.reduce((s, e) => s + e.grades.length, 0)}</strong> total grades</span>
                <span>Avg: <strong>{Math.round(bulkEntries.reduce((s, e) => s + (e.avg || 0), 0) / bulkEntries.length)}%</strong></span>
              </div>

              <div className="gbulk-actions">
                <button className="btn-primary" onClick={() => bulkPrint(bulkEntries, school, filterTerm, filterYear)}>
                  <Printer size={15} /> Print All
                </button>
                <button className="btn-secondary" onClick={async () => {
                  setBulkProgress({ current: 0, total: bulkEntries.length })
                  await downloadBulkZip(bulkEntries, school, filterTerm, filterYear, (c, t) => setBulkProgress({ current: c, total: t }))
                  setBulkProgress({ current: 0, total: 0 })
                }}>
                  <Download size={15} /> Download ZIP
                </button>
                <button className="btn-secondary" onClick={async () => {
                  setBulkProgress({ current: 0, total: bulkEntries.length })
                  await exportBulkPack(bulkEntries, school, filterTerm, filterYear, (c, t) => setBulkProgress({ current: c, total: t }))
                  setBulkProgress({ current: 0, total: 0 })
                }}>
                  <Save size={15} /> Export Pack
                </button>
              </div>

              {bulkProgress.total > 0 && (
                <p className="text-muted" style={{ marginTop: 8 }}>
                  Generating PDFs… {bulkProgress.current} / {bulkProgress.total}
                </p>
              )}

              <div className="gbulk-preview">
                <p className="ga-title" style={{ marginBottom: 8 }}>Preview ({bulkEntries.length} students)</p>
                <div className="report-student-grid">
                  {bulkEntries.map(e => {
                    const cbe = getCBEGrade(e.avg || 0, e.student?.class || '')
                    return (
                      <div key={e.student.id} className="report-student-card" onClick={() => openReportCard(e.student)}>
                        <div className="student-avatar-sm">
                          {e.student.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p className="sname">{e.student.full_name}</p>
                          <p className="sadm">{e.student.class} · {e.grades.length} subjects · avg {e.avg}% · {cbe.band || cbe.grade || '—'}</p>
                        </div>
                        <Printer size={14} color="#7c3aed" />
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {!bulkLoading && bulkEntries.length === 0 && (
            <div className="empty-grades" style={{ marginTop: 24 }}>
              <Users size={40} color="#cbd5e1" />
              <p>Select filters and click <strong>Generate Report Cards</strong> to start.</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: PENDING APPROVALS
      ══════════════════════════════════════════ */}
      {activeTab === 'approvals' && (
        <>
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

          {viewExam ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <button className="action-btn" onClick={() => { setViewExam(null); setExamUpload(null); setAdminFile(null); setAdminFileError('') }}>
                  ← Back to Pending
                </button>
                <span className="text-muted">{viewExam.subject} · {viewExam.examType} · {viewExam.className}</span>
              </div>

              {examUpload && (
                <div className="ga-card" style={{ padding: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <FileIcon size={18} color="#2563eb" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{examUpload.file_name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                      Uploaded by {examUpload.uploaded_by_role === 'admin' ? 'Admin (on behalf)' : examUpload.uploaded_by_role === 'hod' ? 'HOD' : 'Teacher'}
                    </p>
                  </div>
                  {examUpload.file_url && (
                    <a href={examUpload.file_url} target="_blank" rel="noopener noreferrer" className="action-btn" style={{ textDecoration: 'none' }}>
                      View File
                    </a>
                  )}
                </div>
              )}

              {!examUpload && (
                <div className="ga-card" style={{ padding: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <AlertCircle size={16} color="#f59e0b" />
                  <span style={{ fontSize: 13, color: '#92400e', fontWeight: 500 }}>No exam paper uploaded.</span>
                  <span style={{ fontSize: 13, color: '#64748b' }}>Upload on behalf of teacher:</span>
                  <input type="file" accept=".pdf,.doc,.docx" ref={adminFileInputRef} onChange={handleAdminFileSelect} style={{ display: 'none' }} />
                  <button className="btn-secondary" onClick={() => adminFileInputRef.current?.click()} disabled={adminUploading} style={{ fontSize: 12, padding: '6px 12px' }}>
                    <Upload size={13} /> {adminUploading ? 'Uploading...' : 'Upload Exam Paper'}
                  </button>
                  {adminFile && (
                    <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={13} /> {adminFile.name}
                      <button onClick={() => { setAdminFile(null); setAdminFileError(''); if (adminFileInputRef.current) adminFileInputRef.current.value = '' }}
                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0, fontSize: 12 }}>✕</button>
                    </span>
                  )}
                  {adminFile && (
                    <button className="btn-primary" onClick={handleAdminUpload} disabled={adminUploading} style={{ fontSize: 12, padding: '6px 12px' }}>
                      Confirm Upload
                    </button>
                  )}
                  {adminFileError && <span style={{ fontSize: 12, color: '#dc2626' }}>{adminFileError}</span>}
                </div>
              )}

              <div className="ga-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{viewExam.subject} - {viewExam.examType}</h3>
                    <p className="text-muted" style={{ margin: '4px 0 0' }}>
                      {viewExam.teacherName ? `Teacher: ${viewExam.teacherName} · ` : ''}{viewExam.entries.length} students · Avg: {
                        viewExam.entries.length
                          ? Math.round(viewExam.entries.reduce((s, g) => s + Number(g.total_score || 0), 0) / viewExam.entries.length)
                          : 0
                      }%
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-secondary" onClick={() => setRejectModal({ open: true, examId: viewExam.id })} disabled={approving === viewExam.id}>
                      <XCircle size={14} /> {approving === viewExam.id ? 'Processing...' : 'Reject'}
                    </button>
                    <button className="btn-primary" onClick={() => setConfirmApproveModal({ open: true, examId: viewExam.id })} disabled={approving === viewExam.id}>
                      <CheckCircle size={14} /> {approving === viewExam.id ? 'Approving...' : 'Approve'}
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="grades-table">
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
                      {viewExam.entries.map((g, i) => (
                        <tr key={g.id}>
                          <td className="text-muted">{i + 1}</td>
                          <td><div className="sname">{g.students?.full_name || '—'}</div></td>
                          <td className="sadm">{g.students?.admission_number || '—'}</td>
                          <td>{g.students?.class || '—'}{g.students?.stream ? ` ${g.students.stream}` : ''}</td>
                          <td style={{ fontWeight: 600 }}>{g.total_score ?? '—'}%</td>
                          <td><span className="cbe-badge">{g.grade || g.cbe_band || '—'}</span></td>
                          <td className="text-muted">{g.remarks || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn-secondary" onClick={() => setRejectModal({ open: true, examId: viewExam.id })} disabled={approving === viewExam.id}>
                    <XCircle size={14} /> {approving === viewExam.id ? 'Processing...' : 'Reject'}
                  </button>
                  <button className="btn-primary" onClick={() => setConfirmApproveModal({ open: true, examId: viewExam.id })} disabled={approving === viewExam.id}>
                    <CheckCircle size={14} /> {approving === viewExam.id ? 'Approving...' : 'Approve & Publish'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grades-summary" style={{ marginBottom: 16 }}>
                <div className={`grade-sum-card ${pendingExams.length > 0 ? 'red' : 'green'}`}>
                  <ShieldCheck size={20} />
                  <div>
                    <p className="gsc-label">Pending Approvals</p>
                    <p className="gsc-value">{pendingExams.length}</p>
                  </div>
                </div>
                <div className="grade-sum-card green">
                  <CheckCircle size={20} />
                  <div>
                    <p className="gsc-label">Total Student Entries</p>
                    <p className="gsc-value">{pendingExams.reduce((s, e) => s + e.entries.length, 0)}</p>
                  </div>
                </div>
              </div>

              {pendingExams.length === 0 ? (
                <div className="empty-grades">
                  <ShieldCheck size={40} color="#cbd5e1" />
                  <p>No pending submissions from teachers</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {pendingExams.map(exam => {
                    const avg = exam.entries.length
                      ? Math.round(exam.entries.reduce((s, g) => s + Number(g.total_score || 0), 0) / exam.entries.length)
                      : 0
                    const passCount = exam.entries.filter(g => Number(g.total_score || 0) >= 50).length
                    return (
                      <div key={exam.id} className="report-student-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <BookOpen size={18} color="#d97706" />
                            </div>
                            <div>
                              <h4 style={{ margin: 0, fontSize: 14 }}>{exam.subject}</h4>
                              <p className="text-muted" style={{ margin: 0, fontSize: 11 }}>{exam.examType} · {exam.className}</p>
                            </div>
                          </div>
                          <span className="cbe-badge cbe-be1" style={{ fontSize: 10, fontWeight: 600, borderRadius: 99 }}>Pending</span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b' }}>
                          <span><Users size={12} /> {exam.entries.length} students</span>
                          <span><BarChart2 size={12} /> Avg: {avg}%</span>
                          <span><CheckCircle size={12} /> {passCount} passed</span>
                        </div>
                        <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>
                          {exam.teacherName ? `Teacher: ${exam.teacherName} · ` : ''}{exam.createdAt ? new Date(exam.createdAt).toLocaleDateString() : ''}
                        </p>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                          <button className="action-btn" onClick={() => { setViewExam(exam); loadExamUpload(exam) }}>
                            <Eye size={13} /> Review
                          </button>
                          <button className="action-btn" style={{ color: '#dc2626', borderColor: '#fecaca' }} onClick={() => setRejectModal({ open: true, examId: exam.id })} disabled={approving === exam.id}>
                            <XCircle size={13} /> Reject
                          </button>
                          <button className="btn-primary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setConfirmApproveModal({ open: true, examId: exam.id })} disabled={approving === exam.id}>
                            <CheckCircle size={13} /> {approving === exam.id ? '...' : 'Approve'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════
          ADD GRADE MODAL
      ══════════════════════════════════════════ */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Grade</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              {error && <div className="form-error">{error}</div>}
              <div className="form-grid">
                <div className="form-field full">
                  <label>Student *</label>
                  <select required value={form.student_id}
                    onChange={e => setForm({ ...form, student_id: e.target.value })}>
                    <option value="">Select student...</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} — {s.class} ({s.admission_number})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field full">
                  <label>Subject *</label>
                  <select required value={form.subject}
                    onChange={e => setForm({ ...form, subject: e.target.value })}>
                    <option value="">Select subject...</option>
                    {subjectsList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Exam Type *</label>
                  <select value={form.exam_type} onChange={e => setForm({ ...form, exam_type: e.target.value })}>
                    {examTypeConfig.map(et => <option key={et.name} value={et.name}>{et.name}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Term *</label>
                  <select value={form.term} onChange={e => setForm({ ...form, term: e.target.value })}>
                    {TERMS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Year *</label>
                  <select value={form.year} onChange={e => setForm({ ...form, year: e.target.value })}>
                    {YEARS.map(y => <option key={y}>{y}</option>)}
                  </select>
                </div>
                {form.exam_type === 'Opener' && (
                  <div className="form-field">
                    <label>Opener Score (0–{getMax('Opener')})</label>
                    <input type="number" min="0" max={getMax('Opener')} placeholder="e.g. 12"
                      value={form.cat1} onChange={e => setForm({ ...form, cat1: e.target.value })} />
                  </div>
                )}
                {form.exam_type === 'Midterm' && (
                  <div className="form-field">
                    <label>Midterm Score (0–{getMax('Midterm')})</label>
                    <input type="number" min="0" max={getMax('Midterm')} placeholder="e.g. 13"
                      value={form.cat2} onChange={e => setForm({ ...form, cat2: e.target.value })} />
                  </div>
                )}
                {form.exam_type === 'End Term' && (
                  <div className="form-field">
                    <label>End Term Score (0–{getMax('End Term')})</label>
                    <input type="number" min="0" max={getMax('End Term')} placeholder="e.g. 56"
                      value={form.et} onChange={e => setForm({ ...form, et: e.target.value })} />
                  </div>
                )}
              </div>

              {/* Live CBE preview */}
              {previewCBE && (
                <div className="grade-preview">
                  <span>Score: <strong>{previewRaw}/{previewMax}</strong></span>
                  <span>→ <strong>{previewTotal}%</strong></span>
                  <span className={`cbe-badge cbe-${previewCBE.band ? cbeClassKey(previewCBE) : 'unresolved'}`}>
                    {previewCBE.band || '—'}
                  </span>
                  <span className="gp-label">{previewCBE.label}</span>
                  {previewCBE.points && (
                    <span className="gp-pts">
                      {previewCBE.points} /8 pts
                    </span>
                  )}
                  <span className="gp-system">
                    {previewCBE.system === 'early'  ? 'Early Years Rubric' :
                     previewCBE.system === 'middle' ? 'Middle School 8-Level' :
                     'Senior — Pending Verification'}
                  </span>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  <Save size={15} /> {saving ? 'Saving...' : 'Save Grade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Report Card Modal ── */}
      {reportStudent && (
        <ReportCard
          student={reportStudent}
          grades={reportGrades}
          school={school}
          term={filterTerm}
          year={filterYear}
          teacherComment={reportTeacherComment}
          onClose={() => setReportStudent(null)}
        />
      )}
    </div>
  )
}