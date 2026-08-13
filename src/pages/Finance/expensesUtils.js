// ─── Direct Expenses utilities ───────────────────────────────────────────
// Operational expenses that are NOT supplier credit (→ AP), salaries (→ Payroll)
// or capital purchases (→ Fixed Assets). Everything posts through the EXISTING
// accounting engine (postToJournal, source = 'expenses') — no duplicate ledger.
//
// GL rule (exactly once, only after approval):
//   Paid immediately  : Dr Expense line(s)         | Cr Bank/Cash/M-Pesa
//   Approved but unpaid: Dr Expense line(s)        | Cr Accrued Expenses (2020)
//   Later settlement  : Dr Accrued Expenses        | Cr Bank/Cash/M-Pesa
// The paid portion is always credited to the payment account; the unpaid
// remainder is accrued rather than silently treated as a bank payment.

import { ensureAccounts, postToJournal, writeAudit } from './accountsUtils'

// ─── Constants ──────────────────────────────────────────────────────────

export const EXPENSE_STATUSES = [
  { value: 'draft',      label: 'Draft',      color: '#64748b' },
  { value: 'submitted',  label: 'Submitted',  color: '#2563eb' },
  { value: 'reviewed',   label: 'Reviewed',   color: '#7c3aed' },
  { value: 'approved',   label: 'Approved',   color: '#d97706' },
  { value: 'paid',       label: 'Paid',       color: '#16a34a' },
  { value: 'posted',     label: 'Posted',     color: '#0f766e' },
  { value: 'rejected',   label: 'Rejected',   color: '#dc2626' },
  { value: 'cancelled',  label: 'Cancelled',  color: '#dc2626' },
]

export const EXPENSE_PAYMENT_STATUSES = [
  { value: 'unpaid',         label: 'Unpaid',         color: '#dc2626' },
  { value: 'partially_paid', label: 'Partially Paid', color: '#ca8a04' },
  { value: 'paid',           label: 'Paid',           color: '#16a34a' },
]

export const EXPENSE_PAYEE_TYPES = [
  { value: 'staff',     label: 'Staff member' },
  { value: 'supplier',  label: 'Supplier' },
  { value: 'other',     label: 'Other payee' },
  { value: 'cash',      label: 'Cash purchase' },
]

export const EXPENSE_PAYMENT_METHODS = [
  { value: 'cash',   label: 'Cash' },
  { value: 'bank',   label: 'Bank' },
  { value: 'mobile', label: 'Mobile Money' },
]

// Accrual account used for the unpaid portion of an approved direct expense.
export const EXPENSE_ACCRUAL_CODE = '2020'

// Only real expense accounts may appear on expense lines.
export const EXPENSE_ACCOUNT_TYPES = ['expense']

export const expStatus = (s) => EXPENSE_STATUSES.find((x) => x.value === s) || EXPENSE_STATUSES[0]
export const payStatus = (s) => EXPENSE_PAYMENT_STATUSES.find((x) => x.value === s) || EXPENSE_PAYMENT_STATUSES[0]

const toNum = (n) => Number(n || 0)
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100

// ─── Number helpers ────────────────────────────────────────────────────────

// EXP-2026-00001, EXP-2026-00002 ... (per-year, auto, never duplicated).
export async function nextExpenseNo(supabase, schoolId, year = new Date().getFullYear()) {
  const prefix = `EXP-${year}-`
  const { data } = await supabase
    .from('expenses').select('expense_no').eq('school_id', schoolId)
    .order('created_at', { ascending: false }).limit(1)
  let seq = 1
  if (data?.length && data[0].expense_no?.startsWith(prefix)) {
    seq = parseInt(data[0].expense_no.split('-').pop()) + 1
  }
  return `${prefix}${String(seq).padStart(5, '0')}`
}

// ─── Expense math ──────────────────────────────────────────────────────────

export function expenseTotals(lines) {
  const subtotal = round2((lines || []).reduce((s, l) => s + Math.max(toNum(l.amount), 0), 0))
  return { subtotal, total_amount: subtotal }
}

export const expenseOutstanding = (exp) => Math.max(round2(toNum(exp?.total_amount) - toNum(exp?.paid_amount)), 0)

// ─── Account dropdown filtering ───────────────────────────────────────────

// Payment accounts must be Cash & Bank accounts appropriate to the method:
// Cash → cash accounts only · Bank → bank accounts only · Mobile → M-Pesa only.
export function paymentAccountsFor(accounts, method) {
  const list = accounts || []
  return list.filter((a) => {
    if (a.type !== 'asset' || a.category !== 'Cash & Bank') return false
    const code = a.code || ''
    const name = (a.name || '').toLowerCase()
    if (method === 'cash') return code === '1010' || /petty|(^|\b)cash(\b|$)/.test(name)
    if (method === 'mobile') return code === '1030' || /mobile|mpesa|m-pesa/.test(name)
    if (method === 'bank') return code === '1020' || code === '1040' || (/bank/.test(name) && !/cash|petty/.test(name))
    return false
  })
}

// ─── Data loading ──────────────────────────────────────────────────────────

export async function loadExpensesData(supabase, schoolId) {
  const [expRes, lineRes, accRes, supRes, profRes, attRes] = await Promise.all([
    supabase.from('expenses').select('*').eq('school_id', schoolId).order('expense_date', { ascending: false }),
    supabase.from('expense_lines').select('*').eq('school_id', schoolId),
    supabase.from('chart_of_accounts').select('*').eq('school_id', schoolId).order('code'),
    supabase.from('ap_suppliers').select('*').eq('school_id', schoolId).order('created_at', { ascending: true }),
    supabase.from('profiles').select('id, full_name, role').eq('school_id', schoolId),
    supabase.from('finance_attachments').select('*').eq('school_id', schoolId),
  ])
  const accountOf = Object.fromEntries((accRes.data || []).map((a) => [a.id, a]))
  const nameOf = Object.fromEntries((profRes.data || []).map((p) => [p.id, p.full_name]))
  return {
    expenses: expRes.data || [],
    lines: lineRes.data || [],
    accounts: accRes.data || [],
    accountOf,
    suppliers: supRes.data || [],
    profiles: profRes.data || [],
    nameOf,
    attachments: attRes.data || [],
  }
}

export const expenseLinesOf = (d, expenseId) => (d.lines || []).filter((l) => l.expense_id === expenseId)
export const expenseAttachmentsOf = (d, expenseId) => (d.attachments || []).filter((a) => a.entity_type === 'expense' && a.entity_id === expenseId)

export const payeeOf = (d, exp) => {
  if (exp.supplier_id) return (d.suppliers || []).find((s) => s.id === exp.supplier_id)?.name || '—'
  return exp.payee_name || '—'
}

// First line's expense account = the "category" shown in the expense table.
export const categoryOf = (d, exp) => {
  const line = expenseLinesOf(d, exp.id)[0]
  return line?.account_id ? d.accountOf?.[line.account_id] : null
}

// ─── GL posting (exactly once, only after approval) ────────────────────────

export async function postExpenseJournal(supabase, { schoolId, userId, expense, lines, payeeName, entryDate }) {
  if (expense.journal_entry_id) throw new Error('Expense already posted to General Ledger.')
  if (!['approved', 'paid'].includes(expense.status)) throw new Error('Expense must be approved before it can be posted to the General Ledger.')

  const total = toNum(expense.total_amount)
  const paid = Math.min(toNum(expense.paid_amount), total)
  const unpaid = round2(total - paid)

  const journalLines = (lines || []).map((l) => ({
    account_id: l.account_id,
    debit: round2(toNum(l.amount)),
    credit: 0,
    notes: l.description || 'Expense line',
  }))

  if (paid > 0.005) {
    const payAcc = await supabase.from('chart_of_accounts').select('*').eq('id', expense.payment_account_id).single()
    if (payAcc.error) throw new Error('Payment account not found in the chart')
    journalLines.push({
      account_id: payAcc.data.id, debit: 0, credit: paid,
      notes: `Payment — ${expense.payment_reference || expense.payment_method || ''}`.trim(),
    })
  }

  if (unpaid > 0.005) {
    await ensureAccounts(supabase, schoolId, [EXPENSE_ACCRUAL_CODE])
    const { data: accrual } = await supabase.from('chart_of_accounts').select('*').eq('school_id', schoolId).eq('code', EXPENSE_ACCRUAL_CODE).single()
    if (!accrual) throw new Error(`Accrual account (${EXPENSE_ACCRUAL_CODE}) not found in the chart`)
    journalLines.push({ account_id: accrual.id, debit: 0, credit: unpaid, notes: 'Accrued expense — unpaid balance' })
  }

  const je = await postToJournal(supabase, {
    schoolId, userId,
    entry_date: entryDate || expense.expense_date,
    description: `Expense ${expense.expense_no} — ${payeeName || ''}`.trim(),
    source: 'expenses', reference_type: 'expense', reference_id: expense.id,
    lines: journalLines,
  })
  await writeAudit(supabase, { schoolId, action: 'expense_posted', details: { expense_id: expense.id, expense_no: expense.expense_no, journal_id: je.id, amount: total } })
  return je
}

// Settle the outstanding balance of an already-posted expense.
//   Dr Accrued Expenses | Cr Bank/Cash/M-Pesa (new journal, no duplication)
export async function postExpenseSettlement(supabase, { schoolId, userId, expense, paymentAccountId, amount, reference, paymentDate, entryDate }) {
  if (!expense.journal_entry_id) throw new Error('Expense must be posted to the General Ledger before recording a payment.')
  const outstanding = expenseOutstanding(expense)
  const amt = Math.min(toNum(amount), outstanding)
  if (amt <= 0) throw new Error('Enter a valid payment amount.')

  await ensureAccounts(supabase, schoolId, [EXPENSE_ACCRUAL_CODE])
  const { data: accrual } = await supabase.from('chart_of_accounts').select('*').eq('school_id', schoolId).eq('code', EXPENSE_ACCRUAL_CODE).single()
  if (!accrual) throw new Error(`Accrual account (${EXPENSE_ACCRUAL_CODE}) not found in the chart`)
  const payAcc = await supabase.from('chart_of_accounts').select('*').eq('id', paymentAccountId).single()
  if (payAcc.error) throw new Error('Payment account not found in the chart')

  const je = await postToJournal(supabase, {
    schoolId, userId,
    entry_date: entryDate || paymentDate || new Date().toISOString().split('T')[0],
    description: `Expense ${expense.expense_no} — settlement of unpaid balance`,
    source: 'expenses', reference_type: 'expense', reference_id: expense.id,
    lines: [
      { account_id: accrual.id, debit: amt, credit: 0, notes: `Settlement — ${reference || paymentDate || ''}`.trim() },
      { account_id: payAcc.data.id, debit: 0, credit: amt, notes: `Settlement via ${reference || 'payment'}`.trim() },
    ],
  })

  const newPaid = round2(toNum(expense.paid_amount) + amt)
  const payStatusVal = newPaid >= toNum(expense.total_amount) - 0.01 ? 'paid' : 'partially_paid'
  const { error } = await supabase.from('expenses').update({
    paid_amount: newPaid,
    payment_status: payStatusVal,
    settlement_journal_id: je.id,
    updated_at: new Date().toISOString(),
  }).eq('id', expense.id)
  if (error) throw error

  await writeAudit(supabase, { schoolId, action: 'expense_payment_recorded', details: { expense_id: expense.id, expense_no: expense.expense_no, journal_id: je.id, amount: amt } })
  return je
}

// ─── Dashboard summary ─────────────────────────────────────────────────────

export function expenseSummary(expenses, { year } = {}) {
  const period = (expenses || []).filter((e) => !year || String(new Date(e.expense_date).getFullYear()) === String(year))
  const active = period.filter((e) => !['draft', 'rejected', 'cancelled'].includes(e.status))
  const totalPeriod = round2(active.reduce((s, e) => s + toNum(e.total_amount), 0))
  const pendingApproval = active.filter((e) => ['submitted', 'reviewed'].includes(e.status)).length
  const approved = active.filter((e) => ['approved', 'paid'].includes(e.status)).length
  const paid = round2(active.filter((e) => ['posted'].includes(e.status) || e.payment_status === 'paid').reduce((s, e) => s + toNum(e.paid_amount), 0))
  const outstanding = round2(active.filter((e) => ['approved', 'paid', 'posted'].includes(e.status)).reduce((s, e) => s + expenseOutstanding(e), 0))
  return { totalPeriod, pendingApproval, approved, paid, outstanding }
}
