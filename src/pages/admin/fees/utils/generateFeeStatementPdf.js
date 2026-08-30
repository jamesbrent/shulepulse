import { jsPDF } from 'jspdf'
import { applyPlugin } from 'jspdf-autotable'
applyPlugin(jsPDF)
import { loadLogoBase64 } from './pdfLogoHelper'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 16
const CONTENT_W = PAGE_W - MARGIN * 2
const CENTER = PAGE_W / 2
const FONT = 'helvetica'
const ROW_H = 9
const SECTION_GAP = 8

const PRIMARY      = [37, 99, 235]    // #2563EB
const CHARCOAL     = [15, 23, 42]     // #0F172A
const LIGHT_BG     = [248, 250, 252]  // #F8FAFC
const TEXT_DARK    = [15, 23, 42]     // #0F172A
const TEXT_MUTED   = [100, 116, 139]  // #64748B
const BORDER       = [229, 231, 235]  // #E5E7EB
const WHITE        = [255, 255, 255]

function fmtKES(n) {
  const val = Number(n) || 0
  try {
    return `KES ${val.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  } catch {
    return `KES ${val.toFixed(2)}`
  }
}

function fmtDate(d) {
  if (!d) return '\u2014'
  try {
    return new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '\u2014'
  }
}

function fmtDateTimeFull(d) {
  if (!d) return '\u2014'
  try {
    return new Date(d).toLocaleDateString('en-KE', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return '\u2014'
  }
}

function safe(v) {
  return (v == null || v === '') ? '\u2014' : String(v)
}

function getLedgerRef(e) {
  const desc = e.description || ''
  if (e.entry_type === 'payment') {
    const m = desc.match(/\u2014\s*(.+)/)
    return m ? m[1].trim() : 'Payment'
  }
  if (e.entry_type === 'charge') return 'Assessment'
  if (e.entry_type === 'penalty') return 'Penalty'
  if (['discount', 'scholarship', 'waiver'].includes(e.entry_type)) return 'Discount'
  return '\u2014'
}

function drawAccentBar(doc, yTop, h, maroonWidth) {
  doc.setFillColor(...PRIMARY)
  doc.rect(0, yTop, maroonWidth, h, 'F')
  doc.setFillColor(...CHARCOAL)
  doc.rect(maroonWidth, yTop, PAGE_W - maroonWidth, h, 'F')
  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(0.3)
  doc.line(0, yTop + h, PAGE_W, yTop + h)
  doc.setLineWidth(0.2)
}

function sectionTitle(doc, text, x, y) {
  doc.setFont(FONT, 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...PRIMARY)
  doc.text(text, x, y)
  return y + 6
}

export async function generateFeeStatementPdf({ school, student, ledger, assessments, term, year, credit }) {
  const doc = new jsPDF('portrait', 'mm', 'a4')

  const schoolName  = school?.name || 'School Name'
  const schoolAddr  = school?.address || ''
  const schoolPhone = school?.phone || ''
  const schoolEmail = school?.email || ''
  const schoolMotto = school?.motto || ''

  let logo = null
  try { logo = await loadLogoBase64(school) } catch { logo = null }

  // Compute financials
  let totalCharged = 0
  let totalPaid = 0
  let totalDiscounts = 0
  let totalPenalties = 0
  ledger.forEach((e) => {
    const amt = Number(e.amount) || 0
    switch (e.entry_type) {
      case 'charge': totalCharged += amt; break
      case 'payment': totalPaid += amt; break
      case 'penalty': totalPenalties += amt; totalCharged += amt; break
      case 'discount': case 'scholarship': case 'waiver': totalDiscounts += amt; totalCharged -= amt; break
      default: break
    }
  })
  const netBalance = totalCharged - totalPaid
  const status = netBalance <= 0 ? 'Cleared' : totalPaid > 0 ? 'Partial' : 'Pending'

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. TOP ACCENT BAR
  // ═══════════════════════════════════════════════════════════════════════════
  drawAccentBar(doc, 0, 9, PAGE_W * 0.62)

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. HEADER — School Info (left) | FEE STATEMENT + Logo (right)
  // ═══════════════════════════════════════════════════════════════════════════
  let y = 16
  const leftCol = MARGIN + 2
  const rightCol = MARGIN + CONTENT_W * 0.52
  const colW = CONTENT_W * 0.46

  // ── Left: School Information ──────────────────────────────────────────────
  y = sectionTitle(doc, 'SCHOOL INFORMATION', leftCol, y)

  const schoolFields = [
    ['Name', schoolName],
    ['Address', schoolAddr],
    ['Phone', schoolPhone],
    ['Email', schoolEmail],
  ].filter(([, v]) => v)

  schoolFields.forEach(([label, val]) => {
    doc.setFont(FONT, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(label + ':', leftCol, y)
    doc.setFont(FONT, 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_DARK)
    doc.text(safe(val), leftCol + 18, y)
    y += 5
  })
  if (schoolMotto) {
    doc.setFont(FONT, 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text('"' + schoolMotto + '"', leftCol, y)
    y += 5
  }

  y += 4
  y = sectionTitle(doc, 'STUDENT INFORMATION', leftCol, y)

  const infoFields = [
    ['Student Name', student?.full_name],
    ['Admission No.', student?.admission_number],
    ['Class/Grade', [student?.class, student?.stream].filter(Boolean).join(' \u2014 ') || '\u2014'],
    ['Term/Year', `${term || '\u2014'} / ${year || ''}`],
    ['Status', status],
  ]
  infoFields.forEach(([label, val]) => {
    doc.setFont(FONT, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(label + ':', leftCol, y)
    doc.setFont(FONT, 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_DARK)
    doc.text(safe(val), leftCol + 28, y)
    y += 5
  })

  // ── Right: Banner + Logo + Statement Details ──────────────────────────────
  let ry = 16

  doc.setFillColor(...PRIMARY)
  doc.rect(rightCol, ry, colW, 14, 'F')
  doc.setFont(FONT, 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...WHITE)
  doc.text('FEE STATEMENT', rightCol + colW / 2, ry + 9.5, { align: 'center' })
  ry += 20

  // Logo
  const logoW = 33
  const logoH = 19
  const logoCX = rightCol + colW / 2
  const logoCY = ry + logoH / 2

  if (logo && logo.dataUrl) {
    try {
      doc.addImage(logo.dataUrl, 'PNG', logoCX - logoW / 2, logoCY - logoH / 2, logoW, logoH)
    } catch {
      doc.setFillColor(...PRIMARY)
      doc.rect(logoCX - logoW / 2, logoCY - logoH / 2, logoW, logoH, 'F')
      doc.setFont(FONT, 'bold')
      doc.setFontSize(12)
      doc.setTextColor(...WHITE)
      doc.text(schoolName.charAt(0).toUpperCase(), logoCX, logoCY + 4, { align: 'center' })
    }
  } else {
    doc.setFillColor(...PRIMARY)
    doc.rect(logoCX - logoW / 2, logoCY - logoH / 2, logoW, logoH, 'F')
    doc.setFont(FONT, 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...WHITE)
    doc.text(schoolName.charAt(0).toUpperCase(), logoCX, logoCY + 4, { align: 'center' })
  }

  ry += logoH + 5
  doc.setFont(FONT, 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEXT_DARK)
  doc.text(schoolName.toUpperCase(), logoCX, ry, { align: 'center' })
  if (schoolMotto) {
    ry += 4.5
    doc.setFont(FONT, 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text('"' + schoolMotto + '"', logoCX, ry, { align: 'center' })
  }

  // Statement details
  ry += 8
  ry = sectionTitle(doc, 'STATEMENT DETAILS', rightCol, ry)

  const stmtNo = `SFT-${year}-${Date.now().toString(36).toUpperCase().slice(-5)}`
  const txLabelW = 32
  const txFields = [
    ['Statement No.', stmtNo],
    ['Date Issued', fmtDate(new Date())],
    ['Period', `${term || '\u2014'} ${year || ''}`],
  ]
  txFields.forEach(([label, val]) => {
    doc.setFont(FONT, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(label + ':', rightCol, ry)
    doc.setFont(FONT, 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_DARK)
    doc.text(safe(val), rightCol + txLabelW, ry)
    ry += 5
  })

  const headerBottom = Math.max(y, ry)

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. FINANCIAL SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  let tableY = headerBottom + SECTION_GAP
  tableY = sectionTitle(doc, 'FINANCIAL SUMMARY', MARGIN, tableY)

  const assessedTotal = assessments.reduce((s, a) => s + (Number(a.amount_due) || 0), 0)
  const grossCharged = totalCharged + totalPenalties

  const summaryItems = [
    ['Total Fees Charged', fmtKES(assessedTotal || grossCharged)],
    ['Applied to Fees', fmtKES(totalPaid)],
    ['Discounts / Waivers', fmtKES(totalDiscounts)],
    ['Penalties', fmtKES(totalPenalties)],
  ]

  const sumColW = CONTENT_W / 4
  summaryItems.forEach((item, i) => {
    const cx = MARGIN + i * sumColW
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.2)
    doc.rect(cx, tableY, sumColW, ROW_H + 4, 'S')
    doc.setFont(FONT, 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(item[0], cx + sumColW / 2, tableY + 4, { align: 'center' })
    doc.setFont(FONT, 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_DARK)
    doc.text(item[1], cx + sumColW / 2, tableY + 10, { align: 'center' })
  })
  tableY += ROW_H + 8

  // Balance row
  doc.setFillColor(...PRIMARY)
  doc.rect(MARGIN, tableY, CONTENT_W, ROW_H, 'F')
  doc.setFont(FONT, 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...WHITE)
  doc.text('OUTSTANDING BALANCE', MARGIN + 4, tableY + 6)
  doc.text(fmtKES(Math.abs(netBalance)), MARGIN + CONTENT_W - 4, tableY + 6, { align: 'right' })

  // Status badge
  const badgeLabel = status.toUpperCase()
  const badgeW = doc.getTextWidth(badgeLabel) + 12
  doc.setFillColor(...WHITE)
  doc.rect(MARGIN + 52, tableY + 1.5, badgeW, 6, 'F')
  doc.setFont(FONT, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...PRIMARY)
  doc.text(badgeLabel, MARGIN + 52 + badgeW / 2, tableY + 6, { align: 'center' })

  tableY += ROW_H + 6

  // Student credit held on account (excess payments not yet applied)
  const heldCredit = Number(credit) || 0
  if (heldCredit > 0) {
    doc.setFont(FONT, 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(`STUDENT CREDIT HELD ON ACCOUNT: ${fmtKES(heldCredit)}`, MARGIN, tableY)
    tableY += 6
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. FEE LEDGER TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  tableY = sectionTitle(doc, 'FEE LEDGER', MARGIN, tableY)

  const sorted = ledger.slice().sort((a, b) => new Date(a.transaction_date || a.created_at) - new Date(b.transaction_date || b.created_at))
  let runningBalance = 0
  const ledgerRows = sorted.map((e, i) => {
    const amt = Number(e.amount) || 0
    const isDebit = ['charge', 'penalty'].includes(e.entry_type)
    const debit = isDebit ? amt : 0
    const credit = !isDebit ? amt : 0
    runningBalance += debit - credit
    const typeLabel = e.entry_type.charAt(0).toUpperCase() + e.entry_type.slice(1)
    return [
      i + 1,
      fmtDate(e.transaction_date || e.created_at),
      getLedgerRef(e),
      e.description || typeLabel,
      debit ? fmtKES(debit) : '\u2014',
      credit ? fmtKES(credit) : '\u2014',
      fmtKES(runningBalance),
    ]
  })

  if (ledgerRows.length === 0) {
    doc.setFont(FONT, 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    doc.text('No transactions recorded for this period.', MARGIN, tableY + 6)
    tableY += 12
  } else {
    doc.autoTable({
      startY: tableY,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: CONTENT_W,
      head: [['No.', 'Date', 'Reference', 'Description', 'Debit (KES)', 'Credit (KES)', 'Balance (KES)']],
      body: ledgerRows,
      theme: 'plain',
      styles: {
        font: FONT,
        fontSize: 7.5,
        textColor: [...TEXT_DARK],
        cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
        lineColor: [...BORDER],
        lineWidth: 0.3,
      },
      headStyles: {
        font: FONT,
        fontStyle: 'bold',
        fontSize: 7.5,
        textColor: [...WHITE],
        fillColor: [...PRIMARY],
        halign: 'left',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 22 },
        2: { cellWidth: 24 },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 24, halign: 'right' },
        5: { cellWidth: 24, halign: 'right' },
        6: { cellWidth: 24, halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          if (data.column.index === 4 && data.cell.raw !== '\u2014') data.cell.styles.fontStyle = 'bold'
          if (data.row.index % 2 === 0) data.cell.styles.fillColor = [...LIGHT_BG]
        }
      },
    })
    tableY = doc.lastAutoTable.finalY + 6
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. TERMS & CONDITIONS
  // ═══════════════════════════════════════════════════════════════════════════
  let authY = tableY + SECTION_GAP

  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, authY, PAGE_W - MARGIN, authY)
  doc.setLineWidth(0.2)
  authY += 6

  authY = sectionTitle(doc, 'TERMS & CONDITIONS', MARGIN, authY)
  doc.setFont(FONT, 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...TEXT_MUTED)
  const terms = [
    '1. Fees paid are strictly non-refundable.',
    '2. This statement is computer-generated and valid without a manual signature.',
    '3. Any discrepancies must be reported within 7 days of issue.',
    '4. Payment is subject to the school\'s terms of admission and fee policy.',
  ]
  terms.forEach((line) => {
    doc.text(line, MARGIN, authY)
    authY += 3.5
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. BOTTOM ACCENT BAR
  // ═══════════════════════════════════════════════════════════════════════════
  drawAccentBar(doc, PAGE_H - 9, 9, PAGE_W * 0.38)

  return doc.output('blob')
}
