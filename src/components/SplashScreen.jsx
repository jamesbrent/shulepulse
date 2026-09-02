import { useEffect, useState, useRef } from 'react'
import logoImg from '../assets/logo.png'
import './SplashScreen.css'

const MIN_DISPLAY_MS = 2200
const FADE_MS = 450

export default function SplashScreen({ ready, onDone }) {
  const [exiting, setExiting] = useState(false)
  const dismissed = useRef(false)
  const tRef = useRef(null)

  useEffect(() => {
    if (!ready || dismissed.current) return

    tRef.current = setTimeout(() => {
      dismissed.current = true
      setExiting(true)
      setTimeout(onDone, FADE_MS)
    }, MIN_DISPLAY_MS)

    return () => clearTimeout(tRef.current)
  }, [ready, onDone])

  return (
    <div className={`sp-root${exiting ? ' sp-exiting' : ''}`} role="status" aria-label="Loading">
      <div className="sp-content">
        <div className="sp-logo-wrap">
          <img src={logoImg} alt="" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 14 }} />
        </div>

        <h1 className="sp-brand">
          <span className="sp-brand-shule">Shule</span>
          <span className="sp-brand-pulse">Pulse</span>
        </h1>

        <p className="sp-tagline">Run Your School Smarter</p>

        <div className="sp-loader">
          <span className="sp-dot" />
          <span className="sp-dot" />
          <span className="sp-dot" />
        </div>
      </div>

      <span className="sp-version">ShulePulse</span>
    </div>
  )
}
