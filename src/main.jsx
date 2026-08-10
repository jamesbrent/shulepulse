import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const params = new URLSearchParams(window.location.search)
const pendingPath = params.get('p')
if (pendingPath) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
  const q = params.get('q')
  const target =
    window.location.origin + base + pendingPath + (q ? `?${decodeURIComponent(q)}` : '') + window.location.hash
  window.history.replaceState(null, '', target)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
