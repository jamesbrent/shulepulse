const DEFAULT_PRIMARY = '#2563eb'
const DEFAULT_SECONDARY = '#16a34a'

export default function BrandPreview({ logoUrl, schoolName }) {
  const primaryColor = DEFAULT_PRIMARY
  const secondaryColor = DEFAULT_SECONDARY
  return (
    <div className="brand-preview">
      <p className="bp-label">Live Preview</p>
      <div className="bp-shell">

        {/* Mini sidebar */}
        <div className="bp-sidebar" style={{ background: '#020B24' }}>
          <div className="bp-sidebar-top">
            {logoUrl ? (
              <img src={logoUrl} alt="logo" className="bp-logo-img" />
            ) : (
              <div className="bp-logo-dot" style={{ background: primaryColor }}>
                {schoolName?.[0] || 'S'}
              </div>
            )}
            <span className="bp-school-name">{schoolName || 'School Name'}</span>
          </div>
          <div className="bp-nav-items">
            {['Dashboard', 'Students', 'Fees', 'Grades'].map((item, i) => (
              <div
                key={item}
                className="bp-nav-item"
                style={i === 0 ? { background: primaryColor, color: '#fff' } : {}}
              >
                <div className="bp-nav-dot" style={{ background: i === 0 ? '#fff' : '#475569' }} />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Mini content */}
        <div className="bp-content">
          <div className="bp-header" style={{ borderBottom: `2px solid ${primaryColor}20` }}>
            <div className="bp-header-title">Admin Dashboard</div>
            <div className="bp-btn" style={{ background: primaryColor }}>+ Add</div>
          </div>

          <div className="bp-cards">
            {['Students', 'Fees', 'Attendance'].map((c, i) => (
              <div key={c} className="bp-card">
                <div className="bp-card-dot" style={{ background: i === 0 ? primaryColor : i === 1 ? secondaryColor : '#ca8a04' }} />
                <div>
                  <div className="bp-card-val" style={{ color: i === 0 ? primaryColor : i === 1 ? secondaryColor : '#ca8a04' }}>
                    {i === 0 ? '248' : i === 1 ? '92%' : '87%'}
                  </div>
                  <div className="bp-card-lbl">{c}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="bp-badges-row">
            <span className="bp-badge" style={{ background: `${primaryColor}18`, color: primaryColor }}>Active</span>
            <span className="bp-badge" style={{ background: `${secondaryColor}18`, color: secondaryColor }}>Paid</span>
            <span className="bp-badge bp-badge-grey">Pending</span>
          </div>
        </div>
      </div>
    </div>
  )
}