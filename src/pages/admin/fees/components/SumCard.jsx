export function SumCard({ color, icon: Icon, label, value, bar, sub }) {
  return (
    <div className={`fee-sum-card ${color}`}>
      <div className={`fee-sum-icon-wrap`}>
        <Icon />
      </div>
      <div className="fee-sum-body">
        <p className="fsc-label">{label}</p>
        <p className="fsc-value">{value}</p>
        {sub && <p className="fsc-sub">{sub}</p>}
      </div>
      {bar !== undefined && (
        <div className="rate-bar-track">
          <div className="rate-bar-fill" style={{ width: `${bar}%` }} />
        </div>
      )}
    </div>
  )
}
