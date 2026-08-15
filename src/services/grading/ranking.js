// ─────────────────────────────────────────────────────────────
// CENTRAL ACADEMIC RANKING ENGINE
//
// This module is the ONE authoritative source for a learner's
// academic position (class / grade / school) across the entire
// ShulePulse system. Every screen, report, PDF, export and portal
// that displays a learner's position must consume THIS module.
// No individual page may compute its own rank.
//
// Ranking score  : precisionScore(rows) — the UNROUNDED weighted
//                  mean (Σ score×max / Σ max) of the learner's grade
//                  rows. Integer-rounded means are NOT used so that
//                  near-equal results (79.45 vs 79.51) never collapse
//                  into an artificial tie. The displayed overall
//                  average (overallScore = Math.round(...)) remains the
//                  same number the report card shows.
// Ranking scope  : default 'class'. The caller supplies the grade rows
//                  already scoped to school + academic year + term +
//                  class/stream + assessment period. 'grade' and 'school'
//                  are supported for future configurable scopes, but pages
//                  must NOT invent their own population.
// Positions      : UNIQUE — every eligible learner gets a distinct
//                  1, 2, 3… rank. No two learners ever share a position.
//                  Sort is score descending; exact score ties are broken
//                  deterministically by (1) more graded assessment rows
//                  first, then (2) admission number, falling back to
//                  student id when admission is not available.
// Eligibility    : a learner is eligible only when they have at least one
//                  graded assessment row in the scope (count > 0). Learners
//                  without results are excluded from the population and do
//                  not contribute to the total.
// ─────────────────────────────────────────────────────────────
import { weightedScoreMean } from './aggregate'

export const RANK_SCOPES = ['class', 'grade', 'school']

// Display overall score (%) for a learner's grade rows — the same score
// the report card uses for its overall average / overall total. Rounded to
// an integer for display; ranking itself must use precisionScore().
export function overallScore(rows) {
  return rows && rows.length > 0 ? Math.round(weightedScoreMean(rows)) : null
}

// Full-precision weighted mean (NO rounding) — the authoritative ranking
// score. Keeps near-equal results apart so positions never artificially tie.
export function precisionScore(rows) {
  let num = 0
  let den = 0
  ;(rows || []).forEach(g => {
    const p = Number(g?.total_score)
    if (!Number.isFinite(p)) return
    const w = Number(g?.max_marks) || 100
    num += p * w
    den += w
  })
  return den > 0 ? num / den : null
}

// Rank an array of entries [{ studentId, score, count, admission? }].
// Returns the same entries enriched with { rank, total, scope }, sorted by
// score descending. `count` is the number of graded assessment rows and is
// the eligibility criterion (also accepts `subjectCount` as an alias).
// Every eligible entry receives a UNIQUE rank (1, 2, 3…). Exact score ties
// are broken by higher count first, then admission number (fallback studentId).
export function rankEntries(entries, opts = {}) {
  const scope = RANK_SCOPES.includes(opts.scope) ? opts.scope : 'class'
  const scored = (entries || [])
    .filter(e => e && e.studentId != null)
    .map(e => {
      const score = Number(e.score)
      const count = Number(e.count ?? e.subjectCount ?? 0)
      return { ...e, score, count }
    })
    .filter(e => Number.isFinite(e.score) && e.count > 0)
    .sort((a, b) =>
      b.score - a.score ||
      (b.count - a.count) ||
      String(a.admission ?? a.adm ?? a.studentId).localeCompare(String(b.admission ?? b.adm ?? b.studentId))
    )

  const total = scored.length
  return scored.map((e, i) => ({ ...e, rank: i + 1, total, scope }))
}

// Look up one learner's position within a ranked list.
// Returns { rank, total } or null when the learner is not ranked.
export function findRank(ranked, studentId) {
  const found = (ranked || []).find(e => e.studentId === studentId)
  return found ? { rank: found.rank, total: found.total } : null
}

// Convenience: rank learners from flat grade rows scoped by the caller.
// Each row needs { student_id, subject, total_score, max_marks } and may
// carry admission_number (directly or via students.admission_number) for
// deterministic tie-breaking.
export function rankStudentsByGrades(rows, opts = {}) {
  const byStudent = {}
  ;(rows || []).forEach(r => {
    const sid = r.student_id
    if (sid == null) return
    if (!byStudent[sid]) byStudent[sid] = []
    byStudent[sid].push(r)
  })
  const entries = Object.entries(byStudent).map(([sid, srows]) => ({
    studentId: sid,
    score: precisionScore(srows),
    count: srows.filter(r => Number.isFinite(Number(r.total_score))).length,
    admission: srows.map(r => r.admission_number || r.students?.admission_number || r.adm).find(Boolean),
  }))
  return rankEntries(entries, opts)
}
