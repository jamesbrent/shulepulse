import { useState } from 'react'
import { CheckCircle, XCircle, Clock, UserMinus, ClipboardList, ChevronRight, X } from 'lucide-react'

const getInitials = (name) => {
  const parts = (name || '').trim().split(/\s+/)
  if (parts.length === 0) return ''
  if (parts.length === 1) return (parts[0].slice(0, 2)).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const STATUS_META = {
  present: { icon: <CheckCircle size={14} />, label: 'Present', cls: 'present' },
  absent: { icon: <XCircle size={14} />, label: 'Absent', cls: 'absent' },
  late: { icon: <Clock size={14} />, label: 'Late', cls: 'late' },
  excused: { icon: <UserMinus size={14} />, label: 'Excused', cls: 'excused' },
}

export default function AttendanceTable({
  students,
  attendance,
  onStatusChange,
  notes,
  onNotesChange,
  records,
  loading,
  canEdit = false,
  showNotes = false,
  showAdm = true,
  showClass = false,
  showMarkedBy = false,
  showTime = false,
  showRemarks = false,
  mobileCards = false,
  noRecordsMessage = 'No attendance records for this date',
  noStudentMessage = 'No students found',
}) {
  const [sheetStudent, setSheetStudent] = useState(null)
  if (loading) {
    return <p className="loading-state">Loading attendance...</p>
  }

  const isEditMode = canEdit && onStatusChange

  if (isEditMode && students.length === 0) {
    return (
      <div className="empty-att">
        <ClipboardList size={40} color="#cbd5e1" />
        <p>{noStudentMessage}</p>
      </div>
    )
  }

  if (!isEditMode && records && records.length === 0) {
    return (
      <div className="empty-att">
        <ClipboardList size={40} color="#cbd5e1" />
        <p>{noRecordsMessage}</p>
        <span>Records appear here once teachers mark attendance</span>
      </div>
    )
  }

  const renderStatusCell = (studentId, currentStatus) => {
    if (!canEdit) {
      return (
        <span className={`att-badge ${currentStatus || 'present'}`}>
          {STATUS_META[currentStatus]?.icon}
          {STATUS_META[currentStatus]?.label || 'Present'}
        </span>
      )
    }
    return (
      <div className="att-status-buttons">
        {Object.entries(STATUS_META).map(([key, meta]) => (
          <button
            key={key}
            className={`att-status-btn ${meta.cls} ${(currentStatus || 'present') === key ? 'active' : ''}`}
            onClick={() => onStatusChange(studentId, key)}
          >
            {meta.icon}
            {meta.label}
          </button>
        ))}
      </div>
    )
  }

  const rows = isEditMode
    ? students
    : (records || [])

  if (mobileCards && (isEditMode ? students.length > 0 : (records || []).length > 0)) {
    const recMode = !isEditMode
    const list = isEditMode ? students : (records || [])
    return (
      <div className="att-mob-list">
        {list.map((it) => {
          const name = recMode ? it.students?.full_name : it.full_name
          const adm = recMode ? it.students?.admission_number : it.admission_number
          const klass = recMode ? it.students?.class : it.class
          const status = recMode ? (it.status || 'present') : (attendance[it.id] || 'present')
          const note = recMode ? (it.notes || '') : (notes?.[it.id] || '')
          const rowId = recMode ? (it.student_id || it.id) : it.id
          const time = recMode && showTime && it.created_at
            ? new Date(it.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
            : ''
          return (
            <div
              key={rowId}
              className="att-mob-row"
              onClick={isEditMode ? () => setSheetStudent(it) : undefined}
            >
              <div className="att-mob-row-main">
                <div className="student-avatar-sm">{getInitials(name)}</div>
                <div className="att-mob-row-info">
                  <div className="att-mob-row-name">{name || 'Unknown student'}</div>
                  <div className="att-mob-row-sub">
                    {adm || '—'}
                    {klass ? ` · ${klass}` : ''}
                    {time ? ` · ${time}` : ''}
                  </div>
                  {showNotes && note && <div className="att-mob-row-note">{note}</div>}
                </div>
              </div>
              <div className="att-mob-row-right">
                <span
                  className={`att-mob-chip att-mob-chip--${status}`}
                  title={STATUS_META[status]?.label}
                >
                  {STATUS_META[status]?.icon || <CheckCircle size={16} />}
                </span>
                {isEditMode && (
                  <button
                    className="att-mob-row-btn"
                    aria-label={`Mark ${name}`}
                    onClick={(e) => { e.stopPropagation(); setSheetStudent(it) }}
                  >
                    <ChevronRight size={18} />
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {sheetStudent && (
          <div className="att-sheet-overlay" onClick={() => setSheetStudent(null)}>
            <div className="att-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="att-sheet-handle" />
              <div className="att-sheet-head">
                <div className="att-sheet-title">
                  <div className="student-avatar-sm">{getInitials(sheetStudent.full_name)}</div>
                  <div>
                    <div className="att-sheet-name">{sheetStudent.full_name}</div>
                    <div className="att-sheet-sub">
                      {sheetStudent.admission_number || '—'}
                      {sheetStudent.class ? ` · ${sheetStudent.class}` : ''}
                    </div>
                  </div>
                </div>
                <button className="att-sheet-close" aria-label="Close" onClick={() => setSheetStudent(null)}>
                  <X size={20} />
                </button>
              </div>

              <div className="att-sheet-options">
                {Object.entries(STATUS_META).map(([key, meta]) => {
                  const active = (attendance[sheetStudent.id] || 'present') === key
                  return (
                    <button
                      key={key}
                      className={`att-sheet-opt ${meta.cls} ${active ? 'active' : ''}`}
                      onClick={() => { onStatusChange?.(sheetStudent.id, key); setSheetStudent(null) }}
                    >
                      {meta.icon}
                      {meta.label}
                    </button>
                  )
                })}
              </div>

              {showNotes && (
                <textarea
                  className="att-sheet-note"
                  placeholder="Optional note..."
                  value={notes?.[sheetStudent.id] || ''}
                  onChange={(e) => onNotesChange?.(sheetStudent.id, e.target.value)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="att-table-wrap">
      <table className="att-table att-card-table">
        <thead>
          <tr>
            <th>Student</th>
            {showAdm && <th>Adm No.</th>}
            {showClass && <th>Class</th>}
            <th>Status</th>
            {showNotes && <th>Notes</th>}
            {showMarkedBy && <th>Marked By</th>}
            {showTime && <th>Time</th>}
            {showRemarks && <th>Remarks</th>}
          </tr>
        </thead>
        <tbody>
          {isEditMode ? (
            rows.map((s) => {
              const status = attendance[s.id] || 'present'
              return (
                <tr key={s.id}>
                  <td data-label="Student">
                    <div className="student-name-cell">
                      <div className="student-avatar-sm">
                        {getInitials(s.full_name)}
                      </div>
                      {s.full_name}
                    </div>
                  </td>
                  {showAdm && <td className="adm-no" data-label="Adm No.">{s.admission_number || '—'}</td>}
                  {showClass && <td data-label="Class">{s.class || '—'}</td>}
                  <td data-label="Status">{renderStatusCell(s.id, status)}</td>
                  {showNotes && (
                    <td data-label="Notes">
                      <input
                        className="att-notes-input"
                        placeholder="Optional note..."
                        value={notes?.[s.id] || ''}
                        onChange={(e) => onNotesChange?.(s.id, e.target.value)}
                      />
                    </td>
                  )}
                  {showMarkedBy && <td className="text-muted" data-label="Marked By">—</td>}
                  {showTime && <td className="text-muted" data-label="Time">—</td>}
                  {showRemarks && <td className="text-muted" data-label="Remarks">—</td>}
                </tr>
              )
            })
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Student">
                  <div className="student-name-cell">
<div className="student-avatar-sm">
                        {getInitials(r.students?.full_name)}
                      </div>
                    {r.students?.full_name}
                  </div>
                </td>
                {showAdm && <td className="adm-no" data-label="Adm No.">{r.students?.admission_number || '—'}</td>}
                {showClass && <td data-label="Class">{r.students?.class || '—'}</td>}
                <td data-label="Status">{renderStatusCell(r.student_id, r.status)}</td>
                {showNotes && <td className="text-muted" data-label="Notes">{r.notes || '—'}</td>}
                {showMarkedBy && <td className="text-muted" data-label="Marked By">{r.teacher_name || '—'}</td>}
                {showTime && (
                  <td className="text-muted" data-label="Time">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </td>
                )}
                {showRemarks && <td className="text-muted" data-label="Remarks">{r.remarks || '—'}</td>}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
