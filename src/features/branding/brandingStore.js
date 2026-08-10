import { create } from 'zustand'

const STYLE_ID = 'shulepulse-branding'

function injectBrandStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    :root {
      --color-primary: #2563eb;
      --color-secondary: #16a34a;
    }
    .btn-primary { background: var(--color-primary); }
    .btn-primary:hover { background: color-mix(in srgb, var(--color-primary) 85%, black); }
    .sidebar-logo, .school-avatar, .admin-avatar { background: var(--color-primary); }
    .nav-item.active { background: var(--color-primary); color: #fff; }
    .fees-tab-btn.active { background: var(--color-primary); color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .pay-type-btn.active, .provider-btn.active, .adj-type-btn.active { background: var(--color-primary); color: #fff; }
    .view-all { color: var(--color-primary); }
    .quick-action-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
    a { color: var(--color-primary); }
    .stat-card .stat-icon { color: var(--color-primary); }
  `
  document.head.appendChild(style)
}

export const useBrandingStore = create((set) => ({
  primaryColor: '#2563eb',
  secondaryColor: '#16a34a',
  logoUrl: null,
  schoolName: '',

  setBranding: ({ primaryColor, secondaryColor, logoUrl, schoolName }) => {
    set({
      primaryColor: primaryColor || '#2563eb',
      secondaryColor: secondaryColor || '#16a34a',
      logoUrl: logoUrl || null,
      schoolName: schoolName || '',
    })
  },

  applyToDOM: (primary, secondary) => {
    injectBrandStyles()
    document.documentElement.style.setProperty('--color-primary', primary || '#2563eb')
    document.documentElement.style.setProperty('--color-secondary', secondary || '#16a34a')
  },
}))