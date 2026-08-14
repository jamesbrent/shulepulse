export function normalizeClassName(className = '') {
  return String(className || '').trim().replace(/\s+/g, ' ')
}

export function isValidScore(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && n <= 100
}

export function validateGradeRow(row) {
  const errors = []
  if (!row || typeof row !== 'object') return { valid: false, errors: ['Invalid grade row'] }
  if (!row.student_id) errors.push('student_id is required')
  if (!row.subject) errors.push('subject is required')
  if (!row.exam_type) errors.push('exam_type is required')
  if (!row.term) errors.push('term is required')
  if (!row.year) errors.push('year is required')
  if (row.total_score !== undefined && row.total_score !== null && !isValidScore(row.total_score)) {
    errors.push(`total_score out of range: ${row.total_score}`)
  }
  return { valid: errors.length === 0, errors }
}
