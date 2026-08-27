import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Landmark, ArrowLeftRight, Scale, Plus, Search, Eye, X, Trash2, Upload,
  CheckCircle, Send, AlertTriangle,
  FileText, RotateCcw, ArrowDownCircle, Columns3,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { fmt, fmtDate, downloadFile } from '../admin/fees/utils/feesHelpers'
import {
  loadCashBankData, computeAccountBalances, cashSummary, accountStatement, accountTransfers,
  unreconciledNet, nextTransferNo, postTransferJournal, reverseTransfer, setReconciled,
  addImportedLines, createReconciliation, deleteReconciliation,
  parseCsv, guessStatementColumns, suggestMatches, reconciliationMath,
  TRANSFER_STATUSES, RECON_STATUSES, RECON_LINE_STATUSES,
  isCashAccount, accountKind,
} from './cashBankUtils'
import './CashBank.css'

const TODAY = new Date().toISOString().split('T')[0]
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

const isAdminRole = (role) => ['admin', 'deputy_administrator', 'superadmin'].includes(role)

const blankTransfer = () => ({
  from_account_id: '', to_account_id: '', amount: '',
  transfer_date: TODAY, reference: '', description: '', notes: '',
})

const blankRecon = (accountId = '') => ({
  account_id: accountId, statement_start_date: monthStart(), statement_end_date: TODAY,
  statement_closing_balance: '', notes: '',
})

const statusMeta = (s) => TRANSFER_STATUSES.find((x) => x.value === s) || TRANSFER_STATUSES[0]
const recMeta = (s) => RECON_STATUSES.find((x) => x.value === s) || RECON_STATUSES[0]
const lineMeta = (s) => RECON_LINE_STATUSES.find((x) => x.value === s) || RECON_LINE_STATUSES[0]

const badge = (s) => <span className="cb-badge" style={{ background: s.color + '1a', color: s.color }}>{s.label}</span>

const normalizeDate = (v) => {
  if (!v) return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    const d = new Date(`${m[3].padStart(4, '0')}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`)
    return isNaN(d) ? null : d.toISOString().slice(0, 10)
  }
  const d = new Date(s)
  return isNaN(d) ? null : d.toISOString().slice(0, 10)
}

const numVal = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, '').replace(/\(/g, '-').replace(/[)KShES]/gi, ''))
  return isNaN(n) ? 0 : n
}

export default function CashBankPage({ initialTab }) {
  const { profile } = useAuthStore()
  const schoolId = profile?.school_id
  const userId = profile?.id
  const role = profile?.role
  const isAdmin = isAdminRole(role)

  const [tab, setTab] = useState(initialTab || 'dashboard')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [d, setD] = useState(null)

  const [viewAcc, setViewAcc] = useState(null)      // account statement modal
  const [transferModal, setTransferModal] = useState(false)
  const [transferForm, setTransferForm] = useState(blankTransfer())
  const [editTransferId, setEditTransferId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)      // { message, action, danger }
  const [viewTransfer, setViewTransfer] = useState(null)
  const [search, setSearch] = useState('')

  const [recAccountId, setRecAccountId] = useState('')
  const [recModal, setRecModal] = useState(false)
  const [recForm, setRecForm] = useState(blankRecon())
  const [openRec, setOpenRec] = useState(null)      // { recon, lines, math }
  const [importMap, setImportMap] = useState(null)  // statement CSV mapping modal
  const fileRef = useRef(null)

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const load = async () => {
    setLoading(true)
    try { setD(await loadCashBankData(supabase, schoolId)) } catch (e) { showToast(e.message, false) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps,react-hooks/set-state-in-effect
  useEffect(() => { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])

  const balances = useMemo(() => (d ? computeAccountBalances(d.accounts, d.lines) : {}), [d])
  const summary = useMemo(() => cashSummary(balances), [balances])
  const cashAccounts = useMemo(() => (d?.accounts || []).filter(isCashAccount), [d])

  const accountName = (id) => {
    const a = d?.accountOf?.[id]
    return a ? `${a.code} — ${a.name}` : '—'
  }

  // ─── Account statement modal ─────────────────────────────────────────────
  const statementFor = (accountId) => {
    const acc = d.accountOf[accountId]
    if (!acc) return null
    const rows = accountStatement(acc, d.lines, d.reconLines)
    const tf = accountTransfers(accountId, d.entries, d.lines)
    const unreconciled = unreconciledNet(accountId, d.reconLines)
    const receipts = rows.reduce((s, r) => s + (r.debit || 0), 0)
    const payments = rows.reduce((s, r) => s + (r.credit || 0), 0)
    return { acc, rows, tf, unreconciled, receipts, payments }
  }

  // ─── Transfers ───────────────────────────────────────────────────────────
  const openTransfer = (tr) => {
    setEditTransferId(tr?.id || null)
    setTransferForm(tr ? {
      from_account_id: tr.from_account_id, to_account_id: tr.to_account_id, amount: tr.amount,
      transfer_date: tr.transfer_date, reference: tr.reference || '', description: tr.description || '', notes: tr.notes || '',
      transfer_no: tr.transfer_no || '',
    } : blankTransfer())
    setTransferModal(true)
  }

  const transferList = useMemo(() => {
    if (!d) return []
    const q = search.toLowerCase()
    return (d.transfers || [])
      .map((t) => ({ ...t, _from: accountName(t.from_account_id), _to: accountName(t.to_account_id) }))
      .filter((t) => !q || `${t.transfer_no} ${t._from} ${t._to} ${t.reference || ''}`.toLowerCase().includes(q))
  }, [d, search])

  const saveTransfer = async () => {
    if (!transferForm.from_account_id || !transferForm.to_account_id) return showToast('Select both accounts', false)
    if (transferForm.from_account_id === transferForm.to_account_id) return showToast('From and To accounts must be different', false)
    const amount = Number(transferForm.amount) || 0
    if (amount <= 0) return showToast('Enter a positive transfer amount', false)
    setSaving(true)
    try {
      if (editTransferId) {
        const { error } = await supabase.from('cash_transfers').update({
          ...transferForm, amount, updated_at: new Date().toISOString(),
        }).eq('id', editTransferId)
        if (error) throw error
        showToast('Transfer updated')
      } else {
        const transferNo = await nextTransferNo(supabase, schoolId)
        const { error } = await supabase.from('cash_transfers').insert({
          ...transferForm, amount, school_id: schoolId, transfer_no: transferNo, status: 'draft', created_by: userId,
        })
        if (error) throw error
        showToast(`Transfer ${transferNo} drafted`)
      }
      setTransferModal(false)
      load()
    } catch (e) { showToast(e.message, false) }
    finally { setSaving(false) }
  }

  const deleteTransfer = async (tr) => {
    const { error } = await supabase.from('cash_transfers').delete().eq('id', tr.id)
    if (error) return showToast(error.message, false)
    showToast('Transfer draft removed')
    load()
  }

  const transferTransition = async (tr, to) => {
    try {
      const payload = { status: to, updated_at: new Date().toISOString() }
      const who = { submitted: 'submitted_by', approved: 'approved_by', posted: 'posted_by' }[to]
      if (who) { payload[who] = userId; payload[`${String(who).replace('_by', '')}_at`] = new Date().toISOString() }
      if (to === 'posted') {
        const je = await postTransferJournal(supabase, {
          schoolId, userId, transfer: tr,
          fromAccount: d.accountOf[tr.from_account_id], toAccount: d.accountOf[tr.to_account_id],
        })
        payload.journal_entry_id = je.id
      }
      const { error } = await supabase.from('cash_transfers').update(payload).eq('id', tr.id)
      if (error) throw error
      showToast(`Transfer ${tr.transfer_no} → ${to}`)
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const doReverseTransfer = async (tr) => {
    try {
      await reverseTransfer(supabase, { schoolId, userId, transfer: tr })
      showToast(`Transfer ${tr.transfer_no} reversed — GL restored`)
      load()
    } catch (e) { showToast(e.message, false) }
  }

  // ─── Reconciliation ──────────────────────────────────────────────────────
  const reconForAccount = (accountId) => (d?.reconciliations || []).filter((r) => r.account_id === accountId)

  const openNewRecon = (accountId = '') => {
    setRecForm(blankRecon(accountId || recAccountId))
    setRecModal(true)
  }

  const saveRecon = async () => {
    if (!recForm.account_id) return showToast('Select an account to reconcile', false)
    if (!recForm.statement_start_date || !recForm.statement_end_date) return showToast('Select the statement period', false)
    setSaving(true)
    try {
      const { recon } = await createReconciliation(supabase, {
        schoolId, userId,
        accountId: recForm.account_id,
        start: recForm.statement_start_date,
        end: recForm.statement_end_date,
        statementClosing: Number(recForm.statement_closing_balance) || 0,
        notes: recForm.notes,
      })
      setRecModal(false)
      setRecAccountId(recForm.account_id)
      showToast('Reconciliation created — match transactions to the statement')
      await load()
      setOpenRec(buildOpenRec(recon.id))
    } catch (e) { showToast(e.message, false) }
    finally { setSaving(false) }
  }

  const buildOpenRec = (reconId) => {
    const recon = (d?.reconciliations || []).find((r) => r.id === reconId)
    if (!recon) return null
    const lines = (d?.reconLines || []).filter((l) => l.reconciliation_id === reconId)
    const account = d?.accountOf?.[recon.account_id]
    const math = account ? reconciliationMath(
      { ...account, statement_end_date: recon.statement_end_date },
      (d?.lines || []).filter((l) => l.account_id === recon.account_id),
      [],
      lines,
    ) : null
    return { recon, lines, math }
  }

  const openRecon = (reconId) => {
    setOpenRec(buildOpenRec(reconId))
  }

  const glLinesForAccount = (accountId) => (d?.lines || []).filter((l) => l.account_id === accountId)

  const toggleLine = async (item, reconciled) => {
    try {
      await setReconciled(supabase, { userId, itemId: item.id, reconciled })
      await load()
      if (openRec) setOpenRec(buildOpenRec(openRec.recon.id))
    } catch (e) { showToast(e.message, false) }
  }

  const toggleMatched = async (item, journalLineId) => {
    try {
      await setReconciled(supabase, { userId, itemId: item.id, reconciled: !!journalLineId, matchedJournalLineId: journalLineId || null })
      const glItem = openRec.lines.find((l) => l.source === 'gl' && l.journal_line_id === journalLineId)
      if (glItem) await setReconciled(supabase, { userId, itemId: glItem.id, reconciled: !!journalLineId })
      await load()
      if (openRec) setOpenRec(buildOpenRec(openRec.recon.id))
    } catch (e) { showToast(e.message, false) }
  }

  const saveReconHeader = async (forceReconciled = false) => {
    try {
      const recon = openRec.recon
      const account = d.accountOf[recon.account_id]
      const math = reconciliationMath(
        { ...account, statement_end_date: recon.statement_end_date },
        glLinesForAccount(recon.account_id), [], openRec.lines,
      )
      const payload = {
        gl_closing_balance: math.glClosing,
        unreconciled_amount: math.unreconciled,
        difference: math.difference,
        status: forceReconciled ? 'reconciled' : (Math.abs(math.difference) < 0.01 ? 'reconciled' : 'draft'),
        ...(forceReconciled ? { reconciled_by: userId, reconciled_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('bank_reconciliations').update(payload).eq('id', recon.id)
      if (error) throw error
      await load()
      setOpenRec(buildOpenRec(recon.id))
      showToast(payload.status === 'reconciled' ? 'Reconciliation matches — marked Reconciled' : 'Reconciliation saved (difference remains)')
    } catch (e) { showToast(e.message, false) }
  }

  const doDeleteRecon = async (recon) => {
    try {
      await deleteReconciliation(supabase, { schoolId, reconId: recon.id })
      showToast('Reconciliation removed')
      if (openRec?.recon?.id === recon.id) setOpenRec(null)
      load()
    } catch (e) { showToast(e.message, false) }
  }

  // ─── Statement import (CSV) ──────────────────────────────────────────────
  const onImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows.length < 2) throw new Error('Statement file has no data rows')
      const hasHeader = rows[0].some((h) => /date|amount|description|ref|value|credit|debit/i.test(String(h)))
      const header = hasHeader ? rows[0] : null
      const dataRows = hasHeader ? rows.slice(1) : rows
      setImportMap({ fileName: file.name, header, dataRows, columns: guessStatementColumns(header || dataRows[0]) })
    } catch (err) { showToast(err.message, false) }
    finally { e.target.value = '' }
  }

  const setColField = (index, field) => {
    setImportMap((m) => ({ ...m, columns: m.columns.map((c) => c.index === index ? { ...c, field } : c) }))
  }

  const mappedImportRows = () => {
    if (!importMap) return []
    const { dataRows, columns } = importMap
    return dataRows.map((row) => {
      const get = (f) => {
        const col = columns.find((c) => c.field === f)
        return col ? (row[col.index] ?? '') : ''
      }
      let debit = numVal(get('debit'))
      let credit = numVal(get('credit'))
      const amount = numVal(get('amount'))
      if (debit === 0 && credit === 0 && amount !== 0) {
        if (amount > 0) credit = amount
        else debit = -amount
      }
      const date = normalizeDate(get('date'))
      const reference = String(get('reference') || '').trim()
      const description = String(get('description') || '').trim()
      return { date, reference, description, debit, credit, amount: Math.abs(debit - credit) }
    }).filter((r) => r.amount > 0 || r.description || r.reference || r.date)
  }

  const addImported = async () => {
    const rows = mappedImportRows()
    if (!rows.length) return showToast('No usable rows in the statement', false)
    setSaving(true)
    try {
      const existing = new Set(openRec.lines.filter((l) => l.source === 'imported').map((l) => `${l.entry_date}|${l.reference}|${l.debit}|${l.credit}`))
      const fresh = rows.filter((r) => !existing.has(`${r.date}|${r.reference}|${r.debit}|${r.credit}`))
      if (!fresh.length) return showToast('All rows already imported', false)
      await addImportedLines(supabase, { schoolId, userId, recon: openRec.recon, rows: fresh })
      setImportMap(null)
      await load()
      setOpenRec(buildOpenRec(openRec.recon.id))
      showToast(`Imported ${fresh.length} statement row(s) — no GL entries created`)
    } catch (e) { showToast(e.message, false) }
    finally { setSaving(false) }
  }

  const autoMatch = async () => {
    const imported = openRec.lines.filter((l) => l.source === 'imported' && l.status !== 'reconciled')
    const glLines = glLinesForAccount(openRec.recon.account_id)
    const pairs = suggestMatches(imported, glLines)
    if (!pairs.length) return showToast('No suggested matches found', false)
    setSaving(true)
    try {
      for (const { importedRowId, journalLineId } of pairs) {
        const glItem = openRec.lines.find((l) => l.source === 'gl' && l.journal_line_id === journalLineId)
        if (glItem) await setReconciled(supabase, { userId, itemId: glItem.id, reconciled: true })
        await setReconciled(supabase, { userId, itemId: importedRowId, reconciled: true, matchedJournalLineId: journalLineId })
      }
      await load()
      setOpenRec(buildOpenRec(openRec.recon.id))
      showToast(`Matched ${pairs.length} statement line(s) to the GL`)
    } catch (e) { showToast(e.message, false) }
    finally { setSaving(false) }
  }

  const exportRecon = () => {
    const rows = [
      ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Status'],
      ...openRec.lines.map((l) => [l.entry_date || '', l.reference || '', l.description || '', l.debit || 0, l.credit || 0, l.status]),
    ]
    downloadFile(rows.map((r) => r.join(',')).join('\n'), `reconciliation_${openRec.recon.account_id.slice(0, 8)}.csv`, 'text/csv')
  }

  // ─── Render helpers ──────────────────────────────────────────────────────
  if (loading && !d) return <div className="loading-state">Loading Cash & Bank...</div>

  const renderStatementModal = () => {
    const data = viewAcc ? statementFor(viewAcc) : null
    if (!data) return null
    const { acc, rows, tf, unreconciled, receipts, payments } = data
    const balance = balances[acc.id]?.balance ?? 0
    return (
      <div className="prl-modal-overlay" onClick={() => setViewAcc(null)}>
        <div className="prl-modal prl-modal-lg" onClick={(e) => e.stopPropagation()}>
          <div className="prl-modal-head">
            <h3><Landmark size={16} /> {acc.code} — {acc.name}</h3>
            <button className="prl-btn-icon" onClick={() => setViewAcc(null)}><X size={16} /></button>
          </div>
          <div className="prl-detail-grid" style={{ paddingTop: 16 }}>
            <div className="prl-detail-card">
              <h4>Account</h4>
              <div className="prl-detail-item"><span>Type</span><strong>{accountKind(acc)}</strong></div>
              <div className="prl-detail-item"><span>Account Number</span><strong className="prl-mono">{acc.code}</strong></div>
              <div className="prl-detail-item"><span>Category</span><strong>{acc.category || '—'}</strong></div>
              <div className="prl-detail-item"><span>Opening Balance</span><strong>{fmt(acc.opening_balance)}</strong></div>
              <div className="prl-detail-item"><span>Current Balance</span><strong style={{ color: balance >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(balance)}</strong></div>
              <div className="prl-detail-item"><span>Unreconciled</span><strong style={{ color: unreconciled !== 0 ? '#d97706' : '#16a34a' }}>{fmt(unreconciled)}</strong></div>
            </div>
            <div className="prl-detail-card">
              <h4>Movement</h4>
              <div className="prl-detail-item"><span>Total Receipts (Dr)</span><strong style={{ color: '#16a34a' }}>{fmt(receipts)}</strong></div>
              <div className="prl-detail-item"><span>Total Payments (Cr)</span><strong style={{ color: '#dc2626' }}>{fmt(payments)}</strong></div>
              <div className="prl-detail-item"><span>Transfers In</span><strong>{fmt(tf.transfersIn)}</strong></div>
              <div className="prl-detail-item"><span>Transfers Out</span><strong>{fmt(tf.transfersOut)}</strong></div>
              <div className="prl-detail-item"><span>Net Movement</span><strong>{fmt(receipts - payments)}</strong></div>
              <div className="prl-detail-item"><span>Transactions</span><strong>{rows.length}</strong></div>
            </div>
          </div>
          <div className="prl-card" style={{ margin: '0 18px 18px', borderRadius: 10 }}>
            <table className="prl-table" style={{ minWidth: 680 }}>
              <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.entry_date)}</td>
                    <td className="prl-mono">{r.entry_no}</td>
                    <td>{r.description || '—'}</td>
                    <td style={{ color: '#16a34a' }}>{r.debit ? fmt(r.debit) : ''}</td>
                    <td style={{ color: '#dc2626' }}>{r.credit ? fmt(r.credit) : ''}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(r.balance)}</td>
                    <td>{badge(lineMeta(r.reconciled ? 'reconciled' : 'unreconciled'))}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="prl-norows">No GL transactions for this account yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  const renderTransferModal = () => (
    <div className="prl-modal-overlay" onClick={() => setTransferModal(false)}>
      <div className="prl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="prl-modal-head">
          <h3>{editTransferId ? `Edit ${transferForm.transfer_no || 'Transfer'}` : 'Transfer Funds'}</h3>
          <button className="prl-btn-icon" onClick={() => setTransferModal(false)}><X size={16} /></button>
        </div>
        <div className="prl-form-grid">
          <label className="prl-field prl-field-full"><span>From Account *</span>
            <select value={transferForm.from_account_id} onChange={(e) => setTransferForm({ ...transferForm, from_account_id: e.target.value })}>
              <option value="">Select source account...</option>
              {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </label>
          <label className="prl-field prl-field-full"><span>To Account *</span>
            <select value={transferForm.to_account_id} onChange={(e) => setTransferForm({ ...transferForm, to_account_id: e.target.value })}>
              <option value="">Select destination account...</option>
              {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </label>
          <label className="prl-field"><span>Amount (KSh) *</span><input type="number" min="0" step="0.01" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} /></label>
          <label className="prl-field"><span>Transfer Date</span><input type="date" value={transferForm.transfer_date} onChange={(e) => setTransferForm({ ...transferForm, transfer_date: e.target.value })} /></label>
          <label className="prl-field"><span>Reference</span><input placeholder="e.g. MPESA/JGTE6X3K2F" value={transferForm.reference} onChange={(e) => setTransferForm({ ...transferForm, reference: e.target.value })} /></label>
          <label className="prl-field"><span>Description</span><input placeholder="e.g. Weekly cash float top-up" value={transferForm.description} onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })} /></label>
        </div>
        <div className="prl-modal-foot">
          <button className="prl-btn-secondary" onClick={() => setTransferModal(false)}>Cancel</button>
          <button className="prl-btn-primary" disabled={saving} onClick={saveTransfer}>{saving ? 'Saving...' : editTransferId ? 'Save Changes' : 'Create Transfer Draft'}</button>
        </div>
      </div>
    </div>
  )

  const renderTransferAudit = () => {
    if (!viewTransfer) return null
    const t = viewTransfer
    return (
      <div className="prl-modal-overlay" onClick={() => setViewTransfer(null)}>
        <div className="prl-modal prl-modal-sm" onClick={(e) => e.stopPropagation()}>
          <div className="prl-modal-head">
            <h3>Transfer {t.transfer_no} <span className="cb-badge" style={{ background: statusMeta(t.status).color + '1a', color: statusMeta(t.status).color }}>{statusMeta(t.status).label}</span></h3>
            <button className="prl-btn-icon" onClick={() => setViewTransfer(null)}><X size={16} /></button>
          </div>
          <div className="prl-detail-grid" style={{ paddingTop: 16 }}>
            <div className="prl-detail-card">
              <h4>Transfer</h4>
              <div className="prl-detail-item"><span>From</span><strong>{accountName(t.from_account_id)}</strong></div>
              <div className="prl-detail-item"><span>To</span><strong>{accountName(t.to_account_id)}</strong></div>
              <div className="prl-detail-item"><span>Amount</span><strong style={{ color: '#2563eb' }}>{fmt(t.amount)}</strong></div>
              <div className="prl-detail-item"><span>Date</span><strong>{fmtDate(t.transfer_date)}</strong></div>
              <div className="prl-detail-item"><span>Reference</span><strong className="prl-mono">{t.reference || '—'}</strong></div>
              <div className="prl-detail-item"><span>Description</span><strong>{t.description || '—'}</strong></div>
            </div>
            <div className="prl-detail-card">
              <h4>Audit Trail</h4>
              <div className="prl-detail-item"><span>Created</span><strong>{d?.nameOf[t.created_by] || '—'}</strong></div>
              <div className="prl-detail-item"><span>Submitted</span><strong>{t.submitted_at ? d?.nameOf[t.submitted_by] : '—'}</strong></div>
              <div className="prl-detail-item"><span>Approved</span><strong>{t.approved_at ? d?.nameOf[t.approved_by] : '—'}</strong></div>
              <div className="prl-detail-item"><span>Posted</span><strong>{t.posted_at ? d?.nameOf[t.posted_by] : '—'}</strong></div>
              <div className="prl-detail-item"><span>Reversed</span><strong>{t.reversed_at ? d?.nameOf[t.reversed_by] : '—'}</strong></div>
            </div>
          </div>
          <div className="prl-modal-foot"><button className="prl-btn-primary" onClick={() => setViewTransfer(null)}>Close</button></div>
        </div>
      </div>
    )
  }

  const renderRecForm = () => (
    <div className="prl-modal-overlay" onClick={() => setRecModal(false)}>
      <div className="prl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="prl-modal-head">
          <h3><Scale size={16} /> New Reconciliation</h3>
          <button className="prl-btn-icon" onClick={() => setRecModal(false)}><X size={16} /></button>
        </div>
        <div className="prl-form-grid">
          <label className="prl-field prl-field-full"><span>Account *</span>
            <select value={recForm.account_id} onChange={(e) => setRecForm({ ...recForm, account_id: e.target.value })}>
              <option value="">Select account...</option>
              {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </label>
          <label className="prl-field"><span>Statement Start Date *</span><input type="date" value={recForm.statement_start_date} onChange={(e) => setRecForm({ ...recForm, statement_start_date: e.target.value })} /></label>
          <label className="prl-field"><span>Statement End Date *</span><input type="date" value={recForm.statement_end_date} onChange={(e) => setRecForm({ ...recForm, statement_end_date: e.target.value })} /></label>
          <label className="prl-field prl-field-full"><span>Statement Closing Balance *</span><input type="number" step="0.01" value={recForm.statement_closing_balance} onChange={(e) => setRecForm({ ...recForm, statement_closing_balance: e.target.value })} /></label>
          <label className="prl-field prl-field-full"><span>Notes</span><textarea rows={2} value={recForm.notes} onChange={(e) => setRecForm({ ...recForm, notes: e.target.value })} /></label>
        </div>
        <div className="prl-modal-foot">
          <button className="prl-btn-secondary" onClick={() => setRecModal(false)}>Cancel</button>
          <button className="prl-btn-primary" disabled={saving} onClick={saveRecon}>{saving ? 'Creating...' : 'Create Reconciliation'}</button>
        </div>
      </div>
    </div>
  )

  const renderImportMap = () => {
    if (!importMap) return null
    const { fileName, header, columns } = importMap
    const mapped = mappedImportRows()
    const fields = ['date', 'reference', 'description', 'debit', 'credit', 'amount']
    const fieldLabels = { date: 'Date', reference: 'Reference / Ref', description: 'Description', debit: 'Debit (money out)', credit: 'Credit (money in)', amount: 'Amount (single column)' }
    return (
      <div className="prl-modal-overlay" onClick={() => setImportMap(null)}>
        <div className="prl-modal prl-modal-lg" onClick={(e) => e.stopPropagation()}>
          <div className="prl-modal-head">
            <h3><Upload size={16} /> Map statement columns — {fileName}</h3>
            <button className="prl-btn-icon" onClick={() => setImportMap(null)}><X size={16} /></button>
          </div>
          <div className="prl-form-grid" style={{ paddingBottom: 8 }}>
            {columns.map((c) => (
              <label className="prl-field" key={c.index}>
                <span>{header ? (header[c.index] ?? `Column ${c.index + 1}`) : `Column ${c.index + 1}`}</span>
                <select value={c.field} onChange={(e) => setColField(c.index, e.target.value)}>
                  {fields.map((f) => <option key={f} value={f}>{fieldLabels[f]}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="prl-hint" style={{ padding: '0 18px' }}>Preview ({Math.min(mapped.length, 5)} of {mapped.length} rows). Importing matches against the GL — it never creates journal entries.</p>
          <div className="prl-card" style={{ margin: '8px 18px 6px', borderRadius: 10 }}>
            <table className="prl-table" style={{ minWidth: 560 }}>
              <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th>Debit</th><th>Credit</th><th>Amount</th></tr></thead>
              <tbody>
                {mapped.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    <td>{r.date || '—'}</td>
                    <td>{r.reference || '—'}</td>
                    <td>{r.description || '—'}</td>
                    <td style={{ color: '#dc2626' }}>{r.debit ? fmt(r.debit) : ''}</td>
                    <td style={{ color: '#16a34a' }}>{r.credit ? fmt(r.credit) : ''}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(r.amount)}</td>
                  </tr>
                ))}
                {mapped.length === 0 && <tr><td colSpan={6} className="prl-norows">No usable rows detected.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="prl-modal-foot">
            <button className="prl-btn-secondary" onClick={() => setImportMap(null)}>Cancel</button>
            <button className="prl-btn-primary" disabled={saving || !mapped.length} onClick={addImported}>Import {mapped.length} row(s)</button>
          </div>
        </div>
      </div>
    )
  }

  const renderReconDetail = () => {
    const { recon, lines, math } = openRec
    const account = d.accountOf[recon.account_id]
    const importedCount = lines.filter((l) => l.source === 'imported').length
    const matchedCount = lines.filter((l) => l.status === 'reconciled').length
    return (
      <div className="prl-section">
        <div className="prl-toolbar">
          <div className="prl-toolbar-left">
            <button className="prl-btn-ghost" onClick={() => setOpenRec(null)}><RotateCcw size={14} /> Back to list</button>
            <strong>{account?.code} — {account?.name}</strong>
            <span className="cb-badge" style={{ background: recMeta(recon.status).color + '1a', color: recMeta(recon.status).color }}>{recMeta(recon.status).label}</span>
          </div>
          <div className="prl-toolbar-left">
            <button className="prl-btn-secondary" onClick={exportRecon}><FileText size={14} /> Export</button>
            <button className="prl-btn-secondary" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import Statement</button>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ display: 'none' }} onChange={onImportFile} />
            <button className="prl-btn-ghost" onClick={autoMatch} disabled={saving}><CheckCircle size={14} /> Suggest Matches</button>
            <button className="prl-btn-primary" disabled={saving} onClick={() => saveReconHeader(true)}><CheckCircle size={14} /> Mark Reconciled</button>
          </div>
        </div>

        <div className="prl-stats">
          <div className="prl-stat"><p>GL Balance</p><strong style={{ color: '#2563eb' }}>{fmt(math?.glClosing ?? recon.gl_closing_balance)}</strong></div>
          <div className="prl-stat"><p>Statement Balance</p><strong style={{ color: '#7c3aed' }}>{fmt(recon.statement_closing_balance)}</strong></div>
          <div className="prl-stat"><p>Unreconciled</p><strong style={{ color: '#d97706' }}>{fmt(math?.unreconciled ?? recon.unreconciled_amount)}</strong></div>
          <div className="prl-stat"><p>Difference</p><strong style={{ color: Math.abs(math?.difference ?? recon.difference) < 0.01 ? '#16a34a' : '#dc2626' }}>{fmt(math?.difference ?? recon.difference)}</strong></div>
          <div className="prl-stat"><p>Matched</p><strong style={{ color: '#16a34a' }}>{matchedCount} / {lines.length}</strong></div>
        </div>

        {Math.abs(math?.difference ?? recon.difference) < 0.01 ? (
          <p className="prl-hint" style={{ color: '#16a34a' }}>This reconciliation ties out — the statement balance agrees with the GL after removing unmatched items.</p>
        ) : (
          <p className="prl-hint" style={{ color: '#d97706' }}>Difference {fmt(math?.difference ?? recon.difference)}. Reconcile more lines or adjust the statement balance before marking Reconciled.</p>
        )}

        {importedCount > 0 && (
          <p className="prl-hint">Statement imported: {importedCount} row(s) matched against the GL — no journal entries were created.</p>
        )}

        <div className="prl-card">
          <table className="prl-table" style={{ minWidth: 780 }}>
            <thead>
              <tr><th>Source</th><th>Date</th><th>Reference</th><th>Description</th><th>Debit</th><th>Credit</th><th>Status</th><th>Matched To</th><th></th></tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} style={{ opacity: l.status === 'reconciled' ? 0.6 : 1 }}>
                  <td>{l.source === 'gl' ? <span className="cb-badge" style={{ background: '#2563eb1a', color: '#2563eb' }}>GL</span> : <span className="cb-badge" style={{ background: '#7c3aed1a', color: '#7c3aed' }}>Statement</span>}</td>
                  <td>{l.entry_date ? fmtDate(l.entry_date) : '—'}</td>
                  <td className="prl-mono">{l.reference || '—'}</td>
                  <td>{l.description || '—'}</td>
                  <td style={{ color: '#dc2626' }}>{l.debit ? fmt(l.debit) : ''}</td>
                  <td style={{ color: '#16a34a' }}>{l.credit ? fmt(l.credit) : ''}</td>
                  <td>{badge(lineMeta(l.status))}</td>
                  <td>{l.matched_journal_line_id ? '✓ GL line' : (l.source === 'imported' ? '—' : '—')}</td>
                  <td className="prl-actions-cell">
                    {l.source === 'gl' ? (
                      <button className="prl-btn-ghost" onClick={() => toggleLine(l, l.status !== 'reconciled')} title="Toggle reconciled">
                        {l.status === 'reconciled' ? <RotateCcw size={14} /> : <CheckCircle size={14} />} {l.status === 'reconciled' ? 'Unmatch' : 'Reconcile'}
                      </button>
                    ) : (
                      <button className="prl-btn-ghost" onClick={() => toggleMatched(l, l.status === 'reconciled' ? null : (glLinesForAccount(recon.account_id).find((g) => Math.abs(Math.abs(g.debit - g.credit) - Math.abs(l.debit - l.credit)) < 0.01)?.id || ''))} title="Match to GL">
                        {l.status === 'reconciled' ? <RotateCcw size={14} /> : <CheckCircle size={14} />} {l.status === 'reconciled' ? 'Unmatch' : 'Match GL'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {lines.length === 0 && <tr><td colSpan={9} className="prl-norows">No GL transactions in this period — import a statement to match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="prl-page">
      <div className="prl-tabs">
        {[
          { key: 'dashboard', label: 'Dashboard', icon: <Landmark size={15} /> },
          { key: 'transfers', label: 'Transfers', icon: <ArrowLeftRight size={15} /> },
          { key: 'reconciliation', label: 'Reconciliation', icon: <Scale size={15} /> },
        ].map((t) => (
          <button key={t.key} className={`prl-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ═══ DASHBOARD ═══ */}
      {tab === 'dashboard' && d && (
        <div className="prl-section">
          <div className="prl-toolbar">
            <p className="prl-hint">Balances are computed from the General Ledger — opening balance + posted transactions. No manual balance entry.</p>
            <button className="prl-btn-primary" onClick={() => { setTransferForm(blankTransfer()); setEditTransferId(null); setTransferModal(true) }}><ArrowLeftRight size={15} /> Transfer Funds</button>
          </div>

          <div className="prl-stats">
            <div className="prl-stat"><p>Total Available Funds</p><strong style={{ color: '#16a34a' }}>{fmt(summary.available)}</strong></div>
            <div className="prl-stat"><p>Total Bank</p><strong style={{ color: '#2563eb' }}>{fmt(summary.bank)}</strong></div>
            <div className="prl-stat"><p>Total Mobile Money</p><strong style={{ color: '#7c3aed' }}>{fmt(summary.mobile)}</strong></div>
            <div className="prl-stat"><p>Total Cash</p><strong style={{ color: '#d97706' }}>{fmt(summary.cash)}</strong></div>
            <div className="prl-stat"><p>Fixed Deposits (Restricted)</p><strong style={{ color: '#0891b2' }}>{fmt(summary.fixed)}</strong></div>
          </div>

          <div className="prl-card">
            <h4 className="cb-card-title">Cash & Bank Accounts</h4>
            <table className="prl-table">
              <thead><tr><th>Account</th><th>Type</th><th>Account Number</th><th>Balance</th><th>Reconciled Status</th><th></th></tr></thead>
              <tbody>
                {cashAccounts.map((a) => {
                  const b = balances[a.id]
                  const latest = reconForAccount(a.id)[0]
                  return (
                    <tr key={a.id}>
                      <td><button className="cb-link" onClick={() => setViewAcc(a.id)}>{a.code} — {a.name}</button></td>
                      <td className="prl-cap">{accountKind(a)}</td>
                      <td className="prl-mono">{a.code}</td>
                      <td style={{ fontWeight: 600, color: (b?.balance ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(b?.balance ?? 0)}</td>
                      <td>
                        {!latest ? <span className="cb-badge" style={{ background: '#64748b1a', color: '#64748b' }}>Not reconciled</span>
                          : latest.status === 'reconciled'
                            ? <span className="cb-badge" style={{ background: '#16a34a1a', color: '#16a34a' }}>Reconciled</span>
                            : <span className="cb-badge" style={{ background: '#d977061a', color: '#d97706' }}>Diff {fmt(latest.difference)}</span>}
                      </td>
                      <td className="prl-actions-cell">
                        <button className="prl-btn-ghost" onClick={() => setViewAcc(a.id)} title="Statement"><Eye size={14} /></button>
                        <button className="prl-btn-ghost" onClick={() => { setRecAccountId(a.id); setTab('reconciliation'); }} title="Reconcile"><Scale size={14} /></button>
                        <button className="prl-btn-ghost" onClick={() => { setTransferForm({ ...blankTransfer(), from_account_id: a.id }); setEditTransferId(null); setTransferModal(true) }} title="Transfer from"><ArrowDownCircle size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
                {cashAccounts.length === 0 && <tr><td colSpan={6} className="prl-norows">No Cash & Bank accounts in the chart yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="prl-card">
            <h4 className="cb-card-title">Recent Transfers</h4>
            <table className="prl-table">
              <thead><tr><th>Transfer</th><th>Date</th><th>From</th><th>To</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {(d.transfers || []).slice(0, 6).map((t) => (
                  <tr key={t.id}>
                    <td className="prl-mono">{t.transfer_no}</td>
                    <td>{fmtDate(t.transfer_date)}</td>
                    <td>{accountName(t.from_account_id)}</td>
                    <td>{accountName(t.to_account_id)}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(t.amount)}</td>
                    <td>{badge(statusMeta(t.status))}</td>
                  </tr>
                ))}
                {(d.transfers || []).length === 0 && <tr><td colSpan={6} className="prl-norows">No transfers yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ TRANSFERS ═══ */}
      {tab === 'transfers' && d && (
        <div className="prl-section">
          <div className="prl-toolbar">
            <div className="prl-search-wrap"><Search size={15} /><input placeholder="Search transfers..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <button className="prl-btn-primary" onClick={() => { setTransferForm(blankTransfer()); setEditTransferId(null); setTransferModal(true) }}><Plus size={15} /> New Transfer</button>
          </div>
          <p className="prl-hint">A posted transfer creates one balanced GL entry (Dr destination, Cr source) — never income or expense.</p>
          <div className="prl-card">
            <table className="prl-table">
              <thead><tr><th>Transfer</th><th>Date</th><th>From</th><th>To</th><th>Amount</th><th>Reference</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {transferList.map((t) => (
                  <tr key={t.id}>
                    <td className="prl-mono">{t.transfer_no}</td>
                    <td>{fmtDate(t.transfer_date)}</td>
                    <td>{t._from}</td>
                    <td>{t._to}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(t.amount)}</td>
                    <td className="prl-mono">{t.reference || '—'}</td>
                    <td>{badge(statusMeta(t.status))}</td>
                    <td className="prl-actions-cell">
                      {t.status === 'draft' && <button className="prl-btn-ghost" onClick={() => transferTransition(t, 'submitted')} title="Submit"><Send size={14} /></button>}
                      {t.status === 'submitted' && isAdmin && <button className="prl-btn-primary" onClick={() => transferTransition(t, 'approved')} title="Approve"><CheckCircle size={14} /> Approve</button>}
                      {t.status === 'approved' && <button className="prl-btn-ghost" onClick={() => transferTransition(t, 'posted')} title="Post to GL"><Columns3 size={14} /></button>}
                      {t.status === 'draft' && <button className="prl-btn-ghost" onClick={() => openTransfer(t)}><Eye size={14} /> Edit</button>}
                      {t.status === 'draft' && <button className="prl-btn-danger-ghost" onClick={() => setConfirm({ message: `Delete transfer ${t.transfer_no}?`, action: () => deleteTransfer(t) })}><Trash2 size={14} /></button>}
                      {t.status === 'posted' && isAdmin && <button className="prl-btn-danger-ghost" onClick={() => setConfirm({ message: `Reverse ${t.transfer_no}? A reversing journal entry will be posted and the transfer marked reversed.`, action: () => doReverseTransfer(t) })} title="Reverse"><ArrowDownCircle size={14} /></button>}
                      <button className="prl-btn-ghost" onClick={() => setViewTransfer(t)}><Eye size={14} /></button>
                    </td>
                  </tr>
                ))}
                {transferList.length === 0 && <tr><td colSpan={8} className="prl-norows">No transfers yet — move funds between Cash, Bank and M-Pesa.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ RECONCILIATION ═══ */}
      {tab === 'reconciliation' && d && (
        openRec ? renderReconDetail() : (
          <div className="prl-section">
            <div className="prl-toolbar">
              <div className="prl-toolbar-left">
                <select className="prl-select" value={recAccountId} onChange={(e) => setRecAccountId(e.target.value)}>
                  <option value="">All accounts</option>
                  {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </div>
              <button className="prl-btn-primary" onClick={() => openNewRecon()}><Plus size={15} /> New Reconciliation</button>
            </div>
            <p className="prl-hint">Match GL transactions to your bank / M-Pesa / cash statements. Importing a statement never creates journal entries — reconciliation only confirms what already exists.</p>
            <div className="prl-card">
              <table className="prl-table">
                <thead><tr><th>Account</th><th>Period</th><th>Statement Balance</th><th>GL Balance</th><th>Unreconciled</th><th>Difference</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {(d.reconciliations || [])
                    .filter((r) => !recAccountId || r.account_id === recAccountId)
                    .map((r) => (
                      <tr key={r.id}>
                        <td>{accountName(r.account_id)}</td>
                        <td>{fmtDate(r.statement_start_date)} — {fmtDate(r.statement_end_date)}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(r.statement_closing_balance)}</td>
                        <td>{fmt(r.gl_closing_balance)}</td>
                        <td style={{ color: '#d97706' }}>{fmt(r.unreconciled_amount)}</td>
                        <td style={{ fontWeight: 600, color: Math.abs(r.difference) < 0.01 ? '#16a34a' : '#dc2626' }}>{fmt(r.difference)}</td>
                        <td>{badge(recMeta(r.status))}</td>
                        <td className="prl-actions-cell">
                          <button className="prl-btn-ghost" onClick={() => openRecon(r.id)}><Eye size={14} /> Open</button>
                          {r.status === 'draft' && <button className="prl-btn-danger-ghost" onClick={() => setConfirm({ message: 'Delete this reconciliation? Its matched lines will be removed.', action: () => doDeleteRecon(r) })}><Trash2 size={14} /></button>}
                        </td>
                      </tr>
                    ))}
                  {(d.reconciliations || []).length === 0 && <tr><td colSpan={8} className="prl-norows">No reconciliations yet — create the first one.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ═══ Modals ═══ */}
      {renderStatementModal()}
      {transferModal && renderTransferModal()}
      {recModal && renderRecForm()}
      {importMap && renderImportMap()}
      {renderTransferAudit()}

      {confirm && (
        <div className="prl-modal-overlay" onClick={() => setConfirm(null)}>
          <div className="prl-modal prl-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head">
              <h3><AlertTriangle size={16} style={{ color: '#dc2626' }} /> Confirm</h3>
              <button className="prl-btn-icon" onClick={() => setConfirm(null)}><X size={16} /></button>
            </div>
            <p className="prl-confirm-msg">{confirm.message}</p>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="prl-btn-danger" onClick={() => { const a = confirm.action; setConfirm(null); a() }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`prl-toast ${toast.ok ? '' : 'error'}`}>{toast.msg}</div>}
    </div>
  )
}
