import { Settings } from 'lucide-react'
import logoImg from '../assets/logo.png'

export default function MaintenancePage({ message }) {
  return (
    <div className="maintenance-page">
      <div className="maintenance-card">
        <img src={logoImg} alt="ShulePulse" className="maintenance-logo" />
        <div className="maintenance-icon">
          <Settings size={28} />
        </div>
        <h1>Scheduled Maintenance</h1>
        <p className="maintenance-message">
          {message || 'ShulePulse is currently undergoing scheduled maintenance. Please check back shortly.'}
        </p>
        <p className="maintenance-sub">
          If you are a superadmin, you can still log in to disable maintenance mode.
        </p>
      </div>
    </div>
  )
}
