import { useState, useEffect, useMemo } from 'react'
import {
  Award, Users, Search, BarChart3, BookOpen, Clock,
  CheckCircle, AlertTriangle, XCircle, Send, Download,
  Printer, RefreshCw, ChevronRight, FileText
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

const TERM_ORDER = ['Term 1', 'Term 2', 'Term 3']

const STATUS_CONFIG = {
  done: { label: 'Done', icon: CheckCircle, color: '#16a34a' },
  progress: { label: 'In Progress', icon: Clock, color: '#ca8a04' },
  not_started: { label: 'Not Started', icon: XCircle, color: '#dc2626' },
}

export default function CBCCompetency() {
  const [schoolId, setSchoolId] = useState(null)
  const [loading, setLoading] = useState(true)

  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [totalStudents, setTotalStudents] = useState(0)

  const [competencyAreas, setCompetencyAreas] = useState([])
  const [competencyLevels, setCompetencyLevels] = useState([])
  const [terms, setTerms] = useState([])
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())

  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedGrade, setSelectedGrade] = useState('')
  const [term, setTerm] = useState('')
  const [year, setYear] = useState('')
  const [search, setSearch] = useState('')

  const [teacherSlots, setTeacherSlots] = useState([])
  const [assessments, setAssessments] = useState([])

  const today = useMemo(() => {
    const d = new Date()
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }, [])

  const init = async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const sid = profile?.school_id
    if (!sid) { setLoading(false); return }
    setSchoolId(sid)

    const [{ data: cls }, { data: subs }, { count: sCount }, { data: school }] = await Promise.all([
      supabase.from('classes').select('class_name').eq('school_id', sid).order('class_name'),
      supabase.from('subjects').select('id, name').eq('school_id', sid).order('name'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', sid).eq('status', 'active'),
      supabase.from('schools').select('current_term, current_year').eq('id', sid).single(),
    ])

    setClasses(cls?.map(c => c.class_name) || [])
    setSubjects(subs || [])
    setTotalStudents(sCount || 0)

    let areaNames = []
    let levelsArr = []
    try {
      const { data: areas } = await supabase
        .from('competency_areas').select('name, sort_order').eq('school_id', sid).order('sort_order')
      if (areas) areaNames = areas.map(a => a.name)
    } catch {}
    try {
      const { data: levels } = await supabase
        .from('competency_levels').select('value, label, color, sort_order').eq('school_id', sid).order('sort_order')
      if (levels) levelsArr = levels.map(l => ({ value: l.value, label: l.label, color: l.color }))
    } catch {}
    setCompetencyAreas(areaNames)
    setCompetencyLevels(levelsArr)

    const schoolTerm = school?.current_term || 'Term 1'
    const schoolYear = school?.current_year || new Date().getFullYear()
    const termIdx = TERM_ORDER.indexOf(schoolTerm)
    const derivedTerms = termIdx >= 0 ? TERM_ORDER : ['Term 1', 'Term 2', 'Term 3']

    setTerms(derivedTerms)
    setCurrentYear(schoolYear)
    setTerm(derivedTerms[Math.max(0, termIdx)])
    setYear(String(schoolYear))

    setLoading(false)
  }

  const fetchSlots = async () => {
    const { data } = await supabase
      .from('timetable_slots')
      .select('teacher_id, class_id, subject_id, teachers(full_name), classes(class_name), subjects(name)')
      .eq('school_id', schoolId)

    if (!data) return

    const seen = new Set()
    const combos = []
    data.forEach(s => {
      const key = `${s.teacher_id}|${s.classes?.class_name}|${s.subjects?.name}`
      if (!seen.has(key)) {
        seen.add(key)
        combos.push({
          teacher_id: s.teacher_id,
          teacher_name: s.teachers?.full_name || 'Unknown',
          class_name: s.classes?.class_name || '',
          subject: s.subjects?.name || '',
        })
      }
    })
    setTeacherSlots(combos)
  }

  const fetchAssessments = async () => {
    const { data } = await supabase
      .from('cbc_assessments')
      .select('id, student_id, class_name, subject, competency_area, competency_level, created_at, students(full_name, admission_number)')
      .eq('school_id', schoolId)
      .eq('term', term)
      .eq('year', Number(year))

    setAssessments(data || [])
  }

  useEffect(() => { init() }, [])
  useEffect(() => { if (schoolId) { fetchSlots(); fetchAssessments() } }, [schoolId, term, year])

  const { summary, submissionRows, pendingActions, recentActivity } = useMemo(() => {
    const totalCompetencyAreas = competencyAreas.length || 8

    const byTeacherClassSubject = {}
    teacherSlots.forEach(s => {
      const key = `${s.teacher_id}|${s.class_name}|${s.subject}`
      if (!byTeacherClassSubject[key]) {
        byTeacherClassSubject[key] = { ...s, doneAreas: new Set() }
      }
    })

    assessments.forEach(a => {
      Object.keys(byTeacherClassSubject).forEach(k => {
        const slot = byTeacherClassSubject[k]
        if (slot.class_name === a.class_name && slot.subject === a.subject) {
          slot.doneAreas.add(a.competency_area)
        }
      })
    })

    let teachersDone = 0
    const uniqueTeachers = new Set()

    Object.values(byTeacherClassSubject).forEach(slot => {
      if (!slot.teacher_name) return
      uniqueTeachers.add(slot.teacher_id)
      if (slot.doneAreas.size >= totalCompetencyAreas) teachersDone++
    })

    const ratedSet = new Set(assessments.map(a => a.student_id))
    const uniqueClassNames = new Set(teacherSlots.map(s => s.class_name))
    const eligibleSubjects = new Set(teacherSlots.map(s => s.subject))

    const counts = {}
    competencyLevels.forEach(l => { counts[l.value] = 0 })
    assessments.forEach(a => {
      if (counts[a.competency_level] !== undefined) counts[a.competency_level]++
    })

    const rows = []
    const pending = []

    Object.values(byTeacherClassSubject).forEach(slot => {
      if (!slot.teacher_name) return
      const areasDone = slot.doneAreas.size
      const progress = Math.round((areasDone / totalCompetencyAreas) * 100)
      const isComplete = areasDone >= totalCompetencyAreas
      const status = isComplete ? 'done' : (areasDone > 0 ? 'progress' : 'not_started')
      rows.push({
        id: `${slot.teacher_id}|${slot.class_name}|${slot.subject}`,
        class_name: slot.class_name,
        subject: slot.subject,
        teacher_name: slot.teacher_name,
        status,
        progress,
      })
      if (!isComplete) {
        pending.push({
          class_name: slot.class_name,
          subject: slot.subject,
          teacher_name: slot.teacher_name,
          progress,
        })
      }
    })

    pending.sort((a, b) => a.progress - b.progress)

    const sorted = [...assessments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const activity = []
    const seenActivity = new Set()
    sorted.forEach(a => {
      if (activity.length >= 8) return
      const slotVals = Object.values(byTeacherClassSubject)
      const match = slotVals.find(s => s.class_name === a.class_name && s.subject === a.subject)
      const teacherName = match?.teacher_name || 'A teacher'
      const time = a.created_at ? new Date(a.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''
      const actKey = `${a.class_name}|${a.subject}|${time}`
      if (!seenActivity.has(actKey)) {
        seenActivity.add(actKey)
        activity.push({
          id: a.id,
          time,
          teacher: teacherName,
          action: `CBC assessment updated for ${a.class_name} – ${a.subject}`,
        })
      }
    })

    return {
      summary: {
        totalClasses: uniqueClassNames.size,
        teachersDone,
        pending: uniqueTeachers.size - teachersDone,
        cbcSubjects: eligibleSubjects.size,
        studentsRated: ratedSet.size,
        completionPct: totalStudents > 0 ? Math.round((ratedSet.size / totalStudents) * 100) : 0,
        ...counts,
      },
      submissionRows: rows,
      pendingActions: pending,
      recentActivity: activity,
    }
  }, [assessments, teacherSlots, totalStudents, competencyAreas, competencyLevels])

  const filteredRows = submissionRows.filter(r => {
    if (selectedGrade && r.class_name !== selectedGrade) return false
    if (selectedSubject && r.subject !== selectedSubject) return false
    if (search) {
      const q = search.toLowerCase()
      return r.teacher_name.toLowerCase().includes(q) || r.class_name.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q)
    }
    return true
  })

  if (loading) return <div className="da-loading-state">Loading CBC oversight data...</div>

  return (
    <div className="cbc-page">
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: -8 }}>{today}</div>

      <div className="da-summary">
        {[
          { label: 'Total Classes', value: summary.totalClasses, icon: BookOpen, color: '#7c3aed' },
          { label: 'Teachers Done', value: summary.teachersDone, icon: CheckCircle, color: '#16a34a' },
          { label: 'Pending', value: summary.pending, icon: AlertTriangle, color: '#dc2626' },
          { label: 'CBC Subjects', value: summary.cbcSubjects, icon: BarChart3, color: '#2563eb' },
          { label: 'Students Rated', value: summary.studentsRated, icon: Users, color: '#ca8a04' },
          { label: 'Completion', value: `${summary.completionPct}%`, icon: Award, color: '#0891b2' },
        ].map(s => (
          <div className="da-sum-card" key={s.label}>
            <s.icon size={28} style={{ color: s.color }} />
            <div>
              <p className="da-tsc-label">{s.label}</p>
              <p className="da-tsc-value" style={{ color: s.color }}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="da-card">
        <div className="da-card-header">
          <h3>CBC Competency Submission Status</h3>
        </div>
        <div className="da-toolbar" style={{ marginBottom: 16 }}>
          <div className="da-toolbar-left">
            <div className="da-search-wrap">
              <Search size={14} className="da-search-icon" />
              <input className="da-search-input" placeholder="Search teacher/class..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220 }} />
            </div>
            <select className="da-filter-select" value={term} onChange={e => setTerm(e.target.value)}>
              {terms.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="da-filter-select" value={year} onChange={e => setYear(e.target.value)}>
              {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
            <select className="da-filter-select" value={selectedGrade} onChange={e => setSelectedGrade(e.target.value)}>
              <option value="">All Grades</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="da-filter-select" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
              <option value="">All Subjects</option>
              {subjects.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
        </div>
        {filteredRows.length === 0 ? (
          <div className="da-empty-state">
            <FileText size={36} color="#cbd5e1" />
            <p>No submission data found for this term</p>
          </div>
        ) : (
          <div className="da-table-wrap">
            <table className="da-table-full">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Teacher</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => {
                  const cfg = STATUS_CONFIG[r.status]
                  const Icon = cfg.icon
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.class_name}</td>
                      <td><span className="da-subject-tag">{r.subject}</span></td>
                      <td>{r.teacher_name}</td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                          background: r.status === 'done' ? '#dcfce7' : r.status === 'progress' ? '#fef9c3' : '#fee2e2',
                          color: cfg.color,
                        }}>
                          <Icon size={13} />
                          {r.status === 'progress' ? `${r.progress}%` : cfg.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
        <div className="da-card">
          <div className="da-card-header">
            <h3>Competency Overview</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {competencyLevels.map(l => {
              const pct = assessments.length > 0 ? Math.round(((summary[l.value] || 0) / assessments.length) * 100) : 0
              return (
                <div key={l.value}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: l.color }}>{l.value}</span>
                    <span style={{ color: '#64748b' }}>{l.label}</span>
                    <span style={{ fontWeight: 600 }}>{summary[l.value] || 0} students</span>
                  </div>
                  <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: l.color, borderRadius: 4, transition: 'width 0.3s' }} />
                  </div>
                </div>
              )
            })}
            {(() => {
              const notRated = totalStudents - summary.studentsRated
              const nrPct = totalStudents > 0 ? Math.round((notRated / totalStudents) * 100) : 0
              return (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: '#94a3b8' }}>NR</span>
                    <span style={{ color: '#64748b' }}>Not Rated</span>
                    <span style={{ fontWeight: 600, color: '#94a3b8' }}>{notRated} students</span>
                  </div>
                  <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${nrPct}%`, background: '#94a3b8', borderRadius: 4 }} />
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        <div className="da-card">
          <div className="da-card-header">
            <h3>Classes Awaiting Submission</h3>
          </div>
          {pendingActions.length === 0 ? (
            <div className="da-empty-state">
              <CheckCircle size={36} color="#16a34a" />
              <p>All submissions complete!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingActions.slice(0, 6).map((p, i) => (
                <div key={i} style={{
                  padding: '10px 14px', borderRadius: 8, border: '1px solid #fef9c3',
                  background: '#fffbeb', fontSize: 13,
                }}>
                  <div style={{ fontWeight: 600, color: '#92400e' }}>
                    <AlertTriangle size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    {p.class_name} – {p.subject}
                  </div>
                  <div style={{ color: '#a16207', fontSize: 12, marginTop: 4 }}>
                    Teacher: {p.teacher_name} · Progress: {p.progress}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="da-card">
        <div className="da-card-header">
          <h3>Quick Actions</h3>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'View All Competencies', icon: FileText, action: null },
            { label: 'Open Pending Classes', icon: ChevronRight, action: null },
            { label: 'Export CBC Report', icon: Download, action: null },
            { label: 'Print Summary', icon: Printer, action: null },
            { label: 'Send Reminder', icon: Send, action: null },
            { label: 'Refresh Data', icon: RefreshCw, action: () => { fetchSlots(); fetchAssessments() } },
          ].map(btn => (
            <button key={btn.label} className="da-btn-secondary da-btn-sm" onClick={btn.action || undefined} style={{ gap: 5 }}>
              <btn.icon size={14} /> {btn.label}
            </button>
          ))}
        </div>
      </div>

      <div className="da-card">
        <div className="da-card-header">
          <h3>Recent Activity</h3>
        </div>
        {recentActivity.length === 0 ? (
          <div className="da-empty-state">
            <Clock size={36} color="#cbd5e1" />
            <p>No recent activity</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentActivity.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
                <span style={{ color: '#94a3b8', fontSize: 11, minWidth: 50, flexShrink: 0 }}>{a.time}</span>
                <span style={{ fontWeight: 500, color: '#374151', minWidth: 100 }}>{a.teacher}</span>
                <span style={{ color: '#64748b' }}>{a.action}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
