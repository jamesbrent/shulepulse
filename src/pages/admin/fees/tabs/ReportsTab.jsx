import { useState, useCallback, useEffect } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { MethodBadge } from '../components/MethodBadge'
import { fmt, fmtDate, fmtDateTime, initials, downloadFile } from '../utils/feesHelpers'
import { PAYMENT_METHODS, PAYMENT_TYPES } from '../utils/feesHelpers'
import { generatePaymentsAuditPdf } from '../utils/generatePaymentsAuditPdf'

const STATUS_MAP = {
  pending: { label: 'Pending',  cls: 'pending' },
  cleared: { label: 'Cleared',  cls: 'paid'    },
  bounced: { label: 'Bounced',  cls: 'bounced'  },
}

export function ReportsTab({ profile, term, year, search, filterClass, filterStream, refreshKey }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterMethod, setFilterMethod] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(async () => {
    if (!term || !year) return
    setLoading(true)
    const { data } = await supabase
      .from('fee_payments')
      .select('*, students(full_name, class, stream, admission_number)')
      .eq('school_id', profile.school_id)
      .eq('term', term)
      .eq('year', year)
      .order('created_at', { ascending: false })
    const enriched = await enrichWithStaffNames(data || [])
    setPayments(enriched)
    setLoading(false)
  }, [profile.school_id, term, year])

  useEffect(() => { load() }, [load])

  const filtered = payments.filter((p) => {
    const matchMethod = filterMethod === 'all' || p.payment_method === filterMethod
    const matchType = filterType === 'all' || (p.payment_type || 'cash') === filterType
    const matchClass = !filterClass || p.students?.class === filterClass
    const matchStream = !filterStream || p.students?.stream === filterStream
    const matchFrom = !dateFrom || new Date(p.created_at) >= new Date(dateFrom)
    const matchTo = !dateTo || new Date(p.created_at) <= new Date(dateTo + 'T23:59:59')
    const matchSearch = !search ||
      p.students?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.students?.admission_number?.toLowerCase().includes(search.toLowerCase()) ||
      (p.reference || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.receipt_number || '').toLowerCase().includes(search.toLowerCase())
    return matchMethod && matchType && matchClass && matchStream && matchFrom && matchTo && matchSearch
  })

  const totalFiltered = filtered.reduce((s, p) => s + Number(p.amount), 0)

  const exportCSV = () => {
    const rows = [
      ['Transaction Date', 'Recorded Date', 'Student Name', 'Admission No.', 'Class', 'Stream',
       'Amount', 'Payment Type', 'Provider', 'Reference', 'Cheque Status',
       'Receipt No.', 'Received By'],
      ...filtered.map((p) => [
        p.transaction_date || '',
        fmtDate(p.created_at),
        p.students?.full_name,
        p.students?.admission_number,
        p.students?.class,
        p.students?.stream || '',
        p.amount,
        p.payment_type || p.payment_method,
        p.provider || '',
        p.reference || p.mpesa_code || '',
        p.cheque_status || '',
        p.receipt_number || '',
        p.staff_name || '',
      ]),
    ]
    downloadFile(
      rows.map((r) => r.join(',')).join('\n'),
      `payments_audit_${term}_${year}.csv`,
      'text/csv'
    )
  }

  const exportExcel = () => {
    const rows = [
      ['Transaction Date', 'Recorded Date', 'Student Name', 'Admission No.', 'Class', 'Stream',
       'Amount', 'Method', 'Provider', 'Reference', 'Status', 'Receipt No.', 'Received By'],
    ]
    filtered.forEach((p) => {
      rows.push([
        p.transaction_date || '',
        fmtDate(p.created_at),
        p.students?.full_name,
        p.students?.admission_number,
        p.students?.class,
        p.students?.stream || '',
        p.amount,
        p.payment_type || p.payment_method,
        p.provider || '',
        p.reference || p.mpesa_code || '',
        p.cheque_status || 'completed',
        p.receipt_number || '',
        p.staff_name || '',
      ])
    })
    const tsv = rows.map((r) => r.join('\t')).join('\n')
    downloadFile(tsv, `payments_audit_${term}_${year}.xls`, 'application/vnd.ms-excel')
  }

  const exportPDF = async () => {
    const school = profile?.school || {}
    const blob = await generatePaymentsAuditPdf({
      school,
      payments: filtered,
      term,
      year,
    })
    downloadFile(blob, `payments_audit_${term}_${year}.pdf`, 'application/pdf')
  }

  return (
    <div className="tab-content">
      <div className="report-summary-strip">
        <div className="rss-item">
          <span className="rss-label">Total Payments</span>
          <span className="rss-value">{filtered.length}</span>
        </div>
        <div className="rss-item">
          <span className="rss-label">Total Collected</span>
          <span className="rss-value text-green">{fmt(totalFiltered)}</span>
        </div>
        <div className="rss-item">
          <span className="rss-label">Mobile Money</span>
          <span className="rss-value">
            {fmt(filtered.filter((p) => (p.payment_type || p.payment_method) === 'mobile_money' || p.payment_method === 'mpesa').reduce((s, p) => s + Number(p.amount), 0))}
          </span>
        </div>
        <div className="rss-item">
          <span className="rss-label">Bank / Cheque</span>
          <span className="rss-value">
            {fmt(filtered.filter((p) => (p.payment_type || p.payment_method) === 'bank' || (p.payment_type || p.payment_method) === 'cheque').reduce((s, p) => s + Number(p.amount), 0))}
          </span>
        </div>
        <div className="rss-item">
          <span className="rss-label">Cash</span>
          <span className="rss-value">
            {fmt(filtered.filter((p) => (p.payment_type || p.payment_method) === 'cash').reduce((s, p) => s + Number(p.amount), 0))}
          </span>
        </div>
      </div>

      <div className="section-card">
        <div className="section-card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h3>Payments Audit Report</h3>
          <div className="report-filters">
            <select
              className="filter-select"
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
            >
              <option value="all">All Methods</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">All Types</option>
              {PAYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              type="date"
              className="filter-select"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="Recorded date from"
            />
            <span className="text-muted">to</span>
            <input
              type="date"
              className="filter-select"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="Recorded date to"
            />
            <button className="btn-secondary sm" onClick={exportCSV} disabled={!filtered.length}>
              <Download size={13} /> CSV
            </button>
            <button className="btn-secondary sm" onClick={exportExcel} disabled={!filtered.length}>
              <Download size={13} /> Excel
            </button>
            <button className="btn-secondary sm" onClick={exportPDF} disabled={!filtered.length}>
              <Download size={13} /> PDF
            </button>
          </div>
        </div>

        {loading ? (
          <p className="loading-state">Loading…</p>
        ) : (
          <div className="audit-table-wrap">
            <table className="fees-table audit-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Adm No.</th>
                  <th>Class</th>
                  <th>Stream</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Paid On</th>
                  <th>Recorded</th>
                  <th>Received By</th>
                  <th>Status</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const st = p.cheque_status ? STATUS_MAP[p.cheque_status] : null
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="student-name-cell">
                          <div className="student-avatar-sm">{initials(p.students?.full_name)}</div>
                          <span className="sname">{p.students?.full_name || '—'}</span>
                        </div>
                      </td>
                      <td className="monospace">{p.students?.admission_number || '—'}</td>
                      <td><span className="class-tag">{p.students?.class || '—'}</span></td>
                      <td><span className="class-tag">{p.students?.stream || '—'}</span></td>
                      <td className="text-green fw600">{fmt(p.amount)}</td>
                      <td>
                        <MethodBadge method={p.payment_type || p.payment_method} provider={p.provider} />
                      </td>
                      <td className="monospace">{p.reference || p.mpesa_code || '—'}</td>
                      <td className="text-muted">{fmtDate(p.transaction_date)}</td>
                      <td className="text-muted" title={fmtDateTime(p.created_at)}>{fmtDate(p.created_at)}</td>
                      <td><span className="staff-name-tag">{p.staff_name || '—'}</span></td>
                      <td>
                        {st ? (
                          <span className={`status-badge ${st.cls}`}>{st.label}</span>
                        ) : (
                          <span className="status-badge paid">Completed</span>
                        )}
                      </td>
                      <td className="monospace">{p.receipt_number || '—'}</td>
                    </tr>
                  )
                })}
                {!filtered.length && (
                  <tr>
                    <td colSpan={12} className="empty-cell">
                      No payments match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

async function enrichWithStaffNames(payments) {
  const staffIds = [...new Set(payments.map((p) => p.received_by).filter(Boolean))]
  if (!staffIds.length) return payments.map((p) => ({ ...p, staff_name: '—' }))

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', staffIds)

  const staffMap = Object.fromEntries((staff || []).map((s) => [s.id, s.full_name]))
  return payments.map((p) => ({ ...p, staff_name: staffMap[p.received_by] || '—' }))
}
