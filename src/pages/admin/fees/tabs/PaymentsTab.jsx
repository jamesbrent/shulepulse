import { useState, useEffect }         from 'react'
import { Search, ChevronRight, Wallet, CheckCircle, Percent, Printer, Plus, CreditCard, Calendar, DollarSign, Clock, TrendingUp, Download, Sparkles, Smartphone, Landmark, Banknote, School, BadgeDollarSign, Undo2 } from 'lucide-react'
import { supabase }                     from '../../../../lib/supabase'
import { usePayments }                  from '../hooks/usePayments'
import { useFeesDashboard }             from '../hooks/useFeesDashboard'
import { Modal, ModalActions }          from '../components/Modal'
import { SumCard }                      from '../components/SumCard'
import { MethodBadge }                  from '../components/MethodBadge'
import { fmt, fmtDate, fmtDateTime, initials, downloadFile } from '../utils/feesHelpers'
import { generateFeeStatementPdf }      from '../utils/generateFeeStatementPdf'
import { generateReceiptPdf }           from '../utils/generateReceiptPdf'
import { PAYMENT_METHODS, ADJUSTMENT_TYPES, PAYMENT_TYPES, MOBILE_MONEY_PROVIDERS, BANK_PROVIDERS, CHEQUE_STATUSES, PAYMENT_ROLES } from '../utils/feesHelpers'

const TODAY = new Date().toISOString().split('T')[0]

const BLANK_PAY = { amount: '', payment_method: 'mpesa', mpesa_code: '', transaction_date: TODAY }
const BLANK_ADJ = { type: 'discount', amount: '', reason: '' }

const BLANK_FLEX_PAY = {
  student_id: '',
  student_search: '',
  amount: '',
  payment_type: 'cash',
  provider: '',
  reference: '',
  cheque_status: 'pending',
  cheque_clearance_date: '',
  issue_date: TODAY,
  transaction_date: TODAY,
  metadata: {},
}

// ─── Auto-Assessment Toast ────────────────────────────────────────────────────
function AutoAssessedToast({ studentName, onDismiss }) {
  // Auto-dismiss after 6 seconds
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="auto-assessed-toast" role="status" aria-live="polite">
      <div className="aat-icon">
        <Sparkles size={15} />
      </div>
      <div className="aat-body">
        <p className="aat-title">Fees auto-assessed</p>
        <p className="aat-sub">
          {studentName} had no fee records for this term — charges have been applied from the active fee structure.
        </p>
      </div>
      <button className="aat-close" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  )
}

// ─── Overpayment allocation preview ─────────────────────────────────────────
function AllocationPreview({ preview, term, year }) {
  const rows   = (preview?.allocations || []).filter((a) => Number(a.applied) > 0)
  const credit = Number(preview?.credit) || 0
  if (!rows.length && !credit) return null
  return (
    <div className="overpay-preview">
      <p className="ledger-label" style={{ marginBottom: 6 }}>Payment Allocation</p>
      {rows.map((a) => (
        <div key={`${a.term}-${a.year}`} className="alloc-row">
          <span>{a.term} {a.year}{a.is_selected ? '' : ' (other term)'}</span>
          <span className="fw600">{fmt(a.applied)}</span>
        </div>
      ))}
      {credit > 0 && (
        <div className="alloc-row credit">
          <span>Student Credit (advance)</span>
          <span className="fw600">{fmt(credit)}</span>
        </div>
      )}
      {credit > 0 && (
        <div className="alloc-notice">
          Payment exceeds the {term} {year} balance — the excess is held as <strong>Student Credit</strong> and can be applied to future fees.
        </div>
      )}
    </div>
  )
}

export function PaymentsTab({ profile, term, year, search, filterClass, filterStream, refreshKey, onRefresh }) {
  const {
    students, selected, ledger, assessments,
    loading, saving, error,
    balance,
    creditHistory, creditBalance,
    autoAssessed, setAutoAssessed,
    setError,
    selectStudent, recordPayment, addAdjustment,
    previewAllocation, applyCredit, refundCredit,
  } = usePayments(profile.school_id, term, year)

  const { summary, collectionRate } = useFeesDashboard(profile.school_id, term, year)

  const [showReceipt,  setShowReceipt]  = useState(null)
  const [showAdjModal, setShowAdjModal] = useState(false)
  const [payForm,      setPayForm]      = useState(BLANK_PAY)
  const [adjForm,      setAdjForm]      = useState(BLANK_ADJ)

  const [showPayModal,     setShowPayModal]     = useState(false)
  const [flexPay,          setFlexPay]          = useState(BLANK_FLEX_PAY)
  const [payStudent,       setPayStudent]       = useState(null)
  const [payStudentSearch, setPayStudentSearch] = useState('')
  const [generatingPdf,    setGeneratingPdf]    = useState(false)

  // Overpayment preview + credit / refund UI
  const [preview,              setPreview]              = useState(null)
  const [flexPreview,          setFlexPreview]          = useState(null)
  const [payStudentOutstanding, setPayStudentOutstanding] = useState(null)
  const [showCreditModal,      setShowCreditModal]      = useState(false)
  const [creditForm,           setCreditForm]           = useState({ amount: '', term })
  const [showRefundModal,      setShowRefundModal]      = useState(false)
  const [refundForm,           setRefundForm]           = useState({ amount: '', method: 'cash', reference: '', transaction_date: TODAY, description: '' })
  const [creditMsg,            setCreditMsg]            = useState('')
  const [creditErr,            setCreditErr]            = useState('')

  const filtered = students.filter(
    (s) =>
      (!filterClass  || s.class  === filterClass)  &&
      (!filterStream || s.stream === filterStream) &&
      (s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
       s.admission_number?.toLowerCase().includes(search.toLowerCase()) ||
       s.class?.toLowerCase().includes(search.toLowerCase()))
  )

  const handlePayment = async (e) => {
    e.preventDefault()
    const receipt = await recordPayment(payForm, profile.id)
    if (receipt) { setPayForm(BLANK_PAY); setShowReceipt(receipt) }
  }

  const handleAdjustment = async (e) => {
    e.preventDefault()
    await addAdjustment(adjForm, profile.id)
    setShowAdjModal(false); setAdjForm(BLANK_ADJ)
  }

  const handleFlexPayment = async (e) => {
    e.preventDefault()
    if (!payStudent)    { setError('Please select a student.'); return }
    if (!term || !year) { setError('Please select term and year.'); return }

    if (flexPay.payment_type === 'adjustment') {
      await addAdjustment(
        { type: flexPay.reference || 'discount', amount: flexPay.amount, reason: flexPay.metadata?.reason || '' },
        profile.id,
        payStudent
      )
      setShowPayModal(false)
      setFlexPay(BLANK_FLEX_PAY)
      setPayStudent(null)
      setPayStudentSearch('')
      return
    }

    const form = {
      amount:               flexPay.amount,
      payment_type:         flexPay.payment_type,
      provider:             flexPay.provider || null,
      reference:            flexPay.reference || null,
      cheque_status:        flexPay.cheque_status,
      cheque_clearance_date: flexPay.cheque_clearance_date || null,
      issue_date:           flexPay.issue_date || null,
      transaction_date:     flexPay.transaction_date || TODAY,
      metadata:             { ...flexPay.metadata },
    }

    const receipt = await recordPayment(form, profile.id, payStudent)
    if (receipt) {
      setShowPayModal(false)
      setFlexPay(BLANK_FLEX_PAY)
      setPayStudent(null)
      setPayStudentSearch('')
      selectStudent(payStudent)
      setShowReceipt(receipt)
    }
  }

  const openPayModal = () => {
    setError('')
    setPayStudent(null)
    setPayStudentSearch('')
    setPayStudentOutstanding(null)
    setFlexPreview(null)
    setFlexPay(BLANK_FLEX_PAY)
    setShowPayModal(true)
  }

  // Live preview of where a typed amount goes (overpayment → credit notice)
  const handleQuickAmountChange = (val) => {
    setPayForm({ ...payForm, amount: val })
    const num = parseFloat(val)
    if (num > balance) previewAllocation(val).then(setPreview)
    else setPreview(null)
  }

  const handleFlexAmountChange = (val) => {
    setFlexPay({ ...flexPay, amount: val })
    const num = parseFloat(val)
    if (payStudent && num > 0 && payStudentOutstanding != null && num > payStudentOutstanding) {
      previewAllocation(val, payStudent.id).then(setFlexPreview)
    } else {
      setFlexPreview(null)
    }
  }

  const handleApplyCreditSubmit = async (e) => {
    e.preventDefault()
    setCreditMsg(''); setCreditErr('')
    const targetTerm = creditForm.term || term
    const res = await applyCredit({ targetTerm, targetYear: year, amount: creditForm.amount, description: 'Manual credit application' })
    if (res?.error) setCreditErr(res.error)
    else {
      setShowCreditModal(false)
      setCreditForm({ amount: '', term })
      setCreditMsg(`${fmt(res.applied)} applied to ${targetTerm} ${year}. Remaining credit: ${fmt(res.new_balance)}.`)
    }
  }

  const handleRefundSubmit = async (e) => {
    e.preventDefault()
    setCreditMsg(''); setCreditErr('')
    const res = await refundCredit({
      amount: refundForm.amount,
      method: refundForm.method,
      reference: refundForm.reference,
      entryDate: refundForm.transaction_date,
      description: refundForm.description,
    })
    if (res?.error) setCreditErr(res.error)
    else {
      setShowRefundModal(false)
      setRefundForm({ amount: '', method: 'cash', reference: '', transaction_date: TODAY, description: '' })
      setCreditMsg(`Refund of ${fmt(res.amount)} processed (${refundForm.method}). Remaining credit: ${fmt(res.new_balance)}.`)
    }
  }

  const payFiltered = students.filter(
    (s) =>
      s.full_name?.toLowerCase().includes(payStudentSearch.toLowerCase()) ||
      s.admission_number?.toLowerCase().includes(payStudentSearch.toLowerCase()) ||
      s.class?.toLowerCase().includes(payStudentSearch.toLowerCase())
  )

  const isAuthorized = PAYMENT_ROLES.some((r) => r.toLowerCase() === (profile?.role || '').toLowerCase())

  const fetchSchool = async () => {
    const { data } = await supabase
      .from('schools')
      .select('*')
      .eq('id', profile.school_id)
      .single()
    return data || {}
  }

  const handleDownloadStatement = async () => {
    if (!selected) return
    setGeneratingPdf(true)
    try {
      const school = await fetchSchool()
      const blob   = await generateFeeStatementPdf({ school, student: selected, ledger, assessments, term, year, credit: creditBalance })
      const filename = `fee_statement_${selected.admission_number || selected.id}_${term}_${year}.pdf`
      downloadFile(blob, filename, 'application/pdf')
    } finally {
      setGeneratingPdf(false)
    }
  }

  const handleExportStatementCSV = () => {
    if (!selected) return
    const rows = [
      ['Date', 'Reference', 'Description', 'Type', 'Debit (KES)', 'Credit (KES)', 'Balance (KES)'],
      ...ledger.slice().sort((a, b) => new Date(a.transaction_date || a.created_at) - new Date(b.transaction_date || b.created_at)).map((e) => {
        const amt     = Number(e.amount) || 0
        const isDebit = ['charge', 'penalty'].includes(e.entry_type)
        return [
          fmtDate(e.transaction_date || e.created_at), e.reference_id || '', e.description || '',
          e.entry_type,
          isDebit ? amt.toFixed(2) : 0,
          !isDebit ? amt.toFixed(2) : 0,
          '',
        ]
      }),
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    downloadFile(csv, `fee_statement_${selected.admission_number || selected.id}_${term}_${year}.csv`, 'text/csv')
  }

  const handleExportStatementExcel = () => {
    if (!selected) return
    const rows = [
      ['Date', 'Reference', 'Description', 'Type', 'Debit (KES)', 'Credit (KES)'],
      ...ledger.slice().sort((a, b) => new Date(a.transaction_date || a.created_at) - new Date(b.transaction_date || b.created_at)).map((e) => {
        const amt     = Number(e.amount) || 0
        const isDebit = ['charge', 'penalty'].includes(e.entry_type)
        return [
          fmtDate(e.transaction_date || e.created_at), e.reference_id || '', e.description || '',
          e.entry_type,
          isDebit ? amt.toFixed(2) : 0,
          !isDebit ? amt.toFixed(2) : 0,
        ]
      }),
    ]
    const tsv = rows.map((r) => r.join('\t')).join('\n')
    downloadFile(tsv, `fee_statement_${selected.admission_number || selected.id}_${term}_${year}.xls`, 'application/vnd.ms-excel')
  }

  const handleDownloadReceipt = async (receipt) => {
    const school      = await fetchSchool()
    const payAmount   = Number(receipt.amount) || 0
    const prevBal     = balance + payAmount
    const newBal      = balance
    const blob        = await generateReceiptPdf({
      school, student: selected, payment: receipt,
      term, year, profile,
      receiptNumber: receipt.receipt_number,
      prevBalance:   prevBal,
      newBalance:    newBal,
    })
    const filename = `receipt_${receipt.receipt_number || receipt.id || 'payment'}.pdf`
    downloadFile(blob, filename, 'application/pdf')
  }

  return (
    <div className="tab-content">

      {/* ── Auto-Assessment Toast ── */}
      {autoAssessed && selected && (
        <AutoAssessedToast
          studentName={selected.full_name}
          onDismiss={() => setAutoAssessed(false)}
        />
      )}

      {/* ── Header with Add Payment button ── */}
      <div className="payments-tab-header">
        <h3>Payments</h3>
        <p className="text-muted">Record and manage student fee payments</p>
        <button
          className="btn-primary"
          onClick={openPayModal}
          disabled={!term || !year || !isAuthorized}
          title={
            !term || !year    ? 'Select term and year first' :
            !isAuthorized     ? 'You do not have permission to record payments' :
            ''
          }
        >
          <Plus size={16} /> Add Payment
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="fees-summary">
        <SumCard color="blue"   icon={DollarSign}  label="Total Expected"  value={fmt(summary.totalDue)} />
        <SumCard color="green"  icon={CheckCircle} label="Total Collected" value={fmt(summary.totalPaid)} />
        <SumCard color="red"    icon={Clock}       label="Outstanding"     value={fmt(summary.totalBalance)} />
        <SumCard color="purple" icon={TrendingUp}  label="Collection Rate" value={`${collectionRate}%`} bar={collectionRate} />
      </div>

      <div className="payments-layout">
        {/* ── Student Search Panel ── */}
        <div className="student-search-panel">
          <div className="student-list">
            {filtered.slice(0, 40).map((s) => (
              <div
                key={s.id}
                className={`student-list-item ${selected?.id === s.id ? 'active' : ''}`}
                onClick={() => { if (term && year) selectStudent(s) }}
                title={!term || !year ? 'Select term and year first' : ''}
              >
                <div className="student-avatar-sm">{initials(s.full_name)}</div>
                <div>
                  <p className="sname">{s.full_name}</p>
                  <p className="sadm">{s.class}{s.stream ? ` — ${s.stream}` : ''} · {s.admission_number}</p>
                </div>
                <ChevronRight size={14} className="text-muted" />
              </div>
            ))}
            {!filtered.length && (
              <p className="text-muted" style={{ padding: '16px 0' }}>No students found.</p>
            )}
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="payment-detail-panel">
          {!selected ? (
            <div className="empty-fees">
              <Wallet size={40} color="#cbd5e1" />
              <p>Select a student to view their account and record a payment.</p>
            </div>
          ) : loading ? (
            <p className="loading-state">Loading account…</p>
          ) : (
            <>
              {/* Student header */}
              <div className="pay-student-header">
                <div className="student-avatar-lg">{initials(selected.full_name)}</div>
                <div>
                  <h3>{selected.full_name}</h3>
                  <p className="sadm">{selected.class}{selected.stream ? ` — ${selected.stream}` : ''} · {selected.admission_number}</p>
                </div>
                <div
                  className="pay-balance-chip"
                  style={{ color: balance > 0 ? '#dc2626' : '#16a34a' }}
                >
                  <span className="bal-label">{balance > 0 ? 'Outstanding' : 'Cleared'}</span>
                  <span className="bal-value">{fmt(Math.max(balance, 0))}</span>
                </div>
                {creditBalance > 0 && (
                  <div className="pay-credit-chip">
                    <span className="bal-label">Student Credit</span>
                    <span className="bal-value">{fmt(creditBalance)}</span>
                  </div>
                )}
                <div className="stmt-actions">
                  <button className="btn-ghost sm" onClick={handleDownloadStatement} disabled={generatingPdf} title="Statement PDF">
                    <Download size={13} /> {generatingPdf ? '…' : 'PDF'}
                  </button>
                  <button className="btn-ghost sm" onClick={handleExportStatementCSV} title="Statement CSV" style={{ fontSize: 11 }}>
                    CSV
                  </button>
                  <button className="btn-ghost sm" onClick={handleExportStatementExcel} title="Statement Excel" style={{ fontSize: 11 }}>
                    XLS
                  </button>
                </div>
              </div>

              {/* Assessments */}
              {assessments.length > 0 && (
                <div className="ledger-mini">
                  <p className="ledger-label">Assessed Fees — {term} {year}</p>
                  {assessments.map((a) => (
                    <div key={a.id} className="ledger-row">
                      <span>{a.fee_structures?.fee_categories?.name || 'Fee'}</span>
                      <span className="fw600">{fmt(a.amount_due)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* No fee structure warning */}
              {assessments.length === 0 && (
                <div className="gen-result warn" style={{ marginTop: 12 }}>
                  No fee structures are configured for <strong>{selected.class}</strong> in {term} {year}.
                  Set up fee structures first before recording payments.
                </div>
              )}

              {/* Transaction ledger */}
              {ledger.length > 0 && (
                <div className="section-card" style={{ marginTop: 16 }}>
                  <p className="ledger-label" style={{ marginBottom: 8 }}>Transaction Ledger</p>
                  <div className="audit-table-wrap">
                    <table className="fees-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th>Type</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.map((e) => (
                          <tr key={e.id}>
                            <td className="text-muted" title={fmtDateTime(e.transaction_date || e.created_at)}>{fmtDate(e.transaction_date || e.created_at)}</td>
                            <td>{e.description}</td>
                            <td><span className={`entry-type ${e.entry_type}`}>{e.entry_type}</span></td>
                            <td className={['charge', 'penalty'].includes(e.entry_type) ? 'text-red fw600' : 'text-green fw600'}>
                              {['charge', 'penalty'].includes(e.entry_type) ? '+' : '−'}{fmt(e.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Record Payment section */}
              {balance > 0 && (
                <div className="section-card" style={{ marginTop: 16 }}>
                  <div className="section-card-head">
                    <h4>Quick Record Payment</h4>
                    <button className="btn-ghost sm" onClick={() => setShowAdjModal(true)}>
                      <Percent size={13} /> Add Adjustment
                    </button>
                  </div>
                  {error && <div className="form-error">{error}</div>}
                  <form onSubmit={handlePayment} className="modal-form">
                    <div className="form-grid">
                      <div className="form-field full">
                        <label>
                          Amount (KES) * <span className="text-muted">Outstanding: {fmt(balance)}</span>
                        </label>
                        <input
                          required
                          type="number"
                          min="1"
                          placeholder={`KES ${balance.toLocaleString()} outstanding`}
                          value={payForm.amount}
                          onChange={(e) => handleQuickAmountChange(e.target.value)}
                        />
                      </div>
                      {preview && Number(payForm.amount) > balance && (
                        <div className="form-field full">
                          <AllocationPreview preview={preview} term={term} year={year} />
                        </div>
                      )}
                      <div className="form-field full">
                        <label>Payment Method *</label>
                        <div className="method-tabs">
                          {PAYMENT_METHODS.map((m) => {
                            const Icon = m === 'mpesa' ? Smartphone : m === 'bank' ? Landmark : Banknote
                            return (
                              <button
                                key={m}
                                type="button"
                                className={`method-tab ${payForm.payment_method === m ? 'active' : ''}`}
                                onClick={() => setPayForm({ ...payForm, payment_method: m })}
                              >
                                <Icon size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                {m === 'mpesa' ? 'M-Pesa' : m === 'bank' ? 'Bank' : 'Cash'}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      {payForm.payment_method === 'mpesa' && (
                        <div className="form-field full">
                          <label>M-Pesa Code</label>
                          <input
                            placeholder="e.g. QHX7K2LPMA"
                            value={payForm.mpesa_code}
                            onChange={(e) => setPayForm({ ...payForm, mpesa_code: e.target.value.toUpperCase() })}
                            style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
                          />
                        </div>
                      )}
                      <div className="form-field full">
                        <label><Calendar size={13} /> Payment Date</label>
                        <input
                          type="date"
                          value={payForm.transaction_date}
                          onChange={(e) => setPayForm({ ...payForm, transaction_date: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="modal-actions">
                      <button type="submit" className="btn-primary" disabled={saving} style={{ width: '100%' }}>
                        <CheckCircle size={15} /> {saving ? 'Processing…' : 'Confirm Payment'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {balance <= 0 && assessments.length > 0 && (
                <div className="gen-result success" style={{ marginTop: 16 }}>
                  <CheckCircle size={16} />
                  {creditBalance > 0
                    ? `No outstanding balance for ${term} ${year} — ${fmt(creditBalance)} is held as student credit.`
                    : `This student's account is fully settled for ${term} ${year}.`}
                </div>
              )}

              {/* ── Student Credit / Advance ── */}
              {creditBalance > 0 && (
                <div className="section-card" style={{ marginTop: 16 }}>
                  <div className="section-card-head">
                    <h4><Wallet size={14} /> Student Credit / Advance</h4>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn-ghost sm"
                        onClick={() => {
                          setCreditErr(''); setCreditMsg('')
                          setCreditForm({ amount: creditBalance, term })
                          setShowCreditModal(true)
                        }}
                        title="Apply stored credit to an outstanding term balance"
                      >
                        <BadgeDollarSign size={13} /> Apply Credit
                      </button>
                      <button
                        className="btn-ghost sm"
                        onClick={() => { setCreditErr(''); setCreditMsg(''); setShowRefundModal(true) }}
                        title="Authorised refund of student credit"
                      >
                        <Undo2 size={13} /> Refund
                      </button>
                    </div>
                  </div>
                  {creditMsg && <div className="gen-result success" style={{ margin: '8px 0' }}>{creditMsg}</div>}
                  {creditErr && <div className="form-error" style={{ margin: '8px 0' }}>{creditErr}</div>}
                  <div className="credit-balance-row">
                    <span className="text-muted">Available credit</span>
                    <span className="fw600">{fmt(creditBalance)}</span>
                  </div>
                  {creditHistory.length > 0 && (
                    <div className="audit-table-wrap" style={{ marginTop: 8 }}>
                      <table className="fees-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Description</th>
                            <th>Amount</th>
                            <th>Running Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {creditHistory.map((t) => (
                            <tr key={t.id}>
                              <td className="text-muted">{fmtDate(t.entry_date || t.created_at)}</td>
                              <td><span className={`entry-type ${t.type}`}>{t.type}</span></td>
                              <td>{t.description || '—'}</td>
                              <td className={t.type === 'credit' ? 'text-green fw600' : 'text-red fw600'}>
                                {t.type === 'credit' ? '+' : '−'}{fmt(t.amount)}
                              </td>
                              <td className="fw600">{fmt(t.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                    Credit is held on account and can be applied to any outstanding term balance, or refunded with authorisation.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════ */}
      {/* ── ADD PAYMENT MODAL ── */}
      {/* ════════════════════════════════════════════════════ */}
      {showPayModal && (
        <Modal title="Record Payment" onClose={() => setShowPayModal(false)}>
          <form onSubmit={handleFlexPayment} className="modal-form">
            {error && <div className="form-error">{error}</div>}

            <div className="form-grid">
              <div className="form-field pay-modal-student full">
                <label>Student *</label>
                <div className="search-wrap pay-student-search">
                  <Search size={14} className="search-icon" />
                  <input
                    className="search-input"
                    placeholder="Search by name or admission number…"
                    value={payStudentSearch}
                    onChange={(e) => setPayStudentSearch(e.target.value)}
                  />
                </div>
                <div className="pay-student-list">
                  {payFiltered.slice(0, 8).map((s) => (
                    <div
                      key={s.id}
                      className={`pay-student-option ${payStudent?.id === s.id ? 'active' : ''}`}
                      onClick={() => {
                        setPayStudent(s)
                        setPayStudentSearch(`${s.full_name} (${s.admission_number})`)
                        setFlexPreview(null)
                        previewAllocation(0, s.id).then((p) => {
                          const sel = (p?.allocations || []).find((a) => a.is_selected)
                          setPayStudentOutstanding(sel?.outstanding ?? 0)
                        })
                      }}
                    >
                      <div className="student-avatar-sm">{initials(s.full_name)}</div>
                      <div>
                        <p className="sname">{s.full_name}</p>
                        <p className="sadm">{s.class} · {s.admission_number}</p>
                      </div>
                      {payStudent?.id === s.id && <CheckCircle size={16} className="text-green" />}
                    </div>
                  ))}
                  {!payFiltered.length && payStudentSearch && (
                    <p className="text-muted" style={{ padding: '8px 0' }}>No students match.</p>
                  )}
                </div>
              </div>

              <div className="form-field">
                <label>Term</label>
                <input type="text" value={term} disabled className="filter-select" style={{ background: '#f8fafc' }} />
              </div>
              <div className="form-field">
                <label>Year</label>
                <input type="text" value={year} disabled className="filter-select" style={{ background: '#f8fafc' }} />
              </div>
            </div>

            {payStudent && payStudentOutstanding != null && flexPay.payment_type !== 'adjustment' && (
              <div className="pay-modal-balance">
                <span>Current Balance:</span>
                <span className="fw600" style={{ color: payStudentOutstanding > 0 ? '#dc2626' : '#16a34a' }}>{fmt(payStudentOutstanding)}</span>
              </div>
            )}

            <div className="form-field full" style={{ marginTop: 14 }}>
              <label>Payment Type *</label>
              <div className="pay-type-grid">
                {PAYMENT_TYPES.map((pt) => (
                  <button
                    key={pt.value}
                    type="button"
                    className={`pay-type-btn ${flexPay.payment_type === pt.value ? 'active' : ''}`}
                    onClick={() => setFlexPay({ ...flexPay, payment_type: pt.value, provider: '', reference: '' })}
                  >
                    <span className="pay-type-icon"><pt.icon size={18} /></span>
                    <span className="pay-type-label">{pt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-grid" style={{ marginTop: 14 }}>
              {flexPay.payment_type === 'cash' && (
                <div className="form-field full">
                  <label>Receipt / Reference (optional)</label>
                  <input
                    placeholder="e.g. Cash receipt #"
                    value={flexPay.reference}
                    onChange={(e) => setFlexPay({ ...flexPay, reference: e.target.value })}
                  />
                </div>
              )}

              {flexPay.payment_type === 'mobile_money' && (
                <>
                  <div className="form-field full">
                    <label>Provider *</label>
                    <div className="provider-options">
                      {MOBILE_MONEY_PROVIDERS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={`provider-btn ${flexPay.provider === p ? 'active' : ''}`}
                          onClick={() => setFlexPay({ ...flexPay, provider: p })}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-field full">
                    <label>Transaction Code *</label>
                    <input
                      required
                      placeholder="e.g. QHX7K2LPMA"
                      value={flexPay.reference}
                      onChange={(e) => setFlexPay({ ...flexPay, reference: e.target.value.toUpperCase() })}
                      style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    />
                  </div>
                </>
              )}

              {flexPay.payment_type === 'bank' && (
                <>
                  <div className="form-field full">
                    <label>Bank Name *</label>
                    <select
                      required
                      value={flexPay.provider}
                      onChange={(e) => setFlexPay({ ...flexPay, provider: e.target.value })}
                    >
                      <option value="">Select bank…</option>
                      {BANK_PROVIDERS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Deposit Slip No.</label>
                    <input
                      placeholder="Slip number"
                      value={flexPay.reference}
                      onChange={(e) => setFlexPay({ ...flexPay, reference: e.target.value })}
                    />
                  </div>
                  <div className="form-field">
                    <label>Teller Ref. (optional)</label>
                    <input
                      placeholder="Teller ref"
                      value={flexPay.metadata?.teller_ref || ''}
                      onChange={(e) => setFlexPay({ ...flexPay, metadata: { ...flexPay.metadata, teller_ref: e.target.value } })}
                    />
                  </div>
                </>
              )}

              {flexPay.payment_type === 'cheque' && (
                <>
                  <div className="form-field">
                    <label>Cheque Number *</label>
                    <input
                      required
                      placeholder="e.g. CHQ-001234"
                      value={flexPay.reference}
                      onChange={(e) => setFlexPay({ ...flexPay, reference: e.target.value })}
                    />
                  </div>
                  <div className="form-field">
                    <label>Bank / Drawn On *</label>
                    <select
                      required
                      value={flexPay.provider}
                      onChange={(e) => setFlexPay({ ...flexPay, provider: e.target.value })}
                    >
                      <option value="">Select bank…</option>
                      {BANK_PROVIDERS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Issue Date</label>
                    <input
                      type="date"
                      value={flexPay.issue_date}
                      onChange={(e) => setFlexPay({ ...flexPay, issue_date: e.target.value })}
                    />
                  </div>
                  <div className="form-field">
                    <label>Status</label>
                    <select
                      value={flexPay.cheque_status}
                      onChange={(e) => setFlexPay({ ...flexPay, cheque_status: e.target.value })}
                    >
                      {CHEQUE_STATUSES.map((cs) => (
                        <option key={cs.value} value={cs.value}>{cs.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {flexPay.payment_type === 'adjustment' && (
                <>
                  <div className="form-field full">
                    <label>Adjustment Type *</label>
                    <div className="adj-type-options">
                      {ADJUSTMENT_TYPES.map((at) => (
                        <button
                          key={at}
                          type="button"
                          className={`adj-type-btn ${flexPay.reference === at ? 'active' : ''}`}
                          onClick={() => setFlexPay({ ...flexPay, reference: at })}
                        >
                          {at.charAt(0).toUpperCase() + at.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-field full">
                    <label>Reason / Description *</label>
                    <input
                      required
                      placeholder="e.g. Bursary award, fee waiver, etc."
                      value={flexPay.metadata?.reason || ''}
                      onChange={(e) => setFlexPay({ ...flexPay, metadata: { ...flexPay.metadata, reason: e.target.value } })}
                    />
                  </div>
                </>
              )}

              {/* Transaction Date (common to all types except adjustments) */}
              {flexPay.payment_type !== 'adjustment' && (
                <div className="form-field full">
                  <label><Calendar size={13} /> Payment Date (when money was paid)</label>
                  <input
                    type="date"
                    value={flexPay.transaction_date}
                    onChange={(e) => setFlexPay({ ...flexPay, transaction_date: e.target.value })}
                  />
                </div>
              )}

              <div
                className={`form-field ${flexPay.payment_type === 'adjustment' ? '' : 'full'}`}
                style={flexPay.payment_type === 'adjustment' ? {} : { marginTop: 0 }}
              >
                <label>
                  Amount (KES) *
                  {payStudent && payStudentOutstanding != null && payStudentOutstanding > 0 && flexPay.payment_type !== 'adjustment' && (
                    <span className="text-muted"> Outstanding: {fmt(payStudentOutstanding)}</span>
                  )}
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  placeholder="Enter amount"
                  value={flexPay.amount}
                  onChange={(e) => handleFlexAmountChange(e.target.value)}
                />
              </div>

              {flexPay.payment_type !== 'adjustment' && flexPreview && Number(flexPay.amount) > (payStudentOutstanding ?? 0) && (
                <AllocationPreview preview={flexPreview} term={term} year={year} />
              )}

              {flexPay.payment_type === 'adjustment' && (
                <div className="form-field">
                  <label>&nbsp;</label>
                  <div className="adj-notice">
                    Adjustments affect the student's ledger balance. Use for scholarships, waivers, discounts, or penalties.
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowPayModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving || !payStudent}>
                <CreditCard size={15} /> {saving ? 'Processing…' : 'Record Payment'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Receipt Modal ── */}
      {showReceipt && (
        <Modal title="Payment Receipt" onClose={() => setShowReceipt(null)}>
          <div className="receipt-body">
            <div className="receipt-logo"><School size={19} style={{ verticalAlign: 'middle', marginRight: 6 }} /> ShulePulse</div>
            <p className="receipt-title">Official Payment Receipt</p>
            <div className="receipt-row"><span>Receipt No.</span>  <span className="fw600">{showReceipt.receipt_number || showReceipt.receipt?.id?.slice(0, 8).toUpperCase() || '—'}</span></div>
            <div className="receipt-row"><span>Student</span>      <span>{showReceipt.student?.full_name}</span></div>
            <div className="receipt-row"><span>Admission</span>    <span>{showReceipt.student?.admission_number}</span></div>
            <div className="receipt-row"><span>Class</span>        <span>{showReceipt.student?.class}</span></div>
            <div className="receipt-row"><span>Term / Year</span>  <span>{term} / {year}</span></div>
            <div className="receipt-row"><span>Amount Received</span>  <span className="fw600 text-green">{fmt(showReceipt.amount)}</span></div>
            <div className="receipt-row">
              <span>Applied to Fees</span>
              <span className="fw600">{fmt(showReceipt.applied_amount != null ? showReceipt.applied_amount : showReceipt.amount)}</span>
            </div>
            {Number(showReceipt.credit_amount) > 0 && (
              <div className="receipt-row">
                <span>Student Credit</span>
                <span className="fw600" style={{ color: '#7c3aed' }}>{fmt(showReceipt.credit_amount)}</span>
              </div>
            )}
            <div className="receipt-row">
              <span>Method</span>
              <span><MethodBadge method={showReceipt.payment_type || showReceipt.payment_method} provider={showReceipt.provider} /></span>
            </div>
            {showReceipt.reference && (
              <div className="receipt-row"><span>Reference</span>  <span className="monospace">{showReceipt.reference}</span></div>
            )}
            {showReceipt.mpesa_code && (
              <div className="receipt-row"><span>M-Pesa Code</span><span className="monospace">{showReceipt.mpesa_code}</span></div>
            )}
            <div className="receipt-row"><span>Payment Date</span> <span>{fmtDate(showReceipt.transaction_date)}</span></div>
            <div className="receipt-row"><span>Recorded On</span>  <span>{fmtDateTime(new Date())}</span></div>
            <div className="receipt-row"><span>Received By</span>  <span>{profile?.full_name || profile?.email || '—'}</span></div>
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={() => handleDownloadReceipt(showReceipt)}>
              <Download size={14} /> Receipt PDF
            </button>
            <button className="btn-secondary" onClick={() => window.print()}>
              <Printer size={14} /> Print
            </button>
            <button className="btn-primary" onClick={() => setShowReceipt(null)}>Done</button>
          </div>
        </Modal>
      )}

      {/* ── Adjustment Modal ── */}
      {showAdjModal && (
        <Modal title="Add Adjustment" onClose={() => setShowAdjModal(false)}>
          <form onSubmit={handleAdjustment} className="modal-form">
            {error && <div className="form-error">{error}</div>}
            <div className="form-grid">
              <div className="form-field full">
                <label>Type *</label>
                <select
                  required
                  value={adjForm.type}
                  onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value })}
                >
                  {ADJUSTMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="form-field full">
                <label>Amount (KES) *</label>
                <input
                  required
                  type="number"
                  min="1"
                  placeholder="Amount"
                  value={adjForm.amount}
                  onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })}
                />
              </div>
              <div className="form-field full">
                <label>Reason *</label>
                <input
                  required
                  placeholder="e.g. Scholarship — bursary award"
                  value={adjForm.reason}
                  onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                />
              </div>
            </div>
            <ModalActions onCancel={() => setShowAdjModal(false)} saving={saving} label="Apply Adjustment" />
          </form>
        </Modal>
      )}

      {/* ── Apply Credit Modal ── */}
      {showCreditModal && (
        <Modal title="Apply Student Credit" onClose={() => setShowCreditModal(false)}>
          <form onSubmit={handleApplyCreditSubmit} className="modal-form">
            {creditErr && <div className="form-error">{creditErr}</div>}
            <div className="form-grid">
              <div className="form-field full">
                <label>Term * <span className="text-muted">({year})</span></label>
                <select value={creditForm.term} onChange={(e) => setCreditForm({ ...creditForm, term: e.target.value })}>
                  {['Term 1', 'Term 2', 'Term 3'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-field full">
                <label>Amount (KES) *</label>
                <input
                  required
                  type="number"
                  min="1"
                  max={creditBalance}
                  value={creditForm.amount}
                  onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
                />
                <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Available: {fmt(creditBalance)} — credit offsets the selected term's outstanding assessment.
                </p>
              </div>
            </div>
            <ModalActions onCancel={() => setShowCreditModal(false)} saving={saving} label="Apply Credit" />
          </form>
        </Modal>
      )}

      {/* ── Refund Credit Modal ── */}
      {showRefundModal && (
        <Modal title="Refund Student Credit" onClose={() => setShowRefundModal(false)}>
          <form onSubmit={handleRefundSubmit} className="modal-form">
            {creditErr && <div className="form-error">{creditErr}</div>}
            <div className="form-grid">
              <div className="form-field full">
                <label>Amount (KES) *</label>
                <input
                  required
                  type="number"
                  min="1"
                  max={creditBalance}
                  value={refundForm.amount}
                  onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })}
                />
                <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Available: {fmt(creditBalance)}
                </p>
              </div>
              <div className="form-field full">
                <label>Refund Method *</label>
                <select value={refundForm.method} onChange={(e) => setRefundForm({ ...refundForm, method: e.target.value })}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="mobile_money">M-Pesa / Mobile Money</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              <div className="form-field full">
                <label>Reference (optional)</label>
                <input
                  placeholder="e.g. M-Pesa confirmation code"
                  value={refundForm.reference}
                  onChange={(e) => setRefundForm({ ...refundForm, reference: e.target.value })}
                />
              </div>
              <div className="form-field full">
                <label>Refund Date</label>
                <input
                  type="date"
                  value={refundForm.transaction_date}
                  onChange={(e) => setRefundForm({ ...refundForm, transaction_date: e.target.value })}
                />
              </div>
              <div className="form-field full">
                <label>Reason / Notes</label>
                <input
                  placeholder="e.g. Parent requested refund of excess fees"
                  value={refundForm.description}
                  onChange={(e) => setRefundForm({ ...refundForm, description: e.target.value })}
                />
              </div>
            </div>
            <div className="gen-result warn" style={{ marginBottom: 12 }}>
              Refunds reduce the student's available credit and must be authorised by a finance officer or admin.
            </div>
            <ModalActions onCancel={() => setShowRefundModal(false)} saving={saving} label="Process Refund" />
          </form>
        </Modal>
      )}
    </div>
  )
}