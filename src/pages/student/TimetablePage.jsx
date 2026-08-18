import { useState, useEffect, useRef } from 'react'
import { Calendar, Download, BookOpen } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import './TimetablePage.css'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DAY_SHORT = { Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED', Thursday: 'THUR', Friday: 'FRI' }

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

const getTimeSlotsForBand = (classNameOrLevel) => {
  const band = getCBCBand(classNameOrLevel || '')
  if (band === 'PP') return TIME_SLOTS_BY_BAND.PP
  if (band === 'LOWER_PRIMARY' || band === 'UPPER_PRIMARY') return TIME_SLOTS_BY_BAND.PRIMARY
  return TIME_SLOTS_BY_BAND.SECONDARY
}

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

export default function TimetablePage({ student, school }) {
  const [slots, setSlots] = useState([])
  const [className, setClassName] = useState('')
  const [loading, setLoading] = useState(true)
  const printRef = useRef(null)

  useEffect(() => {
    if (!student?.id) { setLoading(false); return }
    const schoolId = school?.id || student.school_id
    if (!schoolId) { setLoading(false); return }
    setLoading(true)

    const load = async () => {
      try {
        const { data: classes } = await supabase
          .from('classes')
          .select('id, class_name, name')
          .eq('school_id', schoolId)
          .order('class_name')

        const match = (classes || []).find(c =>
          (c.class_name || c.name || '').toLowerCase() === (student.class || '').toLowerCase()
        )
        setClassName(match?.class_name || student?.class || '')

        let query = supabase
          .from('timetable_slots')
          .select('*, subjects(name, code), teachers(full_name, staff_number), rooms(name)')
          .eq('school_id', schoolId)

        if (match) query = query.eq('class_id', match.id)
        const { data } = await query
        setSlots(data || [])
      } catch (e) {
        console.error('timetable:', e)
        setSlots([])
      }
      setLoading(false)
    }
    load()
  }, [student?.id, student?.class, school?.id])

  const activeTimeSlots = getTimeSlotsForBand(student?.class || className)
  const getCell = (day, period) =>
    slots.find(s => s.day === day && s.period === period) || null

  const term = school?.current_term || 'Term 1'
  const year = school?.current_year || new Date().getFullYear()

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html>
        <head>
          <title>${(className || 'Class')} Timetable</title>
          <style>
            @page { size: A4 landscape; margin: 2mm; }
            * { box-sizing: border-box; font-family: Arial, sans-serif; }
            html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
            .st-print-area { width: 100%; padding: 0; }
            .st-print-school-name { text-align:center; font-size:14px; font-weight:700; margin-bottom:2px; }
            .st-print-heading { text-align:center; font-size:16px; font-weight:900; text-decoration:underline; text-transform:uppercase; margin-bottom:4px; }
            .st-print-footer { display:flex; justify-content:space-between; margin-top:4px; font-size:10px; }
            .st-print-table { width:100%; border-collapse:collapse; border:2px solid #111; }
            .st-print-table th, .st-print-table td { border:1.5px solid #111; padding:5px 6px; text-align:center; vertical-align:middle; }
            .st-print-table th { background:#f1f1f1; font-size:11px; font-weight:700; }
            .st-print-table .st-th-break, .st-print-table .st-td-break { background:#f8f8f8; width:22px; }
            .st-print-table .st-td-day { font-size:12px; font-weight:900; background:#f1f1f1; width:40px; }
            .st-print-table .st-td-lesson { height:auto; }
            .st-cell { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:20px; gap:2px; padding:3px; }
            .st-cell-code { font-size:11px; font-weight:700; font-style:italic; }
            .st-cell-teacher { font-size:9px; color:#555; background:#eee; padding:1px 4px; border-radius:2px; }
            .st-break-label { writing-mode:vertical-rl; transform:rotate(180deg); font-size:9px; font-weight:900; }
          </style>
        </head>
        <body>${content.outerHTML}</body>
      </html>
    `)
    win.document.close()
    win.onload = () => { win.focus(); win.print(); win.close() }
  }

  if (loading) return (
    <div className="sp-loading-container">
      <div className="sp-loading-spinner" />
      <p>Loading your timetable...</p>
    </div>
  )

  const subjectsList = [...new Set(slots.map(s => s.subjects?.name || s.subject_name).filter(Boolean))]

  return (
    <div className="sp-page">
      <div className="sp-toolbar">
        <div className="sp-toolbar-left">
          <span className="sp-badge">{className || 'Your class'} · {term} {year}</span>
          <span className="sp-badge">{slots.length} lessons</span>
        </div>
        <div className="sp-toolbar-right">
          <button className="sp-btn-primary" onClick={handlePrint} disabled={slots.length === 0}>
            <Download size={15} /> Download PDF
          </button>
        </div>
      </div>

      {slots.length === 0 ? (
        <div className="sp-card">
          <div className="sp-empty-state">
            <Calendar size={40} color="#94a3b8" />
            <p>No timetable published for {student?.class || 'your class'} yet</p>
          </div>
        </div>
      ) : (
        <div className="sp-card">
          <div className="st-grid-wrapper">
            <div className="st-grid-scroll">
              <div ref={printRef} className="st-print-area">
                <div className="st-print-school-name">{(school?.name || '').toUpperCase()}</div>
                <div className="st-print-heading">{className || 'Class'} — Weekly Timetable</div>

                <table className="st-print-table">
                  <thead>
                    <tr>
                      <th className="st-th st-th-day">DAY</th>
                      {activeTimeSlots.map(slot => (
                        <th key={slot.key} className={`st-th ${slot.type === 'break' ? 'st-th-break' : 'st-th-lesson'}`}>
                          {slot.type === 'lesson'
                            ? <span className="st-time-label">{slot.label}</span>
                            : <span className="st-break-time">{slot.label}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map((day, di) => (
                      <tr key={day} className="st-row">
                        <td className="st-td st-td-day"><span>{DAY_SHORT[day]}</span></td>
                        {activeTimeSlots.map(slot => {
                          if (slot.type === 'break') {
                            if (di === 0) return (
                              <td key={slot.key} className={`st-td st-td-break st-break-${slot.key}`} rowSpan={DAYS.length}>
                                <span className="st-break-label">{slot.breakLabel}</span>
                              </td>
                            )
                            return null
                          }

                          const cell = getCell(day, slot.period)
                          return (
                            <td key={slot.key} className="st-td st-td-lesson">
                              {cell ? (
                                <div className="st-cell" style={{ background: cell.subjects?.name ? subjectColour(cell.subjects.name) : '#f1f5f9' }}>
                                  <span className="st-cell-code">{cell.subjects?.code || cell.subject_code || cell.subjects?.name?.slice(0, 4) || '—'}</span>
                                  {cell.rooms?.name && <span className="st-cell-teacher" style={{ background: '#e0f2fe', color: '#0369a1' }}>{cell.rooms.name}</span>}
                                  {cell.teachers?.staff_number && <span className="st-cell-teacher">{cell.teachers.staff_number}</span>}
                                </div>
                              ) : (
                                <div className="st-cell st-cell-empty">
                                  <span className="st-cell-dash">–</span>
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="st-print-footer">
                  <div className="st-print-footer-left">PREPARED BY ……………………………………………………………</div>
                  <div className="st-print-footer-right">SCHOOL STAMP……………………………………………………………</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {subjectsList.length > 0 && (
        <div className="sp-card">
          <div className="sp-card-header">
            <h3><BookOpen size={16} /> Subjects this Term</h3>
          </div>
          <div className="sp-chip-wrap">
            {subjectsList.map(name => (
              <span key={name} className="sp-chip">{name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
