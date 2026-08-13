import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, Download, Plus, RefreshCw,
  TrendingUp, TrendingDown, DollarSign, Receipt, AlertTriangle,
  Clock, XCircle, CheckCircle, RotateCcw,
  Eye, Printer, FileText, ArrowDownToLine, Undo2,
  Banknote, Wallet, CreditCard,
  CircleDollarSign, Activity, X, AlertOctagon,
  Filter, ChevronDown
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmt, fmtDate, fmtDateTime, downloadFile, TERMS, YEARS } from '../admin/fees/utils/feesHelpers'
import { generateReceiptPdf } from '../admin/fees/utils/generateReceiptPdf'
import { postFeePaymentToGL, reverseJournal } from './cashBankUtils'
import './Payments.css'

const METHODS = ['all', 'mpesa', 'bank', 'cash', 'mobile_money', 'cheque']
const PAGE_SIZE = 20

const TODAY = new Date().toISOString().split('T')[0]
const BLANK_PAY = (currentTerm, currentYear) => ({
  student_search: '',
  student: null,
  amount: '',
  payment_type: 'cash',
  provider: '',
  reference: '',
  transaction_date: TODAY,
  term: currentTerm || 'Term 1',
  year: String(currentYear || new Date().getFullYear()),
})

export default function PaymentsPage({ showRecordPayment, onRecordPaymentClose }) {
  const { profile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()

  const [payments, setPayments] = useState([])
  const [feeStructures, setFeeStructures] = useState([])
  const [loading, setLoading] = useState(true)
  const [term, setTerm] = useState(currentTerm || '')
  const [year, setYear] = useState(String(currentYear || new Date().getFullYear()))
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterStream, setFilterStream] = useState('')
  const [filterMethod, setFilterMethod] = useState('all')
  const [page, setPage] = useState(0)
  const [contextMenu, setContextMenu] = useState(null)
  const [viewModal, setViewModal] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [toast, setToast] = useState(null)
  const [showPayModal, setShowPayModal] = useState(false)
  const [payForm, setPayForm] = useState(() => BLANK_PAY(currentTerm, currentYear))
  const [studentSearch, setStudentSearch] = useState([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [payError, setPayError] = useState('')
  const tableRef = useRef(null)

  const load = useCallback(async () => {
    if (!profile?.school_id) return
    setLoading(true)

    const [payRes, structRes] = await Promise.all([
      supabase
        .from('fee_payments')
        .select('*, students(full_name, class, stream, admission_number)')
        .eq('school_id', profile.school_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('fee_structures')
        .select('amount, class, term, year')
        .eq('school_id', profile.school_id)
    ])

    const enriched = await enrichWithStaffNames(payRes.data || [])
    setPayments(enriched)
    setFeeStructures(structRes.data || [])
    setLoading(false)
  }, [profile?.school_id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handler)
      return () => document.removeEventListener('click', handler)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (showRecordPayment) {
      setShowPayModal(true)
      onRecordPaymentClose?.()
    }
  }, [showRecordPayment])

  const searchTimer = useRef(null)
  const searchStudents = useCallback((q) => {
    clearTimeout(searchTimer.current)
    if (!q || q.length < 2) { setStudentSearch([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('students')
        .select('id, full_name, admission_number, class, stream')
        .eq('school_id', profile.school_id)
        .or(`full_name.ilike.%${q}%,admission_number.ilike.%${q}%`)
        .limit(8)
      setStudentSearch(data || [])
      setSearching(false)
    }, 300)
  }, [profile?.school_id])

  const handleRecordPayment = async () => {
    setPayError('')
    if (!payForm.student) { setPayError('Please select a student.'); return }
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) { setPayError('Amount must be greater than 0.'); return }
    if (!payForm.term || !payForm.year) { setPayError('Please select a term and year.'); return }

    setSaving(true)
    const amount = parseFloat(payForm.amount)

    const prefix = 'RCP'
    const yearStr = String(new Date().getFullYear()).slice(-2)
    const { data: existing } = await supabase
      .from('fee_payments')
      .select('receipt_number')
      .eq('school_id', profile.school_id)
      .order('created_at', { ascending: false })
      .limit(1)
    let seq = 1
    if (existing?.length) {
      const last = existing[0].receipt_number
      if (last && last.startsWith(`${prefix}-${yearStr}-`)) {
        seq = parseInt(last.split('-')[2]) + 1
      }
    }
    const receiptNumber = `${prefix}-${yearStr}-${String(seq).padStart(5, '0')}`

    const paymentRecord = {
      school_id: profile.school_id,
      student_id: payForm.student.id,
      amount,
      payment_type: payForm.payment_type,
      payment_method: payForm.payment_type,
      provider: payForm.provider || null,
      reference: payForm.reference || null,
      receipt_number: receiptNumber,
      received_by: profile.id,
      transaction_date: payForm.transaction_date || TODAY,
      term: payForm.term,
      year: parseInt(payForm.year),
    }

    const { data: payData, error: payErr } = await supabase
      .from('fee_payments')
      .insert(paymentRecord)
      .select()
      .single()

    if (payErr) {
      setPayError(payErr.message)
      setSaving(false)
      return
    }

    await supabase.from('student_ledger').insert({
      school_id: profile.school_id,
      student_id: payForm.student.id,
      entry_type: 'payment',
      amount,
      term: payForm.term,
      year: parseInt(payForm.year),
      description: `Payment received via ${payForm.payment_type}`,
      reference_id: payData.id,
    })

    try {
      await postFeePaymentToGL(supabase, {
        schoolId: profile.school_id,
        userId: profile.id,
        payment: { ...payData, student: payForm.student, student_name: payForm.student.full_name },
        method: payForm.payment_type,
      })
    } catch (glErr) {
      setToast({ type: 'error', msg: `Payment recorded but GL posting failed: ${glErr.message}` })
      setSaving(false)
      setShowPayModal(false)
      setPayForm(BLANK_PAY(currentTerm, currentYear))
      load()
      return
    }

    setSaving(false)
    setShowPayModal(false)
    setPayForm(BLANK_PAY(currentTerm, currentYear))
    setToast({ type: 'success', msg: `Payment of ${fmt(amount)} recorded for ${payForm.student.full_name}. Receipt: ${receiptNumber}` })
    load()
  }

  async function enrichWithStaffNames(pays) {
    const staffIds = [...new Set(pays.map((p) => p.received_by).filter(Boolean))]
    if (!staffIds.length) return pays.map((p) => ({ ...p, staff_name: '—' }))
    const { data: staff } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', staffIds)
    const staffMap = Object.fromEntries((staff || []).map((s) => [s.id, s.full_name]))
    return pays.map((p) => ({ ...p, staff_name: staffMap[p.received_by] || '—' }))
  }

  const filtered = payments.filter((p) => {
    const matchTerm = !term || p.term === term
    const matchYear = !year || String(p.year) === year
    const matchSearch = !search ||
      p.students?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.students?.admission_number?.toLowerCase().includes(search.toLowerCase()) ||
      (p.reference || '').toLowerCase().includes(search.toLowerCase())
    const matchClass = !filterClass || p.students?.class === filterClass
    const matchStream = !filterStream || p.students?.stream === filterStream
    const matchMethod = filterMethod === 'all' || (p.payment_type || p.payment_method) === filterMethod
    return matchTerm && matchYear && matchSearch && matchClass && matchStream && matchMethod
  })

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const totalCollected = filtered.reduce((s, p) => s + Number(p.amount), 0)
  const totalCount = filtered.length

  const filteredStructures = feeStructures.filter((s) => {
    const matchTerm = !term || s.term === term
    const matchYear = !year || String(s.year) === year
    const matchClass = !filterClass || s.class === filterClass
    return matchTerm && matchYear && matchClass
  })
  const totalExpected = filteredStructures.reduce((s, st) => s + (parseFloat(st.amount) || 0), 0)

  const outstanding = totalExpected - totalCollected
  const collectionRate = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0

  const uniqueStudents = new Set(filtered.map((p) => p.students?.id)).size

  const allClasses = [...new Set(payments.map((p) => p.students?.class).filter(Boolean))].sort()
  const allStreams = [...new Set(
    payments.filter((p) => !filterClass || p.students?.class === filterClass)
      .map((p) => p.students?.stream).filter(Boolean)
  )].sort()

  const paidCount = filtered.filter((p) => !p.cheque_status || p.cheque_status === 'cleared').length
  const partialCount = filtered.filter((p) => {
    if (p.cheque_status !== 'pending') return false
    return true
  }).length
  const pendingCount = filtered.filter((p) => p.cheque_status === 'pending').length

  const resetFilters = () => {
    setSearch('')
    setFilterClass('')
    setFilterStream('')
    setFilterMethod('all')
    setTerm('')
    setPage(0)
  }

  const exportCSV = () => {
    const rows = [
      ['Date', 'Student', 'Adm No.', 'Class', 'Stream', 'Amount', 'Method', 'Reference', 'Receipt', 'Status', 'Received By'],
      ...filtered.map((p) => [
        p.transaction_date, p.students?.full_name, p.students?.admission_number,
        p.students?.class, p.students?.stream || '', p.amount, p.payment_type || p.payment_method,
        p.reference || '', p.receipt_number || '',
        p.cheque_status || 'completed', p.staff_name || '',
      ]),
    ]
    downloadFile(
      rows.map((r) => r.join(',')).join('\n'),
      `payments_${term || 'all'}_${year || 'all'}.csv`,
      'text/csv'
    )
  }

  const handleViewReceipt = (p) => {
    setContextMenu(null)
    setViewModal(p)
  }

  const handlePrintReceipt = async (p) => {
    setContextMenu(null)
    try {
      const blob = await generateReceiptPdf({ school, payment: p, student: p.students, term: p.term, year: p.year })
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank')
      if (win) win.onload = () => { win.print() }
    } catch {
      setToast({ type: 'error', msg: 'Failed to generate receipt.' })
    }
  }

  const handleReverse = (p) => {
    setContextMenu(null)
    setConfirmAction({ type: 'reverse', payment: p })
  }

  const handleAudit = (p) => {
    setContextMenu(null)
    setViewModal(p)
  }

  const executeConfirm = async () => {
    if (!confirmAction) return
    const { type, payment } = confirmAction
    const { error } = await supabase
      .from('fee_payments')
      .update({ cheque_status: 'reversed', updated_at: new Date().toISOString() })
      .eq('id', payment.id)
    if (error) {
      setToast({ type: 'error', msg: 'Failed to reverse payment.' })
    } else {
      if (payment.journal_entry_id) {
        try {
          const { data: je } = await supabase.from('journal_entries').select('*').eq('id', payment.journal_entry_id).single()
          if (je && je.status === 'posted') {
            await reverseJournal(supabase, { schoolId: profile.school_id, userId: profile.id, entry: je })
          }
        } catch {
          setToast({ type: 'error', msg: 'Payment reversed but GL reversal failed.' })
        }
      }
      setToast({ type: 'success', msg: 'Payment reversed successfully.' })
      setPayments((prev) => prev.map((p) => p.id === payment.id ? { ...p, cheque_status: 'reversed' } : p))
    }
    setConfirmAction(null)
  }

  const initials = (name) => {
    if (!name) return '—'
    return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  }

  const methodClass = (m) => {
    if (!m) return 'default'
    const map = { mpesa: 'mpesa', bank: 'bank', cash: 'cash', mobile_money: 'mobile_money', cheque: 'cheque', waiver: 'waiver' }
    return map[m] || 'default'
  }

  const statusClass = (p) => {
    if (p.cheque_status === 'refunded' || p.cheque_status === 'reversed') return 'reversed'
    if (!p.cheque_status) return 'completed'
    const map = { pending: 'pending', cleared: 'completed', bounced: 'failed' }
    return map[p.cheque_status] || 'pending'
  }

  const statusLabel = (p) => {
    if (!p.cheque_status) return 'Completed'
    return p.cheque_status.charAt(0).toUpperCase() + p.cheque_status.slice(1)
  }

  const handleMoreClick = (e, payment) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setContextMenu({
      payment,
      x: Math.min(rect.left, window.innerWidth - 220),
      y: rect.bottom + 4,
    })
  }

  const hasFilters = search || filterClass || filterStream || filterMethod !== 'all' || term

  if (loading) return <div className="pay-loading">Loading payments…</div>

  return (
    <div className="pay-page" onClick={() => setContextMenu(null)}>

      {/* ═══ Sticky Finance Toolbar ═══ */}
      <div className="pay-toolbar" onClick={(e) => e.stopPropagation()}>
        <div className="pay-toolbar-group">
          <div className="pay-search-wrap">
            <Search size={13} className="pay-search-icon" />
            <input
              className="pay-search-input"
              placeholder="Search student, adm no, ref…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            />
          </div>
        </div>
        <div className="pay-toolbar-sep" />
        <div className="pay-toolbar-group">
          <label>Term</label>
          <select className="pay-filter-select" value={term} onChange={(e) => { setTerm(e.target.value); setPage(0) }}>
            <option value="">All Terms</option>
            {TERMS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="pay-toolbar-sep" />
        <div className="pay-toolbar-group">
          <label>Year</label>
          <select className="pay-filter-select" value={year} onChange={(e) => { setYear(e.target.value); setPage(0) }}>
            <option value="">All Years</option>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div className="pay-toolbar-sep" />
        <div className="pay-toolbar-group">
          <label>Class</label>
          <select className="pay-filter-select" value={filterClass} onChange={(e) => { setFilterClass(e.target.value); setFilterStream(''); setPage(0) }}>
            <option value="">All Classes</option>
            {allClasses.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="pay-toolbar-sep" />
        <div className="pay-toolbar-group">
          <label>Stream</label>
          <select className="pay-filter-select" value={filterStream} onChange={(e) => { setFilterStream(e.target.value); setPage(0) }}>
            <option value="">All Streams</option>
            {allStreams.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="pay-toolbar-sep" />
        <div className="pay-toolbar-group">
          <label>Method</label>
          <select className="pay-filter-select" value={filterMethod} onChange={(e) => { setFilterMethod(e.target.value); setPage(0) }}>
            {METHODS.map((m) => (
              <option key={m} value={m}>{m === 'all' ? 'All Methods' : m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <>
            <div className="pay-toolbar-sep" />
            <button className="pay-reset-btn" onClick={resetFilters}>
              <RotateCcw size={12} /> Reset
            </button>
          </>
        )}
      </div>

      {/* ═══ 3. KPI Cards ═══ */}
      <div className="pay-kpi-row">
        <div className="pay-kpi-card blue">
          <div className="pay-kpi-icon-wrap"><DollarSign /></div>
          <div className="pay-kpi-body">
            <p className="pay-kpi-label">Total Expected</p>
            <p className="pay-kpi-value">{fmt(totalExpected)}</p>
          </div>
          <span className="pay-kpi-trend flat">{filteredStructures.length} structures</span>
        </div>
        <div className="pay-kpi-card green">
          <div className="pay-kpi-icon-wrap"><CheckCircle /></div>
          <div className="pay-kpi-body">
            <p className="pay-kpi-label">Total Collected</p>
            <p className="pay-kpi-value">{fmt(totalCollected)}</p>
          </div>
          <span className="pay-kpi-trend up">{totalCount} payments</span>
        </div>
        <div className="pay-kpi-card amber">
          <div className="pay-kpi-icon-wrap"><Activity /></div>
          <div className="pay-kpi-body">
            <p className="pay-kpi-label">Outstanding Balance</p>
            <p className="pay-kpi-value">{outstanding > 0 ? fmt(outstanding) : '—'}</p>
          </div>
          <span className="pay-kpi-trend flat">{outstanding <= 0 ? 'Fully collected' : 'Pending'}</span>
        </div>
        <div className="pay-kpi-card purple">
          <div className="pay-kpi-icon-wrap"><TrendingUp /></div>
          <div className="pay-kpi-body">
            <p className="pay-kpi-label">Collection Rate</p>
            <p className="pay-kpi-value">{totalExpected > 0 ? `${collectionRate}%` : '—'}</p>
          </div>
          <span className="pay-kpi-trend flat">{uniqueStudents} students</span>
        </div>
      </div>

      {/* ═══ 4. Payment Status Summary ═══ */}
      <div className="pay-status-bar">
        <span className="pay-status-bar-label">Payment Status</span>
        <div className="pay-status-segments">
          <div className="pay-status-segment paid">
            <span className="pay-status-dot" />
            <span className="pay-status-seg-label">Paid</span>
            <span className="pay-status-seg-count">{paidCount}</span>
          </div>
          <div className="pay-status-segment partial">
            <span className="pay-status-dot" />
            <span className="pay-status-seg-label">Partial</span>
            <span className="pay-status-seg-count">{partialCount}</span>
          </div>
          <div className="pay-status-segment pending">
            <span className="pay-status-dot" />
            <span className="pay-status-seg-label">Pending</span>
            <span className="pay-status-seg-count">{pendingCount}</span>
          </div>
        </div>
      </div>

      {/* ═══ 5. Payment Table ═══ */}
      <div className="pay-table-card">
        <div className="pay-table-head">
          <h3>Recent Payments <span>· {filtered.length} records</span></h3>
          <div className="pay-table-head-actions">
            <button className="pay-btn-ghost" onClick={load}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="pay-empty">
            <div className="pay-empty-icon"><Receipt /></div>
            <p className="pay-empty-title">No payments found</p>
            <p className="pay-empty-desc">
              {hasFilters
                ? 'Try adjusting your filters or search term.'
                : 'Start by recording the first payment for this term.'}
            </p>
            {hasFilters ? (
              <button className="pay-btn-primary" onClick={resetFilters}>
                <RotateCcw size={15} /> Clear Filters
              </button>
            ) : (
              <button className="pay-btn-primary" onClick={() => setShowPayModal(true)}>
                <Plus size={15} /> Receive Payment
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="pay-table-wrap" ref={tableRef}>
              <table className="pay-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Class</th>
                    <th className="pay-th-right">Amount</th>
                    <th>Method</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Receipt</th>
                    <th>Received By</th>
                    <th className="pay-th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="pay-student-cell">
                          <div className="pay-student-avatar">{initials(p.students?.full_name)}</div>
                          <div>
                            <div className="pay-student-name">{p.students?.full_name || '—'}</div>
                            <div className="pay-student-adm">{p.students?.admission_number || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="pay-class-tag">
                          {p.students?.class || '—'}{p.students?.stream ? ` ${p.students.stream}` : ''}
                        </span>
                      </td>
                      <td className="pay-amount">{fmt(p.amount)}</td>
                      <td>
                        <span className={`pay-method-chip ${methodClass(p.payment_type || p.payment_method)}`}>
                          {(p.payment_type || p.payment_method || '—').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="pay-muted">{fmtDate(p.transaction_date)}</td>
                      <td><span className={`pay-status-pill ${statusClass(p)}`}>{statusLabel(p)}</span></td>
                      <td className="pay-mono">{p.receipt_number || '—'}</td>
                      <td className="pay-muted">{p.staff_name || '—'}</td>
                      <td className="pay-actions-cell">
                        <button className="pay-action-btn" title="View receipt" onClick={(e) => { e.stopPropagation(); handleViewReceipt(p) }}>
                          <Eye size={15} />
                        </button>
                        <button className="pay-action-btn" title="Print receipt" onClick={(e) => { e.stopPropagation(); handlePrintReceipt(p) }}>
                          <Printer size={15} />
                        </button>
                        <button className="pay-action-btn danger" title="Reverse payment" onClick={(e) => { e.stopPropagation(); handleReverse(p) }}>
                          <RotateCcw size={15} />
                        </button>
                        <button className="pay-action-btn" title="Audit transaction" onClick={(e) => { e.stopPropagation(); handleAudit(p) }}>
                          <FileText size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pageCount > 1 && (
              <div className="pay-pagination">
                <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                <div className="pay-pagination-btns">
                  <button className="pay-btn-outline" style={{ padding: '6px 12px', fontSize: 13 }} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
                  <button className="pay-btn-outline" style={{ padding: '6px 12px', fontSize: 13 }} disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ Context Menu ═══ */}
      {contextMenu && (
        <div
          className="pay-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="pay-context-item" onClick={() => handleViewReceipt(contextMenu.payment)}>
            <Eye /> View receipt
          </button>
          <button className="pay-context-item" onClick={() => handlePrintReceipt(contextMenu.payment)}>
            <Printer /> Print receipt
          </button>
          <div className="pay-context-sep" />
          <button className="pay-context-item danger" onClick={() => handleReverse(contextMenu.payment)}>
            <RotateCcw /> Reverse payment
          </button>
          <button className="pay-context-item" onClick={() => handleAudit(contextMenu.payment)}>
            <FileText /> Audit transaction
          </button>
        </div>
      )}

      {/* ═══ View Transaction Modal ═══ */}
      {viewModal && (
        <div className="pay-modal-overlay" onClick={() => setViewModal(null)}>
          <div className="pay-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pay-modal-header">
              <h3>Transaction Details</h3>
              <button className="pay-modal-close" onClick={() => setViewModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="pay-modal-body">
              <div className="pay-detail-row">
                <span className="pay-detail-label">Student</span>
                <span className="pay-detail-value">{viewModal.students?.full_name || '—'}</span>
              </div>
              <div className="pay-detail-row">
                <span className="pay-detail-label">Admission No.</span>
                <span className="pay-detail-value pay-mono">{viewModal.students?.admission_number || '—'}</span>
              </div>
              <div className="pay-detail-row">
                <span className="pay-detail-label">Class</span>
                <span className="pay-detail-value">{viewModal.students?.class || '—'}{viewModal.students?.stream ? ` ${viewModal.students.stream}` : ''}</span>
              </div>
              <div className="pay-detail-row">
                <span className="pay-detail-label">Amount</span>
                <span className="pay-detail-value" style={{ fontWeight: 700, color: '#16a34a', fontSize: 18 }}>{fmt(viewModal.amount)}</span>
              </div>
              <div className="pay-detail-row">
                <span className="pay-detail-label">Method</span>
                <span className="pay-detail-value">
                  <span className={`pay-method-chip ${methodClass(viewModal.payment_type || viewModal.payment_method)}`}>
                    {(viewModal.payment_type || viewModal.payment_method || '—').replace(/_/g, ' ')}
                  </span>
                </span>
              </div>
              <div className="pay-detail-row">
                <span className="pay-detail-label">Provider</span>
                <span className="pay-detail-value">{viewModal.provider || '—'}</span>
              </div>
              <div className="pay-detail-row">
                <span className="pay-detail-label">Reference</span>
                <span className="pay-detail-value pay-mono">{viewModal.reference || '—'}</span>
              </div>
              <div className="pay-detail-row">
                <span className="pay-detail-label">Transaction Date</span>
                <span className="pay-detail-value">{fmtDate(viewModal.transaction_date)}</span>
              </div>
              <div className="pay-detail-row">
                <span className="pay-detail-label">Recorded</span>
                <span className="pay-detail-value">{fmtDateTime(viewModal.created_at)}</span>
              </div>
              <div className="pay-detail-row">
                <span className="pay-detail-label">Receipt</span>
                <span className="pay-detail-value pay-mono">{viewModal.receipt_number || '—'}</span>
              </div>
              <div className="pay-detail-row">
                <span className="pay-detail-label">Status</span>
                <span className="pay-detail-value"><span className={`pay-status-pill ${statusClass(viewModal)}`}>{statusLabel(viewModal)}</span></span>
              </div>
              <div className="pay-detail-row">
                <span className="pay-detail-label">Received By</span>
                <span className="pay-detail-value">{viewModal.staff_name || '—'}</span>
              </div>
              {viewModal.term && (
                <div className="pay-detail-row">
                  <span className="pay-detail-label">Term / Year</span>
                  <span className="pay-detail-value">{viewModal.term} {viewModal.year}</span>
                </div>
              )}
            </div>
            <div className="pay-modal-footer">
              <button className="pay-btn-outline" onClick={() => { setViewModal(null); handlePrintReceipt(viewModal) }}>
                <Printer size={14} /> Print Receipt
              </button>
              <button className="pay-btn-primary" onClick={() => setViewModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Confirm Reverse Modal ═══ */}
      {confirmAction && (
        <div className="pay-modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="pay-modal pay-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="pay-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertOctagon size={18} style={{ color: '#dc2626' }} />
                </div>
                <h3>Reverse Transaction</h3>
              </div>
              <button className="pay-modal-close" onClick={() => setConfirmAction(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="pay-modal-body">
              <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                Are you sure you want to reverse this payment of{' '}
                <strong>{fmt(confirmAction.payment.amount)}</strong> to{' '}
                <strong>{confirmAction.payment.students?.full_name || 'this student'}</strong>?
              </p>
              <p style={{ margin: '12px 0 0', fontSize: 13, color: '#94a3b8' }}>
                This will mark the transaction as reversed in the system.
              </p>
            </div>
            <div className="pay-modal-footer">
              <button className="pay-btn-outline" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button className="pay-btn-primary" style={{ background: '#dc2626' }} onClick={executeConfirm}>
                Confirm Reverse
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Record Payment Modal ═══ */}
      {showPayModal && (
        <div className="pay-modal-overlay" onClick={() => { setShowPayModal(false); setPayForm(BLANK_PAY(currentTerm, currentYear)); setPayError('') }}>
          <div className="pay-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="pay-modal-header">
              <h3>Receive Payment</h3>
              <button className="pay-modal-close" onClick={() => { setShowPayModal(false); setPayForm(BLANK_PAY(currentTerm, currentYear)); setPayError('') }}>
                <X size={18} />
              </button>
            </div>
            <div className="pay-modal-body">
              {payError && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
                  {payError}
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Student</label>
                {payForm.student ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                      {payForm.student.full_name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{payForm.student.full_name}</div>
                      <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{payForm.student.admission_number} · {payForm.student.class}{payForm.student.stream ? ` ${payForm.student.stream}` : ''}</div>
                    </div>
                    <button className="pay-btn-ghost" onClick={() => setPayForm((f) => ({ ...f, student: null, student_search: '' }))}>
                      <X size={14} /> Change
                    </button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                    <input
                      style={{ width: '100%', padding: '9px 12px 9px 32px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                      placeholder="Search by name or admission number…"
                      value={payForm.student_search}
                      onChange={(e) => {
                        setPayForm((f) => ({ ...f, student_search: e.target.value }))
                        searchStudents(e.target.value)
                      }}
                    />
                    {studentSearch.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto', zIndex: 10, marginTop: 4 }}>
                        {studentSearch.map((s) => (
                          <div
                            key={s.id}
                            style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.1s' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                            onClick={() => { setPayForm((f) => ({ ...f, student: s, student_search: '' })); setStudentSearch([]) }}
                          >
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>
                              {s.full_name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.full_name}</div>
                              <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{s.admission_number} · {s.class}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {searching && <div style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8' }}>Searching…</div>}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Amount (KES)</label>
                <input
                  type="number"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontWeight: 600 }}
                  placeholder="0.00"
                  value={payForm.amount}
                  onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Payment Type</label>
                  <select
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                    value={payForm.payment_type}
                    onChange={(e) => setPayForm((f) => ({ ...f, payment_type: e.target.value, provider: '' }))}
                  >
                    <option value="cash">Cash</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Provider</label>
                  <select
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                    value={payForm.provider}
                    onChange={(e) => setPayForm((f) => ({ ...f, provider: e.target.value }))}
                  >
                    <option value="">— None —</option>
                    {payForm.payment_type === 'mobile_money' && (
                      <>
                        <option value="M-Pesa">M-Pesa</option>
                        <option value="Airtel Money">Airtel Money</option>
                        <option value="TKash">TKash</option>
                      </>
                    )}
                    {payForm.payment_type === 'bank' && (
                      <>
                        <option value="KCB">KCB</option>
                        <option value="Equity">Equity</option>
                        <option value="Co-op Bank">Co-op Bank</option>
                        <option value="ABSA">ABSA</option>
                        <option value="Stanbic">Stanbic</option>
                      </>
                    )}
                    {payForm.payment_type === 'cheque' && (
                      <>
                        <option value="KCB">KCB</option>
                        <option value="Equity">Equity</option>
                        <option value="Co-op Bank">Co-op Bank</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Reference / Code</label>
                  <input
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    placeholder="e.g. MPESA code or cheque no."
                    value={payForm.reference}
                    onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Transaction Date</label>
                  <input
                    type="date"
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    value={payForm.transaction_date}
                    onChange={(e) => setPayForm((f) => ({ ...f, transaction_date: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Term</label>
                  <select
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                    value={payForm.term}
                    onChange={(e) => setPayForm((f) => ({ ...f, term: e.target.value }))}
                  >
                    {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Year</label>
                  <select
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                    value={payForm.year}
                    onChange={(e) => setPayForm((f) => ({ ...f, year: e.target.value }))}
                  >
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="pay-modal-footer">
              <button className="pay-btn-outline" onClick={() => { setShowPayModal(false); setPayForm(BLANK_PAY(currentTerm, currentYear)); setPayError('') }}>Cancel</button>
              <button className="pay-btn-primary" onClick={handleRecordPayment} disabled={saving}>
                {saving ? 'Recording…' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Toast ═══ */}
      {toast && (
        <div className={`pay-toast ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle size={15} /> : <XCircle size={15} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
