import { useState, useEffect } from 'react'
import { DollarSign, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { fmt, fmtDate } from '../../admin/fees/utils/feesHelpers'

export default function FeePayments({ activeChild, school }) {
  const [assessments, setAssessments] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [aggregate, setAggregate] = useState({ totalCharged: 0, totalPaid: 0, balance: 0, status: 'due' })

  useEffect(() => {
    if (activeChild) fetchFees()
  }, [activeChild])

  const fetchFees = async () => {
    setLoading(true)
    const currentTerm = school?.current_term || 'Term 1'
    const currentYear = school?.current_year || new Date().getFullYear()

    const [assessmentsRes, paymentsRes] = await Promise.all([
      supabase
        .from('fee_assessments')
        .select('id, student_id, term, year, amount_due, amount_paid, status, fee_structures(amount)')
        .eq('student_id', activeChild.id)
        .eq('term', currentTerm)
        .eq('year', currentYear),
      supabase
        .from('fee_payments')
        .select('*')
        .eq('student_id', activeChild.id)
        .eq('term', currentTerm)
        .eq('year', currentYear)
        .order('transaction_date', { ascending: false }),
    ])

    const totalCharged = (assessmentsRes.data || []).reduce((s, a) => s + Number(a.amount_due), 0)
    const totalPaid = (paymentsRes.data || []).reduce((s, p) => s + Number(p.amount), 0)
    const balance = totalCharged - totalPaid

    setAssessments(assessmentsRes.data || [])
    setPayments(paymentsRes.data || [])
    setAggregate({
      totalCharged,
      totalPaid,
      balance,
      status: balance <= 0 ? 'cleared' : totalPaid > 0 ? 'partial' : 'due',
    })
    setLoading(false)
  }

  if (loading) return <p className="loading-state">Loading fee statement...</p>

  return (
    <div className="fees-page-view">
      <div className="att-summary" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="att-sum-card blue">
          <DollarSign size={20} />
          <div>
            <p className="asc-label">Total Charged</p>
            <p className="asc-value">{fmt(aggregate.totalCharged)}</p>
          </div>
        </div>
        <div className="att-sum-card green">
          <CheckCircle size={20} />
          <div>
            <p className="asc-label">Total Paid</p>
            <p className="asc-value">{fmt(aggregate.totalPaid)}</p>
          </div>
        </div>
        <div className={`att-sum-card ${aggregate.balance <= 0 ? 'green' : 'red'}`}>
          {aggregate.balance <= 0 ? <CheckCircle size={20} /> : <XCircle size={20} />}
          <div>
            <p className="asc-label">Balance</p>
            <p className="asc-value">{fmt(aggregate.balance)}</p>
          </div>
        </div>
        <div className={`att-sum-card ${aggregate.status === 'cleared' ? 'green' : aggregate.status === 'partial' ? 'amber' : 'red'}`}>
          <AlertCircle size={20} />
          <div>
            <p className="asc-label">Status</p>
            <p className="asc-value" style={{ textTransform: 'capitalize' }}>{aggregate.status}</p>
          </div>
        </div>
      </div>

      <div className="section-card">
        <div className="card-header">
          <h3>Fee Breakdown</h3>
        </div>
        {assessments.length === 0 ? (
          <p className="empty-state">No fee assessments for this term</p>
        ) : (
          <div className="att-table-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Amount Due</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((a, i) => (
                  <tr key={a.id}>
                    <td>{i + 1}</td>
                    <td>{fmt(a.amount_due)}</td>
                    <td className="text-right">
                      <span className={`att-badge ${a.status === 'paid' ? 'present' : a.status === 'partial' ? 'late' : 'absent'}`}>
                        {a.status || 'pending'}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr style={{ background: '#f8fafc' }}>
                  <td colSpan={2} style={{ fontWeight: 700, color: '#0f172a' }}>Total Charged</td>
                  <td className="text-right" style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(aggregate.totalCharged)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section-card">
        <div className="card-header">
          <h3>Payment History</h3>
        </div>
        {payments.length === 0 ? (
          <p className="empty-state">No payments recorded yet</p>
        ) : (
          <div className="att-table-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Receipt</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.transaction_date)}</td>
                    <td className="adm-no">{p.receipt_number || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{p.payment_type || p.payment_method || '—'}</td>
                    <td className="adm-no">{p.reference || p.mpesa_code || '—'}</td>
                    <td className="text-right" style={{ fontWeight: 600, color: '#16a34a' }}>{fmt(p.amount)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f8fafc' }}>
                  <td colSpan={4} style={{ fontWeight: 700, color: '#0f172a' }}>Total Paid</td>
                  <td className="text-right" style={{ fontWeight: 700, color: '#16a34a' }}>{fmt(aggregate.totalPaid)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
