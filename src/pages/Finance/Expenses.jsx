import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Plus, Search, Pencil, Trash2, X, Eye, Download, FileText, CheckCircle,
  AlertTriangle, Paperclip, Upload, Send, UserCheck, Columns3, XCircle, Receipt,
  Banknote, Wallet, Building2, User, BarChart3, HandCoins, Filter, Landmark, Smartphone,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmt, fmtDate, fmtDateTime, downloadFile } from '../admin/fees/utils/feesHelpers'
import { writeAudit, apDebitAccountOptions } from './accountsUtils'
import { reverseJournalEntry } from './apUtils'
import {
  EXPENSE_STATUSES, EXPENSE_PAYMENT_STATUSES, EXPENSE_PAYEE_TYPES, EXPENSE_PAYMENT_METHODS,
  expStatus, payStatus, nextExpenseNo, expenseTotals, expenseOutstanding,
  paymentAccountsFor, loadExpensesData, expenseLinesOf, expenseAttachmentsOf, payeeOf,
  categoryOf, postExpenseJournal, postExpenseSettlement, expenseSummary,
} from './expensesUtils'
import './Expenses.css'

const TODAY = new Date().toISOString().split('T')[0]

const isAdminRole = (role) => ['admin', 'deputy_administrator', 'superadmin'].includes(role)

const blankExpense = () => ({
  expense_no: '', expense_date: TODAY, payee_type: 'other', supplier_id: '', payee_name: '',
  description: '', department: '', cost_centre: '', notes: '',
  payment_method: 'bank', payment_account_id: '', payment_reference: '', payment_date: '',
  payment_status: 'unpaid', paid_amount: '',
})

const blankLine = () => ({ account_id: '', description: '', amount: '', department: '', cost_centre: '' })

const ReportTable = ({ data, money = true }) => (
  <table className="prl-table" style={{ minWidth: 240 }}>
    <thead><tr><th>Label</th><th className="num" style={{ textAlign: 'right' }}>Amount</th></tr></thead>
    <tbody>
      {data.map((r) => (
        <tr key={r.label}>
          <td>{r.label}</td>
          <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{money ? fmt(r.value) : r.value}</td>
        </tr>
      ))}
      {data.length === 0 && <tr><td colSpan={2} className="prl-norows">No data.</td></tr>}
    </tbody>
  </table>
)

export default function ExpensesPage({ initialTab, openExpenseId, onOpenExpenseDone }) {
  const { profile } = useAuthStore()
  const { currentYear } = useSchool()
  const schoolId = profile?.school_id
  const userId = profile?.id
  const role = profile?.role
  const isAdmin = isAdminRole(role)

  const [tab, setTab] = useState(initialTab || 'dashboard')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [d, setD] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [payFilter, setPayFilter] = useState('')

  const [expenseModal, setExpenseModal] = useState(false)
  const [expenseForm, setExpenseForm] = useState(blankExpense())
  const [expenseLines, setExpenseLines] = useState([blankLine()])
  const [editExpenseId, setEditExpenseId] = useState(null)
  const [saving, setSaving] = useState(false)

  const [view, setView] = useState(null)            // expense id
  const [jeNos, setJeNos] = useState({})            // journal entry numbers for the viewed expense
  const [settle, setSettle] = useState(null)        // expense being settled
  const [settleForm, setSettleForm] = useState({ method: 'bank', account_id: '', reference: '', date: TODAY, amount: '' })
  const [confirm, setConfirm] = useState(null)      // { message, action }
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [attachTarget, setAttachTarget] = useState(null)
  const fileRef = useRef(null)

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const load = async () => {
    setLoading(true)
    try { setD(await loadExpensesData(supabase, schoolId)) } catch (e) { showToast(e.message, false) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [schoolId]) // eslint-disable-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  // Deep link from Finance → Transactions: open the original expense record.
  useEffect(() => {
    if (openExpenseId && d) {
      setTab('dashboard') // eslint-disable-line react-hooks/set-state-in-effect
      setView(openExpenseId)
      onOpenExpenseDone?.()
    }
  }, [openExpenseId, d]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load journal entry numbers for the expense being viewed.
  useEffect(() => {
    if (!view || !d) return
    const exp = (d.expenses || []).find((e) => e.id === view)
    const ids = [exp?.journal_entry_id, exp?.settlement_journal_id].filter(Boolean)
    if (!ids.length) { setJeNos({}); return } // eslint-disable-line react-hooks/set-state-in-effect
    ;(async () => {
      const { data } = await supabase.from('journal_entries').select('id, entry_no').in('id', ids)
      setJeNos(Object.fromEntries((data || []).map((j) => [j.id, j.entry_no])))
    })()
  }, [view, d])

  const accountName = (id) => (d?.accountOf?.[id] ? `${d.accountOf[id].code} — ${d.accountOf[id].name}` : '—')

  // ─── Record / Edit ───────────────────────────────────────────────────────
  const openExpense = async (exp) => {
    setEditExpenseId(exp?.id || null)
    if (exp) {
      setExpenseForm({
        expense_no: exp.expense_no, expense_date: exp.expense_date || TODAY,
        payee_type: exp.payee_type || 'other', supplier_id: exp.supplier_id || '', payee_name: exp.payee_name || '',
        description: exp.description || '', department: exp.department || '', cost_centre: exp.cost_centre || '',
        notes: exp.notes || '', payment_method: exp.payment_method || 'bank',
        payment_account_id: exp.payment_account_id || '', payment_reference: exp.payment_reference || '',
        payment_date: exp.payment_date || '', payment_status: exp.payment_status || 'unpaid',
        paid_amount: exp.paid_amount ? String(exp.paid_amount) : '',
      })
      setExpenseLines(expenseLinesOf(d, exp.id).map((l) => ({
        account_id: l.account_id, description: l.description, amount: String(l.amount),
        department: l.department || '', cost_centre: l.cost_centre || '',
      })))
    } else {
      const expenseNo = await nextExpenseNo(supabase, schoolId)
      setExpenseForm({ ...blankExpense(), expense_no: expenseNo })
      setExpenseLines([blankLine()])
    }
    setExpenseModal(true)
  }

  const totals = expenseTotals(expenseLines)
  const balance = Math.max(Number(totals.total_amount) - (Number(expenseForm.paid_amount) || 0), 0)

  const payAccounts = useMemo(() => paymentAccountsFor(d?.accounts || [], expenseForm.payment_method), [d, expenseForm.payment_method])

  const changePaymentMethod = (method) => {
    const valid = paymentAccountsFor(d?.accounts || [], method)
    setExpenseForm((f) => ({
      ...f, payment_method: method,
      payment_account_id: valid.find((a) => a.id === f.payment_account_id)?.id || valid[0]?.id || '',
    }))
  }

  const saveExpense = async () => {
    try {
      const goodLines = expenseLines.filter((l) => l.account_id && Number(l.amount) > 0)
      if (!goodLines.length) return showToast('Add at least one expense line with an account and amount', false)
      if (!expenseForm.expense_date) return showToast('Expense date is required', false)
      if (expenseForm.payee_type === 'supplier' && !expenseForm.supplier_id) return showToast('Select the supplier payee', false)
      if (['staff', 'other'].includes(expenseForm.payee_type) && !expenseForm.payee_name.trim()) return showToast('Enter the payee name', false)

      const total = totals.total_amount
      const paidAmt = Number(expenseForm.paid_amount) || 0
      if (expenseForm.payment_status !== 'unpaid') {
        if (!expenseForm.payment_method) return showToast('Select the payment method', false)
        if (!expenseForm.payment_account_id) return showToast('Select the payment account', false)
        if (!expenseForm.payment_reference.trim()) return showToast('Enter the payment reference (receipt / M-Pesa / cheque no.)', false)
        if (!expenseForm.payment_date) return showToast('Enter the payment date', false)
        if (expenseForm.payment_status === 'partially_paid' && (paidAmt <= 0 || paidAmt >= total)) return showToast('Partially paid amount must be between 0 and the expense total', false)
        if (expenseForm.payment_status === 'paid' && Math.abs(paidAmt - total) > 0.01) return showToast('Paid amount must equal the expense total', false)
      }
      const effectivePaid = expenseForm.payment_status === 'unpaid' ? 0
        : expenseForm.payment_status === 'paid' ? total
          : Math.min(paidAmt, total)

      setSaving(true)
      if (editExpenseId) {
        const current = (d.expenses || []).find((e) => e.id === editExpenseId)
        const wasRejected = current?.status === 'rejected'
        const { error } = await supabase.from('expenses').update({
          expense_date: expenseForm.expense_date, payee_type: expenseForm.payee_type,
          supplier_id: expenseForm.payee_type === 'supplier' ? expenseForm.supplier_id : null,
          payee_name: expenseForm.payee_type === 'supplier' ? null : expenseForm.payee_name.trim() || (expenseForm.payee_type === 'cash' ? 'Cash purchase' : null),
          description: expenseForm.description, department: expenseForm.department,
          cost_centre: expenseForm.cost_centre, notes: expenseForm.notes,
          payment_method: expenseForm.payment_method, payment_account_id: expenseForm.payment_account_id,
          payment_reference: expenseForm.payment_reference, payment_date: expenseForm.payment_date,
          total_amount: total, paid_amount: effectivePaid, payment_status: expenseForm.payment_status,
          ...(wasRejected ? { status: 'draft', rejected_by: null, rejected_at: null, rejection_reason: null } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', editExpenseId)
        if (error) throw error
        await supabase.from('expense_lines').delete().eq('expense_id', editExpenseId)
        await supabase.from('expense_lines').insert(goodLines.map((l) => ({
          school_id: schoolId, expense_id: editExpenseId, account_id: l.account_id,
          description: l.description || 'Expense line', amount: Number(l.amount),
          department: l.department || expenseForm.department || null,
          cost_centre: l.cost_centre || expenseForm.cost_centre || null,
        })))
        await writeAudit(supabase, { schoolId, action: 'expense_updated', details: { expense_id: editExpenseId, expense_no: expenseForm.expense_no, total } })
        showToast(`Expense ${expenseForm.expense_no} updated`)
      } else {
        const { data: exp, error } = await supabase.from('expenses').insert({
          school_id: schoolId, expense_no: expenseForm.expense_no,
          expense_date: expenseForm.expense_date, payee_type: expenseForm.payee_type,
          supplier_id: expenseForm.payee_type === 'supplier' ? expenseForm.supplier_id : null,
          payee_name: expenseForm.payee_type === 'supplier' ? null : expenseForm.payee_name.trim() || (expenseForm.payee_type === 'cash' ? 'Cash purchase' : null),
          description: expenseForm.description, department: expenseForm.department,
          cost_centre: expenseForm.cost_centre, notes: expenseForm.notes,
          payment_method: expenseForm.payment_method, payment_account_id: expenseForm.payment_account_id,
          payment_reference: expenseForm.payment_reference, payment_date: expenseForm.payment_date,
          total_amount: total, paid_amount: effectivePaid, payment_status: expenseForm.payment_status,
          created_by: userId,
        }).select().single()
        if (error) throw error
        await supabase.from('expense_lines').insert(goodLines.map((l) => ({
          school_id: schoolId, expense_id: exp.id, account_id: l.account_id,
          description: l.description || 'Expense line', amount: Number(l.amount),
          department: l.department || expenseForm.department || null,
          cost_centre: l.cost_centre || expenseForm.cost_centre || null,
        })))
        await writeAudit(supabase, { schoolId, action: 'expense_created', details: { expense_id: exp.id, expense_no: expenseForm.expense_no, total } })
        showToast(`Expense ${expenseForm.expense_no} drafted`)
      }
      setExpenseModal(false)
      load()
    } catch (e) { showToast(e.message, false) }
    finally { setSaving(false) }
  }

  // ─── Approval workflow ───────────────────────────────────────────────────
  const transition = async (exp, to) => {
    try {
      if (to === 'approved') {
        if (!isAdmin) return showToast('Only the admin / principal can approve expenses', false)
        if (exp.created_by === userId) return showToast('You cannot approve your own expense', false)
      }
      if (to === 'posted' && !isAdmin) return showToast('Only the admin / principal can post to the General Ledger', false)

      const payload = { status: to, updated_at: new Date().toISOString() }
      const who = { submitted: 'submitted_by', reviewed: 'reviewed_by', approved: 'approved_by', paid: 'paid_by', posted: 'posted_by' }[to]
      if (who) { payload[who] = userId; payload[`${who.replace('_by', '')}_at`] = new Date().toISOString() }
      if (to === 'posted') {
        const je = await postExpenseJournal(supabase, {
          schoolId, userId, expense: exp, lines: expenseLinesOf(d, exp.id), payeeName: payeeOf(d, exp), entryDate: exp.expense_date,
        })
        payload.journal_entry_id = je.id
      }
      const { error } = await supabase.from('expenses').update(payload).eq('id', exp.id)
      if (error) throw error
      showToast(`Expense ${exp.expense_no} → ${to.replace(/_/g, ' ')}`)
      await writeAudit(supabase, { schoolId, action: `expense_${to}`, details: { expense_id: exp.id, expense_no: exp.expense_no } })
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const rejectExpense = async (exp, reason) => {
    try {
      const { error } = await supabase.from('expenses').update({
        status: 'rejected', rejected_by: userId, rejected_at: new Date().toISOString(),
        rejection_reason: reason, updated_at: new Date().toISOString(),
      }).eq('id', exp.id)
      if (error) throw error
      showToast(`Expense ${exp.expense_no} rejected`)
      await writeAudit(supabase, { schoolId, action: 'expense_rejected', details: { expense_id: exp.id, expense_no: exp.expense_no, reason } })
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const confirmReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return
    const reason = rejectReason.trim()
    const exp = (d.expenses || []).find((e) => e.id === rejectTarget)
    setRejectTarget(null); setRejectReason('')
    if (exp) await rejectExpense(exp, reason)
  }

  const reverseExpense = async (exp) => {
    try {
      if (!exp.journal_entry_id) return showToast('Expense has no posted journal', false)
      const { data: je } = await supabase.from('journal_entries').select('*').eq('id', exp.journal_entry_id).single()
      await reverseJournalEntry(supabase, { schoolId, userId, entry: je })
      if (exp.settlement_journal_id) {
        const { data: sje } = await supabase.from('journal_entries').select('*').eq('id', exp.settlement_journal_id).single()
        if (sje) await reverseJournalEntry(supabase, { schoolId, userId, entry: sje })
      }
      const { error } = await supabase.from('expenses').update({
        status: 'approved', journal_entry_id: null, settlement_journal_id: null,
        paid_amount: 0, payment_status: 'unpaid', updated_at: new Date().toISOString(),
      }).eq('id', exp.id)
      if (error) throw error
      showToast('Expense reversed — GL restored, expense back to Approved')
      await writeAudit(supabase, { schoolId, action: 'expense_reversed', details: { expense_id: exp.id, expense_no: exp.expense_no } })
      load()
    } catch (e) { showToast(e.message, false) }
  }

  // ─── Settlement of an unpaid / partially paid posted expense ─────────────
  const openSettle = (exp) => {
    setSettle(exp)
    setSettleForm({ method: 'bank', account_id: '', reference: '', date: TODAY, amount: String(expenseOutstanding(exp)) })
  }

  const saveSettlement = async () => {
    if (!settle) return
    try {
      if (!settleForm.account_id) return showToast('Select the payment account', false)
      if (!settleForm.reference.trim()) return showToast('Enter the payment reference', false)
      if (Number(settleForm.amount) <= 0) return showToast('Enter the amount paid', false)
      setSaving(true)
      await postExpenseSettlement(supabase, {
        schoolId, userId, expense: settle, paymentAccountId: settleForm.account_id,
        amount: settleForm.amount, reference: settleForm.reference, paymentDate: settleForm.date,
      })
      showToast(`Payment recorded on ${settle.expense_no}`)
      setSettle(null)
      load()
    } catch (e) { showToast(e.message, false) }
    finally { setSaving(false) }
  }

  // ─── Attachments ──────────────────────────────────────────────────────────
  const onAttachFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !attachTarget) return
    try {
      const att = await supabase.storage.from('finance-attachments').upload(
        `${schoolId}/expense/${attachTarget}/${Date.now()}-${String(file.name || 'file').replace(/[^\w.-]/g, '_')}`,
        file, { contentType: file.type || 'application/octet-stream' }
      )
      if (att.error) throw att.error
      const { error } = await supabase.from('finance_attachments').insert({
        school_id: schoolId, entity_type: 'expense', entity_id: attachTarget,
        file_name: file.name || 'file', file_type: file.type, file_size: file.size || 0,
        storage_path: att.data.path, uploaded_by: userId,
      })
      if (error) throw error
      showToast(`Attached ${file.name}`)
      load()
    } catch (err) { showToast(err.message, false) }
    finally { fileRef.current.value = '' }
  }

  const removeAttachment = async (att) => {
    try {
      await supabase.storage.from('finance-attachments').remove([att.storage_path])
      const { error } = await supabase.from('finance_attachments').delete().eq('id', att.id).eq('school_id', schoolId)
      if (error) throw error
      showToast('Attachment removed')
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const Attachments = ({ id }) => {
    const list = expenseAttachmentsOf(d, id)
    return (
      <div className="ap-attachments">
        <div className="ap-att-head">
          <Paperclip size={13} /> Documents
          <button className="ap-btn-ghost" onClick={() => { setAttachTarget(id); fileRef.current?.click() }}><Upload size={12} /> Attach</button>
        </div>
        {list.length === 0 ? (
          <p className="prl-norows">No documents attached.</p>
        ) : (
          <div className="ap-att-list">
            {list.map((a) => (
              <div className="ap-att-item" key={a.id}>
                <FileText size={14} />
                <a href={supabase.storage.from('finance-attachments').getPublicUrl(a.storage_path).data.publicUrl} target="_blank" rel="noreferrer">{a.file_name}</a>
                <span>{Math.round((a.file_size || 0) / 1024)} KB</span>
                <button className="ap-btn-danger-ghost" onClick={() => removeAttachment(a)}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Derived data ─────────────────────────────────────────────────────────
  const summary = useMemo(() => d ? expenseSummary(d.expenses, { year: currentYear }) : null, [d, currentYear])

  const expenseList = useMemo(() => {
    if (!d) return []
    const q = search.toLowerCase()
    return (d.expenses || [])
      .map((e) => ({ ...e, _payee: payeeOf(d, e), _category: categoryOf(d, e), _outstanding: expenseOutstanding(e) }))
      .filter((e) => (!statusFilter || e.status === statusFilter)
        && (!payFilter || e.payment_status === payFilter)
        && (!q || `${e.expense_no} ${e._payee} ${e.description || ''} ${e.payment_reference || ''}`.toLowerCase().includes(q)))
  }, [d, search, statusFilter, payFilter])

  const pendingApprovals = useMemo(() => (d?.expenses || []).filter((e) => ['submitted', 'reviewed'].includes(e.status)), [d])

  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

  const exportCsv = () => {
    const rows = [['Expense No.', 'Date', 'Payee', 'Category', 'Description', 'Department', 'Cost Centre', 'Amount', 'Paid', 'Outstanding', 'Payment Account', 'Status', 'Payment Status', 'GL Status']]
    expenseList.forEach((e) => rows.push([
      e.expense_no, e.expense_date, e._payee, e._category ? `${e._category.code} — ${e._category.name}` : '—',
      e.description || '', e.department || '', e.cost_centre || '',
      e.total_amount, e.paid_amount, e._outstanding, accountName(e.payment_account_id),
      expStatus(e.status).label, payStatus(e.payment_status).label, e.journal_entry_id ? 'Posted' : 'Not posted',
    ].map(esc).join(',')))
    downloadFile(rows.join('\n'), `expenses_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv')
  }

  const GlBadge = ({ exp }) => {
    const o = expenseOutstanding(exp)
    if (exp.journal_entry_id) return <span className={`exp-gl ${o > 0 ? 'pending' : 'ok'}`}><Columns3 size={12} />{o > 0 ? 'Partially settled' : 'Posted'}</span>
    return <span className="exp-gl no">Not posted</span>
  }

  const renderActions = (s) => {
    const meta = expStatus(s)
    return <span className="ap-badge" style={{ background: meta.color + '1a', color: meta.color }}>{meta.label}</span>
  }

  // ─── Reports ──────────────────────────────────────────────────────────────
  const [repFilter, setRepFilter] = useState({ period: '', method: '', status: '', category: '', department: '', cost_centre: '' })

  const reportExpenses = useMemo(() => {
    if (!d) return []
    const q = repFilter
    return (d.expenses || [])
      .filter((e) => !['draft', 'rejected', 'cancelled'].includes(e.status))
      .filter((e) => !q.period || String(new Date(e.expense_date).getFullYear()) === q.period)
      .filter((e) => !q.method || e.payment_method === q.method)
      .filter((e) => !q.status || e.status === q.status)
      .filter((e) => !q.department || e.department === q.department || expenseLinesOf(d, e.id).some((l) => l.department === q.department))
      .filter((e) => !q.cost_centre || e.cost_centre === q.cost_centre || expenseLinesOf(d, e.id).some((l) => l.cost_centre === q.cost_centre))
      .filter((e) => {
        if (!q.category) return true
        return expenseLinesOf(d, e.id).some((l) => d.accountOf?.[l.account_id]?.category === q.category)
      })
  }, [d, repFilter])

  const reportData = useMemo(() => {
    if (!reportExpenses.length) return null
    const byCat = {}, byDept = {}, byCentre = {}, byMethod = {}, byMonth = {}
    let paidTotal = 0, outstandingTotal = 0
    for (const e of reportExpenses) {
      const lines = expenseLinesOf(d, e.id)
      for (const l of lines) {
        const acc = d.accountOf?.[l.account_id]
        const cat = acc?.category || 'Uncategorised'
        byCat[cat] = (byCat[cat] || 0) + Number(l.amount)
        const dept = l.department || e.department || 'Unspecified'
        byDept[dept] = (byDept[dept] || 0) + Number(l.amount)
        const centre = l.cost_centre || e.cost_centre || 'Unspecified'
        byCentre[centre] = (byCentre[centre] || 0) + Number(l.amount)
      }
      if (e.payment_method) byMethod[e.payment_method] = (byMethod[e.payment_method] || 0) + Number(e.paid_amount)
      paidTotal += Number(e.paid_amount)
      outstandingTotal += expenseOutstanding(e)
      const m = `${new Date(e.expense_date).getFullYear()}-${String(new Date(e.expense_date).getMonth() + 1).padStart(2, '0')}`
      byMonth[m] = (byMonth[m] || 0) + Number(e.total_amount)
    }
    const sorted = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v }))
    const cats = sorted(byCat)
    return {
      byCategory: cats,
      byDepartment: sorted(byDept),
      byCostCentre: sorted(byCentre),
      byMethod: Object.entries(byMethod).map(([k, v]) => ({ label: EXPENSE_PAYMENT_METHODS.find((m) => m.value === k)?.label || k, value: v })),
      byMonth: Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ label: k, value: v })),
      topCategories: cats.slice(0, 8),
      paidTotal, outstandingTotal,
      pendingCount: reportExpenses.filter((e) => ['submitted', 'reviewed'].includes(e.status)).length,
      approvedCount: reportExpenses.filter((e) => ['approved', 'paid'].includes(e.status)).length,
      postedCount: reportExpenses.filter((e) => e.status === 'posted').length,
    }
  }, [reportExpenses, d])

  const reportExport = (filename, rows) => downloadFile(rows.join('\n'), filename, 'text/csv')

  const reportCategoryOptions = useMemo(() => {
    const cats = new Set((d?.lines || []).map((l) => d?.accountOf?.[l.account_id]?.category).filter(Boolean))
    return [...cats]
  }, [d])

  const reportDeptOptions = useMemo(() => {
    const set = new Set()
    ;(d?.expenses || []).forEach((e) => { if (e.department) set.add(e.department); expenseLinesOf(d, e.id).forEach((l) => l.department && set.add(l.department)) })
    return [...set]
  }, [d])

  const reportCentreOptions = useMemo(() => {
    const set = new Set()
    ;(d?.expenses || []).forEach((e) => { if (e.cost_centre) set.add(e.cost_centre); expenseLinesOf(d, e.id).forEach((l) => l.cost_centre && set.add(l.cost_centre)) })
    return [...set]
  }, [d])

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading && !d) return <div className="loading-state">Loading Expenses...</div>

  return (
    <div className="prl-page">
      <div className="prl-tabs">
        {[
          { key: 'dashboard', label: 'Expense Ledger', icon: <Receipt size={15} /> },
          { key: 'reports', label: 'Reports', icon: <BarChart3 size={15} /> },
        ].map((t) => (
          <button key={t.key} className={`prl-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ═══ DASHBOARD ═══ */}
      {tab === 'dashboard' && d && (
        <div className="prl-section">
          <div className="prl-stats">
            {[
              { label: 'Total Expenses This Period', value: fmt(summary.totalPeriod), color: '#2563eb', icon: <Receipt size={18} /> },
              { label: 'Pending Approval', value: summary.pendingApproval, color: '#d97706', icon: <Send size={18} /> },
              { label: 'Approved', value: summary.approved, color: '#7c3aed', icon: <UserCheck size={18} /> },
              { label: 'Paid', value: fmt(summary.paid), color: '#16a34a', icon: <HandCoins size={18} /> },
              { label: 'Outstanding / Unpaid', value: fmt(summary.outstanding), color: '#dc2626', icon: <AlertTriangle size={18} /> },
            ].map((s) => (
              <div className="prl-stat" key={s.label}>
                <p>{s.label}</p>
                <strong style={{ color: s.color }}>{s.value}</strong>
              </div>
            ))}
          </div>

          {pendingApprovals.length > 0 && (
            <div className="prl-pending-block">
              <div className="prl-pending-head">
                <AlertTriangle size={15} />
                <strong>Expenses awaiting approval</strong>
                <span className="prl-badge" style={{ background: '#d977061a', color: '#d97706' }}>{pendingApprovals.length} pending</span>
              </div>
              <div className="prl-card">
                <table className="prl-table">
                  <thead><tr><th>Expense</th><th>Date</th><th>Payee</th><th>Amount</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {pendingApprovals.slice(0, 8).map((e) => (
                      <tr key={e.id}>
                        <td className="prl-mono">{e.expense_no}</td>
                        <td>{fmtDate(e.expense_date)}</td>
                        <td>{payeeOf(d, e)}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(e.total_amount)}</td>
                        <td>{renderActions(e.status)}</td>
                        <td className="prl-actions-cell">
                          {e.status === 'submitted' && <button className="prl-btn-ghost" onClick={() => transition(e, 'reviewed')} title="Review"><UserCheck size={14} /></button>}
                          {e.status === 'reviewed' && isAdmin && <button className="prl-btn-primary" onClick={() => transition(e, 'approved')} title="Approve"><CheckCircle size={14} /> Approve</button>}
                          {isAdmin && <button className="prl-btn-danger-ghost" onClick={() => setRejectTarget(e.id)} title="Reject"><XCircle size={14} /></button>}
                          <button className="prl-btn-ghost" onClick={() => setView(e.id)}><Eye size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="prl-toolbar">
            <div className="prl-toolbar-left">
              <div className="prl-search-wrap"><Search size={15} /><input placeholder="Search expenses (no., payee, description, ref)..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <select className="prl-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {EXPENSE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select className="prl-select" value={payFilter} onChange={(e) => setPayFilter(e.target.value)}>
                <option value="">All payment states</option>
                {EXPENSE_PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="prl-toolbar-left">
              <button className="prl-btn-secondary" onClick={exportCsv}><Download size={15} /> Export</button>
              <button className="prl-btn-primary" onClick={() => openExpense(null)}><Plus size={15} /> Record Expense</button>
            </div>
          </div>

          <div className="prl-card">
            <table className="prl-table" style={{ minWidth: 1240 }}>
              <thead>
                <tr>
                  <th>Expense No.</th><th>Date</th><th>Payee</th><th>Category</th><th>Description</th>
                  <th>Department</th><th>Cost Centre</th><th className="num">Amount</th><th>Payment Account</th>
                  <th>Status</th><th>GL Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {expenseList.map((e) => (
                  <tr key={e.id}>
                    <td className="prl-mono">{e.expense_no}</td>
                    <td>{fmtDate(e.expense_date)}</td>
                    <td>{e._payee}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{e._category ? `${e._category.code} — ${e._category.name}` : '—'}</td>
                    <td style={{ maxWidth: 220 }}>{e.description || '—'}</td>
                    <td>{e.department || '—'}</td>
                    <td>{e.cost_centre || '—'}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmt(e.total_amount)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{accountName(e.payment_account_id)}</td>
                    <td>{renderActions(e.status)}</td>
                    <td><GlBadge exp={e} /></td>
                    <td className="prl-actions-cell">
                      {e.status === 'draft' && <button className="prl-btn-ghost" onClick={() => transition(e, 'submitted')} title="Submit"><Send size={14} /></button>}
                      {e.status === 'submitted' && <button className="prl-btn-ghost" onClick={() => transition(e, 'reviewed')} title="Review"><UserCheck size={14} /></button>}
                      {e.status === 'reviewed' && isAdmin && <button className="prl-btn-ghost" onClick={() => transition(e, 'approved')} title="Approve"><CheckCircle size={14} /></button>}
                      {['submitted', 'reviewed', 'approved'].includes(e.status) && isAdmin && <button className="prl-btn-danger-ghost" onClick={() => setRejectTarget(e.id)} title="Reject"><XCircle size={14} /></button>}
                      {e.status === 'approved' && e.payment_status === 'paid' && <button className="prl-btn-ghost" onClick={() => transition(e, 'paid')} title="Mark paid"><HandCoins size={14} /></button>}
                      {['approved', 'paid'].includes(e.status) && isAdmin && <button className="prl-btn-ghost" onClick={() => transition(e, 'posted')} title="Post to GL"><Columns3 size={14} /></button>}
                      {['draft', 'submitted', 'reviewed', 'rejected'].includes(e.status) && <button className="prl-btn-ghost" onClick={() => openExpense(e)}><Pencil size={14} /></button>}
                      {e.status === 'posted' && e._outstanding > 0 && isAdmin && <button className="prl-btn-ghost" onClick={() => openSettle(e)} title="Record payment"><Banknote size={14} /></button>}
                      {e.status === 'posted' && isAdmin && <button className="prl-btn-danger-ghost" onClick={() => setConfirm({ message: `Reverse ${e.expense_no}? A reversing journal entry will be posted and the expense returns to Approved.`, action: () => reverseExpense(e) })} title="Reverse"><XCircle size={14} /></button>}
                      <button className="prl-btn-ghost" onClick={() => setView(e.id)}><Eye size={14} /></button>
                    </td>
                  </tr>
                ))}
                {expenseList.length === 0 && <tr><td colSpan={12} className="prl-norows">No expenses match.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ REPORTS ═══ */}
      {tab === 'reports' && d && (
        <div className="prl-section">
          <div className="prl-toolbar">
            <div className="prl-toolbar-left">
              <Filter size={15} style={{ color: '#6b7280' }} />
              <select className="prl-select" value={repFilter.period} onChange={(e) => setRepFilter({ ...repFilter, period: e.target.value })}>
                <option value="">All periods</option>
                <option value={String(currentYear)}>{currentYear}</option>
                <option value={String(currentYear - 1)}>{currentYear - 1}</option>
              </select>
              <select className="prl-select" value={repFilter.status} onChange={(e) => setRepFilter({ ...repFilter, status: e.target.value })}>
                <option value="">All workflow statuses</option>
                {EXPENSE_STATUSES.filter((s) => !['draft', 'rejected', 'cancelled'].includes(s.value)).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select className="prl-select" value={repFilter.method} onChange={(e) => setRepFilter({ ...repFilter, method: e.target.value })}>
                <option value="">All payment methods</option>
                {EXPENSE_PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select className="prl-select" value={repFilter.category} onChange={(e) => setRepFilter({ ...repFilter, category: e.target.value })}>
                <option value="">All categories</option>
                {reportCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="prl-select" value={repFilter.department} onChange={(e) => setRepFilter({ ...repFilter, department: e.target.value })}>
                <option value="">All departments</option>
                {reportDeptOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="prl-select" value={repFilter.cost_centre} onChange={(e) => setRepFilter({ ...repFilter, cost_centre: e.target.value })}>
                <option value="">All cost centres</option>
                {reportCentreOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {reportData ? (
            <>
              <div className="prl-stats">
                {[
                  { label: 'Expenses in selection', value: fmt(reportData.byCategory.reduce((s, c) => s + c.value, 0)), color: '#2563eb', icon: <Receipt size={18} /> },
                  { label: 'Paid', value: fmt(reportData.paidTotal), color: '#16a34a', icon: <HandCoins size={18} /> },
                  { label: 'Outstanding', value: fmt(reportData.outstandingTotal), color: '#dc2626', icon: <AlertTriangle size={18} /> },
                  { label: 'Pending approval', value: reportData.pendingCount, color: '#d97706', icon: <Send size={18} /> },
                  { label: 'Approved', value: reportData.approvedCount, color: '#7c3aed', icon: <UserCheck size={18} /> },
                  { label: 'Posted to GL', value: reportData.postedCount, color: '#0f766e', icon: <Columns3 size={18} /> },
                ].map((s) => (
                  <div className="prl-stat" key={s.label}>
                    <p>{s.label}</p>
                    <strong style={{ color: s.color }}>{s.value}</strong>
                  </div>
                ))}
              </div>

              <div className="exp-reports-grid">
                <div className="prl-card exp-report-card">
                  <div className="exp-report-head">
                    <h4>Expenses by Category</h4>
                    <button className="prl-btn-secondary" onClick={() => reportExport('expenses_by_category.csv', [['Category', 'Amount'], ...reportData.byCategory.map((r) => [r.label, r.value])].map((r) => r.join(',')).join('\n'))}><Download size={13} /> CSV</button>
                  </div>
                  <ReportTable data={reportData.byCategory} />
                </div>

                <div className="prl-card exp-report-card">
                  <div className="exp-report-head">
                    <h4>Top Expense Categories</h4>
                    <p className="exp-report-note">Largest spend categories in the selection.</p>
                  </div>
                  <div className="exp-trend-grid">
                    {reportData.topCategories.map((c) => {
                      const max = reportData.topCategories[0]?.value || 1
                      return (
                        <div className="exp-trend-cell" key={c.label} title={`${c.label}: ${fmt(c.value)}`}>
                          <span>{c.label.length > 16 ? c.label.slice(0, 15) + '…' : c.label}</span>
                          <strong>{fmt(c.value)}</strong>
                          <div className="bar"><div style={{ width: `${(c.value / max) * 100}%` }} /></div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="prl-card exp-report-card">
                  <div className="exp-report-head">
                    <h4>Expenses by Department</h4>
                    <button className="prl-btn-secondary" onClick={() => reportExport('expenses_by_department.csv', [['Department', 'Amount'], ...reportData.byDepartment.map((r) => [r.label, r.value])].map((r) => r.join(',')).join('\n'))}><Download size={13} /> CSV</button>
                  </div>
                  <ReportTable data={reportData.byDepartment} />
                </div>

                <div className="prl-card exp-report-card">
                  <div className="exp-report-head">
                    <h4>Expenses by Cost Centre</h4>
                    <button className="prl-btn-secondary" onClick={() => reportExport('expenses_by_cost_centre.csv', [['Cost Centre', 'Amount'], ...reportData.byCostCentre.map((r) => [r.label, r.value])].map((r) => r.join(',')).join('\n'))}><Download size={13} /> CSV</button>
                  </div>
                  <ReportTable data={reportData.byCostCentre} />
                </div>

                <div className="prl-card exp-report-card">
                  <div className="exp-report-head">
                    <h4>Expenses by Payment Method</h4>
                    <button className="prl-btn-secondary" onClick={() => reportExport('expenses_by_method.csv', [['Method', 'Paid'], ...reportData.byMethod.map((r) => [r.label, r.value])].map((r) => r.join(',')).join('\n'))}><Download size={13} /> CSV</button>
                  </div>
                  <ReportTable data={reportData.byMethod} />
                </div>

                <div className="prl-card exp-report-card">
                  <div className="exp-report-head">
                    <h4>Monthly Expense Trend</h4>
                    <button className="prl-btn-secondary" onClick={() => reportExport('expenses_monthly_trend.csv', [['Month', 'Amount'], ...reportData.byMonth.map((r) => [r.label, r.value])].map((r) => r.join(',')).join('\n'))}><Download size={13} /> CSV</button>
                  </div>
                  <div className="exp-trend-grid">
                    {reportData.byMonth.map((m) => {
                      const max = reportData.byMonth.reduce((s, x) => Math.max(s, x.value), 1)
                      return (
                        <div className="exp-trend-cell" key={m.label}>
                          <span>{m.label}</span>
                          <strong>{fmt(m.value)}</strong>
                          <div className="bar"><div style={{ width: `${(m.value / max) * 100}%` }} /></div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="prl-card exp-report-card">
                  <div className="exp-report-head"><h4>Paid vs Unpaid</h4></div>
                  <div className="ap-ageing">
                    <div className="ap-age-row">
                      <span className="ap-age-label">Paid</span>
                      <div className="ap-age-bar"><div style={{ width: `${reportData.paidTotal + reportData.outstandingTotal > 0 ? (reportData.paidTotal / (reportData.paidTotal + reportData.outstandingTotal)) * 100 : 0}%`, background: '#16a34a' }} /></div>
                      <span className="ap-age-val">{fmt(reportData.paidTotal)}</span>
                    </div>
                    <div className="ap-age-row">
                      <span className="ap-age-label">Unpaid</span>
                      <div className="ap-age-bar"><div style={{ width: `${reportData.paidTotal + reportData.outstandingTotal > 0 ? (reportData.outstandingTotal / (reportData.paidTotal + reportData.outstandingTotal)) * 100 : 0}%`, background: '#dc2626' }} /></div>
                      <span className="ap-age-val">{fmt(reportData.outstandingTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="prl-norows">No expenses match the current report filters.</p>
          )}
        </div>
      )}

      {/* ═══ Record / Edit Expense Modal ═══ */}
      {expenseModal && (
        <div className="prl-modal-overlay" onClick={() => setExpenseModal(false)}>
          <div className="prl-modal prl-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head">
              <h3>{editExpenseId ? `Edit ${expenseForm.expense_no}` : 'Record Expense'}</h3>
              <button className="prl-btn-icon" onClick={() => setExpenseModal(false)}><X size={16} /></button>
            </div>

            <div className="prl-form-grid">
              <label className="prl-field"><span>Expense No. (auto)</span><input value={expenseForm.expense_no} disabled /></label>
              <label className="prl-field"><span>Expense Date *</span><input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} /></label>
            </div>

            <div className="ap-lines-head"><strong>Payee</strong></div>
            <div className="prl-form-grid">
              <label className="prl-field prl-field-full"><span>Payee Type (optional — not every direct expense has a supplier)</span>
                <div className="exp-payee">
                  {EXPENSE_PAYEE_TYPES.map((t) => (
                    <button key={t.value} className={`${expenseForm.payee_type === t.value ? 'active' : ''}`} onClick={() => setExpenseForm({ ...expenseForm, payee_type: t.value, supplier_id: '', payee_name: '' })}>
                      {t.value === 'staff' ? <User size={14} /> : t.value === 'supplier' ? <Building2 size={14} /> : t.value === 'cash' ? <Banknote size={14} /> : <Wallet size={14} />}
                      {t.label}
                    </button>
                  ))}
                </div>
              </label>
              {expenseForm.payee_type === 'supplier' ? (
                <label className="prl-field prl-field-full"><span>Supplier / Payee *</span>
                  <select value={expenseForm.supplier_id} onChange={(e) => setExpenseForm({ ...expenseForm, supplier_id: e.target.value })}>
                    <option value="">Select supplier...</option>
                    {(d?.suppliers || []).filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <p className="prl-hint">A supplier credit purchase belongs in Accounts Payable — use Expenses only for direct cash purchases from a supplier.</p>
                </label>
              ) : expenseForm.payee_type === 'cash' ? (
                <p className="prl-hint" style={{ gridColumn: '1 / -1', padding: '0 18px' }}>Cash purchase — no formal supplier recorded.</p>
              ) : (
                <label className="prl-field prl-field-full"><span>Payee Name *</span><input value={expenseForm.payee_name} onChange={(e) => setExpenseForm({ ...expenseForm, payee_name: e.target.value })} /></label>
              )}
              <label className="prl-field"><span>Department</span><input value={expenseForm.department} onChange={(e) => setExpenseForm({ ...expenseForm, department: e.target.value })} /></label>
              <label className="prl-field"><span>Cost Centre</span><input value={expenseForm.cost_centre} onChange={(e) => setExpenseForm({ ...expenseForm, cost_centre: e.target.value })} /></label>
              <label className="prl-field prl-field-full"><span>Description</span><input value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} /></label>
            </div>

            <div className="ap-lines-head">
              <strong>Expense Line Items</strong>
              <button className="prl-btn-ghost" onClick={() => setExpenseLines([...expenseLines, blankLine()])}><Plus size={13} /> Add Expense Line</button>
            </div>
            <div className="prl-card" style={{ margin: '0 18px 6px', borderRadius: 10 }}>
              <table className="prl-table" style={{ minWidth: 760 }}>
                <thead>
                  <tr><th>Expense Account *</th><th>Description</th><th style={{ width: 100 }}>Amount (KES)</th><th>Department</th><th>Cost Centre</th><th></th></tr>
                </thead>
                <tbody>
                  {expenseLines.map((l, i) => (
                    <tr key={i}>
                      <td style={{ minWidth: 220 }}>
                        <select className="ap-line-input" value={l.account_id} onChange={(e) => setExpenseLines(expenseLines.map((x, j) => j === i ? { ...x, account_id: e.target.value } : x))}>
                          <option value="">Select expense account...</option>
                          {(apDebitAccountOptions(d?.accounts, expenseLines.map((l) => l.account_id))).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                        </select>
                      </td>
                      <td><input className="ap-line-input" value={l.description} onChange={(e) => setExpenseLines(expenseLines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} /></td>
                      <td><input className="ap-line-input" type="number" min="0" value={l.amount} onChange={(e) => setExpenseLines(expenseLines.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} /></td>
                      <td><input className="ap-line-input" value={l.department} onChange={(e) => setExpenseLines(expenseLines.map((x, j) => j === i ? { ...x, department: e.target.value } : x))} /></td>
                      <td><input className="ap-line-input" value={l.cost_centre} onChange={(e) => setExpenseLines(expenseLines.map((x, j) => j === i ? { ...x, cost_centre: e.target.value } : x))} /></td>
                      <td><button className="prl-btn-danger-ghost" onClick={() => setExpenseLines(expenseLines.filter((_, j) => j !== i))}><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                  {expenseLines.length === 0 && <tr><td colSpan={6} className="prl-norows">No lines — add one.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="ap-totals">
              <div><span>Subtotal</span><strong>{fmt(totals.subtotal)}</strong></div>
              <div className="ap-totals-grand"><span>Total</span><strong>{fmt(totals.total_amount)}</strong></div>
            </div>

            <div className="ap-lines-head"><strong>Payment Information</strong></div>
            <div className="prl-form-grid">
              <label className="prl-field prl-field-full"><span>Payment Status</span>
                <div className="exp-paystatus">
                  {EXPENSE_PAYMENT_STATUSES.map((s) => (
                    <button key={s.value} data-v={s.value} className={`${expenseForm.payment_status === s.value ? 'active' : ''}`}
                      onClick={() => setExpenseForm({ ...expenseForm, payment_status: s.value, paid_amount: s.value === 'paid' ? String(totals.total_amount) : expenseForm.paid_amount })}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </label>

              {expenseForm.payment_status === 'unpaid' ? (
                <p className="prl-hint" style={{ gridColumn: '1 / -1', padding: '0 18px' }}>
                  Unpaid expense — it will be accrued in the General Ledger at posting (Dr Expense / Cr Accrued Expenses). The payment is recorded separately afterwards and will never be treated as a bank payment.
                </p>
              ) : (
                <>
                  <label className="prl-field prl-field-full"><span>Payment Method</span>
                    <div className="exp-method">
                      {EXPENSE_PAYMENT_METHODS.map((m) => (
                        <button key={m.value} className={`${expenseForm.payment_method === m.value ? 'active' : ''}`} onClick={() => changePaymentMethod(m.value)}>
                          {m.value === 'cash' ? <Banknote size={14} /> : m.value === 'bank' ? <Landmark size={14} /> : <Smartphone size={14} />}
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="prl-field prl-field-full"><span>Payment Account *</span>
                    <select value={expenseForm.payment_account_id} onChange={(e) => setExpenseForm({ ...expenseForm, payment_account_id: e.target.value })}>
                      <option value="">Select {expenseForm.payment_method} account...</option>
                      {payAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                  </label>
                  <label className="prl-field"><span>Payment Reference *</span><input placeholder="Receipt / M-Pesa ref / cheque no." value={expenseForm.payment_reference} onChange={(e) => setExpenseForm({ ...expenseForm, payment_reference: e.target.value })} /></label>
                  <label className="prl-field"><span>Payment Date *</span><input type="date" value={expenseForm.payment_date} onChange={(e) => setExpenseForm({ ...expenseForm, payment_date: e.target.value })} /></label>
                  {expenseForm.payment_status === 'partially_paid' && (
                    <label className="prl-field"><span>Amount Paid (KES)</span><input type="number" min="0" value={expenseForm.paid_amount} onChange={(e) => setExpenseForm({ ...expenseForm, paid_amount: e.target.value })} /></label>
                  )}
                </>
              )}
            </div>
            {expenseForm.payment_status !== 'unpaid' && (
              <div className={`exp-balance ${balance > 0 ? 'exp-balance-warn' : 'exp-balance-ok'}`}>
                <div><span>Amount Paid</span><strong>{fmt(expenseForm.payment_status === 'paid' ? totals.total_amount : (Number(expenseForm.paid_amount) || 0))}</strong></div>
                <div className="exp-balance-grand"><span>Balance</span><strong>{fmt(balance)}</strong></div>
              </div>
            )}
            <p className="prl-hint" style={{ padding: '0 18px' }}>Draft, submitted and reviewed expenses never touch the General Ledger. A GL entry is created only when an approved expense is posted.</p>

            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setExpenseModal(false)}>Cancel</button>
              <button className="prl-btn-primary" disabled={saving} onClick={saveExpense}>{saving ? 'Saving...' : editExpenseId ? 'Save Changes' : 'Save Draft'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Settlement Modal ═══ */}
      {settle && (
        <div className="prl-modal-overlay" onClick={() => setSettle(null)}>
          <div className="prl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head">
              <h3>Record Payment — {settle.expense_no}</h3>
              <button className="prl-btn-icon" onClick={() => setSettle(null)}><X size={16} /></button>
            </div>
            <div className="prl-form-grid">
              <p className="prl-hint" style={{ gridColumn: '1 / -1', padding: '0 18px' }}>
                Settles the accrued balance: <strong>{fmt(expenseOutstanding(settle))}</strong>. Posts Dr Accrued Expenses / Cr Bank-Cash-M-Pesa through the General Ledger.
              </p>
              <label className="prl-field prl-field-full"><span>Payment Method</span>
                <div className="exp-method">
                  {EXPENSE_PAYMENT_METHODS.map((m) => (
                    <button key={m.value} className={`${settleForm.method === m.value ? 'active' : ''}`}
                      onClick={() => {
                        const valid = paymentAccountsFor(d?.accounts || [], m.value)
                        setSettleForm({ ...settleForm, method: m.value, account_id: valid[0]?.id || '' })
                      }}>
                      {m.value === 'cash' ? <Banknote size={14} /> : m.value === 'bank' ? <Landmark size={14} /> : <Smartphone size={14} />}
                      {m.label}
                    </button>
                  ))}
                </div>
              </label>
              <label className="prl-field prl-field-full"><span>Payment Account *</span>
                <select value={settleForm.account_id} onChange={(e) => setSettleForm({ ...settleForm, account_id: e.target.value })}>
                  <option value="">Select {settleForm.method} account...</option>
                  {paymentAccountsFor(d?.accounts || [], settleForm.method).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </label>
              <label className="prl-field"><span>Payment Reference *</span><input placeholder="Receipt / M-Pesa ref / cheque no." value={settleForm.reference} onChange={(e) => setSettleForm({ ...settleForm, reference: e.target.value })} /></label>
              <label className="prl-field"><span>Payment Date</span><input type="date" value={settleForm.date} onChange={(e) => setSettleForm({ ...settleForm, date: e.target.value })} /></label>
              <label className="prl-field prl-field-full"><span>Amount (KES) *</span><input type="number" min="0" max={expenseOutstanding(settle)} value={settleForm.amount} onChange={(e) => setSettleForm({ ...settleForm, amount: e.target.value })} /></label>
            </div>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setSettle(null)}>Cancel</button>
              <button className="prl-btn-primary" disabled={saving} onClick={saveSettlement}>{saving ? 'Posting...' : 'Post Payment to GL'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Reject Modal ═══ */}
      {rejectTarget && (
        <div className="prl-modal-overlay" onClick={() => setRejectTarget(null)}>
          <div className="prl-modal prl-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head"><h3>Reject Expense</h3><button className="prl-btn-icon" onClick={() => setRejectTarget(null)}><X size={16} /></button></div>
            <div className="prl-form-grid">
              <label className="prl-field prl-field-full"><span>Reason *</span><textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} /></label>
            </div>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
              <button className="prl-btn-danger" onClick={confirmReject}>Reject Expense</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Confirm Modal ═══ */}
      {confirm && (
        <div className="prl-modal-overlay" onClick={() => setConfirm(null)}>
          <div className="prl-modal prl-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head"><h3>Confirm</h3><button className="prl-btn-icon" onClick={() => setConfirm(null)}><X size={16} /></button></div>
            <p className="prl-confirm-msg">{confirm.message}</p>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="prl-btn-danger" onClick={() => { const a = confirm.action; setConfirm(null); a() }}>Yes, proceed</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ View / Detail Modal ═══ */}
      {view && d && (() => {
        const exp = (d.expenses || []).find((e) => e.id === view)
        if (!exp) return null
        const lines = expenseLinesOf(d, exp.id)
        const outstanding = expenseOutstanding(exp)
        const canEdit = ['draft', 'submitted', 'reviewed', 'rejected'].includes(exp.status)
        return (
          <div className="prl-modal-overlay" onClick={() => setView(null)}>
            <div className="prl-modal prl-modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="prl-modal-head">
                <h3>Expense {exp.expense_no} <span className="ap-badge" style={{ background: expStatus(exp.status).color + '1a', color: expStatus(exp.status).color }}>{expStatus(exp.status).label}</span> <span className="ap-badge" style={{ background: payStatus(exp.payment_status).color + '1a', color: payStatus(exp.payment_status).color }}>{payStatus(exp.payment_status).label}</span></h3>
                <button className="prl-btn-icon" onClick={() => setView(null)}><X size={16} /></button>
              </div>
              <div className="prl-detail-grid">
                <div className="prl-detail-card">
                  <h4>Expense</h4>
                  <div className="prl-detail-item"><span>Date</span><strong>{fmtDate(exp.expense_date)}</strong></div>
                  <div className="prl-detail-item"><span>Payee</span><strong>{payeeOf(d, exp)}</strong></div>
                  <div className="prl-detail-item"><span>Payee Type</span><strong className="prl-cap">{EXPENSE_PAYEE_TYPES.find((t) => t.value === exp.payee_type)?.label || exp.payee_type}</strong></div>
                  <div className="prl-detail-item"><span>Department</span><strong>{exp.department || '—'}</strong></div>
                  <div className="prl-detail-item"><span>Cost Centre</span><strong>{exp.cost_centre || '—'}</strong></div>
                  <div className="prl-detail-item"><span>Description</span><strong>{exp.description || '—'}</strong></div>
                </div>
                <div className="prl-detail-card">
                  <h4>Payment</h4>
                  <div className="prl-detail-item"><span>Method</span><strong className="prl-cap">{exp.payment_method || '—'}</strong></div>
                  <div className="prl-detail-item"><span>Account</span><strong>{accountName(exp.payment_account_id)}</strong></div>
                  <div className="prl-detail-item"><span>Reference</span><strong>{exp.payment_reference || '—'}</strong></div>
                  <div className="prl-detail-item"><span>Payment Date</span><strong>{exp.payment_date ? fmtDate(exp.payment_date) : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Paid</span><strong style={{ color: '#16a34a' }}>{fmt(exp.paid_amount)}</strong></div>
                  <div className="prl-detail-item"><span>Outstanding</span><strong style={{ color: outstanding > 0 ? '#dc2626' : '#16a34a' }}>{fmt(outstanding)}</strong></div>
                </div>
                <div className="prl-detail-card">
                  <h4>Approval Trail</h4>
                  <div className="prl-detail-item"><span>Created</span><strong>{d?.nameOf[exp.created_by] || '—'}{exp.created_at ? ` · ${fmtDateTime(exp.created_at)}` : ''}</strong></div>
                  <div className="prl-detail-item"><span>Submitted</span><strong>{exp.submitted_at ? `${d?.nameOf[exp.submitted_by] || '—'} · ${fmtDateTime(exp.submitted_at)}` : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Reviewed</span><strong>{exp.reviewed_at ? `${d?.nameOf[exp.reviewed_by] || '—'} · ${fmtDateTime(exp.reviewed_at)}` : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Approved</span><strong>{exp.approved_at ? `${d?.nameOf[exp.approved_by] || '—'} · ${fmtDateTime(exp.approved_at)}` : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Paid</span><strong>{exp.paid_at ? `${d?.nameOf[exp.paid_by] || '—'} · ${fmtDateTime(exp.paid_at)}` : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Rejected</span><strong style={exp.rejected_at ? { color: '#dc2626' } : undefined}>{exp.rejected_at ? `${d?.nameOf[exp.rejected_by] || '—'} · ${fmtDateTime(exp.rejected_at)}${exp.rejection_reason ? ` — ${exp.rejection_reason}` : ''}` : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Posted</span><strong>{exp.posted_at ? `${d?.nameOf[exp.posted_by] || '—'} · ${fmtDateTime(exp.posted_at)}` : '—'}</strong></div>
                </div>
              </div>
              <div className="prl-card" style={{ margin: '0 18px 12px' }}>
                <h4 className="ap-card-title">Line Items</h4>
                <table className="prl-table" style={{ minWidth: 520 }}>
                  <thead><tr><th>Expense Account</th><th>Description</th><th>Department</th><th>Cost Centre</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i}>
                        <td>{accountName(l.account_id)}</td>
                        <td>{l.description}</td>
                        <td>{l.department || '—'}</td>
                        <td>{l.cost_centre || '—'}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{fmt(l.amount)}</td>
                      </tr>
                    ))}
                    {lines.length === 0 && <tr><td colSpan={5} className="prl-norows">No line items.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="prl-card" style={{ margin: '0 18px 12px' }}>
                <h4 className="ap-card-title">General Ledger</h4>
                <div className="prl-detail-item"><span>GL Status</span><strong><GlBadge exp={exp} /></strong></div>
                {exp.journal_entry_id && (
                  <>
                    <div className="prl-detail-item"><span>Journal Entry</span><strong className="prl-mono">{jeNos[exp.journal_entry_id] || exp.journal_entry_id}</strong></div>
                    <div className="prl-detail-item"><span>Posted</span><strong>{exp.posted_at ? fmtDateTime(exp.posted_at) : '—'}</strong></div>
                  </>
                )}
                {exp.settlement_journal_id && (
                  <div className="prl-detail-item"><span>Settlement Entry</span><strong className="prl-mono">{jeNos[exp.settlement_journal_id] || exp.settlement_journal_id}</strong></div>
                )}
                {!exp.journal_entry_id && <p className="prl-hint">Not yet posted. Posting is only allowed once the expense is approved — draft and submitted expenses never touch the GL.</p>}
              </div>
              <div className="prl-card" style={{ margin: '0 18px 12px' }}>
                <Attachments id={exp.id} />
              </div>
              <div className="prl-modal-foot">
                {canEdit && <button className="prl-btn-secondary" onClick={() => { setView(null); openExpense(exp) }}><Pencil size={14} /> Edit</button>}
                {exp.status === 'posted' && outstanding > 0 && isAdmin && <button className="prl-btn-secondary" onClick={() => { setView(null); openSettle(exp) }}><Banknote size={14} /> Record Payment</button>}
                <button className="prl-btn-secondary" onClick={() => setView(null)}>Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onAttachFile} />
      {toast && <div className={`prl-toast ${toast.ok ? '' : 'error'}`}>{toast.msg}</div>}
    </div>
  )
}
