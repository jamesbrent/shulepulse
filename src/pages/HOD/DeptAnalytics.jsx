import { useState, useEffect, Fragment } from 'react'
import { BarChart2, TrendingUp, TrendingDown, FileText, FileSpreadsheet, AlertTriangle, Users, Award, Search, Filter } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useSchool } from '../admin/useSchool'
import { REPORT_CARD_STYLES } from '../../components/students/ReportCard'
import { getGrade, gradeShort, bandColor, sortBands, weightedScoreMean } from '../../services/grading'

const TABS = [
  { key: 'subjects', label: 'Subject Analysis', icon: <BarChart2 size={15} /> },
  { key: 'broadsheet', label: 'Broadsheet', icon: <FileText size={15} /> },
  { key: 'defaulters', label: 'Defaulter Tracking', icon: <AlertTriangle size={15} /> },
  { key: 'trends', label: 'Performance Trends', icon: <TrendingUp size={15} /> },
  { key: 'classAverages', label: 'Class Averages', icon: <Users size={15} /> },
]

export default function DeptAnalytics() {
  const { currentTerm, currentYear } = useSchool()

  const [activeTab, setActiveTab] = useState('subjects')
  const [loading, setLoading] = useState(true)
  const [grades, setGrades] = useState([])
  const [subjects, setSubjects] = useState([])
  const [gradeLevels, setGradeLevels] = useState([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [sortField, setSortField] = useState('average')
  const [sortDir, setSortDir] = useState('desc')
  const [threshold, setThreshold] = useState(50)
  const [topN, setTopN] = useState(0)

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

    const schoolId = profile?.school_id
    if (!schoolId) { setLoading(false); return }

    const [subjectsRes, gradeLevelsRes, gradesRes] = await Promise.all([
      supabase.from('subjects').select('*').eq('school_id', schoolId).order('name'),
      supabase.from('grade_levels').select('*').eq('school_id', schoolId).order('name'),
      supabase
        .from('grades')
        .select('*, students(full_name, class, stream, admission_number)')
        .eq('school_id', schoolId)
        .eq('term', currentTerm)
        .eq('year', currentYear)
        .order('total_score', { ascending: false }),
    ])

    setSubjects(subjectsRes.data || [])
    setGradeLevels(gradeLevelsRes.data || [])
    setGrades(gradesRes.data || [])
    setLoading(false)
  }

  const filteredGrades = grades.filter(g => {
    if (selectedSubject && g.subject !== selectedSubject) return false
    if (selectedClass && g.students?.class !== selectedClass) return false
    return true
  })

  const totalStudents = filteredGrades.length
  const avgScore = totalStudents > 0 ? Math.round(weightedScoreMean(filteredGrades)) : 0
  const passCount = filteredGrades.filter(g => Number(g.total_score || 0) >= 50).length
  const passRate = totalStudents > 0 ? Math.round((passCount / totalStudents) * 100) : 0
  const highest = totalStudents > 0 ? Math.max(...filteredGrades.map(g => Number(g.total_score || 0))) : 0
  const lowest = totalStudents > 0 ? Math.min(...filteredGrades.map(g => Number(g.total_score || 0))) : 0

  const gradeDist = {}
  filteredGrades.forEach(g => {
    const gr = g.grade || 'N/A'
    gradeDist[gr] = (gradeDist[gr] || 0) + 1
  })

  const subjectAverages = (() => {
    const map = {}
    filteredGrades.forEach(g => {
      if (!g.subject) return
      if (!map[g.subject]) map[g.subject] = { wtotal: 0, wcount: 0, count: 0, pass: 0 }
      const w = Number(g.max_marks) || 100
      map[g.subject].wtotal += Number(g.total_score || 0) * w
      map[g.subject].wcount += w
      map[g.subject].count += 1
      if (Number(g.total_score || 0) >= 50) map[g.subject].pass += 1
    })
    return Object.entries(map).map(([name, d]) => ({
      name,
      avg: d.wcount > 0 ? Math.round(d.wtotal / d.wcount) : 0,
      count: d.count,
      passRate: d.count > 0 ? Math.round((d.pass / d.count) * 100) : 0,
    })).sort((a, b) => b.avg - a.avg)
  })()

  const studentAverages = (() => {
    const map = {}
    filteredGrades.forEach(g => {
      const sid = g.student_id
      if (!sid) return
      if (!map[sid]) {
        map[sid] = {
          student_id: sid,
          full_name: g.students?.full_name || '—',
          admission_number: g.students?.admission_number || '—',
          class: g.students?.class || '—',
          stream: g.students?.stream || '—',
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

  const studentAveragesWithRank = studentAverages.map((s, i) => ({ ...s, rank: i + 1 }))

  const uniqueSubjects = [...new Set(grades.map(g => g.subject).filter(Boolean))].sort()

  const broadsheetTotal = selectedClass
    ? studentAveragesWithRank.filter(s => s.class === selectedClass).length
    : studentAveragesWithRank.length

  const filteredBroadsheet = (() => {
    let list = selectedClass
      ? studentAveragesWithRank.filter(s => s.class === selectedClass)
      : studentAveragesWithRank
    if (topN > 0) list = list.slice(0, topN)
    return list
  })()

  const defaulters = (() => {
    const list = []
    filteredGrades.forEach(g => {
      const score = Number(g.total_score || 0)
      if (score < threshold) {
        list.push({
          id: g.id,
          full_name: g.students?.full_name || '—',
          admission_number: g.students?.admission_number || '—',
          class: g.students?.class || '—',
          subject: g.subject || '—',
          score,
          grade: g.grade || '—',
        })
      }
    })
    list.sort((a, b) => a.score - b.score)
    return list
  })()

  const defaulterSummary = (() => {
    const subjectCounts = {}
    const classCounts = {}
    defaulters.forEach(d => {
      subjectCounts[d.subject] = (subjectCounts[d.subject] || 0) + 1
      classCounts[d.class] = (classCounts[d.class] || 0) + 1
    })
    const worstSubject = Object.entries(subjectCounts).sort((a, b) => b[1] - a[1])[0]
    const mostAffectedClass = Object.entries(classCounts).sort((a, b) => b[1] - a[1])[0]
    return {
      total: defaulters.length,
      worstSubject: worstSubject ? worstSubject[0] : '—',
      worstSubjectCount: worstSubject ? worstSubject[1] : 0,
      mostAffectedClass: mostAffectedClass ? mostAffectedClass[0] : '—',
      mostAffectedClassCount: mostAffectedClass ? mostAffectedClass[1] : 0,
    }
  })()

  const sortedSubjectAverages = [...subjectAverages].sort((a, b) => {
    let aVal, bVal
    if (sortField === 'name') { aVal = a.name; bVal = b.name }
    else if (sortField === 'passRate') { aVal = a.passRate; bVal = b.passRate }
    else { aVal = a.avg; bVal = b.avg }
    if (sortField === 'name') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal
  })
  const topSubjects = [...subjectAverages].sort((a, b) => b.avg - a.avg).slice(0, 5)
  const bottomSubjects = [...subjectAverages].sort((a, b) => a.avg - b.avg).slice(0, 5)

  const cbcPoints = (score, className) => getGrade(score, className || '').points || 0

  const cbcBand = (points) => {
    if (points >= 7) return 'EE'
    if (points >= 5) return 'ME'
    if (points >= 3) return 'AE'
    return 'BE'
  }

  const cbcBandLabel = (points) => {
    if (points === 8) return 'EE1'
    if (points === 7) return 'EE2'
    if (points === 6) return 'ME1'
    if (points === 5) return 'ME2'
    if (points === 4) return 'AE1'
    if (points === 3) return 'AE2'
    if (points === 2) return 'BE1'
    return 'BE2'
  }

  const classAverages = (() => {
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
      studentMap[key].points.push(cbcPoints(score, cls))
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

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const printHtml = (html) => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.onload = () => { win.focus(); win.print() }
  }

  const buildPageHtml = (bodyContent, title, school) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title} – ${currentTerm} ${currentYear}</title>
<style>
  ${REPORT_CARD_STYLES}
  .rc-wrap { max-width: 960px; }
  .rc-center-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
  .rc-center-table th { background: #1e293b; color: #fff; padding: 8px 10px; text-align: left; font-weight: 700; font-size: 10px; border: 1px solid #94a3b8; text-transform: uppercase; letter-spacing: 0.03em; }
  .rc-center-table td { padding: 7px 10px; border: 1px solid #cbd5e1; color: #1e293b; }
  .rc-center-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .rc-center-metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 12px 0; }
  .rc-center-metric { padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center; }
  .rc-center-metric-value { font-size: 18px; font-weight: 700; color: #0f172a; }
  .rc-center-metric-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
  .rc-center-title { font-size: 16px; font-weight: 800; color: #0f172a; text-align: center; margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .rc-center-subtitle { font-size: 11px; color: #64748b; text-align: center; margin-bottom: 10px; }
  .rc-center-footer { text-align: center; font-size: 9px; color: #94a3b8; margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
  @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; } body { margin: 0; padding: 0; } .rc-wrap { width: 100%; max-width: none; padding: 12px 16px; } }
</style></head><body>
<div class="rc-wrap">
  <div class="rc-top">
    <div class="rc-logo-box">${school?.logo_url ? `<img src="${school.logo_url}" alt="Logo" />` : `<div class="rc-logo-placeholder">${(school?.name || 'S')[0]}</div>`}</div>
    <div class="rc-school-block">
      <div class="rc-school-name">${school?.name || 'School'}</div>
      ${school?.address ? `<div class="rc-school-contact">${school.address}${school.phone ? ' · ' + school.phone : ''}${school.email ? ' · ' + school.email : ''}</div>` : ''}
    </div>
  </div>
  <hr class="rc-hr" />
  ${bodyContent}
  <div class="rc-center-footer">Generated on ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })} · ${currentTerm} ${currentYear}</div>
</div>
</body></html>`

  const getSchool = async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('schools(name, logo_url, address, phone, email, motto)')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()
    return profile?.schools
  }

  const exportSubjectAnalysisPDF = async () => {
    const school = await getSchool()
    const subjectRows = subjectAverages.map(s => `<tr>
      <td style="font-weight:500">${s.name}</td>
      <td style="text-align:center;font-weight:600;color:${s.avg >= 50 ? '#16a34a' : '#dc2626'}">${s.avg}%</td>
      <td style="text-align:center">${s.count}</td>
      <td style="text-align:center">${s.passRate}%</td>
      <td style="text-align:center"><span class="band-chip ${s.avg >= 80 ? 'chip-ee' : s.avg >= 60 ? 'chip-me' : s.avg >= 40 ? 'chip-ae' : 'chip-be'}">${s.avg >= 50 ? 'Good' : 'Needs Improvement'}</span></td>
    </tr>`).join('')

    const studentRows = filteredGrades.map((g, i) => `<tr>
      <td style="text-align:center;color:#94a3b8">${i + 1}</td>
      <td style="font-weight:500">${g.students?.full_name || '—'}</td>
      <td style="font-family:monospace;color:#64748b">${g.students?.admission_number || '—'}</td>
      <td>${g.students?.class || '—'}</td>
      <td style="text-align:center;font-weight:600;color:${Number(g.total_score || 0) >= 50 ? '#16a34a' : '#dc2626'}">${g.total_score ?? '—'}%</td>
      <td style="text-align:center"><span class="band-chip ${Number(g.total_score || 0) >= 80 ? 'chip-ee' : Number(g.total_score || 0) >= 60 ? 'chip-me' : Number(g.total_score || 0) >= 40 ? 'chip-ae' : 'chip-be'}">${g.grade || '—'}</span></td>
    </tr>`).join('')

    const bodyHtml = `
      <div class="rc-center-title">Subject Analysis</div>
      <div class="rc-center-subtitle">${selectedSubject || 'All Subjects'} · ${selectedClass || 'All Classes'} · ${currentTerm} ${currentYear}</div>
      <div class="rc-center-metric-grid">
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#2563eb">${totalStudents}</div><div class="rc-center-metric-label">Total Students</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#7c3aed">${avgScore}%</div><div class="rc-center-metric-label">Average Score</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#16a34a">${passRate}%</div><div class="rc-center-metric-label">Pass Rate</div></div>
      </div>
      <div class="rc-section-title">Subject Averages</div>
      <table class="rc-center-table">
        <thead><tr><th>Subject</th><th style="text-align:center">Average</th><th style="text-align:center">Entries</th><th style="text-align:center">Pass Rate</th><th style="text-align:center">Status</th></tr></thead>
        <tbody>${subjectRows}</tbody>
      </table>
      <div class="rc-section-title" style="margin-top:16px">Student Scores</div>
      <table class="rc-center-table">
        <thead><tr><th style="text-align:center;width:30px">#</th><th>Student</th><th>Adm No.</th><th>Class</th><th style="text-align:center">Score</th><th style="text-align:center">Grade</th></tr></thead>
        <tbody>${studentRows}</tbody>
      </table>
    `
    printHtml(buildPageHtml(bodyHtml, 'Subject Analysis', school))
  }

  const exportSubjectAnalysisExcel = () => {
    if (filteredGrades.length === 0) return
    const rows = filteredGrades.map((g, i) => ({
      '#': i + 1,
      'Student': g.students?.full_name || '—',
      'Adm No.': g.students?.admission_number || '—',
      'Class': g.students?.class || '—',
      'Stream': g.students?.stream || '—',
      'Score': g.total_score ?? '—',
      'Grade': g.grade || '—',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 4 }, { wch: 30 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Subject Analysis')
    XLSX.writeFile(wb, `subject_analysis_${currentTerm}_${currentYear}.xlsx`)
  }

  const exportBroadsheetPDF = async () => {
    const school = await getSchool()
    const subHeaders = uniqueSubjects.map(s => `<th style="text-align:center;min-width:60px;font-size:9px">${s}</th>`).join('')
    const broadsheetRows = filteredBroadsheet.map((s, idx) => {
      const cells = uniqueSubjects.map(sub => {
        const score = s.subjects[sub]
        return `<td style="text-align:center;color:${score != null ? (score >= 50 ? '#16a34a' : '#dc2626') : '#cbd5e1'};font-weight:${score != null ? 500 : 400}">${score != null ? score : '—'}</td>`
      }).join('')
      return `<tr>
        <td style="text-align:center;color:#94a3b8">${s.rank}</td>
        <td style="font-weight:500">${s.full_name}</td>
        <td style="font-family:monospace;color:#64748b">${s.admission_number}</td>
        <td>${s.class}</td>
        ${cells}
        <td style="text-align:center;font-weight:700">${s.total}</td>
        <td style="text-align:center;font-weight:700;color:${s.average >= 50 ? '#16a34a' : '#dc2626'}">${s.average}%</td>
        <td style="text-align:center"><span class="band-chip ${s.average >= 80 ? 'chip-ee' : s.average >= 60 ? 'chip-me' : s.average >= 40 ? 'chip-ae' : 'chip-be'}">${s.grade}</span></td>
        <td style="text-align:center;font-weight:700">${s.rank <= 3 ? '&#9733; ' : ''}${s.rank}</td>
      </tr>`
    }).join('')

    const bodyHtml = `
      <div class="rc-center-title">Departmental Broadsheet</div>
      <div class="rc-center-subtitle">${selectedClass || 'All Classes'} · ${currentTerm} ${currentYear} · ${filteredBroadsheet.length} students</div>
      <table class="rc-center-table">
        <thead><tr>
          <th style="text-align:center">#</th><th>Student</th><th>Adm No.</th><th>Class</th>
          ${subHeaders}
          <th style="text-align:center">Total</th><th style="text-align:center">Average</th><th style="text-align:center">Grade</th><th style="text-align:center">Rank</th>
        </tr></thead>
        <tbody>${broadsheetRows}</tbody>
      </table>
    `
    printHtml(buildPageHtml(bodyHtml, 'Departmental Broadsheet', school))
  }

  const exportBroadsheetExcel = () => {
    if (filteredBroadsheet.length === 0) return
    const headers = ['#', 'Student', 'Adm No.', 'Class', ...uniqueSubjects, 'Total', 'Average', 'Grade', 'Rank']
    const data = filteredBroadsheet.map((s, i) => [
      s.rank, s.full_name, s.admission_number, s.class,
      ...uniqueSubjects.map(sub => s.subjects[sub] ?? ''),
      s.total, `${s.average}%`, s.grade, s.rank,
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
    ws['!cols'] = [{ wch: 5 }, { wch: 25 }, { wch: 15 }, { wch: 10 }, ...uniqueSubjects.map(() => ({ wch: 8 })), { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 6 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Broadsheet')
    XLSX.writeFile(wb, `broadsheet_${currentTerm}_${currentYear}.xlsx`)
  }

  const exportDefaulterPDF = async () => {
    const school = await getSchool()
    const defaulterRows = defaulters.map((d, i) => `<tr>
      <td style="text-align:center;color:#94a3b8">${i + 1}</td>
      <td style="font-weight:500">${d.full_name}</td>
      <td style="font-family:monospace;color:#64748b">${d.admission_number}</td>
      <td>${d.class}</td>
      <td>${d.subject}</td>
      <td style="text-align:center;font-weight:600;color:#dc2626">${d.score}%</td>
      <td style="text-align:center"><span class="band-chip chip-be">${d.grade}</span></td>
    </tr>`).join('')

    const bodyHtml = `
      <div class="rc-center-title">Defaulter Tracking</div>
      <div class="rc-center-subtitle">Below ${threshold}% threshold · ${selectedSubject || 'All Subjects'} · ${selectedClass || 'All Classes'} · ${currentTerm} ${currentYear}</div>
      <div class="rc-center-metric-grid">
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#dc2626">${defaulterSummary.total}</div><div class="rc-center-metric-label">Total Defaulters</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#ca8a04">${defaulterSummary.worstSubject}</div><div class="rc-center-metric-label">Worst Subject (${defaulterSummary.worstSubjectCount})</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#7c3aed">${defaulterSummary.mostAffectedClass}</div><div class="rc-center-metric-label">Most Affected (${defaulterSummary.mostAffectedClassCount})</div></div>
      </div>
      <table class="rc-center-table">
        <thead><tr><th style="text-align:center">#</th><th>Student</th><th>Adm No.</th><th>Class</th><th>Subject</th><th style="text-align:center">Score</th><th style="text-align:center">Grade</th></tr></thead>
        <tbody>${defaulterRows}</tbody>
      </table>
    `
    printHtml(buildPageHtml(bodyHtml, 'Defaulter Tracking', school))
  }

  const exportDefaulterExcel = () => {
    if (defaulters.length === 0) return
    const rows = defaulters.map((d, i) => ({
      '#': i + 1,
      'Student': d.full_name,
      'Adm No.': d.admission_number,
      'Class': d.class,
      'Subject': d.subject,
      'Score': d.score,
      'Grade': d.grade,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 4 }, { wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 8 }, { wch: 8 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Defaulters')
    XLSX.writeFile(wb, `defaulters_${currentTerm}_${currentYear}.xlsx`)
  }

  const exportTrendsPDF = async () => {
    const school = await getSchool()
    const trendRows = sortedSubjectAverages.map(s => `<tr>
      <td style="font-weight:500">${s.name}</td>
      <td style="text-align:center;font-weight:600;color:${s.avg >= 50 ? '#16a34a' : '#dc2626'}">${s.avg}%</td>
      <td style="text-align:center">${s.passRate}%</td>
      <td style="text-align:center">${s.count}</td>
      <td style="text-align:center"><span class="band-chip ${s.avg >= 80 ? 'chip-ee' : s.avg >= 60 ? 'chip-me' : s.avg >= 40 ? 'chip-ae' : 'chip-be'}">${s.avg >= 50 ? 'Good' : 'Needs Improvement'}</span></td>
    </tr>`).join('')

    const topRows = topSubjects.map((s, i) => `<tr>
      <td style="text-align:center;font-weight:700;color:${i === 0 ? '#ca8a04' : i === 1 ? '#64748b' : '#b45309'}">${i < 3 ? '&#9733; ' : ''}${i + 1}</td>
      <td style="font-weight:600">${s.name}</td>
      <td style="text-align:center;color:#16a34a;font-weight:600">${s.avg}%</td>
      <td style="text-align:center">${s.passRate}%</td>
      <td style="text-align:center;color:#64748b">${s.count}</td>
    </tr>`).join('')

    const bottomRows = bottomSubjects.map((s, i) => `<tr>
      <td style="text-align:center;color:#94a3b8">${i + 1}</td>
      <td style="font-weight:600">${s.name}</td>
      <td style="text-align:center;font-weight:600;color:${s.avg >= 50 ? '#16a34a' : '#dc2626'}">${s.avg}%</td>
      <td style="text-align:center">${s.passRate}%</td>
      <td style="text-align:center;color:#64748b">${s.count}</td>
    </tr>`).join('')

    const bodyHtml = `
      <div class="rc-center-title">Performance Trends</div>
      <div class="rc-center-subtitle">${currentTerm} ${currentYear}</div>
      <div class="rc-center-metric-grid">
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#2563eb">${totalStudents}</div><div class="rc-center-metric-label">Total Grades</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:${avgScore >= 50 ? '#16a34a' : '#dc2626'}">${avgScore}%</div><div class="rc-center-metric-label">Overall Average</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#7c3aed">${passRate}%</div><div class="rc-center-metric-label">Pass Rate</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">
        <div>
          <div class="rc-section-title">Top 5 Subjects</div>
          <table class="rc-center-table">
            <thead><tr><th style="text-align:center">#</th><th>Subject</th><th style="text-align:center">Average</th><th style="text-align:center">Pass Rate</th><th style="text-align:center">Entries</th></tr></thead>
            <tbody>${topRows}</tbody>
          </table>
        </div>
        <div>
          <div class="rc-section-title">Bottom 5 Subjects</div>
          <table class="rc-center-table">
            <thead><tr><th style="text-align:center">#</th><th>Subject</th><th style="text-align:center">Average</th><th style="text-align:center">Pass Rate</th><th style="text-align:center">Entries</th></tr></thead>
            <tbody>${bottomRows}</tbody>
          </table>
        </div>
      </div>
      <div class="rc-section-title" style="margin-top:16px">All Subjects Summary</div>
      <table class="rc-center-table">
        <thead><tr><th>Subject</th><th style="text-align:center">Average</th><th style="text-align:center">Pass Rate</th><th style="text-align:center">Entries</th><th style="text-align:center">Status</th></tr></thead>
        <tbody>${trendRows}</tbody>
      </table>
    `
    printHtml(buildPageHtml(bodyHtml, 'Performance Trends', school))
  }

  const exportTrendsExcel = () => {
    if (sortedSubjectAverages.length === 0) return
    const rows = sortedSubjectAverages.map(s => ({
      'Subject': s.name,
      'Average': `${s.avg}%`,
      'Pass Rate': `${s.passRate}%`,
      'Entries': s.count,
      'Status': s.avg >= 50 ? 'Good' : 'Needs Improvement',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 18 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Performance Trends')
    XLSX.writeFile(wb, `performance_trends_${currentTerm}_${currentYear}.xlsx`)
  }

  if (loading) {
    return <div className="loading-state">Loading department analytics...</div>
  }

  return (
    <div className="hod-sub-page">
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
          <select
            className="hod-sp-select"
            value={selectedClass}
            onChange={e => setSelectedClass(e.target.value)}
          >
            <option value="">All Classes</option>
            {gradeLevels.map(g => (
              <option key={g.id} value={g.name}>{g.name}</option>
            ))}
          </select>
          <span className="hod-sp-term-badge">{currentTerm} {currentYear}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e2e8f0', paddingBottom: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', border: 'none', borderBottom: '2px solid transparent',
              background: 'transparent', color: activeTab === tab.key ? '#7c3aed' : '#64748b',
              fontWeight: activeTab === tab.key ? 600 : 400, fontSize: 13,
              cursor: 'pointer', transition: 'all 0.15s', marginBottom: -1,
              borderBottomColor: activeTab === tab.key ? '#7c3aed' : 'transparent',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'subjects' && (
        <SubjectAnalysis
          filteredGrades={filteredGrades}
          subjects={subjects}
          totalStudents={totalStudents}
          avgScore={avgScore}
          passRate={passRate}
          passCount={passCount}
          highest={highest}
          lowest={lowest}
          gradeDist={gradeDist}
          subjectAverages={subjectAverages}
          selectedSubject={selectedSubject}
          setSelectedSubject={setSelectedSubject}
          selectedClass={selectedClass}
          setSelectedClass={setSelectedClass}
          gradeLevels={gradeLevels}
          onPDF={exportSubjectAnalysisPDF}
          onExcel={exportSubjectAnalysisExcel}
        />
      )}

      {activeTab === 'broadsheet' && (
        <Broadsheet
          filteredBroadsheet={filteredBroadsheet}
          broadsheetTotal={broadsheetTotal}
          uniqueSubjects={uniqueSubjects}
          selectedClass={selectedClass}
          setSelectedClass={setSelectedClass}
          gradeLevels={gradeLevels}
          onPDF={exportBroadsheetPDF}
          onExcel={exportBroadsheetExcel}
          topN={topN}
          setTopN={setTopN}
        />
      )}

      {activeTab === 'defaulters' && (
        <DefaulterTracking
          defaulters={defaulters}
          defaulterSummary={defaulterSummary}
          threshold={threshold}
          setThreshold={setThreshold}
          selectedClass={selectedClass}
          setSelectedClass={setSelectedClass}
          selectedSubject={selectedSubject}
          setSelectedSubject={setSelectedSubject}
          subjects={subjects}
          gradeLevels={gradeLevels}
          onPDF={exportDefaulterPDF}
          onExcel={exportDefaulterExcel}
          filteredGrades={filteredGrades}
        />
      )}

      {activeTab === 'trends' && (
        <PerformanceTrends
          subjectAverages={subjectAverages}
          topSubjects={topSubjects}
          bottomSubjects={bottomSubjects}
          avgScore={avgScore}
          passRate={passRate}
          totalStudents={totalStudents}
          grades={grades}
          sortField={sortField}
          sortDir={sortDir}
          handleSort={handleSort}
          sortedSubjectAverages={sortedSubjectAverages}
          onPDF={exportTrendsPDF}
          onExcel={exportTrendsExcel}
        />
      )}

      {activeTab === 'classAverages' && (
        <ClassAverages
          classAverages={classAverages}
          grades={grades}
          selectedSubject={selectedSubject}
          setSelectedSubject={setSelectedSubject}
          subjects={subjects}
          cbcPoints={cbcPoints}
          cbcBand={cbcBand}
          cbcBandLabel={cbcBandLabel}
          currentTerm={currentTerm}
          currentYear={currentYear}
        />
      )}
    </div>
  )
}

function computeGrade(score, className) {
  return gradeShort(getGrade(score, className || ''))
}

function SubjectAnalysis({
  filteredGrades, totalStudents, avgScore, passRate, passCount,
  highest, lowest, gradeDist, subjectAverages, subjects, selectedSubject,
  setSelectedSubject, selectedClass, setSelectedClass, gradeLevels,
  onPDF, onExcel,
}) {
  return (
    <>
      <div className="hod-sp-metrics">
        <div className="hod-sp-metric-card">
          <p className="hod-sp-metric-value" style={{ color: '#2563eb' }}>{totalStudents}</p>
          <p className="hod-sp-metric-label">Total Students</p>
          <span className="hod-sp-metric-sub">Grades recorded</span>
        </div>
        <div className="hod-sp-metric-card">
          <p className="hod-sp-metric-value" style={{ color: '#7c3aed' }}>{avgScore}%</p>
          <p className="hod-sp-metric-label">Average Score</p>
          <span className="hod-sp-metric-trend" style={{ color: avgScore >= 50 ? '#16a34a' : '#dc2626' }}>
            {avgScore >= 50 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {avgScore >= 50 ? 'Above average' : 'Below average'}
          </span>
        </div>
        <div className="hod-sp-metric-card">
          <p className="hod-sp-metric-value" style={{ color: '#16a34a' }}>{passRate}%</p>
          <p className="hod-sp-metric-label">Pass Rate</p>
          <span className="hod-sp-metric-sub">{passCount} of {totalStudents} passed</span>
        </div>
        <div className="hod-sp-metric-card">
          <p className="hod-sp-metric-value" style={{ color: '#7c3aed' }}>{highest}%</p>
          <p className="hod-sp-metric-label">Highest Score</p>
          <span className="hod-sp-metric-sub">Top performer</span>
        </div>
      </div>

      <div className="hod-sp-metrics" style={{ gridTemplateColumns: 'repeat(1, 1fr)' }}>
        <div className="hod-sp-metric-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="hod-sp-metric-value" style={{ color: '#ca8a04', fontSize: 22 }}>{lowest}%</p>
            <p className="hod-sp-metric-label">Lowest Score</p>
          </div>
          <span className="hod-sp-metric-sub">Needs intervention</span>
        </div>
      </div>

      <div className="hod-grid">
        <div className="hod-card">
          <div className="hod-card-header">
            <h3>Grade Distribution</h3>
          </div>
          <div className="hod-sp-grade-dist">
            {sortBands(Object.keys(gradeDist)).map(grade => {
              const count = gradeDist[grade] || 0
              const pct = totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0
              return (
                <div key={grade} className="hod-sp-grade-bar-group">
                  <div className="hod-sp-grade-label">
                    <span style={{ fontWeight: 600 }}>{grade}</span>
                    <span style={{ color: '#64748b', fontSize: 12 }}>{count} students</span>
                  </div>
                  <div className="hod-sp-grade-bar-track">
                    <div
                      className="hod-sp-grade-bar-fill"
                      style={{ width: `${pct}%`, background: bandColor(grade) }}
                    />
                  </div>
                  <span className="hod-sp-grade-pct">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="hod-card">
          <div className="hod-card-header">
            <h3>Subject Averages</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="hod-table" style={{ minWidth: 500 }}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Average</th>
                  <th>Entries</th>
                  <th>Pass Rate</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {subjectAverages.map(s => (
                  <tr key={s.name}>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td style={{ color: s.avg >= 50 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{s.avg}%</td>
                    <td style={{ color: '#64748b' }}>{s.count}</td>
                    <td style={{ color: '#64748b' }}>{s.passRate}%</td>
                    <td>
                      <span className={`hod-badge ${s.avg >= 50 ? 'hod-badge-good' : 'hod-badge-low'}`}>
                        {s.avg >= 50 ? 'Good' : 'Needs Improvement'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="hod-card">
          <div className="hod-card-header">
            <h3>Student Scores {selectedSubject ? `- ${selectedSubject}` : ''}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>{totalStudents} entries</span>
              <button onClick={onPDF} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                <FileText size={13} /> PDF
              </button>
              <button onClick={onExcel} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                <FileSpreadsheet size={13} /> Excel
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="hod-table" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Adm No.</th>
                  <th>Class</th>
                  <th>Stream</th>
                  <th>Score</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                {filteredGrades.map(g => (
                  <tr key={g.id}>
                    <td style={{ fontWeight: 500 }}>{g.students?.full_name || '—'}</td>
                    <td className="hod-monospace">{g.students?.admission_number || '—'}</td>
                    <td>{g.students?.class || '—'}</td>
                    <td>{g.students?.stream || '—'}</td>
                    <td style={{ fontWeight: 600, color: Number(g.total_score || 0) >= 50 ? '#16a34a' : '#dc2626' }}>
                      {g.total_score ?? '—'}%
                    </td>
                    <td>
                      <span className="hod-sp-grade-chip">{g.grade || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

function Broadsheet({ filteredBroadsheet, broadsheetTotal, uniqueSubjects, selectedClass, setSelectedClass, gradeLevels, onPDF, onExcel, topN, setTopN }) {
  const [customTopN, setCustomTopN] = useState('')
  const topNPresets = [0, 3, 5, 10, 20, 100]

  const handleTopNChange = (val) => {
    setTopN(val)
    setCustomTopN('')
  }

  const handleCustomTopN = () => {
    const n = parseInt(customTopN, 10)
    if (!isNaN(n) && n > 0) setTopN(n)
  }
  return (
    <div className="hod-card">
      <div className="hod-card-header">
        <h3>Departmental Broadsheet</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            {topN > 0 ? `Top ${filteredBroadsheet.length} of ${broadsheetTotal}` : `${filteredBroadsheet.length} students`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {topNPresets.map(n => (
              <button
                key={n}
                onClick={() => handleTopNChange(n)}
                style={{
                  padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '1px solid',
                  borderColor: topN === n ? '#7c3aed' : '#e2e8f0',
                  background: topN === n ? '#7c3aed' : '#fff',
                  color: topN === n ? '#fff' : '#64748b',
                  transition: 'all 0.15s',
                }}
              >
                {n === 0 ? 'All' : `Top ${n}`}
              </button>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 4 }}>
              <input
                type="number"
                min={1}
                placeholder="Custom"
                value={customTopN}
                onChange={e => setCustomTopN(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustomTopN()}
                style={{ width: 60, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, textAlign: 'center', outline: 'none' }}
              />
              <button
                onClick={handleCustomTopN}
                style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#7c3aed' }}
              >
                Go
              </button>
            </div>
          </div>
          <button onClick={onPDF} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            <FileText size={13} /> PDF
          </button>
          <button onClick={onExcel} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            <FileSpreadsheet size={13} /> Excel
          </button>
          <select
            className="hod-sp-select"
            value={selectedClass}
            onChange={e => setSelectedClass(e.target.value)}
            style={{ minWidth: 140 }}
          >
            <option value="">All Classes</option>
            {gradeLevels.map(g => (
              <option key={g.id} value={g.name}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredBroadsheet.length === 0 ? (
        <p className="empty-state">No student data available for this term</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="hod-table" style={{ minWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>#</th>
                <th style={{ position: 'sticky', left: 30, background: '#fff', zIndex: 1 }}>Student</th>
                <th style={{ position: 'sticky', left: 160, background: '#fff', zIndex: 1 }}>Adm No.</th>
                <th style={{ position: 'sticky', left: 250, background: '#fff', zIndex: 1 }}>Class</th>
                {uniqueSubjects.map(sub => (
                  <th key={sub} style={{ textAlign: 'center', minWidth: 70 }}>{sub}</th>
                ))}
                <th style={{ textAlign: 'center', background: '#f3e8ff', fontWeight: 700 }}>Total</th>
                <th style={{ textAlign: 'center', background: '#f3e8ff', fontWeight: 700 }}>Average</th>
                <th style={{ textAlign: 'center', background: '#f3e8ff', fontWeight: 700 }}>Grade</th>
                <th style={{ textAlign: 'center', background: '#f3e8ff', fontWeight: 700 }}>Rank</th>
              </tr>
            </thead>
            <tbody>
              {filteredBroadsheet.map((s, idx) => (
                <tr key={s.student_id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                  <td style={{ position: 'sticky', left: 0, background: idx % 2 === 0 ? '#fff' : '#fafbfc', zIndex: 1, color: '#94a3b8' }}>
                    {s.rank}
                  </td>
                  <td style={{ position: 'sticky', left: 30, background: idx % 2 === 0 ? '#fff' : '#fafbfc', zIndex: 1, fontWeight: 500, minWidth: 130 }}>
                    {s.full_name}
                  </td>
                  <td className="hod-monospace" style={{ position: 'sticky', left: 160, background: idx % 2 === 0 ? '#fff' : '#fafbfc', zIndex: 1 }}>
                    {s.admission_number}
                  </td>
                  <td style={{ position: 'sticky', left: 250, background: idx % 2 === 0 ? '#fff' : '#fafbfc', zIndex: 1 }}>
                    {s.class}
                  </td>
                  {uniqueSubjects.map(sub => {
                    const score = s.subjects[sub]
                    return (
                      <td key={sub} style={{ textAlign: 'center', color: score != null ? (score >= 50 ? '#16a34a' : '#dc2626') : '#cbd5e1', fontWeight: score != null ? 500 : 400 }}>
                        {score != null ? score : '—'}
                      </td>
                    )
                  })}
                  <td style={{ textAlign: 'center', fontWeight: 700, background: '#f3e8ff' }}>
                    {s.total}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: s.average >= 50 ? '#16a34a' : '#dc2626', background: '#f3e8ff' }}>
                    {s.average}%
                  </td>
                  <td style={{ textAlign: 'center', background: '#f3e8ff' }}>
                    <span className="hod-sp-grade-chip" style={{
                      background: s.average >= 50 ? '#dcfce7' : '#fee2e2',
                      color: s.average >= 50 ? '#16a34a' : '#dc2626',
                    }}>
                      {s.grade}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, background: '#f3e8ff' }}>
                    {s.rank <= 3 ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: s.rank === 1 ? '#ca8a04' : s.rank === 2 ? '#64748b' : '#b45309' }}>
                        <Award size={14} />
                        {s.rank}
                      </span>
                    ) : s.rank}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DefaulterTracking({
  defaulters, defaulterSummary, threshold, setThreshold,
  selectedClass, setSelectedClass, selectedSubject, setSelectedSubject,
  subjects, gradeLevels, onPDF, onExcel, filteredGrades,
}) {
  const [expandedStudent, setExpandedStudent] = useState(null)

  const groupedDefaulters = (() => {
    const map = {}
    defaulters.forEach(d => {
      const key = d.admission_number
      if (!map[key]) {
        map[key] = {
          key,
          full_name: d.full_name,
          admission_number: d.admission_number,
          class: d.class,
          subjects: [],
          totalScore: 0,
          count: 0,
        }
      }
      map[key].subjects.push({ subject: d.subject, score: d.score, grade: d.grade })
      map[key].totalScore += d.score
      map[key].count += 1
    })
    return Object.values(map).map(s => ({
      ...s,
      average: s.count > 0 ? Math.round(s.totalScore / s.count) : 0,
    })).sort((a, b) => a.average - b.average)
  })()

  const getStudentAllGrades = (admissionNumber) => {
    return filteredGrades
      .filter(g => g.students?.admission_number === admissionNumber)
      .map(g => ({
        subject: g.subject || '—',
        score: Number(g.total_score || 0),
        grade: g.grade || '—',
      }))
      .sort((a, b) => a.score - b.score)
  }

  const toggleExpand = (key) => {
    setExpandedStudent(prev => prev === key ? null : key)
  }

  return (
    <>
      <div className="hod-sp-metrics">
        <div className="hod-sp-metric-card">
          <p className="hod-sp-metric-value" style={{ color: '#dc2626' }}>{defaulterSummary.total}</p>
          <p className="hod-sp-metric-label">Total Defaulters</p>
          <span className="hod-sp-metric-sub">Below {threshold}% threshold</span>
        </div>
        <div className="hod-sp-metric-card">
          <p className="hod-sp-metric-value" style={{ color: '#ca8a04' }}>{defaulterSummary.worstSubject}</p>
          <p className="hod-sp-metric-label">Worst Subject</p>
          <span className="hod-sp-metric-sub">{defaulterSummary.worstSubjectCount} defaulters</span>
        </div>
        <div className="hod-sp-metric-card">
          <p className="hod-sp-metric-value" style={{ color: '#7c3aed' }}>{defaulterSummary.mostAffectedClass}</p>
          <p className="hod-sp-metric-label">Most Affected Class</p>
          <span className="hod-sp-metric-sub">{defaulterSummary.mostAffectedClassCount} defaulters</span>
        </div>
      </div>

      <div className="hod-card">
        <div className="hod-card-header">
          <h3>Defaulter List</h3>
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
            <select
              className="hod-sp-select"
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
            >
              <option value="">All Classes</option>
              {gradeLevels.map(g => (
                <option key={g.id} value={g.name}>{g.name}</option>
              ))}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={14} style={{ color: '#94a3b8' }} />
              <span style={{ fontSize: 12, color: '#64748b' }}>Threshold:</span>
              <input
                type="number"
                min={0}
                max={100}
                value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                style={{
                  width: 50, padding: '5px 8px', border: '1px solid #e2e8f0',
                  borderRadius: 6, fontSize: 13, textAlign: 'center', outline: 'none',
                }}
              />
              <span style={{ fontSize: 12, color: '#94a3b8' }}>%</span>
            </div>
            <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
              <button onClick={onPDF} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                <FileText size={13} /> PDF
              </button>
              <button onClick={onExcel} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                <FileSpreadsheet size={13} /> Excel
              </button>
            </div>
          </div>
        </div>

        {groupedDefaulters.length === 0 ? (
          <p className="empty-state">No students below {threshold}% threshold</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="hod-table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Adm No.</th>
                  <th>Class</th>
                  <th style={{ textAlign: 'center' }}>Subjects</th>
                  <th style={{ textAlign: 'center' }}>Average</th>
                  <th style={{ textAlign: 'center' }}>Grade</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {groupedDefaulters.map((s, i) => {
                  const isExpanded = expandedStudent === s.key
                  return (
                    <Fragment key={s.key}>
                      <tr
                        onClick={() => toggleExpand(s.key)}
                        style={{ cursor: 'pointer', background: isExpanded ? '#fef3f2' : i % 2 === 0 ? '#fff' : '#fafbfc' }}
                      >
                        <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                        <td style={{ fontWeight: 500 }}>{s.full_name}</td>
                        <td className="hod-monospace">{s.admission_number}</td>
                        <td>{s.class}</td>
                        <td style={{ textAlign: 'center' }}>{s.count} Subject{s.count !== 1 ? 's' : ''}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600, color: s.average >= 50 ? '#16a34a' : '#dc2626' }}>
                          {s.average}%
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="hod-sp-grade-chip" style={{
                            background: s.average >= 50 ? '#dcfce7' : '#fee2e2',
                            color: s.average >= 50 ? '#16a34a' : '#dc2626',
                          }}>
                            {computeGrade(s.average, s.class)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="hod-badge hod-badge-low">Below Threshold</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(s.key) }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                              background: isExpanded ? '#7c3aed' : '#f3e8ff', color: isExpanded ? '#fff' : '#7c3aed',
                              border: '1px solid', borderColor: isExpanded ? '#7c3aed' : '#ddd6fe',
                              borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                            }}
                          >
                            {isExpanded ? 'Close' : 'View'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} style={{ padding: 0, background: '#fef9f8', borderBottom: '2px solid #e2e8f0' }}>
                            <div style={{ padding: '12px 16px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{s.full_name}</span>
                                <span style={{ fontSize: 12, color: '#64748b' }}>{s.class} · {s.admission_number}</span>
                                <span style={{ fontSize: 12, color: '#64748b' }}>Average: <strong style={{ color: s.average >= 50 ? '#16a34a' : '#dc2626' }}>{s.average}%</strong></span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                                {getStudentAllGrades(s.admission_number).map((g, gi) => (
                                  <div key={gi} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '8px 12px', background: '#fff', border: '1px solid #e2e8f0',
                                    borderRadius: 6, borderLeft: `3px solid ${g.score < threshold ? '#dc2626' : g.score >= 50 ? '#16a34a' : '#ca8a04'}`,
                                  }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                      <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{g.subject}</span>
                                      <span style={{ fontSize: 11, color: '#64748b' }}>{g.grade}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{
                                        fontSize: 15, fontWeight: 700,
                                        color: g.score < threshold ? '#dc2626' : g.score >= 50 ? '#16a34a' : '#ca8a04',
                                      }}>
                                        {g.score}%
                                      </span>
                                      <span className={`hod-badge ${g.score >= 50 ? 'hod-badge-good' : 'hod-badge-low'}`} style={{ fontSize: 10 }}>
                                        {g.score >= 50 ? 'Pass' : 'Fail'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
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
    </>
  )
}

function PerformanceTrends({
  subjectAverages, topSubjects, bottomSubjects, avgScore,
  passRate, totalStudents, grades, sortField, sortDir, handleSort,
  sortedSubjectAverages, onPDF, onExcel,
}) {
  return (
    <>
      <div className="hod-sp-metrics">
        <div className="hod-sp-metric-card">
          <p className="hod-sp-metric-value" style={{ color: '#2563eb' }}>{totalStudents}</p>
          <p className="hod-sp-metric-label">Total Grades</p>
          <span className="hod-sp-metric-sub">This term</span>
        </div>
        <div className="hod-sp-metric-card">
          <p className="hod-sp-metric-value" style={{ color: avgScore >= 50 ? '#16a34a' : '#dc2626' }}>{avgScore}%</p>
          <p className="hod-sp-metric-label">Overall Average</p>
          <span className="hod-sp-metric-trend" style={{ color: avgScore >= 50 ? '#16a34a' : '#dc2626' }}>
            {avgScore >= 50 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {avgScore >= 50 ? 'Performing well' : 'Needs attention'}
          </span>
        </div>
        <div className="hod-sp-metric-card">
          <p className="hod-sp-metric-value" style={{ color: '#7c3aed' }}>{passRate}%</p>
          <p className="hod-sp-metric-label">Pass Rate</p>
          <span className="hod-sp-metric-sub">Score ≥ 50%</span>
        </div>
        <div className="hod-sp-metric-card">
          <p className="hod-sp-metric-value" style={{ color: '#0f172a' }}>{subjectAverages.length}</p>
          <p className="hod-sp-metric-label">Subjects</p>
          <span className="hod-sp-metric-sub">Across department</span>
        </div>
      </div>

      <div className="hod-grid">
        <div className="hod-card">
          <div className="hod-card-header">
            <h3>Top 5 Subjects</h3>
            <span className="hod-badge hod-badge-good"><Award size={12} /> Best performers</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="hod-table" style={{ minWidth: 450 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Subject</th>
                  <th>Average</th>
                  <th>Pass Rate</th>
                  <th>Entries</th>
                </tr>
              </thead>
              <tbody>
                {topSubjects.map((s, i) => (
                  <tr key={s.name}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: i === 0 ? '#ca8a04' : i === 1 ? '#64748b' : i === 2 ? '#b45309' : '#94a3b8' }}>
                        {i < 3 && <Award size={14} />}
                        {i + 1}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td style={{ color: '#16a34a', fontWeight: 600 }}>{s.avg}%</td>
                    <td>{s.passRate}%</td>
                    <td style={{ color: '#64748b' }}>{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="hod-card">
          <div className="hod-card-header">
            <h3>Bottom 5 Subjects</h3>
            <span className="hod-badge hod-badge-low"><AlertTriangle size={12} /> Need improvement</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="hod-table" style={{ minWidth: 450 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Subject</th>
                  <th>Average</th>
                  <th>Pass Rate</th>
                  <th>Entries</th>
                </tr>
              </thead>
              <tbody>
                {bottomSubjects.map((s, i) => (
                  <tr key={s.name}>
                    <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td style={{ color: s.avg >= 50 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{s.avg}%</td>
                    <td>{s.passRate}%</td>
                    <td style={{ color: '#64748b' }}>{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="hod-card">
          <div className="hod-card-header">
            <h3>Subject Performance Summary</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => handleSort('name')}
                style={{ fontSize: 12, color: '#7c3aed', cursor: 'pointer', fontWeight: sortField === 'name' ? 700 : 400, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' }}
              >
                Name {sortField === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
              <button
                onClick={() => handleSort('average')}
                style={{ fontSize: 12, color: '#7c3aed', cursor: 'pointer', fontWeight: sortField === 'average' ? 700 : 400, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' }}
              >
                Average {sortField === 'average' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
              <button
                onClick={() => handleSort('passRate')}
                style={{ fontSize: 12, color: '#7c3aed', cursor: 'pointer', fontWeight: sortField === 'passRate' ? 700 : 400, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' }}
              >
                Pass Rate {sortField === 'passRate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
              <div style={{ width: 1, height: 16, background: '#e2e8f0', margin: '0 4px' }} />
              <button onClick={onPDF} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                <FileText size={13} /> PDF
              </button>
              <button onClick={onExcel} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                <FileSpreadsheet size={13} /> Excel
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="hod-table" style={{ minWidth: 500 }}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Average</th>
                  <th>Pass Rate</th>
                  <th>Entries</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedSubjectAverages.map(s => (
                  <tr key={s.name}>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td style={{ color: s.avg >= 50 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{s.avg}%</td>
                    <td style={{ color: '#64748b' }}>{s.passRate}%</td>
                    <td style={{ color: '#64748b' }}>{s.count}</td>
                    <td>
                      <span className={`hod-badge ${s.avg >= 50 ? 'hod-badge-good' : 'hod-badge-low'}`}>
                        {s.avg >= 50 ? 'Good' : 'Needs Improvement'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

function ClassAverages({ classAverages, grades, selectedSubject, setSelectedSubject, subjects, cbcPoints, cbcBand, cbcBandLabel, currentTerm, currentYear }) {
  const [expandedClass, setExpandedClass] = useState(null)

  const cbcBandColors = {
    EE: { bg: '#dcfce7', color: '#16a34a', label: 'Exceeding Expectations' },
    ME: { bg: '#dbeafe', color: '#2563eb', label: 'Meeting Expectations' },
    AE: { bg: '#fef3c7', color: '#ca8a04', label: 'Approaching Expectations' },
    BE: { bg: '#fee2e2', color: '#dc2626', label: 'Below Expectations' },
  }

  const classSubjectBreakdown = (() => {
    if (!expandedClass) return []
    const map = {}
    grades.forEach(g => {
      if (g.students?.class !== expandedClass) return
      if (selectedSubject && g.subject !== selectedSubject) return
      if (!g.subject) return
      if (!map[g.subject]) map[g.subject] = { scores: [], points: [], count: 0, bands: { EE: 0, ME: 0, AE: 0, BE: 0 } }
      const score = Number(g.total_score || 0)
      const pts = cbcPoints(score, g.students?.class)
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
      Object.keys(d.bands).forEach(b => {
        dist[b] = d.count > 0 ? Math.round((d.bands[b] / d.count) * 100) : 0
      })
      return {
        name,
        meanPoints: meanPts,
        grade: cbcBandLabel(Math.round(meanPts)),
        band: cbcBand(Math.round(meanPts)),
        count: d.count,
        dist,
      }
    }).sort((a, b) => b.meanPoints - a.meanPoints)
  })()

  const overallMeanPoints = classAverages.length > 0
    ? Math.round(classAverages.reduce((s, c) => s + c.meanPoints, 0) / classAverages.length * 10) / 10
    : 0
  const overallStudents = classAverages.reduce((s, c) => s + c.students, 0)
  const overallBand = cbcBand(Math.round(overallMeanPoints))

  const overallDist = { EE: 0, ME: 0, AE: 0, BE: 0 }
  classAverages.forEach(c => {
    Object.keys(c.dist).forEach(b => {
      overallDist[b] += Math.round(c.dist[b] * c.students / 100)
    })
  })
  const overallDistPct = {}
  Object.keys(overallDist).forEach(b => {
    overallDistPct[b] = overallStudents > 0 ? Math.round((overallDist[b] / overallStudents) * 100) : 0
  })

  const bandBarWidth = (pct) => Math.max(pct, 2)

  const exportClassPDF = async (cls) => {
    const schoolData = await (async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('schools(name, logo_url, address, phone, email, motto)')
        .eq('id', (await supabase.auth.getUser()).data.user.id)
        .single()
      return profile?.schools
    })()

    const bandColor = cbcBandColors[cls.band]

    const subjectRows = classSubjectBreakdown
      .filter(() => expandedClass === cls.name)
      .map(s => {
        const sBand = cbcBandColors[s.band]
        return `<tr>
          <td style="font-weight:500">${s.name}</td>
          <td style="text-align:center;font-weight:700;color:${sBand?.color || '#64748b'}">${s.meanPoints}/8</td>
          <td style="text-align:center"><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${sBand?.bg || '#f1f5f9'};color:${sBand?.color || '#64748b'}">${s.grade}</span></td>
          <td style="text-align:center">${s.dist.EE}%</td>
          <td style="text-align:center">${s.dist.ME}%</td>
          <td style="text-align:center">${s.dist.AE}%</td>
          <td style="text-align:center">${s.dist.BE}%</td>
        </tr>`
      }).join('')

    const distBarHtml = ['EE', 'ME', 'AE', 'BE'].map(band =>
      `<div style="text-align:center;flex:1;padding:12px 8px;background:${cbcBandColors[band].bg};border-radius:8px;border:1px solid ${cbcBandColors[band].color}22">
        <div style="font-size:24px;font-weight:700;color:${cbcBandColors[band].color}">${cls.dist[band]}%</div>
        <div style="font-size:11px;font-weight:600;color:${cbcBandColors[band].color};margin-top:2px">${band}</div>
        <div style="font-size:9px;color:#64748b">${cbcBandColors[band].label}</div>
      </div>`
    ).join('')

    const allSubjectHtml = (() => {
      const allMap = {}
      grades.forEach(g => {
        if (g.students?.class !== cls.name) return
        if (!g.subject) return
        if (!allMap[g.subject]) allMap[g.subject] = { scores: [], points: [], count: 0, bands: { EE: 0, ME: 0, AE: 0, BE: 0 } }
        const score = Number(g.total_score || 0)
        const pts = cbcPoints(score, g.students?.class)
        allMap[g.subject].scores.push(score)
        allMap[g.subject].points.push(pts)
        allMap[g.subject].count += 1
        allMap[g.subject].bands[cbcBand(pts)] += 1
      })
      return Object.entries(allMap).map(([name, d]) => {
        const meanPts = d.points.length > 0
          ? Math.round(d.points.reduce((a, b) => a + b, 0) / d.points.length * 10) / 10
          : 0
        const dist = {}
        Object.keys(d.bands).forEach(b => { dist[b] = d.count > 0 ? Math.round((d.bands[b] / d.count) * 100) : 0 })
        return { name, meanPoints: meanPts, grade: cbcBandLabel(Math.round(meanPts)), band: cbcBand(Math.round(meanPts)), count: d.count, dist }
      }).sort((a, b) => b.meanPoints - a.meanPoints)
    })()

    const subjectTableRows = allSubjectHtml.map(s => {
      const sBand = cbcBandColors[s.band]
      return `<tr>
        <td style="font-weight:500">${s.name}</td>
        <td style="text-align:center;font-weight:700;color:${sBand?.color || '#64748b'}">${s.meanPoints}/8</td>
        <td style="text-align:center"><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${sBand?.bg || '#f1f5f9'};color:${sBand?.color || '#64748b'}">${s.grade}</span></td>
        <td style="text-align:center">${s.count}</td>
        <td style="text-align:center">${s.dist.EE}%</td>
        <td style="text-align:center">${s.dist.ME}%</td>
        <td style="text-align:center">${s.dist.AE}%</td>
        <td style="text-align:center">${s.dist.BE}%</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${cls.name} CBC Proficiency — ${currentTerm} ${currentYear}</title>
<style>
  ${REPORT_CARD_STYLES}
  .rc-center-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
  .rc-center-table th { background: #1e293b; color: #fff; padding: 8px 10px; text-align: left; font-weight: 700; font-size: 10px; border: 1px solid #94a3b8; text-transform: uppercase; letter-spacing: 0.03em; }
  .rc-center-table td { padding: 7px 10px; border: 1px solid #cbd5e1; color: #1e293b; }
  .rc-center-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .rc-center-metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0; }
  .rc-center-metric { padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center; }
  .rc-center-metric-value { font-size: 18px; font-weight: 700; color: #0f172a; }
  .rc-center-metric-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
  .rc-center-title { font-size: 16px; font-weight: 800; color: #0f172a; text-align: center; margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .rc-center-subtitle { font-size: 11px; color: #64748b; text-align: center; margin-bottom: 10px; }
  .rc-center-footer { text-align: center; font-size: 9px; color: #94a3b8; margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
  @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; } body { margin: 0; padding: 0; } .rc-wrap { width: 100%; max-width: none; padding: 12px 16px; } }
</style></head><body>
<div class="rc-wrap">
  <div class="rc-top">
    <div class="rc-logo-box">${schoolData?.logo_url ? `<img src="${schoolData.logo_url}" alt="Logo" />` : `<div class="rc-logo-placeholder">${(schoolData?.name || 'S')[0]}</div>`}</div>
    <div class="rc-school-block">
      <div class="rc-school-name">${schoolData?.name || 'School'}</div>
      ${schoolData?.address ? `<div class="rc-school-contact">${schoolData.address}${schoolData.phone ? ' · ' + schoolData.phone : ''}${schoolData.email ? ' · ' + schoolData.email : ''}</div>` : ''}
    </div>
  </div>
  <hr class="rc-hr" />

  <div class="rc-center-title">${cls.name} — CBC Proficiency Report</div>
  <div class="rc-center-subtitle">${currentTerm} ${currentYear} · ${cls.students} students</div>

  <div class="rc-center-metric-grid">
    <div class="rc-center-metric">
      <div class="rc-center-metric-value" style="color:${bandColor?.color || '#64748b'}">${cls.meanPoints}/8</div>
      <div class="rc-center-metric-label">Mean Points</div>
    </div>
    <div class="rc-center-metric">
      <div class="rc-center-metric-value" style="color:${bandColor?.color || '#64748b'}">${cls.meanGrade}</div>
      <div class="rc-center-metric-label">Grade</div>
    </div>
    <div class="rc-center-metric">
      <div class="rc-center-metric-value" style="color:#16a34a">${cls.highest}</div>
      <div class="rc-center-metric-label">Highest</div>
    </div>
    <div class="rc-center-metric">
      <div class="rc-center-metric-value" style="color:#dc2626">${cls.lowest}</div>
      <div class="rc-center-metric-label">Lowest</div>
    </div>
  </div>

  <div style="font-size:12px;font-weight:700;color:#0f172a;margin:12px 0 8px;text-transform:uppercase;letter-spacing:0.3px">Proficiency Distribution</div>
  <div style="display:flex;gap:10px;margin-bottom:16px">${distBarHtml}</div>

  <div style="font-size:12px;font-weight:700;color:#0f172a;margin:12px 0 8px;text-transform:uppercase;letter-spacing:0.3px">Subject Breakdown</div>
  <table class="rc-center-table">
    <thead><tr>
      <th>Subject</th><th style="text-align:center">Mean Points</th><th style="text-align:center">Grade</th>
      <th style="text-align:center">EE</th><th style="text-align:center">ME</th><th style="text-align:center">AE</th><th style="text-align:center">BE</th>
    </tr></thead>
    <tbody>${subjectTableRows}</tbody>
  </table>

  <div class="rc-center-footer">Generated on ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })} · ${currentTerm} ${currentYear}</div>
</div>
</body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.onload = () => { win.focus(); win.print() }
  }

  return (
    <>
      <div className="hod-sp-metrics">
        <div className="hod-sp-metric-card">
          <p className="hod-sp-metric-value" style={{ color: '#2563eb' }}>{classAverages.length}</p>
          <p className="hod-sp-metric-label">Classes</p>
          <span className="hod-sp-metric-sub">{overallStudents} students total</span>
        </div>
        <div className="hod-sp-metric-card">
          <p className="hod-sp-metric-value" style={{ color: cbcBandColors[overallBand]?.color || '#64748b' }}>{overallMeanPoints}/8</p>
          <p className="hod-sp-metric-label">Overall Mean Points</p>
          <span className="hod-sp-metric-sub">{cbcBandLabel(Math.round(overallMeanPoints))} — {cbcBandColors[overallBand]?.label}</span>
        </div>
        <div className="hod-sp-metric-card">
          <p className="hod-sp-metric-value" style={{ color: '#16a34a' }}>{classAverages.length > 0 ? classAverages[0].name : '—'}</p>
          <p className="hod-sp-metric-label">Top Class</p>
          <span className="hod-sp-metric-sub">{classAverages.length > 0 ? classAverages[0].meanPoints + '/8' : '—'}</span>
        </div>
      </div>

      <div className="hod-card" style={{ marginBottom: 12 }}>
        <div className="hod-card-header">
          <h3>Proficiency Distribution (All Classes)</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '0 16px 16px' }}>
          {['EE', 'ME', 'AE', 'BE'].map(band => (
            <div key={band} style={{ textAlign: 'center', padding: '10px 8px', background: cbcBandColors[band].bg, borderRadius: 8, border: `1px solid ${cbcBandColors[band].color}22` }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: cbcBandColors[band].color }}>{overallDistPct[band]}%</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: cbcBandColors[band].color, marginTop: 2 }}>{band}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>{cbcBandColors[band].label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="hod-card">
        <div className="hod-card-header">
          <h3>Class CBC Proficiency</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        </div>

        {classAverages.length === 0 ? (
          <p className="empty-state">No class data available for this term</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="hod-table" style={{ minWidth: 800 }}>
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
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {classAverages.map((c, i) => {
                  const isExpanded = expandedClass === c.name
                  const bandColor = cbcBandColors[c.band]
                  const barWidth = classAverages[0]?.meanPoints > 0 ? Math.round((c.meanPoints / classAverages[0].meanPoints) * 100) : 0
                  return (
                    <Fragment key={c.name}>
                      <tr
                        onClick={() => setExpandedClass(prev => prev === c.name ? null : c.name)}
                        style={{ cursor: 'pointer', background: isExpanded ? '#f3e8ff' : i % 2 === 0 ? '#fff' : '#fafbfc' }}
                      >
                        <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td style={{ textAlign: 'center' }}>{c.students}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{
                                width: `${barWidth}%`, height: '100%',
                                background: bandColor?.color || '#94a3b8',
                                borderRadius: 3, transition: 'width 0.3s',
                              }} />
                            </div>
                            <span style={{ fontWeight: 700, color: bandColor?.color || '#64748b', minWidth: 36 }}>{c.meanPoints}/8</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="hod-sp-grade-chip" style={{ background: bandColor?.bg, color: bandColor?.color }}>
                            {c.meanGrade}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', minWidth: 180 }}>
                          <div style={{ display: 'flex', gap: 3, height: 8, borderRadius: 4, overflow: 'hidden' }}>
                            {['EE', 'ME', 'AE', 'BE'].map(band => (
                              <div key={band} style={{
                                width: `${bandBarWidth(c.dist[band])}%`,
                                background: cbcBandColors[band].color,
                                transition: 'width 0.3s',
                              }} title={`${band}: ${c.dist[band]}%`} />
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 3, justifyContent: 'center' }}>
                            {['EE', 'ME', 'AE', 'BE'].map(band => (
                              <span key={band} style={{ fontSize: 9, color: cbcBandColors[band].color, fontWeight: 600 }}>
                                {band} {c.dist[band]}%
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 500 }}>{c.highest}</td>
                        <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 500 }}>{c.lowest}</td>
                        <td style={{ textAlign: 'center', color: '#64748b' }}>{c.median}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedClass(prev => prev === c.name ? null : c.name) }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                                background: isExpanded ? '#7c3aed' : '#f3e8ff', color: isExpanded ? '#fff' : '#7c3aed',
                                border: '1px solid', borderColor: isExpanded ? '#7c3aed' : '#ddd6fe',
                                borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                              }}
                            >
                              {isExpanded ? 'Close' : 'Subjects'}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); exportClassPDF(c) }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                                background: '#fee2e2', color: '#dc2626',
                                border: '1px solid #fca5a5',
                                borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                              }}
                            >
                              <FileText size={12} /> PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={10} style={{ padding: 0, background: '#faf5ff', borderBottom: '2px solid #e2e8f0' }}>
                            <div style={{ padding: '12px 16px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{c.name}</span>
                                <span style={{ fontSize: 12, color: '#64748b' }}>{c.students} students</span>
                                <span className="hod-sp-grade-chip" style={{ background: bandColor?.bg, color: bandColor?.color, fontSize: 11 }}>
                                  Mean: {c.meanPoints}/8 — {c.meanGrade}
                                </span>
                              </div>

                              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                                {['EE', 'ME', 'AE', 'BE'].map(band => (
                                  <div key={band} style={{ flex: 1, minWidth: 100, padding: '8px 10px', background: cbcBandColors[band].bg, borderRadius: 6, textAlign: 'center', border: `1px solid ${cbcBandColors[band].color}22` }}>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: cbcBandColors[band].color }}>{c.dist[band]}%</div>
                                    <div style={{ fontSize: 10, color: cbcBandColors[band].color, fontWeight: 600 }}>{band}</div>
                                  </div>
                                ))}
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
                                {classSubjectBreakdown.map((s, si) => {
                                  const sBandColor = cbcBandColors[s.band]
                                  return (
                                    <div key={si} style={{
                                      padding: '10px 12px', background: '#fff', border: '1px solid #e2e8f0',
                                      borderRadius: 6, borderLeft: `3px solid ${sBandColor?.color || '#94a3b8'}`,
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{s.name}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span style={{ fontSize: 15, fontWeight: 700, color: sBandColor?.color || '#64748b' }}>{s.meanPoints}/8</span>
                                          <span className="hod-sp-grade-chip" style={{ background: sBandColor?.bg, color: sBandColor?.color, fontSize: 10 }}>
                                            {s.grade}
                                          </span>
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', gap: 3, height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                                        {['EE', 'ME', 'AE', 'BE'].map(band => (
                                          <div key={band} style={{
                                            width: `${bandBarWidth(s.dist[band])}%`,
                                            background: cbcBandColors[band].color,
                                          }} title={`${band}: ${s.dist[band]}%`} />
                                        ))}
                                      </div>
                                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                        {['EE', 'ME', 'AE', 'BE'].map(band => (
                                          <span key={band} style={{ fontSize: 9, color: cbcBandColors[band].color, fontWeight: 500 }}>
                                            {band} {s.dist[band]}%
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                })}
                                {classSubjectBreakdown.length === 0 && (
                                  <span style={{ fontSize: 13, color: '#94a3b8' }}>No subject data for this class</span>
                                )}
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
    </>
  )
}
