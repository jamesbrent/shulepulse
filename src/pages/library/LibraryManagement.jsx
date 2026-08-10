import { useState, useEffect } from 'react'
import { Plus, Search, Edit2, Trash2, X, BookOpen, BookMarked, FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fetchRules, MEMBER_TYPES } from '../../lib/library'

const TABS = [
  { id: 'books', label: 'Books' },
  { id: 'categories', label: 'Categories' },
  { id: 'shelves', label: 'Shelves' },
  { id: 'rules', label: 'Rules & Fines' },
]

export default function LibraryManagement({ schoolId }) {
  const [tab, setTab] = useState('books')
  const [books, setBooks] = useState([])
  const [categories, setCategories] = useState([])
  const [shelves, setShelves] = useState([])
  const [rules, setRules] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const [bookForm, setBookForm] = useState(null)
  const [bookErr, setBookErr] = useState('')
  const [catForm, setCatForm] = useState(null)
  const [shelfForm, setShelfForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [schoolId])

  const fetchAll = async () => {
    setLoading(true)
    const [b, c, s, r] = await Promise.all([
      supabase.from('library_books').select('*, categories(name), shelves(name)').eq('school_id', schoolId).order('title'),
      supabase.from('library_categories').select('*').eq('school_id', schoolId).order('name'),
      supabase.from('library_shelves').select('*').eq('school_id', schoolId).order('name'),
      fetchRules(schoolId),
    ])
    setBooks(b.data || [])
    setCategories(c.data || [])
    setShelves(s.data || [])
    setRules(r)
    setLoading(false)
  }

  const saveBook = async () => {
    setBookErr('')
    if (!bookForm.title.trim()) { setBookErr('Title is required'); return }
    setSaving(true)
    const payload = {
      school_id: schoolId,
      title: bookForm.title.trim(),
      author: bookForm.author.trim(),
      isbn: bookForm.isbn.trim(),
      subject: bookForm.subject.trim(),
      category_id: bookForm.category_id || null,
      shelf_id: bookForm.shelf_id || null,
      description: bookForm.description.trim(),
      total_copies: Number(bookForm.total_copies) || 1,
    }
    if (bookForm.id) {
      const { data, error } = await supabase.from('library_books').update(payload).eq('id', bookForm.id).select('*, categories(name), shelves(name)').single()
      if (error) { setBookErr(error.message); setSaving(false); return }
      setBooks(prev => prev.map(x => x.id === data.id ? data : x))
    } else {
      payload.available_copies = Number(bookForm.total_copies) || 1
      const { data, error } = await supabase.from('library_books').insert(payload).select('*, categories(name), shelves(name)').single()
      if (error) { setBookErr(error.message); setSaving(false); return }
      setBooks(prev => [data, ...prev])
    }
    setBookForm(null)
    setSaving(false)
  }

  const deleteBook = async (b) => {
    if (!window.confirm(`Delete "${b.title}" from the catalogue?`)) return
    await supabase.from('library_books').delete().eq('id', b.id)
    setBooks(prev => prev.filter(x => x.id !== b.id))
  }

  const saveCat = async () => {
    if (!catForm.name.trim()) return
    setSaving(true)
    const payload = { school_id: schoolId, name: catForm.name.trim(), description: catForm.description.trim() }
    if (catForm.id) {
      const { data } = await supabase.from('library_categories').update(payload).eq('id', catForm.id).select().single()
      setCategories(prev => prev.map(x => x.id === data.id ? data : x))
    } else {
      const { data } = await supabase.from('library_categories').insert(payload).select().single()
      setCategories(prev => [...prev, data])
    }
    setCatForm(null)
    setSaving(false)
  }

  const deleteCat = async (c) => {
    if (!window.confirm(`Delete category "${c.name}"?`)) return
    await supabase.from('library_categories').delete().eq('id', c.id)
    setCategories(prev => prev.filter(x => x.id !== c.id))
  }

  const saveShelf = async () => {
    if (!shelfForm.name.trim()) return
    setSaving(true)
    const payload = { school_id: schoolId, name: shelfForm.name.trim(), location: shelfForm.location.trim() }
    if (shelfForm.id) {
      const { data } = await supabase.from('library_shelves').update(payload).eq('id', shelfForm.id).select().single()
      setShelves(prev => prev.map(x => x.id === data.id ? data : x))
    } else {
      const { data } = await supabase.from('library_shelves').insert(payload).select().single()
      setShelves(prev => [...prev, data])
    }
    setShelfForm(null)
    setSaving(false)
  }

  const deleteShelf = async (s) => {
    if (!window.confirm(`Delete shelf "${s.name}"?`)) return
    await supabase.from('library_shelves').delete().eq('id', s.id)
    setShelves(prev => prev.filter(x => x.id !== s.id))
  }

  const updateRule = async (memberType, field, value) => {
    const existing = rules.find(r => r.member_type === memberType)
    if (!existing) return
    await supabase.from('library_rules').update({ [field]: value }).eq('id', existing.id)
    setRules(prev => prev.map(r => r.id === existing.id ? { ...r, [field]: value } : r))
  }

  const filteredBooks = books.filter(b => {
    const q = search.toLowerCase()
    return !q || b.title?.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q) || b.isbn?.toLowerCase().includes(q)
  })

  if (loading) return <div className="lib-loading">Loading management data...</div>

  return (
    <div>
      <div className="lib-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`lib-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'books' && (
        <div className="lib-card">
          <div className="lib-card-header">
            <div>
              <h2>Books ({books.length})</h2>
              <p>Manage the catalogue</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="lib-search">
                <Search size={15} color="#94a3b8" />
                <input placeholder="Search books..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <button className="lib-btn lib-btn-blue" onClick={() => {
                setBookErr('')
                setBookForm({ id: null, title: '', author: '', isbn: '', subject: '', category_id: '', shelf_id: '', description: '', total_copies: 1 })
              }}>
                <Plus size={15} /> Add Book
              </button>
            </div>
          </div>

          {filteredBooks.length === 0 ? (
            <div className="lib-empty">
              <BookOpen size={36} color="#cbd5e1" />
              <p>No books yet</p>
              <span>Add your first book to the catalogue</span>
            </div>
          ) : (
            <div className="lib-table-wrap">
              <table className="lib-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Author</th>
                    <th>ISBN</th>
                    <th>Subject</th>
                    <th>Category</th>
                    <th>Shelf</th>
                    <th>Copies</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBooks.map(b => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.title}</td>
                      <td>{b.author || '—'}</td>
                      <td>{b.isbn || '—'}</td>
                      <td>{b.subject || '—'}</td>
                      <td>{b.categories?.name || '—'}</td>
                      <td>{b.shelves?.name || '—'}</td>
                      <td>{b.available_copies}/{b.total_copies}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="lib-btn" onClick={() => {
                            setBookErr('')
                            setBookForm({
                              id: b.id, title: b.title, author: b.author || '', isbn: b.isbn || '',
                              subject: b.subject || '', category_id: b.category_id || '', shelf_id: b.shelf_id || '',
                              description: b.description || '', total_copies: b.total_copies,
                            })
                          }}><Edit2 size={14} /></button>
                          <button className="lib-btn lib-btn-danger" onClick={() => deleteBook(b)}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'categories' && (
        <div className="lib-card">
          <div className="lib-card-header">
            <div>
              <h2>Categories ({categories.length})</h2>
              <p>Organise books by subject area</p>
            </div>
            <button className="lib-btn lib-btn-blue" onClick={() => setCatForm({ id: null, name: '', description: '' })}>
              <Plus size={15} /> Add Category
            </button>
          </div>
          {categories.length === 0 ? (
            <div className="lib-empty"><BookMarked size={36} color="#cbd5e1" /><p>No categories</p></div>
          ) : (
            <div className="lib-list">
              {categories.map(c => (
                <div key={c.id} className="lib-list-item">
                  <span className="lib-avatar-sm" style={{ background: '#e0e7ff', color: '#3730a3' }}><BookMarked size={16} /></span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{c.name}</p>
                    <p style={{ fontSize: 12, color: '#94a3b8' }}>{c.description || 'No description'}</p>
                  </div>
                  <button className="lib-btn" onClick={() => setCatForm({ id: c.id, name: c.name, description: c.description || '' })}><Edit2 size={14} /></button>
                  <button className="lib-btn lib-btn-danger" onClick={() => deleteCat(c)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'shelves' && (
        <div className="lib-card">
          <div className="lib-card-header">
            <div>
              <h2>Shelves ({shelves.length})</h2>
              <p>Physical shelf locations</p>
            </div>
            <button className="lib-btn lib-btn-blue" onClick={() => setShelfForm({ id: null, name: '', location: '' })}>
              <Plus size={15} /> Add Shelf
            </button>
          </div>
          {shelves.length === 0 ? (
            <div className="lib-empty"><BookOpen size={36} color="#cbd5e1" /><p>No shelves</p></div>
          ) : (
            <div className="lib-list">
              {shelves.map(s => (
                <div key={s.id} className="lib-list-item">
                  <span className="lib-avatar-sm" style={{ background: '#cffafe', color: '#0e7490' }}><BookOpen size={16} /></span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{s.name}</p>
                    <p style={{ fontSize: 12, color: '#94a3b8' }}>{s.location || 'No location'}</p>
                  </div>
                  <button className="lib-btn" onClick={() => setShelfForm({ id: s.id, name: s.name, location: s.location || '' })}><Edit2 size={14} /></button>
                  <button className="lib-btn lib-btn-danger" onClick={() => deleteShelf(s)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'rules' && (
        <div className="lib-card">
          <div className="lib-card-header">
            <div>
              <h2>Borrowing Rules & Fines</h2>
              <p>Set limits and daily fines per member type</p>
            </div>
            <FileText size={16} color="#94a3b8" />
          </div>
          <div className="lib-table-wrap">
            <table className="lib-table">
              <thead>
                <tr>
                  <th>Member Type</th>
                  <th>Books Allowed</th>
                  <th>Loan Period (days)</th>
                  <th>Renewal Limit</th>
                  <th>Daily Fine (KES)</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{MEMBER_TYPES.find(t => t.value === r.member_type)?.label || r.member_type}</td>
                    <td><input type="number" min="0" className="lib-input lib-input-sm" value={r.books_allowed} onChange={e => updateRule(r.member_type, 'books_allowed', Number(e.target.value))} /></td>
                    <td><input type="number" min="1" className="lib-input lib-input-sm" value={r.loan_days} onChange={e => updateRule(r.member_type, 'loan_days', Number(e.target.value))} /></td>
                    <td><input type="number" min="0" className="lib-input lib-input-sm" value={r.renewal_limit} onChange={e => updateRule(r.member_type, 'renewal_limit', Number(e.target.value))} /></td>
                    <td><input type="number" min="0" className="lib-input lib-input-sm" value={r.fine_per_day} onChange={e => updateRule(r.member_type, 'fine_per_day', Number(e.target.value))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {bookForm && (
        <div className="lib-modal-backdrop" onClick={() => !saving && setBookForm(null)}>
          <div className="lib-modal lib-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="lib-modal-header">
              <h3>{bookForm.id ? 'Edit Book' : 'Add Book'}</h3>
              <button className="lib-modal-close" onClick={() => setBookForm(null)}><X size={18} /></button>
            </div>
            <div className="lib-modal-body">
              {bookErr && (
                <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 500, marginBottom: 12 }}>
                  {bookErr}
                </div>
              )}
              <div className="lib-form-grid">
                <div>
                  <label className="lib-label">Title *</label>
                  <input className="lib-input" value={bookForm.title} onChange={e => setBookForm({ ...bookForm, title: e.target.value })} />
                </div>
                <div>
                  <label className="lib-label">Author</label>
                  <input className="lib-input" value={bookForm.author} onChange={e => setBookForm({ ...bookForm, author: e.target.value })} />
                </div>
                <div>
                  <label className="lib-label">ISBN</label>
                  <input className="lib-input" value={bookForm.isbn} onChange={e => setBookForm({ ...bookForm, isbn: e.target.value })} />
                </div>
                <div>
                  <label className="lib-label">Subject</label>
                  <input className="lib-input" value={bookForm.subject} onChange={e => setBookForm({ ...bookForm, subject: e.target.value })} />
                </div>
                <div>
                  <label className="lib-label">Category</label>
                  <select className="lib-select" value={bookForm.category_id} onChange={e => setBookForm({ ...bookForm, category_id: e.target.value })}>
                    <option value="">None</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lib-label">Shelf</label>
                  <select className="lib-select" value={bookForm.shelf_id} onChange={e => setBookForm({ ...bookForm, shelf_id: e.target.value })}>
                    <option value="">None</option>
                    {shelves.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lib-label">Total Copies</label>
                  <input type="number" min="1" className="lib-input" value={bookForm.total_copies} onChange={e => setBookForm({ ...bookForm, total_copies: e.target.value })} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="lib-label">Description</label>
                  <textarea className="lib-input" rows={2} value={bookForm.description} onChange={e => setBookForm({ ...bookForm, description: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="lib-modal-footer">
              <button className="lib-btn" onClick={() => setBookForm(null)}>Cancel</button>
              <button className="lib-btn lib-btn-blue" onClick={saveBook} disabled={saving}>
                {saving ? 'Saving...' : bookForm.id ? 'Save Changes' : 'Add Book'}
              </button>
            </div>
          </div>
        </div>
      )}

      {catForm && (
        <div className="lib-modal-backdrop" onClick={() => !saving && setCatForm(null)}>
          <div className="lib-modal" onClick={e => e.stopPropagation()}>
            <div className="lib-modal-header">
              <h3>{catForm.id ? 'Edit Category' : 'Add Category'}</h3>
              <button className="lib-modal-close" onClick={() => setCatForm(null)}><X size={18} /></button>
            </div>
            <div className="lib-modal-body">
              <label className="lib-label">Name</label>
              <input className="lib-input" style={{ width: '100%', marginBottom: 14 }} value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} />
              <label className="lib-label">Description</label>
              <textarea className="lib-input" rows={2} style={{ width: '100%' }} value={catForm.description} onChange={e => setCatForm({ ...catForm, description: e.target.value })} />
            </div>
            <div className="lib-modal-footer">
              <button className="lib-btn" onClick={() => setCatForm(null)}>Cancel</button>
              <button className="lib-btn lib-btn-blue" onClick={saveCat} disabled={saving}>Save</button>
            </div>
          </div>
        </div>
      )}

      {shelfForm && (
        <div className="lib-modal-backdrop" onClick={() => !saving && setShelfForm(null)}>
          <div className="lib-modal" onClick={e => e.stopPropagation()}>
            <div className="lib-modal-header">
              <h3>{shelfForm.id ? 'Edit Shelf' : 'Add Shelf'}</h3>
              <button className="lib-modal-close" onClick={() => setShelfForm(null)}><X size={18} /></button>
            </div>
            <div className="lib-modal-body">
              <label className="lib-label">Name</label>
              <input className="lib-input" style={{ width: '100%', marginBottom: 14 }} value={shelfForm.name} onChange={e => setShelfForm({ ...shelfForm, name: e.target.value })} />
              <label className="lib-label">Location</label>
              <input className="lib-input" style={{ width: '100%' }} value={shelfForm.location} onChange={e => setShelfForm({ ...shelfForm, location: e.target.value })} />
            </div>
            <div className="lib-modal-footer">
              <button className="lib-btn" onClick={() => setShelfForm(null)}>Cancel</button>
              <button className="lib-btn lib-btn-blue" onClick={saveShelf} disabled={saving}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
