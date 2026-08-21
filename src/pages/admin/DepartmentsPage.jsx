import { useState, useEffect } from 'react'
import { Building2, Plus, Edit, Trash2, X, GraduationCap, Briefcase } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import './DepartmentsPage.css'

const CATEGORIES = [
  { value: 'academic', label: 'Academic', icon: <GraduationCap size={14} />, color: '#dbeafe', fg: '#1d4ed8' },
  { value: 'support', label: 'Support', icon: <Briefcase size={14} />, color: '#fef3c7', fg: '#92400e' },
]

export default function DepartmentsPage() {
  const { profile } = useAuthStore()
  const schoolId = profile?.school_id
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm] = useState({ name: '', category: 'academic' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchDepts = async () => {
    if (!schoolId) return
    setLoading(true)
    const { data } = await supabase.from('departments').select('*').eq('school_id', schoolId).order('category').order('name')
    setDepartments(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchDepts() }, [schoolId])

  const openAdd = () => { setEditTarget(null); setForm({ name: '', category: 'academic' }); setError(''); setShowModal(true) }
  const openEdit = (d) => { setEditTarget(d); setForm({ name: d.name, category: d.category }); setError(''); setShowModal(true) }

  const save = async () => {
    if (!form.name.trim()) return setError('Department name is required')
    setSaving(true)
    setError('')
    const payload = { name: form.name.trim(), category: form.category, school_id: schoolId }
    const { error: err } = editTarget
      ? await supabase.from('departments').update(payload).eq('id', editTarget.id)
      : await supabase.from('departments').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    setShowModal(false)
    fetchDepts()
    setSaving(false)
  }

  const remove = async (d) => {
    if (!confirm(`Delete "${d.name}"? This will not remove it from staff records.`)) return
    await supabase.from('departments').delete().eq('id', d.id)
    fetchDepts()
  }

  const academic = departments.filter((d) => d.category === 'academic')
  const support = departments.filter((d) => d.category === 'support')

  if (loading) return <div className="dept-loading">Loading departments...</div>

  return (
    <div className="dept-root">
      <div className="dept-header">
        <div>
          <h2>Departments</h2>
          <p>Manage academic and support departments for your school</p>
        </div>
        <button className="dept-btn-add" onClick={openAdd}><Plus size={14} /> Add Department</button>
      </div>

      {departments.length === 0 ? (
        <div className="dept-empty">
          <Building2 size={36} />
          <h3>No departments yet</h3>
          <p>Departments are automatically created when you add staff with department assignments, or you can add them manually.</p>
        </div>
      ) : (
        <div className="dept-sections">
          {academic.length > 0 && (
            <div className="dept-section">
              <h3 className="dept-section-title"><GraduationCap size={16} /> Academic Departments ({academic.length})</h3>
              <div className="dept-grid">
                {academic.map((d) => (
                  <div key={d.id} className="dept-card">
                    <div className="dept-card-body">
                      <h4>{d.name}</h4>
                    </div>
                    <div className="dept-card-actions">
                      <button onClick={() => openEdit(d)}><Edit size={13} /></button>
                      <button className="dept-del" onClick={() => remove(d)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {support.length > 0 && (
            <div className="dept-section">
              <h3 className="dept-section-title"><Briefcase size={16} /> Support Departments ({support.length})</h3>
              <div className="dept-grid">
                {support.map((d) => (
                  <div key={d.id} className="dept-card">
                    <div className="dept-card-body">
                      <h4>{d.name}</h4>
                    </div>
                    <div className="dept-card-actions">
                      <button onClick={() => openEdit(d)}><Edit size={13} /></button>
                      <button className="dept-del" onClick={() => remove(d)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="dept-overlay" onClick={() => setShowModal(false)}>
          <div className="dept-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dept-modal-head">
              <h3>{editTarget ? 'Edit Department' : 'Add Department'}</h3>
              <button onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div className="dept-modal-body">
              {error && <div className="dept-error">{error}</div>}
              <label className="dept-field">
                <span>Department Name *</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sciences" />
              </label>
              <label className="dept-field">
                <span>Category</span>
                <div className="dept-cat-options">
                  {CATEGORIES.map((c) => (
                    <button key={c.value} className={`dept-cat-btn ${form.category === c.value ? 'active' : ''}`} onClick={() => setForm({ ...form, category: c.value })} style={form.category === c.value ? { background: c.color, color: c.fg, borderColor: c.fg } : {}}>
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
              </label>
            </div>
            <div className="dept-modal-foot">
              <button className="dept-btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="dept-btn-save" disabled={saving} onClick={save}>{saving ? 'Saving...' : editTarget ? 'Save Changes' : 'Add Department'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
