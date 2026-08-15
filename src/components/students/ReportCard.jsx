import { useRef } from 'react'
import { Printer, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getGrade as engineGetGrade, resolveSystem, gradeDisplay as engineGradeDisplay, sortExamTypes, compareExamTypes, overallScore } from '../../services/grading'

// ── Fetch student comments from database ──────────────────────
export async function fetchStudentComments(schoolId, studentId, term, year) {
  const { data } = await supabase
    .from('teacher_comments')
    .select('comment')
    .eq('school_id', schoolId)
    .eq('student_id', studentId)
    .eq('term', term)
    .eq('year', year)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data?.comment || ''
}

// ── CBE Grading Engine ───────────────────────────────────────
// Delegates to the central grading engine (src/services/grading).
// getCBELevel returns a layout/system string ('early'|'middle'|'senior');
// unknown classes resolve to 'middle' for LAYOUT only — actual grading is
// handled by getCBEGrade, which never grades unknown classes.
export const getCBELevel = (className = '') => {
  const sys = resolveSystem(className)
  return sys === 'unresolved' ? 'middle' : sys
}

export const getCBEGrade = (score, className) => engineGetGrade(score, className)

export const gradeDisplay = engineGradeDisplay

// ── Data Grouping: Assessments → Subjects ────────────────────
// Groups flat grade rows by subject, then by exam_type.
// Each subject appears once with its assessments as columns.
export function groupGradesBySubject(grades) {
  const bySubject = {}
  grades.forEach(g => {
    const key = g.subject || 'Unknown'
    if (!bySubject[key]) bySubject[key] = []
    bySubject[key].push(g)
  })

  const allExamTypes = new Set()
  const subjects = Object.entries(bySubject).map(([name, rows]) => {
    const byExam = {}
    rows.forEach(r => {
      const examKey = r.exam_type || r.type || 'Assessment'
      if (!byExam[examKey]) byExam[examKey] = []
      byExam[examKey].push(r)
    })
    Object.keys(byExam).forEach(k => allExamTypes.add(k))

    const assessments = Object.entries(byExam).map(([examName, examRows]) => {
      const g = examRows[0]
      const score = g.total_score || 0
      const sba = g.sba_score ?? g.cat_score ?? 0
      const summ = g.summative_score ?? g.exam_score ?? 0
      const maxMarksRaw = Number(g.max_marks) || 100
      const storedRaw = g.exam_type === 'End Term' ? g.exam_score : g.cat_score
      const rawMarks = storedRaw != null && Number(storedRaw) > 0
        ? Number(storedRaw)
        : Math.round((Number(g.total_score) / 100) * maxMarksRaw)
      const maxMarks = 100
      const weight = maxMarksRaw
      return {
        name: examName,
        score,
        maxMarks,
        weight,
        rawMarks,
        maxMarksRaw,
        sba,
        summ,
        marks: g.total_score || 0,
        maxObtainable: maxMarks,
        teacher: g.teacher_name || '',
        raw: g,
      }
    })

    assessments.sort((a, b) => compareExamTypes(a.name, b.name))

    const weightedSum = assessments.reduce((s, a) => s + a.score * a.weight, 0)
    const totalWeight = assessments.reduce((s, a) => s + a.weight, 0)
    const totalScore = assessments.reduce((s, a) => s + a.score, 0)
    const totalMax = assessments.reduce((s, a) => s + a.maxMarks, 0)
    const average = totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 10) / 10
      : 0
    const teacher = assessments.find(a => a.teacher)?.teacher || rows[0]?.teacher_name || ''

    return {
      name,
      assessments,
      totalScore,
      maxTotal: totalMax,
      average,
      teacher,
    }
  })

  subjects.sort((a, b) => a.name.localeCompare(b.name))
  const examTypes = sortExamTypes([...allExamTypes])

  // Overall Total = total marks obtained across all assessed learning areas
  // OUT OF the total possible marks. Each subject's Total is out of 100, so the
  // overall total is Σ subject totals / (subjects × 100), e.g. 878 / 1,100.
  const totalMarks = subjects.reduce((s, sub) => s + sub.average, 0)
  const totalMax = subjects.length * 100
  const overallAvg = overallScore(grades) ?? 0

  return {
    subjects,
    examTypes,
    totalMarks,
    totalMax,
    overallAverage: overallAvg,
    totalSubjects: subjects.length,
  }
}

// ── Shared Report Card Styles ────────────────────────────────
export const REPORT_CARD_STYLES = `
    .rc-wrap, .rc-wrap * { box-sizing: border-box; margin: 0; padding: 0; }
    .rc-wrap {
      font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
      font-size: 10px;
      color: #1a1a1a;
      background: #fff;
      line-height: 1.5;
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
      padding: 16px 20px;
    }
    .rc-top { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
    .rc-logo-box {
      width: 60px; height: 60px; border-radius: 50%; border: 2px solid #cbd5e1;
      overflow: hidden; flex-shrink: 0; display: flex; align-items: center;
      justify-content: center; background: #f1f5f9;
    }
    .rc-logo-box img { width: 100%; height: 100%; object-fit: cover; }
    .rc-logo-placeholder { font-size: 10px; font-weight: 900; color: #64748b; text-align: center; }
    .rc-school-block { flex: 1; text-align: center; }
    .rc-transcript-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px; }
    .rc-school-name { font-size: 20px; font-weight: 900; color: #0f172a; margin-bottom: 4px; letter-spacing: -0.3px; }
    .rc-school-contact { font-size: 10px; color: #475569; margin-bottom: 6px; }
    .rc-student-name-big { font-size: 15px; font-weight: 800; color: #0f172a; margin: 8px 0 3px; }
    .rc-student-meta { font-size: 11px; color: #475569; }
    .rc-photo-box {
      width: 58px; height: 70px; border: 1px solid #cbd5e1; background: #f8fafc;
      flex-shrink: 0; display: flex; align-items: center; justify-content: center;
      font-size: 9px; color: #94a3b8; text-align: center; border-radius: 4px;
    }
    .rc-photo-box img { width: 100%; height: 100%; object-fit: cover; border-radius: 3px; }
    .rc-hr { border: none; border-top: 2px solid #1e293b; margin: 10px 0; }
    .rc-hr-light { border: none; border-top: 1px solid #e2e8f0; margin: 10px 0; }

    .rc-section-title { font-size: 11px; font-weight: 800; color: #0f172a; margin: 10px 0 6px; text-transform: uppercase; letter-spacing: 0.5px; }

    table.gtbl { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 6px; }
    table.gtbl th {
      background: #1e293b; border: 1px solid #94a3b8; padding: 5px 6px;
      text-align: center; font-weight: 700; font-size: 9px; color: #fff;
    }
    table.gtbl th.left { text-align: left; }
    table.gtbl td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: center; color: #1e293b; font-size: 10px; }
    table.gtbl td.left { text-align: left; }
    table.gtbl tbody tr:nth-child(even) td { background: #f8fafc; }
    table.gtbl tbody tr.gtbl-total td { background: #f1f5f9; border-top: 2px solid #cbd5e1; font-weight: 800; color: #0f172a; }
    table.gtbl td.rc-total-na { color: #94a3b8; font-weight: 400; }
    .band-chip { font-weight: 700; }
    .chip-ee { color: #166534; }
    .chip-me { color: #1e40af; }
    .chip-ae { color: #92400e; }
    .chip-be { color: #991b1b; }
    .rc-pts { font-size: 8.5px; color: #64748b; font-weight: 600; }
    .rc-label { font-size: 8.5px; color: #475569; }

    .rc-comments {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0;
      margin: 8px 0; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden;
    }
    .rc-comment-cell { padding: 8px 10px; border-right: 1px solid #cbd5e1; }
    .rc-comment-cell:last-child { border-right: none; }
    .rc-comment-label {
      font-size: 10px; font-weight: 700; text-align: center;
      border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 5px; color: #1e293b;
    }
    .rc-comment-text { font-size: 10px; color: #334155; min-height: 28px; line-height: 1.6; }
    .rc-sig-line { border-bottom: 1px solid #94a3b8; height: 20px; display: block; width: 100%; }

    .rc-trend-table { width: 100%; border-collapse: collapse; font-size: 9px; margin: 8px 0; }
    .rc-trend-table th {
      background: #1e293b; color: #fff; padding: 5px 6px; border: 1px solid #94a3b8;
      font-size: 9px; font-weight: 700; text-align: center;
    }
    .rc-trend-table th.left { text-align: left; }
    .rc-trend-table td { padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center; }
    .rc-trend-table td.left { text-align: left; font-weight: 500; }
    .rc-trend-table tbody tr:nth-child(even) td { background: #f8fafc; }
    .rc-trend-avg { font-weight: 700; }

    table.htbl { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 10px; }
    table.htbl th {
      border: 1px solid #94a3b8; padding: 5px 8px; background: #f1f5f9;
      font-weight: 700; font-size: 10px; text-align: center; color: #1e293b;
    }
    table.htbl td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: center; color: #475569; font-size: 10px; }
    table.htbl td.row-label { text-align: left; font-weight: 600; color: #1e293b; background: #f8fafc; }

    .rc-legend { margin: 10px 0; padding: 8px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; }
    .rc-legend-title { font-size: 10px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
    .rc-legend-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; font-size: 9px; color: #475569; }
    .rc-legend-item { display: flex; gap: 4px; }
    .rc-legend-band { font-weight: 700; min-width: 28px; }

    .rc-foot-quote {
      text-align: center; font-size: 9px; font-style: italic; color: #64748b;
      margin-top: 12px; border-top: 1px solid #cbd5e1; padding-top: 8px;
    }

    .rc-chart-wrap {
      width: 100%; margin: 8px 0; overflow-x: auto;
    }
    .rc-chart-wrap svg { width: 100%; height: auto; }
  `

// ── Shared Helpers ────────────────────────────────────────────
const chipClass = (band = '') => {
  const b = (band || '').toLowerCase()
  if (b.startsWith('ee') || b === 'a' || b === 'a-') return 'chip-ee'
  if (b.startsWith('me') || b.startsWith('b')) return 'chip-me'
  if (b.startsWith('ae') || b.startsWith('c')) return 'chip-ae'
  return 'chip-be'
}

const CHART_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c',
  '#0891b2', '#ca8a04', '#e11d48', '#7c3aed', '#059669',
]

function buildSummaryCardsHtml(totalMarks, totalMax, overallAvg, totalSubjects, className, rankInfo) {
  const grade = getCBEGrade(overallAvg, className)
  const resolved = grade.status !== 'unresolved' && grade.status !== 'pending'
  const bandDisplay = resolved && grade.band ? grade.band : '—'
  const pts = resolved && grade.points != null ? `${grade.points} pts` : ''
  const label = resolved ? grade.label : ''
  const rankText = rankInfo ? `${rankInfo.rank} / ${rankInfo.total}` : '— / —'
  const chipCls = bandDisplay !== '—' ? `class="band-chip ${chipClass(bandDisplay)}"` : 'class="band-chip"'
  const pct = totalMax > 0 ? Math.round((totalMarks / totalMax) * 1000) / 10 : 0
  const overallTotalText = totalMax > 0 ? `${Math.round(totalMarks)} / ${totalMax}` : `${Math.round(overallAvg)} / 100`
  return `
    <div class="rc-section-title">Overall Summary</div>
    <table class="gtbl">
      <thead><tr>
        <th>Overall Total</th>
        <th>Overall Achievement</th>
        <th>Class Position</th>
        <th>Subjects Assessed</th>
      </tr></thead>
      <tbody><tr>
        <td style="font-weight:700">${overallTotalText}<span class="rc-pts" style="display:block">= ${pct.toFixed(1)}%</span></td>
        <td><span ${chipCls}>${bandDisplay}</span>${pts ? ` <span class="rc-pts">${pts}</span>` : ''}${label ? `<div class="rc-label">${label}</div>` : ''}</td>
        <td>${rankText}</td>
        <td>${totalSubjects}</td>
      </tr></tbody>
    </table>`
}

function buildGradingLegendHtml(className) {
  const level = getCBELevel(className)
  if (level === 'early') {
    return `
      <div class="rc-legend">
        <div class="rc-legend-title">Grading Scale</div>
        <div class="rc-legend-grid">
          <div class="rc-legend-item"><span class="rc-legend-band" style="color:#166534">EE</span> Exceeding Expectations</div>
          <div class="rc-legend-item"><span class="rc-legend-band" style="color:#1e40af">ME</span> Meeting Expectations</div>
          <div class="rc-legend-item"><span class="rc-legend-band" style="color:#92400e">AE</span> Approaching Expectations</div>
          <div class="rc-legend-item"><span class="rc-legend-band" style="color:#991b1b">BE</span> Below Expectations</div>
        </div>
      </div>`
  }
  if (level === 'middle') {
    return `
      <div class="rc-legend">
        <div class="rc-legend-title">Grading Scale</div>
        <div class="rc-legend-grid">
          <div class="rc-legend-item"><span class="rc-legend-band" style="color:#166534">EE1</span> Exceptional (90–100)</div>
          <div class="rc-legend-item"><span class="rc-legend-band" style="color:#166534">EE2</span> Very Good (75–89)</div>
          <div class="rc-legend-item"><span class="rc-legend-band" style="color:#1e40af">ME1</span> Good (58–74)</div>
          <div class="rc-legend-item"><span class="rc-legend-band" style="color:#1e40af">ME2</span> Fair (41–57)</div>
          <div class="rc-legend-item"><span class="rc-legend-band" style="color:#92400e">AE1</span> Needs Improvement (31–40)</div>
          <div class="rc-legend-item"><span class="rc-legend-band" style="color:#92400e">AE2</span> Below Average (21–30)</div>
          <div class="rc-legend-item"><span class="rc-legend-band" style="color:#991b1b">BE1</span> Well Below Avg (11–20)</div>
          <div class="rc-legend-item"><span class="rc-legend-band" style="color:#991b1b">BE2</span> Minimal Competence (0–10)</div>
        </div>
      </div>`
  }
  return `
    <div class="rc-legend">
      <div class="rc-legend-title">Grading Scale</div>
      <div class="rc-legend-grid">
        <div class="rc-legend-item" style="color:#475569">Senior grades pending verification — scale to be confirmed.</div>
      </div>
    </div>`
}

function buildSubjectTableHtml(subjects, examTypes, className, overallScore) {
  const rows = subjects.map((sub, i) => {
    const cbe = getCBEGrade(sub.average, className)
    const resolved = cbe.status !== 'unresolved' && cbe.status !== 'pending'
    const bandDisplay = resolved && cbe.band ? cbe.band : '—'
    const pts = resolved && cbe.points != null ? ` · ${cbe.points}pts` : ''
    const chipCls = bandDisplay !== '—' ? `class="band-chip ${chipClass(bandDisplay)}"` : 'class="band-chip"'
    const assessCells = examTypes.map(et => {
      const a = sub.assessments.find(x => x.name === et)
      return `<td>${a ? `${Math.round(a.rawMarks)}/${a.maxMarksRaw}` : '—'}</td>`
    }).join('')
    return `<tr>
      <td class="left" style="font-weight:600">${i + 1}</td>
      <td class="left">${sub.name}</td>
      ${assessCells}
      <td style="font-weight:700">${Math.round(sub.average)}/100</td>
      <td><span ${chipCls}>${bandDisplay}</span>${pts ? `<span class="rc-pts">${pts}</span>` : ''}</td>
      <td class="left" style="font-size:8px">${sub.teacher || '—'}</td>
    </tr>`
  }).join('')

  const overall = getCBEGrade(overallScore || 0, className)
  const oResolved = overall.status !== 'unresolved' && overall.status !== 'pending'
  const oBand = oResolved && overall.band ? overall.band : '—'
  const oPts = oResolved && overall.points != null ? ` · ${overall.points}pts` : ''
  const oChip = oBand !== '—' ? `class="band-chip ${chipClass(oBand)}"` : 'class="band-chip"'
  const naCells = examTypes.map(() => `<td class="rc-total-na">—</td>`).join('')
  const overallMarks = subjects.reduce((s, sub) => s + sub.average, 0)
  const overallMax = subjects.length * 100
  const overallPct = overallMax > 0 ? (overallMarks / overallMax) * 100 : 0
  const totalRow = `
    <tr class="gtbl-total">
      <td class="left" colspan="2" style="font-weight:800;text-transform:uppercase">Overall</td>
      ${naCells}
      <td style="font-weight:800">${Math.round(overallMarks)} / ${overallMax}<span class="rc-pts" style="display:block">= ${overallPct.toFixed(1)}%</span></td>
      <td><span ${oChip}>${oBand}</span>${oPts ? `<span class="rc-pts">${oPts}</span>` : ''}</td>
      <td class="left" style="font-size:8px"></td>
    </tr>`

  const assessHeaders = examTypes.map(et => {
    const found = subjects.map(s => s.assessments.find(x => x.name === et)).find(Boolean)
    const max = found ? found.maxMarksRaw : 100
    return `<th>${et}<br/><span style="font-weight:400">/${max}</span></th>`
  }).join('')
  return `
    <div class="rc-section-title">Subject Performance</div>
    <table class="gtbl">
      <thead><tr>
        <th style="width:22px">#</th>
        <th class="left">Subject</th>
        ${assessHeaders}
        <th>Total<br/><span style="font-weight:400">/100</span></th>
        <th>Achievement Level</th>
        <th>Teacher</th>
      </tr></thead>
      <tbody>${rows}${totalRow}</tbody>
    </table>`
}

function buildTrendChartSvg(subjects, examTypes) {
  if (subjects.length === 0 || examTypes.length < 2) return ''

  const W = 660, H = 260, P = { top: 30, right: 20, bottom: 50, left: 45 }
  const cW = W - P.left - P.right
  const cH = H - P.top - P.bottom

  const yMin = 0, yMax = 100
  const xStep = cW / (examTypes.length - 1)

  const lines = subjects.map((sub, si) => {
    const color = CHART_COLORS[si % CHART_COLORS.length]
    const points = examTypes.map((et, xi) => {
      const a = sub.assessments.find(x => x.name === et)
      const val = a ? a.score : null
      if (val === null) return null
      const x = P.left + xi * xStep
      const y = P.top + cH - ((val - yMin) / (yMax - yMin)) * cH
      return { x, y, val }
    }).filter(Boolean)
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    const dots = points.map(p =>
      `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}" stroke="#fff" stroke-width="1.5"/>` +
      `<text x="${p.x}" y="${p.y - 8}" text-anchor="middle" font-size="8" fill="${color}" font-weight="600">${Math.round(p.val)}%</text>`
    ).join('')
    return `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${dots}`
  }).join('')

  const yTicks = [0, 20, 40, 60, 80, 100]
  const yGrid = yTicks.map(v => {
    const y = P.top + cH - ((v - yMin) / (yMax - yMin)) * cH
    return `<line x1="${P.left}" y1="${y}" x2="${W - P.right}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/>
      <text x="${P.left - 8}" y="${y + 3}" text-anchor="end" font-size="9" fill="#64748b">${v}%</text>`
  }).join('')

  const xLabels = examTypes.map((et, xi) => {
    const x = P.left + xi * xStep
    return `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#475569">${et}</text>`
  }).join('')

  const legend = subjects.map((sub, si) => {
    const color = CHART_COLORS[si % CHART_COLORS.length]
    const lx = P.left + si * 110
    return `<line x1="${lx}" y1="10" x2="${lx + 16}" y2="10" stroke="${color}" stroke-width="2"/>
      <text x="${lx + 20}" y="13" font-size="9" fill="#475569">${sub.name}</text>`
  }).join('')

  return `
    <div class="rc-chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        ${yGrid}
        <line x1="${P.left}" y1="${P.top}" x2="${P.left}" y2="${P.top + cH}" stroke="#94a3b8" stroke-width="1"/>
        <line x1="${P.left}" y1="${P.top + cH}" x2="${W - P.right}" y2="${P.top + cH}" stroke="#94a3b8" stroke-width="1"/>
        ${xLabels}
        ${lines}
        ${legend}
      </svg>
    </div>`
}

function buildComparisonChartHtml(studentSubjects, classAverages) {
  if (!classAverages || classAverages.length === 0) return ''

  const W = 660, H = 260, P = { top: 30, right: 20, bottom: 50, left: 45 }
  const cW = W - P.left - P.right
  const cH = H - P.top - P.bottom
  const barW = 16

  const allSubjects = studentSubjects.map(s => ({
    name: s.name,
    student: s.average,
    classAvg: classAverages.find(c => c.name === s.name)?.avg || 0,
  }))

  const groupWidth = Math.min(cW / allSubjects.length, 80)
  const gap = 4

  const yTicks = [0, 20, 40, 60, 80, 100]
  const yGrid = yTicks.map(v => {
    const y = P.top + cH - (v / 100) * cH
    return `<line x1="${P.left}" y1="${y}" x2="${W - P.right}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/>
      <text x="${P.left - 8}" y="${y + 3}" text-anchor="end" font-size="9" fill="#64748b">${v}%</text>`
  }).join('')

  const bars = allSubjects.map((s, i) => {
    const cx = P.left + i * groupWidth + groupWidth / 2
    const studentH = (s.student / 100) * cH
    const classH = (s.classAvg / 100) * cH
    return `
      <rect x="${cx - barW - gap / 2}" y="${P.top + cH - studentH}" width="${barW}" height="${studentH}" fill="#2563eb" rx="2"/>
      <rect x="${cx + gap / 2}" y="${P.top + cH - classH}" width="${barW}" height="${classH}" fill="#94a3b8" rx="2"/>
      <text x="${cx - barW / 2 - gap / 2}" y="${P.top + cH - studentH - 4}" text-anchor="middle" font-size="8" fill="#2563eb" font-weight="600">${Math.round(s.student)}%</text>
      <text x="${cx + barW / 2 + gap / 2}" y="${P.top + cH - classH - 4}" text-anchor="middle" font-size="8" fill="#94a3b8" font-weight="600">${Math.round(s.classAvg)}%</text>
      <text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="8" fill="#475569" transform="rotate(-20, ${cx}, ${H - 8})">${s.name.length > 12 ? s.name.slice(0, 12) + '…' : s.name}</text>
    `
  }).join('')

  const legend = `
    <rect x="${P.left}" y="8" width="12" height="10" fill="#2563eb" rx="2"/>
    <text x="${P.left + 16}" y="17" font-size="9" fill="#475569">Student</text>
    <rect x="${P.left + 70}" y="8" width="12" height="10" fill="#94a3b8" rx="2"/>
    <text x="${P.left + 86}" y="17" font-size="9" fill="#475569">Class Average</text>
  `

  return `
    <div class="rc-section-title">Student vs Class Average</div>
    <div class="rc-chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        ${yGrid}
        <line x1="${P.left}" y1="${P.top}" x2="${P.left}" y2="${P.top + cH}" stroke="#94a3b8" stroke-width="1"/>
        <line x1="${P.left}" y1="${P.top + cH}" x2="${W - P.right}" y2="${P.top + cH}" stroke="#94a3b8" stroke-width="1"/>
        ${bars}
        ${legend}
      </svg>
    </div>`
}

function buildAcademicHistoryHtml(historicalData) {
  if (!historicalData || historicalData.length === 0) return ''
  const terms = ['Term 1', 'Term 2', 'Term 3']
  const rows = historicalData.map(h => {
    const cells = terms.map(t => {
      const val = h.terms[t]
      return `<td>${val != null ? `${val}%` : '—'}</td>`
    }).join('')
    return `<tr><td class="row-label">${h.grade}</td>${cells}</td></tr>`
  }).join('')
  const headers = terms.map(t => `<th>${t}</th>`).join('')
  return `
    <div class="rc-section-title">Academic Performance History</div>
    <table class="htbl">
      <thead><tr><th class="left">Grade</th>${headers}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

// ── React Component ──────────────────────────────────────────
export function ReportCard({
  student,
  grades,
  school,
  term,
  year,
  historicalData,
  classAverages,
  classRank,
  teacherComment,
  headteacherComment,
  onClose,
}) {
  const printRef = useRef()
  const className = student?.class || ''
  const grouped = groupGradesBySubject(grades)

  const handlePrint = () => {
    const content = printRef.current.innerHTML
    const win = window.open('', '_blank')
    const printCSS = REPORT_CARD_STYLES + 'body { margin: 0; padding: 0; } @page { size: A4 portrait; margin: 10mm; } @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; } body { margin: 0; padding: 0; } .rc-wrap { width: 100%; padding: 8px 12px; } }'
    win.document.write(`<html><head><title>Student Transcript – ${student.full_name}</title>
      <style>${printCSS}</style></head><body>${content}</body></html>`)
    win.document.close()
    win.print()
  }

  const grade = getCBEGrade(grouped.overallAverage, className)
  const bandDisplay = grade.band || '—'

  const trendSection = grouped.examTypes.length >= 2
    ? buildTrendChartSvg(grouped.subjects, grouped.examTypes)
    : ''

  const comparisonSection = classAverages && classAverages.length > 0
    ? buildComparisonChartHtml(grouped.subjects, classAverages)
    : ''

  const historySection = historicalData && historicalData.length > 0
    ? buildAcademicHistoryHtml(historicalData)
    : ''

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" style={{ maxWidth: 820 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Student Transcript — {student.full_name}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={handlePrint}><Printer size={14} /> Print / Save PDF</button>
            <button className="modal-close" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="rc-body" ref={printRef} style={{ padding: 0, maxHeight: '78vh', overflowY: 'auto', background: '#fff' }}>
          <style>{REPORT_CARD_STYLES}</style>
          <div className="rc-wrap">
            <div className="rc-top">
              <div className="rc-logo-box">
                {school?.logo_url ? <img src={school.logo_url} alt="logo" /> : <span className="rc-logo-placeholder">{school?.name?.slice(0,4).toUpperCase() || 'SCH'}</span>}
              </div>
              <div className="rc-school-block">
                <div className="rc-transcript-label">Student Report Card</div>
                <div className="rc-school-name">{school?.name || 'School Name'}</div>
                {school?.phone && <div className="rc-school-contact">Tel: {school.phone}{school.email ? `  •  ${school.email}` : ''}</div>}
                <hr className="rc-hr" />
                <div className="rc-student-name-big">{student.admission_number ? `${student.admission_number} ` : ''}{student.full_name}</div>
                <div className="rc-student-meta">{className} &nbsp;·&nbsp; {term} {year}</div>
              </div>
              <div className="rc-photo-box">
                {student.photo_url ? <img src={student.photo_url} alt="photo" /> : <span>Photo</span>}
              </div>
            </div>
            <hr className="rc-hr" />

            <div dangerouslySetInnerHTML={{ __html: buildSummaryCardsHtml(grouped.totalMarks, grouped.totalMax, grouped.overallAverage, grouped.totalSubjects, className, classRank) }} />
            <hr className="rc-hr-light" />

            <div dangerouslySetInnerHTML={{ __html: buildSubjectTableHtml(grouped.subjects, grouped.examTypes, className, grouped.overallAverage) }} />
            <hr className="rc-hr-light" />

            {trendSection && <>
              <div className="rc-section-title">Performance Trend</div>
              <div dangerouslySetInnerHTML={{ __html: trendSection }} />
              <hr className="rc-hr-light" />
            </>}

            {comparisonSection && <>
              <div dangerouslySetInnerHTML={{ __html: comparisonSection }} />
              <hr className="rc-hr-light" />
            </>}

            <div className="rc-comments">
              <div className="rc-comment-cell">
                <div className="rc-comment-label">Class Teacher's Comment</div>
                <div className="rc-comment-text">{teacherComment || '—'}</div>
                <div className="rc-sig-line" style={{ marginTop: 8 }} />
                <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>Teacher's Signature</div>
              </div>
              <div className="rc-comment-cell">
                <div className="rc-comment-label">Headteacher's Comment</div>
                <div className="rc-comment-text">{headteacherComment || '—'}</div>
                <div className="rc-sig-line" style={{ marginTop: 8 }} />
                <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>Headteacher's Signature</div>
              </div>
            </div>
            <hr className="rc-hr-light" />

            {historySection && <>
              <div dangerouslySetInnerHTML={{ __html: historySection }} />
              <hr className="rc-hr-light" />
            </>}

            <div dangerouslySetInnerHTML={{ __html: buildGradingLegendHtml(className) }} />

            {school?.motto && <div className="rc-foot-quote">"{school.motto}"</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Bulk Report Card HTML Builder ─────────────────────────────
// ── Inline CSS post-processor for html2canvas ────────────────
// html2canvas can't resolve <style> blocks, so we walk the DOM
// and stamp the matching inline styles onto every element.
const INLINE_RULES = [
  ['rc-wrap', 'font-family:Segoe UI,Arial,Helvetica,sans-serif;font-size:11px;color:#1a1a1a;background:#fff;line-height:1.5;width:100%;max-width:none;padding:12px 16px;box-sizing:border-box'],
  ['rc-top', 'display:flex;align-items:center;gap:16px;margin-bottom:12px'],
  ['rc-logo-box', 'width:60px;height:60px;border-radius:50%;border:2px solid #cbd5e1;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#f1f5f9'],
  ['rc-logo-placeholder', 'font-size:10px;font-weight:900;color:#64748b;text-align:center'],
  ['rc-school-block', 'flex:1;text-align:center'],
  ['rc-transcript-label', 'font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px'],
  ['rc-school-name', 'font-size:20px;font-weight:900;color:#0f172a;margin-bottom:4px'],
  ['rc-school-contact', 'font-size:10px;color:#475569;margin-bottom:6px'],
  ['rc-student-name-big', 'font-size:15px;font-weight:800;color:#0f172a;margin:8px 0 3px'],
  ['rc-student-meta', 'font-size:11px;color:#475569'],
  ['rc-photo-box', 'width:58px;height:70px;border:1px solid #cbd5e1;background:#f8fafc;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;color:#94a3b8;text-align:center;border-radius:4px'],
  ['rc-hr', 'border:none;border-top:2px solid #1e293b;margin:10px 0;height:0'],
  ['rc-hr-light', 'border:none;border-top:1px solid #e2e8f0;margin:10px 0;height:0'],
  ['rc-section-title', 'font-size:12px;font-weight:800;color:#0f172a;margin:12px 0 8px;text-transform:uppercase;letter-spacing:0.5px'],
  ['rc-comments', 'display:grid;grid-template-columns:1fr 1fr;gap:0;margin:10px 0;border:1px solid #cbd5e1;border-radius:4px;overflow:hidden'],
  ['rc-comment-cell', 'padding:10px 12px;border-right:1px solid #cbd5e1'],
  ['rc-comment-label', 'font-size:10px;font-weight:700;text-align:center;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin-bottom:6px;color:#1e293b'],
  ['rc-comment-text', 'font-size:10px;color:#334155;min-height:36px;line-height:1.6'],
  ['rc-sig-line', 'border-bottom:1px solid #94a3b8;height:20px;display:block;width:100%'],
  ['rc-legend', 'margin:10px 0;padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px'],
  ['rc-legend-title', 'font-size:10px;font-weight:700;color:#1e293b;margin-bottom:4px'],
  ['rc-legend-grid', 'display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;font-size:9px;color:#475569'],
  ['rc-legend-item', 'display:flex;gap:4px'],
  ['rc-legend-band', 'font-weight:700;min-width:28px'],
  ['rc-foot-quote', 'text-align:center;font-size:9px;font-style:italic;color:#64748b;margin-top:12px;border-top:1px solid #cbd5e1;padding-top:8px'],
  ['band-chip', 'font-weight:700'],
  ['chip-ee', 'color:#166534;font-weight:700'],
  ['chip-me', 'color:#1e40af;font-weight:700'],
  ['chip-ae', 'color:#92400e;font-weight:700'],
  ['chip-be', 'color:#991b1b;font-weight:700'],
  ['rc-pts', 'font-size:8.5px;color:#64748b;font-weight:600'],
  ['rc-label', 'font-size:8.5px;color:#475569'],
  ['rc-chart-wrap', 'width:100%;margin:8px 0;overflow-x:auto'],
]

const TABLE_INLINE = {
  'gtbl': 'width:100%;border-collapse:collapse;font-size:10px;margin-bottom:6px;font-family:Segoe UI,Arial,Helvetica,sans-serif',
  'gtbl th': 'background:#1e293b;border:1px solid #94a3b8;padding:6px;text-align:center;font-weight:700;font-size:9px;color:#fff;font-family:Segoe UI,Arial,Helvetica,sans-serif',
  'gtbl td': 'border:1px solid #cbd5e1;padding:5px 6px;text-align:center;color:#1e293b;font-size:10px;font-family:Segoe UI,Arial,Helvetica,sans-serif',
  'htbl': 'width:100%;border-collapse:collapse;font-size:10px;margin-top:10px;font-family:Segoe UI,Arial,Helvetica,sans-serif',
  'htbl th': 'border:1px solid #94a3b8;padding:5px 8px;background:#f1f5f9;font-weight:700;font-size:10px;text-align:center;color:#1e293b;font-family:Segoe UI,Arial,Helvetica,sans-serif',
  'htbl td': 'border:1px solid #cbd5e1;padding:5px 8px;text-align:center;color:#475569;font-size:10px;font-family:Segoe UI,Arial,Helvetica,sans-serif',
  'trend-table': 'width:100%;border-collapse:collapse;font-size:9px;margin:8px 0;font-family:Segoe UI,Arial,Helvetica,sans-serif',
  'trend-table th': 'background:#1e293b;color:#fff;padding:5px 6px;border:1px solid #94a3b8;font-size:9px;font-weight:700;text-align:center;font-family:Segoe UI,Arial,Helvetica,sans-serif',
  'trend-table td': 'padding:4px 6px;border:1px solid #cbd5e1;text-align:center;font-size:9px;font-family:Segoe UI,Arial,Helvetica,sans-serif',
}

export function inlineCss(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // Class-based elements
  for (const [cls, style] of INLINE_RULES) {
    doc.querySelectorAll(`.${cls}`).forEach(el => {
      const existing = el.getAttribute('style') || ''
      el.setAttribute('style', existing ? existing + ';' + style : style)
    })
  }

  // Table elements (th, td get special treatment)
  for (const [sel, style] of Object.entries(TABLE_INLINE)) {
    if (sel.endsWith(' th')) {
      const tableClass = sel.replace(' th', '')
      doc.querySelectorAll(`table.${tableClass} th, table[class*="${tableClass}"] th`).forEach(el => {
        const existing = el.getAttribute('style') || ''
        el.setAttribute('style', existing ? existing + ';' + style : style)
      })
    } else if (sel.endsWith(' td')) {
      const tableClass = sel.replace(' td', '')
      doc.querySelectorAll(`table.${tableClass} td, table[class*="${tableClass}"] td`).forEach(el => {
        const existing = el.getAttribute('style') || ''
        el.setAttribute('style', existing ? existing + ';' + style : style)
      })
    } else {
      doc.querySelectorAll(`table.${sel}`).forEach(el => {
        const existing = el.getAttribute('style') || ''
        el.setAttribute('style', existing ? existing + ';' + style : style)
      })
    }
  }

  // Even-row striping for gtbl
  doc.querySelectorAll('table.gtbl tbody tr:nth-child(even) td').forEach(el => {
    const existing = el.getAttribute('style') || ''
    if (!existing.includes('background')) {
      el.setAttribute('style', existing ? existing + ';background:#f8fafc' : 'background:#f8fafc')
    }
  })

  // Font family on all text elements
  const ff = 'font-family:Segoe UI,Arial,Helvetica,sans-serif'
  doc.querySelectorAll('.rc-wrap td, .rc-wrap th, .rc-wrap div, .rc-wrap span').forEach(el => {
    const existing = el.getAttribute('style') || ''
    if (existing && existing.includes('font-family')) return
    if (el.closest('.rc-wrap')) {
      el.setAttribute('style', existing ? existing + ';' + ff : ff)
    }
  })

  return doc.body.innerHTML
}

export function buildReportCardHtml(student, grades, school, term, year, extraData = {}) {
  const className = student?.class || ''
  const grouped = groupGradesBySubject(grades)

  const rankInfo = extraData.classRank || null

  const trendSvg = grouped.examTypes.length >= 2
    ? buildTrendChartSvg(grouped.subjects, grouped.examTypes)
    : ''

  const trendSection = trendSvg ? `
    <hr class="rc-hr-light" />
    <div class="rc-section-title">Performance Trend</div>
    ${trendSvg}` : ''

  const comparisonHtml = extraData.classAverages && extraData.classAverages.length > 0
    ? buildComparisonChartHtml(grouped.subjects, extraData.classAverages)
    : ''

  const comparisonSection = comparisonHtml ? `
    <hr class="rc-hr-light" />
    ${comparisonHtml}` : ''

  const historyHtml = extraData.historicalData && extraData.historicalData.length > 0
    ? buildAcademicHistoryHtml(extraData.historicalData)
    : ''

  const historySection = historyHtml ? `
    <hr class="rc-hr-light" />
    ${historyHtml}` : ''

  const legendHtml = buildGradingLegendHtml(className)

  return `
    <div class="rc-wrap">
      <div class="rc-top">
        <div class="rc-logo-box">
          ${school?.logo_url
            ? `<img src="${school.logo_url}" alt="logo" />`
            : `<span class="rc-logo-placeholder">${(school?.name || 'SCH').slice(0,4).toUpperCase()}</span>`
          }
        </div>
        <div class="rc-school-block">
          <div class="rc-transcript-label">Student Report Card</div>
          <div class="rc-school-name">${school?.name || 'School Name'}</div>
          ${school?.phone ? `<div class="rc-school-contact">Tel: ${school.phone}${school.email ? `  •  ${school.email}` : ''}</div>` : ''}
          <hr class="rc-hr" />
          <div class="rc-student-name-big">${student.admission_number ? `${student.admission_number} ` : ''}${student.full_name}</div>
          <div class="rc-student-meta">${className} &nbsp;·&nbsp; ${term} ${year}</div>
        </div>
        <div class="rc-photo-box">
          ${student.photo_url
            ? `<img src="${student.photo_url}" alt="photo" />`
            : '<span>Photo</span>'
          }
        </div>
      </div>
      <hr class="rc-hr" />

      ${buildSummaryCardsHtml(grouped.totalMarks, grouped.totalMax, grouped.overallAverage, grouped.totalSubjects, className, rankInfo)}
      <hr class="rc-hr-light" />

      ${buildSubjectTableHtml(grouped.subjects, grouped.examTypes, className, grouped.overallAverage)}
      <hr class="rc-hr-light" />

      ${trendSection}

      ${comparisonSection}

      <div class="rc-comments">
        <div class="rc-comment-cell">
          <div class="rc-comment-label">Class Teacher's Comment</div>
          <div class="rc-comment-text">${extraData.teacherComment || '—'}</div>
          <div class="rc-sig-line" style="margin-top:8px"></div>
          <div style="font-size:9px;color:#64748b;margin-top:2px">Teacher's Signature</div>
        </div>
        <div class="rc-comment-cell">
          <div class="rc-comment-label">Headteacher's Comment</div>
          <div class="rc-comment-text">${extraData.headteacherComment || '—'}</div>
          <div class="rc-sig-line" style="margin-top:8px"></div>
          <div style="font-size:9px;color:#64748b;margin-top:2px">Headteacher's Signature</div>
        </div>
      </div>
      <hr class="rc-hr-light" />

      ${historySection}

      ${legendHtml}

      ${school?.motto ? `<div class="rc-foot-quote">"${school.motto}"</div>` : ''}
    </div>`
}
