import { StudentAvatar } from './StudentAvatar'

export function StudentCard({ student, onClick, actions }) {
  return (
    <div className="student-card" onClick={() => onClick?.(student)}>
      <div className="student-card-body">
        <StudentAvatar name={student.full_name} photoUrl={student.photo_url} size={44} />
        <div className="student-card-info">
          <p className="student-card-name">{student.full_name}</p>
          <div className="student-card-meta">
            <span className="student-card-adm">{student.admission_number}</span>
            <span className="student-card-class">{student.class}{student.stream ? ` — ${student.stream}` : ''}</span>
          </div>
        </div>
        <span className={`status-badge ${student.status}`}>{student.status}</span>
      </div>
      {actions && <div className="student-card-actions">{actions}</div>}
    </div>
  )
}
