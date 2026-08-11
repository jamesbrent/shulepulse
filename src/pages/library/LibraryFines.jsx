import { useState, useEffect } from 'react'
import { Plus, Search, Receipt, Wallet, Landmark, CheckCircle, X, RefreshCw, CircleDollarSign } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { memberTypeLabel, fmtDate, daysOverdue, fetchRules, ruleForType } from '../../lib/library'

const FINE_STATUS = {
  unpaid: { background: '#fef3c7', color: '#ca8a04' },
  paid:   { background: '#dcfce7', color: '#16a34a' },
  waived: { background: '#f1f5f9', color: '#64748b' },
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', icon: <Wallet size={14} /> },
  { value: 'mpesa', label: 'M-Pesa', icon: <Landmark size={14} /> },
  { value: 'mobile_money', label: 'Mobile Money', icon: <Landmark size={14} /> },
  { value: 'bank', label: 'Bank', icon: <Landmark size={14} /> },
  { value: 'cheque', label: 'Cheque', icon: <Receipt size={14} /> },
]

export default function LibraryFines({ schoolId, term, year, onOpenMember }) {
  const [fines, setFines] = useState([])
  const [members, setMembers] = useState([])
  const [books, setBooks] = useState([])
  const [rules, setRules] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [generating, setGenerating] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ member_id: '', book_id: '', amount: '', reason: 'overdue', notes: '' })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [paying, setPaying] = useState(null)
  const [payForm, setPayForm] = useState({ method: 'cash', code: '' })
  const [payError, setPayError] = useState('')
  const [paySaving, setPaySaving] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    const [finesRes, membersRes, booksRes, rulesRes] = await Promise.all([
      supabase.from('library_fines')
        .select('*, members:library_members(full_name, member_code, member_type, email), books:library_books(title, author)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('library_members').select('*').eq('school_id', schoolId).order('full_name'),
      supabase.from('library_books').select('*').eq('school_id', schoolId).order('title'),
      fetchRules(schoolId),
    ])
    setFines(finesRes.data || [])
    setMembers(membersRes.data || [])
    setBooks(booksRes.data || [])
    setRules(rulesRes)
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId])

  const filtered = fines.filter(f => {
    const q = search.toLowerCase()
    return !q
      || f.members?.full_name?.toLowerCase().includes(q)
      || f.members?.member_code?.toLowerCase().includes(q)
      || f.books?.title?.toLowerCase().includes(q)
  })

  const totalUnpaid = fines.filter(f => f.status === 'unpaid').reduce((s, f) => s + Number(f.amount), 0)
  const totalCollected = fines.filter(f => f.status === 'paid').reduce((s, f) => s + Number(f.amount), 0)
  const unpaidCount = fines.filter(f => f.status === 'unpaid').length

  const addFine = async () => {
    setFormError('')
    if (!form.member_id || !form.amount || Number(form.amount) <= 0) {
      setFormError('Select a member and enter a valid amount')
      return
    }
    setSaving(true)
    const { data, error: err } = await supabase.from('library_fines').insert({
      school_id: schoolId,
      member_id: form.member_id,
      book_id: form.book_id || null,
      amount: Number(form.amount),
      reason: form.reason,
      notes: form.notes || null,
      status: 'unpaid',
    }).select('*, members:library_members(full_name, member_code, member_type, email), books:library_books(title, author)').single()
    if (err) { setFormError(err.message); setSaving(false); return }
    setFines(prev => [data, ...prev])
    setShowAdd(false)
    setForm({ member_id: '', book_id: '', amount: '', reason: 'overdue', notes: '' })
    setSaving(false)
  }

  const waive = async (fine) => {
    if (!window.confirm(`Waive this KES ${fine.amount} fine for ${fine.members?.full_name}?`)) return
    await supabase.from('library_fines').update({ status: 'waived' }).eq('id', fine.id)
    setFines(prev => prev.map(f => f.id === fine.id ? { ...f, status: 'waived' } : f))
  }

  const recordPayment = async () => {
    if (!paying) return
    setPayError('')
    if (payForm.method === 'mpesa' && !payForm.code.trim()) {
      setPayError('M-Pesa transaction code is required')
      return
    }
    setPaySaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('library_fines').update({
      status: 'paid',
      payment_method: payForm.method,
      transaction_code: payForm.code.trim() || null,
      debited_from_fees: false,
      paid_at: new Date().toISOString(),
      received_by: user?.id || null,
    }).eq('id', paying.id)
    if (err) { setPayError(err.message); setPaySaving(false); return }
    setFines(prev => prev.map(f => f.id === paying.id ? {
      ...f,
      status: 'paid',
      payment_method: payForm.method,
      transaction_code: payForm.code.trim() || null,
      debited_from_fees: false,
      paid_at: new Date().toISOString(),
    } : f))
    setPaying(null)
    setPayForm({ method: 'cash', code: '' })
    setPaySaving(false)
  }

  const debitFromFees = async (fine) => {
    const member = fine.members
    if (!member) return
    setBusyId(fine.id)
    const student = await findStudentForMember(member)
    if (!student) {
      window.alert(`No student record found for ${member.full_name}. Use "Receive Payment" instead.`)
      setBusyId(null)
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    const schoolData = await supabase.from('schools').select('current_term, current_year').eq('id', schoolId).maybeSingle()
    const currentTerm = term || schoolData.data?.current_term || 'Term 1'
    const currentYear = year || schoolData.data?.current_year || new Date().getFullYear()

    const ledgerInsert = await supabase.from('student_ledger').insert({
      school_id: schoolId,
      student_id: student.id,
      entry_type: 'penalty',
      amount: Number(fine.amount),
      term: currentTerm,
      year: currentYear,
      description: `Library fine — ${fine.books?.title || fine.reason}`,
      reference_id: fine.id,
    })
    if (ledgerInsert.error) {
      window.alert(`Failed to post to fee ledger: ${ledgerInsert.error.message}`)
      setBusyId(null)
      return
    }
    await supabase.from('library_fines').update({
      status: 'paid',
      debited_from_fees: true,
      payment_method: null,
      transaction_code: null,
      paid_at: new Date().toISOString(),
      received_by: user?.id || null,
    }).eq('id', fine.id)
    setFines(prev => prev.map(f => f.id === fine.id ? { ...f, status: 'paid', debited_from_fees: true, paid_at: new Date().toISOString() } : f))
    setBusyId(null)
  }

  const findStudentForMember = async (member) => {
    let student = null
    if (member.email) {
      const { data } = await supabase.from('students')
        .select('id, email, admission_number')
        .eq('school_id', schoolId)
        .eq('email', member.email)
        .maybeSingle()
      student = data
    }
    if (!student && member.member_code?.startsWith('STD/')) {
      const adm = member.member_code.replace('STD/', '')
      const { data } = await supabase.from('students')
        .select('id, email, admission_number')
        .eq('school_id', schoolId)
        .eq('admission_number', adm)
        .maybeSingle()
      student = data
    }
    return student
  }

  const generateOverdueFines = async () => {
    setGenerating(true)
    const today = new Date().toISOString().slice(0, 10)
    const { data: loans } = await supabase.from('library_loans')
      .select('*, members:library_members(id, member_type), books:library_books(title)')
      .eq('school_id', schoolId)
      .or(`status.eq.overdue,and(status.eq.issued,due_date.lt.${today})`)

    const existing = await supabase.from('library_fines')
      .select('loan_id, status').eq('school_id', schoolId)
    const existingLoanIds = new Set((existing.data || [])
      .filter(f => f.status !== 'waived' && f.loan_id)
      .map(f => f.loan_id))

    let created = 0
    for (const loan of loans.data || []) {
      if (existingLoanIds.has(loan.id)) continue
      const od = daysOverdue(loan)
      if (od <= 0) continue
      const rule = ruleForType(rules, loan.members?.member_type)
      const perDay = Number(rule?.fine_per_day) || 0
      if (perDay <= 0) continue
      const amount = od * perDay
      const { data: inserted } = await supabase.from('library_fines').insert({
        school_id: schoolId,
        member_id: loan.member_id,
        loan_id: loan.id,
        book_id: loan.book_id,
        amount,
        reason: 'overdue',
        status: 'unpaid',
        notes: `${od} day(s) overdue`,
      }).select('*, members:library_members(full_name, member_code, member_type, email), books:library_books(title, author)').single()
      if (inserted) {
        setFines(prev => [inserted, ...prev])
        created += 1
      }
    }
    setGenerating(false)
    if (created === 0) window.alert('No new overdue fines to generate.')
  }

  const payMethodLabel = (m) => PAYMENT_METHODS.find(p => p.value === m)?.label || m || '—'

  if (loading) return <div className="lib-loading">Loading fines...</div>

  return (
    <div>
      <div className="lib-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="lib-stat-card">
          <div className="lib-stat-icon">
            <span style={{ width: 38, height: 38, borderRadius: 10, background: '#fef3c7', color: '#ca8a04', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircleDollarSign size={20} />
            </span>
          </div>
          <p className="lib-stat-label">Unpaid Fines</p>
          <p className="lib-stat-value">KES {totalUnpaid.toLocaleString()}</p>
        </div>
        <div className="lib-stat-card">
          <div className="lib-stat-icon">
            <span style={{ width: 38, height: 38, borderRadius: 10, background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={20} />
            </span>
          </div>
          <p className="lib-stat-label">Collected</p>
          <p className="lib-stat-value">KES {totalCollected.toLocaleString()}</p>
        </div>
        <div className="lib-stat-card">
          <div className="lib-stat-icon">
            <span style={{ width: 38, height: 38, borderRadius: 10, background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Receipt size={20} />
            </span>
          </div>
          <p className="lib-stat-label">Outstanding Fines</p>
          <p className="lib-stat-value">{unpaidCount}</p>
        </div>
      </div>

      <div className="lib-card" style={{ marginTop: 16 }}>
        <div className="lib-card-header">
          <div>
            <h2>Library Fines</h2>
            <p>Receive payments with a transaction code, or debit the fine from the member's school fees</p>
          </div>
        </div>

        <div className="lib-toolbar">
          <div className="lib-search">
            <Search size={15} color="#94a3b8" />
            <input placeholder="Search by member or book..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="lib-btn" onClick={generateOverdueFines} disabled={generating}>
            <RefreshCw size={15} /> {generating ? 'Generating...' : 'Generate Overdue Fines'}
          </button>
          <button className="lib-btn lib-btn-blue" onClick={() => { setShowAdd(true); setFormError('') }}>
            <Plus size={15} /> Add Fine
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="lib-empty">
            <Receipt size={36} color="#cbd5e1" />
            <p>No fines</p>
            <span>Generate overdue fines or add one manually</span>
          </div>
        ) : (
          <div className="lib-table-wrap">
            <table className="lib-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Book</th>
                  <th>Reason</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Paid On</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => (
                  <tr key={f.id}>
                    <td>
                      <button className="member-link" onClick={() => onOpenMember && onOpenMember(f.member_id)} style={{ textAlign: 'left' }}>
                        <span style={{ display: 'block', fontWeight: 600 }}>{f.members?.full_name || '—'}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{memberTypeLabel(f.members?.member_type)} · {f.members?.member_code || ''}</span>
                      </button>
                    </td>
                    <td>
                      <span style={{ display: 'block', fontWeight: 600 }}>{f.books?.title || '—'}</span>
                      <span className="text-muted" style={{ fontSize: 11, color: '#94a3b8' }}>{f.books?.author || ''}</span>
                    </td>
                    <td>{f.reason}</td>
                    <td style={{ fontWeight: 600 }}>KES {Number(f.amount).toLocaleString()}</td>
                    <td>
                      <span className="lib-badge" style={FINE_STATUS[f.status] || FINE_STATUS.unpaid}>
                        {f.status}
                      </span>
                    </td>
                    <td>
                      {f.status === 'paid' && f.debited_from_fees ? (
                        <span className="lib-badge" style={{ background: '#dbeafe', color: '#2563eb' }}>Debited from fees</span>
                      ) : f.status === 'paid' ? (
                        <span style={{ fontSize: 12, color: '#475569' }}>
                          {payMethodLabel(f.payment_method)}
                          {f.transaction_code ? <span className="text-muted" style={{ color: '#94a3b8' }}> · {f.transaction_code}</span> : null}
                        </span>
                      ) : '—'}
                    </td>
                    <td>{f.paid_at ? fmtDate(f.paid_at) : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {f.status === 'unpaid' && (
                          <>
                            <button className="lib-btn lib-btn-blue" onClick={() => { setPaying(f); setPayForm({ method: 'cash', code: '' }); setPayError('') }}>
                              <Receipt size={14} /> Receive Payment
                            </button>
                            <button className="lib-btn" onClick={() => debitFromFees(f)} disabled={busyId === f.id}>
                              <Wallet size={14} /> {busyId === f.id ? 'Posting...' : 'Debit from Fees'}
                            </button>
                            <button className="lib-btn" onClick={() => waive(f)}>
                              <X size={14} /> Waive
                            </button>
                          </>
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
              <h3>Add Library Fine</h3>
              <button className="lib-modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            </div>
            <div className="lib-modal-body">
              {formError && (
                <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 500, marginBottom: 12 }}>
                  {formError}
                </div>
              )}
              <label className="lib-label">Member</label>
              <select className="lib-select" style={{ width: '100%', marginBottom: 14 }} value={form.member_id} onChange={e => setForm({ ...form, member_id: e.target.value })}>
                <option value="">Select member...</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.full_name} ({memberTypeLabel(m.member_type)})</option>
                ))}
              </select>
              <label className="lib-label">Book (optional)</label>
              <select className="lib-select" style={{ width: '100%', marginBottom: 14 }} value={form.book_id} onChange={e => setForm({ ...form, book_id: e.target.value })}>
                <option value="">No book — general fine</option>
                {books.map(b => (
                  <option key={b.id} value={b.id}>{b.title}</option>
                ))}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="lib-label">Amount (KES)</label>
                  <input type="number" min="1" className="lib-input" style={{ width: '100%' }} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <label className="lib-label">Reason</label>
                  <select className="lib-select" style={{ width: '100%' }} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}>
                    <option value="overdue">Overdue</option>
                    <option value="lost">Lost</option>
                    <option value="damaged">Damaged</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <label className="lib-label" style={{ marginTop: 14 }}>Notes</label>
              <input className="lib-input" style={{ width: '100%' }} placeholder="Optional" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="lib-modal-footer">
              <button className="lib-btn" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="lib-btn lib-btn-blue" onClick={addFine} disabled={saving}>
                {saving ? 'Saving...' : 'Add Fine'}
              </button>
            </div>
          </div>
        </div>
      )}

      {paying && (
        <div className="lib-modal-backdrop" onClick={() => !paySaving && setPaying(null)}>
          <div className="lib-modal" onClick={e => e.stopPropagation()}>
            <div className="lib-modal-header">
              <h3>Receive Fine Payment</h3>
              <button className="lib-modal-close" onClick={() => setPaying(null)}><X size={18} /></button>
            </div>
            <div className="lib-modal-body">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <span style={{ display: 'block', fontWeight: 600 }}>{paying.members?.full_name}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{paying.books?.title || paying.reason}</span>
                </div>
                <span style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>KES {Number(paying.amount).toLocaleString()}</span>
              </div>
              {payError && (
                <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 500, marginBottom: 12 }}>
                  {payError}
                </div>
              )}
              <label className="lib-label">Payment Method</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m.value}
                    className={`lib-btn ${payForm.method === m.value ? 'lib-btn-blue' : ''}`}
                    onClick={() => setPayForm({ ...payForm, method: m.value })}
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
              <label className="lib-label">Transaction Code</label>
              <input
                className="lib-input"
                style={{ width: '100%', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                placeholder={payForm.method === 'mpesa' ? 'e.g. QHX7K2LPMA' : 'Optional (M-Pesa code, bank ref, etc.)'}
                value={payForm.code}
                onChange={e => setPayForm({ ...payForm, code: e.target.value })}
              />
            </div>
            <div className="lib-modal-footer">
              <button className="lib-btn" onClick={() => setPaying(null)}>Cancel</button>
              <button className="lib-btn lib-btn-blue" onClick={recordPayment} disabled={paySaving}>
                <CheckCircle size={15} /> {paySaving ? 'Recording...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
