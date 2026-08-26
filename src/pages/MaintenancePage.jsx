export default function MaintenancePage({ message }) {
  return (
    <div className="maintenance-page">
      <div className="maintenance-wrap">
        <span className="maintenance-tape">Site closed — work in progress</span>
        <h1 className="maintenance-title">We're building<br />something better</h1>
        <p className="maintenance-sub">
          {message || 'Our crew is on site upgrading things behind the scenes. Check back shortly — we\'ll be quick.'}
        </p>

        <div className="maintenance-scene" aria-hidden="true">
          <div className="m-ground"></div>

          <div className="m-worker m-w-hammer">
            <div className="m-figure">
              <div className="m-hat"></div>
              <div className="m-head"></div>
              <div className="m-torso"></div>
              <div className="m-leg m-leg-l"></div>
              <div className="m-leg m-leg-r"></div>
              <div className="m-arm-hammer"><div className="m-hammer-head"></div></div>
              <div className="m-spark"></div>
            </div>
          </div>

          <div className="m-wall">
            <div className="m-brick-row">
              <div className="m-brick"></div><div className="m-brick"></div><div className="m-brick"></div>
              <div className="m-brick"></div><div className="m-brick"></div><div className="m-brick"></div><div className="m-brick"></div>
            </div>
            <div className="m-brick-row">
              <div className="m-brick"></div><div className="m-brick"></div><div className="m-brick"></div>
              <div className="m-brick"></div><div className="m-brick"></div><div className="m-brick"></div><div className="m-brick"></div>
            </div>
            <div className="m-brick-row">
              <div className="m-brick"></div><div className="m-brick"></div><div className="m-brick"></div>
              <div className="m-brick"></div><div className="m-brick"></div><div className="m-brick"></div><div className="m-brick"></div>
            </div>
            <div className="m-brick-row">
              <div className="m-brick"></div><div className="m-brick"></div><div className="m-brick"></div>
              <div className="m-brick"></div><div className="m-brick"></div><div className="m-brick"></div><div className="m-brick"></div>
            </div>
          </div>

          <div className="m-barrow-track">
            <div className="m-dust m-dust-1"></div>
            <div className="m-dust m-dust-2"></div>
            <div className="m-barrow-unit">
              <div className="m-barrow-figure">
                <div className="m-hat"></div>
                <div className="m-head"></div>
                <div className="m-torso"></div>
                <div className="m-leg m-leg-l"></div>
                <div className="m-leg m-leg-r"></div>
                <div className="m-barrow-arm"></div>
              </div>
              <div className="m-cart"></div>
              <div className="m-cart-handle"></div>
            </div>
          </div>

          <div className="m-crane">
            <div className="m-crane-mast"></div>
            <div className="m-crane-arm"></div>
            <div className="m-crane-cable"></div>
            <div className="m-crane-hook"></div>
          </div>
        </div>

        <p className="maintenance-progress">Progress <b>underway</b> — no ETA needed, just patience</p>
        <p className="maintenance-footer">— the team</p>
      </div>
    </div>
  )
}
