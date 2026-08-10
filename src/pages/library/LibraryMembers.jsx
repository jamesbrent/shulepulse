import { useState, useEffect } from 'react'
import { Plus, Search, Users, X, UserPlus, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { memberTypeLabel, fetchRules, ruleForType, syncLibraryMembers } from '../../lib/library'

export default function LibraryMembers({ schoolId }) {
  const [members, setMembers] = useState([])
  const [search, setSearch] = useState('')
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ full_name: '', member_type: 'student', member_code: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAll()
  }, [schoolId])

  const fetchAll = async () => {
    setLoading(true)
    await syncLibraryMembers(schoolId)
    const [res, rulesRes] = await Promise.all([
      supabase.from('library_members').select('*').eq('school_id', schoolId).order('full_name'),
      fetchRules(schoolId),
    ])
    setMembers(res.data || [])
    setRules(rulesRes)
    setLoading(false)
  }

  const resync = async () => {
    setSyncing(true)
    await syncLibraryMembers(schoolId)
    const { data } = await supabase.from('library_members').select('*').eq('school_id', schoolId).order('full_name')
    setMembers(data || [])
    setSyncing(false)
  }

  const filtered = members.filter(m => {
    const q = search.toLowerCase()
    return !q || m.full_name?.toLowerCase().includes(q) || m.member_code?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
  })

  const addMember = async () => {
    setError('')
    if (!form.full_name.trim() || !form.member_code.trim()) {
      setError('Name and member code are required')
      return
    }
    setSaving(true)
    const { data, error: err } = await supabase.from('library_members').insert({
      school_id: schoolId,
      full_name: form.full_name.trim(),
      member_type: form.member_type,
      member_code: form.member_code.trim(),
      status: 'active',
    }).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    setMembers(prev => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)))
    setShowAdd(false)
    setForm({ full_name: '', member_type: 'student', member_code: '' })
    setSaving(false)
  }

  const toggleStatus = async (m) => {
    const next = m.status === 'active' ? 'suspended' : 'active'
    await supabase.from('library_members').update({ status: next }).eq('id', m.id)
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, status: next } : x))
  }

  const deleteMember = async (m) => {
    if (!window.confirm(`Remove ${m.full_name} from library members?`)) return
    await supabase.from('library_members').delete().eq('id', m.id)
    setMembers(prev => prev.filter(x => x.id !== m.id))
  }

  if (loading) return <div className="lib-loading">Loading members...</div>

  return (
    <div>
      <div className="lib-toolbar">
        <div className="lib-search">
          <Search size={15} color="#94a3b8" />
          <input placeholder="Search by name, code or email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="lib-btn" onClick={resync} disabled={syncing}>
          <RefreshCw size={15} className={syncing ? 'lib-spin' : ''} /> {syncing ? 'Syncing...' : 'Sync Users'}
        </button>
        <button className="lib-btn lib-btn-blue" onClick={() => { setShowAdd(true); setError('') }}>
          <UserPlus size={15} /> Add Guest
        </button>
      </div>

      <div className="lib-card">
        <div className="lib-card-header">
          <div>
            <h2>Library Members ({filtered.length})</h2>
            <p>Auto-synced from this school's registered users</p>
          </div>
          <Users size={16} color="#94a3b8" />
        </div>

        {filtered.length === 0 ? (
          <div className="lib-empty">
            <Users size={36} color="#cbd5e1" />
            <p>No members found</p>
            <span>Add users to the school or press "Sync Users" to refresh</span>
          </div>
        ) : (
          <div className="lib-table-wrap">
            <table className="lib-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Email</th>
                  <th>Allowed</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => {
                  const rule = ruleForType(rules, m.member_type)
                  return (
                    <tr key={m.id}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span className="lib-avatar-sm">{(m.full_name || '?')[0]}</span>
                          <span>
                            <span style={{ display: 'block', fontWeight: 600 }}>{m.full_name}</span>
                            <span className="text-muted" style={{ fontSize: 11, color: '#94a3b8' }}>{m.id.slice(0, 8)}</span>
                          </span>
                        </span>
                      </td>
                      <td>{m.member_code || '—'}</td>
                      <td>{memberTypeLabel(m.member_type)}</td>
                      <td>{m.email || '—'}</td>
                      <td>{m.books_allowed || rule?.books_allowed || 3} books</td>
                      <td>
                        <span className="lib-badge" style={{ background: m.status === 'active' ? '#dcfce7' : '#f1f5f9', color: m.status === 'active' ? '#16a34a' : '#64748b' }}>
                          <span className="lib-dot" style={{ background: m.status === 'active' ? '#16a34a' : '#94a3b8' }} />
                          {m.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="lib-btn" onClick={() => toggleStatus(m)}>
                            {m.status === 'active' ? 'Suspend' : 'Activate'}
                          </button>
                          {!m.profile_id && (
                            <button className="lib-btn lib-btn-danger" onClick={() => deleteMember(m)} title="Remove">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="lib-modal-backdrop" onClick={() => !saving && setShowAdd(false)}>
          <div className="lib-modal" onClick={e => e.stopPropagation()}>
            <div className="lib-modal-header">
              <h3>Add Guest Member</h3>
              <button className="lib-modal-close" onClick={() => setShowAdd(false)}><Plus size={18} style={{ transform: 'rotate(45deg)' }} /></button>
            </div>
            <div className="lib-modal-body">
              {error && (
                <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 500, marginBottom: 12 }}>
                  {error}
                </div>
              )}
              <label className="lib-label">Full Name</label>
              <input className="lib-input" style={{ width: '100%', marginBottom: 14 }} value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Jane Wanjiku" />
              <label className="lib-label">Member Code</label>
              <input className="lib-input" style={{ width: '100%', marginBottom: 14 }} value={form.member_code} onChange={e => setForm({ ...form, member_code: e.target.value })} placeholder="e.g. STU-2026-001" />
              <label className="lib-label">Member Type</label>
              <select className="lib-select" style={{ width: '100%' }} value={form.member_type} onChange={e => setForm({ ...form, member_type: e.target.value })}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
                <option value="librarian">Librarian</option>
              </select>
            </div>
            <div className="lib-modal-footer">
              <button className="lib-btn" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="lib-btn lib-btn-blue" onClick={addMember} disabled={saving}>
                {saving ? 'Adding...' : 'Add Guest'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
