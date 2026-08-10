import { useState, useEffect, useRef } from 'react'
import { Calendar, Clock, BookOpen, Users, GraduationCap, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import './TimetablePage.css'

// ── Constants (mirrors admin) ────────────────────────────────
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DAY_SHORT = { Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED', Thursday: 'THUR', Friday: 'FRI' }

// ── CBC Band Detection (mirrors admin) ───────────────────────
const getCBCBand = (classNameOrLevel = '') => {
  const v = classNameOrLevel.toUpperCase()
  if (v.includes('PP1') || v.includes('PP 1') || v.includes('PRE-PRIMARY 1') || v.includes('PREPRIMARY 1')) return 'PP'
  if (v.includes('PP2') || v.includes('PP 2') || v.includes('PRE-PRIMARY 2') || v.includes('PREPRIMARY 2')) return 'PP'
  if (v.includes('GRADE 1') || v.includes('GR1') || v.includes('G1') ||
      v.includes('GRADE 2') || v.includes('GR2') || v.includes('G2') ||
      v.includes('GRADE 3') || v.includes('GR3') || v.includes('G3')) return 'LOWER_PRIMARY'
  if (v.includes('GRADE 4') || v.includes('GR4') || v.includes('G4') ||
      v.includes('GRADE 5') || v.includes('GR5') || v.includes('G5') ||
      v.includes('GRADE 6') || v.includes('GR6') || v.includes('G6')) return 'UPPER_PRIMARY'
  if (v.includes('GRADE 7') || v.includes('GR7') || v.includes('G7') ||
      v.includes('GRADE 8') || v.includes('GR8') || v.includes('G8') ||
      v.includes('GRADE 9') || v.includes('GR9') || v.includes('G9') ||
      v.includes('JUNIOR')) return 'JUNIOR'
  if (v.includes('GRADE 10') || v.includes('GR10') || v.includes('G10') ||
      v.includes('GRADE 11') || v.includes('GR11') || v.includes('G11') ||
      v.includes('SENIOR')) return 'SENIOR'
  return null
}

// ── Time Slots by Band (mirrors admin exactly) ────────────────
const TIME_SLOTS_BY_BAND = {
  PP: [
    { key: 'p1',  label: '8:00–8:30',   start: '08:00', end: '08:30', type: 'lesson', period: 1 },
    { key: 'p2',  label: '8:30–9:00',   start: '08:30', end: '09:00', type: 'lesson', period: 2 },
    { key: 'sb',  label: '9:00–9:20',   start: '09:00', end: '09:20', type: 'break',  breakLabel: 'SHORT BREAK' },
    { key: 'p3',  label: '9:20–9:50',   start: '09:20', end: '09:50', type: 'lesson', period: 3 },
    { key: 'lb',  label: '9:50–10:20',  start: '09:50', end: '10:20', type: 'break',  breakLabel: 'LONG BREAK' },
    { key: 'p4',  label: '10:20–10:50', start: '10:20', end: '10:50', type: 'lesson', period: 4 },
    { key: 'lun', label: '10:50–12:00', start: '10:50', end: '12:00', type: 'break',  breakLabel: 'LUNCH BREAK' },
    { key: 'p5',  label: '12:00–12:30', start: '12:00', end: '12:30', type: 'lesson', period: 5 },
  ],
  PRIMARY: [
    { key: 'p1',  label: '8:00–8:35',   start: '08:00', end: '08:35', type: 'lesson', period: 1 },
    { key: 'p2',  label: '8:35–9:10',   start: '08:35', end: '09:10', type: 'lesson', period: 2 },
    { key: 'sb',  label: '9:10–9:30',   start: '09:10', end: '09:30', type: 'break',  breakLabel: 'SHORT BREAK' },
    { key: 'p3',  label: '9:30–10:05',  start: '09:30', end: '10:05', type: 'lesson', period: 3 },
    { key: 'p4',  label: '10:05–10:40', start: '10:05', end: '10:40', type: 'lesson', period: 4 },
    { key: 'lb',  label: '10:40–11:10', start: '10:40', end: '11:10', type: 'break',  breakLabel: 'LONG BREAK' },
    { key: 'p5',  label: '11:10–11:45', start: '11:10', end: '11:45', type: 'lesson', period: 5 },
    { key: 'p6',  label: '11:45–12:20', start: '11:45', end: '12:20', type: 'lesson', period: 6 },
    { key: 'lun', label: '12:20–1:20',  start: '12:20', end: '13:20', type: 'break',  breakLabel: 'LUNCH BREAK' },
    { key: 'p7',  label: '1:20–1:55',   start: '13:20', end: '13:55', type: 'lesson', period: 7 },
  ],
  SECONDARY: [
    { key: 'p1',  label: '8:00–8:40',   start: '08:00', end: '08:40', type: 'lesson', period: 1 },
    { key: 'p2',  label: '8:40–9:20',   start: '08:40', end: '09:20', type: 'lesson', period: 2 },
    { key: 'sb',  label: '9:20–9:30',   start: '09:20', end: '09:30', type: 'break',  breakLabel: 'SHORT BREAK' },
    { key: 'p3',  label: '9:30–10:10',  start: '09:30', end: '10:10', type: 'lesson', period: 3 },
    { key: 'p4',  label: '10:10–10:50', start: '10:10', end: '10:50', type: 'lesson', period: 4 },
    { key: 'lb',  label: '10:50–11:20', start: '10:50', end: '11:20', type: 'break',  breakLabel: 'LONG BREAK' },
    { key: 'p5',  label: '11:20–12:00', start: '11:20', end: '12:00', type: 'lesson', period: 5 },
    { key: 'p6',  label: '12:00–12:40', start: '12:00', end: '12:40', type: 'lesson', period: 6 },
    { key: 'lun', label: '12:40–2:00',  start: '12:40', end: '14:00', type: 'break',  breakLabel: 'LUNCH BREAK' },
    { key: 'p7',  label: '2:00–2:40',   start: '14:00', end: '14:40', type: 'lesson', period: 7 },
    { key: 'p8',  label: '2:40–3:20',   start: '14:40', end: '15:20', type: 'lesson', period: 8 },
  ],
}

const BAND_LESSON_DURATION = {
  PP: 30, LOWER_PRIMARY: 35, UPPER_PRIMARY: 35, JUNIOR: 40, SENIOR: 40,
}

const BAND_LABEL = {
  PP:            'Pre-Primary',
  LOWER_PRIMARY: 'Lower Primary (Grade 1–3)',
  UPPER_PRIMARY: 'Upper Primary (Grade 4–6)',
  JUNIOR:        'Junior School (Grade 7–9)',
  SENIOR:        'Senior School (Grade 10–11)',
}

// Resolve a class's band → correct slot set
const getTimeSlotsForBand = (classNameOrLevel) => {
  const band = getCBCBand(classNameOrLevel || '')
  if (band === 'PP')                                    return TIME_SLOTS_BY_BAND.PP
  if (band === 'LOWER_PRIMARY' || band === 'UPPER_PRIMARY') return TIME_SLOTS_BY_BAND.PRIMARY
  if (band === 'JUNIOR'        || band === 'SENIOR')    return TIME_SLOTS_BY_BAND.SECONDARY
  return TIME_SLOTS_BY_BAND.SECONDARY // default
}

// Because a teacher may teach classes from different bands, pick the widest
// slot set that covers all their classes (SECONDARY > PRIMARY > PP)
const getWidestSlotsForClasses = (classObjects) => {
  if (!classObjects?.length) return TIME_SLOTS_BY_BAND.SECONDARY
  const bands = classObjects.map(c => getCBCBand(c?.level || c?.class_name || ''))
  if (bands.some(b => b === 'JUNIOR' || b === 'SENIOR' || b === null)) return TIME_SLOTS_BY_BAND.SECONDARY
  if (bands.some(b => b === 'LOWER_PRIMARY' || b === 'UPPER_PRIMARY'))  return TIME_SLOTS_BY_BAND.PRIMARY
  return TIME_SLOTS_BY_BAND.PP
}

// ── Subject colour palette (consistent per-subject colouring) ─
const SUBJECT_COLOURS = [
  '#dbeafe', '#fce7f3', '#dcfce7', '#fef9c3', '#ede9fe',
  '#ffedd5', '#e0f2fe', '#f0fdf4', '#fdf2f8', '#fef3c7',
]
const subjectColour = (() => {
  const cache = {}
  let idx = 0
  return (subjectName) => {
    if (!subjectName) return '#f1f5f9'
    if (!cache[subjectName]) cache[subjectName] = SUBJECT_COLOURS[idx++ % SUBJECT_COLOURS.length]
    return cache[subjectName]
  }
})()

// ── Today helper ──────────────────────────────────────────────
const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })

// ─────────────────────────────────────────────────────────────
export default function TimetablePage({ profile }) {
  const [timetable, setTimetable]     = useState([])
  const [classMap, setClassMap]       = useState({})   // classId → class object
  const [teacherCode, setTeacherCode] = useState('')
  const [loading, setLoading]         = useState(true)
  const [selectedDay, setSelectedDay] = useState(todayName)  // mobile day filter
  const [isMobile, setIsMobile]       = useState(window.innerWidth < 768)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const printRef = useRef(null)

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html>
        <head>
          <title>${profile?.full_name || 'Teacher'} Timetable</title>
          <style>
            @page { size: A4 landscape; margin: 3mm; }
            * { box-sizing: border-box; font-family: Arial, sans-serif; }
            body { margin: 0; padding: 0; }
            .tt-print-area { width: 100%; }
            .tt-print-school { display:block; text-align:center; font-size:22px; font-weight:700; margin-bottom:6px; }
            .tt-print-heading { display:block; text-align:center; font-size:24px; font-weight:900; text-transform:uppercase; margin-bottom:22px; }
            .tt-print-footer { display:flex; justify-content:space-between; margin-top:28px; font-size:15px; }
            .tt-table { width:100%; border-collapse:collapse; border:3px solid #111; }
            .tt-table th, .tt-table td { border:2px solid #111; padding:8px 10px; text-align:center; vertical-align:middle; }
            .tt-table th { background:#f1f1f1; font-size:14px; font-weight:700; }
            .tt-table .tt-th-break, .tt-table .tt-td-break { background:#f8f8f8; width:40px; }
            .tt-table .tt-td-day { font-size:16px; font-weight:900; background:#f1f1f1; width:65px; }
            .tt-table .tt-td-cell { height:80px; }
            .tt-cell { display:flex; flex-direction:column; align-items:center; justify-content:center; height:80px; gap:4px; }
            .tt-cell-subj { font-size:15px; font-weight:700; }
            .tt-cell-class { font-size:12px; font-weight:600; background:#eee; padding:2px 6px; border-radius:3px; }
            .tt-break-lbl { writing-mode:vertical-rl; transform:rotate(180deg); font-size:13px; font-weight:900; }
          </style>
        </head>
        <body>${content.outerHTML}</body>
      </html>
    `)
    win.document.close()
    win.onload = () => { win.focus(); win.print(); win.close() }
  }

  useEffect(() => { if (profile) fetchTimetable() }, [profile])

  // ── Fetch ──────────────────────────────────────────────────
  const fetchTimetable = async () => {
    setLoading(true)

    // Look up the actual teachers table record (timetable_slots.teacher_id
    // references teachers.id, not auth.users.id)
    const { data: teacherRec } = await supabase
      .from('teachers')
      .select('id, staff_number')
      .eq('email', profile.email)
      .eq('school_id', profile.school_id)
      .maybeSingle()

    if (!teacherRec) { setTimetable([]); setLoading(false); return }
    setTeacherCode(teacherRec.staff_number || '')

    const { data: slots } = await supabase
      .from('timetable_slots')
      .select(`
        *,
        classes ( id, class_name, level, stream ),
        subjects ( id, name, code ),
        teachers ( full_name, staff_number )
      `)
      .eq('teacher_id', teacherRec.id)
      .order('day')
      .order('period')

    const rows = (slots || []).map(s => ({
      ...s,
      subject_name: s.subjects?.name,
      subject_code: s.subjects?.code,
      class_name:   s.classes?.class_name,
      class_level:  s.classes?.level,
      class_stream: s.classes?.stream,
      teacher_name: s.teachers?.full_name,
      teacher_code: s.teachers?.staff_number,
    }))

    // Build classId → class object lookup for band detection
    const cMap = {}
    for (const s of rows) {
      if (s.class_id && s.classes) cMap[s.class_id] = s.classes
    }
    setClassMap(cMap)
    setTimetable(rows)
    setLoading(false)
  }

  // ── Cell lookup ────────────────────────────────────────────
  // A teacher may have multiple classes in the same period on different days,
  // but never the same period+day (that would be a conflict). Return first match.
  const getCell = (day, period) =>
    timetable.find(s => s.day === day && s.period === period) || null

  // ── Derived stats ──────────────────────────────────────────
  const totalLessons    = timetable.length
  const uniqueSubjects  = [...new Set(timetable.map(t => t.subject_name).filter(Boolean))].length
  const uniqueClasses   = [...new Set(timetable.map(t => t.class_id).filter(Boolean))].length
  const todayLessons    = timetable.filter(t => t.day === todayName)
  const todayCount      = todayLessons.length

  // Next lesson today (period-wise)
  const now             = new Date()
  const nowMins         = now.getHours() * 60 + now.getMinutes()
  const nextLesson      = todayLessons
    .map(l => {
      const [h, m] = (l.start_time || '00:00').split(':').map(Number)
      return { ...l, startMins: h * 60 + m }
    })
    .filter(l => l.startMins > nowMins)
    .sort((a, b) => a.startMins - b.startMins)[0] || null

  // ── Determine widest time slot set across all taught classes ─
  const allTaughtClasses = Object.values(classMap)
  const activeTimeSlots  = getWidestSlotsForClasses(allTaughtClasses)
  const lessonSlots      = activeTimeSlots.filter(s => s.type === 'lesson')

  // ── Mobile day navigation ──────────────────────────────────
  const dayIdx        = DAYS.indexOf(selectedDay)
  const prevDay       = () => setSelectedDay(DAYS[Math.max(0, dayIdx - 1)])
  const nextDay       = () => setSelectedDay(DAYS[Math.min(DAYS.length - 1, dayIdx + 1)])

  const todayStr = new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  if (loading) return (
    <div className="tt-load">
      <div className="tt-spin" />
      <span>Loading timetable...</span>
    </div>
  )

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div className="tt-dash">

      {/* ── Summary Cards ── */}
      <div className="tt-summary">
        <div className="tt-stat">
          <div className="tt-stat-icon tt-stat-icon--blue"><Calendar size={20} /></div>
          <div className="tt-stat-body">
            <p className="tt-stat-value">{totalLessons}</p>
            <p className="tt-stat-label">Weekly Lessons</p>
          </div>
        </div>
        <div className="tt-stat">
          <div className="tt-stat-icon tt-stat-icon--purple"><BookOpen size={20} /></div>
          <div className="tt-stat-body">
            <p className="tt-stat-value">{uniqueSubjects}</p>
            <p className="tt-stat-label">Subjects</p>
          </div>
        </div>
        <div className="tt-stat">
          <div className="tt-stat-icon tt-stat-icon--cyan"><Users size={20} /></div>
          <div className="tt-stat-body">
            <p className="tt-stat-value">{uniqueClasses}</p>
            <p className="tt-stat-label">Classes</p>
          </div>
        </div>
        <div className="tt-stat">
          <div className="tt-stat-icon tt-stat-icon--green"><Clock size={20} /></div>
          <div className="tt-stat-body">
            <p className="tt-stat-value">{todayCount}</p>
            <p className="tt-stat-label">Today's Lessons</p>
          </div>
        </div>
      </div>

      {/* ── Next lesson callout (only shown on today if there's one upcoming) ── */}
      {nextLesson && (
        <div className="tt-next-lesson">
          <div className="tt-next-lesson-label">
            <Clock size={14} /> Up next
          </div>
          <div className="tt-next-lesson-body">
            <span className="tt-next-subj">{nextLesson.subject_name}</span>
            <span className="tt-next-sep">·</span>
            <span className="tt-next-class">{nextLesson.class_name}{nextLesson.class_stream ? ` ${nextLesson.class_stream}` : ''}</span>
            <span className="tt-next-sep">·</span>
            <span className="tt-next-time">{nextLesson.start_time} – {nextLesson.end_time}</span>
          </div>
        </div>
      )}

      {timetable.length === 0 ? (
        <div className="tt-empty">
          <GraduationCap size={48} />
          <p>No timetable assigned yet</p>
          <span>Your schedule will appear here once the admin publishes the timetable.</span>
        </div>
      ) : (
        <div className="tt-grid-wrap">
          <div className="tt-toolbar">
            {isMobile && (
              <div className="tt-day-nav">
                <button onClick={prevDay} disabled={dayIdx === 0}><ChevronLeft size={16} /></button>
                <span className="tt-day-nav-label">{selectedDay}</span>
                <button onClick={nextDay} disabled={dayIdx === DAYS.length - 1}><ChevronRight size={16} /></button>
              </div>
            )}
            <div className="tt-toolbar-spacer" />
            {timetable.length > 0 && (
              <button className="tt-btn tt-btn--dark" onClick={handlePrint}>
                <Download size={15} /> Download PDF
              </button>
            )}
          </div>

          <div className="tt-scroll">
            <div ref={printRef} className="tt-print-area">
              <div className="tt-print-school">{profile?.schools?.name?.toUpperCase()}</div>
              <div className="tt-print-heading">{profile?.full_name}{teacherCode ? ` (${teacherCode})` : ''} — Timetable</div>
              <table className="tt-table">
                <thead>
                  <tr>
                    <th className="tt-th tt-th-day">DAY</th>
                    {activeTimeSlots.map(slot => (
                      <th
                        key={slot.key}
                        className={`tt-th ${slot.type === 'break' ? 'tt-th-break' : 'tt-th-lesson'}`}
                      >
                        {slot.type === 'lesson'
                          ? <span className="tt-time-lbl">{slot.label}</span>
                          : <span className="tt-break-time-lbl">{slot.label}</span>
                        }
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(isMobile ? [selectedDay] : DAYS).map((day, di) => (
                    <tr
                      key={day}
                      className={`tt-row ${day === todayName ? 'tt-row--today' : ''}`}
                    >
                      {/* Day label cell */}
                      <td className="tt-td tt-td-day">
                        <span>{DAY_SHORT[day]}</span>
                        {day === todayName && <span className="tt-today-dot" />}
                      </td>

                      {activeTimeSlots.map((slot, si) => {
                        // Break columns — span all rows, only render on first day
                        if (slot.type === 'break') {
                          if (isMobile) {
                            return (
                              <td key={slot.key} className="tt-td tt-td-break">
                                <span className="tt-break-lbl">{slot.breakLabel}</span>
                              </td>
                            )
                          }
                          if (di === 0) return (
                            <td
                              key={slot.key}
                              className={`tt-td tt-td-break`}
                              rowSpan={DAYS.length}
                            >
                              <span className="tt-break-lbl">{slot.breakLabel}</span>
                            </td>
                          )
                          return null
                        }

                        // Lesson cell
                        const cell = getCell(day, slot.period)

                        return (
                          <td
                            key={slot.key}
                            className="tt-td tt-td-cell"
                          >
                            {cell ? (
                              <div
                                className="tt-cell"
                                title={`${cell.subject_name}${cell.class_name ? ' — ' + cell.class_name : ''}${cell.class_stream ? ' ' + cell.class_stream : ''}`}
                              >
                                <span className="tt-cell-subj">
                                  {cell.subject_code || cell.subject_name?.slice(0, 4)?.toUpperCase()}
                                </span>
                                <span className="tt-cell-class">
                                  <Users size={8} />
                                  {cell.class_name?.trim()}
                                  {cell.class_stream ? ` ${cell.class_stream}` : ''}
                                </span>
                              </div>
                            ) : (
                              <span className="tt-cell-dash">–</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="tt-print-footer">
                <div className="tt-print-footer-left">PREPARED BY ……………………………………………………………</div>
                <div className="tt-print-footer-right">SCHOOL STAMP……………………………………………………………</div>
              </div>
            </div>
          </div>

          {/* Today's detail list — only shown when there are lessons today */}
          {todayLessons.length > 0 && (
            <div className="tt-today">
              <div className="tt-today-hdr">
                <Clock size={14} /> Today — {todayName}
              </div>
              <div className="tt-today-list">
                {todayLessons
                  .slice()
                  .sort((a, b) => a.period - b.period)
                  .map((l, i) => (
                    <div key={i} className="tt-today-item">
                      <span className="tt-today-time">{l.start_time}–{l.end_time}</span>
                      <span className="tt-today-subj">{l.subject_name}</span>
                      <span className="tt-today-cls">
                        {l.class_name}{l.class_stream ? ` ${l.class_stream}` : ''}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
