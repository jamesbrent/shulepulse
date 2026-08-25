import DOMPurify from 'dompurify'

// Sanitize HTML to prevent XSS attacks
// Use this whenever rendering user-generated content with dangerouslySetInnerHTML
export function sanitizeHtml(html) {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'b', 'i',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'span', 'pre', 'code',
      'blockquote', 'hr',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'width', 'height',
      'class', 'id', 'style', 'colspan', 'rowspan',
      'cellpadding', 'cellspacing', 'border',
    ],
    ALLOW_DATA_ATTR: false,
  })
}

// Strict sanitization for simple text content (no HTML allowed)
export function sanitizeText(text) {
  if (!text) return ''
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] })
}

// Sanitize for use in document.write() contexts
export function sanitizeForDocumentWrite(html) {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['colspan', 'rowspan', 'style', 'class'],
  })
}
