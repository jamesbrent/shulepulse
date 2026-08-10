import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Save, CheckCircle, Search, Users, BookOpen,
  AlertCircle, FileSpreadsheet, Send, Clock,
  BarChart3, History, ShieldCheck, ArrowLeft, Download,
  FileText, ChevronRight,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'
import { useExamTypeConfig } from '../../hooks/useSchoolConfig'
import { uploadExamFile, validateExamFile } from '../../utils/examUpload'
import {
  exportClassMarkSheet,
  exportSubjectSummary,
  exportPerformanceAnalysis,
  exportStudentIndividualReport,
  exportBulkStudentReports,
} from '../../utils/teacherPdfExport'
import { getCBEGrade, gradeDisplay } from '../../components/students/ReportCard'

const TERMS = ['Term 1', 'Term 2', 'Term 3']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]
const AUTO_SAVE_DELAY = 15000

const GRADE_LABELS = ['A', 'B', 'C', 'D', 'E']

export default function MarksEntry({ profile }) {
  const { examTypes: examTypeConfig, examMap, getMax } = useExamTypeConfig()
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [grades, setGrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState({})
  const [lastSaved, setLastSaved] = useState(null)
  const [activeTab, setActiveTab] = useState('entry')
  const [auditLogs, setAuditLogs] = useState([])
  const [teacherName, setTeacherName] = useState('')
  const [teacherRec, setTeacherRec] = useState(null)
  const fileInputRef = useRef(null)
  const autoSaveTimer = useRef(null)
  const classSubjectRef = useRef({})

  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [term, setTerm] = useState(TERMS[1])
  const [year, setYear] = useState(String(CURRENT_YEAR))
  const [search, setSearch] = useState('')

  const [gradeForm, setGradeForm] = useState({})
  const [dirty, setDirty] = useState(false)
  const hasChanges = useRef(false)

  const [view, setView] = useState('dashboard')
  const [classCards, setClassCards] = useState([])
  const [expandedClass, setExpandedClass] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportFormat, setExportFormat] = useState('summary')
  const [school, setSchool] = useState(null)

  const [examFile, setExamFile] = useState(null)
  const [examFileUploading, setExamFileUploading] = useState(false)
  const [examFileError, setExamFileError] = useState('')
  const [existingExamUpload, setExistingExamUpload] = useState(null)
  const examFileInputRef = useRef(null)

  useEffect(() => {
    if (!profile?.school_id) return
    fetchData()
  }, [profile])

  useEffect(() => {
    if (selectedClass && view === 'entry') fetchStudentsByClass()
  }, [selectedClass, view])

  useEffect(() => {
    const subs = classSubjectRef.current[selectedClass]
    if (subs && !subs.has(selectedSubject) && subs.size > 0) {
      setSelectedSubject([...subs][0])
    }
  }, [selectedClass, selectedSubject])

  useEffect(() => {
    if (selectedClass && selectedSubject) {
      fetchGrades()
    }
  }, [selectedClass, selectedSubject, term, year])

  useEffect(() => {
    if (!dirty) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      persistGrades('draft', false)
    }, AUTO_SAVE_DELAY)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [gradeForm, dirty])

  useEffect(() => {
    if (activeTab === 'audit' && selectedClass && selectedSubject) {
      fetchAuditLogs()
    }
  }, [activeTab, selectedClass, selectedSubject, term, year])

  useEffect(() => {
    if (classes.length > 0 && !expandedClass) {
      setExpandedClass(classes[0])
    }
  }, [classes])

  const fetchData = async () => {
    setLoading(true)
    try {
      const schoolId = profile.school_id

      const { data: schoolData } = await supabase
        .from('schools')
        .select('*')
        .eq('id', schoolId)
        .single()
      setSchool(schoolData)

      const { data: teacherRecData } = await supabase
        .from('teachers')
        .select('id, full_name')
        .eq('email', profile.email)
        .eq('school_id', schoolId)
        .maybeSingle()
      if (!teacherRecData) { setLoading(false); return }
      setTeacherRec(teacherRecData)
      setTeacherName(teacherRecData.full_name || 'Teacher')

      const [{ data: slots }, { data: subs }] = await Promise.all([
        supabase.from('timetable_slots').select('class_id, subject_id, classes(class_name), subjects(name)').eq('teacher_id', teacherRecData.id).eq('school_id', schoolId),
        supabase.from('subjects').select('id, name').eq('school_id', schoolId).order('name'),
      ])

      const classSubjects = {}
      ;(slots || []).forEach(s => {
        const cn = s.classes?.class_name?.trim()
        const sn = s.subjects?.name
        if (cn && sn) {
          if (!classSubjects[cn]) classSubjects[cn] = new Set()
          classSubjects[cn].add(sn)
        }
      })
      classSubjectRef.current = classSubjects

      const uniqueClasses = Object.keys(classSubjects).sort()
      const allSubjects = subs || []

      setClasses(uniqueClasses)
      setSubjects(allSubjects)

      if (uniqueClasses.length > 0 && !selectedClass) setSelectedClass(uniqueClasses[0])
      if (uniqueClasses.length > 0 && !selectedSubject) {
        const firstSubjects = [...(classSubjects[uniqueClasses[0]] || [])]
        if (firstSubjects.length > 0) setSelectedSubject(firstSubjects[0])
      }

      await buildClassCards(schoolId, classSubjects)
    } catch (err) {
      console.error('fetchData error:', err)
    }
    setLoading(false)
  }

  const buildClassCards = async (schoolId, classSubjects) => {
    if (!profile?.id) return
    const { data: allSchoolStudents } = await supabase
      .from('students')
      .select('class')
      .eq('school_id', schoolId)
      .eq('status', 'active')
    const rawCounts = {}
    ;(allSchoolStudents || []).forEach(s => {
      if (s.class) rawCounts[s.class.trim().toLowerCase()] = (rawCounts[s.class.trim().toLowerCase()] || 0) + 1
    })

    const { data: allGrades } = await supabase
      .from('grades')
      .select('class_name, subject, exam_type, status, total_score')
      .eq('school_id', schoolId)
      .eq('teacher_id', profile.id)
      .eq('term', term)
      .eq('year', Number(year))

    const cards = Object.entries(classSubjects).flatMap(([className, subjects]) =>
      [...subjects].map(subjectName => {
        const existingGrades = (allGrades || []).filter(
          g => g.class_name === className && g.subject === subjectName
        )
        const examStatuses = {}
        const examTypeNames = examTypeConfig.map(e => e.name)
        examTypeNames.forEach(et => {
          const etGrades = existingGrades.filter(g => g.exam_type === et)
          const statuses = etGrades.map(g => g.status)
          if (statuses.includes('approved')) examStatuses[et] = 'approved'
          else if (statuses.includes('submitted')) examStatuses[et] = 'submitted'
          else if (etGrades.some(s => s.status === 'draft')) examStatuses[et] = 'draft'
          else if (etGrades.length > 0) examStatuses[et] = 'completed'
          else examStatuses[et] = 'pending'
          const scores = etGrades.map(g => Number(g.total_score)).filter(s => !isNaN(s))
          examStatuses[`${et}_mean`] = scores.length > 0
            ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
            : null
        })
        return {
          className, subjectName,
          studentCount: rawCounts[className.trim().toLowerCase()] || 0,
          examStatuses,
          pendingExam: examTypeNames.find(et => examStatuses[et] === 'pending') || null,
        }
      })
    )
    setClassCards(cards)
  }

  const refreshClassCards = async () => {
    if (!teacherRec || !profile?.school_id) return
    await buildClassCards(profile.school_id, classSubjectRef.current)
  }

  const fetchGrades = async () => {
    const { data } = await supabase
      .from('grades')
      .select('*')
      .eq('school_id', profile.school_id)
      .eq('class_name', selectedClass)
      .eq('subject', selectedSubject)
      .in('exam_type', examTypeConfig.map(e => e.name))
      .eq('term', term)
      .eq('year', Number(year))

    const merged = {}
    ;(data || []).forEach(g => {
      const pct = g.total_score ?? 0
      const max = getMax(g.exam_type) || 100
      const raw = max === 100 ? pct : Math.round((pct / 100) * max)
      const key = g.exam_type === 'CAT 1' ? 'cat1' : g.exam_type === 'CAT 2' ? 'cat2' : 'et'
      if (!merged[g.student_id]) merged[g.student_id] = { cat1: '', cat2: '', et: '', remarks: '', status: 'draft' }
      merged[g.student_id][key] = raw || ''
      const statusVal = g.status || 'draft'
      if (statusVal === 'approved') merged[g.student_id].status = 'approved'
      else if (statusVal === 'submitted' && merged[g.student_id].status !== 'approved') merged[g.student_id].status = 'submitted'
      else if (statusVal === 'rejected') merged[g.student_id].status = 'rejected'
    })
    setGradeForm(merged)
    setGrades(data || [])
    setDirty(false)
    hasChanges.current = false
  }

  const fetchStudentsByClass = async () => {
    if (!profile?.school_id || !selectedClass) return
    const { data } = await supabase
      .from('students')
      .select('id, full_name, class, admission_number')
      .eq('school_id', profile.school_id)
      .eq('status', 'active')
    const cls = selectedClass.trim().toLowerCase()
    const filtered = (data || []).filter(s => s.class?.trim().toLowerCase() === cls).sort((a, b) => (a.full_name || '').localeCompare(b.full_name))
    setStudents(filtered)
  }

  const fetchAuditLogs = async () => {
    const { data } = await supabase
      .from('grade_audit_logs')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('performed_at', { ascending: false })
      .limit(50)
    setAuditLogs(data || [])
  }

  const filteredStudents = useMemo(() => {
    const cls = selectedClass?.trim().toLowerCase()
    return students.filter(s => {
      const matchClass = !cls || s.class?.trim().toLowerCase() === cls
      const matchSearch = s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        s.admission_number?.toLowerCase().includes(search.toLowerCase())
      return matchClass && matchSearch
    })
  }, [students, selectedClass, search])

  const enteredCount = useMemo(() => {
    return filteredStudents.filter(s => {
      const g = gradeForm[s.id]
      return g && (g.cat1 !== '' || g.cat2 !== '' || g.et !== '')
    }).length
  }, [filteredStudents, gradeForm])

  const missingCount = filteredStudents.length - enteredCount

  const calcTotal = (g) => {
    if (!g) return null
    const c1 = Number(g.cat1) || 0
    const c2 = Number(g.cat2) || 0
    const et = Number(g.et) || 0
    if (!g.cat1 && !g.cat2 && !g.et) return null
    return c1 + c2 + et
  }

  const scores = useMemo(() => {
    return filteredStudents
      .map(s => calcTotal(gradeForm[s.id]))
      .filter(s => s !== null)
  }, [filteredStudents, gradeForm])

  const highest = scores.length > 0 ? Math.max(...scores) : '—'
  const lowest = scores.length > 0 ? Math.min(...scores) : '—'
  const average = scores.length > 0
    ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
    : '—'

  const gradeDist = useMemo(() => {
    const dist = { A: 0, B: 0, C: 0, D: 0, E: 0 }
    scores.forEach(score => {
      if (score >= 80) dist.A++
      else if (score >= 65) dist.B++
      else if (score >= 50) dist.C++
      else if (score >= 35) dist.D++
      else dist.E++
    })
    return dist
  }, [scores])

  const maxGradeCount = Math.max(...Object.values(gradeDist), 1)

  const overallStatus = useMemo(() => {
    const statuses = Object.values(gradeForm).map(g => g.status).filter(Boolean)
    if (statuses.includes('approved')) return { label: 'Approved', color: '#16a34a' }
    if (statuses.includes('rejected')) return { label: 'Rejected', color: '#dc2626' }
    if (statuses.includes('submitted')) return { label: 'Awaiting Approval', color: '#2563eb' }
    if (enteredCount > 0 || dirty) return { label: 'Draft Saved', color: '#d97706' }
    return { label: 'Not Started', color: '#94a3b8' }
  }, [gradeForm, enteredCount, dirty])

  const progressPct = filteredStudents.length > 0
    ? Math.round((enteredCount / filteredStudents.length) * 100)
    : 0

  const isLocked = Object.values(gradeForm).some(g => g.status === 'locked')

  const maxForField = { cat1: 20, cat2: 20, et: 60 }

  const updateGrade = (studentId, field, value) => {
    if (isLocked) return
    if (field === 'cat1' || field === 'cat2' || field === 'et') {
      const raw = Number(value)
      if (value !== '' && (isNaN(raw) || raw < 0)) return
      if (value !== '' && raw > maxForField[field]) return
    }
    setGradeForm(prev => {
      const current = prev[studentId] || { cat1: '', cat2: '', et: '', remarks: '', status: 'draft' }
      return { ...prev, [studentId]: { ...current, [field]: value } }
    })
    setDirty(true)
    hasChanges.current = true
    if (errors[studentId]) {
      setErrors(prev => { const n = { ...prev }; delete n[studentId]; return n })
    }
  }

  const validate = () => {
    const newErrors = {}
    filteredStudents.forEach(s => {
      const g = gradeForm[s.id]
      if (!g || (!g.cat1 && !g.cat2 && !g.et)) {
        newErrors[s.id] = 'At least one exam mark required'
        return
      }
      const c1 = Number(g.cat1) || 0
      const c2 = Number(g.cat2) || 0
      const et = Number(g.et) || 0
      if (g.cat1 && (isNaN(c1) || c1 < 0 || c1 > getMax('CAT 1'))) { newErrors[s.id] = 'CAT 1 invalid'; return }
      if (g.cat2 && (isNaN(c2) || c2 < 0 || c2 > getMax('CAT 2'))) { newErrors[s.id] = 'CAT 2 invalid'; return }
      if (g.et && (isNaN(et) || et < 0 || et > getMax('End Term'))) { newErrors[s.id] = 'End Term invalid'; return }
    })
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const persistGrades = async (status, shouldUploadFile = false) => {
    if (!hasChanges.current) return
    const inserts = []

    filteredStudents.forEach(s => {
      const g = gradeForm[s.id]
      if (!g || (!g.cat1 && !g.cat2 && !g.et)) return
      const c1 = Number(g.cat1) || 0
      const c2 = Number(g.cat2) || 0
      const et = Number(g.et) || 0

      const examFields = []
      if (g.cat1) examFields.push({ exam_type: 'CAT 1', raw: c1, max: getMax('CAT 1') })
      if (g.cat2) examFields.push({ exam_type: 'CAT 2', raw: c2, max: getMax('CAT 2') })
      if (g.et) examFields.push({ exam_type: 'End Term', raw: et, max: getMax('End Term') })

      examFields.forEach(({ exam_type, raw, max }) => {
        const total = Math.round((raw / max) * 100)
        const cbe = getCBEGrade(total, selectedClass)
        inserts.push({
          school_id: profile.school_id,
          student_id: s.id,
          subject: selectedSubject,
          exam_type,
          term,
          year: Number(year),
          cat_score: 0,
          exam_score: 0,
          total_score: total,
          class_name: selectedClass,
          grade: gradeDisplay(cbe),
          cbe_band: cbe.band || cbe.grade || null,
          points: cbe.points || null,
          performance_level: cbe.label || null,
          teacher_id: profile.id,
          teacher_name: profile.full_name || '',
          status,
          remarks: g.remarks || '',
          submitted_at: status === 'submitted' ? new Date().toISOString() : undefined,
        })
      })
    })

    if (inserts.length === 0) return

    setSaving(true)
    const { error } = await supabase
      .from('grades')
      .upsert(inserts, { onConflict: 'student_id,subject,exam_type,term,year', ignoreDuplicates: false })

    setSaving(false)
    if (!error) {
      setLastSaved(new Date())
      hasChanges.current = false
      setDirty(false)
      if (!shouldUploadFile) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
      fetchGrades()
      refreshClassCards()
      if (shouldUploadFile && examFile) {
        uploadExamFileAfterSubmit()
      }
    }
  }

  const handleSaveDraft = () => persistGrades('draft')
  const handleSubmit = () => {
    if (!validate()) return
    persistGrades('submitted', true)
  }

  const handleExamFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setExamFileError('')
    const validation = validateExamFile(file)
    if (!validation.valid) {
      setExamFileError(validation.error)
      setExamFile(null)
      return
    }
    setExamFile(file)
  }

  const uploadExamFileAfterSubmit = async () => {
    if (!examFile || !profile?.id) return
    setExamFileUploading(true)
    try {
      await uploadExamFile(examFile, {
        schoolId: profile.school_id,
        subject: selectedSubject,
        examType: 'Combined',
        className: selectedClass,
        term,
        year: Number(year),
        uploadedBy: profile.id,
        uploadedByRole: 'teacher',
      })
      setExamFile(null)
      if (examFileInputRef.current) examFileInputRef.current.value = ''
    } catch (err) {
      console.error('Exam file upload failed:', err)
      setExamFileError('File upload failed: ' + err.message)
    } finally {
      setExamFileUploading(false)
    }
  }

  const handleExcelImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 })
        setGradeForm(prev => {
          const next = { ...prev }
          json.forEach((row, idx) => {
            if (idx === 0 || row.length < 4) return
            const admNo = String(row[0]).trim()
            const s = filteredStudents.find(st => st.admission_number?.trim() === admNo)
            if (!s) return
            const c1 = Number(row[1])
            const c2 = Number(row[2])
            const et = Number(row[3])
            next[s.id] = {
              cat1: !isNaN(c1) && c1 >= 0 && c1 <= 20 ? c1 : '',
              cat2: !isNaN(c2) && c2 >= 0 && c2 <= 20 ? c2 : '',
              et: !isNaN(et) && et >= 0 && et <= 60 ? et : '',
              remarks: '',
              status: 'draft',
            }
          })
          return next
        })
        setDirty(true)
        hasChanges.current = true
      } catch { }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const fieldOrder = ['cat1', 'cat2', 'et', 'remarks']
  const handleKeyDown = (e, studentId, field, index) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const fi = fieldOrder.indexOf(field)
      if (fi < fieldOrder.length - 1) {
        const nextField = fieldOrder[fi + 1]
        const input = document.querySelector(`[data-student="${studentId}"][data-field="${nextField}"]`)
        input?.focus()
      } else {
        const nextRow = e.shiftKey ? index - 1 : index + 1
        if (nextRow >= 0 && nextRow < filteredStudents.length) {
          const next = filteredStudents[nextRow]
          const firstInput = document.querySelector(`[data-student="${next.id}"][data-field="cat1"]`)
          firstInput?.focus()
        }
      }
    }
  }

  const getGradePreview = (studentId) => {
    const g = gradeForm[studentId]
    const total = calcTotal(g)
    if (total === null) return null
    return getCBEGrade(total, selectedClass)
  }

  const statusIcon = (st) => {
    if (st === 'locked') return <span className="me-card-status locked">Locked</span>
    if (st === 'approved') return <span className="me-card-status approved">Approved</span>
    if (st === 'submitted') return <span className="me-card-status submitted">Awaiting</span>
    if (st === 'draft') return <span className="me-card-status draft">Draft</span>
    if (st === 'completed') return <span className="me-card-status completed">Saved</span>
    return <span className="me-card-status pending">Pending</span>
  }

  const handleOpenClass = (className, subjectName) => {
    setSelectedClass(className)
    setSelectedSubject(subjectName)
    setView('entry')
  }

  const handleExport = async (format) => {
    setExporting(true)
    try {
      const studentList = students.filter(s => s.class === selectedClass)
      const gradeMap = {}
      grades.forEach(g => { gradeMap[g.student_id] = g })
      const branding = { logoUrl: school?.logo_url, schoolName: school?.name }
      let blob

      if (format === 'class-sheet') {
        blob = await exportClassMarkSheet({ school, className: selectedClass, subject: selectedSubject, examType: 'Combined', term, year, students: studentList, grades: gradeMap, teacherName, branding })
      } else if (format === 'summary') {
        blob = await exportSubjectSummary({ school, className: selectedClass, subject: selectedSubject, examType: 'Combined', term, year, students: studentList, grades: gradeMap, teacherName, branding })
      } else if (format === 'individual') {
        const swg = studentList.map(s => ({ student: s, grades: grades.filter(g => g.student_id === s.id) })).filter(i => i.grades.length > 0)
        if (swg.length <= 1) {
          if (swg.length === 1) blob = await exportStudentIndividualReport({ school, student: swg[0].student, grades: swg[0].grades, term, year, subjects, branding })
        } else {
          await exportBulkStudentReports({ school, studentsWithGrades: swg, term, year, subjects, branding, onProgress: () => {} })
          setExporting(false); setShowExportModal(false); return
        }
      } else if (format === 'analysis') {
        const cs = { className: selectedClass, subject: selectedSubject, examType: 'Combined', mean: average, highest, lowest, passRate: scores.length > 0 ? ((scores.filter(s => s >= 50).length / scores.length) * 100).toFixed(0) : '0', total: filteredStudents.length, entered: enteredCount, distribution: gradeDist, students: filteredStudents.map(s => ({ name: s.full_name, admission_number: s.admission_number, score: calcTotal(gradeForm[s.id]), grade: gradeForm[s.id] ? gradeDisplay(getCBEGrade(calcTotal(gradeForm[s.id]) || 0, selectedClass)) : '' })) }
        blob = await exportPerformanceAnalysis({ school, classStats: [cs], term, year, branding })
      }

      if (blob) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${selectedSubject}_Combined_${term.replace(/\s/g, '_')}_${year}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) { console.error('Export error:', err) }
    setExporting(false)
    setShowExportModal(false)
  }

  if (loading) return <p className="loading-state">Loading marks entry...</p>

  if (classes.length === 0) {
    return (
      <div className="me-page">
        <div className="me-header"><h2 className="me-title">Marks Entry</h2></div>
        <div className="empty-att">
          <BookOpen size={40} color="#cbd5e1" />
          <p>No classes assigned to you</p>
          <span>Classes appear here once assigned in the timetable</span>
        </div>
      </div>
    )
  }

  return (
    <div className="me-page">
      {/* ── Dashboard View ── */}
      {view === 'dashboard' && (
        <>

          <div className="mk-info">
            <span className="mk-info-pill"><strong>Teacher:</strong> {teacherName}</span>
            <span className="mk-info-pill mk-info-pill--blue"><strong>Term:</strong> {term} {year}</span>
            <span className="mk-info-pill"><strong>Classes:</strong> {classes.length}</span>
          </div>

          <div className="mk-kpi-grid">
            <div className="mk-kpi">
              <div className="mk-kpi-icon mk-kpi-icon--blue"><BookOpen size={20} /></div>
              <div className="mk-kpi-body">
                <p className="mk-kpi-val">{classes.length}</p>
                <p className="mk-kpi-label">My Classes</p>
              </div>
            </div>
            <div className="mk-kpi">
              <div className="mk-kpi-icon mk-kpi-icon--green"><Users size={20} /></div>
              <div className="mk-kpi-body">
                <p className="mk-kpi-val">{students.filter(s => classes.includes(s.class)).length}</p>
                <p className="mk-kpi-label">Students</p>
              </div>
            </div>
            <div className="mk-kpi">
              <div className="mk-kpi-icon mk-kpi-icon--amber"><Clock size={20} /></div>
              <div className="mk-kpi-body">
                <p className="mk-kpi-val">{classCards.filter(c => c.pendingExam).length}</p>
                <p className="mk-kpi-label">Pending Marks</p>
              </div>
            </div>
            <div className="mk-kpi">
              <div className="mk-kpi-icon mk-kpi-icon--purple"><CheckCircle size={20} /></div>
              <div className="mk-kpi-body">
                <p className="mk-kpi-val">{classCards.filter(c => !c.pendingExam).length}</p>
                <p className="mk-kpi-label">Completed</p>
              </div>
            </div>
          </div>

          {classes.map(cls => {
            const clsCards = classCards.filter(c => c.className === cls)
            const isOpen = expandedClass === cls
            return (
              <div key={cls} className="mk-class">
                <div className="mk-class-hdr" onClick={() => setExpandedClass(isOpen ? null : cls)}>
                  <div className="mk-class-hdr-left">
                    <div className="mk-class-icon"><BookOpen size={17} /></div>
                    <div className="mk-class-info">
                      <h3 className="mk-class-name">{cls}</h3>
                      <p className="mk-class-meta">{clsCards.length} subject{clsCards.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className={`mk-chevron ${isOpen ? 'mk-chevron--open' : ''}`} />
                </div>
                <div className={`mk-body-wrap ${isOpen ? 'mk-body-wrap--open' : ''}`}>
                  <div className="mk-body">
                    <div className="mk-subj-grid">
                      {clsCards.map(card => {
                        const allApproved = examTypeConfig.every(et => card.examStatuses[et.name] === 'approved')
                        return (
                          <div key={`${card.className}-${card.subjectName}`} className="mk-subj">
                            <div className="mk-subj-top">
                              <span className="mk-subj-name">{card.subjectName}</span>
                              <span className={`mk-badge ${allApproved ? 'mk-badge--approved' : 'mk-badge--pending'}`}>
                                {allApproved ? 'Approved' : 'Pending'}
                              </span>
                            </div>
                            <div className="mk-subj-body">
                              <div className="mk-subj-stat"><Users size={12} /> {card.studentCount} Students</div>
                              <div className="mk-subj-comps">
                                {examTypeConfig.map(et => {
                                  const st = card.examStatuses[et.name]
                                  const mean = card.examStatuses[`${et.name}_mean`]
                                  const clsName = st === 'approved' ? 'mk-subj-comp--approved'
                                    : st === 'submitted' ? 'mk-subj-comp--submitted'
                                    : st === 'draft' ? 'mk-subj-comp--draft'
                                    : st === 'completed' ? 'mk-subj-comp--completed'
                                    : 'mk-subj-comp--pending'
                                  return (
                                    <span key={et.name} className={`mk-subj-comp ${clsName}`} title={`${et.name}: ${st}${mean ? ` (${mean}%)` : ''}`}>
                                      {et.name === 'End Term' ? 'ET' : et.name.replace('CAT ', 'C')}
                                    </span>
                                  )
                                })}
                              </div>
                            </div>
                            <div className="mk-subj-actions">
                              <button className="mk-btn mk-btn--primary" onClick={() => handleOpenClass(card.className, card.subjectName)}>
                                {card.pendingExam ? 'Enter Marks' : 'View'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* ── Marks Entry ── */}
      {view === 'entry' && (
        <>
          <div className="me-breadcrumb">
            <button className="me-bc-link" onClick={() => setView('dashboard')}><ArrowLeft size={14} /> Classes</button>
            <ChevronRight size={14} className="me-bc-sep" />
            <span className="me-bc-current">{selectedClass}</span>
            <ChevronRight size={14} className="me-bc-sep" />
            <span className="me-bc-current">{selectedSubject}</span>
          </div>

          <div className="me-header">
            <h2 className="me-title"><FileText size={20} /> Combined Marks Entry</h2>
            <div className="me-header-meta">
              <span><strong>Year:</strong> {year}</span>
              <span><strong>Term:</strong> {term}</span>
              <span><strong>Teacher:</strong> {teacherName}</span>
              <span><strong>Subject:</strong> {selectedSubject}</span>
              <span><strong>Class:</strong> {selectedClass}</span>
            </div>
          </div>

          <div className="me-filters">
            <select className="me-filter-select" value={year} onChange={e => setYear(e.target.value)}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="me-filter-select" value={term} onChange={e => setTerm(e.target.value)}>
              {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="me-filter-select" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="me-filter-select" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
              {[...(classSubjectRef.current[selectedClass] || [])].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="me-search-wrap">
              <Search size={14} className="me-search-icon" />
              <input className="me-search-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="me-progress-wrap">
            <div className="me-progress-bar">
              <div className="me-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="me-progress-label">{enteredCount} / {filteredStudents.length} Students ({progressPct}%)</span>
          </div>

          <div className="me-summary-strip">
            <div className="me-summary-item"><Users size={15} /> Students: <strong>{filteredStudents.length}</strong></div>
            <div className="me-summary-item"><CheckCircle size={15} /> Entered: <strong>{enteredCount}</strong></div>
            <div className="me-summary-item"><AlertCircle size={15} /> Missing: <strong>{missingCount}</strong></div>
            <div className="me-summary-item"><BarChart3 size={15} /> Avg: <strong>{average}{average !== '—' ? '%' : ''}</strong></div>
            <div className="me-summary-item">
              <Clock size={15} /> <span style={{ color: overallStatus.color, fontWeight: 700 }}>{overallStatus.label}</span>
            </div>
            {lastSaved && <div className="me-summary-item" style={{ color: '#64748b', fontSize: 12 }}>Saved: {lastSaved.toLocaleTimeString()}</div>}
          </div>

          <div className="me-tabs">
            <button className={`me-tab ${activeTab === 'entry' ? 'active' : ''}`} onClick={() => setActiveTab('entry')}>
              <BookOpen size={14} /> Marks Entry
            </button>
            <button className={`me-tab ${activeTab === 'analysis' ? 'active' : ''}`} onClick={() => setActiveTab('analysis')}>
              <BarChart3 size={14} /> Analysis
            </button>
            <button className={`me-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
              <History size={14} /> History
            </button>
            <button className={`me-tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => { setActiveTab('audit'); fetchAuditLogs() }}>
              <ShieldCheck size={14} /> Audit Log
            </button>
          </div>

          {activeTab === 'entry' && (
            <>
              <div className="me-two-col">
                <div className="me-grid-panel">
                  <div className="att-table-wrap">
                    <table className="me-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>#</th>
                          <th>Student</th>
                          <th style={{ width: 110 }}>Adm No.</th>
                           <th style={{ width: 80 }}>CAT 1 ({getMax('CAT 1')})</th>
                           <th style={{ width: 80 }}>CAT 2 ({getMax('CAT 2')})</th>
                           <th style={{ width: 80 }}>End Term ({getMax('End Term')})</th>
                          <th style={{ width: 70 }}>Total (100)</th>
                          <th style={{ width: 70 }}>Grade</th>
                          <th style={{ width: 100 }}>Remarks</th>
                          <th style={{ width: 90 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.map((s, i) => {
                          const g = gradeForm[s.id]
                          const total = calcTotal(g)
                          const preview = total !== null ? getCBEGrade(total, selectedClass) : null
                          const hasError = errors[s.id]
                          const isMissing = !g || (!g.cat1 && !g.cat2 && !g.et)
                          const st = g?.status || (isMissing ? 'missing' : 'draft')
                          return (
                            <tr key={s.id} className={hasError ? 'me-row-error' : ''}>
                              <td className="me-muted">{i + 1}</td>
                              <td>
                                <div className="me-student-cell">
                                  <div className="me-avatar">{s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                                  {s.full_name}
                                </div>
                              </td>
                              <td className="me-adm">{s.admission_number || '—'}</td>
                              <td>
                                <div className="me-input-wrap">
                                  <input type="number" className={`me-input ${hasError ? 'me-input-error' : ''} ${g?.cat1 !== '' && g?.cat1 !== undefined ? 'me-input-filled' : ''}`}
                                    min="0" max="20" value={g?.cat1 ?? ''}
                                    onChange={e => updateGrade(s.id, 'cat1', e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, s.id, 'cat1', i)}
                                    data-student={s.id} data-field="cat1" placeholder="—" disabled={isLocked} />
                                </div>
                              </td>
                              <td>
                                <div className="me-input-wrap">
                                  <input type="number" className={`me-input ${hasError ? 'me-input-error' : ''} ${g?.cat2 !== '' && g?.cat2 !== undefined ? 'me-input-filled' : ''}`}
                                    min="0" max="20" value={g?.cat2 ?? ''}
                                    onChange={e => updateGrade(s.id, 'cat2', e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, s.id, 'cat2', i)}
                                    data-student={s.id} data-field="cat2" placeholder="—" disabled={isLocked} />
                                </div>
                              </td>
                              <td>
                                <div className="me-input-wrap">
                                  <input type="number" className={`me-input ${hasError ? 'me-input-error' : ''} ${g?.et !== '' && g?.et !== undefined ? 'me-input-filled' : ''}`}
                                    min="0" max="60" value={g?.et ?? ''}
                                    onChange={e => updateGrade(s.id, 'et', e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, s.id, 'et', i)}
                                    data-student={s.id} data-field="et" placeholder="—" disabled={isLocked} />
                                </div>
                              </td>
                              <td style={{ fontWeight: 700, fontSize: 14 }}>{total !== null ? total : '—'}</td>
                              <td>
                                {preview ? <span className={`cbe-badge ${preview.color}`}>{gradeDisplay(preview)}</span> : <span className="me-muted">—</span>}
                              </td>
                              <td>
                                <input type="text" className="me-input me-remarks-input"
                                  value={g?.remarks ?? ''}
                                  onChange={e => updateGrade(s.id, 'remarks', e.target.value)}
                                  onKeyDown={e => handleKeyDown(e, s.id, 'remarks', i)}
                                  data-student={s.id} data-field="remarks" placeholder="Auto" disabled={isLocked} />
                              </td>
                              <td>
                                {st === 'missing' ? <span className="me-status-dot" style={{ background: '#f59e0b', color: '#fff' }}>Missing</span>
                                  : st === 'submitted' ? <span className="me-status-dot" style={{ background: '#2563eb', color: '#fff' }}>Saved</span>
                                  : st === 'approved' ? <span className="me-status-dot" style={{ background: '#16a34a', color: '#fff' }}>Approved</span>
                                  : <span className="me-status-dot" style={{ background: '#d97706', color: '#fff' }}>Draft</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="me-summary-panel">
                  <h3 className="me-sp-title">Class Summary</h3>
                  <div className="me-sp-stats">
                    <div className="me-sp-row"><span>Students</span><strong>{filteredStudents.length}</strong></div>
                    <div className="me-sp-row"><span>Entered</span><strong style={{ color: '#16a34a' }}>{enteredCount}</strong></div>
                    <div className="me-sp-row"><span>Missing</span><strong style={{ color: '#dc2626' }}>{missingCount}</strong></div>
                    <div className="me-sp-divider" />
                    <div className="me-sp-row"><span>Highest</span><strong>{highest}{highest !== '—' ? '/100' : ''}</strong></div>
                    <div className="me-sp-row"><span>Lowest</span><strong>{lowest}{lowest !== '—' ? '/100' : ''}</strong></div>
                    <div className="me-sp-row"><span>Average</span><strong>{average}{average !== '—' ? '%' : ''}</strong></div>
                    <div className="me-sp-row"><span>Pass Rate</span><strong style={{ color: '#2563eb' }}>{scores.length > 0 ? `${((scores.filter(s => s >= 50).length / scores.length) * 100).toFixed(0)}%` : '—'}</strong></div>
                  </div>
                  <div className="me-sp-divider" />
                  <h4 className="me-sp-subtitle">Grade Distribution</h4>
                  <div className="me-sp-dist">
                    {GRADE_LABELS.map(grade => {
                      const count = gradeDist[grade] || 0
                      const pct = maxGradeCount > 0 ? (count / maxGradeCount) * 100 : 0
                      return (
                        <div key={grade} className="me-sp-dist-row">
                          <span className="me-sp-dist-label">{grade}</span>
                          <div className="me-sp-dist-bar-wrap"><div className="me-sp-dist-bar" style={{ width: `${pct}%` }} /></div>
                          <span className="me-sp-dist-count">{count}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="me-actions">
                <div className="me-actions-left">
                  <input type="file" accept=".xlsx,.xls" ref={fileInputRef} onChange={handleExcelImport} style={{ display: 'none' }} />
                  <button className="me-btn me-btn-outline" onClick={() => fileInputRef.current?.click()} disabled={saving || isLocked}>
                    <FileSpreadsheet size={14} /> Import Excel
                  </button>
                  <button className="me-btn me-btn-outline" onClick={() => setShowExportModal(true)} disabled={exporting || enteredCount === 0}>
                    <Download size={14} /> {exporting ? 'Exporting...' : 'Export PDF'}
                  </button>
                  <input type="file" accept=".pdf,.doc,.docx" ref={examFileInputRef} onChange={handleExamFileSelect} style={{ display: 'none' }} />
                  <button className="me-btn me-btn-outline" onClick={() => examFileInputRef.current?.click()} disabled={saving || isLocked || examFileUploading}>
                    <FileText size={14} /> {examFile ? examFile.name : 'Attach Exam Paper'}
                  </button>
                  {examFile && (
                    <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={13} /> {examFile.name}
                      <button onClick={() => { setExamFile(null); setExamFileError(''); if (examFileInputRef.current) examFileInputRef.current.value = '' }}
                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0, fontSize: 12 }}>✕</button>
                    </span>
                  )}
                  {examFileError && <span style={{ fontSize: 12, color: '#dc2626' }}>{examFileError}</span>}
                  {examFileUploading && <span style={{ fontSize: 12, color: '#2563eb' }}>Uploading paper...</span>}
                </div>
                <div className="me-actions-right">
                  <button className="me-btn me-btn-outline" onClick={handleSaveDraft} disabled={saving || !dirty || isLocked}>
                    <Save size={14} /> {saving ? 'Saving...' : 'Save Draft'}
                  </button>
                  <button className="me-btn me-btn-primary" onClick={handleSubmit} disabled={saving || isLocked || examFileUploading}>
                    {saved ? <><CheckCircle size={15} /> Saved</> : <><Send size={15} /> {saving ? 'Submitting...' : 'Submit for Approval'}</>}
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === 'analysis' && (
            <div className="me-analysis">
              <div className="me-analysis-grid">
                <div className="me-analysis-card"><h4>Mean Score</h4><div className="me-analysis-big">{average}{average !== '—' ? '%' : ''}</div></div>
                <div className="me-analysis-card"><h4>Highest</h4><div className="me-analysis-big" style={{ color: '#16a34a' }}>{highest}{highest !== '—' ? '%' : ''}</div></div>
                <div className="me-analysis-card"><h4>Lowest</h4><div className="me-analysis-big" style={{ color: '#dc2626' }}>{lowest}{lowest !== '—' ? '%' : ''}</div></div>
                <div className="me-analysis-card"><h4>Pass Rate</h4><div className="me-analysis-big" style={{ color: '#2563eb' }}>{scores.length > 0 ? `${((scores.filter(s => s >= 50).length / scores.length) * 100).toFixed(0)}%` : '—'}</div></div>
              </div>
              <div className="me-analysis-card" style={{ marginTop: 16 }}>
                <h4>Grade Distribution</h4>
                <div className="me-analysis-bars">
                  {GRADE_LABELS.map(grade => {
                    const count = gradeDist[grade] || 0
                    const pct = filteredStudents.length > 0 ? (count / filteredStudents.length) * 100 : 0
                    return (
                      <div key={grade} className="me-analysis-bar-col">
                        <span className="me-analysis-bar-val">{count}</span>
                        <div className="me-analysis-bar"><div className="me-analysis-bar-fill" style={{ height: `${pct}%` }} /></div>
                        <span className="me-analysis-bar-lbl">{grade}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="me-history">
              <div className="me-history-card">
                <h4>Saved Records — {selectedSubject} ({selectedClass})</h4>
                {grades.length === 0 ? (
                  <div className="me-history-empty">No records found.</div>
                ) : (
                  <div className="att-table-wrap">
                    <table className="me-table">
                      <thead><tr><th>Student</th><th>Exam</th><th>Marks</th><th>Grade</th><th>Status</th></tr></thead>
                      <tbody>
                        {grades.slice(0, 50).map(g => (
                          <tr key={g.id}>
                            <td style={{ fontWeight: 500 }}>{g.students?.full_name || '—'}</td>
                            <td>{g.exam_type || '—'}</td>
                            <td>{g.total_score ?? '—'}%</td>
                            <td><span className={`cbe-badge ${g.cbe_band || ''}`}>{g.grade || '—'}</span></td>
                            <td><span className="me-status-dot" style={{ background: g.status === 'approved' ? '#16a34a' : g.status === 'submitted' ? '#2563eb' : '#d97706', color: '#fff' }}>{g.status || '—'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="me-audit">
              <div className="me-history-card">
                <h4>Audit Trail — Recent Activity</h4>
                {auditLogs.length === 0 ? (
                  <div className="me-history-empty">No audit records yet.</div>
                ) : (
                  <div className="att-table-wrap">
                    <table className="me-table">
                      <thead><tr><th>Action</th><th>Performed By</th><th>Date</th><th>Details</th></tr></thead>
                      <tbody>
                        {auditLogs.map(log => (
                          <tr key={log.id}>
                            <td><span className="me-status-dot" style={{ background: '#6366f1', color: '#fff' }}>{log.action}</span></td>
                            <td>{log.performed_by || '—'}</td>
                            <td>{log.performed_at ? new Date(log.performed_at).toLocaleString() : '—'}</td>
                            <td style={{ fontSize: 12, color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.details || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Export Modal ── */}
      {showExportModal && (
        <div className="me-modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="me-modal" onClick={e => e.stopPropagation()}>
            <div className="me-modal-header">
              <h3><Download size={16} /> Export Options</h3>
              <button className="me-modal-close" onClick={() => setShowExportModal(false)}>×</button>
            </div>
            <div className="me-modal-body">
              <div className="me-modal-info">{selectedClass} · {selectedSubject} · {examTypeConfig.map(e => e.name).join('+')} · {term} {year}</div>
              <div className="me-export-options">
                <label className={`me-export-option ${exportFormat === 'class-sheet' ? 'active' : ''}`}>
                  <input type="radio" name="export-format" value="class-sheet" checked={exportFormat === 'class-sheet'} onChange={e => setExportFormat(e.target.value)} />
                  <div className="me-export-option-content"><strong>Class Mark Sheet</strong><span>Student list with marks, grades, summary</span></div>
                </label>
                <label className={`me-export-option ${exportFormat === 'summary' ? 'active' : ''}`}>
                  <input type="radio" name="export-format" value="summary" checked={exportFormat === 'summary'} onChange={e => setExportFormat(e.target.value)} />
                  <div className="me-export-option-content"><strong>Subject Summary Report</strong><span>Mean, distribution, ranking</span></div>
                </label>
                <label className={`me-export-option ${exportFormat === 'analysis' ? 'active' : ''}`}>
                  <input type="radio" name="export-format" value="analysis" checked={exportFormat === 'analysis'} onChange={e => setExportFormat(e.target.value)} />
                  <div className="me-export-option-content"><strong>Performance Analysis</strong><span>Detailed breakdown with distribution</span></div>
                </label>
                <label className={`me-export-option ${exportFormat === 'individual' ? 'active' : ''}`}>
                  <input type="radio" name="export-format" value="individual" checked={exportFormat === 'individual'} onChange={e => setExportFormat(e.target.value)} />
                  <div className="me-export-option-content"><strong>Student Reports</strong><span>Individual PDFs (bulk ZIP)</span></div>
                </label>
              </div>
            </div>
            <div className="me-modal-footer">
              <button className="me-btn me-btn-outline" onClick={() => setShowExportModal(false)}>Cancel</button>
              <button className="me-btn me-btn-primary" onClick={() => handleExport(exportFormat)} disabled={exporting}>
                {exporting ? 'Generating...' : 'Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
