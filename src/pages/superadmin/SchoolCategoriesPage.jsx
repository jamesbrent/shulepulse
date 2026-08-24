import { useState, useEffect } from 'react'
import { ListTree, Plus, Pencil, Trash2, Check, X, Loader } from 'lucide-react'
import { fetchSchoolTypes, addSchoolType, updateSchoolType, deleteSchoolType } from '../../features/superadmin/lookupService'
import { logAction } from '../../features/audit/auditService'

export default function SchoolCategoriesPage() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchSchoolTypes()
      setCategories(data)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const handleAdd = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    if (categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('Category already exists.')
      return
    }
    setAdding(true); setError('')
    try {
      const created = await addSchoolType(trimmed)
      setCategories(prev => [...prev, created])
      setNewName('')
      logAction({ action: 'school_category.add', details: { name: trimmed } })
    } catch (e) {
      setError(e.message)
    }
    setAdding(false)
  }

  const handleUpdate = async (id) => {
    const trimmed = editName.trim()
    if (!trimmed) return
    if (categories.some(c => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('Category already exists.')
      return
    }
    setSaving(true); setError('')
    try {
      await updateSchoolType(id, trimmed)
      setCategories(prev => prev.map(c => c.id === id ? { ...c, name: trimmed } : c))
      setEditId(null)
      logAction({ action: 'school_category.update', details: { id, name: trimmed } })
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}"? This won't affect schools already using it.`)) return
    setError('')
    try {
      await deleteSchoolType(id)
      setCategories(prev => prev.filter(c => c.id !== id))
      logAction({ action: 'school_category.delete', details: { id, name } })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="sa-categories">
      <div className="sa-categories-header">
        <div>
          <h2><ListTree size={18} /> School Categories</h2>
          <p className="sa-categories-desc">Manage the categories shown when onboarding or editing a school.</p>
        </div>
      </div>

      {error && <div className="sa-categories-error">{error}</div>}

      {/* Add form */}
      <div className="sa-categories-add">
        <input
          placeholder="New category name..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          disabled={adding}
        />
        <button className="sa-btn sa-btn--primary" onClick={handleAdd} disabled={adding || !newName.trim()}>
          {adding ? <Loader size={14} className="spin" /> : <Plus size={14} />}
          Add
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="sa-categories-loading"><Loader size={18} className="spin" /> Loading...</div>
      ) : categories.length === 0 ? (
        <div className="sa-categories-empty">No categories found.</div>
      ) : (
        <div className="sa-categories-list">
          {categories.map(c => (
            <div key={c.id} className="sa-categories-row">
              {editId === c.id ? (
                <>
                  <input
                    className="sa-categories-edit-input"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleUpdate(c.id)}
                    autoFocus
                    disabled={saving}
                  />
                  <div className="sa-categories-row-actions">
                    <button className="sa-btn-icon sa-btn-icon--green" onClick={() => handleUpdate(c.id)} disabled={saving}>
                      {saving ? <Loader size={14} className="spin" /> : <Check size={14} />}
                    </button>
                    <button className="sa-btn-icon sa-btn-icon--gray" onClick={() => setEditId(null)} disabled={saving}>
                      <X size={14} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="sa-categories-name">{c.name}</span>
                  <div className="sa-categories-row-actions">
                    <button className="sa-btn-icon" onClick={() => { setEditId(c.id); setEditName(c.name) }}>
                      <Pencil size={14} />
                    </button>
                    <button className="sa-btn-icon sa-btn-icon--red" onClick={() => handleDelete(c.id, c.name)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
