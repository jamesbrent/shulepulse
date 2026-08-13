import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Download, RefreshCw, Wallet, Users, Landmark, TrendingUp, CheckCircle2
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmt, downloadFile } from '../admin/fees/utils/feesHelpers'
import { loadPayrollData, runStatus } from './payrollUtils'
import './Reports.css'
import './PayrollReports.css'

const STATUS_OPTIONS = [
  { value: 'gl', label: 'Posted to GL (posted + paid)' },
  { value: 'paid', label: 'Paid' },
  { value: 'approved', label: 'Approved' },
  { value: 'all', label: 'All statuses' },
]

const DEDUCTION_ITEMS = [
  { key: 'paye', label: 'PAYE', color: '#2563eb' },
  { key: 'shif', label: 'SHIF', color: '#7c3aed' },
  { key: 'nssf', label: 'NSSF (Employee)', color: '#d97706' },
  { key: 'housing', label: 'Housing', color: '#dc2626' },
  { key: 'helb', label: 'HELB', color: '#0d9488' },
  { key: 'other', label: 'Other', color: '#64748b' },
]

export default function PayrollReportsPage() {
  const { profile } = useAuthStore()
  const { school } = useSchool()
  const schoolId = profile?.school_id

  const [loading, setLoading] = useState(true)
  const [runs, setRuns] = useState([])
  const [periods, setPeriods] = useState([])
  const [entryNos, setEntryNos] = useState({})
  const [period, setPeriod] = useState('')
  const [status, setStatus] = useState('gl')

  const load = useCallback(async () => {
    if (!schoolId) return
    setLoading(true)
    try {
      const data = await loadPayrollData(supabase, schoolId)
      setRuns(data.runs)
      setPeriods(data.periods)
      const ids = [...new Set((data.runs || []).map((r) => r.journal_entry_id).filter(Boolean))]
      let map = {}
      if (ids.length) {
        const { data: jes } = await supabase
          .from('journal_entries')
          .select('id, entry_no')
          .in('id', ids)
        map = Object.fromEntries((jes || []).map((j) => [j.id, j.entry_no]))
      }
      setEntryNos(map)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => { load() }, [load])

  const periodOptions = useMemo(() => {
    const seen = new Set()
    const opts = []
    for (const p of periods) {
      const key = `${p.period_year}-${String(p.period_month).padStart(2, '0')}`
      if (seen.has(key)) continue
      seen.add(key)
      opts.push({ value: key, label: p.period_label })
    }
    return opts.sort((a, b) => b.value.localeCompare(a.value))
  }, [periods])

  const filteredRuns = useMemo(() => {
    const statuses = status === 'all' ? null : status === 'gl' ? ['posted', 'paid'] : [status]
    return runs.filter((r) => {
      const p = r.payroll_periods
      const matchPeriod = !period || `${p?.period_year}-${String(p?.period_month).padStart(2, '0')}` === period
      const matchStatus = !statuses || statuses.includes(r.status)
      return matchPeriod && matchStatus
    })
  }, [runs, period, status])

  const totals = useMemo(() => {
    const t = { gross: 0, net: 0, paye: 0, shif: 0, nssf: 0, housing: 0, helb: 0, other: 0, employer: 0, payslips: 0, runs: 0 }
    for (const r of filteredRuns) {
      t.runs++
      for (const l of r.payroll_lines || []) {
        t.gross += Number(l.gross_pay || 0)
        t.net += Number(l.net_pay || 0)
        t.paye += Number(l.paye || 0)
        t.shif += Number(l.shif || 0)
        t.nssf += Number(l.nssf_employee || 0)
        t.housing += Number(l.housing_employee || 0)
        t.helb += Number(l.helb || 0)
        t.other += Number(l.other_deductions || 0)
        t.employer += Number(l.employer_total || 0)
        t.payslips++
      }
    }
    t.deductions = t.paye + t.shif + t.nssf + t.housing + t.helb + t.other
    return t
  }, [filteredRuns])

  const maxDeduction = Math.max(1, ...DEDUCTION_ITEMS.map((d) => totals[d.key]))

  const byEmployee = useMemo(() => {
    const m = {}
    for (const r of filteredRuns) {
      for (const l of r.payroll_lines || []) {
        const key = l.employee_no || l.employee_name || '—'
        if (!m[key]) {
          m[key] = {
            employee_no: l.employee_no || '',
            name: l.employee_name || '—',
            type: l.staff_type || '—',
            runs: 0, gross: 0, paye: 0, shif: 0, nssf: 0, housing: 0, helb: 0, other: 0, net: 0, employer: 0,
          }
        }
        const e = m[key]
        e.runs++
        e.gross += Number(l.gross_pay || 0)
        e.paye += Number(l.paye || 0)
        e.shif += Number(l.shif || 0)
        e.nssf += Number(l.nssf_employee || 0)
        e.housing += Number(l.housing_employee || 0)
        e.helb += Number(l.helb || 0)
        e.other += Number(l.other_deductions || 0)
        e.net += Number(l.net_pay || 0)
        e.employer += Number(l.employer_total || 0)
      }
    }
    return Object.values(m).sort((a, b) => b.net - a.net)
  }, [filteredRuns])

  // ── Export helpers ──
  const exportCSV = (rows, headers, filename) => {
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    downloadFile(csv, filename, 'text/csv')
  }

  const periodTag = periodOptions.find((o) => o.value === period)?.label || 'All Periods'
  const fileNameTag = (period && periodOptions.find((o) => o.value === period)?.label.replace(/\s+/g, '_')) || 'all'

  const exportRunsCSV = () => {
    exportCSV(
      filteredRuns.map((r) => [
        r.run_no, r.payroll_periods?.period_label || '—', runStatus(r.status).label,
        (r.payroll_lines || []).length, runTotalsOf(r).gross, runTotalsOf(r).deductions,
        runTotalsOf(r).net, runTotalsOf(r).employer, entryNos[r.journal_entry_id] || '',
      ]),
      ['Run No', 'Period', 'Status', 'Employees', 'Gross Pay', 'Deductions', 'Net Pay', 'Employer Cost', 'GL Entry'],
      `payroll_runs_${fileNameTag}.csv`
    )
  }

  const exportEmployeeCSV = () => {
    exportCSV(
      byEmployee.map((e) => [
        e.employee_no, e.name, e.type, e.runs, e.gross, e.paye, e.shif, e.nssf,
        e.housing, e.helb, e.other, e.net, e.employer,
      ]),
      ['Staff No', 'Name', 'Type', 'Runs', 'Gross', 'PAYE', 'SHIF', 'NSSF', 'Housing', 'HELB', 'Other', 'Net Pay', 'Employer Cost'],
      `payroll_employees_${fileNameTag}.csv`
    )
  }

  const runTotalsOf = (r) => {
    const t = { gross: 0, net: 0, deductions: 0, employer: 0 }
    for (const l of r.payroll_lines || []) {
      t.gross += Number(l.gross_pay || 0)
      t.net += Number(l.net_pay || 0)
      t.deductions += Number(l.paye || 0) + Number(l.shif || 0) + Number(l.nssf_employee || 0) +
        Number(l.housing_employee || 0) + Number(l.helb || 0) + Number(l.other_deductions || 0)
      t.employer += Number(l.employer_total || 0)
    }
    return t
  }

  if (loading) return <div className="loading-state">Loading payroll reports...</div>

  return (
    <div className="rpt-page prpt-page">
      {/* ── Toolbar ── */}
      <div className="rpt-toolbar">
        <div className="rpt-toolbar-filters">
          <select className="rpt-select" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="">All Periods</option>
            {periodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="rpt-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <button className="rpt-btn-ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      {/* ── KPI Row ── */}
      <div className="rpt-kpi-row prpt-kpi-row">
        <div className="rpt-kpi blue">
          <div className="rpt-kpi-icon"><TrendingUp size={18} /></div>
          <div className="rpt-kpi-body">
            <p className="rpt-kpi-label">Gross Pay</p>
            <p className="rpt-kpi-value">{fmt(totals.gross)}</p>
          </div>
        </div>
        <div className="rpt-kpi red">
          <div className="rpt-kpi-icon"><Landmark size={18} /></div>
          <div className="rpt-kpi-body">
            <p className="rpt-kpi-label">Deductions</p>
            <p className="rpt-kpi-value">{fmt(totals.deductions)}</p>
          </div>
        </div>
        <div className="rpt-kpi green">
          <div className="rpt-kpi-icon"><Wallet size={18} /></div>
          <div className="rpt-kpi-body">
            <p className="rpt-kpi-label">Net Pay</p>
            <p className="rpt-kpi-value">{fmt(totals.net)}</p>
          </div>
        </div>
        <div className="rpt-kpi purple">
          <div className="rpt-kpi-icon"><Users size={18} /></div>
          <div className="rpt-kpi-body">
            <p className="rpt-kpi-label">Employer Costs</p>
            <p className="rpt-kpi-value">{fmt(totals.employer)}</p>
          </div>
        </div>
        <div className="rpt-kpi amber">
          <div className="rpt-kpi-icon"><Users size={18} /></div>
          <div className="rpt-kpi-body">
            <p className="rpt-kpi-label">Payslips</p>
            <p className="rpt-kpi-value">{totals.payslips}</p>
          </div>
        </div>
        <div className="rpt-kpi green">
          <div className="rpt-kpi-icon"><CheckCircle2 size={18} /></div>
          <div className="rpt-kpi-body">
            <p className="rpt-kpi-label">Runs</p>
            <p className="rpt-kpi-value">{totals.runs}</p>
          </div>
        </div>
      </div>

      {/* ═══ DEDUCTION BREAKDOWN ═══ */}
      <div className="rpt-card">
        <div className="rpt-card-head">
          <h3><Landmark size={16} /> Statutory &amp; Deduction Breakdown <span className="prpt-muted">· {periodTag}</span></h3>
        </div>
        {totals.payslips === 0 ? (
          <p className="rpt-empty">No payroll data for the selected filters.</p>
        ) : (
          <div className="rpt-bars">
            {DEDUCTION_ITEMS.map((d) => (
              <div key={d.key} className="rpt-bar-row prpt-ded-row">
                <span className="rpt-bar-label">{d.label}</span>
                <div className="rpt-bar-track">
                  <div className="rpt-bar-fill" style={{ background: d.color, width: `${(totals[d.key] / maxDeduction) * 100}%` }} />
                </div>
                <span className="rpt-bar-amount">{fmt(totals[d.key])}</span>
                <span className="rpt-bar-count">{totals.deductions > 0 ? Math.round((totals[d.key] / totals.deductions) * 100) : 0}%</span>
              </div>
            ))}
            <div className="rpt-bar-row prpt-ded-total">
              <span className="rpt-bar-label">Total Deductions</span>
              <div className="rpt-bar-track">
                <div className="rpt-bar-fill" style={{ background: '#0f172a', width: '100%' }} />
              </div>
              <span className="rpt-bar-amount">{fmt(totals.deductions)}</span>
              <span className="rpt-bar-count">100%</span>
            </div>
          </div>
        )}
      </div>

      {/* ═══ RUNS SUMMARY ═══ */}
      <div className="rpt-card">
        <div className="rpt-card-head">
          <h3><Wallet size={16} /> Payroll Runs <span className="prpt-muted">· {filteredRuns.length} runs</span></h3>
          <button className="rpt-btn-outline" onClick={exportRunsCSV} disabled={!filteredRuns.length}>
            <Download size={13} /> Export CSV
          </button>
        </div>
        {filteredRuns.length === 0 ? (
          <p className="rpt-empty">No payroll runs for the selected filters.</p>
        ) : (
          <div className="rpt-table-wrap">
            <table className="rpt-table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th className="prpt-num">Employees</th>
                  <th className="prpt-num">Gross Pay</th>
                  <th className="prpt-num">Deductions</th>
                  <th className="prpt-num">Net Pay</th>
                  <th className="prpt-num">Employer</th>
                  <th>GL Entry</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((r) => {
                  const t = runTotalsOf(r)
                  const st = runStatus(r.status)
                  return (
                    <tr key={r.id}>
                      <td className="rpt-fw600">{r.run_no}</td>
                      <td>{r.payroll_periods?.period_label || '—'}</td>
                      <td>
                        <span className="prpt-badge" style={{ background: `${st.color}1a`, color: st.color }}>{st.label}</span>
                      </td>
                      <td className="prpt-num">{(r.payroll_lines || []).length}</td>
                      <td className="prpt-num">{fmt(t.gross)}</td>
                      <td className="prpt-num rpt-text-red">{fmt(t.deductions)}</td>
                      <td className="prpt-num rpt-text-green rpt-fw600">{fmt(t.net)}</td>
                      <td className="prpt-num">{fmt(t.employer)}</td>
                      <td>
                        {entryNos[r.journal_entry_id] ? (
                          <span className="prpt-chip">{entryNos[r.journal_entry_id]}</span>
                        ) : (
                          <span className="rpt-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="rpt-fw600" colSpan="3">Total</td>
                  <td className="prpt-num rpt-fw600">{totals.payslips}</td>
                  <td className="prpt-num rpt-fw600">{fmt(totals.gross)}</td>
                  <td className="prpt-num rpt-fw600 rpt-text-red">{fmt(totals.deductions)}</td>
                  <td className="prpt-num rpt-fw600 rpt-text-green">{fmt(totals.net)}</td>
                  <td className="prpt-num rpt-fw600">{fmt(totals.employer)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ═══ EMPLOYEE SUMMARY ═══ */}
      <div className="rpt-card">
        <div className="rpt-card-head">
          <h3><Users size={16} /> Employee Pay Summary <span className="prpt-muted">· {byEmployee.length} employees</span></h3>
          <button className="rpt-btn-outline" onClick={exportEmployeeCSV} disabled={!byEmployee.length}>
            <Download size={13} /> Export CSV
          </button>
        </div>
        {byEmployee.length === 0 ? (
          <p className="rpt-empty">No payroll lines for the selected filters.</p>
        ) : (
          <div className="rpt-table-wrap">
            <table className="rpt-table">
              <thead>
                <tr>
                  <th>Staff No</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th className="prpt-num">Runs</th>
                  <th className="prpt-num">Gross</th>
                  <th className="prpt-num">PAYE</th>
                  <th className="prpt-num">SHIF</th>
                  <th className="prpt-num">NSSF</th>
                  <th className="prpt-num">Housing</th>
                  <th className="prpt-num">HELB</th>
                  <th className="prpt-num">Other</th>
                  <th className="prpt-num">Net Pay</th>
                  <th className="prpt-num">Employer</th>
                </tr>
              </thead>
              <tbody>
                {byEmployee.map((e) => (
                  <tr key={e.employee_no || e.name}>
                    <td className="rpt-mono">{e.employee_no || '—'}</td>
                    <td className="rpt-fw600">{e.name}</td>
                    <td>{e.type}</td>
                    <td className="prpt-num">{e.runs}</td>
                    <td className="prpt-num">{fmt(e.gross)}</td>
                    <td className="prpt-num">{fmt(e.paye)}</td>
                    <td className="prpt-num">{fmt(e.shif)}</td>
                    <td className="prpt-num">{fmt(e.nssf)}</td>
                    <td className="prpt-num">{fmt(e.housing)}</td>
                    <td className="prpt-num">{fmt(e.helb)}</td>
                    <td className="prpt-num">{fmt(e.other)}</td>
                    <td className="prpt-num rpt-text-green rpt-fw600">{fmt(e.net)}</td>
                    <td className="prpt-num">{fmt(e.employer)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="rpt-fw600" colSpan="3">Total</td>
                  <td className="prpt-num rpt-fw600">{totals.payslips}</td>
                  <td className="prpt-num rpt-fw600">{fmt(totals.gross)}</td>
                  <td className="prpt-num rpt-fw600">{fmt(totals.paye)}</td>
                  <td className="prpt-num rpt-fw600">{fmt(totals.shif)}</td>
                  <td className="prpt-num rpt-fw600">{fmt(totals.nssf)}</td>
                  <td className="prpt-num rpt-fw600">{fmt(totals.housing)}</td>
                  <td className="prpt-num rpt-fw600">{fmt(totals.helb)}</td>
                  <td className="prpt-num rpt-fw600">{fmt(totals.other)}</td>
                  <td className="prpt-num rpt-fw600 rpt-text-green">{fmt(totals.net)}</td>
                  <td className="prpt-num rpt-fw600">{fmt(totals.employer)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
