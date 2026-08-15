import { useState, useEffect } from 'react'
import {
  ArrowLeft, Edit, Printer, MoreHorizontal, BarChart2, Clock,
  ShieldAlert, Users, Award, TrendingUp, TrendingDown, Minus,
  Calendar, User, Mail, Phone, BookOpen, MapPin, GraduationCap,
  MessageSquare, CheckCircle, AlertTriangle
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ReportCard, groupGradesBySubject, getCBEGrade } from '../../components/students/ReportCard'
import { weightedScoreMean, rankStudentsByGrades, findRank } from '../../services/grading'
import './StudentProfile.css'

export default function StudentProfile({ student, onBack, schoolId }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)

  const [grades, setGrades] = useState([])
  const [discipline, setDiscipline] = useState([])
  const [attendance, setAttendance] = useState([])
  const [comments, setComments] = useState([])
  const [timetable, setTimetable] = useState([])
  const [classRank, setClassRank] = useState(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [school, setSchool] = useState(null)

  useEffect(() => { fetchData() }, [student?.id])

  const fetchData = async () => {
    setLoading(true)
    const sid = student?.id
    if (!sid) { setLoading(false); return }

    const [gradesRes, discRes, attRes, commRes, ttRes, schoolRes] = await Promise.all([
      supabase.from('grades').select('*').eq('student_id', sid).order('year', { ascending: false }).order('term', { ascending: false }),
      supabase.from('discipline_records').select('*').eq('student_id', sid).order('date', { ascending: false }),
      supabase.from('attendance').select('date, status, notes').eq('student_id', sid).order('date', { ascending: false }).limit(100),
      supabase.from('teacher_comments').select('*, teachers(full_name)').eq('student_id', sid).order('created_at', { ascending: false }),
      supabase.from('timetable_slots').select('*, teachers(full_name), subjects(name)').eq('class_id', student.class_id).order('day_of_week').order('start_time'),
      supabase.from('schools').select('id, name, logo_url, motto').eq('id', schoolId).single(),
    ])

    setGrades(gradesRes.data || [])
    setDiscipline(discRes.data || [])
    setAttendance(attRes.data || [])
    setComments(commRes.data || [])
    setTimetable(ttRes.data || [])
    setSchool(schoolRes.data || null)

    // Class position from the CENTRAL ranking engine — scoped to the
    // learner's class for the latest term/year that has results.
    const allGrades = gradesRes.data || []
    const latest = allGrades[0]
    if (latest && student?.class) {
      const { data: classGrades } = await supabase
        .from('grades')
        .select('student_id, subject, total_score, max_marks, students(id, admission_number)')
        .eq('term', latest.term)
        .eq('year', latest.year)
        .eq('class_name', student.class)
        .in('status', ['approved', 'published'])
      const ranked = rankStudentsByGrades(classGrades || [], { scope: 'class' })
      setClassRank(findRank(ranked, sid))
    } else {
      setClassRank(null)
    }
    setLoading(false)
  }

  if (loading) return <div className="sp-loading">Loading profile...</div>

  // ── Computations ──
  const attPresent = attendance.filter(a => a.status === 'present' || a.status === 'late').length
  const attTotal = attendance.length
  const attRate = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : 0
  const attAbsent = attendance.filter(a => a.status === 'absent').length

  const gradesBySubject = {}
  grades.forEach(g => {
    if (!gradesBySubject[g.subject]) gradesBySubject[g.subject] = []
    gradesBySubject[g.subject].push(g)
  })

  const groupedData = groupGradesBySubject(grades)
  const avgPerformance = groupedData.overallAverage

  const totalDiscipline = discipline.length
  const openCases = discipline.filter(d => d.status === 'pending' || d.status === 'recorded').length
  const resolvedCases = discipline.filter(d => d.status === 'resolved').length

  // Class position from the central ranking engine (latest term, same class)
  const position = classRank ? `${classRank.rank} / ${classRank.total}` : '—'

  // Performance by term for chart
  const terms = [...new Set(grades.map(g => `${g.term} ${g.year}`))].slice(0, 6).reverse()
  const termAvgs = terms.map(t => {
    const [termName, yearStr] = t.split(' ')
    const termGrades = grades.filter(g => g.term === termName && String(g.year) === yearStr)
    return { term: t, avg: termGrades.length > 0 ? Math.round(weightedScoreMean(termGrades)) : 0 }
  })

  // Subject averages for current term
  const currentTermGrades = grades.filter(g => g.term && g.year)
  const latestTerm = currentTermGrades[0]
  const latestTermName = latestTerm?.term
  const latestYear = latestTerm?.year
  const subjectTable = groupedData.subjects.map(sub => {
    const cbe = getCBEGrade(sub.average, student?.class || '')
    return {
      subject: sub.name,
      average: sub.average,
      total: Math.round(sub.totalScore),
      maxTotal: sub.maxTotal,
      grade: cbe.band || cbe.grade || '—',
      performanceLevel: cbe.label || '—',
    }
  }).sort((a, b) => (b.average ?? 0) - (a.average ?? 0))

  // Days absent
  const daysAbsent = attendance.filter(a => a.status === 'absent').length

  // Recent attendance
  const recentAttendance = attendance.slice(0, 20)

  const getGradeBadge = (grade) => {
    const g = (grade || '').toUpperCase()
    if (g.startsWith('A')) return 'green'
    if (g.startsWith('B')) return 'blue'
    if (g.startsWith('C')) return 'amber'
    if (g.startsWith('D') || g.startsWith('E')) return 'red'
    return 'gray'
  }

  const getPerfColor = (v) => {
    if (v >= 80) return '#16a34a'
    if (v >= 60) return '#2563eb'
    if (v >= 40) return '#ca8a04'
    return '#dc2626'
  }

  const getAttColor = (r) => {
    if (r >= 90) return '#16a34a'
    if (r >= 75) return '#ca8a04'
    return '#dc2626'
  }

  const initials = student.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '??'

  // Timetable by day
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const ttByDay = {}
  days.forEach(d => { ttByDay[d] = timetable.filter(t => t.day_of_week === d) })

  return (
    <div className="sp-overlay">
      <div className="sp-container">
        <button className="sp-back" onClick={onBack}><ArrowLeft size={14} /> Back to Students</button>

        {/* ── Header ── */}
        <div className="sp-header">
          <div className="sp-header-left">
            <div className="sp-avatar">{initials}</div>
            <div className="sp-header-info">
              <h1 className="sp-name">{student.full_name}</h1>
              <div className="sp-meta">
                <span>{student.admission_number || '—'}</span>
                <span className="sp-meta-dot">·</span>
                <span>{student.class || '—'}</span>
                {student.stream && <><span className="sp-meta-dot">·</span><span>{student.stream}</span></>}
                <span className="sp-meta-dot">·</span>
                <span>{new Date().getFullYear()}</span>
                <span className="sp-meta-dot">·</span>
                <span className={`sp-active-badge ${student.status !== 'active' ? 'sp-active-badge--inactive' : ''}`}>
                  {student.status || 'Active'}
                </span>
              </div>
            </div>
          </div>
          <div className="sp-header-actions">
            <button className="sp-hdr-btn sp-hdr-btn--primary"><Edit size={13} /> Edit</button>
            <button className="sp-hdr-btn sp-hdr-btn--ghost" onClick={() => window.print()}><Printer size={13} /> Print</button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="sp-kpi-row">
          <div className="sp-kpi">
            <div className="sp-kpi-icon sp-kpi-icon--purple"><BarChart2 size={16} /></div>
            <div className="sp-kpi-info">
              <p className="sp-kpi-label">Avg Performance</p>
              <p className="sp-kpi-value">{avgPerformance}%</p>
            </div>
          </div>
          <div className="sp-kpi">
            <div className="sp-kpi-icon sp-kpi-icon--green"><Clock size={16} /></div>
            <div className="sp-kpi-info">
              <p className="sp-kpi-label">Attendance Rate</p>
              <p className="sp-kpi-value">{attRate}%</p>
            </div>
          </div>
          <div className="sp-kpi">
            <div className="sp-kpi-icon sp-kpi-icon--amber"><AlertTriangle size={16} /></div>
            <div className="sp-kpi-info">
              <p className="sp-kpi-label">Days Absent</p>
              <p className="sp-kpi-value">{daysAbsent}</p>
            </div>
          </div>
          <div className="sp-kpi">
            <div className="sp-kpi-icon sp-kpi-icon--red"><ShieldAlert size={16} /></div>
            <div className="sp-kpi-info">
              <p className="sp-kpi-label">Discipline Cases</p>
              <p className="sp-kpi-value">{totalDiscipline}</p>
            </div>
          </div>
          <div className="sp-kpi">
            <div className="sp-kpi-icon sp-kpi-icon--blue"><Users size={16} /></div>
            <div className="sp-kpi-info">
              <p className="sp-kpi-label">Class Position</p>
              <p className="sp-kpi-value">{position}</p>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="sp-tabs">
          {['overview', 'performance', 'attendance', 'discipline', 'comments', 'timetable'].map(tab => (
            <button key={tab} className={`sp-tab ${activeTab === tab ? 'sp-tab--active' : ''}`} onClick={() => setActiveTab(tab)}>
              {tab === 'overview' && 'Overview'}
              {tab === 'performance' && 'Academic Performance'}
              {tab === 'attendance' && 'Attendance'}
              {tab === 'discipline' && 'Discipline'}
              {tab === 'comments' && 'Comments'}
              {tab === 'timetable' && 'Timetable'}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div className="sp-tab-content">

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="sp-2col">
              <div className="sp-info-card">
                <h3 className="sp-info-title">Student Information</h3>
                {[
                  ['Full Name', student.full_name],
                  ['Admission No.', student.admission_number],
                  ['Gender', student.gender],
                  ['Date of Birth', student.date_of_birth],
                  ['Grade', student.class],
                  ['Stream', student.stream || 'Unassigned'],
                  ['Academic Year', new Date().getFullYear()],
                  ['Enrollment Date', student.created_at ? new Date(student.created_at).toLocaleDateString() : '—'],
                  ['Status', student.status || 'Active'],
                ].map(([label, value]) => (
                  <div className="sp-info-row" key={label}>
                    <span className="sp-info-label">{label}</span>
                    <span className="sp-info-value">{value || '—'}</span>
                  </div>
                ))}
              </div>
              <div className="sp-info-card">
                <h3 className="sp-info-title">Parent / Guardian</h3>
                {[
                  ['Guardian Name', student.parent_name],
                  ['Relationship', student.parent_relationship],
                  ['Phone', student.parent_phone],
                  ['Email', student.parent_email],
                  ['Address', student.home_address],
                ].map(([label, value]) => (
                  <div className="sp-info-row" key={label}>
                    <span className="sp-info-label">{label}</span>
                    <span className="sp-info-value">{value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PERFORMANCE TAB */}
          {activeTab === 'performance' && (
            <div>
              <div className="sp-perf-summary">
                <div className="sp-perf-stat">
                  <p className="sp-perf-stat-label">Overall Average</p>
                  <p className="sp-perf-stat-value">{avgPerformance}%</p>
                </div>
                <div className="sp-perf-stat">
                  <p className="sp-perf-stat-label">Class Position</p>
                  <p className="sp-perf-stat-value">{position}</p>
                </div>
                <div className="sp-perf-stat">
                  <p className="sp-perf-stat-label">Total Subjects</p>
                  <p className="sp-perf-stat-value">{Object.keys(gradesBySubject).length}</p>
                </div>
                <div className="sp-perf-stat">
                  <p className="sp-perf-stat-label">Total Records</p>
                  <p className="sp-perf-stat-value">{grades.length}</p>
                </div>
              </div>

              {termAvgs.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h4 className="sp-section-title">Performance Trend</h4>
                  <div className="sp-chart">
                    {termAvgs.map(t => (
                      <div key={t.term} className="sp-chart-bar-wrap">
                        <span className="sp-chart-value">{t.avg}%</span>
                        <div className="sp-chart-bar" style={{ height: `${Math.max(t.avg, 8)}%`, background: getPerfColor(t.avg) }} />
                        <span className="sp-chart-label">{t.term}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <h4 className="sp-section-title">Subject Performance ({latestTermName} {latestYear})</h4>
              <button className="sp-btn-ghost sm" onClick={() => setShowTranscript(true)}>
                <Printer size={14} /> Print Transcript
              </button>
              {subjectTable.length === 0 ? (
                <div className="sp-empty"><h4>No academic records</h4><p>Grades will appear once recorded</p></div>
              ) : (
                <div className="sp-table-wrap">
                  <table className="sp-table">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Average</th>
                        <th>Grade</th>
                        <th>Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectTable.map(s => (
                        <tr key={s.subject}>
                          <td style={{ fontWeight: 500 }}>{s.subject}</td>
                          <td>
                            {s.average != null ? (
                              <span style={{ fontWeight: 600 }}>{s.average}%</span>
                            ) : '—'}
                          </td>
                          <td>
                            <span className={`sp-badge sp-badge--${getGradeBadge(s.grade)}`}>{s.grade}</span>
                          </td>
                          <td>
                            {s.trend === 'up' && <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: 2 }}><TrendingUp size={14} /></span>}
                            {s.trend === 'down' && <span style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 2 }}><TrendingDown size={14} /></span>}
                            {s.trend === 'same' && <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 2 }}><Minus size={14} /></span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ATTENDANCE TAB */}
          {activeTab === 'attendance' && (
            <div>
              <div className="sp-att-grid">
                {[
                  ['Attendance Rate', `${attRate}%`, attRate >= 90],
                  ['Present', attPresent, false],
                  ['Absent', attAbsent, false],
                  ['Late', attendance.filter(a => a.status === 'late').length, false],
                  ['Excused', attendance.filter(a => a.status === 'excused').length, false],
                ].map(([label, value, isActive]) => (
                  <div key={label} className={`sp-att-stat ${isActive ? 'sp-att-stat--active' : ''}`}>
                    <p className="sp-att-stat-label">{label}</p>
                    <p className="sp-att-stat-value" style={isActive ? { color: '#16a34a' } : {}}>{value}</p>
                  </div>
                ))}
              </div>

              <h4 className="sp-section-title">Recent Attendance Records</h4>
              {recentAttendance.length === 0 ? (
                <div className="sp-empty"><h4>No attendance records</h4><p>Attendance will appear once marked</p></div>
              ) : (
                <div className="sp-table-wrap">
                  <table className="sp-table">
                    <thead>
                      <tr><th>Date</th><th>Status</th><th>Notes</th></tr>
                    </thead>
                    <tbody>
                      {recentAttendance.map((a, i) => (
                        <tr key={i}>
                          <td>{a.date || '—'}</td>
                          <td>
                            <span className={`sp-badge sp-badge--${a.status === 'present' ? 'green' : a.status === 'absent' ? 'red' : a.status === 'late' ? 'amber' : 'gray'}`}>
                              {a.status || '—'}
                            </span>
                          </td>
                          <td style={{ color: '#64748b', fontSize: 12 }}>{a.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* DISCIPLINE TAB */}
          {activeTab === 'discipline' && (
            <div>
              <div className="sp-disc-grid">
                <div className="sp-disc-stat">
                  <p className="sp-disc-stat-value">{totalDiscipline}</p>
                  <p className="sp-disc-stat-label">Total Cases</p>
                </div>
                <div className="sp-disc-stat">
                  <p className="sp-disc-stat-value" style={{ color: '#ca8a04' }}>{openCases}</p>
                  <p className="sp-disc-stat-label">Open Cases</p>
                </div>
                <div className="sp-disc-stat">
                  <p className="sp-disc-stat-value" style={{ color: '#16a34a' }}>{resolvedCases}</p>
                  <p className="sp-disc-stat-label">Resolved</p>
                </div>
              </div>

              {discipline.length === 0 ? (
                <div className="sp-empty">
                  <ShieldAlert size={32} color="#cbd5e1" />
                  <h4>No discipline records</h4>
                  <p>This student currently has no recorded discipline cases.</p>
                </div>
              ) : (
                <div className="sp-table-wrap">
                  <table className="sp-table">
                    <thead>
                      <tr><th>Date</th><th>Incident</th><th>Action Taken</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {discipline.map(d => (
                        <tr key={d.id}>
                          <td>{d.date || d.created_at?.split('T')[0] || '—'}</td>
                          <td>{d.offense || d.offence || '—'}</td>
                          <td>{d.action_taken || d.action || '—'}</td>
                          <td>
                            <span className={`sp-badge sp-badge--${d.status === 'resolved' ? 'green' : d.status === 'pending' ? 'amber' : 'red'}`}>
                              {d.status || 'recorded'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* COMMENTS TAB */}
          {activeTab === 'comments' && (
            <div>
              {comments.length === 0 ? (
                <div className="sp-empty">
                  <MessageSquare size={32} color="#cbd5e1" />
                  <h4>No comments yet</h4>
                  <p>Teacher comments will appear here once added.</p>
                </div>
              ) : (
                comments.map(c => {
                  const teacherInitials = c.teachers?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'T'
                  return (
                    <div className="sp-comment" key={c.id}>
                      <div className="sp-comment-avatar">{teacherInitials}</div>
                      <div className="sp-comment-body">
                        <p className="sp-comment-meta">
                          <span className="sp-comment-name">{c.teachers?.full_name || 'Teacher'}</span>
                          <span>·</span>
                          <span>{c.term} {c.year}</span>
                          {c.created_at && <><span>·</span><span>{new Date(c.created_at).toLocaleDateString()}</span></>}
                        </p>
                        <p className="sp-comment-text">"{c.comment}"</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* TIMETABLE TAB */}
          {activeTab === 'timetable' && (
            <div>
              {timetable.length === 0 ? (
                <div className="sp-empty">
                  <Calendar size={32} color="#cbd5e1" />
                  <h4>No timetable available</h4>
                  <p>Timetable will appear once assigned to this class.</p>
                </div>
              ) : (
                days.map(day => (
                  ttByDay[day].length > 0 && (
                    <div className="sp-tt-row" key={day}>
                      <div className="sp-tt-day">{day.slice(0, 3)}</div>
                      <div className="sp-tt-slots">
                        {ttByDay[day].map(slot => (
                          <div className="sp-tt-slot" key={slot.id}>
                            <span className="sp-tt-time">{slot.start_time} – {slot.end_time}</span>
                            <span className="sp-tt-subject">{slot.subjects?.name || '—'}</span>
                            <span className="sp-tt-teacher">{slot.teachers?.full_name || ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ))
              )}
            </div>
          )}

        </div>
      </div>
      {showTranscript && (
        <ReportCard
          student={student}
          grades={grades}
          school={school}
          term={student?.term || 'Term 2'}
          year={student?.year || new Date().getFullYear()}
          classRank={classRank}
          teacherComment={comments.length > 0 ? comments[0].comment : ''}
          onClose={() => setShowTranscript(false)}
        />
      )}
    </div>
  )
}
