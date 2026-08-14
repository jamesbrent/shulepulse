// Ranks students by total points across their graded subjects.
// Input: { [studentId]: [{ points }] } or { [studentId]: { subject: { points } } }
export function rankStudents(subjectResultsByStudent) {
  const entries = Object.entries(subjectResultsByStudent || {})
  const scored = entries
    .map(([studentId, subjects]) => {
      const perSubject = Array.isArray(subjects) ? subjects : Object.values(subjects || {})
      const points = perSubject.reduce((acc, s) => acc + (Number(s?.points) || 0), 0)
      return { studentId, points, subjectCount: perSubject.length }
    })
    .filter(e => e.subjectCount > 0)
  scored.sort((a, b) => b.points - a.points || a.studentId.localeCompare(b.studentId))
  return scored.map((e, i) => ({ ...e, rank: i + 1, total: scored.length }))
}
