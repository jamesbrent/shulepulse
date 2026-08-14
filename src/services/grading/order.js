// Canonical assessment display order.
//
// Assessment columns are ALWAYS shown in chronological flow:
//   Opener → Midterm → End Term → Total → Achievement
//
// This order is explicitly defined here so the UI never derives column
// order from database insertion order, exam_type_config sort_order, or
// query return order (e.g. alphabetical sorting would place End Term first).
export const EXAM_DISPLAY_ORDER = ['Opener', 'Midterm', 'End Term']

const ORDER_MAP = new Map(EXAM_DISPLAY_ORDER.map((name, i) => [name, i]))

// Comparator for two exam-type names following the canonical display order.
// Unknown exam types sort after the known ones, alphabetically.
export function compareExamTypes(a, b) {
  const ra = ORDER_MAP.has(a) ? ORDER_MAP.get(a) : Number.MAX_SAFE_INTEGER
  const rb = ORDER_MAP.has(b) ? ORDER_MAP.get(b) : Number.MAX_SAFE_INTEGER
  if (ra !== rb) return ra - rb
  return String(a).localeCompare(String(b))
}

// Sort an array of exam-type names (or exam-type objects with a `name` field)
// into canonical display order without mutating the input.
export function sortExamTypes(examTypes) {
  const key = (t) => (typeof t === 'string' ? t : t?.name)
  return [...(examTypes || [])].sort((a, b) => compareExamTypes(key(a), key(b)))
}
