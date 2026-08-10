import { useState, useEffect, useCallback } from 'react'
import {
  Download, BarChart3, DollarSign, TrendingUp, Users,
  FileText, AlertTriangle, PieChart, RefreshCw, ArrowDownToLine
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmt, fmtDate, downloadFile, TERMS, YEARS } from '../admin/fees/utils/feesHelpers'
import './Reports.css'

export default function ReportsPage() {
  const { profile } = useAuthStore()
  const { currentTerm, currentYear } = useSchool()

  const [loading, setLoading] = useState(true)
  const [term, setTerm] = useState(currentTerm || '')
  const [year, setYear] = useState(String(currentYear || new Date().getFullYear()))
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [activeTab, setActiveTab] = useState('overview')

  const [payments, setPayments] = useState([])
  const [assessments, setAssessments] = useState([])
  const [ledger, setLedger] = useState([])

  const load = useCallback(async () => {
    if (!profile?.school_id) return
    setLoading(true)
    const [payRes, assRes, ledRes] = await Promise.all([
      supabase
        .from('fee_payments')
        .select('*, students(id, full_name, class, stream, admission_number)')
        .eq('school_id', profile.school_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('fee_assessments')
        .select('*, students(id, full_name, class, stream, admission_number), fee_structures(amount, fee_categories(name))')
        .eq('school_id', profile.school_id),
      supabase
        .from('student_ledger')
        .select('*, students(id, full_name, class, stream, admission_number)')
        .eq('school_id', profile.school_id),
    ])
    setPayments(payRes.data || [])
    setAssessments(assRes.data || [])
    setLedger(ledRes.data || [])
    setLoading(false)
  }, [profile?.school_id])

  useEffect(() => { load() }, [load])

  const filteredPayments = payments.filter((p) => {
    const matchTerm = !term || p.term === term
    const matchYear = !year || String(p.year) === year
    const matchFrom = !dateFrom || new Date(p.transaction_date) >= new Date(dateFrom)
    const matchTo = !dateTo || new Date(p.transaction_date) <= new Date(dateTo + 'T23:59:59')
    return matchTerm && matchYear && matchFrom && matchTo
  })

  const filteredAssessments = assessments.filter((a) => {
    const matchTerm = !term || a.term === term
    const matchYear = !year || String(a.year) === year
    return matchTerm && matchYear
  })

  const filteredLedger = ledger.filter((l) => {
    const matchTerm = !term || l.term === term
    const matchYear = !year || String(l.year) === year
    return matchTerm && matchYear
  })

  // ── KPI Computation ──
  let totalCollected = 0, totalCharges = 0, totalDiscounts = 0, totalPenalties = 0
  filteredLedger.forEach((l) => {
    if (l.entry_type === 'charge') totalCharges += Number(l.amount)
    else if (['payment', 'discount', 'waiver', 'scholarship'].includes(l.entry_type)) totalCollected += Number(l.amount)
    else if (l.entry_type === 'discount' || l.entry_type === 'waiver') totalDiscounts += Number(l.amount)
    else if (l.entry_type === 'penalty') totalPenalties += Number(l.amount)
  })

  const totalDue = totalCharges + totalPenalties
  const outstanding = Math.max(0, totalDue - totalCollected)
  const collectionRate = totalDue > 0 ? Math.min(100, Math.round((totalCollected / totalDue) * 100)) : 0
  const totalStudents = new Set(filteredPayments.map((p) => p.students?.id).filter(Boolean)).size
  const avgPayment = filteredPayments.length > 0 ? totalCollected / filteredPayments.length : 0

  // ── Aggregation: By Class ──
  const byClass = {}
  filteredPayments.forEach((p) => {
    const cls = p.students?.class || 'Unknown'
    if (!byClass[cls]) byClass[cls] = { count: 0, total: 0, students: new Set() }
    byClass[cls].count++
    byClass[cls].total += Number(p.amount)
    if (p.students?.id) byClass[cls].students.add(p.students.id)
  })

  // ── Aggregation: By Month ──
  const byMonth = {}
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  filteredPayments.forEach((p) => {
    if (!p.transaction_date) return
    const d = new Date(p.transaction_date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!byMonth[key]) byMonth[key] = { count: 0, total: 0, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }
    byMonth[key].count++
    byMonth[key].total += Number(p.amount)
  })

  // ── Aggregation: By Method ──
  const byMethod = {}
  filteredPayments.forEach((p) => {
    const method = (p.payment_type || p.payment_method || 'other').replace(/_/g, ' ')
    if (!byMethod[method]) byMethod[method] = { count: 0, total: 0 }
    byMethod[method].count++
    byMethod[method].total += Number(p.amount)
  })

  // ── Assessment Status ──
  const assessmentStatus = { paid: 0, partial: 0, pending: 0 }
  filteredAssessments.forEach((a) => {
    if (assessmentStatus[a.status] !== undefined) assessmentStatus[a.status]++
  })

  // ── Debtors ──
  const debtorMap = {}
  filteredAssessments.forEach((a) => {
    if (a.status === 'paid') return
    const sid = a.students?.id
    if (!sid) return
    if (!debtorMap[sid]) {
      debtorMap[sid] = {
        id: sid,
        full_name: a.students?.full_name || '—',
        class: a.students?.class || '—',
        stream: a.students?.stream || '',
        admission_number: a.students?.admission_number || '—',
        assessed: 0,
        paid: 0,
      }
    }
    debtorMap[sid].assessed += Number(a.amount || a.fee_structures?.amount || 0)
  })
  filteredLedger.forEach((l) => {
    const sid = l.students?.id
    if (!sid || !debtorMap[sid]) return
    if (['payment', 'discount', 'waiver', 'scholarship'].includes(l.entry_type)) {
      debtorMap[sid].paid += Number(l.amount)
    }
  })
  const debtors = Object.values(debtorMap)
    .map((d) => ({ ...d, balance: Math.max(0, d.assessed - d.paid) }))
    .filter((d) => d.balance > 0)
    .sort((a, b) => b.balance - a.balance)

  // ── Monthly chart max ──
  const monthValues = Object.values(byMonth)
  const maxMonthTotal = Math.max(1, ...monthValues.map((d) => d.total))

  // ── Export helpers ──
  const exportCSV = (rows, headers, filename) => {
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    downloadFile(csv, filename, 'text/csv')
  }

  const exportDebtorsCSV = () => {
    exportCSV(
      debtors.map((d) => [d.full_name, d.admission_number, d.class + (d.stream ? ` ${d.stream}` : ''), fmt(d.assessed), fmt(d.paid), fmt(d.balance)]),
      ['Student', 'Adm No', 'Class', 'Assessed', 'Paid', 'Outstanding'],
      `debtors_${term || 'all'}_${year || 'all'}.csv`
    )
  }

  const exportClassCSV = () => {
    exportCSV(
      Object.entries(byClass).sort(([a], [b]) => a.localeCompare(b)).map(([cls, d]) => [cls, d.count, d.students.size, fmt(d.total)]),
      ['Class', 'Transactions', 'Unique Students', 'Total Collected'],
      `collection_by_class_${term || 'all'}_${year || 'all'}.csv`
    )
  }

  const exportMonthCSV = () => {
    exportCSV(
      Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([m, d]) => [d.label, d.count, fmt(d.total)]),
      ['Month', 'Transactions', 'Total Collected'],
      `collection_by_month_${term || 'all'}_${year || 'all'}.csv`
    )
  }

  const exportMethodCSV = () => {
    exportCSV(
      Object.entries(byMethod).map(([m, d]) => [m, d.count, fmt(d.total)]),
      ['Method', 'Transactions', 'Total'],
      `collection_by_method_${term || 'all'}_${year || 'all'}.csv`
    )
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'class', label: 'By Class' },
    { key: 'monthly', label: 'Monthly Trend' },
    { key: 'methods', label: 'By Method' },
    { key: 'debtors', label: `Debtors (${debtors.length})` },
  ]

  if (loading) return <div className="loading-state">Loading reports...</div>

  return (
    <div className="rpt-page">
      {/* ── KPI Row ── */}
      <div className="rpt-kpi-row">
        <div className="rpt-kpi blue">
          <div className="rpt-kpi-icon"><DollarSign size={18} /></div>
          <div className="rpt-kpi-body">
            <p className="rpt-kpi-label">Total Collected</p>
            <p className="rpt-kpi-value">{fmt(totalCollected)}</p>
          </div>
        </div>
        <div className="rpt-kpi red">
          <div className="rpt-kpi-icon"><AlertTriangle size={18} /></div>
          <div className="rpt-kpi-body">
            <p className="rpt-kpi-label">Outstanding</p>
            <p className="rpt-kpi-value">{fmt(outstanding)}</p>
          </div>
        </div>
        <div className="rpt-kpi green">
          <div className="rpt-kpi-icon"><TrendingUp size={18} /></div>
          <p className="rpt-kpi-label">Collection Rate</p>
          <p className="rpt-kpi-value">{collectionRate}%</p>
        </div>
        <div className="rpt-kpi purple">
          <div className="rpt-kpi-icon"><Users size={18} /></div>
          <div className="rpt-kpi-body">
            <p className="rpt-kpi-label">Students Paid</p>
            <p className="rpt-kpi-value">{totalStudents.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="rpt-toolbar">
        <div className="rpt-toolbar-filters">
          <select className="rpt-select" value={term} onChange={(e) => setTerm(e.target.value)}>
            <option value="">All Terms</option>
            {TERMS.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select className="rpt-select" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All Years</option>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
          <input type="date" className="rpt-select" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span style={{ color: '#94a3b8', fontSize: 13 }}>to</span>
          <input type="date" className="rpt-select" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <button className="rpt-btn-ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      {/* ── Tab Nav ── */}
      <div className="rpt-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`rpt-tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ OVERVIEW ═══ */}
      {activeTab === 'overview' && (
        <>
          <div className="rpt-card">
            <div className="rpt-card-head">
              <h3><BarChart3 size={16} /> Collection by Class</h3>
              <button className="rpt-btn-outline" onClick={exportClassCSV} disabled={!Object.keys(byClass).length}>
                <Download size={13} /> Export
              </button>
            </div>
            {Object.keys(byClass).length === 0 ? (
              <p className="rpt-empty">No data for selected filters.</p>
            ) : (
              <div className="rpt-bars">
                {Object.entries(byClass).sort(([, a], [, b]) => b.total - a.total).map(([cls, d]) => (
                  <div key={cls} className="rpt-bar-row">
                    <span className="rpt-bar-label">{cls}</span>
                    <div className="rpt-bar-track">
                      <div className="rpt-bar-fill blue" style={{ width: `${(d.total / maxMonthTotal) * 100}%` }} />
                    </div>
                    <span className="rpt-bar-amount">{fmt(d.total)}</span>
                    <span className="rpt-bar-count">{d.count} txn</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rpt-card">
            <div className="rpt-card-head">
              <h3><PieChart size={16} /> Assessment Status</h3>
            </div>
            <div className="rpt-status-grid">
              <div className="rpt-status-box green">
                <span className="rpt-status-num">{assessmentStatus.paid}</span>
                <span className="rpt-status-label">Fully Paid</span>
              </div>
              <div className="rpt-status-box amber">
                <span className="rpt-status-num">{assessmentStatus.partial}</span>
                <span className="rpt-status-label">Partial</span>
              </div>
              <div className="rpt-status-box red">
                <span className="rpt-status-num">{assessmentStatus.pending}</span>
                <span className="rpt-status-label">Unpaid</span>
              </div>
            </div>
          </div>

          <div className="rpt-card">
            <div className="rpt-card-head">
              <h3><FileText size={16} /> Ledger Summary</h3>
            </div>
            <div className="rpt-ledger-grid">
              <div className="rpt-ledger-row">
                <span className="rpt-ledger-label">Total Charges</span>
                <span className="rpt-ledger-value">{fmt(totalCharges)}</span>
              </div>
              <div className="rpt-ledger-row">
                <span className="rpt-ledger-label">Penalties</span>
                <span className="rpt-ledger-value red">{fmt(totalPenalties)}</span>
              </div>
              <div className="rpt-ledger-row">
                <span className="rpt-ledger-label">Discounts / Waivers</span>
                <span className="rpt-ledger-value green">{fmt(totalDiscounts)}</span>
              </div>
              <div className="rpt-ledger-row total">
                <span className="rpt-ledger-label">Net Outstanding</span>
                <span className="rpt-ledger-value">{fmt(outstanding)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ BY CLASS ═══ */}
      {activeTab === 'class' && (
        <div className="rpt-card">
          <div className="rpt-card-head">
            <h3><BarChart3 size={16} /> Collection Breakdown by Class</h3>
            <button className="rpt-btn-outline" onClick={exportClassCSV} disabled={!Object.keys(byClass).length}>
              <Download size={13} /> Export CSV
            </button>
          </div>
          {Object.keys(byClass).length === 0 ? (
            <p className="rpt-empty">No data for selected filters.</p>
          ) : (
            <div className="rpt-table-wrap">
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Transactions</th>
                    <th>Unique Students</th>
                    <th>Total Collected</th>
                    <th>Avg per Txn</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byClass).sort(([, a], [, b]) => b.total - a.total).map(([cls, d]) => (
                    <tr key={cls}>
                      <td className="rpt-fw600">{cls}</td>
                      <td>{d.count}</td>
                      <td>{d.students.size}</td>
                      <td className="rpt-text-green rpt-fw600">{fmt(d.total)}</td>
                      <td className="rpt-text-muted">{fmt(d.count > 0 ? d.total / d.count : 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="rpt-fw600">Total</td>
                    <td className="rpt-fw600">{Object.values(byClass).reduce((s, d) => s + d.count, 0)}</td>
                    <td className="rpt-fw600">{totalStudents}</td>
                    <td className="rpt-fw600 rpt-text-green">{fmt(totalCollected)}</td>
                    <td className="rpt-text-muted">{fmt(filteredPayments.length > 0 ? totalCollected / filteredPayments.length : 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ MONTHLY TREND ═══ */}
      {activeTab === 'monthly' && (
        <>
          <div className="rpt-card">
            <div className="rpt-card-head">
              <h3><TrendingUp size={16} /> Monthly Collection Trend</h3>
              <button className="rpt-btn-outline" onClick={exportMonthCSV} disabled={!monthValues.length}>
                <Download size={13} /> Export CSV
              </button>
            </div>
            {monthValues.length === 0 ? (
              <p className="rpt-empty">No data for selected filters.</p>
            ) : (
              <div className="rpt-chart">
                {Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([key, d]) => (
                  <div key={key} className="rpt-chart-col">
                    <span className="rpt-chart-tip">{fmt(d.total)}</span>
                    <div className="rpt-chart-bar" style={{ height: `${(d.total / maxMonthTotal) * 100}%` }} />
                    <span className="rpt-chart-label">{d.label.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rpt-card">
            <div className="rpt-card-head">
              <h3><BarChart3 size={16} /> Monthly Detail</h3>
            </div>
            {monthValues.length === 0 ? (
              <p className="rpt-empty">No data for selected filters.</p>
            ) : (
              <div className="rpt-table-wrap">
                <table className="rpt-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Transactions</th>
                      <th>Total Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([key, d]) => (
                      <tr key={key}>
                        <td className="rpt-fw600">{d.label}</td>
                        <td>{d.count}</td>
                        <td className="rpt-text-green rpt-fw600">{fmt(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ BY METHOD ═══ */}
      {activeTab === 'methods' && (
        <div className="rpt-card">
          <div className="rpt-card-head">
            <h3><DollarSign size={16} /> Payment Methods Breakdown</h3>
            <button className="rpt-btn-outline" onClick={exportMethodCSV} disabled={!Object.keys(byMethod).length}>
              <Download size={13} /> Export CSV
            </button>
          </div>
          {Object.keys(byMethod).length === 0 ? (
            <p className="rpt-empty">No data for selected filters.</p>
          ) : (
            <>
              <div className="rpt-bars">
                {Object.entries(byMethod).sort(([, a], [, b]) => b.total - a.total).map(([method, d]) => (
                  <div key={method} className="rpt-bar-row">
                    <span className="rpt-bar-label" style={{ textTransform: 'capitalize' }}>{method}</span>
                    <div className="rpt-bar-track">
                      <div className="rpt-bar-fill purple" style={{ width: `${(d.total / totalCollected) * 100}%` }} />
                    </div>
                    <span className="rpt-bar-amount">{fmt(d.total)}</span>
                    <span className="rpt-bar-count">{d.count} txn</span>
                  </div>
                ))}
              </div>
              <div className="rpt-table-wrap" style={{ marginTop: 16 }}>
                <table className="rpt-table">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th>Transactions</th>
                      <th>Total</th>
                      <th>% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(byMethod).sort(([, a], [, b]) => b.total - a.total).map(([method, d]) => (
                      <tr key={method}>
                        <td className="rpt-fw600" style={{ textTransform: 'capitalize' }}>{method}</td>
                        <td>{d.count}</td>
                        <td className="rpt-text-green rpt-fw600">{fmt(d.total)}</td>
                        <td className="rpt-text-muted">{totalCollected > 0 ? Math.round((d.total / totalCollected) * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ DEBTORS ═══ */}
      {activeTab === 'debtors' && (
        <div className="rpt-card">
          <div className="rpt-card-head">
            <h3><AlertTriangle size={16} /> Outstanding Debtors</h3>
            <button className="rpt-btn-outline" onClick={exportDebtorsCSV} disabled={!debtors.length}>
              <Download size={13} /> Export CSV
            </button>
          </div>
          {debtors.length === 0 ? (
            <p className="rpt-empty">No outstanding debtors for selected filters.</p>
          ) : (
            <div className="rpt-table-wrap">
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student</th>
                    <th>Adm No</th>
                    <th>Class</th>
                    <th>Assessed</th>
                    <th>Paid</th>
                    <th>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {debtors.map((d, i) => (
                    <tr key={d.id}>
                      <td className="rpt-text-muted">{i + 1}</td>
                      <td className="rpt-fw600">{d.full_name}</td>
                      <td className="rpt-mono">{d.admission_number}</td>
                      <td>{d.class}{d.stream ? ` ${d.stream}` : ''}</td>
                      <td>{fmt(d.assessed)}</td>
                      <td className="rpt-text-green">{fmt(d.paid)}</td>
                      <td className="rpt-text-red rpt-fw600">{fmt(d.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td></td>
                    <td className="rpt-fw600">Total Outstanding</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td className="rpt-fw600 rpt-text-red">{fmt(debtors.reduce((s, d) => s + d.balance, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
