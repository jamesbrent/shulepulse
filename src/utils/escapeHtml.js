const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '/': '&#x2F;' }
const ESC_RE = /[&<>"'/]/g

export function esc(str) {
  if (str == null) return ''
  return String(str).replace(ESC_RE, (ch) => ESC_MAP[ch])
}
