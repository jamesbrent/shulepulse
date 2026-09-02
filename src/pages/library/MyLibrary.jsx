import { useState, useEffect } from 'react'
import { Search, BookOpen, BookMarked, RefreshCw, Clock, AlertTriangle, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  fmtDate, daysOverdue, fetchRules, ruleForType, memberCodeForUser
} from '../../lib/library'
import './LibrarianDashboard.css'

export default function MyLibrary({ schoolId, name, email, role, userId }) {
  const [member, setMember] = useState(null)
  const [myLoans, setMyLoans] = useState([])
  const [history, setHistory] = useState([])
  const [myReservations, setMyReservations] = useState([])
  const [rules, setRules] = useState([])
  const [books, setBooks] = useState([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAll()
  }, [schoolId])

  const ensureMember = async () => {
    let { data: m } = await supabase
      .from('library_members')
      .select('*')
      .eq('school_id', schoolId)
      .eq('profile_id', userId)
      .maybeSingle()

    if (!m && userId) {
      const code = await memberCodeForUser(schoolId, email, role)
      const { data: created } = await supabase.from('library_members').upsert({
        school_id: schoolId,
        profile_id: userId,
        full_name: name,
        email,
        member_type: role,
        member_code: code,
        status: 'active',
      }, { onConflict: 'school_id,profile_id' }).select().single().catch(() => null)
      m = created
    }
    return m
  }

  const fetchAll = async () => {
    setLoading(true)
    const m = await ensureMember()
    if (!m) { setLoading(false); return }
    setMember(m)

    const [loansRes, resRes, booksRes, catsRes, rulesRes] = await Promise.all([
      supabase.from('library_loans')
        .select('*, books:library_books(title, author)')
        .eq('member_id', m.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('library_reservations')
        .select('*, books:library_books(title, author)')
        .eq('member_id', m.id)
        .order('reserved_at', { ascending: false })
        .limit(20),
      supabase.from('library_books')
        .select('*, categories:library_categories(name)')
        .eq('school_id', schoolId)
        .order('title'),
      supabase.from('library_categories').select('*').eq('school_id', schoolId).order('name'),
      fetchRules(schoolId),
    ])
    setMyLoans(loansRes.data?.filter(l => ['issued', 'overdue'].includes(l.status)) || [])
    setHistory(loansRes.data?.filter(l => !['issued', 'overdue'].includes(l.status)) || [])
    setMyReservations(resRes.data || [])
    setBooks(booksRes.data || [])
    setCategories(catsRes.data || [])
    setRules(rulesRes)
    setLoading(false)
  }

  const reserveBook = async (bookId) => {
    const dup = myReservations.find(r => r.book_id === bookId && ['pending', 'available'].includes(r.status))
    if (dup) return
    await supabase.from('library_reservations').insert({
      school_id: schoolId,
      book_id: bookId,
      member_id: member.id,
      status: 'pending',
      reserved_at: new Date().toISOString(),
    })
    fetchAll()
  }

  const cancelReservation = async (r) => {
    await supabase.from('library_reservations').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', r.id)
    fetchAll()
  }

  const renewLoan = async (loan) => {
    const rule = ruleForType(rules, member?.member_type)
    const limit = rule?.renewal_limit || 1
    if (loan.renewed_count >= limit) return
    const due = new Date(loan.due_date)
    due.setDate(due.getDate() + (rule?.loan_days || 14))
    const newDue = due.toISOString().slice(0, 10)
    await supabase.from('library_loans')
      .update({ due_date: newDue, renewed_count: loan.renewed_count + 1, status: 'issued' })
      .eq('id', loan.id)
    fetchAll()
  }

  const filteredBooks = books.filter(b => {
    const q = search.toLowerCase()
    const matchQ = !q || b.title?.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q) || b.subject?.toLowerCase().includes(q)
    const matchCat = catFilter === 'all' || b.category_id === catFilter
    return matchQ && matchCat
  })

  if (loading) return <div className="lib-loading">Loading your library...</div>

  const rule = ruleForType(rules, member?.member_type)
  const borrowedCount = myLoans.length
  const limit = rule?.books_allowed || 3

  return (
    <div className="lib-my">
      <div className="lib-my-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="lib-stat-card">
          <div className="lib-stat-icon">
            <span style={{ width: 38, height: 38, borderRadius: 10, background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookMarked size={20} />
            </span>
          </div>
          <p className="lib-stat-label">Books Borrowed</p>
          <p className="lib-stat-value">{borrowedCount} / {limit}</p>
        </div>
        <div className="lib-stat-card">
          <div className="lib-stat-icon">
            <span style={{ width: 38, height: 38, borderRadius: 10, background: '#f3e8ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={20} />
            </span>
          </div>
          <p className="lib-stat-label">Due Today / Overdue</p>
          <p className="lib-stat-value">{myLoans.filter(l => daysOverdue(l) > 0).length}</p>
        </div>
      </div>

      <div className="lib-card" style={{ marginBottom: 16 }}>
        <div className="lib-card-header">
          <div>
            <h2>Currently Borrowed</h2>
            <p>Books you have on loan</p>
          </div>
        </div>
        {myLoans.length === 0 ? (
          <div className="lib-empty">
            <BookOpen size={36} color="#cbd5e1" />
            <p>No books borrowed</p>
            <span>Search the catalogue below to reserve a book</span>
          </div>
        ) : (
          <div className="lib-table-wrap">
            <table className="lib-table">
              <thead>
                <tr><th>Book</th><th>Author</th><th>Due Date</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {myLoans.map(l => {
                  const od = daysOverdue(l)
                  return (
                    <tr key={l.id}>
                      <td data-label="Book" style={{ fontWeight: 600 }}>{l.books?.title || '—'}</td>
                      <td data-label="Author">{l.books?.author || '—'}</td>
                      <td data-label="Due Date">{fmtDate(l.due_date)}</td>
                      <td data-label="Status">
                        {od > 0 ? (
                          <span className="lib-badge" style={{ background: '#fee2e2', color: '#dc2626' }}>
                            <AlertTriangle size={11} /> {od} days overdue
                          </span>
                        ) : (
                          <span className="lib-badge" style={{ background: '#dbeafe', color: '#2563eb' }}>{l.status}</span>
                        )}
                      </td>
                      <td data-label="Actions">
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button className="lib-btn" onClick={() => renewLoan(l)} disabled={l.renewed_count >= (rule?.renewal_limit || 1)}>
                            <RefreshCw size={14} /> Renew
                          </button>
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

      <div className="lib-card" style={{ marginBottom: 16 }}>
        <div className="lib-card-header">
          <div>
            <h2>My Reservations</h2>
            <p>Books you are waiting for</p>
          </div>
        </div>
        {myReservations.length === 0 ? (
          <div className="lib-empty">
            <BookMarked size={36} color="#cbd5e1" />
            <p>No reservations</p>
          </div>
        ) : (
          <div className="lib-table-wrap">
            <table className="lib-table">
              <thead>
                <tr><th>Book</th><th>Reserved On</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {myReservations.map(r => (
                  <tr key={r.id}>
                    <td data-label="Book" style={{ fontWeight: 600 }}>{r.books?.title || '—'}</td>
                    <td data-label="Reserved On">{fmtDate(r.reserved_at)}</td>
                    <td data-label="Status">
                      <span className="lib-badge" style={{ background: r.status === 'pending' ? '#fef3c7' : r.status === 'available' ? '#dcfce7' : '#f1f5f9', color: r.status === 'pending' ? '#ca8a04' : r.status === 'available' ? '#16a34a' : '#64748b' }}>
                        {r.status}
                      </span>
                    </td>
                    <td data-label="Actions">
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {['pending', 'available'].includes(r.status) && (
                          <button className="lib-btn" onClick={() => cancelReservation(r)}><X size={14} /> Cancel</button>
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

      <div className="lib-card">
        <div className="lib-card-header">
          <div>
            <h2>Library Catalogue</h2>
            <p>Browse and reserve available books</p>
          </div>
        </div>
        <div className="lib-toolbar" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 12, marginBottom: 4 }}>
          <div className="lib-search">
            <Search size={15} color="#94a3b8" />
            <input placeholder="Search by title, author, subject..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="lib-select" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {filteredBooks.length === 0 ? (
          <div className="lib-empty">
            <BookOpen size={36} color="#cbd5e1" />
            <p>No books found</p>
          </div>
        ) : (
          <div className="lib-table-wrap">
            <table className="lib-table">
              <thead>
                <tr><th>Book</th><th>Author</th><th>Subject</th><th>Category</th><th>Availability</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {filteredBooks.map(b => {
                  const avail = b.available_copies > 0
                  const reserved = myReservations.find(r => r.book_id === b.id && ['pending', 'available'].includes(r.status))
                  return (
                    <tr key={b.id}>
                      <td data-label="Book" style={{ fontWeight: 600 }}>{b.title}</td>
                      <td data-label="Author">{b.author || '—'}</td>
                      <td data-label="Subject">{b.subject || '—'}</td>
                      <td data-label="Category">{b.categories?.name || '—'}</td>
                      <td data-label="Availability">
                        <span className="lib-badge" style={{ background: avail ? '#dcfce7' : '#fee2e2', color: avail ? '#16a34a' : '#dc2626' }}>
                          <span className="lib-dot" style={{ background: avail ? '#16a34a' : '#dc2626' }} />
                          {avail ? `${b.available_copies} available` : 'Borrowed'}
                        </span>
                      </td>
                      <td data-label="Actions">
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          {borrowedCount >= limit ? (
                            <span className="text-muted" style={{ fontSize: 11, color: '#94a3b8' }}>Limit reached</span>
                          ) : reserved ? (
                            <span className="lib-badge" style={{ background: '#f1f5f9', color: '#64748b' }}>Reserved</span>
                          ) : (
                            <button className="lib-btn lib-btn-blue" onClick={() => reserveBook(b.id)} disabled={!avail}>
                              Reserve
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

      {history.length > 0 && (
        <div className="lib-card" style={{ marginTop: 16 }}>
          <div className="lib-card-header">
            <div>
              <h2>Borrowing History</h2>
              <p>Previously returned books</p>
            </div>
          </div>
          <div className="lib-table-wrap">
            <table className="lib-table">
              <thead>
                <tr><th>Book</th><th>Borrowed</th><th>Returned</th><th>Status</th></tr>
              </thead>
              <tbody>
                {history.slice(0, 10).map(l => (
                  <tr key={l.id}>
                    <td data-label="Book" style={{ fontWeight: 600 }}>{l.books?.title || '—'}</td>
                    <td data-label="Borrowed">{fmtDate(l.created_at)}</td>
                    <td data-label="Returned">{l.returned_at ? fmtDate(l.returned_at) : '—'}</td>
                    <td data-label="Status"><span className="lib-badge" style={{ background: '#f1f5f9', color: '#475569' }}>{l.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
