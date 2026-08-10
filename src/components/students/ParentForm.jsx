import { Plus, X } from 'lucide-react'

const EMPTY_GUARDIAN = {
  parent_name: '',
  relationship: '',
  phone: '',
  email: '',
  national_id: '',
  occupation: '',
  physical_address: '',
}

export function ParentForm({ guardians, onChange }) {
  const list = guardians?.length ? guardians : [EMPTY_GUARDIAN]

  const update = (index, field, value) => {
    const next = [...list]
    next[index] = { ...next[index], [field]: value }
    onChange(next)
  }

  const add = () => onChange([...list, { ...EMPTY_GUARDIAN }])

  const remove = (index) => {
    if (list.length <= 1) return
    onChange(list.filter((_, i) => i !== index))
  }

  return (
    <div className="parent-form">
      <div className="parent-form-header">
        <p className="form-section-label">Parent / Guardian Information</p>
        <button type="button" className="btn-ghost sm" onClick={add}>
          <Plus size={14} /> Add Guardian
        </button>
      </div>

      {list.map((g, i) => (
        <div key={i} className="guardian-card">
          {list.length > 1 && (
            <div className="guardian-card-head">
              <span className="guardian-label">Guardian {i + 1}</span>
              <button type="button" className="guardian-remove" onClick={() => remove(i)}>
                <X size={14} />
              </button>
            </div>
          )}
          <div className="form-grid">
            <div className="form-field full">
              <label>Parent / Guardian Name *</label>
              <input
                required={i === 0}
                placeholder="e.g. John Kamau"
                value={g.parent_name}
                onChange={e => update(i, 'parent_name', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Relationship</label>
              <select value={g.relationship} onChange={e => update(i, 'relationship', e.target.value)}>
                <option value="">Select</option>
                <option value="father">Father</option>
                <option value="mother">Mother</option>
                <option value="guardian">Guardian</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-field">
              <label>Phone *</label>
              <input
                required={i === 0}
                placeholder="e.g. 0712345678"
                value={g.phone}
                onChange={e => update(i, 'phone', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Email (for portal login)</label>
              <input
                type="email"
                placeholder="parent@email.com"
                value={g.email}
                onChange={e => update(i, 'email', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>National ID</label>
              <input placeholder="ID Number" value={g.national_id} onChange={e => update(i, 'national_id', e.target.value)} />
            </div>
            <div className="form-field">
              <label>Occupation</label>
              <input placeholder="e.g. Teacher" value={g.occupation} onChange={e => update(i, 'occupation', e.target.value)} />
            </div>
            <div className="form-field full">
              <label>Physical Address</label>
              <input placeholder="e.g. 123 Nairobi" value={g.physical_address} onChange={e => update(i, 'physical_address', e.target.value)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
