import { useState, useEffect } from 'react'
import { BarChart2, TrendingUp, TrendingDown, Minus, BookOpen, Award } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { groupGradesBySubject, getCBEGrade } from '../../../components/students/ReportCard'

export default function AcademicResults({ activeChild, school }) {
  const [grades, setGrades] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (activeChild) fetchGrades()
  }, [activeChild])

  const fetchGrades = async () => {
    setLoading(true)
    const currentTerm = school?.current_term || 'Term 1'
    const currentYear = school?.current_year || new Date().getFullYear()

    const { data } = await supabase
      .from('grades')
      .select('*')
      .eq('student_id', activeChild.id)
      .eq('term', currentTerm)
      .eq('year', currentYear)
      .in('status', ['approved', 'published'])
      .order('created_at', { ascending: false })

    setGrades(data || [])
    setLoading(false)
  }

  const TrendIcon = ({ value }) => {
    if (value === 'up') return <TrendingUp size={16} className="trend up" />
    if (value === 'down') return <TrendingDown size={16} className="trend down" />
    return <Minus size={16} className="trend flat" />
  }

  const grouped = groupGradesBySubject(grades)
  const avgScore = grouped.overallAverage

  const bestSubject = grouped.subjects.length > 0
    ? grouped.subjects.reduce((best, s) => s.average > (best?.average || 0) ? s : best, grouped.subjects[0])
    : null

  if (loading) return <p className="loading-state">Loading results...</p>

  return (
    <div className="grades-page-view">
      <div className="att-summary" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="att-sum-card blue">
          <BarChart2 size={20} />
          <div>
            <p className="asc-label">Average Score</p>
            <p className="asc-value">{avgScore}%</p>
          </div>
        </div>
        <div className="att-sum-card green">
          <BookOpen size={20} />
          <div>
            <p className="asc-label">Subjects</p>
            <p className="asc-value">{grouped.totalSubjects}</p>
          </div>
        </div>
        <div className="att-sum-card amber">
          <Award size={20} />
          <div>
            <p className="asc-label">Best Subject</p>
            <p className="asc-value" style={{ fontSize: 16 }}>{bestSubject?.name || '—'}</p>
          </div>
        </div>
        <div className="att-sum-card purple">
          <TrendingUp size={20} />
          <div>
            <p className="asc-label">Best Score</p>
            <p className="asc-value">{bestSubject ? `${bestSubject.average}%` : '—'}</p>
          </div>
        </div>
      </div>

      {grades.length === 0 ? (
        <div className="empty-att">
          <BarChart2 size={40} color="#cbd5e1" />
          <p>No grades recorded yet this term</p>
          <span>Results appear here once teachers submit grades</span>
        </div>
      ) : (
        <div className="section-card">
          <div className="card-header">
            <h3>Performance Summary — {activeChild.full_name}</h3>
          </div>
          <div className="att-table-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Subject</th>
                  {grouped.examTypes.map(et => <th key={et}>{et}</th>)}
                  <th>Total /100</th>
                  <th>Level</th>
                </tr>
              </thead>
              <tbody>
                {grouped.subjects.map((sub, i) => {
                  const cbe = getCBEGrade(sub.average, activeChild?.class || '')
                  return (
                    <tr key={sub.name}>
                      <td>{i + 1}</td>
                      <td><strong>{sub.name}</strong></td>
                      {grouped.examTypes.map(et => {
                        const a = sub.assessments.find(x => x.name === et)
                        return <td key={et}>{a ? `${Math.round(a.rawMarks)}/${a.maxMarksRaw}` : '—'}</td>
                      })}
                      <td><strong>{Math.round(sub.average)}</strong></td>
                      <td>
                        <span className="grade-badge">{cbe.band || '—'}{cbe.points != null ? ` · ${cbe.points}pts` : ''}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
