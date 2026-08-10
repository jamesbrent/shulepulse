import { useState, useEffect } from 'react'
import {
  DollarSign, TrendingUp, CreditCard, Banknote,
  BarChart3, Receipt, Smartphone, Landmark, Wallet,
  ArrowUp, ArrowDown
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import {
  fetchRevenueSummary,
  fetchRecentPayments,
  fetchPaymentMethodBreakdown,
  fetchMonthlyRevenue,
} from '../../features/superadmin/paymentService'
import './AnalyticsPage.css'

const METHOD_ICONS = {
  mpesa: Smartphone,
  mobile_money: Smartphone,
  cash: Wallet,
  cheque: Landmark,
  bank: Landmark,
  other: CreditCard,
}

const METHOD_COLORS = {
  mpesa: '#16a34a',
  mobile_money: '#16a34a',
  cash: '#ca8a04',
  cheque: '#7c3aed',
  bank: '#2563eb',
  other: '#94a3b8',
}

const CHART_COLORS = ['#16a34a', '#ca8a04', '#7c3aed', '#2563eb', '#94a3b8']

export default function AnalyticsPage() {
  const [summary, setSummary] = useState(null)
  const [payments, setPayments] = useState([])
  const [methodBreakdown, setMethodBreakdown] = useState([])
  const [monthlyRevenue, setMonthlyRevenue] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    const [s, p, m, r] = await Promise.all([
      fetchRevenueSummary(),
      fetchRecentPayments(),
      fetchPaymentMethodBreakdown(),
      fetchMonthlyRevenue(),
    ])
    setSummary(s)
    setPayments(p)
    setMethodBreakdown(m)
    setMonthlyRevenue(r)
    setLoading(false)
  }

  if (loading) return <div className="loading-state">Loading payment data...</div>
  if (!summary) return <div className="loading-state">Failed to load payment data</div>

  return (
    <div className="analytics-page">
      <div className="analytics-stats">
        <div className="su-stat-card">
          <div className="stat-card-top">
            <div className="su-stat-icon" style={{ color: '#2563eb' }}><DollarSign size={20} /></div>
          </div>
          <p className="su-stat-label">Total Revenue</p>
          <p className="su-stat-value" style={{ color: '#2563eb' }}>KES {Number(summary.total_revenue).toLocaleString()}</p>
          <p className="su-stat-sub">{Number(summary.transaction_count).toLocaleString()} transactions</p>
        </div>
        <div className="su-stat-card">
          <div className="stat-card-top">
            <div className="su-stat-icon" style={{ color: '#16a34a' }}><TrendingUp size={20} /></div>
          </div>
          <p className="su-stat-label">This Month</p>
          <p className="su-stat-value" style={{ color: '#16a34a' }}>KES {Number(summary.this_month).toLocaleString()}</p>
          <p className="su-stat-sub">{new Date().toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="su-stat-card">
          <div className="stat-card-top">
            <div className="su-stat-icon" style={{ color: '#7c3aed' }}><BarChart3 size={20} /></div>
          </div>
          <p className="su-stat-label">Avg Transaction</p>
          <p className="su-stat-value" style={{ color: '#7c3aed' }}>KES {Number(summary.avg_transaction).toLocaleString()}</p>
          <p className="su-stat-sub">Per payment</p>
        </div>
        <div className="su-stat-card">
          <div className="stat-card-top">
            <div className="su-stat-icon" style={{ color: '#ca8a04' }}><Landmark size={20} /></div>
          </div>
          <p className="su-stat-label">Pending Cheques</p>
          <p className="su-stat-value" style={{ color: '#ca8a04' }}>KES {Number(summary.pending_cheques).toLocaleString()}</p>
          <p className="su-stat-sub">Awaiting clearance</p>
        </div>
      </div>

      <div className="charts-grid">
        <div className="super-card chart-card">
          <div className="card-header"><h3><TrendingUp size={16} /> Revenue by Month</h3></div>
          {monthlyRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" fontSize={11} tickLine={false} />
                <YAxis fontSize={11} tickLine={false} />
                <Tooltip formatter={(v) => `KES ${Number(v).toLocaleString()}`} />
                <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="empty-state">No revenue data yet</p>}
        </div>

        <div className="super-card chart-card">
          <div className="card-header"><h3><CreditCard size={16} /> Payment Methods</h3></div>
          {methodBreakdown.length > 0 ? (
            <div className="pie-wrap">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={methodBreakdown.map((m) => ({ name: m.method, value: Number(m.total) }))}
                    cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {methodBreakdown.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `KES ${Number(v).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pie-legend">
                {methodBreakdown.map((m) => {
                  const MethodIcon = METHOD_ICONS[m.method] || CreditCard
                  const color = METHOD_COLORS[m.method] || '#94a3b8'
                  return (
                    <span key={m.method}>
                      <span className="dot" style={{ background: color }} />
                      {m.method.replace(/_/g, ' ')}: KES {Number(m.total).toLocaleString()}
                    </span>
                  )
                })}
              </div>
            </div>
          ) : <p className="empty-state">No payment data yet</p>}
        </div>
      </div>

      <div className="super-card">
        <div className="card-header"><h3><Receipt size={16} /> Recent Transactions</h3></div>
        {payments.length === 0 ? (
          <p className="empty-state">No transactions yet</p>
        ) : (
          <table className="schools-table">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>School</th>
                <th>Student</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const MethodIcon = METHOD_ICONS[p.payment_method] || CreditCard
                const methodColor = METHOD_COLORS[p.payment_method] || '#94a3b8'
                return (
                  <tr key={p.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.receipt_number || '—'}</td>
                    <td className="school-name-cell">
                      <div className="school-icon">{p.school_name?.[0]}</div>
                      {p.school_name}
                    </td>
                    <td>{p.student_name || <span className="text-muted">—</span>}</td>
                    <td style={{ fontWeight: 600 }}>KES {Number(p.amount).toLocaleString()}</td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 99, fontSize: 12,
                        background: `${methodColor}15`, color: methodColor,
                      }}>
                        <MethodIcon size={11} />
                        {(p.payment_method || 'other').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>
                      {p.transaction_date ? new Date(p.transaction_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
