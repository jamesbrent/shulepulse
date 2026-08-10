import { useState } from 'react'

const PRESETS = [
  '#2563eb', '#7c3aed', '#db2777', '#dc2626',
  '#ea580c', '#ca8a04', '#16a34a', '#0891b2',
  '#0f172a', '#475569',
]

export default function ColorPicker({ label, value, onChange }) {
  const [showCustom, setShowCustom] = useState(false)

  return (
    <div className="color-picker">
      <p className="cp-label">{label}</p>
      <div className="cp-presets">
        {PRESETS.map(c => (
          <button
            key={c}
            type="button"
            className={`cp-swatch ${value === c ? 'active' : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            title={c}
          />
        ))}
        <button
          type="button"
          className="cp-swatch cp-custom-btn"
          title="Custom color"
          onClick={() => setShowCustom(v => !v)}
          style={{ background: PRESETS.includes(value) ? '#f1f5f9' : value }}
        >
          {PRESETS.includes(value) ? (
            <span style={{ fontSize: 16, color: '#64748b', lineHeight: 1 }}>+</span>
          ) : (
            <span style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>HEX</span>
          )}
        </button>
      </div>
      {showCustom && (
        <div className="cp-custom-row">
          <div className="cp-preview-dot" style={{ background: value }} />
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="cp-native"
          />
          <input
            type="text"
            className="cp-hex-input"
            value={value}
            maxLength={7}
            onChange={e => {
              const v = e.target.value
              if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v)
            }}
            placeholder="#000000"
          />
        </div>
      )}
    </div>
  )
}