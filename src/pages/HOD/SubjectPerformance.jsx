import { useState, useEffect } from 'react'
import { BarChart2, Search, TrendingUp, TrendingDown, Download, FileText, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useSchool } from '../admin/useSchool'
import { REPORT_CARD_STYLES } from '../../components/students/ReportCard'

const GRADE_COLORS = {
  A: '#16a34a', 'A-': '#22c55e', 'B+': '#65a30d',
  B: '#a3e635', 'B-': '#eab308', 'C+': '#f59e0b',
  C: '#f97316', 'C-': '#ef4444', 'D+': '#dc2626',
  D: '#b91c1c', 'D-': '#991b1b', E: '#7f1d1d',
}

export default function SubjectPerformance() {
  const { currentTerm, currentYear } = useSchool()
  const [subjects, setSubjects] = useState([])
  const [gradeLevels, setGradeLevels] = useState([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedGrade, setSelectedGrade] = useState('')
  const [performanceData, setPerformanceData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchInitialData()
  }, [])

  useEffect(() => {
    if (subjects.length > 0) fetchPerformance()
  }, [selectedSubject, selectedGrade, currentTerm, currentYear])

  const fetchInitialData = async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const schoolId = profile?.school_id
    if (!schoolId) { setLoading(false); return }

    const [subjectsRes, gradeLevelsRes] = await Promise.all([
      supabase.from('subjects').select('*').eq('school_id', schoolId).order('name'),
      supabase.from('grade_levels').select('*').eq('school_id', schoolId).order('name'),
    ])

    setSubjects(subjectsRes.data || [])
    setGradeLevels(gradeLevelsRes.data || [])
    if (subjectsRes.data?.length > 0) {
      setSelectedSubject(subjectsRes.data[0].name)
    } else {
      setLoading(false)
    }
  }

  const fetchPerformance = async () => {
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const schoolId = profile?.school_id
    if (!schoolId) { setLoading(false); return }

    let query = supabase
      .from('grades')
      .select('*, students(full_name, class, stream, admission_number)')
      .eq('school_id', schoolId)
      .eq('term', currentTerm)
      .eq('year', currentYear)

    if (selectedSubject) query = query.eq('subject', selectedSubject)

    const { data } = await query.order('total_score', { ascending: false })

    let filtered = data || []

    if (selectedGrade) {
      filtered = filtered.filter(g => g.students?.class === selectedGrade)
    }

    const total = filtered.length
    const avgScore = total > 0 ? Math.round(filtered.reduce((s, g) => s + Number(g.total_score || 0), 0) / total) : 0
    const highest = total > 0 ? Math.max(...filtered.map(g => Number(g.total_score || 0))) : 0
    const lowest = total > 0 ? Math.min(...filtered.map(g => Number(g.total_score || 0))) : 0
    const passCount = filtered.filter(g => Number(g.total_score || 0) >= 50).length
    const passRate = total > 0 ? Math.round((passCount / total) * 100) : 0

    const gradeDist = {}
    filtered.forEach(g => {
      const gr = g.grade || 'N/A'
      gradeDist[gr] = (gradeDist[gr] || 0) + 1
    })

    setPerformanceData({
      total,
      avgScore,
      highest,
      lowest,
      passCount,
      passRate,
      gradeDist,
      entries: filtered,
    })
    setLoading(false)
  }

  const downloadPDF = async () => {
    if (!d.entries || d.entries.length === 0) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('schools(name, logo_url, address, phone, email, motto)')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()
    const school = profile?.schools

    const distRows = Object.entries(d.gradeDist).sort().map(([grade, count]) => {
      const pct = d.total > 0 ? Math.round((count / d.total) * 100) : 0
      return `<tr><td style="font-weight:600">${grade}</td><td style="text-align:center">${count}</td><td style="text-align:center">${pct}%</td></tr>`
    }).join('')

    const studentRows = d.entries.map((g, i) => `<tr>
      <td style="text-align:center;color:#94a3b8">${i + 1}</td>
      <td style="font-weight:500">${g.students?.full_name || '—'}</td>
      <td style="font-family:monospace;color:#64748b">${g.students?.admission_number || '—'}</td>
      <td>${g.students?.class || '—'}</td>
      <td>${g.students?.stream || '—'}</td>
      <td style="font-weight:600;color:${Number(g.total_score || 0) >= 50 ? '#16a34a' : '#dc2626'};text-align:center">${g.total_score ?? '—'}%</td>
      <td style="text-align:center"><span class="band-chip ${Number(g.total_score || 0) >= 80 ? 'chip-ee' : Number(g.total_score || 0) >= 60 ? 'chip-me' : Number(g.total_score || 0) >= 40 ? 'chip-ae' : 'chip-be'}">${g.grade || '—'}</span></td>
    </tr>`).join('')

    const bodyHtml = `
      <div class="rc-center-title">Subject Performance Report</div>
      <div class="rc-center-subtitle">${selectedSubject || 'All Subjects'} · ${selectedGrade || 'All Classes'} · ${currentTerm} ${currentYear}</div>
      <div class="rc-center-metric-grid">
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#2563eb">${d.total}</div><div class="rc-center-metric-label">Total Students</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#16a34a">${d.avgScore}%</div><div class="rc-center-metric-label">Average Score</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#7c3aed">${d.passRate}%</div><div class="rc-center-metric-label">Pass Rate</div></div>
      </div>
      <div class="rc-center-metric-grid">
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#ca8a04">${d.highest}%</div><div class="rc-center-metric-label">Highest Score</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#dc2626">${d.lowest}%</div><div class="rc-center-metric-label">Lowest Score</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#0f172a">${d.passCount}</div><div class="rc-center-metric-label">Students Passed</div></div>
      </div>
      <div class="rc-section-title">Grade Distribution</div>
      <table class="rc-center-table">
        <thead><tr><th>Grade</th><th style="text-align:center">Count</th><th style="text-align:center">Percentage</th></tr></thead>
        <tbody>${distRows}</tbody>
      </table>
      <div class="rc-section-title" style="margin-top:16px">Student Scores</div>
      <table class="rc-center-table">
        <thead><tr><th style="text-align:center;width:30px">#</th><th>Student</th><th>Adm No.</th><th>Class</th><th>Stream</th><th style="text-align:center">Score</th><th style="text-align:center">Grade</th></tr></thead>
        <tbody>${studentRows}</tbody>
      </table>
    `
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Subject Performance – ${currentTerm} ${currentYear}</title>
<style>
  ${REPORT_CARD_STYLES}
  .rc-wrap { max-width: 900px; }
  .rc-center-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
  .rc-center-table th { background: #1e293b; color: #fff; padding: 8px 10px; text-align: left; font-weight: 700; font-size: 10px; border: 1px solid #94a3b8; text-transform: uppercase; letter-spacing: 0.03em; }
  .rc-center-table td { padding: 7px 10px; border: 1px solid #cbd5e1; color: #1e293b; }
  .rc-center-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .rc-center-metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 12px 0; }
  .rc-center-metric { padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center; }
  .rc-center-metric-value { font-size: 18px; font-weight: 700; color: #0f172a; }
  .rc-center-metric-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
  .rc-center-title { font-size: 16px; font-weight: 800; color: #0f172a; text-align: center; margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .rc-center-subtitle { font-size: 11px; color: #64748b; text-align: center; margin-bottom: 10px; }
  .rc-center-footer { text-align: center; font-size: 9px; color: #94a3b8; margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
  @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; } body { margin: 0; padding: 0; } .rc-wrap { width: 100%; max-width: none; padding: 12px 16px; } }
</style></head><body>
<div class="rc-wrap">
  <div class="rc-top">
    <div class="rc-logo-box">${school?.logo_url ? `<img src="${school.logo_url}" alt="Logo" />` : `<div class="rc-logo-placeholder">${(school?.name || 'S')[0]}</div>`}</div>
    <div class="rc-school-block">
      <div class="rc-school-name">${school?.name || 'School'}</div>
      ${school?.address ? `<div class="rc-school-contact">${school.address}${school.phone ? ' · ' + school.phone : ''}${school.email ? ' · ' + school.email : ''}</div>` : ''}
    </div>
  </div>
  <hr class="rc-hr" />
  ${bodyHtml}
  <div class="rc-center-footer">Generated on ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })} · ${currentTerm} ${currentYear}</div>
</div>
</body></html>`
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.onload = () => { win.focus(); win.print() }
  }

  const downloadExcel = () => {
    if (!d.entries || d.entries.length === 0) return
    const wb = XLSX.utils.book_new()

    const summaryData = [
      ['Subject Performance Report'],
      [`${selectedSubject || 'All Subjects'} | ${selectedGrade || 'All Classes'} | ${currentTerm} ${currentYear}`],
      [],
      ['Metric', 'Value'],
      ['Total Students', d.total],
      ['Average Score', `${d.avgScore}%`],
      ['Pass Rate', `${d.passRate}%`],
      ['Highest Score', `${d.highest}%`],
      ['Lowest Score', `${d.lowest}%`],
      [],
      ['Grade Distribution'],
      ['Grade', 'Count', 'Percentage'],
      ...Object.entries(d.gradeDist).sort().map(([grade, count]) => {
        const pct = d.total > 0 ? Math.round((count / d.total) * 100) : 0
        return [grade, count, `${pct}%`]
      }),
    ]
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
    summarySheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')

    const scoreRows = d.entries.map((g, i) => ({
      '#': i + 1,
      'Student': g.students?.full_name || '—',
      'Admission No.': g.students?.admission_number || '—',
      'Class': g.students?.class || '—',
      'Stream': g.students?.stream || '—',
      'Score': g.total_score ?? '—',
      'Grade': g.grade || '—',
      'Exam Type': g.exam_type || '—',
      'Term': g.term || '—',
      'Year': g.year || '—',
    }))
    const scoreSheet = XLSX.utils.json_to_sheet(scoreRows)
    scoreSheet['!cols'] = [
      { wch: 4 }, { wch: 30 }, { wch: 16 }, { wch: 12 },
      { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 12 },
      { wch: 10 }, { wch: 8 },
    ]
    XLSX.utils.book_append_sheet(wb, scoreSheet, 'Student Scores')

    XLSX.writeFile(wb, `subject_performance_${(selectedSubject || 'all').replace(/\s+/g, '_')}_${currentTerm}_${currentYear}.xlsx`)
  }

  if (loading && performanceData.length === 0) {
    return <div className="loading-state">Loading performance data...</div>
  }

  const d = performanceData

  return (
    <div className="hod-sub-page">
      <div className="hod-sp-header">
        <div className="hod-sp-filters">
          <div className="hod-sp-search-wrap">
            <Search size={14} className="hod-sp-search-icon" />
            <select
              className="hod-sp-select"
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
            >
              <option value="">All Subjects</option>
              {subjects.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          <select className="hod-sp-select" value={selectedGrade} onChange={e => setSelectedGrade(e.target.value)}>
            <option value="">All Classes</option>
            {gradeLevels.map(g => (
              <option key={g.id} value={g.name}>{g.name}</option>
            ))}
          </select>
          <span className="hod-sp-term-badge">{currentTerm} {currentYear}</span>
          {d.entries && d.entries.length > 0 && (
            <div className="hod-sp-download-group">
              <button className="hod-btn-secondary small" onClick={downloadPDF} title="Download PDF">
                <FileText size={14} /> PDF
              </button>
              <button className="hod-btn-primary small" onClick={downloadExcel} title="Download Excel">
                <FileSpreadsheet size={14} /> Excel
              </button>
            </div>
          )}
        </div>
      </div>

      {d.entries ? (
        <>
          <div className="hod-sp-metrics">
            <div className="hod-sp-metric-card">
              <p className="hod-sp-metric-value" style={{ color: '#2563eb' }}>{d.avgScore}%</p>
              <p className="hod-sp-metric-label">Average Score</p>
              <span className="hod-sp-metric-trend" style={{ color: d.avgScore >= 50 ? '#16a34a' : '#dc2626' }}>
                {d.avgScore >= 50 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {d.avgScore >= 50 ? 'Above average' : 'Below average'}
              </span>
            </div>
            <div className="hod-sp-metric-card">
              <p className="hod-sp-metric-value" style={{ color: '#16a34a' }}>{d.passRate}%</p>
              <p className="hod-sp-metric-label">Pass Rate</p>
              <span className="hod-sp-metric-sub">{d.passCount} of {d.total} students passed</span>
            </div>
            <div className="hod-sp-metric-card">
              <p className="hod-sp-metric-value" style={{ color: '#7c3aed' }}>{d.highest}%</p>
              <p className="hod-sp-metric-label">Highest Score</p>
              <span className="hod-sp-metric-sub">Top performer</span>
            </div>
            <div className="hod-sp-metric-card">
              <p className="hod-sp-metric-value" style={{ color: '#ca8a04' }}>{d.lowest}%</p>
              <p className="hod-sp-metric-label">Lowest Score</p>
              <span className="hod-sp-metric-sub">Needs intervention</span>
            </div>
          </div>

          <div className="hod-grid">
            <div className="hod-card">
              <div className="hod-card-header">
                <h3>Grade Distribution</h3>
              </div>
              <div className="hod-sp-grade-dist">
                {Object.entries(d.gradeDist).sort().map(([grade, count]) => {
                  const pct = d.total > 0 ? Math.round((count / d.total) * 100) : 0
                  return (
                    <div key={grade} className="hod-sp-grade-bar-group">
                      <div className="hod-sp-grade-label">
                        <span style={{ fontWeight: 600 }}>{grade}</span>
                        <span style={{ color: '#64748b', fontSize: 12 }}>{count} students</span>
                      </div>
                      <div className="hod-sp-grade-bar-track">
                        <div
                          className="hod-sp-grade-bar-fill"
                          style={{ width: `${pct}%`, background: GRADE_COLORS[grade] || '#94a3b8' }}
                        />
                      </div>
                      <span className="hod-sp-grade-pct">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="hod-card">
              <div className="hod-card-header">
                <h3>Student Scores {selectedSubject ? `- ${selectedSubject}` : ''}</h3>
                <span style={{ fontSize: 13, color: '#64748b' }}>{d.total} entries</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="hod-table" style={{ minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Adm No.</th>
                      <th>Class</th>
                      <th>Stream</th>
                      <th>Score</th>
                      <th>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.entries.map((g) => (
                      <tr key={g.id}>
                        <td style={{ fontWeight: 500 }}>{g.students?.full_name || '—'}</td>
                        <td className="hod-monospace">{g.students?.admission_number || '—'}</td>
                        <td>{g.students?.class || '—'}</td>
                        <td>{g.students?.stream || '—'}</td>
                        <td style={{ fontWeight: 600, color: Number(g.total_score || 0) >= 50 ? '#16a34a' : '#dc2626' }}>
                          {g.total_score ?? '—'}%
                        </td>
                        <td>
                          <span className="hod-sp-grade-chip">{g.grade || '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state">Select a subject to view performance data</div>
      )}
    </div>
  )
}
