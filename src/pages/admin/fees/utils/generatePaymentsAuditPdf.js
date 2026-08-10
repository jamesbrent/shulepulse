import { jsPDF } from 'jspdf'
import { applyPlugin } from 'jspdf-autotable'
applyPlugin(jsPDF)
import { loadLogoBase64, logoSizes, fmtRef } from './pdfLogoHelper'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 14
const CONTENT_W = PAGE_W - MARGIN * 2
const FONT = 'helvetica'
const CENTER = PAGE_W / 2

const BLACK = [0, 0, 0]
const DARK = [51, 51, 51]
const MEDIUM = [102, 102, 102]
const LIGHT = [180, 180, 180]
const FAINT = [230, 230, 230]
const BG = [245, 245, 245]
const WHITE = [255, 255, 255]

function fmtKES(n) {
  return `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTimeFull(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export async function generatePaymentsAuditPdf({
  school,
  payments,
  filters = {},
}) {
  const doc = new jsPDF('portrait', 'mm', 'a4')
  let y = MARGIN

  // ═══════════════════════════════════════════════════════════════════════
  // 1. SCHOOL HEADER – Centered
  // ═══════════════════════════════════════════════════════════════════════
  const schoolName = school?.name || 'School Name'
  const schoolAddr = school?.address || ''
  const schoolPhone = school?.phone || ''
  const schoolEmail = school?.email || ''

  const logo = await loadLogoBase64(school)
  if (logo) {
    const ls = logoSizes(logo)
    doc.addImage(logo.dataUrl, 'PNG', CENTER - ls.width / 2, y - 3, ls.width, ls.height)
  } else {
    doc.setDrawColor(...DARK)
    doc.setFillColor(...BG)
    doc.circle(CENTER, y + 7, 10, 'F')
    doc.setDrawColor(...DARK)
    doc.circle(CENTER, y + 7, 10, 'S')
    doc.setFont(FONT, 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...DARK)
    doc.text(schoolName.charAt(0).toUpperCase(), CENTER, y + 10, { align: 'center' })
  }

  y += 24

  doc.setFont(FONT, 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...BLACK)
  doc.text(schoolName.toUpperCase(), CENTER, y, { align: 'center' })

  y += 6
  const contactParts = [schoolAddr, schoolPhone, schoolEmail].filter(Boolean)
  if (contactParts.length) {
    doc.setFont(FONT, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MEDIUM)
    doc.text(contactParts.join('  |  '), CENTER, y, { align: 'center', maxWidth: CONTENT_W })
    y += 5
  }

  // Title
  y += 4
  doc.setFont(FONT, 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...DARK)
  doc.text('PAYMENTS AUDIT REPORT', CENTER, y, { align: 'center' })

  // Report metadata
  y += 6
  doc.setFont(FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MEDIUM)
  const reportNo = `AUD-${Date.now().toString(36).toUpperCase().slice(-5)}`
  doc.text(`Report No: ${reportNo}     Generated: ${fmtDateTimeFull(new Date())}`, CENTER, y, { align: 'center' })

  // Filter summary
  y += 5
  const filterParts = []
  if (filters.term) filterParts.push(`Term: ${filters.term}`)
  if (filters.year) filterParts.push(`Year: ${filters.year}`)
  if (filters.startDate) filterParts.push(`From: ${fmtDate(filters.startDate)}`)
  if (filters.endDate) filterParts.push(`To: ${fmtDate(filters.endDate)}`)
  if (filters.method) filterParts.push(`Method: ${filters.method}`)
  if (filters.type) filterParts.push(`Type: ${filters.type}`)
  if (filterParts.length) {
    doc.setFont(FONT, 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...MEDIUM)
    doc.text(filterParts.join('  |  '), CENTER, y, { align: 'center', maxWidth: CONTENT_W })
  }

  // Divider
  y += 8
  doc.setDrawColor(...DARK)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  doc.setLineWidth(0.2)
  y += 8

  // ═══════════════════════════════════════════════════════════════════════
  // 2. SUMMARY STRIP
  // ═══════════════════════════════════════════════════════════════════════
  const totalAmount = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const uniqueStudents = new Set(payments.map((p) => p.student_id)).size
  const uniqueMethods = new Set(payments.map((p) => p.payment_type || p.payment_method)).size

  doc.setFillColor(...BG)
  doc.rect(MARGIN, y - 4, CONTENT_W, 10, 'F')
  doc.setFont(FONT, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...BLACK)
  doc.text('SUMMARY', MARGIN + 4, y + 2)
  y += 10

  const summaryData = [
    { label: 'Total Payments', value: String(payments.length) },
    { label: 'Unique Students', value: String(uniqueStudents) },
    { label: 'Payment Methods', value: String(uniqueMethods) },
    { label: 'Total Amount', value: fmtKES(totalAmount) },
  ]

  const cardW = (CONTENT_W - 12) / 4
  summaryData.forEach((s, i) => {
    const cx = MARGIN + i * (cardW + 4)
    doc.setFillColor(...WHITE)
    doc.setDrawColor(...FAINT)
    doc.roundedRect(cx, y, cardW, 16, 2, 2, 'FD')
    doc.setFont(FONT, 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MEDIUM)
    doc.text(s.label, cx + cardW / 2, y + 5, { align: 'center' })
    doc.setFont(FONT, 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...DARK)
    doc.text(s.value, cx + cardW / 2, y + 13, { align: 'center' })
  })

  y += 22

  // ═══════════════════════════════════════════════════════════════════════
  // 3. PAYMENTS TABLE – Audit columns
  // ═══════════════════════════════════════════════════════════════════════

  if (payments.length === 0) {
    doc.setFont(FONT, 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...LIGHT)
    doc.text('No payments found matching the selected filters.', MARGIN, y + 6)
  } else {
    const sorted = payments.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    const tableRows = sorted.map((p) => [
      fmtDate(p.created_at),
      fmtRef(p.receipt_number || '—'),
      p.student_name || p.students?.full_name || '—',
      p.students?.class || '—',
      p.students?.stream || '—',
      p.payment_type || p.payment_method || '—',
      p.provider || '—',
      fmtRef(p.reference || p.mpesa_code || '—'),
      p.payment_type === 'cheque'
        ? (p.cheque_status || 'pending')
        : p.payment_type === 'adjustment'
          ? '—'
          : 'cleared',
      p.received_by_name || '—',
      p.amount ? Number(p.amount).toLocaleString('en-KE', { minimumFractionDigits: 2 }) : '0.00',
    ])

    let startY = y
    // Check if we need a new page (if not enough room for header + 3 rows)
    if (startY > PAGE_H - 40) {
      doc.addPage()
      startY = MARGIN
    }

    doc.autoTable({
      startY,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: CONTENT_W,
      head: [[
        'Date', 'Receipt #', 'Student', 'Class', 'Stream',
        'Method', 'Provider', 'Reference', 'Status', 'Received By', 'Amount (KES)',
      ]],
      body: tableRows,
      theme: 'plain',
      styles: {
        font: FONT,
        fontSize: 6.5,
        textColor: [...DARK],
        cellPadding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
        lineColor: [...FAINT],
        lineWidth: 0.3,
      },
      headStyles: {
        font: FONT,
        fontStyle: 'bold',
        fontSize: 6.5,
        textColor: [...MEDIUM],
        fillColor: [...BG],
        halign: 'left',
      },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 18 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 14 },
        4: { cellWidth: 14 },
        5: { cellWidth: 16 },
        6: { cellWidth: 18 },
        7: { cellWidth: 18 },
        8: { cellWidth: 14, halign: 'center' },
        9: { cellWidth: 20 },
        10: { cellWidth: 22, halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 10) {
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. FOOTER
  // ═══════════════════════════════════════════════════════════════════════
  const finalY = doc.lastAutoTable?.finalY || y + 12
  let fy = Math.max(finalY + 16, PAGE_H - 40)

  doc.setDrawColor(...DARK)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, fy, PAGE_W - MARGIN, fy)
  doc.setLineWidth(0.2)
  fy += 6

  doc.setFont(FONT, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...DARK)
  doc.text('Generated by ShulePulse ERP', CENTER, fy, { align: 'center' })
  fy += 4
  doc.setFont(FONT, 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...MEDIUM)
  doc.text(`This audit report was generated on ${fmtDateTimeFull(new Date())} for financial review purposes.`, CENTER, fy, { align: 'center' })

  return doc.output('blob')
}
