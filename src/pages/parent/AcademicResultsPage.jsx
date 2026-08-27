import { useState, useEffect } from 'react'
import { BarChart2, TrendingUp, TrendingDown, Minus, BookOpen, Award } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { groupGradesBySubject, getCBEGrade, ReportCard, fetchStudentComments } from '../../components/students/ReportCard'
import { rankStudentsByGrades, findRank } from '../../services/grading'

export default function AcademicResultsPage({ activeChild }) {
  const [grades, setGrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [school, setSchool] = useState(null)
  const [activeTab, setActiveTab] = useState('results')
  const [showTranscript, setShowTranscript] = useState(false)
  const [transcriptComment, setTranscriptComment] = useState('')
  const [transcriptClassRank, setTranscriptClassRank] = useState(null)

  const openTranscript = async () => {
    setTranscriptClassRank(null)
    if (school?.id && activeChild?.id && activeChild?.class) {
      const term = school.current_term || 'Term 1'
      const year = school.current_year || new Date().getFullYear()
      const { data: clsGrades } = await supabase
        .from('grades')
        .select('student_id, subject, total_score, max_marks, students(id, admission_number)')
        .eq('school_id', school.id)
        .eq('term', term)
        .eq('year', year)
        .eq('class_name', activeChild.class)
      setTranscriptClassRank(findRank(
        rankStudentsByGrades(clsGrades || [], { scope: 'class' }),
        activeChild.id
      ))
    }
    setShowTranscript(true)
  }

  useEffect(() => {
    if (activeChild) fetchGrades()
  }, [activeChild])

  const fetchGrades = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()

    if (profile?.schools) setSchool(profile.schools)

    const currentTerm = profile?.schools?.current_term || 'Term 1'
    const currentYear = profile?.schools?.current_year || new Date().getFullYear()

    const { data } = await supabase
      .from('grades')
      .select('*')
      .eq('student_id', activeChild.id)
      .eq('term', currentTerm)
      .eq('year', currentYear)
      .order('created_at', { ascending: false })

    setGrades(data || [])

    const comment = await fetchStudentComments(profile?.school_id, activeChild.id, currentTerm, currentYear)
    setTranscriptComment(comment)

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

  if (!activeChild) {
    return (
      <div className="empty-att">
        <BarChart2 size={40} color="#cbd5e1" />
        <p>Select a child to view results</p>
      </div>
    )
  }

  return (
    <div className="grades-page-view">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'results', label: 'Results' },
          { key: 'transcript', label: 'Transcript' },
        ].map(t => (
          <button key={t.key}
            className={`btn-secondary ${activeTab === t.key ? 'btn-primary' : ''}`}
            style={{ padding: '6px 16px', fontSize: 13 }}
            onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
        {activeTab === 'results' && (
          <button className="btn-secondary" style={{ marginLeft: 'auto', padding: '6px 16px', fontSize: 13 }} onClick={openTranscript}>
            Print Full Transcript
          </button>
        )}
      </div>

      {activeTab === 'results' && (
        <>
          <div className="att-summary">
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
                <h3>Subject Performance — {activeChild.full_name}</h3>
              </div>
              <div className="att-table-wrap">
                <table className="att-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Subject</th>
                      {grouped.examTypes.map(et => <th key={et}>{et}</th>)}
                      <th>Average</th>
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
                            return <td key={et}>{a ? `${Math.round(a.score)}%` : '—'}</td>
                          })}
                          <td><strong>{sub.average}%</strong></td>
                          <td><span className="grade-badge">{cbe.band || cbe.grade || '—'}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'transcript' && (
        <div className="section-card">
          <div className="card-header">
            <h3>Full Transcript — {activeChild.full_name}</h3>
          </div>
          <div style={{ padding: 16 }}>
            <p style={{ fontSize: 13, color: '#64748b' }}>View and print the complete academic transcript.</p>
            <button className="btn-primary" onClick={openTranscript} style={{ marginTop: 12 }}>
              Open Full Transcript
            </button>
          </div>
        </div>
      )}

      {showTranscript && (
        <ReportCard
          student={activeChild}
          grades={grades}
          school={school}
          term={grades[0]?.term || 'Term 1'}
          year={grades[0]?.year || new Date().getFullYear()}
          classRank={transcriptClassRank}
          teacherComment={transcriptComment}
          onClose={() => setShowTranscript(false)}
        />
      )}
    </div>
  )
}
