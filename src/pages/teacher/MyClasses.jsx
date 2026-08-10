import { useState, useEffect } from 'react'
import { BookOpen, Users, Calendar, Clock, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import './MyClasses.css'

export default function MyClasses({ profile }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!profile?.school_id) return
    fetchClasses()
  }, [profile])

  const fetchClasses = async () => {
    setLoading(true)

    const { data: teacherRec } = await supabase
      .from('teachers')
      .select('id')
      .eq('email', profile.email)
      .eq('school_id', profile.school_id)
      .maybeSingle()

    if (!teacherRec) { setLoading(false); return }

    const { data: slots } = await supabase
      .from('timetable_slots')
      .select(`
        *,
        classes(id, class_name, level, stream),
        subjects(id, name, code)
      `)
      .eq('teacher_id', teacherRec.id)
      .order('day')
      .order('start_time')

    const grouped = {}
    for (const s of slots || []) {
      const className = s.classes?.class_name?.trim()
      if (!className) continue
      if (!grouped[className]) {
        grouped[className] = {
          className,
          level: s.classes?.level,
          stream: s.classes?.stream,
          subjects: new Set(),
          schedule: [],
        }
      }
      if (s.subjects?.name) grouped[className].subjects.add(s.subjects.name)
      grouped[className].schedule.push({
        day: s.day,
        start: s.start_time,
        end: s.end_time,
        subject: s.subjects?.name,
        subjectCode: s.subjects?.code,
      })
    }

    const result = Object.values(grouped).map(g => ({
      ...g,
      subjects: [...g.subjects],
      schedule: g.schedule.sort((a, b) => {
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
        return days.indexOf(a.day) - days.indexOf(b.day)
      }),
    }))

    setClasses(result)
    if (result.length > 0) setExpanded(result[0].className)
    setLoading(false)
  }

  const toggle = (className) => {
    setExpanded(prev => prev === className ? null : className)
  }

  if (loading) return (
    <div className="mc-load">
      <div className="mc-spin" />
      <span>Loading classes...</span>
    </div>
  )

  return (
    <div className="mc-page">
      {classes.length === 0 ? (
        <div className="empty-att">
          <BookOpen size={40} color="#cbd5e1" />
          <p>No classes assigned</p>
          <span>Your assigned classes will appear here once the timetable is published</span>
        </div>
      ) : (
        classes.map((cls) => {
          const isOpen = expanded === cls.className
          return (
            <div key={cls.className} className="mc-card">
              <div className="mc-hdr" onClick={() => toggle(cls.className)}>
                <div className="mc-hdr-left">
                  <div className="mc-hdr-icon"><BookOpen size={18} /></div>
                  <div className="mc-hdr-info">
                    <div className="mc-hdr-name">
                      {cls.className}
                      {cls.level && <span className="mc-hdr-level">{cls.level}</span>}
                    </div>
                    <p className="mc-hdr-meta">
                      {cls.subjects.length} subject{cls.subjects.length > 1 ? 's' : ''}
                      {' · '}
                      {cls.schedule.length} slot{cls.schedule.length > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <ChevronRight size={18} className={`mc-chevron ${isOpen ? 'mc-chevron--open' : ''}`} />
              </div>

              <div className={`mc-body-wrap ${isOpen ? 'mc-body-wrap--open' : ''}`}>
                <div className="mc-body">
                  <div>
                    <p className="mc-section-label"><BookOpen size={13} /> Subjects</p>
                    <div className="mc-pills">
                      {cls.subjects.map(sub => (
                        <span key={sub} className="mc-pill">{sub}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mc-section-label"><Calendar size={13} /> Schedule</p>
                    <div className="mc-schedule">
                      {cls.schedule.map((slot, i) => (
                        <div key={i} className="mc-slot">
                          <span className="mc-slot-day">{slot.day?.slice(0, 3)}</span>
                          <span className="mc-slot-time">
                            <Clock size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
                            {slot.start?.slice(0, 5)} – {slot.end?.slice(0, 5)}
                          </span>
                          <span className="mc-slot-subj">{slot.subject}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
