/**
 * Official School Document PDF Template
 * 
 * Shared utility for generating professional A4 school documents
 * with branded headers, watermarks, QR codes, and consistent styling.
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Defaults ──
export const PAGE = {
  W: 210, H: 297,
  MARGIN: 18,
  CONTENT_W: 174,
  CENTER: 105,
}

export const COLORS = {
  PRIMARY: [30, 58, 95],
  BLACK: [17, 17, 17],
  DARK: [40, 40, 40],
  MEDIUM: [100, 100, 100],
  LIGHT: [150, 150, 150],
  FAINT: [220, 220, 220],
  BG: [249, 249, 249],
  TABLE_HEADER: [30, 58, 95],
  WHITE: [255, 255, 255],
}

export const FONT = {
  SERIF: 'times',
  SANS: 'helvetica',
}

/** Resolve page dimensions for portrait or landscape */
function dims(orientation) {
  if (orientation === 'landscape') {
    return { W: 297, H: 210, M: 14, CW: 269, CX: 148.5 }
  }
  return { W: PAGE.W, H: PAGE.H, M: PAGE.MARGIN, CW: PAGE.CONTENT_W, CX: PAGE.CENTER }
}

// ── Document ID ──
export function generateDocId(prefix = 'SP') {
  const year = new Date().getFullYear()
  const seq = String(Math.floor(Math.random() * 9000) + 1000)
  const code = Array.from({ length: 3 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]).join('')
  return `${prefix}-${code}/${year}/${seq}`
}

// ── Date Formatters ──
export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function fmtDateShort(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── School Header ──
export async function drawSchoolHeader(doc, school, options = {}) {
  const {
    y: startY = PAGE.MARGIN,
    showBorder = true,
    showMotto = true,
    showContact = true,
    orientation = 'portrait',
  } = options

  const { W, M: LM, CX } = dims(orientation)
  const schoolName = school?.name || 'School Name'
  const motto = school?.motto || ''
  const address = school?.address || ''
  const phone = school?.phone || ''
  const email = school?.email || ''
  const logoUrl = school?.logo_url || ''

  let y = startY

  // Logo
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl, { cache: 'force-cache', mode: 'cors' })
      if (res.ok) {
        const blob = await res.blob()
        const dataUrl = await new Promise((resolve) => {
          const r = new FileReader()
          r.onloadend = () => resolve(r.result)
          r.readAsDataURL(blob)
        })
        const img = new Image()
        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          img.src = dataUrl
        })
        const aspect = img.naturalWidth / img.naturalHeight
        const h = 20
        let w = h * aspect
        if (w > 50) w = 50
        doc.addImage(dataUrl, 'PNG', CX - w / 2, y, w, h)
        y += h + 6
      }
    } catch {}
  }

  // School Name
  doc.setFont(FONT.SERIF, 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...COLORS.PRIMARY)
  doc.text(schoolName.toUpperCase(), CX, y, { align: 'center' })
  y += 7

  // Motto
  if (showMotto && motto) {
    doc.setFont(FONT.SERIF, 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.MEDIUM)
    doc.text(`"${motto}"`, CX, y, { align: 'center' })
    y += 5
  }

  // Contact
  if (showContact) {
    const parts = [address, phone, email].filter(Boolean)
    if (parts.length) {
      doc.setFont(FONT.SANS, 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...COLORS.MEDIUM)
      doc.text(parts.join('  |  '), CX, y, { align: 'center', maxWidth: W - LM * 2 })
      y += 4
    }
  }

  // Bottom border
  if (showBorder) {
    y += 3
    doc.setDrawColor(...COLORS.PRIMARY)
    doc.setLineWidth(0.6)
    doc.line(LM, y, W - LM, y)
    doc.setLineWidth(0.2)
    y += 6
  }

  return y
}

// ── Watermark ──
export function drawWatermark(doc, text = 'OFFICIAL DOCUMENT') {
  const prevFont = doc.getFont()
  const prevSize = doc.getFontSize()
  const prevColor = doc.getTextColor()

  doc.setFont(FONT.SERIF, 'bold')
  doc.setFontSize(48)
  doc.setTextColor(30, 58, 95, 0.04)

  doc.text(text, PAGE.W / 2, PAGE.H / 2, { align: 'center', angle: -30 })

  doc.setFont(prevFont.font, prevFont.style)
  doc.setFontSize(prevSize)
  doc.setTextColor(...prevColor)
}

// ── QR Placeholder ──
export function drawQRPlaceholder(doc, x, y, size = 18) {
  doc.setFillColor(...COLORS.BG)
  doc.setDrawColor(...COLORS.FAINT)
  doc.roundedRect(x, y, size, size, 1, 1, 'FD')
  doc.setFont(FONT.SERIF, 'normal')
  doc.setFontSize(5)
  doc.setTextColor(...COLORS.LIGHT)
  doc.text('QR', x + size / 2, y + size / 2, { align: 'center' })
  doc.setFontSize(4)
  doc.text('Scan to verify', x + size / 2, y + size + 3, { align: 'center' })
}

// ── Document Meta (Doc ID + Date + QR) ──
export function drawDocMeta(doc, { docId, date }, y, options = {}) {
  const { orientation = 'portrait' } = options
  const { W, M: LM } = dims(orientation)

  doc.setFont(FONT.SERIF, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.MEDIUM)
  doc.text(`Doc ID: ${docId}`, LM, y)
  doc.text(`Date: ${date || fmtDate(new Date())}`, LM, y + 4)

  const qrSize = 18
  drawQRPlaceholder(doc, W - LM - qrSize, y - 2, qrSize)

  return y + 10
}

// ── Section Title ──
export function drawSectionTitle(doc, title, y, options = {}) {
  const { fontSize = 12, color = COLORS.PRIMARY, orientation = 'portrait' } = options
  const { CX } = dims(orientation)
  doc.setFont(FONT.SERIF, 'bold')
  doc.setFontSize(fontSize)
  doc.setTextColor(...color)
  doc.text(title, CX, y, { align: 'center' })
  return y + 6
}

export function drawSectionSubtitle(doc, text, y, options = {}) {
  const { orientation = 'portrait' } = options
  const { CX } = dims(orientation)
  doc.setFont(FONT.SANS, 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.MEDIUM)
  doc.text(text, CX, y, { align: 'center' })
  return y + 5
}

// ── Info Table (key-value pairs) ──
export function drawInfoTable(doc, rows, y, options = {}) {
  const { labelWidth = 50, labelBg = COLORS.BG, orientation = 'portrait' } = options
  const { CW, M: LM } = dims(orientation)

  autoTable(doc, {
    startY: y,
    body: rows,
    styles: { fontSize: 9, cellPadding: 3, font: FONT.SERIF, textColor: COLORS.DARK },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: labelWidth, fillColor: labelBg, textColor: COLORS.DARK },
      1: { cellWidth: CW - labelWidth },
    },
    tableLineColor: COLORS.FAINT,
    tableLineWidth: 0.15,
    margin: { left: LM, right: LM },
    theme: 'grid',
  })

  return doc.lastAutoTable.finalY + 6
}

// ── Data Table ──
export function drawDataTable(doc, { head, body, startY, options = {} }) {
  const {
    fontSize = 8,
    headFontSize = 8,
    alternateRows = true,
    orientation = 'portrait',
  } = options
  const { M: LM } = dims(orientation)

  autoTable(doc, {
    startY,
    head,
    body,
    styles: {
      fontSize,
      cellPadding: 2.5,
      font: FONT.SERIF,
      textColor: COLORS.DARK,
      lineWidth: 0.15,
      lineColor: COLORS.FAINT,
    },
    headStyles: {
      fillColor: COLORS.TABLE_HEADER,
      textColor: COLORS.WHITE,
      fontSize: headFontSize,
      fontStyle: 'bold',
    },
    alternateRowStyles: alternateRows ? { fillColor: COLORS.BG } : {},
    margin: { left: LM, right: LM },
  })

  return doc.lastAutoTable.finalY + 6
}

// ── Signature Section ──
export function drawSignatures(doc, signers, y, options = {}) {
  const { orientation = 'portrait' } = options
  const { W, M: LM, CW } = dims(orientation)
  const count = signers.length
  if (count === 0) return y

  const sigWidth = Math.min(50, (CW - 20) / count)
  const totalWidth = count * sigWidth
  const spacing = (CW - totalWidth) / (count + 1)

  signers.forEach((signer, i) => {
    const x = LM + spacing + i * (sigWidth + spacing)

    doc.setDrawColor(...COLORS.DARK)
    doc.setLineWidth(0.3)
    doc.line(x, y, x + sigWidth, y)

    doc.setFont(FONT.SERIF, 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.PRIMARY)
    doc.text(signer.name || '—', x + sigWidth / 2, y + 5, { align: 'center' })

    if (signer.title) {
      doc.setFont(FONT.SERIF, 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...COLORS.MEDIUM)
      doc.text(signer.title, x + sigWidth / 2, y + 9, { align: 'center' })
    }
  })

  return y + 16
}

// ── Footer ──
export function drawFooter(doc, school, options = {}) {
  const { showDocId = false, docId = '', orientation = 'portrait' } = options
  const { W, M: LM, CX, H } = dims(orientation)
  const y = H - 14

  doc.setDrawColor(...COLORS.PRIMARY)
  doc.setLineWidth(0.3)
  doc.line(LM, y, W - LM, y)

  doc.setFont(FONT.SERIF, 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...COLORS.MEDIUM)

  doc.text(school?.name || 'School Name', LM, y + 4)
  doc.text(`Generated by ShulePulse ERP — ${fmtDateShort(new Date())}`, W - LM, y + 4, { align: 'right' })
  if (showDocId && docId) {
    doc.text(`Doc: ${docId}`, CX, y + 4, { align: 'center' })
  }
}

// ── Paragraph ──
export function drawParagraph(doc, text, y, options = {}) {
  const { fontSize = 9, align = 'left', style = 'normal', orientation = 'portrait' } = options
  const { M: LM, CX, CW } = dims(orientation)
  doc.setFont(FONT.SERIF, style)
  doc.setFontSize(fontSize)
  doc.setTextColor(...COLORS.DARK)
  doc.text(text, align === 'center' ? CX : LM, y, { align, maxWidth: CW })
  return y + 5
}

// ── Horizontal Rule ──
export function drawRule(doc, y, options = {}) {
  const { color = COLORS.FAINT, width = 0.3, orientation = 'portrait' } = options
  const { W, M: LM } = dims(orientation)
  doc.setDrawColor(...color)
  doc.setLineWidth(width)
  doc.line(LM, y, W - LM, y)
  return y + 4
}

// ── New Page ──
export function newPage(doc, orientation = 'portrait') {
  doc.addPage()
  return dims(orientation).M
}

// ── Ensure Space ──
export function ensureSpace(doc, y, needed, orientation = 'portrait') {
  const { H, M: LM } = dims(orientation)
  if (y + needed > H - 30) {
    doc.addPage()
    return LM
  }
  return y
}

// ── Quick Setup ──
export async function setupOfficialDoc(doc, { school, title, subtitle, docId, orientation = 'portrait', watermark = true }) {
  let y = PAGE.MARGIN
  y = await drawSchoolHeader(doc, school, { y, orientation })
  if (watermark) drawWatermark(doc)
  y = drawDocMeta(doc, { docId, date: fmtDate(new Date()) }, y, { orientation })
  y = drawSectionTitle(doc, title, y + 2, { orientation })
  if (subtitle) y = drawSectionSubtitle(doc, subtitle, y, { orientation })
  return y
}
