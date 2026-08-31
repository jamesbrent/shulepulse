import { useState, useEffect } from 'react'
import {
  DollarSign, CheckCircle, Clock, TrendingUp, AlertCircle,
  Eye, Printer, RotateCcw, FileSearch, RefreshCw,
  ArrowDownToLine, Undo2, MoreHorizontal, X, AlertOctagon, Download, XCircle
} from 'lucide-react'
import { useFeesDashboard } from '../hooks/useFeesDashboard'
import { supabase } from '../../../../lib/supabase'
import { useSchool } from '../../useSchool'
import { SumCard }          from '../components/SumCard'
import { MethodBadge }      from '../components/MethodBadge'
import { fmt, fmtDate, fmtDateTime, initials, downloadFile } from '../utils/feesHelpers'
import { generateReceiptPdf } from '../utils/generateReceiptPdf'

const STATUS_MAP = {
  pending: { label: 'Pending',  cls: 'pending' },
  cleared: { label: 'Cleared',  cls: 'paid'    },
  bounced: { label: 'Bounced',  cls: 'bounced'  },
}

const PAGE_SIZE = 15

export function DashboardTab({ profile, term, year, search, filterClass, filterStream, refreshKey }) {
  const { school } = useSchool()
  const { summary, recentPayments, loading, collectionRate, reload } =
    useFeesDashboard(profile.school_id, term, year)

  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [contextMenu, setContextMenu] = useState(null)
  const [viewModal, setViewModal] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [toast, setToast] = useState(null)

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

  const filtered = recentPayments.filter((p) => {
    const matchSearch = !search ||
      p.students?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.students?.admission_number?.toLowerCase().includes(search.toLowerCase())
    const matchClass = !filterClass || p.students?.class === filterClass
    const matchStream = !filterStream || p.students?.stream === filterStream
    if (!matchSearch || !matchClass || !matchStream) return false
    if (statusFilter === 'all') return true
    if (statusFilter === 'paid') return !p.cheque_status || p.cheque_status === 'cleared'
    if (statusFilter === 'pending') return p.cheque_status === 'pending'
    if (statusFilter === 'bounced') return p.cheque_status === 'bounced'
    return true
  })

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const outstanding = Math.max(0, (summary.totalDue || 0) - (summary.totalPaid || 0))

  const exportCSV = () => {
    const rows = [
      ['Date', 'Student', 'Adm No.', 'Class', 'Amount', 'Method', 'Reference', 'Receipt', 'Status', 'Received By'],
      ...filtered.map((p) => [
        p.transaction_date, p.students?.full_name, p.students?.admission_number,
        p.students?.class, p.amount, p.payment_type || p.payment_method,
        p.reference || p.mpesa_code || '', p.receipt_number || '',
        p.cheque_status || 'completed', p.staff_name || '',
      ]),
    ]
    downloadFile(
      rows.map((r) => r.join(',')).join('\n'),
      `payments_${term || 'all'}_${year || 'all'}.csv`,
      'text/csv'
    )
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

  const handleViewTransaction = (p) => {
    setContextMenu(null)
    setViewModal(p)
  }

  const handlePrintReceipt = async (p) => {
    setContextMenu(null)
    try {
      const blob = await generateReceiptPdf({ school, payment: p, student: p.students, term: p.term, year: p.year })
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank')
      if (win) win.onload = () => win.print()
    } catch {
      setToast({ type: 'error', msg: 'Failed to generate receipt.' })
    }
  }

  const handleDownloadPDF = async (p) => {
    setContextMenu(null)
    try {
      const blob = await generateReceiptPdf({ school, payment: p, student: p.students, term: p.term, year: p.year })
      const name = `receipt_${p.students?.admission_number || p.id}_${p.transaction_date}.pdf`
      downloadFile(blob, name, 'application/pdf')
      setToast({ type: 'success', msg: 'Receipt downloaded.' })
    } catch {
      setToast({ type: 'error', msg: 'Failed to generate receipt PDF.' })
    }
  }

  const handleRefund = (p) => {
    setContextMenu(null)
    setConfirmAction({ type: 'refund', payment: p })
  }

  const handleReverse = (p) => {
    setContextMenu(null)
    setConfirmAction({ type: 'reverse', payment: p })
  }

  const isPendingCheque = (p) =>
    (p.payment_type === 'cheque' || p.payment_method === 'cheque') &&
    (!p.cheque_status || p.cheque_status === 'pending')

  const handleChequeStatus = async (p, status) => {
    setContextMenu(null)
    const { data, error } = await supabase.rpc('update_cheque_status', {
      p_payment_id: p.id,
      p_new_status: status,
      p_user_id: profile.id,
      p_note: null,
    })
    if (error || !data?.success) {
      setToast({ type: 'error', msg: data?.error || error?.message || `Failed to mark cheque ${status}.` })
    } else {
      setToast({ type: 'success', msg: `Cheque marked ${status}.` })
      reload()
    }
  }

  const executeConfirm = async () => {
    if (!confirmAction) return
    const { type, payment } = confirmAction
    const { data, error } = await supabase.rpc('reverse_fee_payment', {
      p_payment_id: payment.id,
      p_user_id: profile.id,
      p_reason: null,
      p_entry_date: new Date().toISOString().split('T')[0],
    })
    if (error || !data?.success) {
      setToast({ type: 'error', msg: data?.error || error?.message || `Failed to ${type} payment.` })
    } else {
      setToast({ type: 'success', msg: `Payment ${type === 'refund' ? 'refunded' : 'reversed'} successfully.` })
      reload()
    }
    setConfirmAction(null)
  }

  const statusClass = (p) => {
    if (p.cheque_status === 'refunded' || p.cheque_status === 'reversed') return 'pending'
    if (!p.cheque_status) return 'paid'
    const map = { pending: 'pending', cleared: 'paid', bounced: 'bounced' }
    return map[p.cheque_status] || 'pending'
  }

  const statusLabel = (p) => {
    if (!p.cheque_status) return 'Completed'
    return p.cheque_status.charAt(0).toUpperCase() + p.cheque_status.slice(1)
  }

  const methodClass = (m) => {
    if (!m) return 'default'
    const map = { mpesa: 'mpesa', bank: 'bank', cash: 'cash', mobile_money: 'mobile_money', cheque: 'cheque', waiver: 'waiver' }
    return map[m] || 'default'
  }

  return (
    <div className="tab-content" onClick={() => setContextMenu(null)}>
      {/* KPI Cards */}
      <div className="fees-summary">
        <SumCard color="blue"   icon={DollarSign}  label="Total Expected"  value={fmt(summary.totalDue)} />
        <SumCard color="green"  icon={CheckCircle} label="Total Collected" value={fmt(summary.totalPaid)} />
        <SumCard color="red"    icon={Clock}       label="Outstanding"     value={fmt(outstanding)} />
        <SumCard color="purple" icon={TrendingUp}  label="Collection Rate" value={`${collectionRate}%`} bar={collectionRate} />
      </div>

      {/* Segmented Status Bar */}
      <div className="segmented-status-bar">
        <div
          className={`seg-status-item ${statusFilter === 'all' ? 'active' : ''}`}
          data-status="all"
          onClick={() => { setStatusFilter('all'); setPage(0) }}
        >
          <span className="seg-dot" />
          All
          <span className="seg-count">{recentPayments.length}</span>
        </div>
        <div
          className={`seg-status-item ${statusFilter === 'paid' ? 'active' : ''}`}
          data-status="paid"
          onClick={() => { setStatusFilter('paid'); setPage(0) }}
        >
          <span className="seg-dot" />
          Paid
          <span className="seg-count">{summary.paid || 0}</span>
        </div>
        <div
          className={`seg-status-item ${statusFilter === 'pending' ? 'active' : ''}`}
          data-status="partial"
          onClick={() => { setStatusFilter('pending'); setPage(0) }}
        >
          <span className="seg-dot" />
          Pending
          <span className="seg-count">{summary.pending || 0}</span>
        </div>
        <div
          className={`seg-status-item ${statusFilter === 'bounced' ? 'active' : ''}`}
          data-status="overpaid"
          onClick={() => { setStatusFilter('bounced'); setPage(0) }}
        >
          <span className="seg-dot" />
          Bounced
          <span className="seg-count">{summary.bounced || 0}</span>
        </div>
      </div>

      {/* Recent payments table */}
      <div className="section-card">
        <div className="section-card-head">
          <h3>Recent Payments</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary sm" onClick={exportCSV} disabled={!filtered.length}>
              <Download size={13} /> Export
            </button>
            <button className="btn-icon" onClick={reload} title="Refresh">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        <div className="fees-table-wrap">
          <table className="fees-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Adm No.</th>
                <th>Class</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Paid On</th>
                <th>Received By</th>
                <th>Status</th>
                <th style={{ width: 48 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="loading-state">Loading…</td>
                </tr>
              ) : !paginated.length ? (
                <tr>
                  <td colSpan={10} className="empty-cell">{recentPayments.length ? 'No payments match filters.' : 'No payments yet.'}</td>
                </tr>
              ) : (
                paginated.map((p) => {
                  const st = p.cheque_status ? STATUS_MAP[p.cheque_status] : null
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="student-name-cell">
                          <div className="student-avatar-sm">{initials(p.students?.full_name)}</div>
                          <div>
                            <span className="sname">{p.students?.full_name || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="monospace">{p.students?.admission_number || '—'}</td>
                      <td>
                        <span className="class-tag">
                          {p.students?.class || '—'}{p.students?.stream ? ` ${p.students.stream}` : ''}
                        </span>
                      </td>
                      <td className="text-green fw600">{fmt(p.amount)}</td>
                      <td><MethodBadge method={p.payment_type || p.payment_method} provider={p.provider} /></td>
                      <td className="monospace">{p.reference || p.mpesa_code || '—'}</td>
                      <td className="text-muted">{fmtDate(p.transaction_date)}</td>
                      <td><span className="staff-name-tag">{p.staff_name || '—'}</span></td>
                      <td>
                        <span className={`status-badge ${statusClass(p)}`}>{statusLabel(p)}</span>
                      </td>
                      <td>
                        <button className="action-btn" title="More actions" onClick={(e) => handleMoreClick(e, p)}>
                          <MoreHorizontal size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="pagination-bar">
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div className="pagination-btns">
              <button className="btn-secondary sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <button className="btn-secondary sm" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Context Menu ═══ */}
      {contextMenu && (
        <div
          className="fees-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="fees-context-item" onClick={() => handleViewTransaction(contextMenu.payment)}>
            <Eye /> View transaction
          </button>
          <button className="fees-context-item" onClick={() => handlePrintReceipt(contextMenu.payment)}>
            <Printer /> Print receipt
          </button>
          <button className="fees-context-item" onClick={() => handleDownloadPDF(contextMenu.payment)}>
            <ArrowDownToLine /> Download PDF
          </button>
          <div className="fees-context-sep" />
          {isPendingCheque(contextMenu.payment) && (
            <>
              <button className="fees-context-item" onClick={() => handleChequeStatus(contextMenu.payment, 'cleared')}>
                <CheckCircle /> Mark cheque cleared
              </button>
              <button className="fees-context-item danger" onClick={() => handleChequeStatus(contextMenu.payment, 'bounced')}>
                <XCircle /> Mark cheque bounced
              </button>
              <div className="fees-context-sep" />
            </>
          )}
          <button className="fees-context-item" onClick={() => handleRefund(contextMenu.payment)}>
            <Undo2 /> Refund payment
          </button>
          <button className="fees-context-item danger" onClick={() => handleReverse(contextMenu.payment)}>
            <RotateCcw /> Reverse transaction
          </button>
        </div>
      )}

      {/* ═══ View Transaction Modal ═══ */}
      {viewModal && (
        <div className="fees-modal-overlay" onClick={() => setViewModal(null)}>
          <div className="fees-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fees-modal-header">
              <h3>Transaction Details</h3>
              <button className="fees-modal-close" onClick={() => setViewModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="fees-modal-body">
              <div className="fees-detail-row">
                <span className="fees-detail-label">Student</span>
                <span className="fees-detail-value">{viewModal.students?.full_name || '—'}</span>
              </div>
              <div className="fees-detail-row">
                <span className="fees-detail-label">Admission No.</span>
                <span className="fees-detail-value monospace">{viewModal.students?.admission_number || '—'}</span>
              </div>
              <div className="fees-detail-row">
                <span className="fees-detail-label">Class</span>
                <span className="fees-detail-value">{viewModal.students?.class || '—'}{viewModal.students?.stream ? ` ${viewModal.students.stream}` : ''}</span>
              </div>
              <div className="fees-detail-row">
                <span className="fees-detail-label">Amount</span>
                <span className="fees-detail-value text-green fw600" style={{ fontSize: 18 }}>{fmt(viewModal.amount)}</span>
              </div>
              <div className="fees-detail-row">
                <span className="fees-detail-label">Method</span>
                <span className="fees-detail-value"><MethodBadge method={viewModal.payment_type || viewModal.payment_method} provider={viewModal.provider} /></span>
              </div>
              <div className="fees-detail-row">
                <span className="fees-detail-label">Provider</span>
                <span className="fees-detail-value">{viewModal.provider || '—'}</span>
              </div>
              <div className="fees-detail-row">
                <span className="fees-detail-label">Reference</span>
                <span className="fees-detail-value monospace">{viewModal.reference || viewModal.mpesa_code || '—'}</span>
              </div>
              <div className="fees-detail-row">
                <span className="fees-detail-label">Transaction Date</span>
                <span className="fees-detail-value">{fmtDate(viewModal.transaction_date)}</span>
              </div>
              <div className="fees-detail-row">
                <span className="fees-detail-label">Recorded</span>
                <span className="fees-detail-value">{fmtDateTime(viewModal.created_at)}</span>
              </div>
              <div className="fees-detail-row">
                <span className="fees-detail-label">Receipt</span>
                <span className="fees-detail-value monospace">{viewModal.receipt_number || '—'}</span>
              </div>
              <div className="fees-detail-row">
                <span className="fees-detail-label">Status</span>
                <span className="fees-detail-value">
                  <span className={`status-badge ${statusClass(viewModal)}`}>{statusLabel(viewModal)}</span>
                </span>
              </div>
              <div className="fees-detail-row">
                <span className="fees-detail-label">Received By</span>
                <span className="fees-detail-value">{viewModal.staff_name || '—'}</span>
              </div>
              {viewModal.term && (
                <div className="fees-detail-row">
                  <span className="fees-detail-label">Term / Year</span>
                  <span className="fees-detail-value">{viewModal.term} {viewModal.year}</span>
                </div>
              )}
            </div>
            <div className="fees-modal-actions">
              <button className="btn-secondary" onClick={() => { setViewModal(null); handlePrintReceipt(viewModal) }}>
                <Printer size={14} /> Print
              </button>
              <button className="btn-primary" onClick={() => { setViewModal(null); handleDownloadPDF(viewModal) }}>
                <ArrowDownToLine size={14} /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Confirm Action Modal ═══ */}
      {confirmAction && (
        <div className="fees-modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="fees-modal fees-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="fees-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: confirmAction.type === 'refund' ? '#fef3c7' : '#fee2e2',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <AlertOctagon size={18} style={{ color: confirmAction.type === 'refund' ? '#d97706' : '#dc2626' }} />
                </div>
                <h3>{confirmAction.type === 'refund' ? 'Refund Payment' : 'Reverse Transaction'}</h3>
              </div>
              <button className="fees-modal-close" onClick={() => setConfirmAction(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="fees-modal-body">
              <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                Are you sure you want to {confirmAction.type} this payment of{' '}
                <strong>{fmt(confirmAction.payment.amount)}</strong> to{' '}
                <strong>{confirmAction.payment.students?.full_name || 'this student'}</strong>?
              </p>
              <p style={{ margin: '12px 0 0', fontSize: 13, color: '#94a3b8' }}>
                {confirmAction.type === 'refund'
                  ? 'This will mark the payment as refunded. The student ledger will need to be adjusted separately.'
                  : 'This will reverse the transaction and mark it as reversed in the system.'}
              </p>
            </div>
            <div className="fees-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button
                className="btn-primary"
                style={{ background: confirmAction.type === 'refund' ? '#d97706' : '#dc2626' }}
                onClick={executeConfirm}
              >
                {confirmAction.type === 'refund' ? 'Confirm Refund' : 'Confirm Reverse'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Toast ═══ */}
      {toast && (
        <div className={`fees-toast ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle size={15} /> : <XCircle size={15} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
