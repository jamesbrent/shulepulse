// ─────────────────────────────────────────────────────────────
// CENTRAL ACADEMIC RANKING ENGINE
//
// This module is the ONE authoritative source for a learner's
// academic position (class / grade / school) across the entire
// ShulePulse system. Every screen, report, PDF, export and portal
// that displays a learner's position must consume THIS module.
// No individual page may compute its own rank.
//
// Ranking score  : overallScore(rows) = Math.round(weightedScoreMean(rows)).
//                  This is the SAME final overall score used by the
//                  report card's Overall Total / Overall Summary, so the
//                  rank is always based on the same underlying grade rows
//                  produced by the central aggregation engine.
// Ranking scope  : default 'class'. The caller supplies the grade rows
//                  already scoped to school + academic year + term +
//                  class/stream + assessment period. 'grade' and 'school'
//                  are supported for future configurable scopes, but pages
//                  must NOT invent their own population.
// Tie handling   : standard competition ranking — learners with equal
//                  scores share the same rank and the next rank skips
//                  ahead (1, 2, 2, 4). This is the single source of truth
//                  for tie behavior.
// Eligibility    : a learner is eligible only when they have at least one
//                  graded assessment row in the scope (count > 0). Learners
//                  without results are excluded from the population and do
//                  not contribute to the total.
// ─────────────────────────────────────────────────────────────
import { weightedScoreMean } from './aggregate'

export const RANK_SCOPES = ['class', 'grade', 'school']

// Canonical overall score (%) for a learner's grade rows — the same score
// the report card uses for its overall average / overall total.
export function overallScore(rows) {
  return rows && rows.length > 0 ? Math.round(weightedScoreMean(rows)) : null
}

// Rank an array of entries [{ studentId, score, count }].
// Returns the same entries enriched with { rank, total, scope }, sorted by
// score descending. `count` is the number of graded assessment rows and is
// the eligibility criterion (also accepts `subjectCount` as an alias).
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
    .sort((a, b) => b.score - a.score || String(a.studentId).localeCompare(String(b.studentId)))

  let total = scored.length
  let rank = 0
  let prevScore = null
  return scored.map((e, i) => {
    if (prevScore === null || e.score !== prevScore) {
      rank = i + 1
      prevScore = e.score
    }
    return { ...e, rank, total, scope }
  })
}

// Look up one learner's position within a ranked list.
// Returns { rank, total } or null when the learner is not ranked.
export function findRank(ranked, studentId) {
  const found = (ranked || []).find(e => e.studentId === studentId)
  return found ? { rank: found.rank, total: found.total } : null
}

// Convenience: rank learners from flat grade rows scoped by the caller.
// Each row needs { student_id, subject, total_score, max_marks }.
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
    score: overallScore(srows),
    count: srows.filter(r => Number.isFinite(Number(r.total_score))).length,
  }))
  return rankEntries(entries, opts)
}
