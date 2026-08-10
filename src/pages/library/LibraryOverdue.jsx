import { useState, useEffect } from 'react'
import { Clock, CheckCircle2, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { memberTypeLabel, fmtDate, daysOverdue } from '../../lib/library'

export default function LibraryOverdue({ schoolId }) {
  const [loans, setLoans] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [schoolId])

  const fetchData = async () => {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('library_loans')
      .select('*, books(title, author), members(full_name, member_type, member_code)')
      .eq('school_id', schoolId)
      .or(`status.eq.overdue,and(status.eq.issued,due_date.lt.${today})`)
      .order('due_date', { ascending: true })
    setLoans(data || [])
    setLoading(false)
  }

  const filtered = loans.filter(l => {
    const q = search.toLowerCase()
    return !q || l.books?.title?.toLowerCase().includes(q) || l.members?.full_name?.toLowerCase().includes(q)
  })

  const notify = async (loan) => {
    await supabase.from('library_loans').update({ last_notified: new Date().toISOString() }).eq('id', loan.id)
    alert(`Notification sent to ${loan.members?.full_name} for "${loan.books?.title}"`)
    fetchData()
  }

  const markReturned = async (loan) => {
    const { data: book } = await supabase.from('library_books').select('available_copies').eq('id', loan.book_id).single()
    await supabase.from('library_loans').update({ status: 'returned', returned_at: new Date().toISOString() }).eq('id', loan.id)
    if (book) await supabase.from('library_books').update({ available_copies: book.available_copies + 1 }).eq('id', loan.book_id)
    setLoans(prev => prev.filter(l => l.id !== loan.id))
  }

  if (loading) return <div className="lib-loading">Loading overdue loans...</div>

  return (
    <div>
      <div className="lib-toolbar">
        <div className="lib-search">
          <Search size={15} color="#94a3b8" />
          <input placeholder="Search overdue loans..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="lib-card">
        <div className="lib-card-header">
          <div>
            <h2>Overdue Loans ({filtered.length})</h2>
            <p>Books past their due date — take action to recover them</p>
          </div>
          <Clock size={16} color="#dc2626" />
        </div>

        {filtered.length === 0 ? (
          <div className="lib-empty">
            <Clock size={36} color="#cbd5e1" />
            <p>No overdue loans</p>
            <span>Everything is on track</span>
          </div>
        ) : (
          <div className="lib-table-wrap">
            <table className="lib-table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Member</th>
                  <th>Type</th>
                  <th>Due Date</th>
                  <th>Days Overdue</th>
                  <th>Last Notified</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  const od = daysOverdue(l)
                  return (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600 }}>{l.books?.title || '—'}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span className="lib-avatar-sm">{(l.members?.full_name || '?')[0]}</span>
                          {l.members?.full_name || '—'}
                        </span>
                      </td>
                      <td>{memberTypeLabel(l.members?.member_type)}</td>
                      <td>{fmtDate(l.due_date)}</td>
                      <td>
                        <span className="lib-badge" style={{ background: od >= 14 ? '#fee2e2' : od >= 7 ? '#fef3c7' : '#ffedd5', color: od >= 14 ? '#dc2626' : od >= 7 ? '#ca8a04' : '#ea580c' }}>
                          {od} days
                        </span>
                      </td>
                      <td>{l.last_notified ? fmtDate(l.last_notified) : 'Never'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="lib-btn" onClick={() => notify(l)}>Notify</button>
                          <button className="lib-btn lib-btn-green" onClick={() => markReturned(l)}>
                            <CheckCircle2 size={14} /> Returned
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
    </div>
  )
}
