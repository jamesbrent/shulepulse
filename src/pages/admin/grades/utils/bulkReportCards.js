import { supabase } from '../../../../lib/supabase'
import { buildReportCardHtml, REPORT_CARD_STYLES, groupGradesBySubject, getCBEGrade, calculateClassRank, fetchStudentComments } from '../../../../components/students/ReportCard'
import { weightedScoreMean } from '../../../../services/grading'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'

export async function fetchBulkData(schoolId, filterClass, filterTerm, filterYear, filterExam) {
  const query = supabase
    .from('grades')
    .select('*, students(id, full_name, class, admission_number)')
    .eq('school_id', schoolId)
    .eq('term', filterTerm)
    .eq('year', filterYear)

  if (filterClass) query.eq('class_name', filterClass)
  if (filterExam === 'Midterm') query.lte('total_score', 50)
  if (filterExam === 'Endterm') query.gt('total_score', 50)

  const { data } = await query.order('created_at', { ascending: false })
  const valid = (data || []).filter(r => r.students)

  const grouped = {}
  valid.forEach(g => {
    const id = g.students.id
    if (!grouped[id]) grouped[id] = { student: g.students, grades: [] }
    grouped[id].grades.push(g)
  })

  const entries = Object.values(grouped).map(e => {
    const groupedSubjects = groupGradesBySubject(e.grades)
    return {
      ...e,
      avg: groupedSubjects.overallAverage,
      totalMarks: groupedSubjects.totalMarks,
      totalMax: groupedSubjects.totalMax,
      subjectCount: groupedSubjects.totalSubjects,
      groupedSubjects,
    }
  })

  return entries
}

export async function fetchBulkDataWithExtras(schoolId, filterClass, filterTerm, filterYear, filterExam) {
  const entries = await fetchBulkData(schoolId, filterClass, filterTerm, filterYear, filterExam)
  if (entries.length === 0) return entries

  const studentIds = entries.map(e => e.student.id)
  const classNames = [...new Set(entries.map(e => e.student.class).filter(Boolean))]

  const classAveragesMap = {}
  const historicalDataMap = {}
  const rankEntries = []

  for (const cls of classNames) {
    const classStudents = entries.filter(e => e.student.class === cls)
    if (classStudents.length === 0) continue

    const allStudentIds = classStudents.map(e => e.student.id)
    const { data: allGrades } = await supabase
      .from('grades')
      .select('student_id, subject, total_score, exam_type, max_marks')
      .eq('school_id', schoolId)
      .eq('term', filterTerm)
      .eq('year', filterYear)
      .in('student_id', allStudentIds)

    const subjectGroups = {}
    ;(allGrades || []).forEach(g => {
      if (!subjectGroups[g.subject]) subjectGroups[g.subject] = []
      subjectGroups[g.subject].push(g)
    })

    classAveragesMap[cls] = Object.entries(subjectGroups).map(([name, rows]) => {
      const avg = rows.length > 0
        ? Math.round(weightedScoreMean(rows))
        : 0
      return { name, avg }
    })

    classStudents.forEach(e => {
      rankEntries.push({
        studentId: e.student.id,
        avg: e.avg || 0,
        class: cls,
      })
    })

    const { data: histGrades } = await supabase
      .from('grades')
      .select('student_id, subject, total_score, term, year')
      .eq('school_id', schoolId)
      .in('student_id', allStudentIds)
      .neq('term', filterTerm)
      .neq('year', filterYear)
      .order('year', { ascending: true })
      .order('term', { ascending: true })

    const histByStudent = {}
    ;(histGrades || []).forEach(g => {
      if (!histByStudent[g.student_id]) histByStudent[g.student_id] = []
      histByStudent[g.student_id].push(g)
    })

    const termOrder = { 'Term 1': 1, 'Term 2': 2, 'Term 3': 3 }
    const gradeOrder = ['PP1', 'PP2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11']
    const currentGradeIdx = gradeOrder.indexOf(cls)

    const gradeTerms = {}
    for (const sid of allStudentIds) {
      const rows = histByStudent[sid] || []
      const byTermYear = {}
      rows.forEach(r => {
        const key = `${r.year}-${r.term}`
        if (!byTermYear[key]) byTermYear[key] = []
        byTermYear[key].push(r)
      })
      Object.entries(byTermYear).forEach(([ky, rows]) => {
        const [yr, t] = ky.split('-')
        const gIdx = currentGradeIdx >= 0 ? currentGradeIdx - 1 : 0
        const gradeLabel = gradeOrder[Math.max(0, gIdx)] || cls
        if (!gradeTerms[gradeLabel]) gradeTerms[gradeLabel] = {}
        const existing = gradeTerms[gradeLabel][t]
        const avg = Math.round(weightedScoreMean(rows))
        gradeTerms[gradeLabel][t] = existing ? Math.round((existing + avg) / 2) : avg
      })
    }

    const histData = Object.entries(gradeTerms).map(([grade, terms]) => ({
      grade,
      terms,
    })).slice(0, 4)

    historicalDataMap[cls] = histData
  }

  return entries.map(e => {
    const cls = e.student.class
    const classRank = calculateClassRank(
      rankEntries.filter(r => r.class === cls),
      e.student.id
    )
    return {
      ...e,
      classAverages: classAveragesMap[cls] || [],
      classRank,
      historicalData: historicalDataMap[cls] || [],
    }
  })
}

function buildFullPageHtml(entriesHtml, term, year) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Report Cards – ${term} ${year}</title>
<style>
${REPORT_CARD_STYLES}
@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  body { margin: 0; padding: 0; }
  .rc-wrap { width: 100%; max-width: none; padding: 12px 16px; }
  .rc-page-break { page-break-after: always; break-after: page; }
  .rc-page-break:last-child { page-break-after: auto; break-after: auto; }
}
@page { size: A4 portrait; margin: 10mm; }
</style></head><body>${entriesHtml}</body></html>`
}

function openPrintWindow(entries, school, term, year) {
  if (!entries.length) return
  const allHtml = entries.map(({ student, grades, classAverages, classRank, historicalData }) =>
    `<div class="rc-page-break">${buildReportCardHtml(student, grades, school, term, year, { classAverages, classRank, historicalData })}</div>`
  ).join('')

  const win = window.open('', '_blank')
  win.document.write(buildFullPageHtml(allHtml, term, year))
  win.document.close()
  win.onload = () => { win.focus(); win.print() }
}

export function bulkPrint(entries, school, term, year) {
  openPrintWindow(entries, school, term, year)
}

export async function downloadBulkZip(entries, school, term, year, onProgress) {
  openPrintWindow(entries, school, term, year)
  if (onProgress) onProgress(entries.length, entries.length)
}

export function buildRankingSheet(entries) {
  const sorted = [...entries].sort((a, b) => (b.avg || 0) - (a.avg || 0))
  let currentRank = 0
  let prevScore = null
  const rows = sorted.map((e, i) => {
    const score = e.avg || 0
    if (score !== prevScore) {
      currentRank = i + 1
      prevScore = score
    }
    const cbe = getCBEGrade(score, e.student?.class || '')
    return {
      'Position': currentRank,
      'Admission No': e.student?.admission_number || '',
      'Full Name': e.student?.full_name || '',
      'Class': e.student?.class || '',
      'Subjects': e.subjectCount || e.grades.length,
      'Average Score': score ? `${score}%` : '—',
      'Grade': cbe.band || cbe.grade || '—',
      'Points': cbe.points || '—',
    }
  })
  return rows
}

export async function exportBulkPack(entries, school, term, year, onProgress) {
  const ranking = buildRankingSheet(entries)
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(ranking)
  XLSX.utils.book_append_sheet(wb, ws, 'Class Ranking')
  const xlsxBlob = new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' })
  const baseName = `Report_Cards_${term.replace(/\s/g, '_')}_${year}`
  saveAs(xlsxBlob, `${baseName}_Class_Ranking.xlsx`)

  openPrintWindow(entries, school, term, year)
  if (onProgress) onProgress(entries.length, entries.length)
}
