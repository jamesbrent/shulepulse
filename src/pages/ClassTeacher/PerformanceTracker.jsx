import { useState, useEffect, Fragment } from 'react'
import {
  BarChart3, Search, TrendingUp, TrendingDown, Award, BookOpen,
  Star, ArrowUp, Users, FileText, FileSpreadsheet,
  Printer, X, Eye, ChevronRight
} from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { esc } from '../../utils/escapeHtml'
import {
  COLORS, FONT,
  drawSchoolHeader, drawWatermark, drawDocMeta, drawFooter,
  generateDocId, fmtDate,
} from '../../utils/schoolPdfTemplate'
import { fetchBulkDataWithExtras, bulkPrint } from '../admin/grades/utils/bulkReportCards'
import { getCBEGrade, REPORT_CARD_STYLES } from '../../components/students/ReportCard'
import { gradeDisplay, sortBands, bandColor, weightedScoreMean, precisionScore, rankEntries } from '../../services/grading'

const TERMS = ['Term 1', 'Term 2', 'Term 3']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

function cbcBand(points) {
  if (points >= 7) return 'EE'
  if (points >= 5) return 'ME'
  if (points >= 3) return 'AE'
  return 'BE'
}

function cbcBandLabel(points) {
  if (points === 8) return 'EE1'
  if (points === 7) return 'EE2'
  if (points === 6) return 'ME1'
  if (points === 5) return 'ME2'
  if (points === 4) return 'AE1'
  if (points === 3) return 'AE2'
  if (points === 2) return 'BE1'
  return 'BE2'
}

const CBC_BAND_COLORS = {
  EE: { bg: '#dcfce7', color: '#16a34a', label: 'Exceeding Expectations' },
  ME: { bg: '#dbeafe', color: '#2563eb', label: 'Meeting Expectations' },
  AE: { bg: '#fef3c7', color: '#ca8a04', label: 'Approaching Expectations' },
  BE: { bg: '#fee2e2', color: '#dc2626', label: 'Below Expectations' },
}

export default function PerformanceTracker({ teacherData, currentTerm, currentYear, assignedClasses = [] }) {
  const [grades, setGrades] = useState([])
  const [students, setStudents] = useState([])
  const [subjectsList, setSubjectsList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTerm, setFilterTerm] = useState(currentTerm || 'Term 1')
  const [filterYear, setFilterYear] = useState(currentYear || CURRENT_YEAR)
  const [filterSubject, setFilterSubject] = useState('all')
  const [filterClass, setFilterClass] = useState('all')
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [distModal, setDistModal] = useState(false)
  const [topModal, setTopModal] = useState(false)
  const [subjModal, setSubjModal] = useState(false)
  const [reportEntries, setReportEntries] = useState([])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportProgress, setReportProgress] = useState({ done: 0, total: 0 })
  const [rankSearch, setRankSearch] = useState('')
  const [rankBand, setRankBand] = useState('all')
  const [rankStatus, setRankStatus] = useState('all')
  const [rankSort, setRankSort] = useState('avg-desc')
  const [rankTopN, setRankTopN] = useState('all')
  const [rankTopNCustom, setRankTopNCustom] = useState('')

  useEffect(() => {
    if (assignedClasses.length > 0) {
      fetchStudents()
      fetchSubjects()
    }
  }, [teacherData, assignedClasses])

  useEffect(() => {
    if (filterTerm && filterYear) {
      fetchGrades()
    }
  }, [filterTerm, filterYear, filterSubject])

  const fetchStudents = async () => {
    const { data } = await supabase
      .from('students')
      .select('id, full_name, admission_number, class, stream')
      .eq('school_id', teacherData.school_id)
      .in('class', assignedClasses)
      .eq('status', 'active')
      .order('full_name')
    setStudents(data || [])
  }

  const fetchSubjects = async () => {
    const { data } = await supabase
      .from('subjects')
      .select('id, name')
      .eq('school_id', teacherData.school_id)
      .order('name')
    setSubjectsList(data || [])
  }

  const fetchGrades = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('grades')
      .select('*, students(full_name, admission_number, class, stream)')
      .eq('school_id', teacherData.school_id)
      .eq('term', filterTerm)
      .eq('year', filterYear)
      .in('status', ['approved', 'published'])

    const g = (data || []).filter(r => r.students && assignedClasses.includes(r.students?.class))
    setGrades(g)
    setLoading(false)
  }

  const filtered = grades.filter(g => {
    const s = search.toLowerCase()
    const matchSearch = !s || g.students?.full_name?.toLowerCase().includes(s) ||
      g.students?.admission_number?.toLowerCase().includes(s)
    const matchSubject = filterSubject === 'all' || g.subject === filterSubject
    const matchClass = filterClass === 'all' || g.students?.class === filterClass
    return matchSearch && matchSubject && matchClass
  })

  const scores = filtered.map(g => g.total_score || 0).filter(s => s > 0)
  const passCount = filtered.filter(g => (g.total_score || 0) >= 50).length
  const summary = {
    total: filtered.length,
    avg: scores.length ? Math.round(weightedScoreMean(filtered)) : 0,
    highest: scores.length ? Math.max(...scores) : 0,
    lowest: scores.length ? Math.min(...scores) : 0,
    passRate: scores.length ? Math.round((passCount / scores.length) * 100) : 0,
    passCount,
  }

  const filteredStudents = filterClass === 'all' ? students : students.filter(s => s.class === filterClass)

  const studentMeans = filteredStudents.map(s => {
    const sg = filtered.filter(g => g.student_id === s.id)
    const avg = sg.length
      ? Math.round(weightedScoreMean(sg))
      : null
    const cbe = avg !== null ? getCBEGrade(avg, s.class) : null
    return { ...s, avg, subjectCount: sg.length, grades: sg, cbe }
  }).filter(s => s.avg !== null).sort((a, b) => b.avg - a.avg)

  const studentRankById = new Map(
    rankEntries(studentMeans.map(s => ({
      studentId: s.id,
      score: s.grades.length > 0 ? precisionScore(s.grades) : 0,
      count: s.subjectCount,
      admission: s.admission_number || undefined,
    })), { scope: filterClass !== 'all' ? 'class' : 'school' }).map(r => [r.studentId, r.rank])
  )
  studentMeans.forEach(s => {
    s.rank = studentRankById.get(s.id) || studentMeans.length
  })

  const bandOptions = sortBands([...new Set(studentMeans.map(s => s.cbe?.band).filter(Boolean))])

  const rankedStudents = (() => {
    const filtered = studentMeans.filter(s => {
      const matchSearch = !rankSearch ||
        s.full_name?.toLowerCase().includes(rankSearch.toLowerCase()) ||
        s.admission_number?.toLowerCase().includes(rankSearch.toLowerCase())
      const matchBand = rankBand === 'all' || s.cbe?.band === rankBand
      const matchStatus = rankStatus === 'all' ||
        (rankStatus === 'pass' && s.avg >= 50) ||
        (rankStatus === 'fail' && s.avg < 50)
      return matchSearch && matchBand && matchStatus
    })
    const sorted = filtered.sort((a, b) => {
      if (rankSort === 'avg-desc') return b.avg - a.avg
      if (rankSort === 'avg-asc') return a.avg - b.avg
      if (rankSort === 'name-asc') return (a.full_name || '').localeCompare(b.full_name || '')
      if (rankSort === 'name-desc') return (b.full_name || '').localeCompare(a.full_name || '')
      return b.avg - a.avg
    })
    if (rankTopN === 'custom') {
      const n = parseInt(rankTopNCustom, 10)
      return isNaN(n) || n <= 0 ? sorted : sorted.slice(0, n)
    }
    if (rankTopN !== 'all') {
      const n = parseInt(rankTopN, 10)
      return isNaN(n) ? sorted : sorted.slice(0, n)
    }
    return sorted
  })()

  const classCBCAverages = (() => {
    const studentMap = {}
    grades.forEach(g => {
      const cls = g.students?.class
      if (!cls) return
      const sid = g.student_id
      const key = `${cls}__${sid}`
      if (!studentMap[key]) {
        studentMap[key] = { class: cls, scores: [], points: [] }
      }
      const score = Number(g.total_score || 0)
      studentMap[key].scores.push(score)
      studentMap[key].points.push(getCBEGrade(score, cls).points || 0)
    })
    const classMap = {}
    Object.values(studentMap).forEach(s => {
      const studentAvg = s.points.length > 0
        ? Math.round(s.points.reduce((a, b) => a + b, 0) / s.points.length * 10) / 10
        : 0
      const band = cbcBand(Math.round(studentAvg))
      if (!classMap[s.class]) {
        classMap[s.class] = { studentCount: 0, pointsSum: 0, pointsCount: 0, bands: { EE: 0, ME: 0, AE: 0, BE: 0 }, allPoints: [] }
      }
      classMap[s.class].studentCount += 1
      classMap[s.class].pointsSum += studentAvg
      classMap[s.class].pointsCount += 1
      classMap[s.class].bands[band] += 1
      classMap[s.class].allPoints.push(studentAvg)
    })
    return Object.entries(classMap).map(([name, d]) => {
      const meanPoints = d.pointsCount > 0
        ? Math.round(d.pointsSum / d.pointsCount * 10) / 10
        : 0
      const sorted = [...d.allPoints].sort((a, b) => a - b)
      const dist = {}
      Object.keys(d.bands).forEach(b => {
        dist[b] = d.studentCount > 0 ? Math.round((d.bands[b] / d.studentCount) * 100) : 0
      })
      return {
        name,
        meanPoints,
        meanGrade: cbcBandLabel(Math.round(meanPoints)),
        band: cbcBand(Math.round(meanPoints)),
        students: d.studentCount,
        dist,
        highest: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
        lowest: sorted.length > 0 ? sorted[0] : 0,
        median: sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0,
      }
    }).sort((a, b) => b.meanPoints - a.meanPoints)
  })()

  const subjectMeans = subjectsList.map(sub => {
    const sg = filtered.filter(g => g.subject === sub.name)
    const avg = sg.length
      ? Math.round(weightedScoreMean(sg))
      : null
    return { name: sub.name, avg, count: sg.length }
  }).filter(s => s.count > 0).sort((a, b) => b.avg - a.avg)

  const gradeSubjects = [...new Set(filtered.map(g => g.subject).filter(Boolean))].sort()

  const gradeDist = {}
  filtered.forEach(g => {
    const band = getCBEGrade(g.total_score || 0, g.students?.class).band || '—'
    gradeDist[band] = (gradeDist[band] || 0) + 1
  })
  const distBands = sortBands(Object.keys(gradeDist))

  const getScoreColor = (score) => {
    if (score >= 80) return '#16a34a'
    if (score >= 60) return '#2563eb'
    if (score >= 50) return '#ca8a04'
    if (score >= 40) return '#f97316'
    return '#dc2626'
  }

  const getScoreLabel = (score) => {
    if (score >= 80) return 'Excellent'
    if (score >= 60) return 'Good'
    if (score >= 50) return 'Fair'
    if (score >= 40) return 'Needs Improvement'
    return 'Poor'
  }

  const downloadPDF = async () => {
    if (filtered.length === 0) return
    const docId = generateDocId('CT')
    const ORI = 'landscape'

    const { data: profile } = await supabase
      .from('profiles')
      .select('schools(name, logo_url, address, phone, email, motto)')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()
    const school = profile?.schools

    const doc = new jsPDF(ORI, 'mm', 'a4')
    const M = 14
    const CX = 148.5

    let y = await drawSchoolHeader(doc, school, { y: M, orientation: ORI })
    drawWatermark(doc)
    y = drawDocMeta(doc, { docId, date: fmtDate(new Date()) }, y, { orientation: ORI })

    doc.setFont(FONT.SERIF, 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...COLORS.PRIMARY)
    doc.text('CLASS PERFORMANCE REPORT', CX, y + 2, { align: 'center' })
    y += 9

    doc.setFont(FONT.SERIF, 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.DARK)
    doc.text(`${assignedClasses.join(', ')}  |  ${filterTerm} ${filterYear}  |  ${filterSubject === 'all' ? 'All Subjects' : filterSubject}`, CX, y, { align: 'center' })
    y += 8

    doc.setFont(FONT.SERIF, 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...COLORS.DARK)
    doc.text('Summary', M, y)
    y += 6

    autoTable(doc, {
      startY: y,
      body: [
        ['Total Records', String(summary.total), 'Average Score', `${summary.avg}%`],
        ['Pass Rate', `${summary.passRate}%`, 'Students Passed', String(summary.passCount)],
        ['Highest Score', `${summary.highest}%`, 'Lowest Score', `${summary.lowest}%`],
      ],
      styles: { fontSize: 9, cellPadding: 3, font: FONT.SERIF },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50, fillColor: COLORS.BG }, 1: { cellWidth: 50 }, 2: { fontStyle: 'bold', cellWidth: 50, fillColor: COLORS.BG }, 3: { cellWidth: 50 } },
      tableLineColor: COLORS.FAINT,
      tableLineWidth: 0.15,
      margin: { left: M, right: M },
      theme: 'grid',
    })
    y = doc.lastAutoTable.finalY + 10

    doc.setFont(FONT.SERIF, 'bold')
    doc.setFontSize(10)
    doc.text('Grade Distribution', M, y)
    y += 6

    const distRows = distBands.map(b => {
      const count = gradeDist[b] || 0
      const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0
      return [b, String(count), `${pct}%`]
    })

    autoTable(doc, {
      startY: y,
      head: [['Grade', 'Count', 'Percentage']],
      body: distRows,
      styles: { fontSize: 9, cellPadding: 3, font: FONT.SERIF },
      headStyles: { fillColor: COLORS.PRIMARY, textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
      tableLineColor: COLORS.FAINT,
      tableLineWidth: 0.15,
      margin: { left: M, right: M },
    })
    y = doc.lastAutoTable.finalY + 10

    doc.setFont(FONT.SERIF, 'bold')
    doc.setFontSize(10)
    doc.text('Student Scores', M, y)
    y += 6

    const rows = filtered.map((g, i) => [
      i + 1,
      g.students?.full_name || '\u2014',
      g.students?.admission_number || '\u2014',
      g.students?.class || '\u2014',
      g.subject || '\u2014',
      String(g.total_score ?? '\u2014'),
      gradeDisplay(getCBEGrade(g.total_score || 0, g.students?.class)),
    ])

    autoTable(doc, {
      startY: y,
      head: [['#', 'Student', 'Adm No.', 'Class', 'Subject', 'Score', 'Grade']],
      body: rows,
      styles: { fontSize: 8, cellPadding: 2, font: FONT.SERIF },
      headStyles: { fillColor: COLORS.PRIMARY, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: COLORS.BG },
      tableLineColor: COLORS.FAINT,
      tableLineWidth: 0.15,
      margin: { left: M, right: M },
    })

    drawFooter(doc, school, { showDocId: true, docId, orientation: ORI })
    doc.save(`performance_report_${assignedClasses.join('_')}_${filterTerm}_${filterYear}.pdf`)
  }

  const downloadExcel = () => {
    if (filtered.length === 0) return
    const wb = XLSX.utils.book_new()

    const summaryData = [
      ['Class Performance Report'],
      [`${assignedClasses.join(', ')} | ${filterTerm} ${filterYear} | ${filterSubject === 'all' ? 'All Subjects' : filterSubject}`],
      [],
      ['Metric', 'Value'],
      ['Total Records', summary.total],
      ['Average Score', `${summary.avg}%`],
      ['Pass Rate', `${summary.passRate}%`],
      ['Highest Score', `${summary.highest}%`],
      ['Lowest Score', `${summary.lowest}%`],
      [],
      ['Grade Distribution'],
      ['Grade', 'Count', 'Percentage'],
      ...distBands.map(b => {
        const count = gradeDist[b] || 0
        const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0
        return [b, count, `${pct}%`]
      }),
    ]
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
    summarySheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')

    const scoreRows = filtered.map((g, i) => ({
      '#': i + 1,
      'Student': g.students?.full_name || '\u2014',
      'Admission No': g.students?.admission_number || '\u2014',
      'Class': g.students?.class || '\u2014',
      'Stream': g.students?.stream || '\u2014',
      'Subject': g.subject || '\u2014',
      'Exam Type': g.exam_type || '\u2014',
      'Score': g.total_score ?? '\u2014',
      'Grade': gradeDisplay(getCBEGrade(g.total_score || 0, g.students?.class)),
    }))
    const scoreSheet = XLSX.utils.json_to_sheet(scoreRows)
    scoreSheet['!cols'] = [
      { wch: 4 }, { wch: 30 }, { wch: 16 }, { wch: 12 },
      { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
    ]
    XLSX.utils.book_append_sheet(wb, scoreSheet, 'Student Scores')

    XLSX.writeFile(wb, `performance_report_${assignedClasses.join('_')}_${filterTerm}_${filterYear}.xlsx`)
  }

  const loadReportCards = async () => {
    setReportLoading(true)
    try {
      const classFilter = filterClass === 'all' ? null : filterClass
      const entries = await fetchBulkDataWithExtras(teacherData.school_id, classFilter, filterTerm, filterYear)
      setReportEntries(entries)
    } catch (err) {
      alert('Error loading report cards: ' + err.message)
    }
    setReportLoading(false)
  }

  const handleBulkPrint = () => {
    if (reportEntries.length === 0) return
    bulkPrint(reportEntries, teacherData?.schools, filterTerm, filterYear)
  }

  useEffect(() => {
    if (activeTab === 'reports') {
      loadReportCards()
    }
  }, [activeTab, filterClass, filterTerm, filterYear])

  const tabs = [
    { key: 'overview', label: 'Overview', icon: <BarChart3 size={14} /> },
    { key: 'rankings', label: 'Rankings', icon: <Award size={14} /> },
    { key: 'classAverages', label: 'Class Averages', icon: <Users size={14} /> },
    { key: 'reports', label: 'Report Cards', icon: <FileText size={14} /> },
  ]

  return (
    <div className="ct-performance-page">
      <div className="ct-perf-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`ct-perf-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="ct-perf-summary">
        {[
          { label: 'Total Records', value: summary.total, icon: <BookOpen size={20} />, color: 'blue' },
          { label: 'Class Average', value: `${summary.avg}%`, icon: <BarChart3 size={20} />, color: 'purple' },
          { label: 'Pass Rate', value: `${summary.passRate}%`, icon: <TrendingUp size={20} />, color: 'green' },
          { label: 'Students Passed', value: `${summary.passCount} / ${summary.total || 0}`, icon: <Users size={20} />, color: 'blue' },
          { label: 'Highest Score', value: `${summary.highest}%`, icon: <Star size={20} />, color: 'green' },
          { label: 'Lowest Score', value: `${summary.lowest}%`, icon: <ArrowUp size={20} />, color: 'red' },
        ].map(s => (
          <div key={s.label} className={`ct-perf-sum-card ${s.color}`}>
            {s.icon}
            <div>
              <p className="ct-psc-label">{s.label}</p>
              <p className="ct-psc-value">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="ct-perf-toolbar">
        <div className="ct-perf-toolbar-left">
          <div className="ct-search-wrap">
            <Search size={14} className="ct-search-icon" />
            <input className="ct-search-input" placeholder="Search student..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="ct-filter-select" value={filterTerm} onChange={e => setFilterTerm(e.target.value)}>
            {TERMS.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="ct-filter-select" value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))}>
            {YEARS.map(y => <option key={y}>{y}</option>)}
          </select>
          <select className="ct-filter-select" value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
            <option value="all">All Subjects</option>
            {gradeSubjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {assignedClasses.length > 1 && (
            <select className="ct-filter-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
              <option value="all">All Classes</option>
              {assignedClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
        <div className="ct-perf-toolbar-right">
          {filtered.length > 0 && (
            <>
              <button className="ct-perf-export-btn" onClick={downloadPDF} title="Download PDF">
                <FileText size={14} /> PDF
              </button>
              <button className="ct-perf-export-btn primary" onClick={downloadExcel} title="Download Excel">
                <FileSpreadsheet size={14} /> Excel
              </button>
            </>
          )}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="ct-perf-grid">
          <div className="ct-perf-card">
            <p className="ct-perf-card-title"><Award size={15} /> Student Performance</p>
            {loading ? (
              <p className="ct-text-muted">Loading...</p>
            ) : studentMeans.length === 0 ? (
              <p className="ct-text-muted" style={{ textAlign: 'center', padding: 20 }}>
                No grade records for {filterTerm} {filterYear}
              </p>
            ) : (
              <div className="ct-perf-table-wrap">
                <table className="ct-perf-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Student</th>
                      <th>Adm No.</th>
                      {assignedClasses.length > 1 && <th>Class</th>}
                      <th>Subjects</th>
                      <th>Average</th>
                      <th>Grade</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentMeans.map((s) => (
                      <tr key={s.id} onClick={() => setSelectedStudent(s)} style={{ cursor: 'pointer' }}>
                        <td>
                          <span className={`ct-perf-rank-cell ${s.rank <= 3 ? `rank-${s.rank}` : ''}`}>
                            {s.rank}
                          </span>
                        </td>
                        <td>
                          <div className="ct-student-name-cell">
                            <div className="ct-student-avatar-sm">
                              {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <p className="ct-sname">{s.full_name || '\u2014'}</p>
                          </div>
                        </td>
                        <td className="ct-adm-no">{s.admission_number || '\u2014'}</td>
                        {assignedClasses.length > 1 && <td className="ct-sclass">{s.class || ''}</td>}
                        <td>{s.subjectCount} Subjects</td>
                        <td>
                          <span className="ct-score-value" style={{ color: getScoreColor(s.avg) }}>
                            {s.avg}%
                          </span>
                        </td>
                        <td>
                          <span className="ct-score-badge" style={{
                            background: s.avg >= 80 ? '#dcfce7' : s.avg >= 60 ? '#dbeafe' : s.avg >= 50 ? '#fef9c3' : '#fee2e2',
                            color: getScoreColor(s.avg),
                          }}>
                            {gradeDisplay(s.cbe)}
                          </span>
                        </td>
                        <td>
                          <span className="ct-score-badge" style={{
                            background: s.avg >= 50 ? '#dcfce7' : '#fee2e2',
                            color: s.avg >= 50 ? '#16a34a' : '#dc2626',
                          }}>
                            {s.avg >= 50 ? 'Pass' : 'Fail'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="ct-perf-view-btn"
                            onClick={(e) => { e.stopPropagation(); setSelectedStudent(s) }}
                            title="View student details"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && studentMeans.length > 0 && (
              <div className="ct-perf-mobile-list">
                {studentMeans.map((s) => (
                  <div key={s.id} className="ct-pm-card ct-pm-compact" onClick={() => setSelectedStudent(s)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setSelectedStudent(s) }}>
                    <div className="ct-pm-top">
                      <span className={`ct-perf-rank-cell ${s.rank <= 3 ? `rank-${s.rank}` : ''}`}>{s.rank}</span>
                      <div className="ct-student-avatar-sm">{s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                      <div className="ct-pm-name">
                        <span className="ct-pm-sname">{s.full_name || '\u2014'}</span>
                      </div>
                      <div className="ct-pm-arrow"><ChevronRight size={16} /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ct-perf-sidebar ct-overview-sidebar">
            <div className="ct-perf-card">
              <p className="ct-perf-card-title"><BarChart3 size={15} /> Grade Distribution</p>
              <button className="ct-sidebar-mobile-trigger" onClick={() => setDistModal(true)}>
                <span>{distBands.length} grade bands</span>
                <span className="ct-sidebar-trigger-val">{summary.total} records</span>
                <ChevronRight size={16} />
              </button>
              {summary.total === 0 ? (
                <p className="ct-text-muted">No data yet.</p>
              ) : (
                <div className="ct-perf-grade-dist">
                  {distBands.map(b => {
                    const count = gradeDist[b] || 0
                    const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0
                    return (
                      <div key={b} className="ct-perf-grade-row">
                        <div className="ct-perf-grade-label">
                          <span className="ct-perf-grade-letter" style={{ color: bandColor(b) }}>{b}</span>
                          <span className="ct-perf-grade-count">{count} ({pct}%)</span>
                        </div>
                        <div className="ct-perf-grade-track">
                          <div className="ct-perf-grade-fill" style={{ width: `${pct}%`, background: bandColor(b) }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="ct-perf-card">
              <p className="ct-perf-card-title"><Star size={15} /> Top Students</p>
              <button className="ct-sidebar-mobile-trigger" onClick={() => setTopModal(true)}>
                <span>Top {Math.min(5, studentMeans.length)} students</span>
                <ChevronRight size={16} />
              </button>
              {studentMeans.length === 0 ? (
                <p className="ct-text-muted">No data yet.</p>
              ) : (
                studentMeans.slice(0, 5).map((s) => (
                  <div key={s.id} className="ct-perf-student-row" onClick={() => setSelectedStudent(s)} style={{ cursor: 'pointer' }}>
                    <span className="ct-perf-rank">{s.rank}</span>
                    <div className="ct-student-avatar-sm" style={{ width: 28, height: 28, fontSize: 9 }}>
                      {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="ct-perf-student-info">
                      <span className="ct-perf-student-name">{s.full_name}</span>
                      <span className="ct-perf-student-class">{s.class}</span>
                    </div>
                    <span className="ct-perf-student-avg" style={{ color: getScoreColor(s.avg) }}>{s.avg}%</span>
                  </div>
                ))
              )}
            </div>

            <div className="ct-perf-card">
              <p className="ct-perf-card-title"><BarChart3 size={15} /> Subject Averages</p>
              <button className="ct-sidebar-mobile-trigger" onClick={() => setSubjModal(true)}>
                <span>{subjectMeans.length} subjects</span>
                <ChevronRight size={16} />
              </button>
              {subjectMeans.length === 0 ? (
                <p className="ct-text-muted">No data yet.</p>
              ) : (
                subjectMeans.map(s => (
                  <div key={s.name} className="ct-perf-bar-row">
                    <span className="ct-perf-bar-label">{s.name}</span>
                    <div className="ct-perf-bar-track">
                      <div className="ct-perf-bar-fill" style={{
                        width: `${s.avg}%`,
                        background: s.avg >= 80 ? '#16a34a' : s.avg >= 60 ? '#2563eb' : s.avg >= 50 ? '#ca8a04' : s.avg >= 40 ? '#f97316' : '#dc2626'
                      }} />
                    </div>
                    <span className="ct-perf-bar-val">{s.avg}%</span>
                    <span className="ct-perf-count">{s.count} rec</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rankings' && (
        <div className="ct-perf-grid">
          <div className="ct-perf-card">
            <p className="ct-perf-card-title"><Award size={15} /> Student Rankings ({rankedStudents.length}{rankedStudents.length !== studentMeans.length ? ` of ${studentMeans.length}` : ''} students)</p>

            <div className="ct-rank-filters">
              <div className="ct-rank-filter-group">
                <input
                  type="text"
                  placeholder="Search student name or adm no..."
                  value={rankSearch}
                  onChange={e => setRankSearch(e.target.value)}
                  className="ct-rank-search"
                />
              </div>
              <div className="ct-rank-filter-group">
                <label className="ct-rank-label">Grade:</label>
                <select value={rankBand} onChange={e => setRankBand(e.target.value)} className="ct-rank-select">
                  <option value="all">All Grades</option>
                  {bandOptions.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="ct-rank-filter-group">
                <label className="ct-rank-label">Status:</label>
                <select value={rankStatus} onChange={e => setRankStatus(e.target.value)} className="ct-rank-select">
                  <option value="all">All</option>
                  <option value="pass">Pass (50%+)</option>
                  <option value="fail">Fail (below 50%)</option>
                </select>
              </div>
              <div className="ct-rank-filter-group">
                <label className="ct-rank-label">Sort:</label>
                <select value={rankSort} onChange={e => setRankSort(e.target.value)} className="ct-rank-select">
                  <option value="avg-desc">Highest Average First</option>
                  <option value="avg-asc">Lowest Average First</option>
                  <option value="name-asc">Name A-Z</option>
                  <option value="name-desc">Name Z-A</option>
                </select>
              </div>
              <div className="ct-rank-filter-group">
                <label className="ct-rank-label">Show:</label>
                <select value={rankTopN} onChange={e => { setRankTopN(e.target.value); if (e.target.value !== 'custom') setRankTopNCustom('') }} className="ct-rank-select">
                  <option value="all">All Students</option>
                  <option value="3">Top 3</option>
                  <option value="5">Top 5</option>
                  <option value="10">Top 10</option>
                  <option value="20">Top 20</option>
                  <option value="50">Top 50</option>
                  <option value="100">Top 100</option>
                  <option value="custom">Custom...</option>
                </select>
              </div>
              {rankTopN === 'custom' && (
                <div className="ct-rank-filter-group">
                  <label className="ct-rank-label">Top</label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    placeholder="e.g. 25"
                    value={rankTopNCustom}
                    onChange={e => setRankTopNCustom(e.target.value)}
                    className="ct-rank-search"
                    style={{ width: 80 }}
                  />
                  <span className="ct-rank-label">students</span>
                </div>
              )}
            </div>
            {studentMeans.length === 0 ? (
              <p className="ct-text-muted" style={{ textAlign: 'center', padding: 20 }}>No ranking data available.</p>
            ) : rankedStudents.length === 0 ? (
              <p className="ct-text-muted" style={{ textAlign: 'center', padding: 20 }}>No students match the selected filters.</p>
            ) : (
              <div className="ct-perf-table-wrap">
                <table className="ct-perf-table">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>#</th>
                      <th>Student</th>
                      <th>Adm No.</th>
                      {assignedClasses.length > 1 && <th>Class</th>}
                      <th>Subjects</th>
                      <th>Average</th>
                      <th>Grade</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedStudents.map((s) => (
                      <tr key={s.id} onClick={() => setSelectedStudent(s)} style={{ cursor: 'pointer' }}>
                        <td>
                          <span className={`ct-perf-rank-cell ${s.rank <= 3 ? `rank-${s.rank}` : ''}`}>
                            {s.rank}
                          </span>
                        </td>
                        <td>
                          <div className="ct-student-name-cell">
                            <div className="ct-student-avatar-sm">
                              {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <p className="ct-sname">{s.full_name || '\u2014'}</p>
                          </div>
                        </td>
                        <td className="ct-adm-no">{s.admission_number || '\u2014'}</td>
                        {assignedClasses.length > 1 && <td className="ct-sclass">{s.class || ''}</td>}
                        <td>{s.subjectCount}</td>
                        <td>
                          <span className="ct-score-value" style={{ color: getScoreColor(s.avg) }}>
                            {s.avg}%
                          </span>
                        </td>
                        <td>
                          <span className="ct-score-badge" style={{
                            background: s.avg >= 80 ? '#dcfce7' : s.avg >= 60 ? '#dbeafe' : s.avg >= 50 ? '#fef9c3' : '#fee2e2',
                            color: getScoreColor(s.avg),
                          }}>
                            {gradeDisplay(s.cbe)}
                          </span>
                        </td>
                        <td>
                          <span className="ct-score-badge" style={{
                            background: s.avg >= 50 ? '#dcfce7' : '#fee2e2',
                            color: s.avg >= 50 ? '#16a34a' : '#dc2626',
                          }}>
                            {s.avg >= 50 ? 'Pass' : 'Fail'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {studentMeans.length > 0 && rankedStudents.length > 0 && (
              <div className="ct-perf-mobile-list">
                {rankedStudents.map((s) => (
                  <div key={s.id} className="ct-pm-card" onClick={() => setSelectedStudent(s)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setSelectedStudent(s) }}>
                    <div className="ct-pm-top">
                      <span className={`ct-perf-rank-cell ${s.rank <= 3 ? `rank-${s.rank}` : ''}`}>{s.rank}</span>
                      <div className="ct-student-avatar-sm">{s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                      <div className="ct-pm-name">
                        <span className="ct-pm-sname">{s.full_name || '\u2014'}</span>
                        <span className="ct-pm-sub">{s.admission_number || ''}{assignedClasses.length > 1 && s.class ? ` · ${s.class}` : ''} · {s.subjectCount} subjects</span>
                      </div>
                    </div>
                    <div className="ct-pm-bottom">
                      <div className="ct-pm-stat">
                        <span className="ct-pm-stat-label">Avg</span>
                        <span className="ct-pm-stat-value" style={{ color: getScoreColor(s.avg) }}>{s.avg}%</span>
                      </div>
                      <div className="ct-pm-stat">
                        <span className="ct-pm-stat-label">Grade</span>
                        <span className="ct-score-badge" style={{ background: s.avg >= 80 ? '#dcfce7' : s.avg >= 60 ? '#dbeafe' : s.avg >= 50 ? '#fef9c3' : '#fee2e2', color: getScoreColor(s.avg) }}>{gradeDisplay(s.cbe)}</span>
                      </div>
                      <div className="ct-pm-stat">
                        <span className="ct-pm-stat-label">Status</span>
                        <span className="ct-score-badge" style={{ background: s.avg >= 50 ? '#dcfce7' : '#fee2e2', color: s.avg >= 50 ? '#16a34a' : '#dc2626' }}>{s.avg >= 50 ? 'Pass' : 'Fail'}</span>
                      </div>
                      <div className="ct-pm-arrow"><Eye size={16} /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ct-perf-sidebar">
            {studentMeans.length > 0 && (
              <>
                <div className="ct-perf-card">
                  <p className="ct-perf-card-title"><Star size={15} /> Top 5 Performers</p>
                  {studentMeans.slice(0, 5).map((s) => (
                    <div key={s.id} className="ct-perf-student-row" onClick={() => setSelectedStudent(s)} style={{ cursor: 'pointer' }}>
                      <span className="ct-perf-rank" style={{ color: s.rank === 1 ? '#ca8a04' : s.rank <= 3 ? '#2563eb' : '#94a3b8' }}>{s.rank}</span>
                      <div className="ct-student-avatar-sm" style={{ width: 28, height: 28, fontSize: 9 }}>
                        {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="ct-perf-student-info">
                        <span className="ct-perf-student-name">{s.full_name}</span>
                        <span className="ct-perf-student-class">{s.class}</span>
                      </div>
                      <span className="ct-perf-student-avg" style={{ color: getScoreColor(s.avg) }}>{s.avg}%</span>
                    </div>
                  ))}
                </div>

                <div className="ct-perf-card">
                  <p className="ct-perf-card-title"><TrendingDown size={15} /> Bottom 5 (Needs Support)</p>
                  {studentMeans.slice(-5).reverse().map((s) => (
                    <div key={s.id} className="ct-perf-student-row" onClick={() => setSelectedStudent(s)} style={{ cursor: 'pointer' }}>
                      <span className="ct-perf-rank" style={{ color: '#dc2626' }}>{s.rank}</span>
                      <div className="ct-student-avatar-sm" style={{ width: 28, height: 28, fontSize: 9, background: '#fef2f2', color: '#dc2626' }}>
                        {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="ct-perf-student-info">
                        <span className="ct-perf-student-name">{s.full_name}</span>
                        <span className="ct-perf-student-class">{s.class}</span>
                      </div>
                      <span className="ct-perf-student-avg" style={{ color: '#dc2626' }}>{s.avg}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'classAverages' && (
        <ClassAveragesTab
          classCBCAverages={classCBCAverages}
          grades={grades}
          assignedClasses={assignedClasses}
          filterSubject={filterSubject}
          filterClass={filterClass}
          subjectsList={subjectsList}
          currentTerm={filterTerm}
          currentYear={filterYear}
          teacherData={teacherData}
        />
      )}

      {activeTab === 'reports' && (
        <div className="ct-perf-card">
          <div className="ct-reports-header">
            <p className="ct-perf-card-title"><FileText size={15} /> Report Cards</p>
            <div className="ct-reports-actions">
              {reportEntries.length > 0 && (
                <>
                  <button className="ct-perf-export-btn" onClick={handleBulkPrint}>
                    <Printer size={14} /> Print All
                  </button>
                  <span className="ct-text-muted">{reportEntries.length} students</span>
                </>
              )}
            </div>
          </div>
          {reportLoading ? (
            <p className="ct-text-muted" style={{ textAlign: 'center', padding: 30 }}>Loading report cards...</p>
          ) : reportEntries.length === 0 ? (
            <p className="ct-text-muted" style={{ textAlign: 'center', padding: 30 }}>
              No report card data for {filterTerm} {filterYear}. Make sure grades have been entered and approved.
            </p>
          ) : (
            <div className="ct-perf-table-wrap">
              <table className="ct-perf-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student</th>
                    <th>Adm No.</th>
                    {assignedClasses.length > 1 && <th>Class</th>}
                    <th>Subjects</th>
                    <th>Average</th>
                    <th>Grade</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {reportEntries.map((e, i) => (
                    <tr key={e.student.id}>
                      <td>{i + 1}</td>
                      <td>
                        <div className="ct-student-name-cell">
                          <div className="ct-student-avatar-sm">
                            {e.student.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <p className="ct-sname">{e.student.full_name || '\u2014'}</p>
                        </div>
                      </td>
                      <td className="ct-adm-no">{e.student.admission_number || '\u2014'}</td>
                      {assignedClasses.length > 1 && <td className="ct-sclass">{e.student.class || ''}</td>}
                      <td>{e.grades.length}</td>
                      <td>
                        <span className="ct-score-value" style={{ color: getScoreColor(e.avg) }}>
                          {e.avg}%
                        </span>
                      </td>
                      <td>
                        <span className="ct-score-badge" style={{
                          background: e.avg >= 80 ? '#dcfce7' : e.avg >= 60 ? '#dbeafe' : e.avg >= 50 ? '#fef9c3' : '#fee2e2',
                          color: getScoreColor(e.avg),
                        }}>
                          {gradeDisplay(getCBEGrade(e.avg, e.student.class))}
                        </span>
                      </td>
                      <td>{getCBEGrade(e.avg, e.student.class).points || '\u2014'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!reportLoading && reportEntries.length > 0 && (
            <div className="ct-perf-mobile-list">
              {reportEntries.map((e, i) => (
                <div key={e.student.id} className="ct-pm-card" onClick={() => setSelectedStudent({ ...e.student, avg: e.avg, grades: e.grades })} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') setSelectedStudent({ ...e.student, avg: e.avg, grades: e.grades }) }}>
                  <div className="ct-pm-top">
                    <span className="ct-pm-idx">{i + 1}</span>
                    <div className="ct-student-avatar-sm">{e.student.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                    <div className="ct-pm-name">
                      <span className="ct-pm-sname">{e.student.full_name || '\u2014'}</span>
                      <span className="ct-pm-sub">{e.student.admission_number || ''}{assignedClasses.length > 1 && e.student.class ? ` · ${e.student.class}` : ''} · {e.grades.length} subjects</span>
                    </div>
                  </div>
                  <div className="ct-pm-bottom">
                    <div className="ct-pm-stat">
                      <span className="ct-pm-stat-label">Avg</span>
                      <span className="ct-pm-stat-value" style={{ color: getScoreColor(e.avg) }}>{e.avg}%</span>
                    </div>
                    <div className="ct-pm-stat">
                      <span className="ct-pm-stat-label">Grade</span>
                      <span className="ct-score-badge" style={{ background: e.avg >= 80 ? '#dcfce7' : e.avg >= 60 ? '#dbeafe' : e.avg >= 50 ? '#fef9c3' : '#fee2e2', color: getScoreColor(e.avg) }}>{gradeDisplay(getCBEGrade(e.avg, e.student.class))}</span>
                    </div>
                    <div className="ct-pm-stat">
                      <span className="ct-pm-stat-label">Points</span>
                      <span className="ct-pm-stat-value">{getCBEGrade(e.avg, e.student.class).points || '\u2014'}</span>
                    </div>
                    <div className="ct-pm-arrow"><Eye size={16} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedStudent && (
        <div className="ct-modal-overlay" onClick={() => setSelectedStudent(null)}>
          <div className="ct-modal" onClick={e => e.stopPropagation()}>
            <div className="ct-modal-header">
              <h3>{selectedStudent.full_name || 'Student'}</h3>
              <button className="ct-modal-close" onClick={() => setSelectedStudent(null)}><X size={18} /></button>
            </div>
            <div className="ct-modal-body">
              <div className="ct-modal-info-row">
                <span>Adm No: <strong>{selectedStudent.admission_number || '\u2014'}</strong></span>
                <span>Class: <strong>{selectedStudent.class || '\u2014'}</strong></span>
                <span>Average: <strong style={{ color: getScoreColor(selectedStudent.avg || 0) }}>{selectedStudent.avg ?? '\u2014'}%</strong></span>
                {selectedStudent.cbe && (
                  <span>Grade: <strong>{selectedStudent.cbe.band || selectedStudent.cbe.grade || '\u2014'}</strong></span>
                )}
              </div>
              {selectedStudent.grades && selectedStudent.grades.length > 0 ? (
                <div className="ct-perf-detail-groups">
                  {(() => {
                    const bySubject = {}
                    selectedStudent.grades.forEach(g => {
                      const sub = g.subject || 'Unknown'
                      if (!bySubject[sub]) bySubject[sub] = []
                      bySubject[sub].push(g)
                    })
                    return Object.entries(bySubject).sort(([a], [b]) => a.localeCompare(b)).map(([subject, exams]) => {
                      const subAvg = Math.round(weightedScoreMean(exams))
                      return (
                        <div key={subject} className="ct-perf-detail-subject">
                          <div className="ct-perf-detail-subject-header">
                            <span className="ct-perf-detail-subject-name">{subject}</span>
                            <span className="ct-score-value" style={{ color: getScoreColor(subAvg) }}>{subAvg}%</span>
                          </div>
                          <div className="ct-perf-detail-exams">
                            {exams.map(g => (
                              <div key={g.id} className="ct-perf-detail-exam-row">
                                <span className="ct-perf-detail-exam-name">{g.exam_type || 'End Term'}</span>
                                <span className="ct-perf-detail-exam-score" style={{ color: getScoreColor(g.total_score || 0) }}>
                                  {g.total_score ?? '\u2014'}%
                                </span>
                                <span className="ct-score-badge" style={{
                                  background: (g.total_score || 0) >= 50 ? '#dcfce7' : '#fee2e2',
                                  color: (g.total_score || 0) >= 50 ? '#16a34a' : '#dc2626',
                                  fontSize: 10, padding: '2px 6px',
                                }}>
                                  {(g.total_score || 0) >= 50 ? 'Pass' : 'Fail'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              ) : (
                <p className="ct-text-muted" style={{ textAlign: 'center', padding: 20 }}>No grades recorded for this student.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {distModal && (
        <div className="ct-modal-overlay" onClick={() => setDistModal(false)}>
          <div className="ct-modal" onClick={e => e.stopPropagation()}>
            <div className="ct-modal-header">
              <h3>Grade Distribution</h3>
              <button className="ct-modal-close" onClick={() => setDistModal(false)}><X size={18} /></button>
            </div>
            <div className="ct-modal-body">
              {summary.total === 0 ? (
                <p className="ct-text-muted" style={{ textAlign: 'center', padding: 20 }}>No data yet.</p>
              ) : (
                <div className="ct-perf-grade-dist">
                  {distBands.map(b => {
                    const count = gradeDist[b] || 0
                    const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0
                    return (
                      <div key={b} className="ct-perf-grade-row">
                        <div className="ct-perf-grade-label">
                          <span className="ct-perf-grade-letter" style={{ color: bandColor(b) }}>{b}</span>
                          <span className="ct-perf-grade-count">{count} ({pct}%)</span>
                        </div>
                        <div className="ct-perf-grade-track">
                          <div className="ct-perf-grade-fill" style={{ width: `${pct}%`, background: bandColor(b) }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {topModal && (
        <div className="ct-modal-overlay" onClick={() => setTopModal(false)}>
          <div className="ct-modal" onClick={e => e.stopPropagation()}>
            <div className="ct-modal-header">
              <h3>Top Students</h3>
              <button className="ct-modal-close" onClick={() => setTopModal(false)}><X size={18} /></button>
            </div>
            <div className="ct-modal-body">
              {studentMeans.length === 0 ? (
                <p className="ct-text-muted" style={{ textAlign: 'center', padding: 20 }}>No data yet.</p>
              ) : (
                studentMeans.slice(0, 5).map((s) => (
                  <div key={s.id} className="ct-perf-student-row" onClick={() => { setTopModal(false); setSelectedStudent(s) }} style={{ cursor: 'pointer' }}>
                    <span className="ct-perf-rank" style={{ color: s.rank === 1 ? '#ca8a04' : s.rank <= 3 ? '#2563eb' : '#94a3b8' }}>{s.rank}</span>
                    <div className="ct-student-avatar-sm" style={{ width: 28, height: 28, fontSize: 9 }}>
                      {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="ct-perf-student-info">
                      <span className="ct-perf-student-name">{s.full_name}</span>
                      <span className="ct-perf-student-class">{s.class}</span>
                    </div>
                    <span className="ct-perf-student-avg" style={{ color: getScoreColor(s.avg) }}>{s.avg}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {subjModal && (
        <div className="ct-modal-overlay" onClick={() => setSubjModal(false)}>
          <div className="ct-modal" onClick={e => e.stopPropagation()}>
            <div className="ct-modal-header">
              <h3>Subject Averages</h3>
              <button className="ct-modal-close" onClick={() => setSubjModal(false)}><X size={18} /></button>
            </div>
            <div className="ct-modal-body">
              {subjectMeans.length === 0 ? (
                <p className="ct-text-muted" style={{ textAlign: 'center', padding: 20 }}>No data yet.</p>
              ) : (
                subjectMeans.map(s => (
                  <div key={s.name} className="ct-perf-bar-row">
                    <span className="ct-perf-bar-label">{s.name}</span>
                    <div className="ct-perf-bar-track">
                      <div className="ct-perf-bar-fill" style={{
                        width: `${s.avg}%`,
                        background: s.avg >= 80 ? '#16a34a' : s.avg >= 60 ? '#2563eb' : s.avg >= 50 ? '#ca8a04' : s.avg >= 40 ? '#f97316' : '#dc2626'
                      }} />
                    </div>
                    <span className="ct-perf-bar-val">{s.avg}%</span>
                    <span className="ct-perf-count">{s.count} rec</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const CT_REPORT_STYLES = `
  ${REPORT_CARD_STYLES}
  .rc-wrap { max-width: 900px; }
  .rc-center-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
  .rc-center-table th {
    background: #1e293b; color: #fff; padding: 8px 10px;
    text-align: left; font-weight: 700; font-size: 10px;
    border: 1px solid #94a3b8; text-transform: uppercase; letter-spacing: 0.03em;
  }
  .rc-center-table td { padding: 7px 10px; border: 1px solid #cbd5e1; color: #1e293b; }
  .rc-center-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .rc-center-table tbody tr:hover td { background: #f1f5f9; }
  .rc-center-metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0; }
  .rc-center-metric { padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center; }
  .rc-center-metric-value { font-size: 18px; font-weight: 700; color: #0f172a; }
  .rc-center-metric-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
  .rc-center-title { font-size: 16px; font-weight: 800; color: #0f172a; text-align: center; margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .rc-center-subtitle { font-size: 11px; color: #64748b; text-align: center; margin-bottom: 10px; }
  .rc-center-section-title { font-size: 12px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; margin: 14px 0 8px; }
  .rc-center-footer { text-align: center; font-size: 9px; color: #94a3b8; margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    body { margin: 0; padding: 0; }
    .rc-wrap { width: 100%; max-width: none; padding: 12px 16px; }
  }
`

function buildClassReportHtml(bodyContent, title, school, term, year) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(title)} – ${esc(term)} ${esc(year)}</title>
<style>${CT_REPORT_STYLES}</style></head><body>
<div class="rc-wrap">
  <div class="rc-top">
    <div class="rc-logo-box">
      ${school?.logo_url ? `<img src="${esc(school.logo_url)}" alt="Logo" />` : `<div class="rc-logo-placeholder">${esc((school?.name || 'S')[0])}</div>`}
    </div>
    <div class="rc-school-block">
      <div class="rc-school-name">${esc(school?.name || 'School')}</div>
      ${school?.address ? `<div class="rc-school-contact">${esc(school.address)}${school.phone ? ' · ' + esc(school.phone) : ''}${school.email ? ' · ' + esc(school.email) : ''}</div>` : ''}
      ${school?.motto ? `<div class="rc-school-contact" style="font-style:italic">"${esc(school.motto)}"</div>` : ''}
    </div>
  </div>
  <hr class="rc-hr" />
  ${bodyContent}
  <div class="rc-center-footer">Generated on ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })} · ${esc(term)} ${esc(year)}</div>
</div></body></html>`
}

function printClassReport(html) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.onload = () => { win.focus(); win.print() }
}

function ClassAveragesTab({ classCBCAverages, grades, assignedClasses, filterSubject, filterClass, subjectsList, currentTerm, currentYear, teacherData }) {
  const [expandedClass, setExpandedClass] = useState(null)
  const [detailClass, setDetailClass] = useState(null)

  const bandBarWidth = (pct) => Math.max(pct, 2)

  const displayedClasses = filterClass && filterClass !== 'all'
    ? classCBCAverages.filter(c => c.name === filterClass)
    : classCBCAverages

  const classSubjectBreakdown = (() => {
    const activeFor = expandedClass || detailClass
    if (!activeFor) return []
    const map = {}
    grades.forEach(g => {
      if (g.students?.class !== activeFor) return
      if (!g.subject) return
      if (!map[g.subject]) map[g.subject] = { scores: [], points: [], count: 0, bands: { EE: 0, ME: 0, AE: 0, BE: 0 } }
      const score = Number(g.total_score || 0)
      const pts = getCBEGrade(score, g.students?.class).points || 0
      map[g.subject].scores.push(score)
      map[g.subject].points.push(pts)
      map[g.subject].count += 1
      map[g.subject].bands[cbcBand(pts)] += 1
    })
    return Object.entries(map).map(([name, d]) => {
      const meanPts = d.points.length > 0
        ? Math.round(d.points.reduce((a, b) => a + b, 0) / d.points.length * 10) / 10
        : 0
      const dist = {}
      Object.keys(d.bands).forEach(b => { dist[b] = d.count > 0 ? Math.round((d.bands[b] / d.count) * 100) : 0 })
      return { name, meanPoints: meanPts, grade: cbcBandLabel(Math.round(meanPts)), band: cbcBand(Math.round(meanPts)), count: d.count, dist }
    }).sort((a, b) => b.meanPoints - a.meanPoints)
  })()

  const overallMeanPoints = displayedClasses.length > 0
    ? Math.round(displayedClasses.reduce((s, c) => s + c.meanPoints, 0) / displayedClasses.length * 10) / 10
    : 0
  const overallStudents = displayedClasses.reduce((s, c) => s + c.students, 0)
  const overallBand = cbcBand(Math.round(overallMeanPoints))

  const overallDistPct = {}
  ;['EE', 'ME', 'AE', 'BE'].forEach(b => {
    let totalInBand = 0
    displayedClasses.forEach(c => { totalInBand += Math.round(c.dist[b] * c.students / 100) })
    overallDistPct[b] = overallStudents > 0 ? Math.round((totalInBand / overallStudents) * 100) : 0
  })

  const exportClassPDF = async (cls) => {
    const win = window.open('', '_blank')
    if (!win) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('schools(name, logo_url, address, phone, email, motto)')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()
    const schoolData = profile?.schools

    const bandColor = CBC_BAND_COLORS[cls.band]
    const allMap = {}
    grades.forEach(g => {
      if (g.students?.class !== cls.name) return
      if (!g.subject) return
      if (!allMap[g.subject]) allMap[g.subject] = { points: [], count: 0, bands: { EE: 0, ME: 0, AE: 0, BE: 0 } }
      const score = Number(g.total_score || 0)
      const pts = getCBEGrade(score, g.students?.class).points || 0
      allMap[g.subject].points.push(pts)
      allMap[g.subject].count += 1
      allMap[g.subject].bands[cbcBand(pts)] += 1
    })
    const subjectTableRows = Object.entries(allMap).map(([name, d]) => {
      const meanPts = d.points.length > 0 ? Math.round(d.points.reduce((a, b) => a + b, 0) / d.points.length * 10) / 10 : 0
      const dist = {}
      Object.keys(d.bands).forEach(b => { dist[b] = d.count > 0 ? Math.round((d.bands[b] / d.count) * 100) : 0 })
      const sBand = CBC_BAND_COLORS[cbcBand(Math.round(meanPts))]
      return `<tr>
        <td style="font-weight:500">${esc(name)}</td>
        <td style="text-align:center;font-weight:700;color:${sBand?.color || '#64748b'}">${meanPts}/8</td>
        <td style="text-align:center"><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${sBand?.bg || '#f1f5f9'};color:${sBand?.color || '#64748b'}">${cbcBandLabel(Math.round(meanPts))}</span></td>
        <td style="text-align:center">${dist.EE}%</td><td style="text-align:center">${dist.ME}%</td><td style="text-align:center">${dist.AE}%</td><td style="text-align:center">${dist.BE}%</td>
      </tr>`
    }).sort((a, b) => a.localeCompare(b)).join('')

    const distBarHtml = ['EE', 'ME', 'AE', 'BE'].map(band =>
      `<div style="text-align:center;flex:1;padding:12px 8px;background:${CBC_BAND_COLORS[band].bg};border-radius:8px;border:1px solid ${CBC_BAND_COLORS[band].color}22">
        <div style="font-size:24px;font-weight:700;color:${CBC_BAND_COLORS[band].color}">${cls.dist[band]}%</div>
        <div style="font-size:11px;font-weight:600;color:${CBC_BAND_COLORS[band].color};margin-top:2px">${band}</div>
        <div style="font-size:9px;color:#64748b">${CBC_BAND_COLORS[band].label}</div>
      </div>`
    ).join('')

    const body = `
      <div class="rc-center-title">${esc(cls.name)} - CBC Proficiency Report</div>
      <div class="rc-center-subtitle">${esc(currentTerm)} ${esc(currentYear)} · ${cls.students} students</div>
      <div class="rc-center-metric-grid">
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:${bandColor?.color || '#64748b'}">${cls.meanPoints}/8</div><div class="rc-center-metric-label">Mean Points</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:${bandColor?.color || '#64748b'}">${cls.meanGrade}</div><div class="rc-center-metric-label">Grade</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#16a34a">${cls.highest}</div><div class="rc-center-metric-label">Highest</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#dc2626">${cls.lowest}</div><div class="rc-center-metric-label">Lowest</div></div>
      </div>
      <div class="rc-center-section-title">Proficiency Distribution</div>
      <div style="display:flex;gap:10px;margin-bottom:16px">${distBarHtml}</div>
      <div class="rc-center-section-title">Subject Breakdown</div>
      <table class="rc-center-table"><thead><tr><th>Subject</th><th style="text-align:center">Mean Points</th><th style="text-align:center">Grade</th><th style="text-align:center">EE</th><th style="text-align:center">ME</th><th style="text-align:center">AE</th><th style="text-align:center">BE</th></tr></thead><tbody>${subjectTableRows}</tbody></table>
    `
    const html = buildClassReportHtml(body, `${cls.name} CBC Proficiency`, schoolData, currentTerm, currentYear)
    win.document.write(html)
    win.document.close()
    win.onload = () => { win.focus(); win.print() }
  }

  return (
    <div className="ct-perf-grid-full">
      <div className="ct-perf-summary">
        <div className="ct-perf-sum-card blue">
          <Users size={20} />
          <div><p className="ct-psc-label">Classes</p><p className="ct-psc-value">{displayedClasses.length}</p></div>
        </div>
        <div className="ct-perf-sum-card purple">
          <BarChart3 size={20} />
          <div><p className="ct-psc-label">Overall Mean</p><p className="ct-psc-value" style={{ color: CBC_BAND_COLORS[overallBand]?.color }}>{overallMeanPoints}/8</p></div>
        </div>
        <div className="ct-perf-sum-card green">
          <TrendingUp size={20} />
          <div><p className="ct-psc-label">Total Students</p><p className="ct-psc-value">{overallStudents}</p></div>
        </div>
        <div className="ct-perf-sum-card red">
          <Award size={20} />
          <div><p className="ct-psc-label">Top Class</p><p className="ct-psc-value" style={{ color: '#16a34a' }}>{displayedClasses.length > 0 ? `${displayedClasses[0].name} (${displayedClasses[0].meanPoints}/8)` : '\u2014'}</p></div>
        </div>
      </div>

      <div className="ct-perf-card">
        <p className="ct-perf-card-title"><BarChart3 size={15} /> Overall Proficiency Distribution</p>
        <div className="ct-cbc-metric-grid">
          {['EE', 'ME', 'AE', 'BE'].map(band => (
            <div key={band} className="ct-cbc-metric-card" style={{ background: CBC_BAND_COLORS[band].bg, borderColor: `${CBC_BAND_COLORS[band].color}22` }}>
              <div className="ct-cbc-metric-value" style={{ color: CBC_BAND_COLORS[band].color }}>{overallDistPct[band]}%</div>
              <div className="ct-cbc-metric-label" style={{ color: CBC_BAND_COLORS[band].color }}>{band}</div>
              <div className="ct-cbc-metric-sublabel" style={{ color: '#64748b' }}>{CBC_BAND_COLORS[band].label}</div>
            </div>
          ))}
        </div>
        <div className="ct-cbc-proficiency-bar">
          {['EE', 'ME', 'AE', 'BE'].map(band => (
            <div key={band} style={{ width: `${bandBarWidth(overallDistPct[band])}%`, background: CBC_BAND_COLORS[band].color }} title={`${band}: ${overallDistPct[band]}%`} />
          ))}
        </div>
        <div className="ct-cbc-proficiency-labels">
          {['EE', 'ME', 'AE', 'BE'].map(band => (
            <span key={band} className="ct-cbc-proficiency-label" style={{ color: CBC_BAND_COLORS[band].color }}>
              <span className="ct-cbc-proficiency-dot" style={{ background: CBC_BAND_COLORS[band].color }} />
              {band} {overallDistPct[band]}%
            </span>
          ))}
        </div>
      </div>

      <div className="ct-perf-card">
        <p className="ct-perf-card-title"><Users size={15} /> Class CBC Proficiency</p>
        {displayedClasses.length === 0 ? (
          <div className="ct-empty-state">
            <p className="ct-text-muted">No class data available for this term.</p>
          </div>
        ) : (
          <div className="ct-perf-table-wrap">
            <table className="ct-perf-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Class</th>
                  <th style={{ textAlign: 'center' }}>Students</th>
                  <th style={{ textAlign: 'center' }}>Mean Points</th>
                  <th style={{ textAlign: 'center' }}>Grade</th>
                  <th style={{ textAlign: 'center' }}>Proficiency</th>
                  <th style={{ textAlign: 'center' }}>Highest</th>
                  <th style={{ textAlign: 'center' }}>Lowest</th>
                  <th style={{ textAlign: 'center' }}>Median</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedClasses.map((c, i) => {
                  const isExpanded = expandedClass === c.name
                  const bColor = CBC_BAND_COLORS[c.band]
                  const barWidth = displayedClasses[0]?.meanPoints > 0 ? Math.round((c.meanPoints / displayedClasses[0].meanPoints) * 100) : 0
                  return (
                    <Fragment key={c.name}>
                      <tr
                        onClick={() => setExpandedClass(prev => prev === c.name ? null : c.name)}
                        className="ct-cbc-class-row-clickable"
                        style={{ background: isExpanded ? '#f3e8ff' : i % 2 === 0 ? '#fff' : '#fafbfc' }}
                      >
                        <td>{i + 1}</td>
                        <td className="ct-cbc-class-name">{c.name}</td>
                        <td style={{ textAlign: 'center' }}>{c.students}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="ct-progress-wrap">
                            <div className="ct-progress-track">
                              <div className="ct-progress-fill" style={{ width: `${barWidth}%`, background: bColor?.color || '#94a3b8' }} />
                            </div>
                            <span className="ct-progress-value" style={{ color: bColor?.color || '#64748b' }}>{c.meanPoints}/8</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="ct-score-badge" style={{ background: bColor?.bg, color: bColor?.color }}>{c.meanGrade}</span>
                        </td>
                        <td style={{ textAlign: 'center', minWidth: 160 }}>
                          <div className="ct-cbc-proficiency-bar" style={{ height: 8 }}>
                            {['EE', 'ME', 'AE', 'BE'].map(band => (
                              <div key={band} style={{ width: `${bandBarWidth(c.dist[band])}%`, background: CBC_BAND_COLORS[band].color }} title={`${band}: ${c.dist[band]}%`} />
                            ))}
                          </div>
                          <div className="ct-cbc-proficiency-labels" style={{ marginTop: 4, justifyContent: 'center' }}>
                            {['EE', 'ME', 'AE', 'BE'].map(band => (
                              <span key={band} className="ct-cbc-proficiency-label" style={{ color: CBC_BAND_COLORS[band].color, fontSize: 9 }}>
                                {band} {c.dist[band]}%
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 500 }}>{c.highest}</td>
                        <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 500 }}>{c.lowest}</td>
                        <td style={{ textAlign: 'center', color: '#64748b' }}>{c.median}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="ct-cbc-class-actions">
                            <button
                              className={`ct-cbc-class-action-btn subjects ${isExpanded ? 'active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); setExpandedClass(prev => prev === c.name ? null : c.name) }}
                            >
                              {isExpanded ? 'Close' : 'Subjects'}
                            </button>
                            <button
                              className="ct-cbc-class-action-btn pdf"
                              onClick={(e) => { e.stopPropagation(); exportClassPDF(c) }}
                            >
                              <FileText size={12} /> PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={10} style={{ padding: 0, background: '#faf5ff', borderBottom: '2px solid #e2e8f0' }}>
                            <div className="ct-cbc-class-detail">
                              <div className="ct-cbc-class-detail-header">
                                <span className="ct-cbc-class-detail-name">{c.name}</span>
                                <span className="ct-cbc-class-detail-count">{c.students} students</span>
                                <span className="ct-cbc-class-detail-mean" style={{ background: bColor?.bg, color: bColor?.color }}>
                                  Mean: {c.meanPoints}/8 &mdash; {c.meanGrade}
                                </span>
                              </div>
                              <div className="ct-cbc-band-grid">
                                {['EE', 'ME', 'AE', 'BE'].map(band => (
                                  <div key={band} className="ct-cbc-band-card" style={{ background: CBC_BAND_COLORS[band].bg }}>
                                    <div className="ct-cbc-band-value" style={{ color: CBC_BAND_COLORS[band].color }}>{c.dist[band]}%</div>
                                    <div className="ct-cbc-band-label" style={{ color: CBC_BAND_COLORS[band].color }}>{band}</div>
                                  </div>
                                ))}
                              </div>
                              <div className="ct-cbc-subject-grid">
                                {classSubjectBreakdown.map((s, si) => {
                                  const sBand = CBC_BAND_COLORS[s.band]
                                  return (
                                    <div key={si} className="ct-cbc-subject-card" style={{ borderLeft: `3px solid ${sBand?.color || '#94a3b8'}` }}>
                                      <div className="ct-cbc-subject-header">
                                        <span className="ct-cbc-subject-name">{s.name}</span>
                                        <div className="ct-cbc-subject-score">
                                          <span className="ct-cbc-subject-points" style={{ color: sBand?.color || '#64748b' }}>{s.meanPoints}/8</span>
                                          <span className="ct-cbc-subject-band" style={{ background: sBand?.bg, color: sBand?.color }}>{s.grade}</span>
                                        </div>
                                      </div>
                                      <div className="ct-cbc-proficiency-bar" style={{ height: 6 }}>
                                        {['EE', 'ME', 'AE', 'BE'].map(band => (
                                          <div key={band} style={{ width: `${bandBarWidth(s.dist[band])}%`, background: CBC_BAND_COLORS[band].color }} />
                                        ))}
                                      </div>
                                      <div className="ct-cbc-proficiency-labels" style={{ justifyContent: 'center' }}>
                                        {['EE', 'ME', 'AE', 'BE'].map(band => (
                                          <span key={band} className="ct-cbc-proficiency-label" style={{ color: CBC_BAND_COLORS[band].color, fontSize: 9 }}>
                                            {band} {s.dist[band]}%
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                })}
                                {classSubjectBreakdown.length === 0 && <span className="ct-text-muted">No subject data</span>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="ct-cbc-mobile-list">
          {displayedClasses.length === 0 ? (
            <p className="ct-text-muted" style={{ textAlign: 'center', padding: 20 }}>No class data available for this term.</p>
          ) : (
            displayedClasses.map((c, i) => {
              const bColor = CBC_BAND_COLORS[c.band]
              return (
                <div key={c.name} className="ct-cbc-mcard" onClick={() => setDetailClass(c)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setDetailClass(c) }}>
                  <div className="ct-cbc-mcard-head">
                    <div>
                      <span className="ct-cbc-mcard-rank">{i + 1}</span>
                      <span className="ct-cbc-mcard-class">{c.name}</span>
                    </div>
                    <span className="ct-score-badge" style={{ background: bColor?.bg, color: bColor?.color }}>{c.meanGrade}</span>
                  </div>
                  <div className="ct-cbc-mcard-stats">
                    <div className="ct-cbc-mcard-stat">
                      <span className="ct-pm-stat-label">Students</span>
                      <span className="ct-pm-stat-value">{c.students}</span>
                    </div>
                    <div className="ct-cbc-mcard-stat">
                      <span className="ct-pm-stat-label">Mean</span>
                      <span className="ct-pm-stat-value" style={{ color: bColor?.color }}>{c.meanPoints}/8</span>
                    </div>
                    <div className="ct-cbc-mcard-stat">
                      <span className="ct-pm-stat-label">Highest</span>
                      <span className="ct-pm-stat-value" style={{ color: '#16a34a' }}>{c.highest}</span>
                    </div>
                    <div className="ct-cbc-mcard-stat">
                      <span className="ct-pm-stat-label">Lowest</span>
                      <span className="ct-pm-stat-value" style={{ color: '#dc2626' }}>{c.lowest}</span>
                    </div>
                    <div className="ct-cbc-mcard-stat">
                      <span className="ct-pm-stat-label">Median</span>
                      <span className="ct-pm-stat-value">{c.median}</span>
                    </div>
                  </div>
                  <div className="ct-cbc-proficiency-bar" style={{ height: 8 }}>
                    {['EE', 'ME', 'AE', 'BE'].map(band => (
                      <div key={band} style={{ width: `${bandBarWidth(c.dist[band])}%`, background: CBC_BAND_COLORS[band].color }} />
                    ))}
                  </div>
                  <div className="ct-cbc-proficiency-labels" style={{ justifyContent: 'center' }}>
                    {['EE', 'ME', 'AE', 'BE'].map(band => (
                      <span key={band} className="ct-cbc-proficiency-label" style={{ color: CBC_BAND_COLORS[band].color, fontSize: 9 }}>
                        {band} {c.dist[band]}%
                      </span>
                    ))}
                  </div>
                  <button className="ct-cbc-mcard-btn" onClick={(e) => { e.stopPropagation(); setDetailClass(c) }}>
                    View Subject Breakdown <Eye size={14} />
                  </button>
                </div>
              )
            })
          )}
        </div>

        {detailClass && (
          <div className="ct-modal-overlay" onClick={() => setDetailClass(null)}>
            <div className="ct-modal" onClick={e => e.stopPropagation()}>
              <div className="ct-modal-header">
                <h3>{detailClass.name} — Subject Breakdown</h3>
                <button className="ct-modal-close" onClick={() => setDetailClass(null)}><X size={18} /></button>
              </div>
              <div className="ct-modal-body">
                <div className="ct-pm-top" style={{ marginBottom: 14 }}>
                  <div className="ct-student-avatar-sm">{detailClass.name?.[0] || 'C'}</div>
                  <div className="ct-pm-name">
                    <span className="ct-pm-sname">{detailClass.name}</span>
                    <span className="ct-pm-sub">{detailClass.students} students · Mean {detailClass.meanPoints}/8 · {detailClass.meanGrade}</span>
                  </div>
                </div>
                <div className="ct-cbc-band-grid" style={{ marginBottom: 16 }}>
                  {['EE', 'ME', 'AE', 'BE'].map(band => (
                    <div key={band} className="ct-cbc-band-card" style={{ background: CBC_BAND_COLORS[band].bg }}>
                      <div className="ct-cbc-band-value" style={{ color: CBC_BAND_COLORS[band].color }}>{detailClass.dist[band]}%</div>
                      <div className="ct-cbc-band-label" style={{ color: CBC_BAND_COLORS[band].color }}>{band}</div>
                    </div>
                  ))}
                </div>
                {classSubjectBreakdown.length > 0 ? (
                  <div className="ct-cbc-subject-grid">
                    {classSubjectBreakdown.map((s, si) => {
                      const sBand = CBC_BAND_COLORS[s.band]
                      return (
                        <div key={si} className="ct-cbc-subject-card" style={{ borderLeft: `3px solid ${sBand?.color || '#94a3b8'}` }}>
                          <div className="ct-cbc-subject-header">
                            <span className="ct-cbc-subject-name">{s.name}</span>
                            <div className="ct-cbc-subject-score">
                              <span className="ct-cbc-subject-points" style={{ color: sBand?.color || '#64748b' }}>{s.meanPoints}/8</span>
                              <span className="ct-cbc-subject-band" style={{ background: sBand?.bg, color: sBand?.color }}>{s.grade}</span>
                            </div>
                          </div>
                          <div className="ct-cbc-proficiency-bar" style={{ height: 6 }}>
                            {['EE', 'ME', 'AE', 'BE'].map(band => (
                              <div key={band} style={{ width: `${bandBarWidth(s.dist[band])}%`, background: CBC_BAND_COLORS[band].color }} />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                    {classSubjectBreakdown.length === 0 && <span className="ct-text-muted">No subject data</span>}
                  </div>
                ) : (
                  <p className="ct-text-muted" style={{ textAlign: 'center', padding: 20 }}>Expand this class inline on desktop to load subject breakdown, or select it above.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
  )
}
