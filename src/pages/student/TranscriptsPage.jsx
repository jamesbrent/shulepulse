import { useState, useEffect } from 'react'
import { ScrollText, BarChart2, Award, BookOpen, TrendingUp, Calendar, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import useStudentAcademicHistory from './useStudentAcademicHistory'
import AcademicFilters from './AcademicFilters'
import TranscriptDocument from './TranscriptDocument'
import { groupGradesBySubject, getCBEGrade, gradeDisplay } from '../../components/students/ReportCard'

const TERM_ORDER = { 'Term 1': 1, 'Term 2': 2, 'Term 3': 3 }

export default function TranscriptsPage({ student, school }) {
  const {
    terms, classes, termKey, setTermKey,
    selectedClass, setSelectedClass,
    grades, cbc, loading,
  } = useStudentAcademicHistory({ student, school })

  const [history, setHistory] = useState([])
  const [allGrades, setAllGrades] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [showTranscript, setShowTranscript] = useState(false)

  const displayTerm = terms.find(t => `${t.year}|${t.term}` === termKey)
  const term = displayTerm?.term || 'Term 1'
  const year = displayTerm?.year || new Date().getFullYear()

  useEffect(() => {
    let active = true
    setHistoryLoading(true)
    const load = async () => {
      if (!student?.id) { setHistoryLoading(false); return }
      const { data } = await supabase
        .from('grades')
        .select('*')
        .eq('student_id', student.id)
        .in('status', ['approved', 'published'])
        .order('year', { ascending: false })
        .order('term', { ascending: false })
        .order('subject')
      if (!active) return
      setAllGrades(data || [])
      const map = {}
      ;(data || []).forEach(g => {
        const key = `${g.year}|${g.term}|${g.class_name || ''}`
        if (!map[key]) {
          map[key] = { term: g.term, year: g.year, class: g.class_name || '', rows: [] }
        }
        map[key].rows.push(g)
      })
      const list = Object.values(map).sort((a, b) =>
        (Number(b.year) - Number(a.year)) ||
        ((TERM_ORDER[a.term] || 0) - (TERM_ORDER[b.term] || 0)) ||
        (a.class || '').localeCompare(b.class || '')
      ).map(entry => {
        const grouped = groupGradesBySubject(entry.rows)
        const avg = grouped.overallAverage
        const level = getCBEGrade(avg, entry.class)
        return {
          ...entry,
          avg,
          subjects: grouped.totalSubjects,
          level: gradeDisplay(level),
          best: grouped.subjects.length > 0
            ? grouped.subjects.reduce((b, s) => s.average > (b?.average || 0) ? s : b, grouped.subjects[0])
            : null,
        }
      })
      setHistory(list)
      setHistoryLoading(false)
    }
    load()
    return () => { active = false }
  }, [student?.id])

  const selectedGrouped = groupGradesBySubject(grades)
  const avgScore = selectedGrouped.overallAverage
  const totalRecorded = allGrades.length

  if (loading || (historyLoading && history.length === 0)) return (
    <div className="sp-loading-container">
      <div className="sp-loading-spinner" />
      <p>Loading transcripts...</p>
    </div>
  )

  return (
    <div className="sp-page">
      <div className="sp-page-meta">
        <span className="sp-badge">{totalRecorded} records · {history.length} term{history.length !== 1 ? 's' : ''}</span>
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

      <div className="sp-stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#eff6ff', color: '#2563eb' }}><BarChart2 size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#2563eb' }}>{avgScore}%</p>
            <p className="sp-stat-label">Selected Term Avg</p>
            <p className="sp-stat-sub">{term} {year} · {selectedClass || '—'}</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#f0fdf4', color: '#16a34a' }}><BookOpen size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#16a34a' }}>{selectedGrouped.totalSubjects}</p>
            <p className="sp-stat-label">Subjects (term)</p>
            <p className="sp-stat-sub">{grades.length} assessments</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#fefce8', color: '#ca8a04' }}><Calendar size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#ca8a04' }}>{history.length}</p>
            <p className="sp-stat-label">Terms Recorded</p>
            <p className="sp-stat-sub">Across all classes</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#f5f3ff', color: '#7c3aed' }}><Award size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#7c3aed' }}>{cbc.length}</p>
            <p className="sp-stat-label">CBC (term)</p>
            <p className="sp-stat-sub">Competency areas</p>
          </div>
        </div>
      </div>

      <div className="sp-card">
        <div className="sp-card-header">
          <h3><TrendingUp size={16} /> Academic History</h3>
          <div className="sp-toolbar-right">
            <span className="sp-badge">{history.length} entries</span>
            <button
              className="sp-btn-primary"
              onClick={() => setShowTranscript(true)}
              disabled={grades.length === 0}
            >
              <Printer size={15} /> Print / Download Transcript PDF
            </button>
          </div>
        </div>
        {history.length === 0 ? (
          <div className="sp-empty-state">
            <ScrollText size={40} color="#94a3b8" />
            <p>No academic records available yet</p>
          </div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Class</th>
                  <th>Subjects</th>
                  <th>Average</th>
                  <th>Level</th>
                  <th>Best Subject</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className={h.term === term && String(h.year) === String(year) && h.class === selectedClass ? 'sp-row-current' : ''}>
                    <td><strong>{h.term} {h.year}</strong></td>
                    <td>{h.class || '—'}</td>
                    <td>{h.subjects}</td>
                    <td><strong>{h.avg}%</strong></td>
                    <td>
                      <span className="sp-grade-badge" style={{ background: getGradeBg(h.level), color: getGradeColor(h.level) }}>
                        {h.level}
                      </span>
                    </td>
                    <td>{h.best ? `${h.best.name} (${h.best.average}%)` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {grades.length > 0 && (
        <div className="sp-card">
          <div className="sp-card-header">
            <h3><BarChart2 size={16} /> Detailed Results — {term} {year} · {selectedClass}</h3>
          </div>
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Exam Type</th>
                  <th>Total</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                {grades.map(g => (
                  <tr key={g.id}>
                    <td><strong>{g.subject}</strong></td>
                    <td>{g.exam_type || 'Assessment'}</td>
                    <td>{Math.round(g.total_score || 0)}%</td>
                    <td>
                      <span className="sp-grade-badge" style={{ background: getGradeBg(g.grade), color: getGradeColor(g.grade) }}>
                        {g.grade || g.cbe_band || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showTranscript && (
        <TranscriptDocument
          student={student}
          school={school}
          term={term}
          year={year}
          className={selectedClass || student?.class}
          grades={grades}
          onClose={() => setShowTranscript(false)}
        />
      )}
    </div>
  )
}

function getGradeColor(g) {
  if (!g) return '#94a3b8'
  if (g.startsWith('AE')) return '#ca8a04'
  if (g.startsWith('A') || g.startsWith('E')) return '#16a34a'
  if (g.startsWith('B') || g.startsWith('M')) return '#2563eb'
  if (g.startsWith('C')) return '#ca8a04'
  return '#dc2626'
}

function getGradeBg(g) {
  if (!g) return '#f1f5f9'
  if (g.startsWith('AE')) return '#fef9c3'
  if (g.startsWith('A') || g.startsWith('E')) return '#dcfce7'
  if (g.startsWith('B') || g.startsWith('M')) return '#dbeafe'
  if (g.startsWith('C')) return '#fef9c3'
  return '#fef2f2'
}
