import { supabase } from '../../lib/supabase'

const TERM_ORDER = { 'Term 1': 1, 'Term 2': 2, 'Term 3': 3 }

export async function buildGraduationTranscript(student, school, logoUrl, profileId) {
  const [gradesRes, promotionsRes, disciplineRes] = await Promise.all([
    supabase.from('grades').select('*').eq('student_id', student.id).order('year', { ascending: true }).order('term', { ascending: true }),
    supabase.from('promotion_history').select('*').eq('student_id', student.id).order('promoted_at', { ascending: true }),
    supabase.from('discipline_records').select('*').eq('student_id', student.id).order('date', { ascending: false }),
  ])

  const grades = gradesRes.data || []
  const promotions = promotionsRes.data || []
  const discipline = disciplineRes.data || []

  const subjects = [...new Set(grades.map(g => g.subject))].sort()
  const years = [...new Set(grades.map(g => g.year))].sort()
  const terms = ['Term 1', 'Term 2', 'Term 3']

  const subjectRows = subjects.map(subject => {
    const subjectGrades = grades.filter(g => g.subject === subject)
    let bestScore = 0; let bestYear = ''; let bestTerm = ''
    let worstScore = 100; let worstYear = ''; let worstTerm = ''
    let totalScore = 0; let count = 0

    const yearData = years.map(year => {
      const yearGrades = subjectGrades.filter(g => g.year === year)
      const termCells = terms.map(term => {
        const tg = yearGrades.find(g => g.term === term)
        if (!tg) return { score: null, band: null }
        const s = tg.total_score ?? 0
        totalScore += s; count++
        if (s > bestScore) { bestScore = s; bestYear = year; bestTerm = term }
        if (s < worstScore) { worstScore = s; worstYear = year; worstTerm = term }
        return { score: s, band: tg.cbe_band || tg.grade || '-' }
      })
      const yearAvg = yearGrades.length ? Math.round(yearGrades.reduce((a, g) => a + (g.total_score ?? 0), 0) / yearGrades.length) : null
      const yearBand = yearAvg ? getCompetencyLevel(yearAvg, student.class) : null
      return { year, termCells, yearAvg, yearBand }
    })

    const overallAvg = count ? Math.round(totalScore / count) : null
    const finalBand = overallAvg ? getCompetencyLevel(overallAvg, student.class) : null
    const overallGrade = finalBand?.band || '-'

    return { subject, yearData, overallAvg, overallGrade, bestScore, bestYear, bestTerm, worstScore, worstYear, worstTerm }
  })

  let bestSubject = null; let worstSubject = null
  if (subjectRows.length) {
    bestSubject = subjectRows.reduce((a, b) => (a.overallAvg || 0) > (b.overallAvg || 0) ? a : b)
    worstSubject = subjectRows.reduce((a, b) => (a.overallAvg || 999) < (b.overallAvg || 999) ? a : b)
  }

  const docId = `SP-TRN/${new Date().getFullYear()}/${String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0')}`
  const date = new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })
  const schName = school?.name || 'Our School'
  const schMotto = school?.motto || 'Excellence in Education'
  const schAddress = school?.address || 'P.O. Box 123, Nairobi, Kenya'
  const schPhone = school?.phone || '+254 700 000 000'
  const schEmail = school?.email || 'info@school.ac.ke'
  const schRegId = school?.registration_number || 'MOE/NC/2024/001'

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&bgcolor=ffffff&data=https://shulepulse.com/verify/${docId}`

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" style="height:60px;width:auto;margin-bottom:6px" />`
    : `<div style="width:60px;height:60px;background:#1e3a5f;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 6px;color:#fff;font-size:24px;font-weight:700">${schName[0]}</div>`

  const headerBlock = `
    <div style="text-align:center;margin-bottom:20px;border-bottom:2px solid #1e3a5f;padding-bottom:12px">
      ${logoHtml}
      <div style="font-size:16pt;font-weight:700;color:#1e3a5f;letter-spacing:0.5pt">${schName}</div>
      <div style="font-size:9pt;color:#666;font-style:italic">"${schMotto}"</div>
      <div style="font-size:8pt;color:#888;margin-top:3px">${schAddress} | Tel: ${schPhone} | ${schEmail}</div>
      <div style="font-size:7pt;color:#999;margin-top:2px">Ministry Reg: ${schRegId}</div>
    </div>
  `

  const graduationYear = student.exit_date ? new Date(student.exit_date).getFullYear() : (student.updated_at ? new Date(student.updated_at).getFullYear() : '—')
  const entryYear = student.entry_year || (student.created_at ? new Date(student.created_at).getFullYear() : '—')

  const timelineRows = promotions.length
    ? promotions.map(p => `<tr><td style="padding:4px 8px;border:1px solid #ccc;font-size:9pt;text-align:center">${new Date(p.promoted_at).toLocaleDateString('en-KE', { year: 'numeric' })}</td><td style="padding:4px 8px;border:1px solid #ccc;font-size:9pt;text-align:center">${p.from_class}</td><td style="padding:4px 8px;border:1px solid #ccc;font-size:9pt;text-align:center">${p.to_class}</td></tr>`).join('')
    : `<tr><td colspan="3" style="padding:4px 8px;border:1px solid #ccc;font-size:9pt;text-align:center;color:#999">No promotion history recorded</td></tr>`

  const subjectPerformanceHtml = subjectRows.length
    ? `<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:8.5pt">
        <thead>
          <tr style="background:#1e3a5f;color:#fff">
            <th rowspan="2" style="padding:6px 6px;border:1px solid #1e3a5f;text-align:left">Subject</th>
            ${years.map(y => `<th colspan="3" style="padding:6px 6px;border:1px solid #1e3a5f;text-align:center">Year ${y}</th>`).join('')}
            <th rowspan="2" style="padding:6px 6px;border:1px solid #1e3a5f;text-align:center">Avg</th>
            <th rowspan="2" style="padding:6px 6px;border:1px solid #1e3a5f;text-align:center">Grade</th>
          </tr>
          <tr style="background:#2d4a7a;color:#fff">
            ${years.map(() => terms.map(t => `<th style="padding:3px 4px;border:1px solid #2d4a7a;font-size:8pt;text-align:center">${t.replace('Term ', 'T')}</th>`).join('')).join('')}
          </tr>
        </thead>
        <tbody>
          ${subjectRows.map(row => {
            const bg = row.overallAvg >= 75 ? '#f0fdf4' : row.overallAvg >= 50 ? '#fefce8' : row.overallAvg >= 25 ? '#fff7ed' : '#fef2f2'
            return `<tr style="background:${bg}">
              <td style="padding:4px 6px;border:1px solid #ccc;font-weight:600">${row.subject}</td>
              ${row.yearData.map(yd => {
                let totalForYear = 0; let countForYear = 0
                const cells = terms.map(t => {
                  const tc = yd.termCells[terms.indexOf(t)]
                  if (tc.score === null) return `<td style="padding:3px 4px;border:1px solid #ccc;text-align:center;color:#ccc">-</td>`
                  totalForYear += tc.score; countForYear++
                  const scBg = tc.score >= 75 ? '#dcfce7' : tc.score >= 50 ? '#fef9c3' : tc.score >= 25 ? '#ffedd5' : '#fee2e2'
                  return `<td style="padding:3px 4px;border:1px solid #ccc;text-align:center;background:${scBg}">${tc.score}</td>`
                }).join('')
                return cells
              }).join('')}
              <td style="padding:4px 6px;border:1px solid #ccc;text-align:center;font-weight:600">${row.overallAvg ?? '-'}</td>
              <td style="padding:4px 6px;border:1px solid #ccc;text-align:center;font-weight:700;color:#1e3a5f">${row.overallGrade}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>`
    : '<p style="font-size:9pt;color:#999;text-align:center">No academic records found for this student.</p>'

  const now = new Date()
  const age = student.date_of_birth ? Math.floor((now - new Date(student.date_of_birth)) / (365.25 * 86400000)) : null

  return {
    docId,
    html: `
      <div style="position:relative;background:#fff;width:210mm;padding:5mm 20mm 18mm;font-family:'Times New Roman',Times,serif;color:#111;line-height:1.5;margin:0 auto">
        <div style="position:absolute;top:45%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:48pt;font-weight:700;color:rgba(30,58,95,0.04);letter-spacing:8pt;pointer-events:none;white-space:nowrap">ACADEMIC TRANSCRIPT</div>

        ${headerBlock}

        <div style="font-size:15pt;font-weight:700;text-align:center;color:#1e3a5f;margin:16px 0 12px;letter-spacing:1pt">FULL ACADEMIC TRANSCRIPT</div>

        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin:4px 0 12px">
          <div style="font-size:8pt;color:#888"><strong>Document ID:</strong> ${docId}<br/><strong>Date Issued:</strong> ${date}</div>
          <div style="text-align:center"><img src="${qrUrl}" style="width:65px;height:65px" /><div style="font-size:6pt;color:#999;margin-top:2px">Scan to verify</div></div>
        </div>

        <div style="font-size:11pt;font-weight:700;color:#1e3a5f;margin:12px 0 6px;border-bottom:1px solid #1e3a5f;padding-bottom:4px">1. STUDENT IDENTITY</div>
        <table style="width:100%;border-collapse:collapse;font-size:9pt">
          <tr><td style="padding:3px 8px;width:30%;font-weight:600">Full Name</td><td style="padding:3px 8px">${student.full_name}</td></tr>
          <tr><td style="padding:3px 8px;width:30%;font-weight:600">Admission Number</td><td style="padding:3px 8px">${student.admission_number}</td></tr>
          <tr><td style="padding:3px 8px;width:30%;font-weight:600">Gender</td><td style="padding:3px 8px">${student.gender || '—'}</td></tr>
          <tr><td style="padding:3px 8px;width:30%;font-weight:600">Date of Birth</td><td style="padding:3px 8px">${student.date_of_birth || '—'} ${age ? `(${age} years)` : ''}</td></tr>
          <tr><td style="padding:3px 8px;width:30%;font-weight:600">Entry Year</td><td style="padding:3px 8px">${entryYear}</td></tr>
          <tr><td style="padding:3px 8px;width:30%;font-weight:600">Graduation Year</td><td style="padding:3px 8px">${graduationYear}</td></tr>
          <tr><td style="padding:3px 8px;width:30%;font-weight:600">Final Class</td><td style="padding:3px 8px">${student.class || '—'}</td></tr>
          <tr><td style="padding:3px 8px;width:30%;font-weight:600">Student Status</td><td style="padding:3px 8px;font-weight:700;color:#16a34a">Graduated</td></tr>
          <tr><td style="padding:3px 8px;width:30%;font-weight:600">Exit Reason</td><td style="padding:3px 8px">${student.exit_reason || 'Completed'}</td></tr>
        </table>

        <div style="font-size:11pt;font-weight:700;color:#1e3a5f;margin:16px 0 6px;border-bottom:1px solid #1e3a5f;padding-bottom:4px">2. ACADEMIC TIMELINE</div>
        <table style="width:100%;border-collapse:collapse;font-size:9pt">
          <thead><tr style="background:#1e3a5f;color:#fff"><th style="padding:5px 8px;border:1px solid #1e3a5f">Year</th><th style="padding:5px 8px;border:1px solid #1e3a5f">From Class</th><th style="padding:5px 8px;border:1px solid #1e3a5f">To Class</th></tr></thead>
          <tbody>
            <tr><td style="padding:4px 8px;border:1px solid #ccc;text-align:center">${entryYear}</td><td style="padding:4px 8px;border:1px solid #ccc;text-align:center">—</td><td style="padding:4px 8px;border:1px solid #ccc;text-align:center;font-weight:600">Admitted (${student.class || '—'})</td></tr>
            ${timelineRows}
            <tr style="background:#f0fdf4"><td style="padding:4px 8px;border:1px solid #ccc;text-align:center;font-weight:600">${graduationYear}</td><td style="padding:4px 8px;border:1px solid #ccc;text-align:center">${student.class}</td><td style="padding:4px 8px;border:1px solid #ccc;text-align:center;font-weight:700;color:#16a34a">Graduated</td></tr>
          </tbody>
        </table>

        <div style="font-size:11pt;font-weight:700;color:#1e3a5f;margin:16px 0 6px;border-bottom:1px solid #1e3a5f;padding-bottom:4px">3. SUBJECT HISTORY & PERFORMANCE</div>
        <div style="font-size:8pt;color:#666;margin-bottom:4px;font-style:italic">${subjects.length} subjects tracked across ${years.length} academic years</div>
        ${subjectPerformanceHtml}

        ${subjectRows.length ? `
        <div style="font-size:11pt;font-weight:700;color:#1e3a5f;margin:16px 0 6px;border-bottom:1px solid #1e3a5f;padding-bottom:4px">4. PERFORMANCE SUMMARY</div>
        <table style="width:100%;border-collapse:collapse;font-size:9pt">
          <tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:600;width:40%">Overall Average</td><td style="padding:4px 8px;border:1px solid #ccc">${subjectRows.length ? Math.round(subjectRows.reduce((a, r) => a + (r.overallAvg || 0), 0) / subjectRows.length) : '—'}%</td></tr>
          <tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:600">Best Subject</td><td style="padding:4px 8px;border:1px solid #ccc">${bestSubject?.subject || '—'} (${bestSubject?.overallAvg || '—'}%)</td></tr>
          <tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:600">Weakest Subject</td><td style="padding:4px 8px;border:1px solid #ccc">${worstSubject?.subject || '—'} (${worstSubject?.overallAvg || '—'}%)</td></tr>
          <tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:600">Total Subjects Taken</td><td style="padding:4px 8px;border:1px solid #ccc">${subjects.length}</td></tr>
          <tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:600">Total Academic Years</td><td style="padding:4px 8px;border:1px solid #ccc">${years.length}</td></tr>
        </table>
        <div style="font-size:8pt;color:#666;margin-top:4px;font-style:italic">* Competency levels: EE = Exceeding Expectations, ME = Meeting Expectations, AE = Approaching Expectations, BE = Below Expectations</div>
        ` : ''}

        <div style="font-size:11pt;font-weight:700;color:#1e3a5f;margin:16px 0 6px;border-bottom:1px solid #1e3a5f;padding-bottom:4px">5. CONDUCT & DISCIPLINE SUMMARY</div>
        <table style="width:100%;border-collapse:collapse;font-size:9pt">
          <tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:600;width:40%">Conduct Rating</td><td style="padding:4px 8px;border:1px solid #ccc">${student.conduct || 'Satisfactory'}</td></tr>
          <tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:600">Discipline Records</td><td style="padding:4px 8px;border:1px solid #ccc">${discipline.length} record${discipline.length === 1 ? '' : 's'}${discipline.length ? ` (${discipline.filter(d => d.status === 'resolved').length} resolved, ${discipline.filter(d => d.status === 'pending').length} pending)` : ''}</td></tr>
          ${discipline.length ? `<tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:600">Last Offense</td><td style="padding:4px 8px;border:1px solid #ccc">${discipline[0].offense} (${discipline[0].date})</td></tr>` : ''}
        </table>

        <div style="font-size:11pt;font-weight:700;color:#1e3a5f;margin:16px 0 6px;border-bottom:1px solid #1e3a5f;padding-bottom:4px">6. VERIFICATION</div>
        <div style="display:flex;justify-content:space-between;margin-top:12px">
          <div><div style="font-size:8pt;color:#888"><strong>Document ID:</strong> ${docId}</div><div style="font-size:8pt;color:#888"><strong>QR Code:</strong> Present (scan to verify)</div></div>
          <div style="text-align:center"><img src="${qrUrl}" style="width:70px;height:70px" /><div style="font-size:6pt;color:#999;margin-top:2px">Scan to verify</div></div>
        </div>
        <div style="font-size:8pt;color:#888;margin-top:4px"><strong>Verification URL:</strong> https://shulepulse.com/verify/${docId}</div>

        <div style="display:flex;justify-content:space-between;margin-top:28px">
          <div style="text-align:center;width:45%">
            <div style="width:140px;height:0;border-top:1px solid #333;margin:0 auto 4px"></div>
            <div style="font-size:8pt;font-weight:600;color:#1e3a5f">Registrar</div>
            <div style="font-size:7pt;color:#888">Signature & Stamp</div>
          </div>
          <div style="text-align:center;width:45%">
            <div style="width:140px;height:0;border-top:1px solid #333;margin:0 auto 4px"></div>
            <div style="font-size:8pt;font-weight:600;color:#1e3a5f">Principal</div>
            <div style="font-size:7pt;color:#888">Signature & Stamp</div>
          </div>
        </div>

        <div style="text-align:center;margin-top:20px;padding-top:8px;border-top:1px solid #ddd;font-size:7pt;color:#999">
          Generated by ShulePulse School Management System — ${date}<br/>
          This is a system-generated document. Verify at https://shulepulse.com/verify/${docId}
        </div>
      </div>
    `,
  }
}

function getCompetencyLevel(score, className = '') {
  const c = (className || '').toLowerCase()
  const isEarly = c.includes('pp1') || c.includes('pp2') || c.includes('pre-primary') || c.includes('grade 1') || c.includes('grade 2') || c.includes('grade 3')
  if (isEarly) {
    if (score >= 75) return { band: 'EE', label: 'Exceeding Expectations', color: '#16a34a' }
    if (score >= 50) return { band: 'ME', label: 'Meeting Expectations', color: '#2563eb' }
    if (score >= 25) return { band: 'AE', label: 'Approaching Expectations', color: '#ca8a04' }
    return { band: 'BE', label: 'Below Expectations', color: '#dc2626' }
  }
  if (score >= 90) return { band: 'EE1', label: 'Exceptional', color: '#16a34a' }
  if (score >= 75) return { band: 'EE2', label: 'Very Good', color: '#22c55e' }
  if (score >= 58) return { band: 'ME1', label: 'Good', color: '#2563eb' }
  if (score >= 41) return { band: 'ME2', label: 'Fair', color: '#6366f1' }
  if (score >= 31) return { band: 'AE1', label: 'Needs Improvement', color: '#ca8a04' }
  if (score >= 21) return { band: 'AE2', label: 'Below Average', color: '#f97316' }
  if (score >= 11) return { band: 'BE1', label: 'Well Below Avg', color: '#ef4444' }
  return { band: 'BE2', label: 'Minimal Competence', color: '#dc2626' }
}
