import { useState, useEffect } from 'react'
import { Search, BookOpen, Filter, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function LibraryCatalogue({ schoolId, onNavigate }) {
  const [books, setBooks] = useState([])
  const [copies, setCopies] = useState([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [availFilter, setAvailFilter] = useState('all')
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = async () => {
    setLoading(true)
    const [booksRes, catsRes, copiesRes] = await Promise.all([
      supabase.from('library_books')
        .select('*, categories:library_categories(name), shelves:library_shelves(name)')
        .eq('school_id', schoolId)
        .order('title'),
      supabase.from('library_categories').select('*').eq('school_id', schoolId).order('name'),
      supabase.from('library_book_copies').select('*').eq('school_id', schoolId).order('copy_code'),
    ])
    setBooks(booksRes.data || [])
    setCategories(catsRes.data || [])
    setCopies(copiesRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [schoolId])

  const filtered = books.filter(b => {
    const q = search.toLowerCase()
    const matchQ = !q || b.title?.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q) || b.isbn?.toLowerCase().includes(q) || b.subject?.toLowerCase().includes(q)
    const matchCat = catFilter === 'all' || b.category_id === catFilter
    const matchAvail = availFilter === 'all' || (availFilter === 'available' && b.available_copies > 0) || (availFilter === 'borrowed' && b.available_copies <= 0)
    return matchQ && matchCat && matchAvail
  })

  if (loading) return <div className="lib-loading">Loading catalogue...</div>

  return (
    <div>
      <div className="lib-toolbar">
        <div className="lib-search">
          <Search size={15} color="#94a3b8" />
          <input placeholder="Search by title, author, ISBN, subject..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="lib-select" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="lib-select" value={availFilter} onChange={e => setAvailFilter(e.target.value)}>
          <option value="all">All Availability</option>
          <option value="available">Available</option>
          <option value="borrowed">Borrowed</option>
        </select>
        {onNavigate && (
          <button className="lib-btn lib-btn-blue" onClick={() => onNavigate('management')}>
            <Plus size={15} /> Add Book
          </button>
        )}
      </div>

      <div className="lib-card">
        <div className="lib-card-header">
          <div>
            <h2>Book Catalogue</h2>
            <p>{filtered.length} titles</p>
          </div>
          <Filter size={16} color="#94a3b8" />
        </div>

        {filtered.length === 0 ? (
          <div className="lib-empty">
            <BookOpen size={36} color="#cbd5e1" />
            <p>No books found</p>
            <span>Try adjusting your search or filters</span>
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
                  <th>Availability</th>
                  <th>Copy Codes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => {
                  const avail = b.available_copies > 0
                  const bookCopies = copies.filter(c => c.book_id === b.id)
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.title}</td>
                      <td>{b.author || '—'}</td>
                      <td>{b.isbn || '—'}</td>
                      <td>{b.subject || '—'}</td>
                      <td>{b.categories?.name || '—'}</td>
                      <td>{b.shelves?.name || '—'}</td>
                      <td>
                        <span className="lib-badge" style={{ background: '#f1f5f9', color: '#475569' }}>
                          {b.available_copies}/{b.total_copies}
                        </span>
                      </td>
                      <td>
                        <span className="lib-badge" style={{ background: avail ? '#dcfce7' : '#fee2e2', color: avail ? '#16a34a' : '#dc2626' }}>
                          <span className="lib-dot" style={{ background: avail ? '#16a34a' : '#dc2626' }} />
                          {avail ? 'Available' : 'Borrowed'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>
                          {bookCopies.slice(0, 2).map(c => c.copy_code).join(', ')}
                          {bookCopies.length > 2 ? ` +${bookCopies.length - 2} more` : ''}
                          {bookCopies.length === 0 ? '—' : ''}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
