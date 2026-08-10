import { X, Save } from 'lucide-react'

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ModalActions({ onCancel, saving, label }) {
  return (
    <div className="modal-actions">
      <button type="button" className="btn-secondary" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className="btn-primary" disabled={saving}>
        <Save size={15} /> {saving ? 'Saving…' : label}
      </button>
    </div>
  )
}