import { useState, useEffect } from 'react'
import {
  Download, FileText, FileSpreadsheet, Award,
  Eye, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { esc } from '../../utils/escapeHtml'
import { useSchool } from '../admin/useSchool'
import { REPORT_CARD_STYLES } from '../../components/students/ReportCard'
import { getGrade, gradeShort, weightedScoreMean, rankEntries } from '../../services/grading'

const TABS = [
  { key: 'draft', label: 'Draft Report Cards', icon: FileText },
  { key: 'merit', label: 'Merit List', icon: Award },
  { key: 'export', label: 'Export Hub', icon: Download },
]

function computeGrade(score, className) {
  return gradeShort(getGrade(score, className || ''))
}

const REPORT_CENTER_STYLES = `
  ${REPORT_CARD_STYLES}
  .rc-wrap { max-width: 900px; }
  .rc-center-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
  .rc-center-table th {
    background: #1e293b; color: #fff; padding: 8px 10px;
    text-align: left; font-weight: 700; font-size: 10px;
    border: 1px solid #94a3b8; text-transform: uppercase; letter-spacing: 0.03em;
  }
  .rc-center-table td {
    padding: 7px 10px; border: 1px solid #cbd5e1; color: #1e293b;
  }
  .rc-center-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .rc-center-table tbody tr:hover td { background: #f1f5f9; }
  .rc-center-table .rank-cell { font-weight: 700; text-align: center; width: 40px; }
  .rc-center-table .avg-cell { font-weight: 600; text-align: center; }
  .rc-center-table .grade-cell { text-align: center; }
  .rc-center-metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 12px 0; }
  .rc-center-metric { padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center; }
  .rc-center-metric-value { font-size: 18px; font-weight: 700; color: #0f172a; }
  .rc-center-metric-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
  .rc-center-title { font-size: 16px; font-weight: 800; color: #0f172a; text-align: center; margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .rc-center-subtitle { font-size: 11px; color: #64748b; text-align: center; margin-bottom: 10px; }
  .rc-center-footer { text-align: center; font-size: 9px; color: #94a3b8; margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
  .status-present { color: #16a34a; font-weight: 700; }
  .status-absent { color: #dc2626; font-weight: 700; }
  .status-late { color: #ca8a04; font-weight: 700; }
  .status-excused { color: #2563eb; font-weight: 700; }
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    body { margin: 0; padding: 0; }
    .rc-wrap { width: 100%; max-width: none; padding: 12px 16px; }
    .rc-page-break { page-break-after: always; break-after: page; }
    .rc-page-break:last-child { page-break-after: auto; break-after: auto; }
  }
`

function buildReportHtml(bodyContent, title, school, term, year) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(title)} – ${esc(term)} ${esc(year)}</title>
<style>${REPORT_CENTER_STYLES}</style></head>
<body>
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
</div>
</body></html>`
}

function printReport(html) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.onload = () => { win.focus(); win.print() }
}

export default function ReportCenter() {
  const { currentTerm, currentYear } = useSchool()
  const [activeTab, setActiveTab] = useState('draft')
  const [loading, setLoading] = useState(true)
  const [grades, setGrades] = useState([])
  const [subjects, setSubjects] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [previewClass, setPreviewClass] = useState(null)
  const [meritLimit, setMeritLimit] = useState(20)
  const [schoolId, setSchoolId] = useState(null)
  const [exportingCard, setExportingCard] = useState(null)

  useEffect(() => {
    fetchData()
  }, [currentTerm, currentYear])

  const fetchData = async () => {
    setLoading(true)
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const sid = profile?.school_id
    setSchoolId(sid)
    if (!sid) { setLoading(false); return }

    const [subjectsRes, gradesRes] = await Promise.all([
      supabase.from('subjects').select('*').eq('school_id', sid).order('name'),
      supabase
        .from('grades')
        .select('*, students(full_name, class, stream, admission_number)')
        .eq('school_id', sid)
        .eq('term', currentTerm)
        .eq('year', currentYear),
    ])

    setSubjects(subjectsRes.data || [])
    setGrades(gradesRes.data || [])
    setLoading(false)
  }

  const classes = [...new Set(grades.map(g => g.students?.class).filter(Boolean))].sort()

  const classSummaries = classes.map(cls => {
    const classGrades = grades.filter(g => g.students?.class === cls)
    const studentIds = [...new Set(classGrades.map(g => g.student_id))]
    const subjectSet = [...new Set(classGrades.map(g => g.subject).filter(Boolean))]
    const avgScore = classGrades.length > 0
      ? Math.round(weightedScoreMean(classGrades))
      : 0
    const allApproved = classGrades.every(g => g.status === 'approved' || g.approved)
    const hasGrades = classGrades.length > 0
    const status = !hasGrades ? 'Draft' : allApproved ? 'Published' : 'Reviewed'
    return { className: cls, students: studentIds.length, subjects: subjectSet.length, status, avgScore, grades: classGrades }
  })

  const filteredClassSummaries = selectedClass
    ? classSummaries.filter(c => c.className === selectedClass)
    : classSummaries

  const studentAverages = (() => {
    const map = {}
    grades.forEach(g => {
      const sid = g.student_id
      if (!sid) return
      if (!map[sid]) {
        map[sid] = {
          student_id: sid,
          name: g.students?.full_name || '—',
          admNo: g.students?.admission_number || '—',
          class: g.students?.class || '—',
          subjects: {},
          total: 0,
          count: 0,
          wtotal: 0,
          wcount: 0,
        }
      }
      map[sid].subjects[g.subject] = Number(g.total_score || 0)
      const w = Number(g.max_marks) || 100
      map[sid].wtotal += Number(g.total_score || 0) * w
      map[sid].wcount += w
      map[sid].total += Number(g.total_score || 0)
      map[sid].count += 1
    })
    return Object.values(map).map(s => ({
      ...s,
      average: s.wcount > 0 ? Math.round(s.wtotal / s.wcount) : 0,
      grade: computeGrade(s.wcount > 0 ? Math.round(s.wtotal / s.wcount) : 0, s.class),
    })).sort((a, b) => b.average - a.average)
  })()

  const filteredMerit = selectedClass
    ? studentAverages.filter(s => s.class === selectedClass)
    : studentAverages

  const meritList = filteredMerit.slice(0, meritLimit)
  const meritAvg = meritList.length > 0
    ? Math.round(meritList.reduce((s, m) => s + m.average, 0) / meritList.length)
    : 0

  const meritRankById = new Map(
    rankEntries(filteredMerit.map(s => ({
      studentId: s.student_id,
      score: s.wcount > 0 ? s.wtotal / s.wcount : 0,
      count: s.count,
      admission: s.admNo !== '—' ? s.admNo : undefined,
    })), { scope: selectedClass ? 'class' : 'school' }).map(r => [r.studentId, r.rank])
  )
  const schoolRankById = new Map(
    rankEntries(studentAverages.map(s => ({
      studentId: s.student_id,
      score: s.wcount > 0 ? s.wtotal / s.wcount : 0,
      count: s.count,
      admission: s.admNo !== '—' ? s.admNo : undefined,
    })), { scope: 'school' }).map(r => [r.studentId, r.rank])
  )

  const uniqueSubjects = [...new Set(grades.map(g => g.subject).filter(Boolean))].sort()

  const getStudentReport = (className) => {
    const classData = classSummaries.find(c => c.className === className)
    if (!classData) return null
    const studentMap = {}
    classData.grades.forEach(g => {
      const sid = g.student_id
      if (!sid) return
      if (!studentMap[sid]) {
        studentMap[sid] = {
          name: g.students?.full_name || '—',
          admNo: g.students?.admission_number || '—',
          class: g.students?.class || '—',
          stream: g.students?.stream || '—',
          subjects: [],
          total: 0,
          count: 0,
          wtotal: 0,
          wcount: 0,
        }
      }
      studentMap[sid].subjects.push({ subject: g.subject, score: Number(g.total_score || 0), grade: g.grade || computeGrade(Number(g.total_score || 0), className) })
      const w = Number(g.max_marks) || 100
      studentMap[sid].wtotal += Number(g.total_score || 0) * w
      studentMap[sid].wcount += w
      studentMap[sid].total += Number(g.total_score || 0)
      studentMap[sid].count += 1
    })
    return Object.values(studentMap).map(s => ({
      ...s,
      average: s.wcount > 0 ? Math.round(s.wtotal / s.wcount) : 0,
      grade: computeGrade(s.wcount > 0 ? Math.round(s.wtotal / s.wcount) : 0, className),
    }))
  }

  const generateMeritListPDF = async (students) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('schools(name, logo_url, address, phone, email, motto)')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()
    const school = profile?.schools

    const rowsHtml = students.map((s, i) => {
      const r = meritRankById.get(s.student_id) ?? i + 1
      const rankColor = r === 1 ? '#ca8a04' : r === 2 ? '#64748b' : r === 3 ? '#b45309' : '#475569'
      return `<tr>
        <td class="rank-cell" style="color:${rankColor}">${r <= 3 ? '&#9733; ' : ''}${r}</td>
        <td style="font-weight:500">${esc(s.name)}</td>
        <td style="font-family:monospace;color:#64748b">${esc(s.admNo)}</td>
        <td>${esc(s.class)}</td>
        <td class="avg-cell" style="color:${s.average >= 50 ? '#16a34a' : '#dc2626'}">${s.average}%</td>
        <td class="grade-cell"><span class="band-chip ${s.average >= 80 ? 'chip-ee' : s.average >= 60 ? 'chip-me' : s.average >= 40 ? 'chip-ae' : 'chip-be'}">${s.grade}</span></td>
      </tr>`
    }).join('')

    const bodyHtml = `
      <div class="rc-center-title">Merit List</div>
      <div class="rc-center-subtitle">Top ${students.length} performing students ranked by average score</div>
      <div class="rc-center-metric-grid">
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#2563eb">${filteredMerit.length}</div><div class="rc-center-metric-label">Total Students</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#7c3aed">${meritList.length}</div><div class="rc-center-metric-label">Merit List Size</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#16a34a">${meritAvg}%</div><div class="rc-center-metric-label">Merit Average</div></div>
      </div>
      <table class="rc-center-table">
        <thead><tr><th style="width:40px;text-align:center">Rank</th><th>Student Name</th><th>Adm No.</th><th>Class</th><th style="text-align:center">Average</th><th style="text-align:center">Grade</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `
    printReport(buildReportHtml(bodyHtml, 'Merit List', school, currentTerm, currentYear))
  }

  const exportBroadsheet = (studentData, subjectList) => {
    const wsData = [
      ['#', 'Student Name', 'Adm No.', 'Class', ...subjectList.map(s => s), 'Total', 'Average', 'Grade', 'Rank'],
    ]
    studentData.forEach((s, i) => {
      wsData.push([
        i + 1, s.name, s.admNo, s.class,
        ...subjectList.map(sub => s.subjects[sub] ?? ''),
        s.total, s.average, s.grade, schoolRankById.get(s.student_id) ?? i + 1,
      ])
    })
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Broadsheet')
    XLSX.writeFile(wb, `broadsheet_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const exportStudentResults = (studentData) => {
    const rows = []
    studentData.forEach(s => {
      s.subjects.forEach(sub => {
        rows.push({
          'Student Name': s.name,
          'Admission No.': s.admNo,
          'Class': s.class,
          'Subject': sub.subject,
          'Score': sub.score,
          'Grade': sub.grade,
        })
      })
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Student Results')
    XLSX.writeFile(wb, `student_results_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const exportSubjectPerformancePDF = async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('schools(name, logo_url, address, phone, email, motto)')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()
    const school = profile?.schools

    const subjectMap = {}
    grades.forEach(g => {
      if (!g.subject) return
      if (!subjectMap[g.subject]) subjectMap[g.subject] = { wtotal: 0, wcount: 0, count: 0, pass: 0, students: [] }
      const w = Number(g.max_marks) || 100
      subjectMap[g.subject].wtotal += Number(g.total_score || 0) * w
      subjectMap[g.subject].wcount += w
      subjectMap[g.subject].count += 1
      if (Number(g.total_score || 0) >= 50) subjectMap[g.subject].pass += 1
      subjectMap[g.subject].students.push({ name: g.students?.full_name || '—', score: Number(g.total_score || 0) })
    })

    const subjectRows = Object.entries(subjectMap)
      .map(([name, d]) => {
        const avg = d.wcount > 0 ? Math.round(d.wtotal / d.wcount) : 0
        const passRate = d.count > 0 ? Math.round((d.pass / d.count) * 100) : 0
        const grade = computeGrade(avg, '')
        return { name, count: d.count, avg, passRate, grade }
      })
      .sort((a, b) => b.avg - a.avg)

    const tableRowsHtml = subjectRows.map((s, i) => `<tr>
      <td style="font-weight:500">${esc(s.name)}</td>
      <td style="text-align:center">${s.count}</td>
      <td class="avg-cell" style="color:${s.avg >= 50 ? '#16a34a' : '#dc2626'}">${s.avg}%</td>
      <td style="text-align:center">${s.passRate}%</td>
      <td class="grade-cell"><span class="band-chip ${s.avg >= 80 ? 'chip-ee' : s.avg >= 60 ? 'chip-me' : s.avg >= 40 ? 'chip-ae' : 'chip-be'}">${s.grade}</span></td>
    </tr>`).join('')

    const totalStudents = grades.length
    const overallAvg = totalStudents > 0 ? Math.round(weightedScoreMean(grades)) : 0
    const overallPass = totalStudents > 0 ? Math.round(grades.filter(g => Number(g.total_score || 0) >= 50).length / totalStudents * 100) : 0

    const bodyHtml = `
      <div class="rc-center-title">Subject Performance Report</div>
      <div class="rc-center-subtitle">${currentTerm} ${currentYear} · ${subjectRows.length} subjects analyzed</div>
      <div class="rc-center-metric-grid">
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#2563eb">${subjectRows.length}</div><div class="rc-center-metric-label">Total Subjects</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#16a34a">${overallAvg}%</div><div class="rc-center-metric-label">Overall Average</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#7c3aed">${overallPass}%</div><div class="rc-center-metric-label">Overall Pass Rate</div></div>
      </div>
      <table class="rc-center-table">
        <thead><tr><th>Subject</th><th style="text-align:center">Students</th><th style="text-align:center">Average</th><th style="text-align:center">Pass Rate</th><th style="text-align:center">Grade</th></tr></thead>
        <tbody>${tableRowsHtml}</tbody>
      </table>
    `
    printReport(buildReportHtml(bodyHtml, 'Subject Performance Report', school, currentTerm, currentYear))
  }

  const exportDepartmentSummaryPDF = async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('schools(name, logo_url, address, phone, email, motto)')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()
    const school = profile?.schools

    const totalStudents = studentAverages.length
    const avgScore = totalStudents > 0
      ? Math.round(studentAverages.reduce((s, st) => s + st.average, 0) / totalStudents)
      : 0
    const passCount = studentAverages.filter(s => s.average >= 50).length
    const passRate = totalStudents > 0 ? Math.round((passCount / totalStudents) * 100) : 0
    const highest = totalStudents > 0 ? Math.max(...studentAverages.map(s => s.average)) : 0
    const lowest = totalStudents > 0 ? Math.min(...studentAverages.map(s => s.average)) : 0

    const classRowsHtml = classSummaries.map(c => `<tr>
      <td style="font-weight:600">${esc(c.className)}</td>
      <td style="text-align:center">${c.students}</td>
      <td style="text-align:center">${c.subjects}</td>
      <td class="avg-cell" style="color:${c.avgScore >= 50 ? '#16a34a' : '#dc2626'}">${c.avgScore}%</td>
      <td style="text-align:center"><span class="band-chip ${c.avgScore >= 80 ? 'chip-ee' : c.avgScore >= 60 ? 'chip-me' : c.avgScore >= 40 ? 'chip-ae' : 'chip-be'}">${c.status}</span></td>
    </tr>`).join('')

    const subjectMap = {}
    grades.forEach(g => {
      if (!g.subject) return
      if (!subjectMap[g.subject]) subjectMap[g.subject] = { wtotal: 0, wcount: 0, count: 0, pass: 0 }
      const w = Number(g.max_marks) || 100
      subjectMap[g.subject].wtotal += Number(g.total_score || 0) * w
      subjectMap[g.subject].wcount += w
      subjectMap[g.subject].count += 1
      if (Number(g.total_score || 0) >= 50) subjectMap[g.subject].pass += 1
    })
    const subjectRowsHtml = Object.entries(subjectMap)
      .map(([name, d]) => {
        const avg = d.wcount > 0 ? Math.round(d.wtotal / d.wcount) : 0
        const passRate = d.count > 0 ? Math.round((d.pass / d.count) * 100) : 0
        return { name, avg, passRate, count: d.count }
      })
      .sort((a, b) => b.avg - a.avg)
      .map(s => `<tr>
        <td style="font-weight:500">${esc(s.name)}</td>
        <td style="text-align:center">${s.count}</td>
        <td class="avg-cell" style="color:${s.avg >= 50 ? '#16a34a' : '#dc2626'}">${s.avg}%</td>
        <td style="text-align:center">${s.passRate}%</td>
      </tr>`).join('')

    const bodyHtml = `
      <div class="rc-center-title">Department Summary</div>
      <div class="rc-center-subtitle">${currentTerm} ${currentYear}</div>
      <div class="rc-center-metric-grid">
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#2563eb">${totalStudents}</div><div class="rc-center-metric-label">Total Students</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#16a34a">${avgScore}%</div><div class="rc-center-metric-label">Average Score</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#7c3aed">${passRate}%</div><div class="rc-center-metric-label">Pass Rate</div></div>
      </div>
      <div class="rc-center-metric-grid">
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#ca8a04">${highest}%</div><div class="rc-center-metric-label">Highest Score</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#dc2626">${lowest}%</div><div class="rc-center-metric-label">Lowest Score</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#0f172a">${uniqueSubjects.length}</div><div class="rc-center-metric-label">Subjects</div></div>
      </div>
      <div class="rc-section-title" style="margin-top:16px">Class Breakdown</div>
      <table class="rc-center-table">
        <thead><tr><th>Class</th><th style="text-align:center">Students</th><th style="text-align:center">Subjects</th><th style="text-align:center">Avg Score</th><th style="text-align:center">Status</th></tr></thead>
        <tbody>${classRowsHtml}</tbody>
      </table>
      <div class="rc-section-title" style="margin-top:16px">Subject Breakdown</div>
      <table class="rc-center-table">
        <thead><tr><th>Subject</th><th style="text-align:center">Students</th><th style="text-align:center">Average</th><th style="text-align:center">Pass Rate</th></tr></thead>
        <tbody>${subjectRowsHtml}</tbody>
      </table>
    `
    printReport(buildReportHtml(bodyHtml, 'Department Summary', school, currentTerm, currentYear))
  }

  const handleExport = async (key) => {
    setExportingCard(key)
    try {
      if (key === 'subject') await exportSubjectPerformancePDF()
      else if (key === 'broadsheet') exportBroadsheet(studentAverages, uniqueSubjects)
      else if (key === 'results') exportStudentResults(studentAverages)
      else if (key === 'merit') await generateMeritListPDF(meritList)
      else if (key === 'summary') await exportDepartmentSummaryPDF()
    } catch (err) {
      console.error('Export failed:', err)
    }
    setExportingCard(null)
  }

  if (loading) return <div className="loading-state">Loading report center...</div>

  return (
    <div className="hod-sub-page">
      <div className="hod-sp-header">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>Report Center</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Generate, preview, and export departmental reports</p>
        </div>
        <span className="hod-sp-term-badge">{currentTerm} {currentYear}</span>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', paddingBottom: 0 }}>
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                background: 'none', border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid #7c3aed' : '2px solid transparent',
                color: activeTab === tab.key ? '#7c3aed' : '#64748b', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s', marginBottom: -1,
              }}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ─── Tab: Draft Report Cards ─── */}
      {activeTab === 'draft' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {previewClass ? (
            <DraftPreview
              className={previewClass}
              onBack={() => setPreviewClass(null)}
              getStudentReport={getStudentReport}
            />
          ) : (
            <>
              <div className="hod-sp-filters">
                <select
                  className="hod-sp-select"
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                >
                  <option value="">All Classes</option>
                  {classes.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="hod-card">
                <div className="hod-card-header">
                  <h3>Report Card Status by Class</h3>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{filteredClassSummaries.length} classes</span>
                </div>
                {filteredClassSummaries.length === 0 ? (
                  <div className="empty-state">
                    <FileText size={40} color="#cbd5e1" />
                    <p>No class data available for this term</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="hod-table">
                      <thead>
                        <tr>
                          <th>Class</th>
                          <th>Students</th>
                          <th>Subjects</th>
                          <th>Avg Score</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredClassSummaries.map(c => (
                          <tr key={c.className}>
                            <td style={{ fontWeight: 600, color: '#0f172a' }}>{c.className}</td>
                            <td>{c.students}</td>
                            <td>{c.subjects}</td>
                            <td style={{ fontWeight: 500, color: c.avgScore >= 50 ? '#16a34a' : '#dc2626' }}>
                              {c.avgScore}%
                            </td>
                            <td>
                              <span className={`hod-badge ${
                                c.status === 'Published' ? 'hod-badge-good'
                                  : c.status === 'Reviewed' ? 'hod-badge-good'
                                    : 'hod-badge-low'
                              }`}>
                                {c.status === 'Published' && <CheckCircle2 size={12} style={{ marginRight: 4 }} />}
                                {c.status === 'Reviewed' && <Eye size={12} style={{ marginRight: 4 }} />}
                                {c.status === 'Draft' && <AlertTriangle size={12} style={{ marginRight: 4 }} />}
                                {c.status}
                              </span>
                            </td>
                            <td>
                              <button
                                className="hod-btn-ghost"
                                onClick={() => setPreviewClass(c.className)}
                              >
                                <Eye size={14} /> Preview
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Tab: Merit List ─── */}
      {activeTab === 'merit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="hod-sp-filters">
            <select
              className="hod-sp-select"
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
            >
              <option value="">All Classes</option>
              {classes.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className="hod-sp-select"
              value={meritLimit}
              onChange={e => setMeritLimit(Number(e.target.value))}
            >
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={50}>Top 50</option>
            </select>
            <button
              className="hod-btn-primary"
              onClick={() => handleExport('merit')}
              disabled={exportingCard === 'merit' || meritList.length === 0}
            >
              <FileText size={15} /> {exportingCard === 'merit' ? 'Generating...' : 'Generate Merit List PDF'}
            </button>
          </div>

          <div className="hod-sp-metrics" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="hod-sp-metric-card">
              <p className="hod-sp-metric-value" style={{ color: '#2563eb' }}>{filteredMerit.length}</p>
              <p className="hod-sp-metric-label">Total Students</p>
              <span className="hod-sp-metric-sub">{selectedClass || 'All classes'}</span>
            </div>
            <div className="hod-sp-metric-card">
              <p className="hod-sp-metric-value" style={{ color: '#7c3aed' }}>{meritList.length}</p>
              <p className="hod-sp-metric-label">Merit List Size</p>
              <span className="hod-sp-metric-sub">Top {meritLimit} students</span>
            </div>
            <div className="hod-sp-metric-card">
              <p className="hod-sp-metric-value" style={{ color: '#16a34a' }}>{meritAvg}%</p>
              <p className="hod-sp-metric-label">Merit Average</p>
              <span className="hod-sp-metric-sub">Average of listed students</span>
            </div>
          </div>

          <div className="hod-card">
            <div className="hod-card-header">
              <h3>Merit List</h3>
              <span style={{ fontSize: 13, color: '#64748b' }}>
                <Award size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                {meritList.length} students listed
              </span>
            </div>
            {meritList.length === 0 ? (
              <div className="empty-state">
                <Award size={40} color="#cbd5e1" />
                <p>No students found for the selected filter</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="hod-table" style={{ minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Student Name</th>
                      <th>Adm No.</th>
                      <th>Class</th>
                      <th>Average</th>
                      <th>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meritList.map((s, i) => {
                      const r = meritRankById.get(s.student_id) ?? i + 1
                      return (
                      <tr key={s.student_id}>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            color: r === 1 ? '#ca8a04' : r === 2 ? '#64748b' : r === 3 ? '#b45309' : '#94a3b8',
                            fontWeight: 700,
                          }}>
                            {r <= 3 && <Award size={14} />}
                            {r}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td className="hod-monospace">{s.admNo}</td>
                        <td>{s.class}</td>
                        <td style={{ fontWeight: 600, color: s.average >= 50 ? '#16a34a' : '#dc2626' }}>
                          {s.average}%
                        </td>
                        <td>
                          <span className="hod-sp-grade-chip">{s.grade}</span>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Tab: Export Hub ─── */}
      {activeTab === 'export' && (
        <ExportHub
          handleExport={handleExport}
          exportingCard={exportingCard}
          meritListCount={meritList.length}
        />
      )}
    </div>
  )
}

function DraftPreview({ className, onBack, getStudentReport }) {
  const students = getStudentReport(className)
  const [selectedStudent, setSelectedStudent] = useState(null)
  const current = selectedStudent !== null ? students.find(s => s.admNo === selectedStudent) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="hod-sp-header">
        <button className="hod-btn-secondary" onClick={onBack}>
          ← Back to Classes
        </button>
        <span className="hod-sp-term-badge">{className} — {students.length} students</span>
      </div>

      <div className="hod-card">
        <div className="hod-card-header">
          <h3>Report Card Preview — {className}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ fontSize: 13, color: '#64748b' }}>Select student:</label>
            <select
              className="hod-sp-select"
              value={selectedStudent || ''}
              onChange={e => setSelectedStudent(e.target.value || null)}
            >
              <option value="">Choose a student...</option>
              {students.map(s => (
                <option key={s.admNo} value={s.admNo}>{s.name} ({s.admNo})</option>
              ))}
            </select>
          </div>
        </div>

        {current ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ padding: 14, background: '#f8fafc', borderRadius: 8 }}>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 600 }}>Student Name</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: '4px 0 0' }}>{current.name}</p>
              </div>
              <div style={{ padding: 14, background: '#f8fafc', borderRadius: 8 }}>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 600 }}>Admission No.</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: '4px 0 0' }}>{current.admNo}</p>
              </div>
              <div style={{ padding: 14, background: '#f8fafc', borderRadius: 8 }}>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 600 }}>Class</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: '4px 0 0' }}>{current.class} — {current.stream}</p>
              </div>
              <div style={{ padding: 14, background: '#f8fafc', borderRadius: 8 }}>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 600 }}>Overall Grade</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: current.average >= 50 ? '#16a34a' : '#dc2626', margin: '4px 0 0' }}>{current.grade} ({current.average}%)</p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="hod-table" style={{ minWidth: 400 }}>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th style={{ textAlign: 'center' }}>Score</th>
                    <th style={{ textAlign: 'center' }}>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {current.subjects.map(sub => (
                    <tr key={sub.subject}>
                      <td style={{ fontWeight: 500 }}>{sub.subject}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: sub.score >= 50 ? '#16a34a' : '#dc2626' }}>
                        {sub.score}%
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="hod-sp-grade-chip">{sub.grade}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                    <td style={{ fontWeight: 700 }}>Average</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: current.average >= 50 ? '#16a34a' : '#dc2626', fontSize: 15 }}>
                      {current.average}%
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="hod-sp-grade-chip" style={{ fontWeight: 700 }}>{current.grade}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div style={{ padding: 14, background: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: 8 }}>
              <p style={{ fontSize: 11, color: '#16a34a', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.04 }}>Remarks</p>
              <p style={{ fontSize: 13, color: '#374151', margin: '4px 0 0' }}>
                {current.average >= 75
                  ? 'Excellent performance. Keep up the outstanding work!'
                  : current.average >= 60
                    ? 'Good performance. Continue working hard to improve further.'
                      : current.average >= 50
                        ? 'Average performance. There is room for improvement.'
                          : 'Below average performance. Additional effort and support needed.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <Eye size={40} color="#cbd5e1" />
            <p>Select a student to preview their report card</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ExportHub({ handleExport, exportingCard, meritListCount }) {
  const cards = [
    {
      key: 'subject',
      icon: FileText,
      title: 'Subject Performance Report',
      description: 'Full subject analysis with grade distribution, averages, and student scores.',
      format: 'PDF',
      color: '#2563eb',
      bg: '#dbeafe',
    },
    {
      key: 'broadsheet',
      icon: FileSpreadsheet,
      title: 'Department Broadsheet',
      description: 'Complete broadsheet matrix with per-subject scores, totals, and rankings.',
      format: 'Excel',
      color: '#16a34a',
      bg: '#dcfce7',
    },
    {
      key: 'results',
      icon: FileSpreadsheet,
      title: 'Student Results',
      description: 'All student scores exported per subject with grades.',
      format: 'Excel',
      color: '#7c3aed',
      bg: '#f3e8ff',
    },
    {
      key: 'merit',
      icon: Award,
      title: 'Merit List',
      description: `Top performing students ranked by average score. ${meritListCount} students in list.`,
      format: 'PDF',
      color: '#ca8a04',
      bg: '#fef9c3',
    },
    {
      key: 'summary',
      icon: FileText,
      title: 'Department Summary',
      description: 'One-page summary with key metrics, class breakdown, and department stats.',
      format: 'PDF',
      color: '#0f172a',
      bg: '#f1f5f9',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>Export Department Reports</h3>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Download reports in PDF or Excel format</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {cards.map(card => {
          const Icon = card.icon
          const isExporting = exportingCard === card.key
          return (
            <div
              key={card.key}
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: card.bg, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={22} color={card.color} />
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: 0.05, color: card.color, background: card.bg,
                  padding: '3px 10px', borderRadius: 99,
                }}>
                  {card.format}
                </span>
              </div>
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: '0 0 4px' }}>{card.title}</h4>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{card.description}</p>
              </div>
              <button
                className="hod-btn-primary"
                onClick={() => handleExport(card.key)}
                disabled={isExporting}
                style={{ marginTop: 'auto', width: '100%', justifyContent: 'center' }}
              >
                <Download size={15} />
                {isExporting ? 'Exporting...' : `Download ${card.format}`}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
