import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import {
  PAGE, COLORS, FONT,
  drawSchoolHeader as _drawSchoolHeader,
  drawWatermark,
  drawDocMeta,
  drawFooter,
  generateDocId,
  ensureSpace as _ensureSpace,
  fmtDate as fmtDateFull,
} from './schoolPdfTemplate'

import { getGrade, gradeDisplay, sortBands, rankEntries } from '../services/grading'

const F = FONT.SERIF
const BLUE = COLORS.PRIMARY
const DARK = COLORS.DARK
const MED = COLORS.MEDIUM
const FAINT = COLORS.FAINT
const BG = COLORS.BG
const ORI = 'portrait'

function fmtDateNow() { return fmtDateFull(new Date()) }

async function header(doc, school) {
  return await _drawSchoolHeader(doc, school, { y: PAGE.MARGIN, orientation: ORI })
}

function putFooter(doc, school, docId) {
  drawFooter(doc, school, { showDocId: true, docId, orientation: ORI })
}

function ensureSpace(doc, y, needed) {
  return _ensureSpace(doc, y, needed, ORI)
}

function docTitle(doc, text, y) {
  doc.setFont(F, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...BLUE)
  doc.text(text, PAGE.CENTER, y, { align: 'center' })
  return y + 7
}

function docSub(doc, text, y) {
  doc.setFont(F, 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  doc.text(text, PAGE.CENTER, y, { align: 'center' })
  return y + 5
}

function docItalic(doc, text, y) {
  doc.setFont(F, 'italic')
  doc.setFontSize(8)
  doc.setTextColor(...MED)
  doc.text(text, PAGE.CENTER, y, { align: 'center' })
  return y + 5
}

function sectionHead(doc, text, y) {
  doc.setFont(F, 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...BLUE)
  doc.text(text, PAGE.MARGIN, y)
  return y + 8
}

function summaryTable(doc, rows, y) {
  autoTable(doc, {
    startY: y,
    body: rows,
    styles: { fontSize: 8, cellPadding: 3, font: F },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 35, fillColor: BG },
      1: { cellWidth: 30 },
      2: { fontStyle: 'bold', cellWidth: 35, fillColor: BG },
      3: { cellWidth: 30 },
    },
    tableLineColor: FAINT,
    tableLineWidth: 0.15,
    margin: { left: PAGE.MARGIN, right: PAGE.MARGIN },
    theme: 'grid',
  })
  return doc.lastAutoTable.finalY + 10
}

function tbl(doc, { head, body, startY, fontSize = 8 }) {
  autoTable(doc, {
    startY,
    head,
    body,
    styles: { fontSize, cellPadding: 2, font: F },
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontSize, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: BG },
    tableLineColor: FAINT,
    tableLineWidth: 0.15,
    margin: { left: PAGE.MARGIN, right: PAGE.MARGIN },
  })
  return doc.lastAutoTable.finalY + 10
}

export async function exportClassMarkSheet({ school, className, subject, examType, term, year, students, grades, teacherName }) {
  const docId = generateDocId('MS')
  const doc = new jsPDF(ORI, 'mm', 'a4')
  let y = await header(doc, school)
  drawWatermark(doc)
  y = drawDocMeta(doc, { docId, date: fmtDateNow() }, y, { orientation: ORI })

  y = docTitle(doc, 'CLASS MARK SHEET', y + 2)
  y = docSub(doc, `${className}  |  ${subject}  |  ${examType}  |  ${term} ${year}`, y)
  if (teacherName) y = docItalic(doc, `Teacher: ${teacherName}`, y)
  y += 4

  const body = students.map((s, i) => {
    const g = grades[s.id]
    const sc = g?.total_score
    return [i + 1, s.admission_number || '\u2014', s.full_name || '\u2014',
      sc !== '' && sc != null ? String(sc) : '\u2014', g?.grade || '\u2014', g?.status || '\u2014']
  })

  y = tbl(doc, {
    head: [['#', 'Adm No.', 'Student Name', 'Marks', 'Grade', 'Status']],
    body, startY: y,
  })

  const scores = students.map(s => {
    const v = grades[s.id]?.total_score
    return (v !== '' && v != null) ? Number(v) : null
  }).filter(s => s !== null)

  const mean = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '\u2014'
  const hi = scores.length ? Math.max(...scores) : '\u2014'
  const lo = scores.length ? Math.min(...scores) : '\u2014'
  const passPct = scores.length ? ((scores.filter(s => s >= 50).length / scores.length) * 100).toFixed(0) + '%' : '\u2014'

  y = sectionHead(doc, 'Summary', y)
  y = summaryTable(doc, [
    ['Total Students', String(students.length), 'Marks Entered', String(scores.length)],
    ['Subject Mean', mean !== '\u2014' ? `${mean}%` : '\u2014', 'Highest', hi !== '\u2014' ? `${hi}%` : '\u2014'],
    ['Pass Rate', passPct, 'Lowest', lo !== '\u2014' ? `${lo}%` : '\u2014'],
  ], y)

  putFooter(doc, school, docId)
  return doc.output('blob')
}

export async function exportSubjectSummary({ school, className, subject, examType, term, year, students, grades, teacherName }) {
  const docId = generateDocId('SS')
  const doc = new jsPDF(ORI, 'mm', 'a4')
  let y = await header(doc, school)
  drawWatermark(doc)
  y = drawDocMeta(doc, { docId, date: fmtDateNow() }, y, { orientation: ORI })

  y = docTitle(doc, 'SUBJECT SUMMARY REPORT', y + 2)
  y = docSub(doc, `${className}  |  ${subject}  |  ${examType}  |  ${term} ${year}`, y)
  if (teacherName) y = docItalic(doc, `Teacher: ${teacherName}`, y)
  y += 4

  const scores = students.map(s => {
    const v = grades[s.id]?.total_score
    return (v !== '' && v != null) ? Number(v) : null
  }).filter(s => s !== null)

  const mean = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '\u2014'
  const hi = scores.length ? Math.max(...scores) : '\u2014'
  const lo = scores.length ? Math.min(...scores) : '\u2014'
  const passCount = scores.filter(s => s >= 50).length
  const passRate = scores.length ? ((passCount / scores.length) * 100).toFixed(0) + '%' : '\u2014'

  const dist = {}
  students.forEach(s => {
    const v = grades[s.id]?.total_score
    if (v === '' || v == null) return
    const band = getGrade(Number(v), className).band || '—'
    dist[band] = (dist[band] || 0) + 1
  })
  const distBands = sortBands(Object.keys(dist))

  y = sectionHead(doc, 'Performance Summary', y)
  y = summaryTable(doc, [
    ['Total Students', String(students.length), 'Marks Entered', String(scores.length)],
    ['Subject Mean', mean !== '\u2014' ? `${mean}%` : '\u2014', 'Pass Rate', passRate],
    ['Highest Score', hi !== '\u2014' ? `${hi}%` : '\u2014', 'Lowest Score', lo !== '\u2014' ? `${lo}%` : '\u2014'],
    ['Passed', String(passCount), 'Failed', String(scores.length - passCount)],
  ], y)

  y = sectionHead(doc, 'Grade Distribution', y)
  y = tbl(doc, {
    head: [['Grade', 'Count', 'Percentage']],
    body: distBands.map(g => {
      const c = dist[g] || 0
      const pct = scores.length ? ((c / scores.length) * 100).toFixed(0) + '%' : '0%'
      return [g, String(c), pct]
    }),
    startY: y,
  })

  const ranked = rankEntries(
    students
      .map(s => {
        const v = grades[s.id]?.total_score
        return { studentId: s.id, score: (v !== '' && v != null) ? Number(v) : null, name: s.full_name, adm: s.admission_number, grade: grades[s.id]?.grade || '\u2014' }
      })
      .filter(s => s.score !== null)
  )

  y = sectionHead(doc, 'Student Ranking', y)
  y = tbl(doc, {
    head: [['Rank', 'Adm No.', 'Name', 'Marks', 'Grade']],
    body: ranked.map(s => [s.rank, s.adm || '\u2014', s.name || '\u2014', String(s.score), s.grade]),
    startY: y,
    fontSize: 7,
  })

  putFooter(doc, school, docId)
  return doc.output('blob')
}

export async function exportStudentIndividualReport({ school, student, grades, term, year, subjects }) {
  const docId = generateDocId('SR')
  const doc = new jsPDF(ORI, 'mm', 'a4')
  let y = await header(doc, school)
  drawWatermark(doc)
  y = drawDocMeta(doc, { docId, date: fmtDateNow() }, y, { orientation: ORI })

  y = docTitle(doc, 'STUDENT PERFORMANCE REPORT', y + 2)
  y = docSub(doc, `${student.full_name || 'Student'}  |  ${student.admission_number || '\u2014'}  |  ${student.class || '\u2014'} ${student.stream || ''}`, y)
  y = docItalic(doc, `${term} ${year}`, y)
  y += 4

  const rows = grades.map((g, i) => {
    const subj = subjects?.find(s => s.name === g.subject)?.name || g.subject || '\u2014'
    return [i + 1, subj, g.exam_type || 'End Term', g.total_score ?? '\u2014', g.grade || '\u2014', g.remarks || '\u2014']
  })

  y = tbl(doc, {
    head: [['#', 'Subject', 'Exam', 'Score', 'Grade', 'Remarks']],
    body: rows, startY: y,
  })

  const scores = grades.map(g => Number(g.total_score)).filter(s => !isNaN(s))
  const mean = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '\u2014'
  const hi = scores.length ? Math.max(...scores) : '\u2014'
  const lo = scores.length ? Math.min(...scores) : '\u2014'

  y = sectionHead(doc, 'Overall Performance', y)
  y = summaryTable(doc, [
    ['Subjects Taken', String(grades.length), 'Average Score', mean !== '\u2014' ? `${mean}%` : '\u2014'],
    ['Highest', hi !== '\u2014' ? `${hi}%` : '\u2014', 'Lowest', lo !== '\u2014' ? `${lo}%` : '\u2014'],
  ], y)

  const overallGrade = mean !== '\u2014'
    ? gradeDisplay(getGrade(Number(mean), student.class || ''))
    : '\u2014'

  doc.setFont(F, 'italic')
  doc.setFontSize(9)
  doc.setTextColor(...MED)
  doc.text(`Overall Grade: ${overallGrade}`, PAGE.MARGIN, y)

  putFooter(doc, school, docId)
  return doc.output('blob')
}

export async function exportBulkStudentReports({ school, studentsWithGrades, term, year, subjects, onProgress }) {
  const zip = new JSZip()
  const folder = zip.folder('student_reports')

  for (let i = 0; i < studentsWithGrades.length; i++) {
    const { student, grades } = studentsWithGrades[i]
    const blob = await exportStudentIndividualReport({ school, student, grades, term, year, subjects })
    const safeName = (student.full_name || 'student').replace(/[^a-zA-Z0-9]/g, '_')
    folder.file(`report_${safeName}_${student.admission_number || i}.pdf`, blob)
    if (onProgress) onProgress(i + 1, studentsWithGrades.length)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  saveAs(zipBlob, `student_reports_${term.replace(/\s/g, '_')}_${year}.zip`)
}

export async function exportPerformanceAnalysis({ school, classStats, term, year }) {
  const docId = generateDocId('PA')
  const doc = new jsPDF(ORI, 'mm', 'a4')
  let y = await header(doc, school)
  drawWatermark(doc)
  y = drawDocMeta(doc, { docId, date: fmtDateNow() }, y, { orientation: ORI })

  y = docTitle(doc, 'PERFORMANCE ANALYSIS', y + 2)
  y = docSub(doc, `${term} ${year}`, y)
  y += 2

  for (const stat of classStats) {
    y = ensureSpace(doc, y, 80)

    doc.setFont(F, 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...BLUE)
    doc.text(`${stat.className} \u2014 ${stat.subject}`, PAGE.MARGIN, y)
    y += 6

    doc.setFont(F, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...DARK)
    doc.text(`Mean: ${stat.mean}%  |  Highest: ${stat.highest}%  |  Lowest: ${stat.lowest}%  |  Pass Rate: ${stat.passRate}%`, PAGE.MARGIN, y)
    y += 4
    doc.text(`Students: ${stat.total}  |  Entered: ${stat.entered}  |  Exam: ${stat.examType}`, PAGE.MARGIN, y)
    y += 4

    doc.setFont(F, 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...MED)
    const distStr = Object.entries(stat.distribution || {}).map(([g, c]) => `${g}: ${c}`).join('  |  ')
    doc.text(`Grade Distribution: ${distStr}`, PAGE.MARGIN, y)
    y += 8

    y = tbl(doc, {
      head: [['#', 'Adm No.', 'Name', 'Score', 'Grade']],
      body: (stat.students || []).map((s, i) => [
        i + 1, s.admission_number || '\u2014', s.name || '\u2014',
        s.score != null ? String(s.score) : '\u2014', s.grade || '\u2014',
      ]),
      startY: y,
      fontSize: 7,
    })
  }

  putFooter(doc, school, docId)
  return doc.output('blob')
}
