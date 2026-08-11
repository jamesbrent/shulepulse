import { useState, useEffect, useCallback } from 'react'
import { Search, Download, Printer, CheckCircle, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmt, fmtDate, downloadFile } from '../admin/fees/utils/feesHelpers'
import { generateReceiptPdf } from '../admin/fees/utils/generateReceiptPdf'

export default function ReceiptsPage() {
  const { profile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(true)
  const [term, setTerm] = useState(currentTerm || '')
  const [year, setYear] = useState(String(currentYear || new Date().getFullYear()))
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    if (!profile?.school_id) return
    setLoading(true)
    const { data } = await supabase
      .from('receipts')
      .select('*, students(full_name, class, stream, admission_number)')
      .eq('school_id', profile.school_id)
      .order('created_at', { ascending: false })

    setReceipts(data || [])
    setLoading(false)
  }, [profile?.school_id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const filtered = receipts.filter((r) => {
    const matchTerm = !term || r.term === term
    const matchYear = !year || String(r.year) === year
    const matchSearch = !search ||
      r.students?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.students?.admission_number?.toLowerCase().includes(search.toLowerCase()) ||
      (r.receipt_number || '').toLowerCase().includes(search.toLowerCase())
    return matchTerm && matchYear && matchSearch
  })

  const totalAmount = filtered.reduce((s, r) => s + Number(r.total_amount), 0)

  const exportCSV = () => {
    const rows = [
      ['Receipt No.', 'Date', 'Student', 'Admission No.', 'Class', 'Amount', 'Method', 'Reference'],
      ...filtered.map((r) => [
        r.receipt_number, r.created_at, r.students?.full_name,
        r.students?.admission_number, r.students?.class, r.total_amount,
        r.payment_type || r.payment_method || '',
        r.reference || r.mpesa_code || '',
      ]),
    ]
    downloadFile(
      rows.map((row) => row.join(',')).join('\n'),
      `receipts_${term || 'all'}_${year || 'all'}.csv`,
      'text/csv'
    )
  }

  const handlePrintPdf = async (r) => {
    try {
      const student = r.students || {}
      const payment = {
        receipt_number: r.receipt_number,
        transaction_date: r.created_at,
        amount: r.total_amount,
        ledger_total: r.total_amount,
        payment_type: r.payment_type || r.payment_method,
        provider: r.provider || '',
        reference: r.reference || r.mpesa_code || '',
        fee_category: r.fee_category || 'School Fees',
        payer_name: r.payer_name || r.parent_name || '',
        received_by_name: r.received_by_name || '',
        account_number: r.account_number || '',
        account_name: r.account_name || '',
        branch_name: r.branch_name || '',
      }
      const blob = await generateReceiptPdf({
        school,
        payment,
        student,
        term: r.term || term,
        year: r.year || year,
      })
      const name = `receipt_${student.admission_number || 'student'}_${r.created_at || Date.now()}.pdf`
      downloadFile(blob, name, 'application/pdf')
      setToast({ type: 'success', msg: 'Receipt PDF downloaded.' })
    } catch (err) {
      console.error('Receipt PDF error:', err)
      setToast({ type: 'error', msg: `Failed to generate receipt: ${err?.message || 'Unknown error'}` })
    }
  }

  return (
    <div className="b-tab-content">
      <div className="b-section-card">
        <div className="b-section-card-head">
          <h3>Receipts</h3>
          <button className="b-btn-secondary" onClick={exportCSV} disabled={!filtered.length}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      <div className="b-summary-strip">
        <div className="b-summary-item">
          <p className="b-summary-item-label">Total Receipts</p>
          <p className="b-summary-item-value">{filtered.length}</p>
        </div>
        <div className="b-summary-item">
          <p className="b-summary-item-label">Total Amount</p>
          <p className="b-summary-item-value b-text-green">{fmt(totalAmount)}</p>
        </div>
      </div>

      <div className="b-filter-bar">
        <label style={{ fontSize: 13, color: '#64748b' }}>Term</label>
        <select className="b-filter-select" value={term} onChange={(e) => setTerm(e.target.value)}>
          <option value="">All Terms</option>
          <option value="Term 1">Term 1</option>
          <option value="Term 2">Term 2</option>
          <option value="Term 3">Term 3</option>
        </select>
        <label style={{ fontSize: 13, color: '#64748b' }}>Year</label>
        <select className="b-filter-select" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All Years</option>
          {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
        <div className="b-search-wrap" style={{ width: 200 }}>
          <Search size={13} className="b-search-icon" />
          <input
            className="b-search-input"
            placeholder="Search receipt no. or student…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="b-section-card">
        {loading ? (
          <p className="loading-state">Loading receipts...</p>
        ) : filtered.length === 0 ? (
          <p className="b-empty">No receipts found for the selected filters.</p>
        ) : (
          <div className="b-table-wrap">
            <table className="b-data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Receipt No.</th>
                  <th>Student</th>
                  <th>Adm No.</th>
                  <th>Class</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Date</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id}>
                    <td className="b-text-muted">{i + 1}</td>
                    <td className="b-monospace b-fw600">{r.receipt_number || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.students?.full_name || '—'}</td>
                    <td className="b-monospace">{r.students?.admission_number || '—'}</td>
                    <td>{r.students?.class || '—'}</td>
                    <td className="b-text-green b-fw600">{fmt(r.total_amount)}</td>
                    <td style={{ textTransform: 'capitalize' }}>
                      {r.payment_type || r.payment_method || '—'}
                    </td>
                    <td className="b-monospace">{r.reference || r.mpesa_code || '—'}</td>
                    <td className="b-text-muted">{fmtDate(r.created_at)}</td>
                    <td>
                      <button
                        className="b-btn-ghost"
                        title="Download receipt PDF"
                        onClick={() => handlePrintPdf(r)}
                        style={{ padding: '4px 8px', fontSize: 12 }}
                      >
                        <Printer size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 20px', borderRadius: 12,
          fontSize: 13, fontWeight: 500, zIndex: 9999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          background: toast.type === 'success' ? '#0f172a' : '#dc2626',
          color: toast.type === 'success' ? '#4ade80' : '#fff',
        }}>
          {toast.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
