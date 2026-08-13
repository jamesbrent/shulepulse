import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FileText, RefreshCw, Printer, Download, BarChart3, Scale, Coins,
  Play, CheckCircle, AlertTriangle, Wallet, Columns3,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmt, fmtDate, downloadFile } from '../admin/fees/utils/feesHelpers'
import { loadLedgerData } from './accountsUtils'
import {
  incomeStatementData, sfpData, cashFlowData, equityData,
} from './financialStatementsUtils'
import { generateFinancialStatementPdf } from './generateFinancialStatementPdf'
import './Accounting.css'
import './FinancialStatements.css'

const todayISO = () => new Date().toISOString().split('T')[0]
const p2 = (n) => String(n).padStart(2, '0')
const fmtAmt = (n) => (Number(n) < 0 ? `(KES ${Math.abs(Number(n)).toLocaleString()})` : fmt(n))
const fmtLong = (d) => (d ? new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' }) : '—')
const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

const TABS = [
  { key: 'income', label: 'Income Statement', icon: <BarChart3 size={14} /> },
  { key: 'position', label: 'Financial Position', icon: <Scale size={14} /> },
  { key: 'cashflow', label: 'Cash Flow', icon: <Wallet size={14} /> },
  { key: 'equity', label: 'Changes in Equity', icon: <Coins size={14} /> },
]

export default function FinancialStatementsPage() {
  const { profile } = useAuthStore()
  const { school } = useSchool()
  const schoolId = profile?.school_id

  const [tab, setTab] = useState('income')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [lines, setLines] = useState([])

  // period filters (income / cash flow / equity)
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`)
  const [to, setTo] = useState(todayISO())
  // as-at filter (statement of financial position)
  const [asAt, setAsAt] = useState(todayISO())

  const load = useCallback(async () => {
    if (!schoolId) return
    setLoading(true)
    const { accounts: accs, lines: lns } = await loadLedgerData(supabase, schoolId)
    setAccounts(accs)
    setLines(lns)
    setLoading(false)
  }, [schoolId])

  useEffect(() => {
    if (!schoolId) return
    let alive = true
    ;(async () => {
      const { accounts: accs, lines: lns } = await loadLedgerData(supabase, schoolId)
      if (!alive) return
      setAccounts(accs)
      setLines(lns)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [schoolId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const generate = async () => {
    setToast({ type: 'info', msg: 'Generating report from the General Ledger…' })
    await load()
    setToast({ type: 'success', msg: 'Report generated from the General Ledger.' })
  }

  const applyPreset = (key) => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    if (key === 'this_year') {
      setFrom(`${y}-01-01`); setTo(todayISO())
    } else if (key === 'this_month') {
      setFrom(`${y}-${p2(m + 1)}-01`); setTo(todayISO())
    } else if (key === 'last_month') {
      const lm = m === 0 ? 11 : m - 1
      const ly = m === 0 ? y - 1 : y
      const lastDay = new Date(ly, lm + 1, 0).getDate()
      setFrom(`${ly}-${p2(lm + 1)}-01`); setTo(`${ly}-${p2(lm + 1)}-${p2(lastDay)}`)
    } else {
      setFrom(''); setTo('')
    }
  }

  // ── Report data (pure projections over the GL — single foundation) ───────
  const income = useMemo(() => incomeStatementData(accounts, lines, { from, to }), [accounts, lines, from, to])
  const position = useMemo(() => sfpData(accounts, lines, { asAt }), [accounts, lines, asAt])
  const cashflow = useMemo(() => cashFlowData(accounts, lines, { from, to }), [accounts, lines, from, to])
  const equity = useMemo(() => equityData(accounts, lines, { from, to }), [accounts, lines, from, to])

  // ── Report specs (shared by the on-screen renderer and the PDF/Excel) ─────
  const buildSpec = () => {
    const periodEnded = to ? `For the period ended ${fmtLong(to)}` : 'All time'
    const periodRange = from ? `${fmtDate(from)} to ${to ? fmtDate(to) : 'today'}` : 'All posted entries'

    if (tab === 'income') {
      return {
        title: 'INCOME STATEMENT',
        periodLabel: periodEnded,
        filename: `income_statement_${from || 'all'}_${to || 'all'}`,
        sheet: 'Income Statement',
        sections: [
          {
            heading: 'INCOME / REVENUE',
            cols: ['Code', 'Account', 'Amount (KES)'],
            rows: income.income.map((r) => [r.code, r.name, r.amount]),
            totalLabel: 'TOTAL INCOME',
            total: income.totalIncome,
          },
          {
            heading: 'EXPENDITURE / EXPENSES',
            cols: ['Code', 'Account', 'Amount (KES)'],
            rows: income.expenses.map((r) => [r.code, r.name, r.amount]),
            totalLabel: 'TOTAL EXPENSES',
            total: income.totalExpenses,
          },
        ],
        summary: [{ label: 'SURPLUS / (DEFICIT)', value: income.surplus, emphasize: true }],
        note: `Period activity (${periodRange}). Generated automatically from the General Ledger — the same data as the Trial Balance.`,
      }
    }

    if (tab === 'position') {
      const liabEquity = position.totalLiabilities + position.totalEquity
      return {
        title: 'STATEMENT OF FINANCIAL POSITION',
        periodLabel: `As at ${fmtLong(asAt)}`,
        filename: `statement_of_financial_position_${asAt || 'all'}`,
        sheet: 'Financial Position',
        sections: [
          {
            heading: 'NON-CURRENT ASSETS',
            cols: ['Code', 'Account', 'Amount (KES)'],
            rows: [
              ...position.nonCurrent.map((r) => [r.code, r.name, r.amount]),
              ...position.contra.map((r) => [r.code, `Less: ${r.name}`, r.amount]),
            ],
            totalLabel: '',
            total: null,
          },
          {
            heading: 'CURRENT ASSETS',
            cols: ['Code', 'Account', 'Amount (KES)'],
            rows: position.current.map((r) => [r.code, r.name, r.amount]),
            totalLabel: 'TOTAL ASSETS',
            total: position.totalAssets,
          },
          {
            heading: 'CURRENT LIABILITIES',
            cols: ['Code', 'Account', 'Amount (KES)'],
            rows: position.currentLiab.map((r) => [r.code, r.name, r.amount]),
            totalLabel: '',
            total: null,
          },
          {
            heading: 'NON-CURRENT LIABILITIES',
            cols: ['Code', 'Account', 'Amount (KES)'],
            rows: position.nonCurrentLiab.map((r) => [r.code, r.name, r.amount]),
            totalLabel: 'TOTAL LIABILITIES',
            total: position.totalLiabilities,
          },
          {
            heading: 'EQUITY / FUNDS',
            cols: ['Code', 'Account', 'Amount (KES)'],
            rows: position.equityRows.map((r) => [r.code, r.name, r.amount]),
            totalLabel: 'TOTAL EQUITY / FUNDS',
            total: position.totalEquity,
          },
        ],
        summary: [
          { label: 'TOTAL ASSETS', value: position.totalAssets },
          { label: 'TOTAL LIABILITIES + EQUITY / FUNDS', value: liabEquity },
        ],
        note: position.balanced
          ? 'The statement balances: Total Assets = Total Liabilities + Equity/Funds.'
          : 'WARNING: the statement is OUT of balance — review the General Ledger before use.',
      }
    }

    if (tab === 'cashflow') {
      return {
        title: 'CASH FLOW STATEMENT',
        periodLabel: periodEnded,
        filename: `cash_flow_statement_${from || 'all'}_${to || 'all'}`,
        sheet: 'Cash Flow',
        sections: [
          {
            heading: 'OPERATING ACTIVITIES',
            cols: ['', 'Activity', 'Amount (KES)'],
            rows: cashflow.operatingRows.map((r) => ['', r.label, r.amount]),
            totalLabel: 'NET CASH FROM / (USED IN) OPERATING ACTIVITIES',
            total: cashflow.operating,
          },
          {
            heading: 'INVESTING ACTIVITIES',
            cols: ['', 'Activity', 'Amount (KES)'],
            rows: cashflow.investingRows.map((r) => ['', r.label, r.amount]),
            totalLabel: 'NET CASH FROM / (USED IN) INVESTING ACTIVITIES',
            total: cashflow.investing,
          },
          {
            heading: 'FINANCING ACTIVITIES',
            cols: ['', 'Activity', 'Amount (KES)'],
            rows: cashflow.financingRows.map((r) => ['', r.label, r.amount]),
            totalLabel: 'NET CASH FROM / (USED IN) FINANCING ACTIVITIES',
            total: cashflow.financing,
          },
        ],
        summary: [
          { label: 'NET INCREASE / (DECREASE) IN CASH', value: cashflow.netChange, emphasize: true },
          { label: 'OPENING CASH AND CASH EQUIVALENTS', value: cashflow.opening },
          { label: 'CLOSING CASH AND CASH EQUIVALENTS', value: cashflow.closing },
        ],
        note: `Period activity (${periodRange}). Transfers between the school's own cash / bank / M-Pesa accounts are excluded. ${
          cashflow.reconciled
            ? 'Closing cash ties to the Cash & Bank ledger balances.'
            : 'WARNING: closing cash does not fully reconcile to the Cash & Bank ledger — review the GL.'
        }`,
      }
    }

    return {
      title: 'STATEMENT OF CHANGES IN EQUITY / FUNDS',
      periodLabel: periodEnded,
      filename: `statement_of_changes_in_equity_${from || 'all'}_${to || 'all'}`,
      sheet: 'Changes in Equity',
      sections: [
        {
          heading: 'OPENING EQUITY / FUNDS',
          cols: ['Code', 'Account', 'Amount (KES)'],
          rows: equity.openingRows.map((r) => [r.code, r.name, r.amount]),
          totalLabel: 'OPENING EQUITY / FUNDS',
          total: equity.opening,
        },
        {
          heading: 'CONTRIBUTIONS / MOVEMENTS IN THE PERIOD',
          cols: ['Code', 'Account', 'Amount (KES)'],
          rows: equity.movementRows.map((r) => [r.code, r.name, r.amount]),
          totalLabel: 'NET MOVEMENTS',
          total: equity.movements,
        },
      ],
      summary: [
        { label: 'SURPLUS / (DEFICIT) FOR THE PERIOD', value: equity.surplus },
        { label: 'CLOSING EQUITY / FUNDS', value: equity.closing, emphasize: true },
      ],
      note: `Period activity (${periodRange}). Opening + movements + surplus/(deficit) = closing equity/funds, using the school's existing fund accounts.`,
    }
  }

  const spec = buildSpec()

  // ── Exports ───────────────────────────────────────────────────────────────
  const onPrint = async () => {
    const blob = await generateFinancialStatementPdf({ school, title: spec.title, periodLabel: spec.periodLabel, sections: spec.sections, summary: spec.summary, note: spec.note })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (w) w.onload = () => { w.print() }
  }

  const onPdf = async () => {
    const blob = await generateFinancialStatementPdf({ school, title: spec.title, periodLabel: spec.periodLabel, sections: spec.sections, summary: spec.summary, note: spec.note })
    downloadFile(blob, `${spec.filename}.pdf`, 'application/pdf')
  }

  const onExcel = () => {
    const aoa = []
    aoa.push([school?.name || 'School', spec.title])
    aoa.push([spec.periodLabel])
    aoa.push([])
    for (const s of spec.sections) {
      aoa.push([s.heading])
      aoa.push(s.cols)
      for (const r of s.rows) aoa.push([...r.slice(0, -1), round(r[r.length - 1])])
      if (s.totalLabel) aoa.push([...s.cols.slice(0, -1).map(() => ''), s.totalLabel, round(s.total)])
      aoa.push([])
    }
    for (const item of spec.summary) aoa.push(['', item.label, item.value])
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 10 }, { wch: 48 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, ws, spec.sheet)
    XLSX.writeFile(wb, `${spec.filename}.xlsx`)
  }

  const kpis = {
    income: [
      { label: 'Total Income', value: fmt(income.totalIncome), color: '#16a34a' },
      { label: 'Total Expenses', value: fmt(income.totalExpenses), color: '#dc2626' },
      { label: income.surplus >= 0 ? 'Surplus' : 'Deficit', value: fmt(Math.abs(income.surplus)), color: income.surplus >= 0 ? '#2563eb' : '#d97706' },
    ],
    position: [
      { label: 'Total Assets', value: fmt(position.totalAssets), color: '#2563eb' },
      { label: 'Total Liabilities', value: fmt(position.totalLiabilities), color: '#d97706' },
      { label: 'Equity / Funds', value: fmt(position.totalEquity), color: '#7c3aed' },
    ],
    cashflow: [
      { label: 'Operating', value: fmt(cashflow.operating), color: '#16a34a' },
      { label: 'Investing', value: fmt(cashflow.investing), color: '#2563eb' },
      { label: 'Financing', value: fmt(cashflow.financing), color: '#7c3aed' },
      { label: 'Net Cash Movement', value: fmt(cashflow.netChange), color: cashflow.netChange >= 0 ? '#047857' : '#dc2626' },
    ],
    equity: [
      { label: 'Opening Equity', value: fmt(equity.opening), color: '#2563eb' },
      { label: 'Surplus / (Deficit)', value: fmt(equity.surplus), color: equity.surplus >= 0 ? '#16a34a' : '#dc2626' },
      { label: 'Closing Equity', value: fmt(equity.closing), color: '#7c3aed' },
    ],
  }

  const renderSection = (s) => (
    <div className="acc-table-card fs-card" key={s.heading}>
      <div className="fs-section-title">{s.heading}</div>
      {s.rows.length === 0 ? (
        <p className="acc-empty">No activity for this section in the selected period.</p>
      ) : (
        <div className="acc-table-wrap">
          <table className="acc-table fs-table">
            <thead>
              <tr>{s.cols.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j} className={j === r.length - 1 ? 'num' : (j === 0 ? 'acc-mono' : '')}>
                      {j === r.length - 1 && typeof cell === 'number' ? fmtAmt(cell) : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {s.totalLabel && (
              <tfoot>
                <tr>
                  <td colSpan={s.cols.length - 1} className="acc-fw600">{s.totalLabel}</td>
                  <td className={`num acc-fw600 ${s.total < 0 ? 'acc-text-red' : 'acc-text-green'}`}>{fmtAmt(s.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )

  if (loading) return <div className="loading-state">Loading financial data from the General Ledger...</div>

  return (
    <div className="acc-page fs-page">
      {toast && (
        <div className={`fs-toast ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle size={15} /> : <AlertTriangle size={15} />} {toast.msg}
        </div>
      )}

      {/* ── Tab nav ── */}
      <div className="acc-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`acc-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div className="acc-tb-filters fs-filters">
        {tab === 'position' ? (
          <label className="acc-tb-field">
            <span>As At</span>
            <input type="date" value={asAt} onChange={(e) => setAsAt(e.target.value)} />
          </label>
        ) : (
          <>
            <label className="acc-tb-field">
              <span>From</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="acc-tb-field">
              <span>To</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </>
        )}
        <div className="fs-presets">
          {tab !== 'position' && (
            <>
              <button className="acc-tb-mode-btn" onClick={() => applyPreset('this_month')}>This Month</button>
              <button className="acc-tb-mode-btn" onClick={() => applyPreset('last_month')}>Last Month</button>
              <button className="acc-tb-mode-btn" onClick={() => applyPreset('this_year')}>This Year</button>
              <button className="acc-tb-mode-btn" onClick={() => applyPreset('all')}>All Time</button>
            </>
          )}
          <button className="acc-btn-primary" onClick={generate}><Play size={14} /> Generate Report</button>
        </div>
        <button className="acc-btn-ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      {/* ── KPI row ── */}
      <div className="acc-kpi-row fs-kpis">
        {kpis[tab].map((k) => (
          <div className="acc-kpi" key={k.label}>
            <p className="acc-kpi-label">{k.label}</p>
            <p className="acc-kpi-value" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* ── Report header + actions ── */}
      <div className="fs-head">
        <div>
          <h3 className="fs-title">{school?.name || 'School'} — {spec.title}</h3>
          <p className="fs-period">{spec.periodLabel}</p>
        </div>
        <div className="fs-actions">
          <button className="acc-btn-ghost" onClick={onPrint}><Printer size={14} /> Print</button>
          <button className="acc-btn-outline" onClick={onPdf}><Download size={14} /> Export PDF</button>
          <button className="acc-btn-outline" onClick={onExcel}><FileText size={14} /> Export Excel</button>
        </div>
      </div>

      {/* ── Balance indicator (position / cash flow) ── */}
      {tab === 'position' && (
        <div className={`acc-tb-balance-bar ${position.balanced ? 'ok' : 'bad'}`}>
          {position.balanced
            ? <><CheckCircle size={15} /> Statement balances — Total Assets {fmt(position.totalAssets)} = Liabilities + Equity {fmt(position.totalLiabilities + position.totalEquity)}</>
            : <><AlertTriangle size={15} /> Statement is OUT of balance — review the General Ledger.</>}
        </div>
      )}
      {tab === 'cashflow' && (
        <div className={`acc-tb-balance-bar ${cashflow.reconciled ? 'ok' : 'bad'}`}>
          {cashflow.reconciled
            ? <><CheckCircle size={15} /> Closing cash {fmt(cashflow.closing)} = Opening {fmt(cashflow.opening)} + Net movement {fmt(cashflow.netChange)}</>
            : <><AlertTriangle size={15} /> Cash flow does not reconcile to the Cash &amp; Bank ledger — review the GL.</>}
        </div>
      )}

      {/* ── Report body ── */}
      {spec.sections.map(renderSection)}

      {/* ── Summary rows ── */}
      <div className="fs-summary">
        {spec.summary.map((item) => (
          <div className={`fs-summary-row ${item.emphasize ? 'emphasize' : ''}`} key={item.label}>
            <span className="fs-summary-label">{item.label}</span>
            <span className={`fs-summary-value ${item.value < 0 ? 'red' : ''}`}>{fmtAmt(item.value)}</span>
          </div>
        ))}
      </div>

      <p className="fs-note"><Columns3 size={12} /> {spec.note}</p>
    </div>
  )
}
