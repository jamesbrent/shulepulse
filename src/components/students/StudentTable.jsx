import { Edit, Trash2, Eye } from 'lucide-react'
import { StudentAvatar } from './StudentAvatar'

export function StudentTable({
  students,
  selectedIds,
  onSelect,
  onSelectAll,
  onView,
  onEdit,
  onDelete,
  loading,
}) {
  const allSelected = students.length > 0 && selectedIds.length === students.length

  if (loading) {
    return <div className="loading-state">Loading students...</div>
  }

  if (students.length === 0) {
    return (
      <div className="empty-state-table">
        <p>No students match your filters.</p>
      </div>
    )
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th className="th-check">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onSelectAll?.(!allSelected)}
              />
            </th>
            <th>Adm No.</th>
            <th>Full Name</th>
            <th>Class</th>
            <th>Stream</th>
            <th>Gender</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {students.map(s => (
            <tr key={s.id} className={selectedIds.includes(s.id) ? 'row-selected' : ''}>
              <td className="td-check">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(s.id)}
                  onChange={() => onSelect?.(s.id)}
                />
              </td>
              <td className="adm-no">{s.admission_number}</td>
              <td>
                <div className="student-name-cell" style={{ cursor: 'pointer' }} onClick={() => onView(s)}>
                  <StudentAvatar name={s.full_name} photoUrl={s.photo_url} />
                  {s.full_name}
                </div>
              </td>
              <td>{s.class || '—'}</td>
              <td>{s.stream || '—'}</td>
              <td className="capitalize">{s.gender || '—'}</td>
              <td>
                <span className={`status-badge ${s.status}`}>{s.status}</span>
              </td>
              <td>
                <div className="action-btns">
                  <button className="action-btn" onClick={() => onView(s)} title="View Profile">
                    <Eye size={13} />
                  </button>
                  <button className="action-btn" onClick={() => onEdit(s)} title="Edit">
                    <Edit size={13} />
                  </button>
                  <button className="action-btn danger" onClick={() => onDelete(s)} title="Remove">
                    <Trash2 size={13} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
