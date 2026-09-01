import { useState, useEffect, useRef } from 'react'
import { BookOpen, Users, Calendar, Clock, X, GraduationCap } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import './MyClasses.css'

export default function MyClasses({ profile }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [selected, setSelected] = useState(null)
  const [counts, setCounts] = useState({})
  const modalRef = useRef(null)

  useEffect(() => {
    if (!selected) return
    const el = modalRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    if (max <= 0) return
    let raf
    const start = performance.now()
    const duration = 2800
    const step = (t) => {
      const p = Math.min((t - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      el.scrollTop = max * eased
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [selected])

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

    const { data: students } = await supabase
      .from('students')
      .select('class, stream, status')
      .eq('school_id', profile.school_id)

    const byClass = {}
    for (const st of students || []) {
      const key = `${(st.class || '').trim()}${st.stream ? ` ${st.stream}` : ''}`
      if (!byClass[key]) byClass[key] = { total: 0, active: 0 }
      byClass[key].total += 1
      if (String(st.status || '').toLowerCase() === 'active') byClass[key].active += 1
    }
    const countMap = {}
    for (const c of result) {
      const key = `${c.className}${c.stream ? ` ${c.stream}` : ''}`
      countMap[c.className] = byClass[key]?.active ?? byClass[key]?.total ?? 0
    }
    setCounts(countMap)

    setLoading(false)
  }

  const toggle = (className) => {
    setExpanded(prev => prev === className ? null : className)
  }

  const openModal = (cls) => setSelected(cls)
  const closeModal = () => setSelected(null)

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
        <div className="mc-help mc-help--mobile">Tap a class to see subjects &amp; schedule</div>
      )}

      {classes.length === 0 ? null : (
        <>
          <div className="mc-tiles">
            {classes.map((cls) => (
              <button key={cls.className} className="mc-tile" onClick={() => openModal(cls)}>
                <span className="mc-tile-name">{cls.className}</span>
                {cls.level && <span className="mc-tile-level">{cls.level}</span>}
              </button>
            ))}
          </div>
          {classes.length > 0 && (
            <div className="mc-card-list">
              {classes.map((cls) => {
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
                            <Users size={11} className="mc-meta-icon" />
                            {counts[cls.className] ?? 0} student{counts[cls.className] === 1 ? '' : 's'}
                            {' · '}
                            {cls.subjects.length} subject{cls.subjects.length > 1 ? 's' : ''}
                            {' · '}
                            {cls.schedule.length} slot{cls.schedule.length > 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <span className="mc-chevron">›</span>
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
              })}
            </div>
          )}
        </>
      )}

      {selected && (
        <div className="mc-modal-overlay" onClick={closeModal}>
          <div className="mc-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
            <div className="mc-modal-hdr">
              <div className="mc-modal-title">
                <span className="mc-modal-icon"><GraduationCap size={18} /></span>
                <div>
                  <div className="mc-modal-name">{selected.className}</div>
                  {selected.level && <div className="mc-modal-level">{selected.level}</div>}
                </div>
              </div>
              <button className="mc-modal-close" onClick={closeModal} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="mc-modal-body">
              <div className="mcm-counts">
                <span><Users size={13} /> {counts[selected.className] ?? 0} students</span>
                <span><BookOpen size={13} /> {selected.subjects.length} subjects</span>
                <span><Calendar size={13} /> {selected.schedule.length} slots</span>
              </div>

              <div className="mcm-group">
                <p className="mc-section-label"><BookOpen size={13} /> Subjects</p>
                <div className="mcm-subjects">
                  {selected.subjects.map((sub, i) => (
                    <div key={sub} className="mcm-subject-card">
                      <span className="mcm-subject-idx">{String(i + 1).padStart(2, '0')}</span>
                      <span className="mcm-subject-name">{sub}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mcm-group">
                <p className="mc-section-label"><Calendar size={13} /> Schedule</p>
                <div className="mcm-days">
                  {[...new Set(selected.schedule.map(s => s.day))].map(day => (
                    <div key={day} className="mcm-day-card">
                      <span className="mcm-day-name">{day}</span>
                      <div className="mcm-day-slots">
                        {selected.schedule.filter(s => s.day === day).map((slot, i) => (
                          <div key={i} className="mcm-slot-card">
                            <span className="mcm-slot-time">
                              <Clock size={11} /> {slot.start?.slice(0, 5)} – {slot.end?.slice(0, 5)}
                            </span>
                            <span className="mcm-slot-subj">{slot.subject}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
