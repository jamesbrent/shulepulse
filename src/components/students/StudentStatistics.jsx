import { Users, UserCheck, UserX, GraduationCap, UserPlus, Activity } from 'lucide-react'

export function StudentStatistics({ stats, loading }) {
  if (loading) return <div className="loading-state">Loading stats...</div>
  if (!stats) return null

  const cards = [
    { label: 'Total Students', value: stats.total, icon: Users, color: '#2563eb' },
    { label: 'Active', value: stats.active, icon: UserCheck, color: '#16a34a' },
    { label: 'Inactive', value: stats.inactive, icon: UserX, color: '#dc2626' },
    { label: 'Alumni', value: stats.alumni, icon: GraduationCap, color: '#7c3aed' },
    { label: 'Boys', value: stats.boys, icon: Activity, color: '#0891b2' },
    { label: 'Girls', value: stats.girls, icon: Activity, color: '#db2777' },
  ]

  return (
    <>
      <div className="summary-grid">
        {cards.map(c => (
          <div key={c.label} className="summary-card">
            <div className="summary-card-icon" style={{ color: c.color, background: `${c.color}15` }}>
              <c.icon size={20} />
            </div>
            <div className="summary-card-body">
              <p className="summary-card-value">{c.value}</p>
              <p className="summary-card-label">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="stats-chart-row">
        <div className="stats-chart-card">
          <p className="stats-chart-title">Class Distribution</p>
          <div className="stats-bar-list">
            {Object.entries(stats.classDist).sort().map(([cls, count]) => {
              const pct = stats.total ? (count / stats.total) * 100 : 0
              return (
                <div key={cls} className="stats-bar-row">
                  <span className="stats-bar-label">{cls}</span>
                  <div className="stats-bar-track">
                    <div className="stats-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="stats-bar-count">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="stats-chart-card">
          <p className="stats-chart-title">Stream Distribution</p>
          <div className="stats-bar-list">
            {Object.entries(stats.streamDist).sort().map(([stream, count]) => {
              const pct = stats.total ? (count / stats.total) * 100 : 0
              return (
                <div key={stream} className="stats-bar-row">
                  <span className="stats-bar-label">{stream}</span>
                  <div className="stats-bar-track">
                    <div className="stats-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="stats-bar-count">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
