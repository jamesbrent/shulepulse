import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Search, Users, BookOpen, BarChart3, History, ShieldCheck,
  ArrowLeft, ChevronRight, Download, Award, AlertCircle,
  CheckCircle, Clock, TrendingUp, FileText,
  Activity, Target,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getGrade, sortBands, weightedScoreMean, sortExamTypes } from '../../services/grading'
import { useExamTypeConfig } from '../../hooks/useSchoolConfig'
import {
  exportClassMarkSheet,
  exportSubjectSummary,
  exportPerformanceAnalysis,
  exportStudentIndividualReport,
  exportBulkStudentReports,
} from '../../utils/teacherPdfExport'
import './GradesPage.css'

const TERMS = ['Term 1', 'Term 2', 'Term 3']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

export default function GradesPage({ profile }) {
  const { examTypes: examTypeConfig, loading: examTypesLoading } = useExamTypeConfig()
  const [loading, setLoading] = useState(true)
  const [teachers, setTeachers] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [teacherName, setTeacherName] = useState('')
  const [teacherRec, setTeacherRec] = useState(null)
  const [school, setSchool] = useState(null)
  const [classCards, setClassCards] = useState([])
  const classSubjectRef = useRef({})

  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedExamType, setSelectedExamType] = useState('')
  const [term, setTerm] = useState(TERMS[1])
  const [year, setYear] = useState(String(CURRENT_YEAR))

  const [view, setView] = useState('dashboard')
  const [analyticsData, setAnalyticsData] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportFormat, setExportFormat] = useState('summary')

  useEffect(() => {
    if (!profile?.school_id) return
    fetchData()
  }, [profile])

  useEffect(() => {
    if (view === 'analytics' && selectedClass && selectedSubject) {
      fetchAnalytics()
    }
  }, [view, selectedClass, selectedSubject, selectedExamType, term, year])

  const fetchData = async () => {
    setLoading(true)
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
    setClasses(uniqueClasses)
    setSubjects(subs || [])
    if (uniqueClasses.length > 0) setSelectedClass(uniqueClasses[0])
    if (uniqueClasses.length > 0) {
      const firstSubjects = [...(classSubjects[uniqueClasses[0]] || [])]
      if (firstSubjects.length > 0) setSelectedSubject(firstSubjects[0])
    }

    await buildClassCards(schoolId, classSubjects)
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
      .select('class_name, subject, exam_type, status, total_score, max_marks, updated_at')
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
        let allRows = []
        let latestUpdate = null
        const examTypeNames = examTypeConfig.map(e => e.name)
        examTypeNames.forEach(et => {
          const etGrades = existingGrades.filter(g => g.exam_type === et)
          const statuses = etGrades.map(g => g.status)
          if (statuses.includes('approved')) examStatuses[et] = 'locked'
          else if (statuses.includes('submitted')) examStatuses[et] = 'submitted'
          else if (etGrades.some(s => s.status === 'draft')) examStatuses[et] = 'draft'
          else if (etGrades.length > 0) examStatuses[et] = 'completed'
          else examStatuses[et] = 'pending'
          const scores = etGrades.map(g => Number(g.total_score)).filter(s => !isNaN(s))
          examStatuses[`${et}_mean`] = scores.length > 0
            ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
            : null
          etGrades.forEach(g => {
            if (!isNaN(Number(g.total_score))) allRows.push(g)
            if (g.updated_at && (!latestUpdate || g.updated_at > latestUpdate))
              latestUpdate = g.updated_at
          })
        })
        const overallMean = allRows.length > 0
          ? weightedScoreMean(allRows).toFixed(1)
          : null
        return {
          className, subjectName,
          studentCount: rawCounts[className.trim().toLowerCase()] || 0,
          examStatuses,
          overallMean,
          pendingExam: examTypeNames.find(et => examStatuses[et] === 'pending') || null,
          lastUpdated: latestUpdate,
        }
      })
    )
    setClassCards(cards)
  }

  const refreshClassCards = async () => {
    if (!teacherRec || !profile?.school_id) return
    await buildClassCards(profile.school_id, classSubjectRef.current)
  }

  const fetchAnalytics = async () => {
    const { data } = await supabase
      .from('grades')
      .select('*, students!inner(full_name, admission_number)')
      .eq('school_id', profile.school_id)
      .eq('class_name', selectedClass)
      .eq('subject', selectedSubject)
      .eq('exam_type', selectedExamType)
      .eq('term', term)
      .eq('year', Number(year))

    const gradesList = data || []
    const studentGrades = gradesList.map(g => ({
      name: g.students?.full_name || '—',
      adm: g.students?.admission_number || '—',
      score: g.total_score,
      grade: g.grade || '—',
      status: g.status || '—',
    }))

    const scores = gradesList.map(g => Number(g.total_score)).filter(s => !isNaN(s))
    const mean = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—'
    const highest = scores.length > 0 ? Math.max(...scores) : '—'
    const lowest = scores.length > 0 ? Math.min(...scores) : '—'
    const passCount = scores.filter(s => s >= 50).length
    const passRate = scores.length > 0 ? ((passCount / scores.length) * 100).toFixed(0) : '—'

    const dist = {}
    gradesList.forEach(g => {
      const band = getGrade(Number(g.total_score), selectedClass).band || '—'
      dist[band] = (dist[band] || 0) + 1
    })
    const distBands = sortBands(Object.keys(dist))

    const ranked = [...studentGrades].filter(s => s.score !== null && s.score !== undefined).sort((a, b) => Number(b.score) - Number(a.score))

    setAnalyticsData({
      gradesList,
      studentGrades,
      scores,
      mean,
      highest,
      lowest,
      passCount,
      passRate,
      dist,
      distBands,
      ranked,
      totalStudents: scores.length,
    })
  }

  const handleViewAnalytics = (className, subjectName) => {
    setSelectedClass(className)
    setSelectedSubject(subjectName)
    setSelectedExamType(examTypeConfig[0]?.name || '')
    setView('analytics')
  }

  const handleExport = async (format) => {
    setExporting(true)
    try {
      const { data: studentsData } = await supabase
        .from('students')
        .select('id, full_name, class, admission_number')
        .eq('school_id', profile.school_id)
        .eq('class', selectedClass)
        .eq('status', 'active')
        .order('full_name')

      const gradeMap = {}
      if (analyticsData?.gradesList) {
        analyticsData.gradesList.forEach(g => { gradeMap[g.student_id] = g })
      }

      const branding = { logoUrl: school?.logo_url, schoolName: school?.name }
      let blob

      if (format === 'class-sheet') {
        blob = await exportClassMarkSheet({
          school, className: selectedClass, subject: selectedSubject,
          examType: selectedExamType, term, year,
          students: studentsData || [], grades: gradeMap,
          teacherName, branding,
        })
      } else if (format === 'summary') {
        blob = await exportSubjectSummary({
          school, className: selectedClass, subject: selectedSubject,
          examType: selectedExamType, term, year,
          students: studentsData || [], grades: gradeMap,
          teacherName, branding,
        })
      } else if (format === 'analysis') {
        const classStat = {
          className: selectedClass, subject: selectedSubject, examType: selectedExamType,
          mean: analyticsData?.mean || '—', highest: analyticsData?.highest || '—',
          lowest: analyticsData?.lowest || '—', passRate: analyticsData?.passRate || '—',
          total: analyticsData?.totalStudents || 0, entered: analyticsData?.scores?.length || 0,
          distribution: analyticsData?.dist || {},
          students: analyticsData?.ranked?.map(s => ({ name: s.name, admission_number: s.adm, score: s.score, grade: s.grade })) || [],
        }
        blob = await exportPerformanceAnalysis({
          school, classStats: [classStat], term, year, branding,
        })
      } else if (format === 'individuals') {
        const studentsWithGrades = (studentsData || []).map(s => ({
          student: s,
          grades: analyticsData?.gradesList?.filter(g => g.student_id === s.id) || [],
        })).filter(item => item.grades.length > 0)

        if (studentsWithGrades.length <= 1) {
          if (studentsWithGrades.length === 1) {
            blob = await exportStudentIndividualReport({
              school, student: studentsWithGrades[0].student,
              grades: studentsWithGrades[0].grades, term, year, subjects, branding,
            })
          }
        } else {
          await exportBulkStudentReports({
            school, studentsWithGrades, term, year, subjects, branding,
            onProgress: () => {},
          })
          setExporting(false)
          setShowExportModal(false)
          return
        }
      }

      if (blob) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${selectedSubject}_${selectedExamType.replace(/\s/g, '_')}_${term.replace(/\s/g, '_')}_${year}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Export error:', err)
    }
    setExporting(false)
    setShowExportModal(false)
  }

  const { completedCards, progressCards, pendingCards } = useMemo(() => {
    const c = [], p = [], n = []
    classCards.forEach(card => {
      const statuses = examTypeConfig.map(et => card.examStatuses[et.name])
      const anyPending = statuses.some(s => s === 'pending')
      if (anyPending) n.push(card)
      else if (statuses.every(s => s === 'locked' || s === 'approved')) c.push(card)
      else p.push(card)
    })
    return { completedCards: c, progressCards: p, pendingCards: n }
  }, [classCards])

  const overallStats = useMemo(() => {
    const means = classCards.map(c => c.overallMean).filter(m => m !== null).map(Number)
    const totalStudents = classCards.reduce((sum, c) => sum + c.studentCount, 0)
    return {
      totalClasses: classes.length,
      completedCount: completedCards.length,
      pendingCount: pendingCards.length,
      inProgressCount: progressCards.length,
      overallMean: means.length > 0
        ? (means.reduce((a, b) => a + b, 0) / means.length).toFixed(1)
        : null,
      totalStudents,
    }
  }, [classCards, classes, completedCards, pendingCards, progressCards])

  const activityFeed = useMemo(() => {
    const items = []
    classCards.forEach(card => {
      examTypeConfig.forEach(et => {
        const st = card.examStatuses[et.name]
        if (st === 'locked' || st === 'approved') {
          items.push({
            type: 'approved',
            message: `${card.subjectName} — ${et} approved`,
            className: card.className,
          })
        } else if (st === 'submitted') {
          items.push({
            type: 'submitted',
            message: `${card.subjectName} — ${et} submitted`,
            className: card.className,
          })
        } else if (st === 'draft') {
          items.push({
            type: 'draft',
            message: `${card.subjectName} — ${et} in progress`,
            className: card.className,
          })
        }
      })
    })
    return items.slice(0, 12)
  }, [classCards])

  const progressForCard = (card) => {
    const examTypeNames = examTypeConfig.map(e => e.name)
    const done = examTypeNames.filter(et =>
      card.examStatuses[et] === 'locked' || card.examStatuses[et] === 'approved'
    ).length
    return { done, total: examTypeNames.length, pct: Math.round((done / examTypeNames.length) * 100) }
  }

  const progressBarClass = (pct) => {
    if (pct >= 80) return 'gd-progress-fill--ok'
    if (pct >= 40) return 'gd-progress-fill--mid'
    return 'gd-progress-fill--bad'
  }

  const progressLabelClass = (pct) => {
    if (pct >= 80) return 'gd-progress-label--ok'
    if (pct >= 40) return 'gd-progress-label--mid'
    return 'gd-progress-label--bad'
  }

  const renderSection = (title, icon, cards, countClass) => {
    if (cards.length === 0) return null
    const grouped = {}
    cards.forEach(c => {
      if (!grouped[c.className]) grouped[c.className] = []
      grouped[c.className].push(c)
    })

    return (
      <div className="gd-section">
        <div className="gd-section-hdr">
          <h3>
            {icon} {title}
            <span className={`gd-section-count gd-section-count--${countClass}`}>{cards.length}</span>
          </h3>
        </div>
        {Object.entries(grouped).map(([cls, clsCards]) => (
          <div key={cls} className="gd-panel">
            <div className="gd-panel-hdr">
              <h4 className="gd-panel-title"><BookOpen size={14} /> {cls}</h4>
              <span className="gd-pill gd-pill--gray">{clsCards.length} subjects</span>
            </div>
            {clsCards.map(card => {
              const prog = progressForCard(card)
              return (
                <div key={`${card.className}-${card.subjectName}`} className="gd-row">
                  <div className="gd-row-subj">
                    <span>{card.subjectName}</span>
                  </div>
                  <div className="gd-row-stat"><Users size={12} /> {card.studentCount}</div>
                  <div className="gd-row-stat"><strong>{card.overallMean ?? '—'}%</strong></div>
                  <div className="gd-progress">
                    <div className="gd-progress-bar">
                      <div className={`gd-progress-fill ${progressBarClass(prog.pct)}`} style={{ width: `${prog.pct}%` }} />
                    </div>
                    <span className={`gd-progress-label ${progressLabelClass(prog.pct)}`}>{prog.done}/{prog.total}</span>
                  </div>
                  <div>
                    {sortExamTypes(examTypeConfig).map(et => {
                      const st = card.examStatuses[et.name]
                      return (
                        <span key={et.name} className="gd-pill" style={{ marginRight: 4, marginBottom: 2 }}>
                          {et.name === 'End Term' ? 'ET' : et.name.replace('CAT ', 'C')}
                          {st === 'locked' || st === 'approved' ? ' \u2713' : st === 'submitted' ? ' \u27F3' : ' \u25CB'}
                        </span>
                      )
                    })}
                  </div>
                  <div className="gd-actions">
                    <button className="gd-btn gd-btn--secondary gd-btn--sm" onClick={() => handleViewAnalytics(card.className, card.subjectName)}>
                      <BarChart3 size={12} /> Analytics
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  if (loading) return (
    <div className="gd-load">
      <div className="gd-spin" />
      <span>Loading grades...</span>
    </div>
  )

  if (classes.length === 0) {
    return (
      <div className="gd-dash">
        <div className="empty-att">
          <BookOpen size={40} color="#cbd5e1" />
          <p>No classes assigned to you</p>
          <span>Classes appear here once assigned in the timetable</span>
        </div>
      </div>
    )
  }

  return (
    <div className="gd-dash">

      {view === 'dashboard' && (
        <>

          <div className="gd-status">
            <span className="gd-pill gd-pill--blue"><Award size={12} /> {teacherName}</span>
            <span className="gd-pill gd-pill--green"><Clock size={12} /> {term} {year}</span>
            <span className="gd-pill gd-pill--purple"><Users size={12} /> {classes.length} Classes</span>
            <span className="gd-pill gd-pill--amber"><Target size={12} /> {overallStats.totalStudents} Students</span>
          </div>

          <div className="gd-kpi-grid">
            <div className="gd-kpi">
              <div className="gd-kpi-top">
                <div>
                  <p className="gd-kpi-val">{classes.length}</p>
                  <p className="gd-kpi-label">My Classes</p>
                </div>
                <div className="gd-kpi-icon gd-kpi-icon--blue"><BookOpen size={20} /></div>
              </div>
              <p className="gd-kpi-sub">{subjects.length} subjects across {classes.length} classes</p>
            </div>
            <div className="gd-kpi">
              <div className="gd-kpi-top">
                <div>
                  <p className="gd-kpi-val">{overallStats.completedCount}</p>
                  <p className="gd-kpi-label">Completed</p>
                </div>
                <div className="gd-kpi-icon gd-kpi-icon--green"><CheckCircle size={20} /></div>
              </div>
              <p className="gd-kpi-sub">All exams locked or approved</p>
            </div>
            <div className="gd-kpi">
              <div className="gd-kpi-top">
                <div>
                  <p className="gd-kpi-val">{overallStats.inProgressCount + overallStats.pendingCount}</p>
                  <p className="gd-kpi-label">In Progress</p>
                </div>
                <div className="gd-kpi-icon gd-kpi-icon--amber"><Clock size={20} /></div>
              </div>
              <p className="gd-kpi-sub">{overallStats.pendingCount} need attention</p>
            </div>
            <div className="gd-kpi">
              <div className="gd-kpi-top">
                <div>
                  <p className="gd-kpi-val">{overallStats.overallMean ?? '—'}%</p>
                  <p className="gd-kpi-label">Overall Mean</p>
                </div>
                <div className="gd-kpi-icon gd-kpi-icon--purple"><TrendingUp size={20} /></div>
              </div>
              <p className="gd-kpi-sub">Across all subjects</p>
            </div>
          </div>

          <div className="gd-layout">
            <div className="gd-main">
              {renderSection('Needs Attention', <AlertCircle size={15} />, pendingCards, 'red')}
              {renderSection('In Progress', <Clock size={15} />, progressCards, 'amber')}
              {renderSection('Completed', <CheckCircle size={15} />, completedCards, 'green')}
            </div>

            <div className="gd-sidebar">
              <div className="gd-card">
                <div className="gd-card-hdr">
                  <Activity size={16} color="#2563EB" />
                  <h4>Recent Activity</h4>
                </div>
                {activityFeed.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>No activity yet</p>
                ) : (
                  <div className="gd-feed">
                    {activityFeed.map((item, i) => (
                      <div key={i} className="gd-feed-item">
                        <div className={`gd-feed-dot gd-feed-dot--${item.type === 'approved' ? 'green' : item.type === 'submitted' ? 'blue' : 'amber'}`} />
                        <div className="gd-feed-text">
                          <div className="gd-feed-msg">{item.message}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.className}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="gd-card">
                <div className="gd-card-hdr">
                  <BarChart3 size={16} color="#7C3AED" />
                  <h4>Performance Snapshot</h4>
                </div>
                <div className="gd-snap-grid">
                  <div className="gd-snap-row">
                    <span className="gd-snap-label">Overall Mean</span>
                    <span className={`gd-snap-val ${overallStats.overallMean !== null ? (Number(overallStats.overallMean) >= 50 ? 'gd-snap-val--high' : 'gd-snap-val--low') : ''}`}>
                      {overallStats.overallMean ?? '—'}%
                    </span>
                  </div>
                  <div className="gd-snap-row">
                    <span className="gd-snap-label">Subjects</span>
                    <span className="gd-snap-val gd-snap-val--high">{classCards.length}</span>
                  </div>
                  <div className="gd-snap-row">
                    <span className="gd-snap-label">Total Students</span>
                    <span className="gd-snap-val gd-snap-val--high">{overallStats.totalStudents}</span>
                  </div>
                  <div className="gd-snap-divider" />
                  <div className="gd-snap-row">
                    <span className="gd-snap-label">Completed</span>
                    <span className="gd-snap-val gd-snap-val--high">{overallStats.completedCount}</span>
                  </div>
                  <div className="gd-snap-row">
                    <span className="gd-snap-label">In Progress</span>
                    <span className="gd-snap-val gd-snap-val--mid">{overallStats.inProgressCount}</span>
                  </div>
                  <div className="gd-snap-row">
                    <span className="gd-snap-label">Needs Attention</span>
                    <span className="gd-snap-val gd-snap-val--low">{overallStats.pendingCount}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {view === 'analytics' && (
        <>

          <div className="me-breadcrumb">
            <button className="me-bc-link" onClick={() => { setView('dashboard'); setAnalyticsData(null) }}>
              <ArrowLeft size={14} /> Dashboard
            </button>
            <ChevronRight size={14} className="me-bc-sep" />
            <span className="me-bc-current">{selectedClass}</span>
            <ChevronRight size={14} className="me-bc-sep" />
            <span className="me-bc-current">{selectedSubject}</span>
          </div>

          <div style={{
            background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0',
            padding: '20px 24px', boxShadow: '0 4px 24px rgba(15,23,42,0.06)',
          }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={20} color="#2563EB" /> Performance Analytics
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <span className="gd-pill gd-pill--blue"><strong>{selectedClass}</strong></span>
              <span className="gd-pill gd-pill--purple"><strong>{selectedSubject}</strong></span>
              <span className="gd-pill gd-pill--green">{term} {year}</span>
              <span className="gd-pill gd-pill--amber">{teacherName}</span>
            </div>
          </div>

          <div className="me-filters" style={{ margin: '16px 0' }}>
            <select className="me-filter-select" value={year} onChange={e => setYear(e.target.value)}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="me-filter-select" value={term} onChange={e => setTerm(e.target.value)}>
              {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="me-filter-select" value={selectedExamType} onChange={e => setSelectedExamType(e.target.value)}>
              {examTypeConfig.map(et => <option key={et.name} value={et.name}>{et.name}</option>)}
            </select>
          </div>

          {analyticsData && (
            <>
              <div className="gd-kpi-grid" style={{ marginBottom: 20 }}>
                <div className="gd-kpi">
                  <p className="gd-kpi-label">Mean Score</p>
                  <p className="gd-kpi-val">{analyticsData.mean}{analyticsData.mean !== '—' ? '%' : ''}</p>
                </div>
                <div className="gd-kpi">
                  <p className="gd-kpi-label">Highest</p>
                  <p className="gd-kpi-val" style={{ color: '#16a34a' }}>{analyticsData.highest}{analyticsData.highest !== '—' ? '%' : ''}</p>
                </div>
                <div className="gd-kpi">
                  <p className="gd-kpi-label">Lowest</p>
                  <p className="gd-kpi-val" style={{ color: '#dc2626' }}>{analyticsData.lowest}{analyticsData.lowest !== '—' ? '%' : ''}</p>
                </div>
                <div className="gd-kpi">
                  <p className="gd-kpi-label">Pass Rate</p>
                  <p className="gd-kpi-val" style={{ color: '#2563eb' }}>{analyticsData.passRate}{analyticsData.passRate !== '—' ? '%' : ''}</p>
                </div>
              </div>

              <div className="gd-layout">
                <div className="gd-main">
                  <div className="gd-card">
                    <div className="gd-card-hdr"><h4>Grade Distribution</h4></div>
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'flex-end', height: 140, padding: '12px 0' }}>
                      {(analyticsData.distBands || []).map(grade => {
                        const count = analyticsData.dist[grade] || 0
                        const pct = analyticsData.scores.length > 0 ? (count / analyticsData.scores.length) * 100 : 0
                        return (
                          <div key={grade} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{count}</span>
                            <div style={{ width: '100%', maxWidth: 40, height: 100, background: '#f1f5f9', borderRadius: '4px 4px 0 0', position: 'relative' }}>
                              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${pct}%`, background: '#2563eb', borderRadius: '4px 4px 0 0' }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{grade}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="gd-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div className="gd-card-hdr" style={{ marginBottom: 0 }}><h4>Student Ranking — {selectedExamType}</h4></div>
                      <button className="gd-btn gd-btn--secondary gd-btn--sm" onClick={() => setShowExportModal(true)} disabled={exporting}>
                        <Download size={12} /> {exporting ? 'Exporting...' : 'Export PDF'}
                      </button>
                    </div>
                    {analyticsData.ranked.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>No marks entered yet.</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="me-table">
                          <thead>
                            <tr>
                              <th style={{ width: 50 }}>Rank</th>
                              <th>Adm No.</th>
                              <th>Name</th>
                              <th style={{ width: 80 }}>Marks</th>
                              <th style={{ width: 70 }}>Grade</th>
                              <th style={{ width: 90 }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analyticsData.ranked.map((s, i) => (
                              <tr key={i}>
                                <td className="me-muted">{i + 1}</td>
                                <td className="me-adm">{s.adm}</td>
                                <td style={{ fontWeight: 500 }}>{s.name}</td>
                                <td style={{ fontWeight: 600 }}>{s.score ?? '—'}%</td>
                                <td><span className={`cbe-badge ${s.color || ''}`}>{s.grade}</span></td>
                                <td>
                                  {s.status === 'approved' ? (
                                    <span className="me-status-dot" style={{ background: '#16a34a', color: '#fff' }}>Approved</span>
                                  ) : s.status === 'submitted' ? (
                                    <span className="me-status-dot" style={{ background: '#2563eb', color: '#fff' }}>Saved</span>
                                  ) : (
                                    <span className="me-status-dot" style={{ background: '#d97706', color: '#fff' }}>{s.status || '—'}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div className="gd-sidebar">
                  <div className="gd-card" style={{ position: 'sticky', top: 12 }}>
                    <h3 className="me-sp-title">Summary</h3>
                    <div className="me-sp-stats">
                      <div className="me-sp-row"><span>Students</span><strong>{analyticsData.studentGrades.length}</strong></div>
                      <div className="me-sp-row"><span>Entered</span><strong style={{ color: '#16a34a' }}>{analyticsData.scores.length}</strong></div>
                      <div className="me-sp-row"><span>Passed</span><strong style={{ color: '#2563eb' }}>{analyticsData.passCount}</strong></div>
                      <div className="me-sp-divider" />
                      <div className="me-sp-row"><span>Highest</span><strong>{analyticsData.highest}{analyticsData.highest !== '—' ? '%' : ''}</strong></div>
                      <div className="me-sp-row"><span>Lowest</span><strong>{analyticsData.lowest}{analyticsData.lowest !== '—' ? '%' : ''}</strong></div>
                      <div className="me-sp-row"><span>Average</span><strong>{analyticsData.mean}{analyticsData.mean !== '—' ? '%' : ''}</strong></div>
                    </div>
                    <div className="me-sp-divider" />
                    <h4 className="me-sp-subtitle">Grade Distribution</h4>
                    <div className="me-sp-dist">
                      {(analyticsData.distBands || []).map(grade => {
                        const count = analyticsData.dist[grade] || 0
                        const pct = analyticsData.scores.length > 0 ? (count / analyticsData.scores.length) * 100 : 0
                        return (
                          <div key={grade} className="me-sp-dist-row">
                            <span className="me-sp-dist-label">{grade}</span>
                            <div className="me-sp-dist-bar-wrap">
                              <div className="me-sp-dist-bar" style={{ width: `${pct * 2}%` }} />
                            </div>
                            <span className="me-sp-dist-count">{count}</span>
                          </div>
                        )
                      })}
                    </div>
                    <button className="gd-btn gd-btn--primary gd-btn--sm" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}
                      onClick={() => setShowExportModal(true)} disabled={exporting}>
                      <Download size={13} /> {exporting ? 'Exporting...' : 'Export PDF'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {showExportModal && (
        <div className="me-modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="me-modal" onClick={e => e.stopPropagation()}>
            <div className="me-modal-header">
              <h3><Download size={16} /> Export Options</h3>
              <button className="me-modal-close" onClick={() => setShowExportModal(false)}>×</button>
            </div>
            <div className="me-modal-body">
              <div className="me-modal-info">
                {selectedClass} · {selectedSubject} · {selectedExamType} · {term} {year}
              </div>
              <div className="me-export-options">
                <label className={`me-export-option ${exportFormat === 'class-sheet' ? 'active' : ''}`}>
                  <input type="radio" name="export-format" value="class-sheet" checked={exportFormat === 'class-sheet'} onChange={e => setExportFormat(e.target.value)} />
                  <div className="me-export-option-content">
                    <strong>Class Mark Sheet</strong>
                    <span>Student list with marks and grades</span>
                  </div>
                </label>
                <label className={`me-export-option ${exportFormat === 'summary' ? 'active' : ''}`}>
                  <input type="radio" name="export-format" value="summary" checked={exportFormat === 'summary'} onChange={e => setExportFormat(e.target.value)} />
                  <div className="me-export-option-content">
                    <strong>Subject Summary Report</strong>
                    <span>Mean scores, grade distribution, ranking</span>
                  </div>
                </label>
                <label className={`me-export-option ${exportFormat === 'analysis' ? 'active' : ''}`}>
                  <input type="radio" name="export-format" value="analysis" checked={exportFormat === 'analysis'} onChange={e => setExportFormat(e.target.value)} />
                  <div className="me-export-option-content">
                    <strong>Performance Analysis</strong>
                    <span>Detailed breakdown with distribution</span>
                  </div>
                </label>
                <label className={`me-export-option ${exportFormat === 'individuals' ? 'active' : ''}`}>
                  <input type="radio" name="export-format" value="individuals" checked={exportFormat === 'individuals'} onChange={e => setExportFormat(e.target.value)} />
                  <div className="me-export-option-content">
                    <strong>Student Reports</strong>
                    <span>Individual PDFs for each student (bulk ZIP)</span>
                  </div>
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
