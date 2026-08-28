import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { esc } from '../../utils/escapeHtml'

/* ── Legacy export (simple Excel/CSV by filename) ── */
export function exportAttendanceCSV(records, filename = 'attendance_export.csv') {
  const rows = records.map(r => ({
    'Student Name': r.students?.full_name || r.full_name || '',
    'Admission No': r.students?.admission_number || r.admission_number || '',
    'Class': r.students?.class || r.class || '—',
    'Status': r.status || '—',
    'Date': r.date || '—',
    'Notes': r.notes || '',
    'Marked By': r.teacher_name || '—',
    'Time': r.created_at
      ? new Date(r.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
      : '—',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
  XLSX.writeFile(wb, filename)
}

/* ── Conflict records export (CSV) ── */
export function exportConflictsCSV(conflicts, subjects = {}, teachers = {}, filename = 'attendance_conflicts.csv') {
  const rows = conflicts.map(c => ({
    'Student Name': c.student_name || '',
    'Admission No': c.admission_number || '',
    'Class': c.class_name || '—',
    'Date': c.date || '—',
    'Daily Status': c.daily_status || '—',
    'Lesson Status': c.lesson_status || '—',
    'Subject': subjects[c.subject_id] || c.subject_id || '—',
    'Lesson Time': c.period_start
      ? new Date(c.period_start).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
      : '—',
    'Teacher': teachers[c.teacher_id] || '—',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Conflicts')
  XLSX.writeFile(wb, filename)
}

/* ── Lesson attendance export (CSV) ── */
export function exportLessonAttendanceCSV(records, filename = 'lesson_attendance_export.csv') {
  const rows = records.map(r => ({
    'Student Name': r.students?.full_name || r.full_name || '',
    'Admission No': r.students?.admission_number || r.admission_number || '',
    'Class': r.class_name || r.students?.class || '',
    'Status': r.status || '—',
    'Subject': r.subjects?.name || r.subject_name || '—',
    'Date': r.period_start ? r.period_start.slice(0, 10) : '—',
    'Lesson Time': r.period_start
      ? new Date(r.period_start).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
      : '—',
    'Notes': r.notes || '',
    'Teacher': r.teachers?.full_name || r.teacher_name || '—',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Lesson Attendance')
  XLSX.writeFile(wb, filename)
}

/* ── Default Kenyan term start dates (override via termDates prop) ── */
export const DEFAULT_TERM_DATES = {
  'Term 1': { month: 0, day: 15 },    // Jan 15
  'Term 2': { month: 4, day: 1 },     // May 1
  'Term 3': { month: 8, day: 1 },     // Sep 1
}

export function getTermStartDate(term, year, termDates) {
  const cfg = (termDates || DEFAULT_TERM_DATES)[term]
  if (!cfg) return new Date(year, 0, 1)
  return new Date(year, cfg.month, cfg.day)
}

export function getWeekRange(termStart, weekNumber) {
  const start = new Date(termStart)
  start.setDate(start.getDate() + (weekNumber - 1) * 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
    label: `Week ${weekNumber} (${start.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })})`,
  }
}

export function getWeeksInTerm(termStart) {
  const weeks = []
  for (let i = 1; i <= 13; i++) {
    weeks.push(getWeekRange(termStart, i))
  }
  return weeks
}

/* ── Build query from filter object ── */
export function buildAttendanceQuery(filters) {
  let query = supabase
    .from('attendance')
    .select('*, students!inner(full_name, admission_number, class, stream)')
    .order('date', { ascending: false })

  if (filters.schoolId) query = query.eq('school_id', filters.schoolId)

  if (filters.startDate && filters.endDate) {
    query = query.gte('date', filters.startDate).lte('date', filters.endDate)
  } else if (filters.startDate) {
    query = query.gte('date', filters.startDate)
  } else if (filters.endDate) {
    query = query.lte('date', filters.endDate)
  }

  if (filters.studentId) query = query.eq('student_id', filters.studentId)
  if (filters.status) query = query.eq('status', filters.status)

  if (filters.classNames && Array.isArray(filters.classNames) && filters.classNames.length > 0) {
    query = query.in('students.class', filters.classNames)
  } else if (filters.className && filters.className !== 'all') {
    query = query.eq('students.class', filters.className)
  }
  if (filters.stream) {
    query = query.eq('students.stream', filters.stream)
  }

  if (filters.search) {
    query = query.or(
      `students.full_name.ilike.%${filters.search}%,students.admission_number.ilike.%${filters.search}%`
    )
  }

  return query
}

/* ── Compute summary from records ── */
export function computeSummary(records) {
  const total = records.length
  const present = records.filter(r => r.status === 'present').length
  const absent = records.filter(r => r.status === 'absent').length
  const late = records.filter(r => r.status === 'late').length
  const excused = records.filter(r => r.status === 'excused').length
  const rate = total > 0 ? Math.round((present / total) * 100) : 0
  return { total, present, absent, late, excused, rate }
}

/* ── Fetch export data ── */
export async function fetchExportData(filters) {
  const query = buildAttendanceQuery(filters)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

/* ── Excel export (single sheet with summary header) ── */
export function exportAttendanceExcel(records, { title = 'Attendance Report', dateLabel = '' } = {}) {
  const summary = computeSummary(records)

  const rows = records.map(r => ({
    'Student Name': r.students?.full_name || '—',
    'Admission No': r.students?.admission_number || '—',
    'Class': r.students?.class || '—',
    'Stream': r.students?.stream || '—',
    'Date': r.date || '—',
    'Status': r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : '—',
    'Notes': r.notes || '',
    'Marked By': r.teacher_name || '—',
    'Time': r.created_at
      ? new Date(r.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
      : '—',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)

  const summaryRows = [
    { 'Student Name': title, 'Admission No': dateLabel, 'Class': '', 'Stream': '', 'Date': '', 'Status': '', 'Notes': '', 'Marked By': '', 'Time': '' },
    { 'Student Name': 'Summary', 'Admission No': '', 'Class': '', 'Stream': '', 'Date': '', 'Status': '', 'Notes': '', 'Marked By': '', 'Time': '' },
    { 'Student Name': 'Total Records', 'Admission No': summary.total, 'Class': '', 'Stream': '', 'Date': '', 'Status': '', 'Notes': '', 'Marked By': '', 'Time': '' },
    { 'Student Name': 'Present', 'Admission No': summary.present, 'Class': '', 'Stream': '', 'Date': '', 'Status': '', 'Notes': '', 'Marked By': '', 'Time': '' },
    { 'Student Name': 'Absent', 'Admission No': summary.absent, 'Class': '', 'Stream': '', 'Date': '', 'Status': '', 'Notes': '', 'Marked By': '', 'Time': '' },
    { 'Student Name': 'Late', 'Admission No': summary.late, 'Class': '', 'Stream': '', 'Date': '', 'Status': '', 'Notes': '', 'Marked By': '', 'Time': '' },
    { 'Student Name': 'Excused', 'Admission No': summary.excused, 'Class': '', 'Stream': '', 'Date': '', 'Status': '', 'Notes': '', 'Marked By': '', 'Time': '' },
    { 'Student Name': 'Attendance Rate', 'Admission No': `${summary.rate}%`, 'Class': '', 'Stream': '', 'Date': '', 'Status': '', 'Notes': '', 'Marked By': '', 'Time': '' },
  ]

  XLSX.utils.sheet_add_json(ws, summaryRows, { origin: -1, skipHeader: true })
  XLSX.utils.sheet_add_json(ws, [{ 'Student Name': '', 'Admission No': '', 'Class': '', 'Stream': '', 'Date': '', 'Status': '', 'Notes': '', 'Marked By': '', 'Time': '' }], { origin: -1, skipHeader: true })

  const colWidths = [
    { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 10 },
    { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 10 },
  ]
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance')

  const safeTitle = title.replace(/[^a-zA-Z0-9_\- ]/g, '')
  XLSX.writeFile(wb, `${safeTitle.replace(/\s+/g, '_')}_${dateLabel.replace(/[^a-zA-Z0-9]/g, '_') || 'export'}.xlsx`)
}

/* ── Monthly Excel export (student-day matrix) ── */
export function exportMonthlyAttendanceExcel(records, { title = 'Attendance Report', year, month } = {}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1)
    return d.toISOString().split('T')[0]
  })

  const dayHeaders = dates.map((_, i) => String(i + 1))

  const studentMap = {}
  records.forEach(r => {
    const sid = r.student_id
    if (!studentMap[sid]) {
      studentMap[sid] = {
        name: r.students?.full_name || '—',
        adm: r.students?.admission_number || '—',
        cls: r.students?.class || '—',
        strm: r.students?.stream || '—',
        byDate: {},
      }
    }
    studentMap[sid].byDate[r.date] = r.status
  })

  const dataRows = Object.values(studentMap).map(s => {
    let present = 0
    let marked = 0
    const dayCells = dates.map(d => {
      const status = s.byDate[d]
      if (status === 'present') present++
      if (status) marked++
      return !status ? '' : status === 'present' ? 'P' : status === 'absent' ? 'A' : status === 'late' ? 'L' : status === 'excused' ? 'E' : status.charAt(0).toUpperCase()
    })
    const pct = marked > 0 ? Math.round((present / marked) * 100) + '%' : '—'
    return [s.name, s.adm, s.cls, s.strm, ...dayCells, pct]
  })

  const ws = XLSX.utils.aoa_to_sheet([['Student Name', 'Adm No', 'Class', 'Stream', ...dayHeaders, 'Present %'], ...dataRows])

  ws['!cols'] = [
    { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 10 },
    ...Array(daysInMonth).fill({ wch: 5 }),
    { wch: 10 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Monthly Attendance')

  const safeTitle = title.replace(/[^a-zA-Z0-9_\- ]/g, '')
  const monthStr = String(month + 1).padStart(2, '0')
  XLSX.writeFile(wb, `${safeTitle.replace(/\s+/g, '_')}_${year}_${monthStr}.xlsx`)
}

/* ── PDF export (printable report with summary) ── */
export async function exportAttendancePDF(records, { school, title = 'Attendance Report', dateLabel = '', termInfo = '', isMonthly, year, month } = {}) {
  let schoolData = school
  if (!schoolData) {
    const { data: session } = await supabase.auth.getSession()
    if (session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('schools(name, logo_url)')
        .eq('id', session.user.id)
        .single()
      schoolData = profile?.schools
    }
  }

  const schoolName = schoolData?.name || 'School'
  const logoUrl = schoolData?.logo_url || ''
  const summary = computeSummary(records)

  let tableHead, tableBody

  if (isMonthly) {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const dates = Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1)
      return d.toISOString().split('T')[0]
    })

    const studentMap = {}
    records.forEach(r => {
      const sid = r.student_id
      if (!studentMap[sid]) {
        studentMap[sid] = { name: r.students?.full_name || '—', adm: r.students?.admission_number || '—', byDate: {} }
      }
      studentMap[sid].byDate[r.date] = r.status
    })

    const dayTh = dates.map((_, i) => `<th style="text-align:center;font-size:7px;padding:1px 2px;min-width:16px">${i + 1}</th>`).join('')
    tableHead = `<tr><th style="font-size:8px">Student Name</th><th style="font-size:8px">Adm No.</th>${dayTh}<th style="font-size:8px">Present %</th></tr>`

    tableBody = Object.values(studentMap).map(s => {
      let present = 0, marked = 0
      let cells = ''
      dates.forEach(d => {
        const status = s.byDate[d]
        const code = !status ? '' : status === 'present' ? 'P' : status === 'absent' ? 'A' : status === 'late' ? 'L' : status === 'excused' ? 'E' : ''
        if (status === 'present') present++
        if (status) marked++
        const cls = status ? `status-${status}` : ''
        cells += `<td class="${cls}" style="text-align:center;font-size:7px;padding:1px 2px">${code}</td>`
      })
      const pct = marked > 0 ? Math.round((present / marked) * 100) + '%' : '—'
      return `<tr><td style="font-size:8px">${esc(s.name)}</td><td style="font-size:8px">${esc(s.adm)}</td>${cells}<td style="text-align:center;font-size:8px">${pct}</td></tr>`
    }).join('')
  } else {
    tableHead = `<tr>
      <th>#</th>
      <th>Student Name</th>
      <th>Adm No.</th>
      <th>Class</th>
      <th>Date</th>
      <th>Status</th>
      <th>Notes</th>
      <th>Marked By</th>
    </tr>`

    tableBody = records.map((r, i) => {
      const statusClass = r.status || ''
      const statusLabel = r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : '—'
      return `<tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${esc(r.students?.full_name) || '—'}</td>
        <td>${esc(r.students?.admission_number) || '—'}</td>
        <td>${esc(r.students?.class) || '—'}${r.students?.stream ? ` ${esc(r.students.stream)}` : ''}</td>
        <td>${esc(r.date) || '—'}</td>
        <td class="status-${esc(statusClass)}">${esc(statusLabel)}</td>
        <td>${esc(r.notes) || '—'}</td>
        <td>${esc(r.teacher_name) || '—'}</td>
      </tr>`
    }).join('')
  }

  const html = `
    <html>
      <head>
        <title>${title}</title>
        <style>
          @page { size: A4 landscape; margin: 5mm; }
          * { box-sizing: border-box; font-family: Arial, sans-serif; }
          body { margin: 0; padding: 6px; }
          .header { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 4px; }
          .header img { max-height: 46px; width: auto; }
          .header h1 { margin: 0; font-size: 18px; }
          .sub-title { text-align: center; font-size: 13px; font-weight: 700; text-transform: uppercase; text-decoration: underline; margin-bottom: 2px; }
          .date-line { text-align: center; font-size: 11px; color: #555; margin-bottom: 10px; }
          .summary-grid { display: flex; gap: 12px; justify-content: center; margin-bottom: 10px; flex-wrap: wrap; }
          .summary-item { padding: 4px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 11px; text-align: center; }
          .summary-item .num { font-weight: 700; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; border: 2px solid #111; font-size: 10px; }
          th { border: 1px solid #111; padding: 5px 6px; font-weight: 700; text-align: left; background: #f1f1f1; text-transform: uppercase; }
          td { border: 1px solid #111; padding: 4px 6px; }
          .status-present { font-weight: 700; color: #16a34a; }
          .status-absent { font-weight: 700; color: #dc2626; }
          .status-late { font-weight: 700; color: #ca8a04; }
          .status-excused { font-weight: 700; color: #2563eb; }
          .footer { text-align: center; font-size: 9px; color: #999; margin-top: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoUrl ? `<img src="${esc(logoUrl)}" alt="Logo" />` : ''}
          <h1>${esc(schoolName)}</h1>
        </div>
        <div class="sub-title">${esc(title)}</div>
        <div class="date-line">${esc(dateLabel)}${termInfo ? ` &mdash; ${esc(termInfo)}` : ''}</div>

        <div class="summary-grid">
          <div class="summary-item">Total <div class="num">${summary.total}</div></div>
          <div class="summary-item" style="background:#dcfce7">Present <div class="num" style="color:#16a34a">${summary.present}</div></div>
          <div class="summary-item" style="background:#fee2e2">Absent <div class="num" style="color:#dc2626">${summary.absent}</div></div>
          <div class="summary-item" style="background:#fef9c3">Late <div class="num" style="color:#ca8a04">${summary.late}</div></div>
          <div class="summary-item" style="background:#dbeafe">Excused <div class="num" style="color:#2563eb">${summary.excused}</div></div>
          <div class="summary-item">Rate <div class="num">${summary.rate}%</div></div>
        </div>

        <table>
          <thead>
            ${tableHead}
          </thead>
          <tbody>
            ${tableBody}
          </tbody>
        </table>
        <div class="footer">Generated on ${new Date().toLocaleDateString('en-KE')} &bull; ${records.length} record${records.length === 1 ? '' : 's'}</div>
      </body>
    </html>
  `

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.onload = () => { win.focus(); win.print(); win.close() }
}

/* ── WhatsApp share ── */
export async function exportAttendanceWhatsApp(records, options = {}) {
  const { title = 'Attendance Report', school } = options
  const summary = computeSummary(records)

  const lines = records.slice(0, 15).map((r, i) =>
    `${i + 1}. ${r.students?.full_name || '—'} (${r.students?.admission_number || '—'}) — ${r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : '—'}`
  )

  const text = [
    `*${title}*`,
    school?.name ? `School: ${school.name}` : '',
    `Period: ${options.dateLabel || ''}`,
    '',
    `Summary: ${summary.total} records | Present: ${summary.present} | Absent: ${summary.absent} | Late: ${summary.late} | Excused: ${summary.excused} | Rate: ${summary.rate}%`,
    '',
    '--- Records ---',
    ...lines,
    records.length > 15 ? `...and ${records.length - 15} more` : '',
    '',
    `Generated: ${new Date().toLocaleDateString('en-KE')}`,
  ].filter(Boolean).join('\n')

  const encoded = encodeURIComponent(text)
  window.open(`https://wa.me/?text=${encoded}`, '_blank')
}
