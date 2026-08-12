import { jsPDF } from 'jspdf'
import { loadLogoBase64 } from '../admin/fees/utils/pdfLogoHelper'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 16
const CONTENT_W = PAGE_W - MARGIN * 2
const CENTER = PAGE_W / 2

const PRIMARY = [37, 99, 235]
const CHARCOAL = [15, 23, 42]
const LIGHT_BG = [248, 250, 252]
const TEXT_DARK = [15, 23, 42]
const TEXT_MUTED = [100, 116, 139]
const BORDER = [229, 231, 235]
const WHITE = [255, 255, 255]
const RED = [185, 28, 28]

function fmtKES(n) {
  const val = Number(n) || 0
  return `KES ${val.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d) {
  if (!d) return '\u2014'
  try { return new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return '\u2014' }
}

function safe(v) { return (v == null || v === '') ? '\u2014' : String(v) }

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

function fieldRow(doc, label, value, x, y, labelW) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(label + ':', x, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_DARK)
  doc.text(safe(value), x + labelW, y, { maxWidth: CONTENT_W - labelW - 4 })
  return y + 5
}

export async function generatePaymentVoucherPdf({ school, payment, supplier, signees, invoices, accountName }) {
  const doc = new jsPDF('portrait', 'mm', 'a4')

  const schoolName = school?.name || 'School Name'
  const payee = supplier?.name || payment?.payee_name || '\u2014'
  const payeeType = (supplier?.supplier_type || payment?.payee_type || '').replace(/_/g, ' ')
  const amount = Number(payment?.amount) || 0
  const voucherNo = String(payment?.payment_no || '').replace(/^PYMT/, 'PV')
  const method = (payment?.payment_method || 'bank').replace(/_/g, ' ')

  const invList = (invoices || []).map((i) => i.invoice_no).join(', ') || '\u2014'

  const logo = await loadLogoBase64(school).catch(() => null)

  // ── Top accent bar ───────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY)
  doc.rect(0, 0, PAGE_W * 0.62, 9, 'F')
  doc.setFillColor(...CHARCOAL)
  doc.rect(PAGE_W * 0.62, 0, PAGE_W - PAGE_W * 0.62, 9, 'F')

  // ── Header ───────────────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY)
  doc.rect(MARGIN + CONTENT_W * 0.52, 16, CONTENT_W * 0.48, 14, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...WHITE)
  doc.text('PAYMENT VOUCHER', MARGIN + CONTENT_W * 0.52 + CONTENT_W * 0.24, 25.5, { align: 'center' })

  let leftY = 22
  let rightY = 38
  const leftCol = MARGIN + 2

  if (logo && logo.dataUrl) {
    try { doc.addImage(logo.dataUrl, 'PNG', MARGIN, 24, 24, 24 * (1 / logo.aspectRatio)) } catch { /* ignore */ }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...TEXT_DARK)
  doc.text(schoolName, leftCol + 30, 28)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text([school?.address, school?.phone, school?.email].filter(Boolean).join('  ·  ') || '', leftCol + 30, 34, { maxWidth: CONTENT_W * 0.42 })

  // Voucher details (right column)
  const txFields = [
    ['Voucher No.', voucherNo],
    ['Date', fmtDate(payment?.payment_date)],
    ['Method', method.replace(/\b\w/g, (c) => c.toUpperCase())],
    ['Reference No.', payment?.reference_no],
  ]
  txFields.forEach(([l, v]) => { rightY = fieldRow(doc, l, v, MARGIN + CONTENT_W * 0.52, rightY, 26) })

  leftY = Math.max(leftY, rightY) + 6

  // ── Payee block ──────────────────────────────────────────────────────────
  doc.setFillColor(...LIGHT_BG)
  doc.rect(MARGIN, leftY, CONTENT_W, 30, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...PRIMARY)
  doc.text('PAYEE DETAILS', MARGIN + 4, leftY + 6)
  leftY = fieldRow(doc, 'Payee', payee, MARGIN + 4, leftY + 11, 20)
  leftY = fieldRow(doc, 'Payee Type', payeeType, MARGIN + 4, leftY, 20)
  leftY = fieldRow(doc, 'KRA PIN', supplier?.kra_pin, MARGIN + 4, leftY, 20)
  leftY = fieldRow(doc, 'Account', accountName, MARGIN + CONTENT_W * 0.52, leftY - 15, 20)
  leftY += 2

  // ── Amount block ─────────────────────────────────────────────────────────
  const amtY = leftY
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_DARK)
  doc.text('Amount:', MARGIN + 4, amtY + 4)
  doc.setFontSize(14)
  doc.setTextColor(...RED)
  doc.text(fmtKES(amount), MARGIN + CONTENT_W - 4, amtY + 6, { align: 'right' })

  doc.setFillColor(...LIGHT_BG)
  doc.rect(MARGIN, amtY + 10, CONTENT_W, 12, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...PRIMARY)
  doc.text('AMOUNT IN WORDS:', MARGIN + 4, amtY + 16)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_DARK)
  doc.text(numberToWords(amount), MARGIN + 4, amtY + 21, { maxWidth: CONTENT_W - 8 })

  leftY = amtY + 26

  // ── Description / invoices ───────────────────────────────────────────────
  leftY += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...PRIMARY)
  doc.text('DETAILS', MARGIN, leftY)
  leftY += 6

  doc.setFillColor(...LIGHT_BG)
  doc.rect(MARGIN, leftY, CONTENT_W, 16, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_DARK)
  doc.text(safe(payment?.description), MARGIN + 4, leftY + 6, { maxWidth: CONTENT_W - 8 })
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text('Related invoices: ' + invList, MARGIN + 4, leftY + 12)

  leftY += 20

  // ── Approval signatures ──────────────────────────────────────────────────
  leftY += 8
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, leftY, PAGE_W - MARGIN, leftY)
  leftY += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...PRIMARY)
  doc.text('APPROVAL & AUTHORISATION', MARGIN, leftY)
  leftY += 8

  const cols = [
    ['Prepared By', signees?.prepared],
    ['Checked / Reviewed By', signees?.reviewed],
    ['Approved By', signees?.approved],
    ['Paid / Processed By', signees?.paid],
  ]
  const colW = (CONTENT_W - 20) / cols.length
  cols.forEach(([label, name], i) => {
    const x = MARGIN + i * (colW + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(label, x, leftY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_DARK)
    doc.text(safe(name), x, leftY + 18, { maxWidth: colW })
    doc.setDrawColor(...BORDER)
    doc.line(x, leftY + 30, x + colW, leftY + 30)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...TEXT_MUTED)
    doc.text('Signature & date', x, leftY + 34)
  })

  // ── Footer ───────────────────────────────────────────────────────────────
  doc.setFillColor(...CHARCOAL)
  doc.rect(0, PAGE_H - 9, PAGE_W, 9, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...WHITE)
  doc.text(`Generated by ShulePulse · ${fmtDate(new Date().toISOString())}`, CENTER, PAGE_H - 3.5, { align: 'center' })

  return doc.output('blob')
}
