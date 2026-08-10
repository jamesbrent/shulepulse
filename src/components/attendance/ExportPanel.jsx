import { useState, useEffect, useMemo } from 'react'
import {
  Calendar, FileSpreadsheet, FileText, Share2, Search, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fetchExportData, exportAttendanceExcel, exportMonthlyAttendanceExcel, exportAttendancePDF, exportAttendanceWhatsApp, computeSummary, getTermStartDate, getWeeksInTerm } from '../../services/attendance/exportAttendance'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const TERMS = ['Term 1', 'Term 2', 'Term 3']

export default function ExportPanel({
  schoolId,
  classes,
  streams,
  filterClass,
  filterStream,
  onClassChange,
  onStreamChange,
  school,
  currentTerm,
  currentYear,
  termDates,
  assignedClasses,
}) {
  const [mode, setMode] = useState('daterange')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [month, setMonth] = useState(new Date().getMonth())
  const [year, setYear] = useState(new Date().getFullYear())
  const [term, setTerm] = useState(currentTerm || 'Term 1')
  const [weekNumber, setWeekNumber] = useState(1)
  const [termStartInput, setTermStartInput] = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const [students, setStudents] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentLoading, setStudentLoading] = useState(false)
  const [studentDropdownOpen, setStudentDropdownOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  const termStart = useMemo(() => {
    if (termStartInput) return new Date(termStartInput + 'T00:00:00')
    return getTermStartDate(term, currentYear, termDates)
  }, [term, currentYear, termDates, termStartInput])

  const weeks = useMemo(() => getWeeksInTerm(termStart), [termStart])

  const effectiveRange = useMemo(() => {
    if (mode === 'daterange') return { startDate, endDate, label: startDate && endDate ? `${startDate} to ${endDate}` : '' }
    if (mode === 'monthly') {
      const s = new Date(year, month, 1)
      const e = new Date(year, month + 1, 0)
      return { startDate: s.toISOString().split('T')[0], endDate: e.toISOString().split('T')[0], label: `${MONTHS[month]} ${year}` }
    }
    if (mode === 'weekly') {
      const wk = weeks[weekNumber - 1]
      return { startDate: wk.startDate, endDate: wk.endDate, label: wk.label }
    }
    return { startDate: '', endDate: '', label: '' }
  }, [mode, startDate, endDate, month, year, weeks, weekNumber])

  const loadStudents = async (search) => {
    setStudentLoading(true)
    let q = supabase
      .from('students')
      .select('id, full_name, admission_number, class, stream')
      .eq('school_id', schoolId)
      .eq('status', 'active')
    if (filterClass && filterClass !== 'all') q = q.eq('class', filterClass)
    if (search) {
      q = q.or(`full_name.ilike.%${search}%,admission_number.ilike.%${search}%`)
    }
    const { data } = await q.limit(20)
    setStudents(data || [])
    setStudentLoading(false)
  }

  useEffect(() => {
    if (!studentDropdownOpen && !studentQuery) return
    const timer = setTimeout(() => loadStudents(studentQuery), studentQuery ? 200 : 0)
    return () => clearTimeout(timer)
  }, [studentQuery, studentDropdownOpen, schoolId, filterClass])

  const handleExport = async (format) => {
    if (!effectiveRange.startDate || !effectiveRange.endDate) { alert('Please select a date range first.'); return }
    setExporting(true)
    try {
      const records = await fetchExportData({
        schoolId,
        startDate: effectiveRange.startDate,
        endDate: effectiveRange.endDate,
        className: filterClass !== 'all' ? filterClass : undefined,
        classNames: filterClass === 'all' && assignedClasses?.length ? assignedClasses : undefined,
        stream: filterStream || undefined,
        studentId: selectedStudent?.id,
        status: statusFilter || undefined,
      })

      if (records.length === 0) { alert('No records found for the selected filters.'); return }

      const summary = computeSummary(records)
      const dateLabel = effectiveRange.label
      const title = `Attendance Report ${dateLabel}`

      if (format === 'excel') {
        if (mode === 'monthly') {
          exportMonthlyAttendanceExcel(records, { title, year, month })
        } else {
          exportAttendanceExcel(records, { title, dateLabel, summary, school })
        }
      } else if (format === 'pdf') {
        await exportAttendancePDF(records, { school, title, dateLabel, termInfo: mode === 'weekly' ? `${term} Week ${weekNumber}` : '', isMonthly: mode === 'monthly', year, month })
      } else if (format === 'whatsapp') {
        await exportAttendanceWhatsApp(records, { school, title, dateLabel })
      }
    } catch (err) {
      alert('Export error: ' + err.message)
    }
    setExporting(false)
  }

  const selectStudent = (s) => {
    setSelectedStudent(s)
    setStudentQuery(`${s.full_name} (${s.admission_number})`)
    setStudents([])
    setStudentDropdownOpen(false)
  }

  const clearFilters = () => {
    setStartDate(''); setEndDate('')
    setMonth(new Date().getMonth())
    setYear(new Date().getFullYear())
    setTerm(currentTerm || 'Term 1')
    setWeekNumber(1)
    setTermStartInput('')
    setStudentQuery('')
    setSelectedStudent(null)
    setStatusFilter('')
  }

  const hasRange = effectiveRange.startDate && effectiveRange.endDate

  return (
    <div className="att-export-panel">
      <div className="att-trend-header">
        <h3 className="att-trend-title"><FileSpreadsheet size={16} /> Export & Reports</h3>
      </div>
      <div className="att-export-panel-body">
          {/* Mode selector */}
          <div className="att-ep-section">
            <label className="att-ep-label">Export Mode</label>
            <div className="att-ep-mode-tabs">
              {[
                { key: 'daterange', label: 'Date Range' },
                { key: 'monthly', label: 'Monthly' },
                { key: 'weekly', label: 'Term / Week' },
              ].map(m => (
                <button
                  key={m.key}
                  className={`att-ep-mode-tab ${mode === m.key ? 'active' : ''}`}
                  onClick={() => setMode(m.key)}
                >
                  {m.key === 'daterange' && <Calendar size={12} />}
                  {m.key === 'monthly' && <Calendar size={12} />}
                  {m.key === 'weekly' && <Calendar size={12} />}
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="att-ep-fields">
            {/* Date Range Mode */}
            {mode === 'daterange' && (
              <div className="att-ep-field-row">
                <div className="att-ep-field">
                  <label className="att-ep-label">Start Date</label>
                  <input type="date" className="att-ep-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="att-ep-field">
                  <label className="att-ep-label">End Date</label>
                  <input type="date" className="att-ep-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
            )}

            {/* Monthly Mode */}
            {mode === 'monthly' && (
              <div className="att-ep-field-row">
                <div className="att-ep-field">
                  <label className="att-ep-label">Month</label>
                  <select className="att-ep-input" value={month} onChange={e => setMonth(Number(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                </div>
                <div className="att-ep-field">
                  <label className="att-ep-label">Year</label>
                  <select className="att-ep-input" value={year} onChange={e => setYear(Number(e.target.value))}>
                    {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Weekly / Term Mode */}
            {mode === 'weekly' && (
              <div className="att-ep-field-row">
                <div className="att-ep-field">
                  <label className="att-ep-label">Term</label>
                  <select className="att-ep-input" value={term} onChange={e => setTerm(e.target.value)}>
                    {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="att-ep-field">
                  <label className="att-ep-label">Term Start Date</label>
                  <input type="date" className="att-ep-input" value={termStartInput} onChange={e => setTermStartInput(e.target.value)} placeholder={termStart.toISOString().split('T')[0]} />
                </div>
                <div className="att-ep-field">
                  <label className="att-ep-label">Week</label>
                  <select className="att-ep-input" value={weekNumber} onChange={e => setWeekNumber(Number(e.target.value))}>
                    {weeks.map((w, i) => <option key={i} value={i + 1}>{w.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Class / Stream / Status Filters */}
            <div className="att-ep-field-row">
              {classes && classes.length > 0 && (
                <div className="att-ep-field">
                  <label className="att-ep-label">Class</label>
                  <select className="att-ep-input" value={filterClass || 'all'} onChange={e => onClassChange?.(e.target.value)}>
                    <option value="all">All Classes</option>
                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              {streams && streams.length > 0 && (
                <div className="att-ep-field">
                  <label className="att-ep-label">Stream</label>
                  <select className="att-ep-input" value={filterStream || ''} onChange={e => onStreamChange?.(e.target.value)}>
                    <option value="">All Streams</option>
                    {streams.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div className="att-ep-field">
                <label className="att-ep-label">Status</label>
                <select className="att-ep-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                  <option value="excused">Excused</option>
                </select>
              </div>
            </div>

            {/* Student search */}
            <div className="att-ep-field-row">
              <div className="att-ep-field" style={{ flex: 2, position: 'relative' }}>
                <label className="att-ep-label">Student (optional)</label>
                <div className="att-ep-student-search">
                  <Search size={13} className="att-ep-search-icon" />
                  <input
                    className="att-ep-input"
                    placeholder="Search student name or adm no..."
                    value={studentQuery}
                    onChange={e => setStudentQuery(e.target.value)}
                    onFocus={() => { setStudentDropdownOpen(true); if (!selectedStudent) loadStudents('') }}
                    onBlur={() => setTimeout(() => setStudentDropdownOpen(false), 200)}
                  />
                  {selectedStudent && (
                    <button className="att-ep-clear-student" onClick={() => { setSelectedStudent(null); setStudentQuery(''); setStudents([]) }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                {studentDropdownOpen && !selectedStudent && (
                  <div className="att-ep-student-dropdown">
                    {studentLoading && students.length === 0 && (
                      <div className="att-ep-student-option" style={{ color: '#94a3b8', cursor: 'default' }}>Loading...</div>
                    )}
                    {!studentLoading && students.length === 0 && (
                      <div className="att-ep-student-option" style={{ color: '#94a3b8', cursor: 'default' }}>No students found</div>
                    )}
                    {students.map(s => (
                      <button key={s.id} className="att-ep-student-option" onClick={() => selectStudent(s)}>
                        {s.full_name}{' \u2014 '}<span className="text-muted">{s.admission_number}{' \u00B7 '}{s.class}{s.stream ? ' ' + s.stream : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Selected range display */}
          {hasRange && (
            <div className="att-ep-range-badge">
              <Calendar size={13} />
              <span>{effectiveRange.label}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="att-ep-actions">
            <button className="att-ep-action-btn clear" onClick={clearFilters}>
              <X size={13} /> Clear
            </button>
            <div className="att-ep-action-right">
              <button className="att-ep-action-btn excel" onClick={() => handleExport('excel')} disabled={exporting || !hasRange}>
                <FileSpreadsheet size={14} /> {exporting ? 'Exporting...' : 'Excel'}
              </button>
              <button className="att-ep-action-btn pdf" onClick={() => handleExport('pdf')} disabled={exporting || !hasRange}>
                <FileText size={14} /> PDF
              </button>
              <button className="att-ep-action-btn whatsapp" onClick={() => handleExport('whatsapp')} disabled={exporting || !hasRange}>
                <Share2 size={14} /> Share
              </button>
            </div>
          </div>
        </div>
    </div>
  )
}
