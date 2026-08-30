import { jsPDF } from 'jspdf'
import { loadLogoBase64, logoSizes } from './pdfLogoHelper'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 16
const CONTENT_W = PAGE_W - MARGIN * 2
const CENTER = PAGE_W / 2
const FONT = 'helvetica'

const PRIMARY      = [37, 99, 235]    // #2563EB
const CHARCOAL     = [15, 23, 42]     // #0F172A
const LIGHT_BG     = [248, 250, 252]  // #F8FAFC
const TEXT_DARK    = [15, 23, 42]     // #0F172A
const TEXT_MUTED   = [100, 116, 139]  // #64748B
const BORDER       = [229, 231, 235]  // #E5E7EB
const WHITE        = [255, 255, 255]

const ROW_H = 9
const SECTION_GAP = 8

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

function safe(v) {
  return (v == null || v === '') ? '\u2014' : String(v)
}

function capitalize(s) {
  const str = String(s || '')
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function numberToWords(num) {
  if (!num || num === 0) return 'Zero Kenya Shillings Only'
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const toWords = (n) => {
    if (n < 20) return ones[n]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + toWords(n % 100) : '')
    if (n < 1000000) return toWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + toWords(n % 1000) : '')
    return toWords(Math.floor(n / 1000000)) + ' Million' + (n % 1000000 ? ' ' + toWords(n % 1000000) : '')
  }
  const intPart = Math.floor(Math.abs(num))
  const decPart = Math.round((Math.abs(num) - intPart) * 100)
  let result = toWords(intPart) + ' Kenya Shillings'
  if (decPart > 0) result += ' and ' + toWords(decPart) + ' Cents'
  result += ' Only'
  return num < 0 ? 'Minus ' + result : result
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

function fieldRow(doc, label, value, x, y, labelW) {
  doc.setFont(FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(label + ':', x, y)
  doc.setFont(FONT, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_DARK)
  doc.text(safe(value), x + labelW, y)
  return y + 5
}

export async function generateReceiptPdf({ school, payment, student, term, year }) {
  const doc = new jsPDF('portrait', 'mm', 'a4')

  // ── Extract data ─────────────────────────────────────────────────────────
  const schoolName  = school?.name || 'School Name'
  const schoolAddr  = school?.address || ''
  const schoolPhone = school?.phone || ''
  const schoolEmail = school?.email || ''
  const schoolMotto = school?.motto || ''

  const receiptNo   = payment?.receipt_number || 'RCT-' + Date.now().toString(36).toUpperCase()
  const payDate     = payment?.transaction_date || payment?.created_at
  const amount      = Number(payment?.amount) || 0
  const applied     = payment?.applied_amount != null ? Number(payment.applied_amount) : amount
  const credit      = Number(payment?.credit_amount) || 0
  const ledgerTotal = Number(payment?.ledger_total) || amount
  const outstanding = Math.max(0, ledgerTotal - applied)
  const method      = payment?.payment_type || payment?.payment_method || 'Cash'
  const payerName   = payment?.payer_name || payment?.parent_name || payment?.received_by_name || '\u2014'

  // Build fee items — only entries with data
  const feeItems = []
  // Per-term allocation rows when the payment was split across terms / held as credit
  if (payment?.allocations && Array.isArray(payment.allocations)) {
    payment.allocations.forEach((a) => {
      const amt = Number(a.applied) || 0
      if (amt > 0) feeItems.push({ label: `${a.term} ${a.year || ''} Fees`.trim(), amount: amt })
    })
  }
  if (!feeItems.length && (payment?.fee_category || amount > 0)) {
    feeItems.push({ label: payment?.fee_category || 'School Fees', amount })
  }
  // If ledger has breakdown items, add them instead
  if (payment?.items && Array.isArray(payment.items)) {
    feeItems.length = 0
    payment.items.forEach((item) => {
      const a = Number(item.amount) || 0
      if (a > 0) feeItems.push({ label: item.label || item.fee_category || 'Fee', amount: a })
    })
  }

  let logo = null
  try { logo = await loadLogoBase64(school) } catch { logo = null }

  // ── Layout anchors ───────────────────────────────────────────────────────
  const leftCol = MARGIN + 2
  const rightCol = MARGIN + CONTENT_W * 0.52
  const colW = CONTENT_W * 0.46

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. TOP ACCENT BAR
  // ═══════════════════════════════════════════════════════════════════════════
  drawAccentBar(doc, 0, 9, PAGE_W * 0.62)

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. HEADER — Two columns of equal height
  // ═══════════════════════════════════════════════════════════════════════════
  const headerStart = 16
  let leftY = headerStart
  let rightY = headerStart

  // ── Left Column: School Info + Payer & Student ───────────────────────────
  leftY = sectionTitle(doc, 'SCHOOL INFORMATION', leftCol, leftY)

  const schoolFields = [
    ['Name', schoolName],
    ['Address', schoolAddr],
    ['Phone', schoolPhone],
    ['Email', schoolEmail],
  ].filter(([, v]) => v)

  schoolFields.forEach(([label, val]) => {
    leftY = fieldRow(doc, label, val, leftCol, leftY, 18)
  })
  if (schoolMotto) {
    doc.setFont(FONT, 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text('"' + schoolMotto + '"', leftCol, leftY)
    leftY += 5
  }

  leftY += 4
  leftY = sectionTitle(doc, 'PAYER & STUDENT DETAILS', leftCol, leftY)

  const payerFields = [
    ['Student Name', student?.full_name],
    ['Admission No.', student?.admission_number],
    ['Class/Grade', [student?.class, student?.stream].filter(Boolean).join(' \u2014 ') || '\u2014'],
    ['Payer Name', payerName],
  ]
  payerFields.forEach(([label, val]) => {
    leftY = fieldRow(doc, label, val, leftCol, leftY, 28)
  })

  // ── Right Column: Banner + Logo + Transaction Details ────────────────────
  // Banner
  doc.setFillColor(...PRIMARY)
  doc.rect(rightCol, rightY, colW, 14, 'F')
  doc.setFont(FONT, 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...WHITE)
  doc.text('FEE RECEIPT', rightCol + colW / 2, rightY + 9.5, { align: 'center' })
  rightY += 20

  // Logo — uniform 24mm square
  const logoW = 33
  const logoH = 19
  const logoCX = rightCol + colW / 2
  const logoCY = rightY + logoH / 2

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

  // School name + motto
  rightY += logoH + 5
  doc.setFont(FONT, 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEXT_DARK)
  doc.text(schoolName.toUpperCase(), logoCX, rightY, { align: 'center' })
  if (schoolMotto) {
    rightY += 4.5
    doc.setFont(FONT, 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text('"' + schoolMotto + '"', logoCX, rightY, { align: 'center' })
  }

  // Transaction Details
  rightY += 8
  rightY = sectionTitle(doc, 'TRANSACTION DETAILS', rightCol, rightY)

  const txFields = [
    ['Receipt No.', receiptNo],
    ['Date', fmtDate(payDate)],
    ['Method', capitalize(method)],
  ]
  txFields.forEach(([label, val]) => {
    rightY = fieldRow(doc, label, val, rightCol, rightY, 28)
  })

  // Align both columns to the same Y
  const headerBottom = Math.max(leftY, rightY)

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. FEE BREAKDOWN TABLE — auto-populated, no empty rows
  // ═══════════════════════════════════════════════════════════════════════════
  let tableY = headerBottom + SECTION_GAP

  tableY = sectionTitle(doc, 'FEE BREAKDOWN & TOTALS', MARGIN, tableY)

  const colNo = MARGIN
  const colDesc = MARGIN + 20
  const colAmt = MARGIN + CONTENT_W - 36
  const colAmtW = 36

  // Table header
  doc.setFillColor(...PRIMARY)
  doc.rect(MARGIN, tableY, CONTENT_W, ROW_H, 'F')
  doc.setFont(FONT, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...WHITE)
  doc.text('NO.', colNo + 6, tableY + 6)
  doc.text('FEE CATEGORY', colDesc + 4, tableY + 6)
  doc.text('AMOUNT', colAmt + colAmtW - 4, tableY + 6, { align: 'right' })
  tableY += ROW_H

  // Data rows — only items with data
  feeItems.forEach((item, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(...LIGHT_BG)
      doc.rect(MARGIN, tableY, CONTENT_W, ROW_H, 'F')
    }
    doc.setFont(FONT, 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...PRIMARY)
    doc.text(String(i + 1).padStart(2, '0'), colNo + 6, tableY + 6)

    doc.setFont(FONT, 'normal')
    doc.setTextColor(...TEXT_DARK)
    doc.text(safe(item.label), colDesc + 4, tableY + 6)

    doc.setFont(FONT, 'bold')
    doc.text(fmtKES(item.amount), colAmt + colAmtW - 4, tableY + 6, { align: 'right' })

    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.2)
    doc.line(MARGIN, tableY + ROW_H, MARGIN + CONTENT_W, tableY + ROW_H)

    tableY += ROW_H
  })

  // ── Amount in Words ───────────────────────────────────────────────────────
  tableY += 2
  doc.setFillColor(...LIGHT_BG)
  doc.rect(MARGIN, tableY, CONTENT_W, 12, 'F')
  doc.setFont(FONT, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...PRIMARY)
  doc.text('AMOUNT IN WORDS:', MARGIN + 4, tableY + 5)
  doc.setFont(FONT, 'italic')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_DARK)
  doc.text(numberToWords(amount), MARGIN + 4, tableY + 10)
  tableY += 16

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. TOTALS
  // ═══════════════════════════════════════════════════════════════════════════
  const totalsX = MARGIN + CONTENT_W * 0.55
  const totalsW = CONTENT_W * 0.45
  const totLabelW = totalsW * 0.52
  let ty = tableY

  const totals = [
    ['Total Fees', fmtKES(ledgerTotal)],
    ['Amount Received', fmtKES(amount)],
    ['Applied to Fees', fmtKES(applied)],
  ]
  if (credit > 0) totals.push(['Student Credit', fmtKES(credit)])

  totals.forEach(([label, val], i) => {
    const isLast = i === totals.length - 1
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.2)
    doc.rect(totalsX, ty, totLabelW, ROW_H, 'S')
    doc.rect(totalsX + totLabelW, ty, totalsW - totLabelW, ROW_H, 'S')
    doc.setFont(FONT, isLast ? 'bold' : 'normal')
    doc.setFontSize(9)
    const lblColor = isLast ? PRIMARY : TEXT_MUTED
    const valColor = isLast ? PRIMARY : TEXT_DARK
    doc.setTextColor(...lblColor)
    doc.text(label, totalsX + 4, ty + 5.5)
    doc.setFont(FONT, 'bold')
    doc.setTextColor(...valColor)
    doc.text(val, totalsX + totalsW - 4, ty + 5.5, { align: 'right' })
    ty += ROW_H
  })

  // Outstanding
  if (outstanding > 0) {
    doc.setFillColor(254, 226, 226)
    doc.rect(totalsX, ty, totalsW, 12, 'F')
    doc.setFont(FONT, 'bold')
    doc.setFontSize(9)
    doc.setTextColor(185, 28, 28)
    doc.text('OUTSTANDING', totalsX + 4, ty + 8)
    doc.setFontSize(11)
    doc.text(fmtKES(outstanding), totalsX + totalsW - 4, ty + 8.5, { align: 'right' })
    ty += 14
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. TERMS & CONDITIONS
  // ═══════════════════════════════════════════════════════════════════════════
  let authY = ty + SECTION_GAP

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
    '2. This receipt is computer-generated and valid without a manual signature.',
    '3. Any discrepancies must be reported within 7 days of issue.',
    '4. Payment is subject to the school\'s terms of admission and fee policy.',
  ]
  terms.forEach((line) => {
    doc.text(line, MARGIN, authY)
    authY += 3.5
  })

  // ── Signature + School Stamp — centered below terms ────────────────────────
  authY += 10

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. BOTTOM ACCENT BAR
  // ═══════════════════════════════════════════════════════════════════════════
  drawAccentBar(doc, PAGE_H - 9, 9, PAGE_W * 0.38)

  return doc.output('blob')
}
