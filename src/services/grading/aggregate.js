// Interim aggregation: simple mean of stored total_scores (percentages) per
// subject — mirrors today's groupGradesBySubject behaviour exactly.
// NOTE: this is the current-school weighting, NOT the KNEC national
// aggregation. Phase 6 replaces it with the weighted assessment scheme
// (Opener 15 / Midterm 15 / End Term 70).
export function aggregateSubject(grades) {
  const rows = (grades || []).filter(g => g && Number.isFinite(Number(g.total_score)))
  if (!rows.length) return { meanScore: 0, assessments: 0, totalScore: 0, maxTotal: 0 }
  const totalScore = rows.reduce((s, g) => s + Number(g.total_score), 0)
  return {
    meanScore: Math.round((totalScore / rows.length) * 10) / 10,
    assessments: rows.length,
    totalScore,
    maxTotal: rows.length * 100,
  }
}

// Aggregate every subject for one student from flat grade rows.
export function aggregateStudentGrades(grades) {
  const bySubject = {}
  ;(grades || []).forEach(g => {
    const key = g.subject || 'Unknown'
    if (!bySubject[key]) bySubject[key] = []
    bySubject[key].push(g)
  })
  const subjects = Object.entries(bySubject).map(([name, rows]) => ({
    name,
    ...aggregateSubject(rows),
  }))
  subjects.sort((a, b) => a.name.localeCompare(b.name))
  const overallAverage = subjects.length
    ? Math.round(subjects.reduce((s, sub) => s + sub.meanScore, 0) / subjects.length)
    : 0
  return { subjects, totalSubjects: subjects.length, overallAverage }
}
