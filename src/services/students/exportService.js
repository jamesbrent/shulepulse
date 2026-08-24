import { supabase } from '../../lib/supabase'
import { esc } from '../../utils/escapeHtml'
import * as XLSX from 'xlsx'

function collectFields(students) {
  return students.map(s => ({
    'Admission No': s.admission_number,
    'Full Name': s.full_name,
    'Class': s.class,
    'Stream': s.stream,
    'Gender': s.gender,
    'Date of Birth': s.date_of_birth,
    'Religion': s.religion,
    'Nationality': s.nationality,
    'Blood Group': s.blood_group,
    'Allergies': s.allergies,
    'Medical Conditions': s.medical_conditions,
    'Special Needs': s.special_needs,
    'Day/Boarding': s.day_boarding,
    'Status': s.status,
    'Date Admitted': s.date_admitted,
    'Parent Name': s.parent_name,
    'Parent Phone': s.parent_phone,
    'Parent Email': s.parent_email,
    'Previous School': s.previous_school,
  }))
}

export async function exportToExcel(schoolId, filters = {}) {
  const { data } = await supabase
    .from('students')
    .select('*')
    .eq('school_id', schoolId)
    .order('full_name')

  if (!data) return

  let filtered = [...data]
  if (filters.class) filtered = filtered.filter(s => s.class === filters.class)
  if (filters.stream) filtered = filtered.filter(s => s.stream === filters.stream)
  if (filters.gender) filtered = filtered.filter(s => s.gender === filters.gender)
  if (filters.status) filtered = filtered.filter(s => s.status === filters.status)

  const rows = collectFields(filtered)
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Students')
  XLSX.writeFile(wb, `students_export_${Date.now()}.xlsx`)
}

export function exportToCSV(students, filename = 'students_export.csv') {
  const rows = collectFields(students)
  const ws = XLSX.utils.json_to_sheet(rows)
  const csv = XLSX.utils.sheet_to_csv(ws)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportToPDF(students, { title = 'Student List', school, filters } = {}) {
  const rows = collectFields(students)
  const schoolName = school?.name || ''
  const logoUrl = school?.logo_url || ''

  const filterParts = []
  if (filters?.class) filterParts.push(`Class: ${filters.class}`)
  if (filters?.stream) filterParts.push(`Stream: ${filters.stream}`)
  const filterLabel = filterParts.length ? ` — ${filterParts.join(', ')}` : ''

  let html = `
    <html><head><title>${title}${filterLabel}</title>
    <style>
      @page { size: A4 landscape; margin: 8mm; }
      * { box-sizing: border-box; font-family: Arial, sans-serif; }
      .pdf-header { display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom:10px; }
      .pdf-header img { max-height:48px; width:auto; display:block; }
      .pdf-header h2 { margin:0; font-size:18px; }
      .pdf-sub { text-align:center; font-size:12px; color:#555; margin-bottom:14px; }
      table { width:100%; border-collapse:collapse; border:2px solid #111; }
      th, td { border:1px solid #111; padding:4px 6px; font-size:10px; text-align:left; }
      th { background:#f1f1f1; font-weight:700; }
      .footer { text-align:center; font-size:10px; color:#999; margin-top:12px; }
    </style></head><body>
    <div class="pdf-header">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="logo" />` : ''}
      <h2>${esc(schoolName)}</h2>
    </div>
    <div class="pdf-sub">${esc(title)}${esc(filterLabel)}</div>
    <table><thead><tr>
      <th>No.</th>${Object.keys(rows[0] || {}).map(k => `<th>${esc(k)}</th>`).join('')}
    </tr></thead><tbody>
      ${rows.map((r, i) => `<tr><td style="text-align:center">${i + 1}</td>${Object.values(r).map(v => `<td>${esc(v) || '—'}</td>`).join('')}</tr>`).join('')}
    </tbody></table>
    <div class="footer">Generated on ${new Date().toLocaleDateString()} | ${rows.length} student${rows.length === 1 ? '' : 's'}</div>
    </body></html>
  `
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.onload = () => { win.focus(); win.print(); win.close() }
}
