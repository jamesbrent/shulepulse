import { useState, useEffect } from 'react'
import { FileText, BarChart2, Award, Printer, BookOpen, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import useStudentAcademicHistory from './useStudentAcademicHistory'
import AcademicFilters from './AcademicFilters'
import { groupGradesBySubject, getCBEGrade, gradeDisplay, ReportCard, fetchStudentComments } from '../../components/students/ReportCard'
import { rankStudentsByGrades, findRank } from '../../services/grading'

export default function ReportCardsPage({ student, school }) {
  const {
    terms, classes, termKey, setTermKey,
    selectedClass, setSelectedClass,
    grades, loading,
  } = useStudentAcademicHistory({ student, school })

  const [showCard, setShowCard] = useState(false)
  const [teacherComment, setTeacherComment] = useState('')
  const [classRank, setClassRank] = useState(null)

  const displayTerm = terms.find(t => `${t.year}|${t.term}` === termKey)
  const term = displayTerm?.term || 'Term 1'
  const year = displayTerm?.year || new Date().getFullYear()

  const grouped = groupGradesBySubject(grades)
  const avgScore = grouped.overallAverage
  const bestSubject = grouped.subjects.length > 0
    ? grouped.subjects.reduce((b, s) => s.average > (b?.average || 0) ? s : b, grouped.subjects[0])
    : null

  const studentForCard = student ? { ...student, class: selectedClass } : student

  useEffect(() => {
    let active = true
    const loadCardData = async () => {
      if (!student?.id || !school?.id || grades.length === 0) return
      const comment = await fetchStudentComments(school.id, student.id, term, year)
      if (active) setTeacherComment(comment)

      const { data: classmates } = await supabase
        .from('grades')
        .select('student_id, subject, total_score, max_marks, students(id, admission_number)')
        .eq('term', term)
        .eq('year', Number(year))
        .eq('class_name', selectedClass)
        .in('status', ['approved', 'published'])
      if (!active) return
      const ranked = rankStudentsByGrades(classmates || [], { scope: 'class' })
      setClassRank(findRank(ranked, student.id))
    }
    loadCardData()
    return () => { active = false }
  }, [student?.id, school?.id, term, year, selectedClass, grades.length])

  if (loading) return (
    <div className="sp-loading-container">
      <div className="sp-loading-spinner" />
      <p>Loading report cards...</p>
    </div>
  )

  const level = getCBEGrade(avgScore, selectedClass)
  const bandDisplay = gradeDisplay(level)

  return (
    <div className="sp-page">
      <div className="sp-page-meta">
        <span className="sp-badge">{term} {year} · {selectedClass || '—'}</span>
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
            <p className="sp-stat-label">Overall Average</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#f0fdf4', color: '#16a34a' }}><BookOpen size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#16a34a' }}>{grouped.totalSubjects}</p>
            <p className="sp-stat-label">Subjects</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#fefce8', color: '#ca8a04' }}><Award size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#ca8a04', fontSize: 15 }}>{bestSubject?.name || '—'}</p>
            <p className="sp-stat-label">Best Subject</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#f5f3ff', color: '#7c3aed' }}><TrendingUp size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#7c3aed', fontSize: 15 }}>{bandDisplay}</p>
            <p className="sp-stat-label">Performance Level</p>
          </div>
        </div>
      </div>

      <div className="sp-card">
        <div className="sp-card-header">
          <h3><BarChart2 size={16} /> Subject Performance — {selectedClass}</h3>
          <div className="sp-toolbar-right">
            <span className="sp-badge">{classRank ? `Rank ${classRank.rank}/${classRank.total}` : ''}</span>
            <button
              className="sp-btn-primary"
              onClick={() => setShowCard(true)}
              disabled={grades.length === 0}
            >
              <Printer size={15} /> View & Print Report Card
            </button>
          </div>
        </div>
        {grades.length === 0 ? (
          <div className="sp-empty-state">
            <FileText size={40} color="#94a3b8" />
            <p>No results recorded for {term} {year} in {selectedClass}</p>
          </div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Subject</th>
                  {grouped.examTypes.map(et => <th key={et}>{et}</th>)}
                  <th>Average</th>
                  <th>Level</th>
                  <th>Teacher</th>
                </tr>
              </thead>
              <tbody>
                {grouped.subjects.map((sub, i) => {
                  const g = getCBEGrade(sub.average, selectedClass)
                  return (
                    <tr key={sub.name}>
                      <td>{i + 1}</td>
                      <td><strong>{sub.name}</strong></td>
                      {grouped.examTypes.map(et => {
                        const a = sub.assessments.find(x => x.name === et)
                        return <td key={et}>{a ? `${Math.round(a.score)}%` : '—'}</td>
                      })}
                      <td><strong>{sub.average}%</strong></td>
                      <td>
                        <span className="sp-grade-badge" style={{ background: getGradeBg(g.grade || g.band), color: getGradeColor(g.grade || g.band) }}>
                          {gradeDisplay(g)}
                        </span>
                      </td>
                      <td>{sub.teacher || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCard && (
        <ReportCard
          student={studentForCard}
          grades={grades}
          school={school}
          term={term}
          year={year}
          classRank={classRank}
          teacherComment={teacherComment}
          onClose={() => setShowCard(false)}
        />
      )}
    </div>
  )
}

function getGradeColor(g) {
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

function getGradeBg(g) {
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
