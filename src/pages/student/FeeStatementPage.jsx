import { useState, useEffect } from 'react'
import { DollarSign, CheckCircle, XCircle, AlertCircle, Receipt } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const fmt = (n) => `KES ${Number(n || 0).toLocaleString()}`

export default function FeeStatementPage({ student, school }) {
  const [assessments, setAssessments] = useState([])
  const [payments, setPayments] = useState([])
  const [ledger, setLedger] = useState([])
  const [loading, setLoading] = useState(true)
  const [aggregate, setAggregate] = useState({ totalCharged: 0, totalPaid: 0, balance: 0, status: 'due' })

  useEffect(() => {
    if (!student?.id) { setLoading(false); return }
    const term = school?.current_term || 'Term 1'
    const year = school?.current_year || new Date().getFullYear()
    setLoading(true)
    Promise.all([
      supabase
        .from('fee_assessments')
        .select('*')
        .eq('student_id', student.id)
        .eq('term', term)
        .eq('year', year),
      supabase
        .from('fee_payments')
        .select('*')
        .eq('student_id', student.id)
        .eq('term', term)
        .eq('year', year)
        .order('transaction_date', { ascending: false }),
      supabase
        .from('student_ledger')
        .select('*')
        .eq('student_id', student.id)
        .eq('term', term)
        .eq('year', year)
        .order('created_at', { ascending: false }),
    ]).then(([a, p, l]) => {
      const totalCharged = (a.data || []).reduce((s, x) => s + Number(x.amount_due || 0), 0)
      const totalPaid = (p.data || []).reduce((s, x) => s + Number(x.amount || 0), 0)
      const balance = totalCharged - totalPaid
      setAssessments(a.data || [])
      setPayments(p.data || [])
      setLedger(l.data || [])
      setAggregate({
        totalCharged,
        totalPaid,
        balance,
        status: balance <= 0 ? 'cleared' : totalPaid > 0 ? 'partial' : 'due',
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [student?.id, school?.current_term, school?.current_year])

  if (loading) return (
    <div className="sp-loading-container">
      <div className="sp-loading-spinner" />
      <p>Loading fee statement...</p>
    </div>
  )

  return (
    <div className="sp-page">
      <div className="sp-stats-grid">
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#eff6ff', color: '#2563eb' }}><DollarSign size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#2563eb', fontSize: 16 }}>{fmt(aggregate.totalCharged)}</p>
            <p className="sp-stat-label">Total Charged</p>
            <p className="sp-stat-sub">{school?.current_term || 'Term 1'} {school?.current_year || ''}</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: '#f0fdf4', color: '#16a34a' }}><CheckCircle size={20} /></div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: '#16a34a', fontSize: 16 }}>{fmt(aggregate.totalPaid)}</p>
            <p className="sp-stat-label">Total Paid</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: aggregate.balance <= 0 ? '#f0fdf4' : '#fef2f2', color: aggregate.balance <= 0 ? '#16a34a' : '#dc2626' }}>
            {aggregate.balance <= 0 ? <CheckCircle size={20} /> : <XCircle size={20} />}
          </div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ color: aggregate.balance <= 0 ? '#16a34a' : '#dc2626', fontSize: 16 }}>{fmt(aggregate.balance)}</p>
            <p className="sp-stat-label">Balance</p>
          </div>
        </div>
        <div className="sp-stat-card">
          <div className="sp-stat-icon-wrap" style={{ background: aggregate.status === 'cleared' ? '#f0fdf4' : aggregate.status === 'partial' ? '#fefce8' : '#fef2f2', color: aggregate.status === 'cleared' ? '#16a34a' : aggregate.status === 'partial' ? '#ca8a04' : '#dc2626' }}>
            <AlertCircle size={20} />
          </div>
          <div className="sp-stat-content">
            <p className="sp-stat-value" style={{ textTransform: 'capitalize', fontSize: 16 }}>{aggregate.status}</p>
            <p className="sp-stat-label">Status</p>
          </div>
        </div>
      </div>

      <div className="sp-card">
        <div className="sp-card-header">
          <h3><DollarSign size={16} /> Fee Breakdown</h3>
          {assessments.length > 0 && <span className="sp-badge">{assessments.length} items</span>}
        </div>
        {assessments.length === 0 ? (
          <div className="sp-empty-state">
            <DollarSign size={40} color="#94a3b8" />
            <p>No fee assessments for this term</p>
          </div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Amount Due</th>
                  <th>Amount Paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((a, i) => (
                  <tr key={a.id}>
                    <td>{i + 1}</td>
                    <td>{fmt(a.amount_due)}</td>
                    <td style={{ color: '#16a34a' }}>{fmt(a.amount_paid)}</td>
                    <td>
                      <span className={`sp-status-badge ${a.status === 'paid' ? 'present' : a.status === 'partial' ? 'late' : 'absent'}`}>
                        {a.status || 'pending'}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="sp-table-total">
                  <td colSpan={2}>Total Charged</td>
                  <td colSpan={2} style={{ textAlign: 'right' }}>{fmt(aggregate.totalCharged)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="sp-card">
        <div className="sp-card-header">
          <h3><Receipt size={16} /> Payment History</h3>
          {payments.length > 0 && <span className="sp-badge">{payments.length} payments</span>}
        </div>
        {payments.length === 0 ? (
          <div className="sp-empty-state">
            <Receipt size={40} color="#94a3b8" />
            <p>No payments recorded yet</p>
          </div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Receipt</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td>{p.transaction_date ? new Date(p.transaction_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td className="sp-mono">{p.receipt_number || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{p.payment_type || p.payment_method || '—'}</td>
                    <td className="sp-mono">{p.reference || p.mpesa_code || '—'}</td>
                    <td style={{ fontWeight: 600, color: '#16a34a' }}>{fmt(p.amount)}</td>
                  </tr>
                ))}
                <tr className="sp-table-total">
                  <td colSpan={4}>Total Paid</td>
                  <td style={{ textAlign: 'right', color: '#16a34a' }}>{fmt(aggregate.totalPaid)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ledger.length > 0 && (
        <div className="sp-card">
          <div className="sp-card-header">
            <h3><DollarSign size={16} /> Fee Ledger</h3>
          </div>
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(l => (
                  <tr key={l.id}>
                    <td>{l.created_at ? new Date(l.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{l.entry_type || '—'}</td>
                    <td>{l.description || '—'}</td>
                    <td className="sp-mono">
                      <span style={{ color: ['charge', 'penalty'].includes(l.entry_type) ? '#dc2626' : '#16a34a' }}>
                        {['charge', 'penalty'].includes(l.entry_type) ? '−' : '+'}{fmt(l.amount)}
                      </span>
                    </td>
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
