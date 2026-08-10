import { useState, useEffect } from 'react'
import {
  ArrowLeftRight, Plus, RefreshCw, AlertTriangle, CheckCircle2, X
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  memberTypeLabel, fetchRules, ruleForType, fmtDate, daysOverdue
} from '../../lib/library'

export default function LibraryBorrowReturn({ schoolId }) {
  const [loans, setLoans] = useState([])
  const [members, setMembers] = useState([])
  const [books, setBooks] = useState([])
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)

  const [showIssue, setShowIssue] = useState(false)
  const [issueMember, setIssueMember] = useState('')
  const [issueBook, setIssueBook] = useState('')
  const [issueDue, setIssueDue] = useState('')
  const [issueError, setIssueError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [schoolId])

  const fetchAll = async () => {
    setLoading(true)
    const [loansRes, membersRes, booksRes, rulesRes] = await Promise.all([
      supabase.from('library_loans')
        .select('*, books(title, author, available_copies), members(full_name, member_type, member_code)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('library_members').select('*').eq('school_id', schoolId).eq('status', 'active').order('full_name'),
      supabase.from('library_books').select('*').eq('school_id', schoolId).gt('available_copies', 0).order('title'),
      fetchRules(schoolId),
    ])
    setLoans(loansRes.data || [])
    setMembers(membersRes.data || [])
    setBooks(booksRes.data || [])
    setRules(rulesRes)
    setLoading(false)
  }

  const openIssue = () => {
    setShowIssue(true)
    setIssueError('')
    setIssueBook('')
    setIssueDue('')
  }

  const onMemberChange = (id) => {
    setIssueMember(id)
    const m = members.find(x => x.id === id)
    const rule = ruleForType(rules, m?.member_type)
    const due = new Date()
    due.setDate(due.getDate() + (rule?.loan_days || 14))
    setIssueDue(due.toISOString().slice(0, 10))
  }

  const issueBookFn = async () => {
    setIssueError('')
    if (!issueMember || !issueBook || !issueDue) {
      setIssueError('Select a member, a book, and a due date')
      return
    }
    setSaving(true)
    const member = members.find(m => m.id === issueMember)
    const rule = ruleForType(rules, member?.member_type)
    const maxBooks = rule?.books_allowed || member?.books_allowed || 3

    const { count } = await supabase
      .from('library_loans')
      .select('*', { count: 'exact', head: true })
      .eq('member_id', issueMember)
      .in('status', ['issued', 'overdue'])
    if ((count || 0) >= maxBooks) {
      setIssueError(`${member?.full_name} has reached the limit of ${maxBooks} books`)
      setSaving(false)
      return
    }

    const { data: user } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('id').eq('id', user.data.user.id).single()
    const { data: book } = await supabase.from('library_books').select('available_copies').eq('id', issueBook).single()
    if (!book || book.available_copies <= 0) {
      setIssueError('This book has no available copies')
      setSaving(false)
      return
    }

    const { data: loan, error: loanErr } = await supabase.from('library_loans').insert({
      school_id: schoolId,
      book_id: issueBook,
      member_id: issueMember,
      issued_by: prof?.id || null,
      due_date: issueDue,
      status: 'issued',
    }).select().single()
    if (loanErr) { setIssueError(loanErr.message); setSaving(false); return }

    await supabase.from('library_books')
      .update({ available_copies: book.available_copies - 1 })
      .eq('id', issueBook)

    await supabase.from('library_reservations')
      .update({ status: 'fulfilled', notified_at: new Date().toISOString() })
      .eq('book_id', issueBook).eq('member_id', issueMember).eq('status', 'pending')

    setLoans(prev => {
      const rich = { ...loan, books: books.find(b => b.id === issueBook), members: member }
      return [rich, ...prev]
    })
    setBooks(prev => prev.map(b => b.id === issueBook ? { ...b, available_copies: b.available_copies - 1 } : b))
    setShowIssue(false)
    setSaving(false)
  }

  const returnBook = async (loan) => {
    const { data: book } = await supabase.from('library_books').select('available_copies').eq('id', loan.book_id).single()
    await supabase.from('library_loans').update({ status: 'returned', returned_at: new Date().toISOString() }).eq('id', loan.id)
    if (book) await supabase.from('library_books').update({ available_copies: book.available_copies + 1 }).eq('id', loan.book_id)

    const { data: firstRes } = await supabase.from('library_reservations')
      .select('id').eq('book_id', loan.book_id).eq('status', 'pending').order('reserved_at').limit(1)
    if (firstRes && firstRes.length) {
      await supabase.from('library_reservations').update({ status: 'available', notified_at: new Date().toISOString() }).eq('id', firstRes[0].id)
    }

    setLoans(prev => prev.map(l => l.id === loan.id ? { ...l, status: 'returned', returned_at: new Date().toISOString() } : l))
    setBooks(prev => prev.map(b => b.id === loan.book_id ? { ...b, available_copies: (b.available_copies || 0) + 1 } : b))
  }

  const renewLoan = async (loan) => {
    const rule = ruleForType(rules, loan.members?.member_type)
    const limit = rule?.renewal_limit || 1
    if (loan.renewed_count >= limit) {
      alert('Renewal limit reached for this loan')
      return
    }
    const due = new Date(loan.due_date)
    due.setDate(due.getDate() + (rule?.loan_days || 14))
    const newDue = due.toISOString().slice(0, 10)
    await supabase.from('library_loans')
      .update({ due_date: newDue, renewed_count: loan.renewed_count + 1, status: 'issued' })
      .eq('id', loan.id)
    setLoans(prev => prev.map(l => l.id === loan.id ? { ...l, due_date: newDue, renewed_count: l.renewed_count + 1, status: 'issued' } : l))
  }

  const markLostDamaged = async (loan, status) => {
    if (!window.confirm(`Mark this book as ${status}?`)) return
    await supabase.from('library_loans').update({ status, returned_at: new Date().toISOString() }).eq('id', loan.id)
    const { data: book } = await supabase.from('library_books').select('available_copies, total_copies').eq('id', loan.book_id).single()
    if (book) {
      const newTotal = status === 'lost' ? Math.max(0, book.total_copies - 1) : book.total_copies
      await supabase.from('library_books').update({
        available_copies: Math.min(book.available_copies + 1, newTotal),
        total_copies: newTotal,
      }).eq('id', loan.book_id)
    }
    setLoans(prev => prev.map(l => l.id === loan.id ? { ...l, status, returned_at: new Date().toISOString() } : l))
  }

  const activeLoans = loans.filter(l => ['issued', 'overdue'].includes(l.status))

  if (loading) return <div className="lib-loading">Loading loans...</div>

  return (
    <div>
      <div className="lib-toolbar">
        <div style={{ flex: 1 }} />
        <button className="lib-btn lib-btn-blue" onClick={openIssue}>
          <Plus size={15} /> Issue Book
        </button>
      </div>

      <div className="lib-card">
        <div className="lib-card-header">
          <div>
            <h2>Active Loans ({activeLoans.length})</h2>
            <p>Books currently out on loan</p>
          </div>
        </div>

        {activeLoans.length === 0 ? (
          <div className="lib-empty">
            <ArrowLeftRight size={36} color="#cbd5e1" />
            <p>No active loans</p>
            <span>Issue a book to get started</span>
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
                  <th>Overdue</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeLoans.map(l => {
                  const od = daysOverdue(l)
                  const overdue = l.status === 'overdue' || od > 0
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
                        {overdue ? (
                          <span className="lib-badge" style={{ background: '#fee2e2', color: '#dc2626' }}>
                            <AlertTriangle size={11} /> {od} days
                          </span>
                        ) : (
                          <span className="text-muted" style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span className="lib-badge" style={{ background: overdue ? '#fee2e2' : '#dbeafe', color: overdue ? '#dc2626' : '#2563eb' }}>
                          {l.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="lib-btn lib-btn-green" onClick={() => returnBook(l)} title="Return">
                            <CheckCircle2 size={14} /> Return
                          </button>
                          <button className="lib-btn" onClick={() => renewLoan(l)} title="Renew">
                            <RefreshCw size={14} /> Renew
                          </button>
                          <button className="lib-btn lib-btn-amber" onClick={() => markLostDamaged(l, 'lost')} title="Mark lost">
                            Lost
                          </button>
                          <button className="lib-btn" onClick={() => markLostDamaged(l, 'damaged')} title="Mark damaged">
                            Damaged
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

      {showIssue && (
        <div className="lib-modal-backdrop" onClick={() => !saving && setShowIssue(false)}>
          <div className="lib-modal" onClick={e => e.stopPropagation()}>
            <div className="lib-modal-header">
              <h3>Issue Book</h3>
              <button className="lib-modal-close" onClick={() => setShowIssue(false)}><X size={18} /></button>
            </div>
            <div className="lib-modal-body">
              {issueError && (
                <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 500, marginBottom: 12 }}>
                  {issueError}
                </div>
              )}
              <label className="lib-label">Library Member</label>
              <select className="lib-select" style={{ width: '100%', marginBottom: 14 }} value={issueMember} onChange={e => onMemberChange(e.target.value)}>
                <option value="">Select member...</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({memberTypeLabel(m.member_type)}{m.member_code ? ` · ${m.member_code}` : ''})
                  </option>
                ))}
              </select>

              <label className="lib-label">Book</label>
              <select className="lib-select" style={{ width: '100%', marginBottom: 14 }} value={issueBook} onChange={e => setIssueBook(e.target.value)}>
                <option value="">Select book...</option>
                {books.map(b => (
                  <option key={b.id} value={b.id}>{b.title}{b.available_copies > 0 ? ` (${b.available_copies} available)` : ' (none)'}</option>
                ))}
              </select>

              <label className="lib-label">Due Date</label>
              <input type="date" className="lib-input" style={{ width: '100%' }} value={issueDue} onChange={e => setIssueDue(e.target.value)} />
            </div>
            <div className="lib-modal-footer">
              <button className="lib-btn" onClick={() => setShowIssue(false)}>Cancel</button>
              <button className="lib-btn lib-btn-blue" onClick={issueBookFn} disabled={saving}>
                {saving ? 'Issuing...' : 'Issue Book'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
