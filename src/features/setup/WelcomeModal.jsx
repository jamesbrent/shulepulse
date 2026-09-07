import { Rocket, LayoutDashboard, X } from 'lucide-react'
import { setSetupChoice } from './setupService'
import './SetupAssistant.css'

export default function WelcomeModal({ user, onChoose }) {
  const choose = (mode) => {
    setSetupChoice(user?.id, mode)
    onChoose?.(mode)
  }

  return (
    <div className="su-welcome-overlay">
      <div className="su-welcome">
        <button className="su-welcome-close" onClick={() => choose('dashboard')} aria-label="Skip">
          <X size={16} />
        </button>

        <div className="su-welcome-badge"><Rocket size={22} /></div>
        <h2>Welcome to ShulePulse</h2>
        <p className="su-welcome-sub">
          Your school is ready. Choose how you'd like to set it up.
        </p>

        <div className="su-welcome-options">
          <button className="su-welcome-opt su-welcome-opt--primary" onClick={() => choose('guided')}>
            <Rocket size={20} />
            <div>
              <strong>Guided Setup</strong>
              <span>Recommended for new ShulePulse users</span>
            </div>
          </button>

          <button className="su-welcome-opt" onClick={() => choose('dashboard')}>
            <LayoutDashboard size={20} />
            <div>
              <strong>Go to Dashboard</strong>
              <span>I'll configure it myself</span>
            </div>
          </button>
        </div>

        <p className="su-welcome-note">
          You can switch between the Setup Assistant and the dashboard at any time.
        </p>
      </div>
    </div>
  )
}