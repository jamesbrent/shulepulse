import { useState, useEffect } from 'react'
import { BarChart2, BookOpen, Award, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import useStudentAcademicHistory from './useStudentAcademicHistory'
import AcademicFilters from './AcademicFilters'
import { weightedScoreMean, marksCell } from '../../services/grading'

const TrendIcon = ({ value }) => {
  if (value === 'up') return <TrendingUp size={14} className="sp-trend up" />
  if (value === 'down') return <TrendingDown size={14} className="sp-trend down" />
  return <Minus size={14} className="sp-trend flat" />
}

export default function GradesPage({ student, school }) {
  const {
    terms, classes, termKey, setTermKey,
    selectedClass, setSelectedClass,
    grades, cbc, loading,
  } = useStudentAcademicHistory({ student, school })

  const [classAvgMap, setClassAvgMap] = useState({})

  useEffect(() => {
    const loadClassAverages = async () => {
      const { selectedTerm, selectedYear } = (() => {
        const [year, term] = termKey.split('|')
        return { selectedTerm: term, selectedYear: year }
      })()
      if (!selectedTerm || !selectedYear || !selectedClass || !student?.id) return
      const { data } = await supabase
        .from('grades')
        .select('student_id, subject, total_score, max_marks')
        .eq('term', selectedTerm)
        .eq('year', Number(selectedYear))
        .eq('class_name', selectedClass)
        .in('status', ['approved', 'published'])
      const bySub = {}
      ;(data || []).forEach(g => {
        if (!bySub[g.subject]) bySub[g.subject] = []
        bySub[g.subject].push(g)
      })
      const map = {}
      Object.entries(bySub).forEach(([sub, rows]) => {
        map[sub] = Math.round(weightedScoreMean(rows))
      })
      setClassAvgMap(map)
    }
    loadClassAverages()
  }, [termKey, selectedClass, student?.id])

  const avgScore = grades.length > 0
    ? Math.round(weightedScoreMean(grades))
    : 0
  const bestSubject = grades.length > 0
    ? grades.reduce((best, g) => (g.total_score || 0) > (best?.total_score || 0) ? g : best, grades[0])
    : null
  const worstSubject = grades.length > 0
    ? grades.reduce((worst, g) => (g.total_score || 0) < (worst?.total_score || 0) ? g : worst, grades[0])
    : null

  const displayTerm = terms.find(t => `${t.year}|${t.term}` === termKey)
  const shownTermLabel = displayTerm ? `${displayTerm.term} ${displayTerm.year}` : ''

  if (loading) return (
    <div className="sp-loading-container">
      <div className="sp-loading-spinner" />
      <p>Loading your grades...</p>
    </div>
  )

  return (
    <div className="sp-page">
      <div className="sp-page-meta">
        <span className="sp-badge">{shownTermLabel || 'All time'} · {selectedClass || 'All classes'}</span>
        <span className="sp-badge">{student?.full_name}</span>
      </div>

      <AcademicFilters
        terms={terms}
        classes={classes}
        termKey={termKey}
        setTermKey={setTermKey}
        selectedClass={selectedClass}
        setSelectedClass={setSelectedClass}
      />

      <div className="sp-stats-grid">
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#eff6ff', color: '#2563eb' }}><BarChart2 size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#2563eb' }}>{avgScore}%</p>
            <p className="sp-stat-label">Average Score</p>
            <p className="sp-stat-sub">{grades.length} subjects</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#f0fdf4', color: '#16a34a' }}><Award size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#16a34a', fontSize: 15 }}>{bestSubject?.subject || '—'}</p>
            <p className="sp-stat-label">Best Subject</p>
            <p className="sp-stat-sub">{bestSubject ? `${Math.round(bestSubject.total_score)}%` : ''}</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#fef2f2', color: '#dc2626' }}><TrendingDown size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#dc2626', fontSize: 15 }}>{worstSubject?.subject || '—'}</p>
            <p className="sp-stat-label">Needs Focus</p>
            <p className="sp-stat-sub">{worstSubject ? `${Math.round(worstSubject.total_score)}%` : ''}</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#f5f3ff', color: '#7c3aed' }}><BookOpen size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#7c3aed' }}>{cbc.length}</p>
            <p className="sp-stat-label">CBC Competencies</p>
            <p className="sp-stat-sub">Assessed areas</p>
          </div>
        </div>
      </div>

      <div className="sp-card">
        <div className="sp-card-header">
          <span className="sp-badge">{selectedClass || 'All classes'}</span>
          {grades.length > 0 && <span className="sp-badge">{shownTermLabel}</span>}
        </div>
        {grades.length === 0 ? (
          <div className="sp-empty-state">
            <BarChart2 size={40} color="#94a3b8" />
            <p>No grades recorded for {shownTermLabel} in {selectedClass}</p>
          </div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Exam Type</th>
                  <th>Marks</th>
                  <th>Total</th>
                  <th>Grade</th>
                  <th>Class Avg</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {grades.map(g => {
                  const ca = classAvgMap[g.subject]
                  const delta = ca != null ? Math.round((g.total_score || 0) - ca) : null
                  return (
                    <tr key={g.id}>
                      <td><strong>{g.subject}</strong></td>
                      <td>{g.exam_type || g.type || 'Assessment'}</td>
                      <td>{marksCell(g)}</td>
                      <td><strong>{Math.round(g.total_score || 0)}%</strong></td>
                      <td>
                        <span className="sp-grade-badge" style={{ background: getGradeBg(g.grade), color: getGradeColor(g.grade) }}>
                          {g.grade || g.cbe_band || '—'}
                        </span>
                      </td>
                      <td>
                        {ca != null ? `${ca}%` : '—'}
                        {delta != null && (
                          <span style={{ color: delta >= 0 ? '#16a34a' : '#dc2626', fontSize: 11, marginLeft: 4 }}>
                            ({delta >= 0 ? '+' : ''}{delta})
                          </span>
                        )}
                      </td>
                      <td><TrendIcon value={(g.total_score || 0) >= 70 ? 'up' : (g.total_score || 0) >= 50 ? 'flat' : 'down'} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cbc.length > 0 && (
        <div className="sp-card">
          <div className="sp-card-header">
            <h3><Award size={16} /> CBC Competency Assessment</h3>
            <span className="sp-badge">{cbc.length} areas</span>
          </div>
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Competency Area</th>
                  <th>Level</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                {cbc.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.subject}</strong></td>
                    <td>{c.competency_area || '—'}</td>
                    <td>{c.competency_level || c.level || c.score || '—'}</td>
                    <td>
                      <span className="sp-grade-badge" style={{ background: getGradeBg(c.grade), color: getGradeColor(c.grade) }}>
                        {c.grade || c.band || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export function getGradeColor(g) {
  if (!g) return '#94a3b8'
  if (g.startsWith('EE')) return '#16a34a'
  if (g.startsWith('ME')) return '#2563eb'
  if (g.startsWith('AE')) return '#ca8a04'
  if (g.startsWith('BE')) return '#f97316'
  if (g.startsWith('DE')) return '#dc2626'
  if (g.startsWith('A')) return '#16a34a'
  if (g.startsWith('B')) return '#2563eb'
  if (g.startsWith('C')) return '#ca8a04'
  return '#dc2626'
}

export function getGradeBg(g) {
  if (!g) return '#f1f5f9'
  if (g.startsWith('EE')) return '#dcfce7'
  if (g.startsWith('ME')) return '#dbeafe'
  if (g.startsWith('AE')) return '#fef9c3'
  if (g.startsWith('BE')) return '#ffedd5'
  if (g.startsWith('DE')) return '#fef2f2'
  if (g.startsWith('A')) return '#dcfce7'
  if (g.startsWith('B')) return '#dbeafe'
  if (g.startsWith('C')) return '#fef9c3'
  return '#fef2f2'
}
