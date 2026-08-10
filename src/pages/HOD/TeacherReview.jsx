import { useState, useEffect } from 'react'
import { Search, Star, Mail, Phone } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSchool } from '../admin/useSchool'
import { useAuthStore } from '../../store/authStore'

export default function TeacherReview() {
  const { currentTerm, currentYear } = useSchool()
  const { profile: authProfile } = useAuthStore()
  const [teachers, setTeachers] = useState([])
  const [selectedTeacher, setSelectedTeacher] = useState(null)
  const [teacherStats, setTeacherStats] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTeachers()
  }, [])

  useEffect(() => {
    if (selectedTeacher) fetchTeacherStats(selectedTeacher)
  }, [selectedTeacher])

  const fetchTeachers = async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const schoolId = profile?.school_id
    if (!schoolId) { setLoading(false); return }

    const { data } = await supabase
      .from('teachers')
      .select('*')
      .eq('school_id', schoolId)
      .order('full_name')

    setTeachers(data || [])
    setLoading(false)
  }

  const fetchTeacherStats = async (teacher) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const schoolId = profile?.school_id
    if (!schoolId) return

    const [gradesRes, slotsRes] = await Promise.all([
      supabase
        .from('grades')
        .select('*')
        .eq('school_id', schoolId)
        .eq('teacher_name', teacher.full_name)
        .eq('term', currentTerm)
        .eq('year', currentYear),
      supabase
        .from('timetable_slots')
        .select('*, subjects(name), classes(class_name)')
        .eq('teacher_id', teacher.id)
        .eq('school_id', schoolId),
    ])

    const gradeData = gradesRes.data || []
    const avgScore = gradeData.length
      ? Math.round(gradeData.reduce((s, g) => s + Number(g.total_score || 0), 0) / gradeData.length)
      : 0
    const passCount = gradeData.filter(g => Number(g.total_score || 0) >= 50).length
    const passRate = gradeData.length > 0 ? Math.round((passCount / gradeData.length) * 100) : 0

    const subjectsTaught = [...new Set(slotsRes.data?.map(s => s.subjects?.name).filter(Boolean) || [])]
    const classesTaught = [...new Set(slotsRes.data?.map(s => s.classes?.class_name).filter(Boolean) || [])]

    setTeacherStats({
      totalGrades: gradeData.length,
      avgScore,
      passRate,
      passCount,
      subjects: subjectsTaught,
      classes: classesTaught,
      slots: slotsRes.data || [],
    })
  }

  const filtered = teachers.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return t.full_name?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q) || t.phone?.includes(q)
  })

  if (loading) return <div className="loading-state">Loading teachers...</div>

  return (
    <div className="hod-sub-page">
      <div className="hod-sp-header">
        <div className="hod-sp-search-wrap">
          <Search size={14} className="hod-sp-search-icon" />
          <input
            className="hod-sp-search-input"
            placeholder="Search teachers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span style={{ fontSize: 13, color: '#64748b' }}>{filtered.length} teacher{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {selectedTeacher && teacherStats ? (
        <div className="hod-tr-detail">
          <div className="hod-tr-detail-header">
            <div className="hod-tr-avatar-lg">{selectedTeacher.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
            <div>
              <h3>{selectedTeacher.full_name}</h3>
              <div className="hod-tr-contact">
                {selectedTeacher.email && <span><Mail size={12} /> {selectedTeacher.email}</span>}
                {selectedTeacher.phone && <span><Phone size={12} /> {selectedTeacher.phone}</span>}
              </div>
            </div>
            <button className="hod-btn-secondary" onClick={() => setSelectedTeacher(null)} style={{ marginLeft: 'auto' }}>
              Back to List
            </button>
          </div>

          <div className="hod-sp-metrics">
            <div className="hod-sp-metric-card">
              <p className="hod-sp-metric-value" style={{ color: '#2563eb' }}>{teacherStats.avgScore}%</p>
              <p className="hod-sp-metric-label">Average Score</p>
              <span className="hod-sp-metric-sub">Across all subjects</span>
            </div>
            <div className="hod-sp-metric-card">
              <p className="hod-sp-metric-value" style={{ color: '#16a34a' }}>{teacherStats.passRate}%</p>
              <p className="hod-sp-metric-label">Pass Rate</p>
              <span className="hod-sp-metric-sub">{teacherStats.passCount} of {teacherStats.totalGrades} passed</span>
            </div>
            <div className="hod-sp-metric-card">
              <p className="hod-sp-metric-value" style={{ color: '#7c3aed' }}>{teacherStats.subjects.length}</p>
              <p className="hod-sp-metric-label">Subjects</p>
              <span className="hod-sp-metric-sub">{teacherStats.subjects.join(', ') || 'None'}</span>
            </div>
            <div className="hod-sp-metric-card">
              <p className="hod-sp-metric-value" style={{ color: '#ca8a04' }}>{teacherStats.classes.length}</p>
              <p className="hod-sp-metric-label">Classes</p>
              <span className="hod-sp-metric-sub">{teacherStats.classes.join(', ') || 'None'}</span>
            </div>
          </div>

          {teacherStats.slots.length > 0 && (
            <div className="hod-card">
              <div className="hod-card-header">
                <h3>Current Timetable</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="hod-table" style={{ minWidth: 500 }}>
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Time</th>
                      <th>Subject</th>
                      <th>Class</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teacherStats.slots.map((slot) => (
                      <tr key={slot.id}>
                        <td style={{ textTransform: 'capitalize' }}>{slot.day || '—'}</td>
                        <td>{slot.start_time ? `${slot.start_time} - ${slot.end_time || ''}` : '—'}</td>
                        <td>{slot.subjects?.name || '—'}</td>
                        <td>{slot.classes?.class_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="hod-card">
          <div className="hod-card-header">
            <h3>Department Teachers</h3>
          </div>
          {filtered.length === 0 ? (
            <p className="empty-state">No teachers found</p>
          ) : (
            <div className="hod-tr-list">
              {filtered.map((t) => (
                <div key={t.id} className="hod-tr-card" onClick={() => setSelectedTeacher(t)}>
                  <div className="hod-tr-avatar">{t.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                  <div className="hod-tr-info">
                    <p className="hod-tr-name">{t.full_name}</p>
                    <p className="hod-tr-email">{t.email || '—'}</p>
                  </div>
                  <div className="hod-tr-meta">
                    <span><Star size={12} /> {t.subjects || 'General'}</span>
                    <span className={`hod-badge ${t.status === 'active' ? 'hod-badge-good' : 'hod-badge-low'}`}>
                      {t.status || 'active'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
