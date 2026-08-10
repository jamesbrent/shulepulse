import { CheckCircle, XCircle, Clock, UserMinus, TrendingUp } from 'lucide-react'

export default function AttendanceSummary({ students, attendance }) {
  const total = students.length
  const present = students.filter((s) => (attendance[s.id] || 'present') === 'present').length
  const absent = students.filter((s) => attendance[s.id] === 'absent').length
  const late = students.filter((s) => attendance[s.id] === 'late').length
  const excused = students.filter((s) => attendance[s.id] === 'excused').length
  const marked = present + absent + late + excused
  const rate = marked > 0 ? Math.round((present / marked) * 100) : 0

  const cards = [
    { label: 'Present', value: present, color: '#16a34a', bg: '#dcfce7', icon: <CheckCircle size={20} /> },
    { label: 'Absent', value: absent, color: '#dc2626', bg: '#fee2e2', icon: <XCircle size={20} /> },
    { label: 'Late', value: late, color: '#ca8a04', bg: '#fef9c3', icon: <Clock size={20} /> },
    { label: 'Excused', value: excused, color: '#2563eb', bg: '#dbeafe', icon: <UserMinus size={20} /> },
  ]

  return (
    <div className="att-summary">
      {cards.map((c) => (
        <div className="att-sum-card" key={c.label}>
          <div className="att-sum-icon" style={{ color: c.color, background: c.bg }}>
            {c.icon}
          </div>
          <div>
            <p className="asc-label">{c.label}</p>
            <p className="asc-value" style={{ color: c.color }}>{c.value}</p>
          </div>
        </div>
      ))}
      <div className="att-sum-card att-sum-rate">
        <div className="att-sum-icon blue" style={{ color: '#2563eb', background: '#dbeafe' }}>
          <TrendingUp size={20} />
        </div>
        <div>
          <p className="asc-label">Attendance Rate</p>
          <p className="asc-value" style={{ color: '#2563eb' }}>{rate}%</p>
        </div>
        <div className="att-rate-track">
          <div className="att-rate-fill" style={{ width: `${rate}%` }} />
        </div>
      </div>
    </div>
  )
}
