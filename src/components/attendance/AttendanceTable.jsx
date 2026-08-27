import { CheckCircle, XCircle, Clock, UserMinus, ClipboardList } from 'lucide-react'

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
  noRecordsMessage = 'No attendance records for this date',
  noStudentMessage = 'No students found',
}) {
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
                        {s.full_name?.split(' ').map((n) => n[0]).join('').slice(0, 2)}
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
                      {r.students?.full_name?.split(' ').map((n) => n[0]).join('').slice(0, 2)}
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
