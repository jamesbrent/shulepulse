import { useState, useEffect } from 'react'
import { BarChart2, TrendingUp, TrendingDown, Minus, BookOpen, Award } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

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

  const avgScore = grades.length > 0
    ? Math.round(grades.reduce((s, g) => s + (g.total_score || 0), 0) / grades.length)
    : 0

  const bestSubject = grades.length > 0
    ? grades.reduce((best, g) => (g.total_score || 0) > (best?.total_score || 0) ? g : best, grades[0])
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
            <p className="asc-value">{grades.length}</p>
          </div>
        </div>
        <div className="att-sum-card amber">
          <Award size={20} />
          <div>
            <p className="asc-label">Best Subject</p>
            <p className="asc-value" style={{ fontSize: 16 }}>{bestSubject?.subject || '—'}</p>
          </div>
        </div>
        <div className="att-sum-card purple">
          <TrendingUp size={20} />
          <div>
            <p className="asc-label">Best Score</p>
            <p className="asc-value">{bestSubject ? `${Math.round(bestSubject.total_score)}%` : '—'}</p>
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
                  <th>Subject</th>
                  <th>CAT</th>
                  <th>Exam</th>
                  <th>Total</th>
                  <th>Grade</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {grades.map(g => (
                  <tr key={g.id}>
                    <td><strong>{g.subject}</strong></td>
                    <td>{g.cat_score}%</td>
                    <td>{g.exam_score}%</td>
                    <td><strong>{Math.round(g.total_score)}%</strong></td>
                    <td>
                      <span className={`grade-badge ${g.grade?.includes('A') ? 'a' : g.grade?.includes('B') || g.grade?.includes('C') ? 'b' : g.grade?.includes('D') || g.grade === 'E' ? 'c' : ''}`}>
                        {g.grade || g.cbe_band || '—'}
                      </span>
                    </td>
                    <td><TrendIcon value={g.total_score >= 70 ? 'up' : g.total_score >= 50 ? 'flat' : 'down'} /></td>
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
