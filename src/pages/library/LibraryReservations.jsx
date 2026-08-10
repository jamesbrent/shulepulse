import { useState, useEffect } from 'react'
import { Plus, Search, BookMarked, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { memberTypeLabel, fmtDate } from '../../lib/library'

export default function LibraryReservations({ schoolId }) {
  const [reservations, setReservations] = useState([])
  const [books, setBooks] = useState([])
  const [members, setMembers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ book_id: '', member_id: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [schoolId])

  const fetchAll = async () => {
    setLoading(true)
    const [resRes, booksRes, membersRes] = await Promise.all([
      supabase.from('library_reservations')
        .select('*, books:library_books(title, author, available_copies), members:library_members(full_name, member_type, member_code)')
        .eq('school_id', schoolId)
        .order('reserved_at', { ascending: false })
        .limit(100),
      supabase.from('library_books').select('*').eq('school_id', schoolId).order('title'),
      supabase.from('library_members').select('*').eq('school_id', schoolId).eq('status', 'active').order('full_name'),
    ])
    setReservations(resRes.data || [])
    setBooks(booksRes.data || [])
    setMembers(membersRes.data || [])
    setLoading(false)
  }

  const filtered = reservations.filter(r => {
    const q = search.toLowerCase()
    return !q || r.books?.title?.toLowerCase().includes(q) || r.members?.full_name?.toLowerCase().includes(q)
  })

  const addReservation = async () => {
    setError('')
    if (!form.book_id || !form.member_id) {
      setError('Select both a book and a member')
      return
    }
    setSaving(true)
    const { data: existing } = await supabase
      .from('library_reservations')
      .select('id')
      .eq('book_id', form.book_id).eq('member_id', form.member_id).eq('status', 'pending')
    if (existing && existing.length) {
      setError('This member already has a pending reservation for this book')
      setSaving(false)
      return
    }
    const { data, error: err } = await supabase.from('library_reservations').insert({
      school_id: schoolId,
      book_id: form.book_id,
      member_id: form.member_id,
      status: 'pending',
      reserved_at: new Date().toISOString(),
    }).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    const rich = { ...data, books: books.find(b => b.id === form.book_id), members: members.find(m => m.id === form.member_id) }
    setReservations(prev => [rich, ...prev])
    setShowAdd(false)
    setForm({ book_id: '', member_id: '' })
    setSaving(false)
  }

  const cancel = async (r) => {
    await supabase.from('library_reservations').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', r.id)
    setReservations(prev => prev.map(x => x.id === r.id ? { ...x, status: 'cancelled', cancelled_at: new Date().toISOString() } : x))
  }

  const statusStyle = {
    pending: { background: '#dbeafe', color: '#2563eb' },
    available: { background: '#dcfce7', color: '#16a34a' },
    fulfilled: { background: '#f1f5f9', color: '#475569' },
    cancelled: { background: '#fee2e2', color: '#dc2626' },
  }

  if (loading) return <div className="lib-loading">Loading reservations...</div>

  return (
    <div>
      <div className="lib-toolbar">
        <div className="lib-search">
          <Search size={15} color="#94a3b8" />
          <input placeholder="Search reservations..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="lib-btn lib-btn-blue" onClick={() => { setShowAdd(true); setError('') }}>
          <Plus size={15} /> New Reservation
        </button>
      </div>

      <div className="lib-card">
        <div className="lib-card-header">
          <div>
            <h2>Reservations ({filtered.length})</h2>
            <p>Members waiting for books</p>
          </div>
          <BookMarked size={16} color="#94a3b8" />
        </div>

        {filtered.length === 0 ? (
          <div className="lib-empty">
            <BookMarked size={36} color="#cbd5e1" />
            <p>No reservations</p>
            <span>Reserved books will appear here</span>
          </div>
        ) : (
          <div className="lib-table-wrap">
            <table className="lib-table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Member</th>
                  <th>Type</th>
                  <th>Reserved On</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td>
                      <span style={{ display: 'block', fontWeight: 600 }}>{r.books?.title || '—'}</span>
                      <span className="text-muted" style={{ fontSize: 11, color: '#94a3b8' }}>{r.books?.author || ''}</span>
                    </td>
                    <td>{r.members?.full_name || '—'}</td>
                    <td>{memberTypeLabel(r.members?.member_type)}</td>
                    <td>{fmtDate(r.reserved_at)}</td>
                    <td>
                      <span className="lib-badge" style={statusStyle[r.status] || statusStyle.pending}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {['pending', 'available'].includes(r.status) && (
                          <button className="lib-btn" onClick={() => cancel(r)}>
                            <X size={14} /> Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="lib-modal-backdrop" onClick={() => !saving && setShowAdd(false)}>
          <div className="lib-modal" onClick={e => e.stopPropagation()}>
            <div className="lib-modal-header">
              <h3>New Reservation</h3>
              <button className="lib-modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            </div>
            <div className="lib-modal-body">
              {error && (
                <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 500, marginBottom: 12 }}>
                  {error}
                </div>
              )}
              <label className="lib-label">Book</label>
              <select className="lib-select" style={{ width: '100%', marginBottom: 14 }} value={form.book_id} onChange={e => setForm({ ...form, book_id: e.target.value })}>
                <option value="">Select book...</option>
                {books.map(b => (
                  <option key={b.id} value={b.id}>{b.title}{b.available_copies > 0 ? ' (available)' : ' (borrowed)'}</option>
                ))}
              </select>
              <label className="lib-label">Member</label>
              <select className="lib-select" style={{ width: '100%' }} value={form.member_id} onChange={e => setForm({ ...form, member_id: e.target.value })}>
                <option value="">Select member...</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.full_name} ({memberTypeLabel(m.member_type)})</option>
                ))}
              </select>
            </div>
            <div className="lib-modal-footer">
              <button className="lib-btn" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="lib-btn lib-btn-blue" onClick={addReservation} disabled={saving}>
                {saving ? 'Saving...' : 'Create Reservation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
