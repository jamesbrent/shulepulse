import { useState, useEffect, useRef } from 'react'
import {
  Users, Search, Eye, X, AlertTriangle, ShieldAlert,
  BookOpen, BarChart2, ChevronRight, ArrowUpDown,
  ChevronLeft, MoreHorizontal, FileText, Activity,
  RefreshCw, Clock, TrendingUp, UserCheck, UserX
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import StudentProfile from './StudentProfile'
import { weightedScoreMean, marksCell } from '../../services/grading'
import './Students.css'

const ROWS_PER_PAGE = 15

export default function Students() {
  const { profile } = useAuthStore()
  const [students, setStudents] = useState([])
  const [disciplineCounts, setDisciplineCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterStream, setFilterStream] = useState('')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentDiscipline, setStudentDiscipline] = useState([])
  const [studentGrades, setStudentGrades] = useState([])
  const [studentAvg, setStudentAvg] = useState({})
  const [studentAttendance, setStudentAttendance] = useState({})
  const [showModal, setShowModal] = useState(false)
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [openDropdown, setOpenDropdown] = useState(null)
  const [profileStudent, setProfileStudent] = useState(null)
  const dropdownRef = useRef(null)

  useEffect(() => {
    fetchStudents()
  }, [profile?.school_id])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchStudents = async () => {
    setLoading(true)
    const [studentsRes, gradesRes, attendanceRes] = await Promise.all([
      supabase
        .from('students')
        .select('*')
        .eq('school_id', profile.school_id)
        .order('full_name'),
      supabase
        .from('grades')
        .select('student_id, total_score, max_marks')
        .eq('school_id', profile.school_id),
      supabase
        .from('attendance')
        .select('student_id, status')
        .eq('school_id', profile.school_id),
    ])

    const studentsList = studentsRes.data || []
    setStudents(studentsList)

    // Compute grades average per student (weighted by assessment max_marks)
    const gradesByStudent = {}
    for (const g of gradesRes.data || []) {
      if (!gradesByStudent[g.student_id]) gradesByStudent[g.student_id] = []
      if (g.total_score != null) gradesByStudent[g.student_id].push(g)
    }
    const avgByStudent = {}
    for (const [sid, rows] of Object.entries(gradesByStudent)) {
      avgByStudent[sid] = Math.round(weightedScoreMean(rows))
    }
    setStudentAvg(avgByStudent)

    // Compute attendance rate per student
    const attByStudent = {}
    for (const a of attendanceRes.data || []) {
      if (!attByStudent[a.student_id]) attByStudent[a.student_id] = { present: 0, total: 0 }
      attByStudent[a.student_id].total++
      if (a.status === 'present' || a.status === 'late') attByStudent[a.student_id].present++
    }
    const attRateByStudent = {}
    for (const [sid, data] of Object.entries(attByStudent)) {
      attRateByStudent[sid] = data.total > 0 ? Math.round((data.present / data.total) * 100) : null
    }
    setStudentAttendance(attRateByStudent)

    // Compute discipline counts
    const counts = {}
    const promises = studentsList.map(async (student) => {
      const { count } = await supabase
        .from('discipline_records')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', student.id)
      counts[student.id] = count || 0
    })

    await Promise.all(promises)
    setDisciplineCounts(counts)
    setLoading(false)
  }

  const viewDiscipline = async (student) => {
    setSelectedStudent(student)
    setShowModal(true)
    setOpenDropdown(null)
    setStudentDiscipline([])
    setStudentGrades([])

    const [discRes, gradesRes] = await Promise.all([
      supabase
        .from('discipline_records')
        .select('*')
        .eq('student_id', student.id)
        .order('date', { ascending: false }),
      supabase
        .from('grades')
        .select('*')
        .eq('student_id', student.id)
        .order('year', { ascending: false })
        .order('term', { ascending: false }),
    ])

    setStudentDiscipline(discRes.data || [])
    setStudentGrades(gradesRes.data || [])
  }

  const viewPerformance = (student) => {
    setProfileStudent(student)
    setOpenDropdown(null)
  }

  const classes = [...new Set(students.map(s => s.class).filter(Boolean))].sort()
  const streams = [...new Set(students.map(s => s.stream).filter(Boolean))].sort()

  const filtered = students.filter(s => {
    if (filterClass && s.class !== filterClass) return false
    if (filterStream && s.stream !== filterStream) return false
    if (search) {
      const q = search.toLowerCase()
      if (!s.full_name?.toLowerCase().includes(q) && !s.admission_number?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    switch (sortBy) {
      case 'name':
        cmp = (a.full_name || '').localeCompare(b.full_name || '')
        break
      case 'class':
        cmp = (a.class || '').localeCompare(b.class || '')
        break
      case 'discipline':
        cmp = (disciplineCounts[a.id] || 0) - (disciplineCounts[b.id] || 0)
        break
      case 'performance':
        cmp = (studentAvg[a.id] ?? -1) - (studentAvg[b.id] ?? -1)
        break
      case 'attendance':
        cmp = (studentAttendance[a.id] ?? -1) - (studentAttendance[b.id] ?? -1)
        break
      default:
        cmp = 0
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalPages = Math.ceil(sorted.length / ROWS_PER_PAGE)
  const paginated = sorted.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  const handleSort = (key) => {
    if (sortBy === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  // ── KPI Calculations ──
  const totalStudents = students.length
  const totalDiscipline = Object.values(disciplineCounts).reduce((a, b) => a + b, 0)
  const withCases = students.filter(s => (disciplineCounts[s.id] || 0) > 0).length
  const noCases = totalStudents - withCases
  const avgPerformances = Object.values(studentAvg).filter(v => v != null)
  const avgPerformance = avgPerformances.length > 0
    ? Math.round(avgPerformances.reduce((a, b) => a + b, 0) / avgPerformances.length)
    : 0
  const avgAttendances = Object.values(studentAttendance).filter(v => v != null)
  const avgAttendance = avgAttendances.length > 0
    ? Math.round(avgAttendances.reduce((a, b) => a + b, 0) / avgAttendances.length)
    : 0
  const studentsPerformingWell = avgPerformances.filter(v => v >= 70).length
  const studentsNeedingAttention = avgPerformances.filter(v => v < 60).length

  // ── Breakdown by Class ──
  const classGroups = {}
  for (const s of students) {
    const cls = s.class || 'Unknown'
    if (!classGroups[cls]) classGroups[cls] = []
    classGroups[cls].push(s)
  }
  const classPerformance = Object.entries(classGroups).map(([cls, studs]) => {
    const avgs = studs.map(s => studentAvg[s.id]).filter(v => v != null)
    const avg = avgs.length > 0 ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : 0
    const attRates = studs.map(s => studentAttendance[s.id]).filter(v => v != null)
    const att = attRates.length > 0 ? Math.round(attRates.reduce((a, b) => a + b, 0) / attRates.length) : 0
    const disc = studs.reduce((sum, s) => sum + (disciplineCounts[s.id] || 0), 0)
    return { cls, count: studs.length, avg, att, disc }
  }).sort((a, b) => a.cls.localeCompare(b.cls))

  const getPerfLevel = (avg) => {
    if (avg == null) return null
    if (avg >= 80) return { label: 'Excellent', cls: 'excellent' }
    if (avg >= 60) return { label: 'Good', cls: 'good' }
    if (avg >= 40) return { label: 'Needs Attention', cls: 'low' }
    return { label: 'Critical', cls: 'critical' }
  }

  const getPerfColor = (avg) => {
    if (avg == null) return '#94a3b8'
    if (avg >= 80) return '#16a34a'
    if (avg >= 60) return '#2563eb'
    if (avg >= 40) return '#ca8a04'
    return '#dc2626'
  }

  const getAttColor = (rate) => {
    if (rate == null) return '#94a3b8'
    if (rate >= 90) return '#16a34a'
    if (rate >= 75) return '#ca8a04'
    return '#dc2626'
  }

  if (loading) return <div className="da-loading-state">Loading students...</div>

  return (
    <div>
      {/* ── KPI Summary Cards ── */}
      <div className="std-summary">
        <div className="std-sum-card">
          <div className="std-sum-icon std-sum-icon--blue"><Users size={20} /></div>
          <div className="std-sum-info">
            <p className="std-sum-label">Total Students</p>
            <p className="std-sum-value">{totalStudents}</p>
          </div>
        </div>
        <div className="std-sum-card">
          <div className="std-sum-icon std-sum-icon--purple"><BarChart2 size={20} /></div>
          <div className="std-sum-info">
            <p className="std-sum-label">Avg Performance</p>
            <p className="std-sum-value">{avgPerformance}%</p>
          </div>
        </div>
        <div className="std-sum-card">
          <div className="std-sum-icon std-sum-icon--red"><ShieldAlert size={20} /></div>
          <div className="std-sum-info">
            <p className="std-sum-label">Discipline Cases</p>
            <p className="std-sum-value">{totalDiscipline}</p>
          </div>
        </div>
        <div className="std-sum-card">
          <div className="std-sum-icon std-sum-icon--green"><Clock size={20} /></div>
          <div className="std-sum-info">
            <p className="std-sum-label">Avg Attendance</p>
            <p className="std-sum-value">{avgAttendance}%</p>
          </div>
        </div>
      </div>

      {/* ── Performance Overview ── */}
      <div className="std-overview-card">
        <h3 className="std-overview-title">Performance Overview</h3>
        <div className="std-overview-row">
          <div className="std-overview-metric">
            <div className="std-ov-icon std-ov-icon--purple"><BarChart2 size={16} /></div>
            <div>
              <p className="std-ov-label">Avg. Performance</p>
              <p className="std-ov-value">{avgPerformance}%</p>
            </div>
          </div>
          <div className="std-overview-metric">
            <div className="std-ov-icon std-ov-icon--green"><Clock size={16} /></div>
            <div>
              <p className="std-ov-label">Attendance Rate</p>
              <p className="std-ov-value">{avgAttendance}%</p>
            </div>
          </div>
          <div className="std-overview-metric">
            <div className="std-ov-icon std-ov-icon--blue"><Users size={16} /></div>
            <div>
              <p className="std-ov-label">Total Enrolled</p>
              <p className="std-ov-value">{totalStudents}</p>
            </div>
          </div>
          <div className="std-overview-metric">
            <div className="std-ov-icon std-ov-icon--green-dark"><TrendingUp size={16} /></div>
            <div>
              <p className="std-ov-label">Performing Well</p>
              <p className="std-ov-value">{studentsPerformingWell}</p>
            </div>
          </div>
          <div className="std-overview-metric">
            <div className="std-ov-icon std-ov-icon--amber"><AlertTriangle size={16} /></div>
            <div>
              <p className="std-ov-label">Need Attention</p>
              <p className="std-ov-value">{studentsNeedingAttention}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="da-toolbar">
        <div className="da-toolbar-left">
          <div className="da-search-wrap">
            <Search size={14} className="da-search-icon" />
            <input className="da-search-input" placeholder="Search student..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="da-filter-select" value={filterClass} onChange={e => { setFilterClass(e.target.value); setPage(1) }}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="da-filter-select" value={filterStream} onChange={e => { setFilterStream(e.target.value); setPage(1) }}>
            <option value="">All Streams</option>
            {streams.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="da-action-btn" onClick={() => fetchStudents()}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Student Table ── */}
      <div style={{ marginTop: 16 }}>
        <div className="std-list-hdr">
          <h3 className="std-list-title">Academic & Student Details</h3>
          <span className="std-list-count">{sorted.length} students</span>
        </div>

        {sorted.length === 0 ? (
          <div className="da-empty-state" style={{ padding: 60, textAlign: 'center' }}>
            <Users size={40} color="#cbd5e1" />
            <p>No students found</p>
          </div>
        ) : (
          <div className="std-table-wrap">
            <table className="std-table">
              <thead>
                <tr>
                  <th className={`sortable ${sortBy === 'name' ? 'sorted' : ''}`} onClick={() => handleSort('name')}>
                    Student <span className="std-sort-icon"><ArrowUpDown size={11} /></span>
                  </th>
                  <th className={`sortable ${sortBy === 'class' ? 'sorted' : ''}`} onClick={() => handleSort('class')}>
                    Class / Stream <span className="std-sort-icon"><ArrowUpDown size={11} /></span>
                  </th>
                  <th className={`sortable ${sortBy === 'discipline' ? 'sorted' : ''}`} onClick={() => handleSort('discipline')}>
                    Discipline <span className="std-sort-icon"><ArrowUpDown size={11} /></span>
                  </th>
                  <th className={`sortable ${sortBy === 'performance' ? 'sorted' : ''}`} onClick={() => handleSort('performance')}>
                    Performance <span className="std-sort-icon"><ArrowUpDown size={11} /></span>
                  </th>
                  <th className={`sortable ${sortBy === 'attendance' ? 'sorted' : ''}`} onClick={() => handleSort('attendance')}>
                    Attendance <span className="std-sort-icon"><ArrowUpDown size={11} /></span>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(s => {
                  const avg = studentAvg[s.id] ?? null
                  const att = studentAttendance[s.id] ?? null
                  const discCount = disciplineCounts[s.id] || 0
                  const perf = getPerfLevel(avg)
                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="std-student-cell">
                          <div className="std-avatar">
                            {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '??'}
                          </div>
                          <div>
                            <p className="std-student-name">{s.full_name || '—'}</p>
                            <p className="std-student-adm">{s.admission_number || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="std-class-cell">{s.class || '—'}</span>
                        {s.stream && <>{' '}<span className="std-stream-pill">{s.stream}</span></>}
                      </td>
                      <td>
                        <span className={`std-disc-badge ${discCount > 0 ? 'std-disc-badge--warn' : 'std-disc-badge--clean'}`}>
                          {discCount > 0 ? <ShieldAlert size={12} /> : null}
                          {discCount} case{discCount !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td>
                        {avg != null ? (
                          <div className="std-perf-cell">
                            <span className={`std-perf-badge std-perf-badge--${perf.cls}`}>{avg}%</span>
                            <div className="std-perf-bar">
                              <div className="std-perf-bar-fill" style={{ width: `${Math.min(avg, 100)}%`, background: getPerfColor(avg) }} />
                            </div>
                          </div>
                        ) : (
                          <span className="std-perf-na">—</span>
                        )}
                      </td>
                      <td>
                        {att != null ? (
                          <div className="std-perf-cell">
                            <span className="std-att-badge" style={{ color: getAttColor(att), background: getAttColor(att) + '14' }}>
                              {att}%
                            </span>
                            <div className="std-perf-bar">
                              <div className="std-perf-bar-fill" style={{ width: `${Math.min(att, 100)}%`, background: getAttColor(att) }} />
                            </div>
                          </div>
                        ) : (
                          <span className="std-perf-na">—</span>
                        )}
                      </td>
                      <td className="std-actions-cell" ref={openDropdown === s.id ? dropdownRef : undefined}>
                        <button className="std-actions-btn" onClick={() => setOpenDropdown(openDropdown === s.id ? null : s.id)}>
                          <MoreHorizontal size={14} /> View
                        </button>
                        {openDropdown === s.id && (
                          <div className="std-dropdown">
                            <button className="std-dropdown-item" onClick={() => viewDiscipline(s)}>
                              <ShieldAlert size={14} /> View Discipline
                            </button>
                            <button className="std-dropdown-item" onClick={() => viewPerformance(s)}>
                              <BarChart2 size={14} /> View Performance
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="std-pagination">
                <span className="std-pagination-info">
                  Showing {(page - 1) * ROWS_PER_PAGE + 1}–{Math.min(page * ROWS_PER_PAGE, sorted.length)} of {sorted.length}
                </span>
                <div className="std-pagination-btns">
                  <button className="std-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft size={14} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let p
                    if (totalPages <= 5) p = i + 1
                    else if (page <= 3) p = i + 1
                    else if (page >= totalPages - 2) p = totalPages - 4 + i
                    else p = page - 2 + i
                    return (
                      <button key={p} className={`std-page-btn ${page === p ? 'std-page-btn--active' : ''}`} onClick={() => setPage(p)}>
                        {p}
                      </button>
                    )
                  })}
                  <button className="std-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Breakdown Panels ── */}
      {classPerformance.length > 0 && (
        <div className="std-breakdown-grid">
          {/* Performance by Class */}
          <div className="std-breakdown-card">
            <h4 className="std-bd-title"><BarChart2 size={14} /> Performance by Class</h4>
            <div className="std-bd-list">
              {classPerformance.map(c => (
                <div key={c.cls} className="std-bd-row">
                  <div className="std-bd-row-left">
                    <span className="std-bd-class">{c.cls}</span>
                    <span className="std-bd-count">{c.count} students</span>
                  </div>
                  <div className="std-bd-row-right">
                    <div className="std-bd-bar">
                      <div className="std-bd-bar-fill" style={{ width: `${Math.min(c.avg, 100)}%`, background: getPerfColor(c.avg) }} />
                    </div>
                    <span className="std-bd-pct" style={{ color: getPerfColor(c.avg) }}>{c.avg}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Discipline Overview */}
          <div className="std-breakdown-card">
            <h4 className="std-bd-title"><ShieldAlert size={14} /> Discipline Overview</h4>
            <div className="std-bd-disc-grid">
              <div className="std-disc-stat std-disc-stat--clean">
                <span className="std-disc-stat-value">{noCases}</span>
                <span className="std-disc-stat-label">No Cases</span>
              </div>
              <div className="std-disc-stat std-disc-stat--warn">
                <span className="std-disc-stat-value">{withCases}</span>
                <span className="std-disc-stat-label">{withCases === 1 ? 'Student' : 'Students'} With Cases</span>
              </div>
            </div>
            {classPerformance.some(c => c.disc > 0) && (
              <div className="std-bd-list" style={{ marginTop: 12 }}>
                {classPerformance.filter(c => c.disc > 0).map(c => (
                  <div key={c.cls} className="std-bd-row">
                    <div className="std-bd-row-left">
                      <span className="std-bd-class">{c.cls}</span>
                    </div>
                    <div className="std-bd-row-right">
                      <span className="std-disc-badge std-disc-badge--warn">{c.disc} case{c.disc !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attendance Overview */}
          <div className="std-breakdown-card">
            <h4 className="std-bd-title"><Clock size={14} /> Attendance by Class</h4>
            <div className="std-bd-list">
              {classPerformance.map(c => (
                <div key={c.cls} className="std-bd-row">
                  <div className="std-bd-row-left">
                    <span className="std-bd-class">{c.cls}</span>
                    <span className="std-bd-count">{c.count} students</span>
                  </div>
                  <div className="std-bd-row-right">
                    <div className="std-bd-bar">
                      <div className="std-bd-bar-fill" style={{ width: `${Math.min(c.att, 100)}%`, background: getAttColor(c.att) }} />
                    </div>
                    <span className="std-bd-pct" style={{ color: getAttColor(c.att) }}>{c.att}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && selectedStudent && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="da-student-avatar-sm" style={{ width: 40, height: 40, fontSize: 14 }}>
                  {selectedStudent.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17 }}>{selectedStudent.full_name}</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
                    {selectedStudent.admission_number} — {selectedStudent.class}{selectedStudent.stream ? ` ${selectedStudent.stream}` : ''}
                  </p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-form">
              <p className="form-section-label">Discipline Records ({studentDiscipline.length})</p>
              {studentDiscipline.length === 0 ? (
                <p className="da-text-muted">No discipline records for this student.</p>
              ) : (
                <div className="da-table-wrap">
                  <table className="da-table-full">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Offense</th>
                        <th>Action Taken</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentDiscipline.map(d => (
                        <tr key={d.id}>
                          <td>{d.date || d.created_at?.split('T')[0] || '—'}</td>
                          <td>{d.offense || d.offence || '—'}</td>
                          <td>{d.action_taken || d.action || '—'}</td>
                          <td>
                            <span className={`da-status-badge ${d.status === 'resolved' ? 'active' : d.status === 'pending' ? 'warning' : 'danger'}`}>
                              {d.status || 'recorded'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="form-section-label" style={{ marginTop: 24 }}>Academic Performance ({studentGrades.length})</p>
              {studentGrades.length === 0 ? (
                <p className="da-text-muted">No grades recorded yet.</p>
              ) : (
                <div className="da-table-wrap">
                  <table className="da-table-full">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Term</th>
                        <th>Year</th>
                        <th>Exam Type</th>
                        <th>Marks</th>
                        <th>Total</th>
                        <th>Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentGrades.map(g => (
                        <tr key={g.id}>
                          <td>{g.subject}</td>
                          <td>{g.term || '—'}</td>
                          <td>{g.year || '—'}</td>
                          <td>{g.exam_type || 'End Term'}</td>
                          <td>{marksCell(g)}</td>
                          <td style={{ fontWeight: 600 }}>{g.total_score ?? '—'}</td>
                          <td>
                            <span className="da-badge">{g.grade || '—'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Student Profile Overlay ── */}
      {profileStudent && (
        <StudentProfile
          student={profileStudent}
          onBack={() => setProfileStudent(null)}
          schoolId={profile?.school_id}
        />
      )}
    </div>
  )
}
