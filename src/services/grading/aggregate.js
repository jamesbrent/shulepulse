// Weighted aggregation over flat grade rows.
//
// Each grade row holds one assessment (Opener / Midterm / End Term) with a
// percentage total_score. max_marks carries that assessment's weight
// (15 / 15 / 70 under the current scheme; historical rows keep their original
// 20 / 20 / 60 via backfill). Combined scores weight each assessment by its
// max_marks:  mean = Σ(score × max) / Σ(max). Rows without max_marks fall
// back to weight 100 (simple mean). This is the current-school weighting,
// NOT the KNEC national aggregation.
export function weightedScoreMean(rows) {
  let num = 0
  let den = 0
  ;(rows || []).forEach(g => {
    const p = Number(g?.total_score)
    if (!Number.isFinite(p)) return
    const w = Number(g?.max_marks) || 100
    num += p * w
    den += w
  })
  return den > 0 ? Math.round((num / den) * 10) / 10 : 0
}

// Interim aggregation: weighted mean of stored total_scores (percentages) per
// subject, weighted by each assessment's max_marks.
export function aggregateSubject(grades) {
  const rows = (grades || []).filter(g => g && Number.isFinite(Number(g.total_score)))
  if (!rows.length) return { meanScore: 0, assessments: 0, totalScore: 0, maxTotal: 0 }
  const totalScore = rows.reduce((s, g) => s + Number(g.total_score), 0)
  return {
    meanScore: weightedScoreMean(rows),
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
