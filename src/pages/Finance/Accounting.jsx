import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Search, RefreshCw, Printer, Download, Eye,
  CheckCircle, RotateCcw, X, Pencil, Power, FileText, Scale,
  BookOpen, Receipt, AlertTriangle, Trash2, Columns3
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmt, fmtDate, downloadFile } from '../admin/fees/utils/feesHelpers'
import {
  ACCOUNT_TYPES, DEFAULT_CHART, isDebitNormal, typeColor,
  accountBalance, balanceError, nextJournalNumber, writeAudit,
  loadLedgerData, postedLines, groupLinesByAccount,
} from './accountsUtils'
import './Accounting.css'

const TODAY = new Date().toISOString().split('T')[0]
const STATUS_META = {
  draft: { label: 'Draft', color: '#d97706' },
  posted: { label: 'Posted', color: '#16a34a' },
  reversed: { label: 'Reversed', color: '#dc2626' },
}
const SOURCE_META = {
  manual: 'Manual', fees: 'Fees', payroll: 'Payroll', assets: 'Assets',
  ap: 'Accounts Payable', expenses: 'Expenses', refund: 'Refund', budget: 'Budget',
}

const emptyLine = () => ({ account_id: '', debit: '', credit: '', notes: '' })
const blankEntry = () => ({ entry_date: TODAY, description: '', lines: [emptyLine(), emptyLine()] })
const blankAccount = () => ({ code: '', name: '', type: 'asset', category: '', opening_balance: 0, description: '' })

export default function AccountingPage({ initialTab, onOpenSource }) {
  const { profile } = useAuthStore()
  const { school } = useSchool()
  const schoolId = profile?.school_id

  const [tab, setTab] = useState(initialTab || 'accounts')
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState([])
  const [lines, setLines] = useState([])
  const [entries, setEntries] = useState([])
  const [staffMap, setStaffMap] = useState({})
  const [toast, setToast] = useState(null)

  // chart of accounts filters
  const [typeFilter, setTypeFilter] = useState('all')
  const [accSearch, setAccSearch] = useState('')
  const [accModal, setAccModal] = useState(null)        // { account?, isNew }
  const [accForm, setAccForm] = useState(blankAccount())

  // journal filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [jeSearch, setJeSearch] = useState('')
  const [entryModal, setEntryModal] = useState(false)
  const [entryForm, setEntryForm] = useState(blankEntry())
  const [viewEntry, setViewEntry] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null) // { type, entry }
  const [saving, setSaving] = useState(false)

  // ledger
  const [ledgerAccountId, setLedgerAccountId] = useState('')

  const load = useCallback(async () => {
    if (!schoolId) return
    setLoading(true)
    const { accounts: accs, lines: lns, entries: ents } = await loadLedgerData(supabase, schoolId)
    setAccounts(accs)
    setLines(lns)
    setEntries(ents)

    const ids = [...new Set(ents.flatMap((e) => [e.created_by, e.posted_by]).filter(Boolean))]
    if (ids.length) {
      const { data: staff } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      setStaffMap(Object.fromEntries((staff || []).map((s) => [s.id, s.full_name])))
    }
    setLoading(false)
  }, [schoolId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const byAccount = useMemo(() => groupLinesByAccount(postedLines(lines)), [lines])

  // ─── Derived: chart of accounts ──────────────────────────────────────────
  const filteredAccounts = accounts.filter((a) => {
    const matchType = typeFilter === 'all' || a.type === typeFilter
    const q = accSearch.toLowerCase()
    const matchSearch = !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q) || (a.category || '').toLowerCase().includes(q)
    return matchType && matchSearch
  })

  const seedDefaultChart = async () => {
    if (accounts.length) {
      setToast({ type: 'error', msg: 'Chart already has accounts. Clear them first to reseed defaults.' })
      return
    }
    const rows = DEFAULT_CHART.map((c) => ({ ...c, school_id: schoolId }))
    const { error } = await supabase.from('chart_of_accounts').insert(rows)
    if (error) {
      setToast({ type: 'error', msg: `Failed to seed chart: ${error.message}` })
    } else {
      await writeAudit(supabase, { schoolId, action: 'chart_of_accounts.seeded', details: { count: rows.length } })
      setToast({ type: 'success', msg: `Seeded default chart with ${rows.length} accounts.` })
      load()
    }
  }

  const openAccModal = (account = null) => {
    setAccModal({ isNew: !account, account })
    setAccForm(account
      ? { code: account.code, name: account.name, type: account.type, category: account.category || '', opening_balance: Number(account.opening_balance || 0), description: account.description || '' }
      : blankAccount())
  }

  const saveAccount = async () => {
    if (!accForm.code.trim() || !accForm.name.trim()) {
      setToast({ type: 'error', msg: 'Code and name are required.' }); return
    }
    const payload = {
      ...accForm,
      school_id: schoolId,
      code: accForm.code.trim(),
      name: accForm.name.trim(),
      opening_balance: Number(accForm.opening_balance) || 0,
    }
    const { error } = accModal.isNew
      ? await supabase.from('chart_of_accounts').insert(payload)
      : await supabase.from('chart_of_accounts').update(payload).eq('id', accModal.account.id)
    if (error) {
      setToast({ type: 'error', msg: error.message })
    } else {
      await writeAudit(supabase, {
        schoolId,
        action: accModal.isNew ? 'chart_of_accounts.created' : 'chart_of_accounts.updated',
        details: { code: payload.code, name: payload.name },
      })
      setToast({ type: 'success', msg: accModal.isNew ? 'Account created.' : 'Account updated.' })
      setAccModal(null)
      load()
    }
  }

  const toggleAccountActive = async (account) => {
    const { error } = await supabase
      .from('chart_of_accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id)
    if (error) {
      setToast({ type: 'error', msg: error.message })
    } else {
      await writeAudit(supabase, { schoolId, action: 'chart_of_accounts.toggled', details: { code: account.code, active: !account.is_active } })
      setAccounts((prev) => prev.map((a) => a.id === account.id ? { ...a, is_active: !account.is_active } : a))
    }
  }

  // ─── Derived: journal ────────────────────────────────────────────────────
  const filteredEntries = entries.filter((e) => {
    const matchStatus = statusFilter === 'all' || e.status === statusFilter
    const q = jeSearch.toLowerCase()
    const matchSearch = !q || e.entry_no.toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  const entryTotal = (entry) => {
    const el = lines.filter((l) => l.journal_entry_id === entry.id)
    return {
      debit: el.reduce((s, l) => s + Number(l.debit || 0), 0),
      credit: el.reduce((s, l) => s + Number(l.credit || 0), 0),
    }
  }

  const totalDebits = entries.reduce((s, e) => s + (e.status === 'posted' ? entryTotal(e).debit : 0), 0)

  const openEntryModal = () => { setEntryForm(blankEntry()); setEntryModal(true) }

  const updateLine = (idx, patch) => {
    setEntryForm((f) => ({
      ...f,
      lines: f.lines.map((l, i) => i === idx ? { ...l, ...patch } : l),
    }))
  }

  const addLine = () => setEntryForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))
  const removeLine = (idx) => setEntryForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))

  const entryFormTotals = entryForm.lines.reduce(
    (acc, l) => ({
      debit: acc.debit + (Number(l.debit) || 0),
      credit: acc.credit + (Number(l.credit) || 0),
    }),
    { debit: 0, credit: 0 }
  )
  const formError = balanceError(entryForm.lines)

  const saveEntry = async (mode) => {
    if (mode === 'posted' && formError) {
      setToast({ type: 'error', msg: formError }); return
    }
    if (!entryForm.description.trim()) {
      setToast({ type: 'error', msg: 'Please add a description.' }); return
    }
    if (!entryForm.lines.some((l) => l.account_id)) {
      setToast({ type: 'error', msg: 'Please select accounts for at least two lines.' }); return
    }
    setSaving(true)
    const entry_no = await nextJournalNumber(supabase, schoolId)
    const isPosted = mode === 'posted'
    const { data: je, error: err } = await supabase
      .from('journal_entries')
      .insert({
        school_id: schoolId,
        entry_no,
        entry_date: entryForm.entry_date || TODAY,
        description: entryForm.description.trim(),
        source: 'manual',
        status: isPosted ? 'posted' : 'draft',
        created_by: profile.id,
        posted_by: isPosted ? profile.id : null,
        posted_at: isPosted ? new Date().toISOString() : null,
      })
      .select()
      .single()
    if (err) {
      setToast({ type: 'error', msg: err.message }); setSaving(false); return
    }
    const { error: linesErr } = await supabase
      .from('journal_entry_lines')
      .insert(entryForm.lines
        .filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
        .map((l) => ({
          journal_entry_id: je.id,
          account_id: l.account_id,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          notes: l.notes || null,
        })))
    if (linesErr) {
      setToast({ type: 'error', msg: linesErr.message }); setSaving(false); return
    }
    await writeAudit(supabase, {
      schoolId,
      action: isPosted ? 'journal.posted' : 'journal.saved_draft',
      details: { entry_no, description: entryForm.description.trim() },
    })
    setSaving(false)
    setEntryModal(false)
    setToast({ type: 'success', msg: `Journal entry ${entry_no} ${isPosted ? 'posted' : 'saved as draft'}.` })
    load()
  }

  const reverseEntry = async (entry) => {
    setSaving(true)
    const el = lines.filter((l) => l.journal_entry_id === entry.id)
    const revLines = el.map((l) => ({
      account_id: l.account_id,
      debit: Number(l.credit) || 0,
      credit: Number(l.debit) || 0,
      notes: `Reversal of ${entry.entry_no}`,
    }))
    const revEntryNo = await nextJournalNumber(supabase, schoolId)
    const { data: revJe, error: revErr } = await supabase
      .from('journal_entries')
      .insert({
        school_id: schoolId,
        entry_no: revEntryNo,
        entry_date: TODAY,
        description: `Reversal of ${entry.entry_no} — ${entry.description || ''}`.trim(),
        source: entry.source,
        status: 'posted',
        reversal_of: entry.id,
        created_by: profile.id,
        posted_by: profile.id,
        posted_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (revErr) {
      setToast({ type: 'error', msg: revErr.message }); setSaving(false); return
    }
    const { error: linesErr } = await supabase.from('journal_entry_lines').insert(
      revLines.map((l) => ({ ...l, journal_entry_id: revJe.id }))
    )
    if (linesErr) {
      setToast({ type: 'error', msg: linesErr.message }); setSaving(false); return
    }
    await supabase.from('journal_entries').update({ status: 'reversed' }).eq('id', entry.id)
    await writeAudit(supabase, { schoolId, action: 'journal.reversed', details: { entry_no: entry.entry_no, reversal: revEntryNo } })
    setSaving(false)
    setConfirmAction(null)
    setToast({ type: 'success', msg: `Entry ${entry.entry_no} reversed with ${revEntryNo}.` })
    load()
  }

  // ─── Derived: ledger ─────────────────────────────────────────────────────
  const ledgerAccount = accounts.find((a) => a.id === ledgerAccountId) || null
  const ledgerLines = ledgerAccount ? (byAccount[ledgerAccount.id] || [])
    .slice()
    .sort((a, b) => new Date(a.journal_entries?.entry_date) - new Date(b.journal_entries?.entry_date)) : []

  // ─── Derived: trial balance ──────────────────────────────────────────────
  const trialRows = accounts.map((a) => {
    const bal = accountBalance(a, byAccount[a.id] || [])
    const debitNormal = isDebitNormal(a.type)
    const debit = debitNormal ? (bal >= 0 ? Math.abs(bal) : 0) : (bal < 0 ? Math.abs(bal) : 0)
    const credit = debitNormal ? (bal < 0 ? Math.abs(bal) : 0) : (bal >= 0 ? Math.abs(bal) : 0)
    return { ...a, bal, debit, credit }
  })
  const trialDebitTotal = trialRows.reduce((s, r) => s + r.debit, 0)
  const trialCreditTotal = trialRows.reduce((s, r) => s + r.credit, 0)
  const trialBalanced = Math.abs(trialDebitTotal - trialCreditTotal) < 0.01

  // ─── Exports ─────────────────────────────────────────────────────────────
  const exportTrialCSV = () => {
    const rows = [
      ['Code', 'Account', 'Type', 'Debit', 'Credit'],
      ...trialRows.map((r) => [r.code, r.name, r.type, r.debit ? r.debit.toFixed(2) : '', r.credit ? r.credit.toFixed(2) : '']),
      ['', 'Total', '', trialDebitTotal.toFixed(2), trialCreditTotal.toFixed(2)],
    ]
    downloadFile(rows.map((r) => r.join(',')).join('\n'), 'trial_balance.csv', 'text/csv')
  }

  const exportJournalCSV = () => {
    const rows = [
      ['Entry No', 'Date', 'Description', 'Source', 'Status', 'Debits', 'Credits'],
      ...filteredEntries.map((e) => {
        const t = entryTotal(e)
        return [e.entry_no, e.entry_date, e.description || '', SOURCE_META[e.source] || e.source, e.status, t.debit.toFixed(2), t.credit.toFixed(2)]
      }),
    ]
    downloadFile(rows.map((r) => r.join(',')).join('\n'), 'journal_entries.csv', 'text/csv')
  }

  const printTrialBalance = () => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<html><head><title>Trial Balance — ${school?.name || 'School'}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; }
        h1 { margin: 0 0 4px; font-size: 20px; }
        .sub { color: #64748b; font-size: 12px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #f1f5f9; text-align: left; padding: 8px 10px; border: 1px solid #e2e8f0; }
        td { padding: 7px 10px; border: 1px solid #e2e8f0; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        tfoot td { font-weight: 700; background: #f8fafc; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>Trial Balance</h1>
      <div class="sub">${school?.name || 'School'} · As at ${fmtDate(TODAY)} · ${school?.plan || ''}</div>
      <table>
        <thead><tr><th>Code</th><th>Account</th><th>Type</th><th class="num">Debit (KES)</th><th class="num">Credit (KES)</th></tr></thead>
        <tbody>${trialRows.map((r) => `<tr>
          <td>${r.code}</td><td>${r.name}</td><td>${r.type}</td>
          <td class="num">${r.debit ? r.debit.toLocaleString() : ''}</td>
          <td class="num">${r.credit ? r.credit.toLocaleString() : ''}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total</td>
          <td class="num">${trialDebitTotal.toLocaleString()}</td>
          <td class="num">${trialCreditTotal.toLocaleString()}</td></tr></tfoot>
      </table>
      <script>window.onload = function(){ window.print(); }</script>
      </body></html>`)
    win.document.close()
  }

  // ─── UI ──────────────────────────────────────────────────────────────────
  const tabs = [
    { key: 'accounts', label: 'Chart of Accounts', icon: <Columns3 size={14} /> },
    { key: 'journal', label: 'Journal Entries', icon: <BookOpen size={14} /> },
    { key: 'ledger', label: 'General Ledger', icon: <Scale size={14} /> },
    { key: 'trial', label: 'Trial Balance', icon: <Receipt size={14} /> },
  ]

  const typeBadge = (t) => (
    <span className="acc-type-badge" style={{ background: `${typeColor(t)}1a`, color: typeColor(t) }}>
      {t}
    </span>
  )

  const statusBadge = (s) => (
    <span className="acc-status-badge" style={{ background: `${STATUS_META[s].color}1a`, color: STATUS_META[s].color }}>
      {STATUS_META[s].label}
    </span>
  )

  if (loading) return <div className="loading-state">Loading accounting data...</div>

  return (
    <div className="acc-page">
      {/* ── Tab nav ── */}
      <div className="acc-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`acc-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════ CHART OF ACCOUNTS ══════════════ */}
      {tab === 'accounts' && (
        <>
          {accounts.length === 0 && (
            <div className="acc-seed-banner">
              <FileText size={18} />
              <div>
                <strong>No chart of accounts yet.</strong>
                <p>Seed the standard Kenyan school chart, or create accounts manually.</p>
              </div>
              <button className="acc-btn-primary" onClick={seedDefaultChart}>Load Default Chart</button>
            </div>
          )}
          <div className="acc-toolbar">
            <div className="acc-search-wrap">
              <Search size={13} className="acc-search-icon" />
              <input className="acc-search-input" placeholder="Search code, name, category…" value={accSearch} onChange={(e) => setAccSearch(e.target.value)} />
            </div>
            <select className="acc-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}s</option>)}
            </select>
            <button className="acc-btn-ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
            <button className="acc-btn-primary" onClick={() => openAccModal()}><Plus size={14} /> Add Account</button>
          </div>

          <div className="acc-table-card">
            <div className="acc-table-head">
              <h3>Accounts <span>· {filteredAccounts.length} of {accounts.length}</span></h3>
              {accounts.length > 0 && (
                <button className="acc-btn-outline" onClick={() => {
                  if (window.confirm('Delete ALL accounts? This also removes their journal lines.')) {
                    supabase.from('chart_of_accounts').delete().eq('school_id', schoolId).then(() => load())
                  }
                }}>
                  <Trash2 size={13} /> Clear Chart
                </button>
              )}
            </div>
            <div className="acc-table-wrap">
              <table className="acc-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Account</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th className="num">Opening</th>
                    <th className="num">Postings</th>
                    <th className="num">Balance</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((a) => {
                    const postings = byAccount[a.id] || []
                    const bal = accountBalance(a, postings)
                    const net = postings.reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0)
                    return (
                      <tr key={a.id} className={!a.is_active ? 'acc-inactive-row' : ''}>
                        <td className="acc-mono">{a.code}</td>
                        <td className="acc-fw600">{a.name}</td>
                        <td>{typeBadge(a.type)}</td>
                        <td className="acc-muted">{a.category || '—'}</td>
                        <td className="num acc-muted">{fmt(a.opening_balance)}</td>
                        <td className="num acc-muted">{net >= 0 ? fmt(net) : `(${fmt(Math.abs(net))})`}</td>
                        <td className={`num acc-fw600 ${bal < 0 ? 'acc-text-red' : 'acc-text-green'}`}>{fmt(Math.abs(bal))}</td>
                        <td>
                          <span className={`acc-status-badge ${a.is_active ? '' : 'acc-status-off'}`}>
                            {a.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="acc-actions-cell">
                          <button className="acc-icon-btn" title="Edit" onClick={() => openAccModal(a)}><Pencil size={14} /></button>
                          <button className="acc-icon-btn" title={a.is_active ? 'Deactivate' : 'Activate'} onClick={() => toggleAccountActive(a)}><Power size={14} /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ══════════════ JOURNAL ENTRIES ══════════════ */}
      {tab === 'journal' && (
        <>
          <div className="acc-kpi-row">
            <div className="acc-kpi blue">
              <p className="acc-kpi-label">Total Entries</p>
              <p className="acc-kpi-value">{entries.length}</p>
            </div>
            <div className="acc-kpi green">
              <p className="acc-kpi-label">Posted</p>
              <p className="acc-kpi-value">{entries.filter((e) => e.status === 'posted').length}</p>
            </div>
            <div className="acc-kpi amber">
              <p className="acc-kpi-label">Drafts</p>
              <p className="acc-kpi-value">{entries.filter((e) => e.status === 'draft').length}</p>
            </div>
            <div className="acc-kpi purple">
              <p className="acc-kpi-label">Posted Debits</p>
              <p className="acc-kpi-value">{fmt(totalDebits)}</p>
            </div>
          </div>

          <div className="acc-toolbar">
            <div className="acc-search-wrap">
              <Search size={13} className="acc-search-icon" />
              <input className="acc-search-input" placeholder="Search entry no, description…" value={jeSearch} onChange={(e) => setJeSearch(e.target.value)} />
            </div>
            <select className="acc-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="posted">Posted</option>
              <option value="reversed">Reversed</option>
            </select>
            <button className="acc-btn-ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
            <button className="acc-btn-outline" onClick={exportJournalCSV}><Download size={14} /> Export</button>
            <button className="acc-btn-primary" onClick={openEntryModal}><Plus size={14} /> New Journal Entry</button>
          </div>

          <div className="acc-table-card">
            <div className="acc-table-head">
              <h3>Journal Entries <span>· {filteredEntries.length}</span></h3>
            </div>
            {filteredEntries.length === 0 ? (
              <p className="acc-empty">No journal entries yet. Create the first one to start posting to the ledger.</p>
            ) : (
              <div className="acc-table-wrap">
                <table className="acc-table">
                  <thead>
                    <tr>
                      <th>Entry No</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Source</th>
                      <th>Status</th>
                      <th className="num">Debits</th>
                      <th className="num">Credits</th>
                      <th>By</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((e) => {
                      const t = entryTotal(e)
                      return (
                        <tr key={e.id}>
                          <td className="acc-mono acc-fw600">{e.entry_no}</td>
                          <td className="acc-muted">{fmtDate(e.entry_date)}</td>
                          <td className="acc-desc">{e.description || '—'}</td>
                          <td><span className="acc-source-chip">{SOURCE_META[e.source] || e.source}</span></td>
                          <td>{statusBadge(e.status)}</td>
                          <td className="num">{fmt(t.debit)}</td>
                          <td className="num">{fmt(t.credit)}</td>
                          <td className="acc-muted">{staffMap[e.created_by] || '—'}</td>
                          <td className="acc-actions-cell">
                            <button className="acc-icon-btn" title="View" onClick={() => setViewEntry(e)}><Eye size={14} /></button>
                            {e.source === 'expenses' && e.reference_type === 'expense' && e.reference_id && onOpenSource && (
                              <button className="acc-icon-btn" title="Open expense record" onClick={() => onOpenSource('expense', e.reference_id)}><Receipt size={14} /></button>
                            )}
                            {e.status === 'draft' && (
                              <button className="acc-icon-btn" title="Post" onClick={() => setConfirmAction({ type: 'post', entry: e })}><CheckCircle size={14} /></button>
                            )}
                            {e.status === 'posted' && (
                              <button className="acc-icon-btn danger" title="Reverse" onClick={() => setConfirmAction({ type: 'reverse', entry: e })}><RotateCcw size={14} /></button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════ GENERAL LEDGER ══════════════ */}
      {tab === 'ledger' && (
        <>
          <div className="acc-toolbar">
            <div className="acc-search-wrap acc-search-wrap-wide">
              <Search size={13} className="acc-search-icon" />
              <select className="acc-ledger-select" value={ledgerAccountId} onChange={(e) => setLedgerAccountId(e.target.value)}>
                <option value="">Select an account…</option>
                {ACCOUNT_TYPES.map((t) => (
                  <optgroup key={t.value} label={`${t.label}s`}>
                    {accounts.filter((a) => a.type === t.value && a.is_active).map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <button className="acc-btn-ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
          </div>

          {!ledgerAccount ? (
            <div className="acc-ledger-empty">
              <Scale size={28} />
              <p>Select an account to view its ledger entries and running balance.</p>
            </div>
          ) : (
            <>
              <div className="acc-ledger-head">
                <div>
                  <h3>{ledgerAccount.code} — {ledgerAccount.name}</h3>
                  <p className="acc-ledger-sub">
                    {typeBadge(ledgerAccount.type)} <span>{ledgerAccount.category || ''}</span>
                  </p>
                </div>
                <div className="acc-ledger-totals">
                  <div>
                    <span>Opening</span>
                    <strong>{fmt(ledgerAccount.opening_balance)}</strong>
                  </div>
                  <div>
                    <span>Net Movement</span>
                    <strong>{fmt(byAccount[ledgerAccount.id]?.reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0) || 0)}</strong>
                  </div>
                  <div>
                    <span>Balance</span>
                    <strong className="acc-text-green">{fmt(Math.abs(accountBalance(ledgerAccount, byAccount[ledgerAccount.id] || [])))}</strong>
                  </div>
                </div>
              </div>

              <div className="acc-table-card">
                <div className="acc-table-wrap">
                  <table className="acc-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Entry No</th>
                        <th>Description</th>
                        <th>Source</th>
                        <th className="num">Debit</th>
                        <th className="num">Credit</th>
                        <th className="num">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerLines.length === 0 ? (
                        <tr><td colSpan={7} className="acc-empty">No postings for this account yet.</td></tr>
                      ) : (
                        ledgerLines.map((l, i) => {
                          const prev = ledgerLines.slice(0, i).reduce((s, x) => s + (Number(x.debit) || 0) - (Number(x.credit) || 0), 0)
                          const bal = Number(ledgerAccount.opening_balance || 0) + (isDebitNormal(ledgerAccount.type) ? prev + (Number(l.debit) || 0) - (Number(l.credit) || 0) : -(prev + (Number(l.debit) || 0) - (Number(l.credit) || 0)))
                          return (
                            <tr key={l.id}>
                              <td className="acc-muted">{fmtDate(l.journal_entries?.entry_date)}</td>
                              <td className="acc-mono">{l.journal_entries?.entry_no || '—'}</td>
                              <td className="acc-desc">{l.journal_entries?.description || ''}{l.notes ? ` — ${l.notes}` : ''}</td>
                              <td><span className="acc-source-chip">{SOURCE_META[l.journal_entries?.source] || l.journal_entries?.source || '—'}</span></td>
                              <td className="num">{l.debit ? fmt(l.debit) : ''}</td>
                              <td className="num">{l.credit ? fmt(l.credit) : ''}</td>
                              <td className={`num acc-fw600 ${bal < 0 ? 'acc-text-red' : 'acc-text-green'}`}>{fmt(Math.abs(bal))}</td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ══════════════ TRIAL BALANCE ══════════════ */}
      {tab === 'trial' && (
        <>
          <div className={`acc-tb-balance-bar ${trialBalanced ? 'ok' : 'bad'}`}>
            {trialBalanced
              ? <><CheckCircle size={15} /> Trial balance is balanced — Debits {fmt(trialDebitTotal)} = Credits {fmt(trialCreditTotal)}</>
              : <><AlertTriangle size={15} /> Trial balance is OUT of balance — Debits {fmt(trialDebitTotal)} vs Credits {fmt(trialCreditTotal)}</>}
          </div>
          <div className="acc-toolbar">
            <button className="acc-btn-ghost" onClick={printTrialBalance}><Printer size={14} /> Print</button>
            <button className="acc-btn-outline" onClick={exportTrialCSV}><Download size={14} /> Export CSV</button>
          </div>
          <div className="acc-table-card">
            <div className="acc-table-head">
              <h3>Trial Balance <span>· as at {fmtDate(TODAY)}</span></h3>
            </div>
            <div className="acc-table-wrap">
              <table className="acc-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Account</th>
                    <th>Type</th>
                    <th className="num">Debit (KES)</th>
                    <th className="num">Credit (KES)</th>
                  </tr>
                </thead>
                <tbody>
                  {trialRows.map((r) => (
                    <tr key={r.id}>
                      <td className="acc-mono">{r.code}</td>
                      <td className="acc-fw600">{r.name}</td>
                      <td>{typeBadge(r.type)}</td>
                      <td className="num">{r.debit ? r.debit.toLocaleString() : ''}</td>
                      <td className="num">{r.credit ? r.credit.toLocaleString() : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="acc-fw600">Total</td>
                    <td className="num acc-fw600 acc-text-green">{trialDebitTotal.toLocaleString()}</td>
                    <td className="num acc-fw600 acc-text-red">{trialCreditTotal.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══ Account Modal ═══ */}
      {accModal && (
        <div className="acc-modal-overlay" onClick={() => setAccModal(null)}>
          <div className="acc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="acc-modal-header">
              <h3>{accModal.isNew ? 'Add Account' : `Edit ${accModal.account.code}`}</h3>
              <button className="acc-modal-close" onClick={() => setAccModal(null)}><X size={18} /></button>
            </div>
            <div className="acc-modal-body">
              <div className="acc-form-grid">
                <div>
                  <label>Code</label>
                  <input value={accForm.code} onChange={(e) => setAccForm((f) => ({ ...f, code: e.target.value }))} placeholder="e.g. 1050" />
                </div>
                <div>
                  <label>Type</label>
                  <select value={accForm.type} onChange={(e) => setAccForm((f) => ({ ...f, type: e.target.value }))}>
                    {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="acc-form-field">
                <label>Account Name</label>
                <input value={accForm.name} onChange={(e) => setAccForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Bank — Payroll Account" />
              </div>
              <div className="acc-form-grid">
                <div>
                  <label>Category</label>
                  <input value={accForm.category} onChange={(e) => setAccForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. Cash & Bank" />
                </div>
                <div>
                  <label>Opening Balance</label>
                  <input type="number" value={accForm.opening_balance} onChange={(e) => setAccForm((f) => ({ ...f, opening_balance: e.target.value }))} />
                </div>
              </div>
              <div className="acc-form-field">
                <label>Description</label>
                <input value={accForm.description} onChange={(e) => setAccForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div className="acc-modal-footer">
              <button className="acc-btn-outline" onClick={() => setAccModal(null)}>Cancel</button>
              <button className="acc-btn-primary" onClick={saveAccount}>{accModal.isNew ? 'Create Account' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ New Journal Entry Modal ═══ */}
      {entryModal && (
        <div className="acc-modal-overlay" onClick={() => setEntryModal(false)}>
          <div className="acc-modal acc-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="acc-modal-header">
              <h3>New Journal Entry</h3>
              <button className="acc-modal-close" onClick={() => setEntryModal(false)}><X size={18} /></button>
            </div>
            <div className="acc-modal-body">
              <div className="acc-form-grid">
                <div>
                  <label>Entry Date</label>
                  <input type="date" value={entryForm.entry_date} onChange={(e) => setEntryForm((f) => ({ ...f, entry_date: e.target.value }))} />
                </div>
                <div>
                  <label>Description</label>
                  <input value={entryForm.description} onChange={(e) => setEntryForm((f) => ({ ...f, description: e.target.value }))} placeholder="What does this entry record?" />
                </div>
              </div>

              <div className="acc-je-lines">
                <div className="acc-je-head">
                  <span style={{ flex: 1.4 }}>Account</span>
                  <span style={{ flex: 1 }}>Debit</span>
                  <span style={{ flex: 1 }}>Credit</span>
                  <span style={{ flex: 1.4 }}>Notes</span>
                  <span style={{ width: 28 }} />
                </div>
                {entryForm.lines.map((l, idx) => (
                  <div className="acc-je-row" key={idx}>
                    <select
                      style={{ flex: 1.4 }}
                      value={l.account_id}
                      onChange={(e) => updateLine(idx, { account_id: e.target.value })}
                    >
                      <option value="">— select account —</option>
                      {ACCOUNT_TYPES.map((t) => (
                        <optgroup key={t.value} label={`${t.label}s`}>
                          {accounts.filter((a) => a.type === t.value && a.is_active).map((a) => (
                            <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <input
                      style={{ flex: 1 }}
                      type="number"
                      placeholder="0.00"
                      value={l.debit}
                      onChange={(e) => updateLine(idx, { debit: e.target.value, credit: '' })}
                    />
                    <input
                      style={{ flex: 1 }}
                      type="number"
                      placeholder="0.00"
                      value={l.credit}
                      onChange={(e) => updateLine(idx, { credit: e.target.value, debit: '' })}
                    />
                    <input
                      style={{ flex: 1.4 }}
                      value={l.notes}
                      onChange={(e) => updateLine(idx, { notes: e.target.value })}
                      placeholder="Optional"
                    />
                    <button className="acc-icon-btn danger" onClick={() => removeLine(idx)} title="Remove line">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button className="acc-btn-ghost acc-add-line" onClick={addLine}><Plus size={13} /> Add line</button>

              <div className={`acc-je-summary ${formError ? 'bad' : 'ok'}`}>
                <div>
                  <span>Debits</span>
                  <strong>{fmt(entryFormTotals.debit)}</strong>
                </div>
                <div>
                  <span>Credits</span>
                  <strong>{fmt(entryFormTotals.credit)}</strong>
                </div>
                <div>
                  <span>Difference</span>
                  <strong>{fmt(entryFormTotals.debit - entryFormTotals.credit)}</strong>
                </div>
                <div className="acc-je-verdict">
                  {formError ? <><AlertTriangle size={14} /> {formError}</> : <><CheckCircle size={14} /> Balanced</>}
                </div>
              </div>
            </div>
            <div className="acc-modal-footer">
              <button className="acc-btn-outline" onClick={() => setEntryModal(false)}>Cancel</button>
              <button className="acc-btn-outline" onClick={() => saveEntry('draft')} disabled={saving || !entryForm.description.trim() || !entryForm.lines.some((l) => l.account_id)}>
                Save as Draft
              </button>
              <button className="acc-btn-primary" onClick={() => saveEntry('posted')} disabled={saving || !!formError || !entryForm.description.trim()}>
                {saving ? 'Saving…' : 'Post Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ View Entry Modal ═══ */}
      {viewEntry && (
        <div className="acc-modal-overlay" onClick={() => setViewEntry(null)}>
          <div className="acc-modal acc-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="acc-modal-header">
              <h3>{viewEntry.entry_no} <span style={{ marginLeft: 8 }}>{statusBadge(viewEntry.status)}</span></h3>
              <button className="acc-modal-close" onClick={() => setViewEntry(null)}><X size={18} /></button>
            </div>
            <div className="acc-modal-body">
              <div className="acc-detail-row">
                <span className="acc-detail-label">Date</span>
                <span>{fmtDate(viewEntry.entry_date)}</span>
              </div>
              <div className="acc-detail-row">
                <span className="acc-detail-label">Description</span>
                <span>{viewEntry.description || '—'}</span>
              </div>
              <div className="acc-detail-row">
                <span className="acc-detail-label">Source</span>
                <span>{SOURCE_META[viewEntry.source] || viewEntry.source}</span>
              </div>
              <div className="acc-detail-row">
                <span className="acc-detail-label">Created By</span>
                <span>{staffMap[viewEntry.created_by] || '—'}</span>
              </div>
              {viewEntry.posted_by && (
                <div className="acc-detail-row">
                  <span className="acc-detail-label">Posted By</span>
                  <span>{staffMap[viewEntry.posted_by] || '—'} · {fmtDate(viewEntry.posted_at)}</span>
                </div>
              )}
              <div className="acc-table-wrap" style={{ marginTop: 14 }}>
                <table className="acc-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Account</th>
                      <th className="num">Debit</th>
                      <th className="num">Credit</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.filter((l) => l.journal_entry_id === viewEntry.id).map((l) => {
                      const acc = accounts.find((a) => a.id === l.account_id)
                      return (
                        <tr key={l.id}>
                          <td className="acc-mono">{acc?.code || '—'}</td>
                          <td>{acc?.name || '—'}</td>
                          <td className="num">{l.debit ? fmt(l.debit) : ''}</td>
                          <td className="num">{l.credit ? fmt(l.credit) : ''}</td>
                          <td className="acc-muted">{l.notes || ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="acc-fw600">Total</td>
                      <td className="num acc-fw600">{fmt(entryTotal(viewEntry).debit)}</td>
                      <td className="num acc-fw600">{fmt(entryTotal(viewEntry).credit)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="acc-modal-footer">
              {viewEntry.status === 'draft' && (
                <button className="acc-btn-primary" onClick={() => { setViewEntry(null); setConfirmAction({ type: 'post', entry: viewEntry }) }}>
                  <CheckCircle size={14} /> Post Entry
                </button>
              )}
              {viewEntry.status === 'posted' && (
                <button className="acc-btn-danger" onClick={() => { setViewEntry(null); setConfirmAction({ type: 'reverse', entry: viewEntry }) }}>
                  <RotateCcw size={14} /> Reverse Entry
                </button>
              )}
              <button className="acc-btn-outline" onClick={() => setViewEntry(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Confirm Modal ═══ */}
      {confirmAction && (
        <div className="acc-modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="acc-modal acc-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="acc-modal-header">
              <h3>{confirmAction.type === 'post' ? 'Post Journal Entry' : 'Reverse Journal Entry'}</h3>
              <button className="acc-modal-close" onClick={() => setConfirmAction(null)}><X size={18} /></button>
            </div>
            <div className="acc-modal-body">
              {confirmAction.type === 'post' ? (
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                  Post <strong>{confirmAction.entry.entry_no}</strong>? A posted entry moves into the General Ledger and can only be corrected by reversing it.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                  Reverse <strong>{confirmAction.entry.entry_no}</strong>? This creates a new posted reversal entry with the opposite amounts and marks the original as reversed.
                </p>
              )}
            </div>
            <div className="acc-modal-footer">
              <button className="acc-btn-outline" onClick={() => setConfirmAction(null)}>Cancel</button>
              {confirmAction.type === 'post' ? (
                <button className="acc-btn-primary" disabled={saving} onClick={async () => {
                  setSaving(true)
                  const { error } = await supabase
                    .from('journal_entries')
                    .update({ status: 'posted', posted_by: profile.id, posted_at: new Date().toISOString() })
                    .eq('id', confirmAction.entry.id)
                  if (!error) {
                    await writeAudit(supabase, { schoolId, action: 'journal.posted', details: { entry_no: confirmAction.entry.entry_no } })
                    setToast({ type: 'success', msg: `Entry ${confirmAction.entry.entry_no} posted.` })
                    load()
                  } else {
                    setToast({ type: 'error', msg: error.message })
                  }
                  setSaving(false)
                  setConfirmAction(null)
                }}>
                  {saving ? 'Posting…' : 'Confirm Post'}
                </button>
              ) : (
                <button className="acc-btn-danger" disabled={saving} onClick={() => reverseEntry(confirmAction.entry)}>
                  {saving ? 'Reversing…' : 'Confirm Reversal'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Toast ═══ */}
      {toast && (
        <div className={`acc-toast ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
