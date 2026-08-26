import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const params = new URLSearchParams(window.location.search)
const pendingPath = params.get('p')
if (pendingPath && !params.has('q')) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
  const target =
    window.location.origin + base + pendingPath + window.location.hash
  window.history.replaceState(null, '', target)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
