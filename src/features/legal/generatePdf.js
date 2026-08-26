import { jsPDF } from 'jspdf'

const MARGIN_LEFT = 20
const MARGIN_RIGHT = 20
const PAGE_WIDTH = 210
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
const FONT = 'helvetica'

function addWrappedText(doc, text, x, y, maxWidth, fontSize, fontStyle = 'normal') {
  doc.setFont(FONT, fontStyle)
  doc.setFontSize(fontSize)
  const lines = doc.splitTextToSize(text, maxWidth)
  let currentY = y
  for (const line of lines) {
    if (currentY > 270) {
      doc.addPage()
      currentY = 20
    }
    doc.text(line, x, currentY)
    currentY += fontSize * 0.45
  }
  return currentY
}

function addTable(doc, table, startY) {
  const { headers, rows } = table
  const colCount = headers.length
  const colWidths = headers.map(() => CONTENT_WIDTH / colCount)

  let y = startY

  // Header row
  doc.setFont(FONT, 'bold')
  doc.setFontSize(9)
  doc.setFillColor(240, 240, 240)
  doc.rect(MARGIN_LEFT, y - 4, CONTENT_WIDTH, 8, 'F')
  let x = MARGIN_LEFT
  for (let i = 0; i < colCount; i++) {
    doc.text(headers[i], x + 2, y)
    x += colWidths[i]
  }
  y += 8

  // Data rows
  doc.setFont(FONT, 'normal')
  doc.setFontSize(9)
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    if (y > 270) {
      doc.addPage()
      y = 20
    }
    if (r % 2 === 0) {
      doc.setFillColor(248, 248, 248)
      doc.rect(MARGIN_LEFT, y - 4, CONTENT_WIDTH, 8, 'F')
    }
    x = MARGIN_LEFT
    let maxLines = 1
    for (let c = 0; c < colCount; c++) {
      const cellLines = doc.splitTextToSize(row[c], colWidths[c] - 4)
      if (cellLines.length > maxLines) maxLines = cellLines.length
    }
    x = MARGIN_LEFT
    for (let c = 0; c < colCount; c++) {
      const cellLines = doc.splitTextToSize(row[c], colWidths[c] - 4)
      doc.text(cellLines[0] || '', x + 2, y)
      if (cellLines.length > 1) {
        for (let l = 1; l < cellLines.length; l++) {
          doc.text(cellLines[l], x + 2, y + l * 4)
        }
      }
      x += colWidths[c]
    }
    y += maxLines * 4 + 4
  }

  return y + 4
}

export function generatePdf(document) {
  const doc = new jsPDF()
  let y = 20

  // Title
  doc.setFont(FONT, 'bold')
  doc.setFontSize(18)
  doc.text(document.title, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 10

  // Subtitle
  doc.setFont(FONT, 'normal')
  doc.setFontSize(10)
  doc.setTextColor(120, 120, 120)
  doc.text(`Last updated: ${document.lastUpdated}`, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 4
  doc.text(`Operated by BIMA Graphics, Thika, Kenya`, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 4
  doc.text('DRAFT — Not reviewed by a lawyer', PAGE_WIDTH / 2, y, { align: 'center' })
  y += 12
  doc.setTextColor(0, 0, 0)

  for (const section of document.sections) {
    // Section heading
    if (y > 260) {
      doc.addPage()
      y = 20
    }
    doc.setFont(FONT, 'bold')
    doc.setFontSize(12)
    doc.text(section.heading, MARGIN_LEFT, y)
    y += 8

    // Content paragraph
    if (section.content) {
      y = addWrappedText(doc, section.content, MARGIN_LEFT, y, CONTENT_WIDTH, 10)
      y += 4
    }

    // Bullets
    if (section.bullets) {
      doc.setFont(FONT, 'normal')
      doc.setFontSize(10)
      for (const bullet of section.bullets) {
        if (y > 270) {
          doc.addPage()
          y = 20
        }
        const bulletText = `• ${bullet}`
        const lines = doc.splitTextToSize(bulletText, CONTENT_WIDTH - 6)
        doc.text(lines[0], MARGIN_LEFT + 4, y)
        if (lines.length > 1) {
          for (let l = 1; l < lines.length; l++) {
            doc.text(lines[l], MARGIN_LEFT + 8, y + l * 4.5)
          }
          y += (lines.length - 1) * 4.5
        }
        y += 5
      }
      y += 2
    }

    // Table
    if (section.table) {
      y = addTable(doc, section.table, y)
    }

    // Section footer
    if (section.footer) {
      y = addWrappedText(doc, section.footer, MARGIN_LEFT, y, CONTENT_WIDTH, 9, 'italic')
      y += 4
    }
  }

  // Final footer on every page
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont(FONT, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      `${document.title} — DRAFT — Generated ${document.lastUpdated} — Page ${i} of ${pageCount}`,
      PAGE_WIDTH / 2,
      290,
      { align: 'center' }
    )
  }

  return doc
}

export function downloadPdf(document) {
  const doc = generatePdf(document)
  doc.save(document.filename)
}
