// ─── Accounts Payable utilities ─────────────────────────────────────────
// Non-payroll payables: supplier invoices, direct "other" payments and the
// approval workflows that clear them. Everything posts through the EXISTING
// accounting engine (postToJournal, source = 'ap') — no duplicate ledger.
//
// GL accounts are never hard-coded: the AP control account, VAT input account
// and default bank/mobile/cash accounts come from ap_tax_config (school,
// effective-date based). Expense/asset line accounts and the disbursement
// account are chosen from the chart by the accountant at entry time.

import { ensureAccounts, postToJournal, writeAudit } from './accountsUtils'

// ─── Constants ──────────────────────────────────────────────────────────

export const AP_SUPPLIER_TYPES = [
  { value: 'supplier',       label: 'Supplier' },
  { value: 'contractor',     label: 'Contractor' },
  { value: 'service_provider', label: 'Service Provider' },
  { value: 'landlord',       label: 'Landlord' },
  { value: 'utilities',      label: 'Utilities' },
  { value: 'government',     label: 'Government Agency' },
  { value: 'other',          label: 'Other' },
]

export const AP_INVOICE_STATUSES = [
  { value: 'draft',         label: 'Draft',         color: '#64748b' },
  { value: 'submitted',     label: 'Submitted',     color: '#2563eb' },
  { value: 'reviewed',      label: 'Reviewed',      color: '#7c3aed' },
  { value: 'approved',      label: 'Approved',      color: '#d97706' },
  { value: 'posted',        label: 'Posted',        color: '#0891b2' },
  { value: 'partially_paid',label: 'Partially Paid',color: '#ca8a04' },
  { value: 'paid',          label: 'Paid',          color: '#16a34a' },
  { value: 'cancelled',     label: 'Cancelled',     color: '#dc2626' },
]

export const AP_PAYMENT_STATUSES = [
  { value: 'draft',         label: 'Draft',         color: '#64748b' },
  { value: 'submitted',     label: 'Submitted',     color: '#2563eb' },
  { value: 'reviewed',      label: 'Reviewed',      color: '#7c3aed' },
  { value: 'approved',      label: 'Approved',      color: '#d97706' },
  { value: 'processing',    label: 'Processing',    color: '#0891b2' },
  { value: 'paid',          label: 'Paid',          color: '#16a34a' },
  { value: 'posted',        label: 'Posted',        color: '#0f766e' },
  { value: 'cancelled',     label: 'Cancelled',     color: '#dc2626' },
]

export const AP_PAYMENT_METHODS = [
  { value: 'bank',   label: 'Bank Transfer' },
  { value: 'mobile', label: 'Mobile Money (M-Pesa)' },
  { value: 'cash',   label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
]

// Default ap_tax_config rows (mirrors migration 043 seed).
export const AP_DEFAULTS = [
  { item: 'vat_rate', value: { rate: 16 }, effective_from: '2026-01-01', notes: 'Value Added Tax on purchases (VAT Act 2013 as amended)' },
  {
    item: 'ap_defaults',
    value: { ap_account: '2010', vat_input_account: '2145', bank_account: '1020', mobile_account: '1030', cash_account: '1010' },
    effective_from: '2026-01-01',
    notes: 'Default GL accounts used when posting AP invoices & payments',
  },
]

export const AP_STATUS_META = { invoice: AP_INVOICE_STATUSES, payment: AP_PAYMENT_STATUSES }
export const apStatus = (list, s) => (list || AP_INVOICE_STATUSES).find((x) => x.value === s) || (list || [])[0]

const toNum = (n) => Number(n || 0)
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100

// ─── Config helpers (approved-rate workflow, mirroring payroll) ────────────

export async function ensureApDefaults(supabase, schoolId) {
  const { data } = await supabase.from('ap_tax_config').select('id').eq('school_id', schoolId).limit(1)
  if (data?.length) return
  const { error } = await supabase.from('ap_tax_config').insert(
    AP_DEFAULTS.map((d) => ({ school_id: schoolId, item: d.item, value: d.value, effective_from: d.effective_from, notes: d.notes }))
  )
  if (error) throw error
}

export async function getApConfig(supabase, schoolId) {
  await ensureApDefaults(supabase, schoolId)
  const { data, error } = await supabase
    .from('ap_tax_config').select('*').eq('school_id', schoolId).order('effective_from', { ascending: false })
  if (error) throw error
  const rows = data || []
  const approved = rows.filter((r) => r.status === 'approved')
  const latest = {}
  for (const row of approved) if (!latest[row.item]) latest[row.item] = row.value
  const vatRate = toNum(latest.vat_rate?.rate ?? 16)
  const defaults = latest.ap_defaults || AP_DEFAULTS[1].value
  return {
    vatRate,
    defaults: {
      ap_account: defaults.ap_account || '2010',
      vat_input_account: defaults.vat_input_account || '2145',
      bank_account: defaults.bank_account || '1020',
      mobile_account: defaults.mobile_account || '1030',
      cash_account: defaults.cash_account || '1010',
    },
    _rows: rows,
  }
}

export async function saveApConfig(supabase, { schoolId, userId, item, value, isAdmin }) {
  const direct = !!isAdmin
  const { error } = await supabase.from('ap_tax_config').insert({
    school_id: schoolId, item, value,
    effective_from: new Date().toISOString().split('T')[0],
    notes: `Updated ${new Date().toISOString().split('T')[0]}`,
    status: direct ? 'approved' : 'pending',
    submitted_by: direct ? null : userId,
    submitted_at: direct ? null : new Date().toISOString(),
  })
  if (error) throw error
  return direct
}

export async function decideApConfig(supabase, { userId, row, approve }) {
  const { error } = await supabase.from('ap_tax_config').update({
    status: approve ? 'approved' : 'rejected',
    effective_from: approve ? new Date().toISOString().split('T')[0] : row.effective_from,
    approved_by: userId,
    approved_at: new Date().toISOString(),
    notes: `${approve ? 'Approved' : 'Rejected'} ${new Date().toISOString().split('T')[0]} — ${row.notes || ''}`.trim(),
  }).eq('id', row.id)
  if (error) throw error
}

// ─── Number helpers ────────────────────────────────────────────────────────

async function nextNumber(supabase, schoolId, table, prefix, codeColumn) {
  const { data } = await supabase.from(table).select(codeColumn).eq('school_id', schoolId).order('created_at', { ascending: false }).limit(1)
  let seq = 1
  if (data?.length && data[0][codeColumn]?.startsWith(prefix)) seq = parseInt(data[0][codeColumn].split('-').pop()) + 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

export const nextSupplierNo = (supabase, schoolId) => nextNumber(supabase, schoolId, 'ap_suppliers', 'SUP-', 'supplier_no')
export const nextInvoiceNo = (supabase, schoolId) => nextNumber(supabase, schoolId, 'ap_invoices', 'INV-', 'invoice_no')
export const nextPaymentNo = (supabase, schoolId) => nextNumber(supabase, schoolId, 'ap_payments', 'PYMT-', 'payment_no')

export const voucherNo = (payment) => String(payment?.payment_no || '').replace(/^PYMT/, 'PV') || 'PV-'

// ─── Invoice math ──────────────────────────────────────────────────────────

// tax_treatment: none | exclusive | inclusive
export function invoiceTotals(lines, { tax_treatment = 'exclusive', vat_rate = 0 } = {}) {
  const subtotal = round2((lines || []).reduce((s, l) => s + Math.max(toNum(l.quantity) * toNum(l.unit_price) - toNum(l.discount_amount), 0), 0))
  let taxable = subtotal
  let vat = 0
  if (tax_treatment === 'exclusive' && toNum(vat_rate) > 0) {
    vat = round2(subtotal * (toNum(vat_rate) / 100))
    taxable = subtotal
  } else if (tax_treatment === 'inclusive' && toNum(vat_rate) > 0) {
    vat = round2(subtotal - subtotal * (100 / (100 + toNum(vat_rate))))
    taxable = round2(subtotal - vat)
  }
  const total = round2(subtotal + vat)
  return { subtotal, taxable_amount: taxable, vat_amount: vat, total_amount: total }
}

// ─── Data loading ──────────────────────────────────────────────────────────

export async function loadApData(supabase, schoolId) {
  const [cfg, accRes, supRes, invRes, lineRes, payRes, allocRes, attRes, profRes] = await Promise.all([
    getApConfig(supabase, schoolId),
    supabase.from('chart_of_accounts').select('*').eq('school_id', schoolId).order('code'),
    supabase.from('ap_suppliers').select('*').eq('school_id', schoolId).order('created_at', { ascending: true }),
    supabase.from('ap_invoices').select('*').eq('school_id', schoolId).order('invoice_date', { ascending: false }),
    supabase.from('ap_invoice_lines').select('*').eq('school_id', schoolId),
    supabase.from('ap_payments').select('*').eq('school_id', schoolId).order('payment_date', { ascending: false }),
    supabase.from('ap_payment_allocations').select('*').eq('school_id', schoolId),
    supabase.from('finance_attachments').select('*').eq('school_id', schoolId),
    supabase.from('profiles').select('id, full_name, role').eq('school_id', schoolId),
  ])
  const accountOf = Object.fromEntries((accRes.data || []).map((a) => [a.id, a]))
  const nameOf = Object.fromEntries((profRes.data || []).map((p) => [p.id, p.full_name]))
  return {
    config: cfg,
    accounts: accRes.data || [],
    accountOf,
    suppliers: supRes.data || [],
    invoices: invRes.data || [],
    invoiceLines: lineRes.data || [],
    payments: payRes.data || [],
    allocations: allocRes.data || [],
    attachments: attRes.data || [],
    profiles: profRes.data || [],
    nameOf,
  }
}

export const invoiceLinesOf = (d, invoiceId) => (d.invoiceLines || []).filter((l) => l.invoice_id === invoiceId)
export const supplierOf = (d, id) => (d.suppliers || []).find((s) => s.id === id)
export const attachmentsOf = (d, type, id) => (d.attachments || []).filter((a) => a.entity_type === type && a.entity_id === id)

// Payments that actually moved money (paid/posted) drive outstanding balances.
export const effectivePaymentIds = (payments) => new Set((payments || []).filter((p) => ['paid', 'posted'].includes(p.status)).map((p) => p.id))

// outstanding per invoice = total − Σ allocations from effective payments.
export function paidByInvoice(d) {
  const map = {}
  const effective = effectivePaymentIds(d.payments)
  for (const a of d.allocations || []) {
    if (!effective.has(a.payment_id)) continue
    map[a.invoice_id] = round2((map[a.invoice_id] || 0) + toNum(a.amount))
  }
  return map
}

export const invoiceOutstanding = (d, invoice) => {
  if (['cancelled'].includes(invoice.status)) return 0
  return Math.max(round2(toNum(invoice.total_amount) - toNum(paidByInvoice(d)[invoice.id] || 0)), 0)
}

// ─── GL account resolution (chart-backed, no hard-coded ids) ───────────────

export async function resolveApAccounts(supabase, schoolId, codes) {
  await ensureAccounts(supabase, schoolId, codes)
  const { data } = await supabase.from('chart_of_accounts').select('id, code, name, type').eq('school_id', schoolId)
  return Object.fromEntries((data || []).filter((a) => codes.includes(a.code)).map((a) => [a.code, a]))
}

// ─── GL posting ────────────────────────────────────────────────────────────
// Invoice:
//   Dr <line expense/asset accounts>   taxable (net of VAT when inclusive)
//   Dr <VAT input account>             vat
//   Cr <AP control account>            total
export async function postInvoiceJournal(supabase, { schoolId, userId, invoice, lines, supplierName, entryDate }) {
  const cfg = await getApConfig(supabase, schoolId)
  const accs = await resolveApAccounts(supabase, schoolId, [cfg.defaults.ap_account, cfg.defaults.vat_input_account])
  const ap = accs[cfg.defaults.ap_account]
  const vatAcc = accs[cfg.defaults.vat_input_account]
  if (!ap) throw new Error(`Accounts Payable account (${cfg.defaults.ap_account}) not found in the chart — check Finance → Accounts Payable → Settings`)
  if (toNum(invoice.vat_amount) > 0 && !vatAcc) throw new Error(`VAT Input account (${cfg.defaults.vat_input_account}) not found in the chart — check Settings`)

  const factor = invoice.subtotal > 0 ? toNum(invoice.taxable_amount) / invoice.subtotal : 1
  const journalLines = (lines || []).map((l) => ({
    account_id: l.account_id,
    debit: round2(Math.max(toNum(l.quantity) * toNum(l.unit_price) - toNum(l.discount_amount), 0) * factor),
    credit: 0,
    notes: l.description || 'Supplier invoice line',
  }))
  if (toNum(invoice.vat_amount) > 0) {
    journalLines.push({ account_id: vatAcc.id, debit: toNum(invoice.vat_amount), credit: 0, notes: `Input VAT @ ${toNum(invoice.vat_rate)}%` })
  }
  journalLines.push({ account_id: ap.id, debit: 0, credit: toNum(invoice.total_amount), notes: `Accounts payable — ${supplierName || invoice.supplier_ref || ''}`.trim() })

  const je = await postToJournal(supabase, {
    schoolId, userId,
    entry_date: entryDate || invoice.invoice_date,
    description: `Supplier invoice ${invoice.invoice_no} — ${supplierName || ''}`.trim(),
    source: 'ap', reference_type: 'ap_invoice', reference_id: invoice.id,
    lines: journalLines,
  })
  await writeAudit(supabase, { schoolId, action: 'ap_invoice_posted', details: { invoice_id: invoice.id, invoice_no: invoice.invoice_no, journal_id: je.id } })
  return je
}

// Payment:
//   invoice: Dr <AP> amount | Cr <bank/cash/mobile> amount
//   direct : Dr <expense account> amount | Cr <bank/cash/mobile> amount
export async function postPaymentJournal(supabase, { schoolId, userId, payment, payeeName, entryDate }) {
  const cfg = await getApConfig(supabase, schoolId)
  const accs = await resolveApAccounts(supabase, schoolId, [cfg.defaults.ap_account])
  const ap = accs[cfg.defaults.ap_account]
  const payAcc = await supabase.from('chart_of_accounts').select('*').eq('id', payment.payment_account_id).single()
  if (payAcc.error) throw new Error('Payment account not found in the chart')
  const debitAcc = payment.payment_type === 'direct' ? payment.expense_account_id : ap?.id
  if (!debitAcc) throw new Error(`Accounts Payable account (${cfg.defaults.ap_account}) not found in the chart — check Settings`)

  const lines = [
    { account_id: debitAcc, debit: toNum(payment.amount), credit: 0, notes: payment.payment_type === 'direct' ? payment.description : `Settlement of supplier invoices` },
    { account_id: payAcc.data.id, debit: 0, credit: toNum(payment.amount), notes: `${payeeName || ''} — ${payment.reference_no || ''}`.trim() },
  ]
  const je = await postToJournal(supabase, {
    schoolId, userId,
    entry_date: entryDate || payment.payment_date,
    description: `Payment ${payment.payment_no} — ${payeeName || ''}`.trim(),
    source: 'ap', reference_type: 'ap_payment', reference_id: payment.id,
    lines,
  })
  await writeAudit(supabase, { schoolId, action: 'ap_payment_posted', details: { payment_id: payment.id, payment_no: payment.payment_no, journal_id: je.id, amount: payment.amount } })
  return je
}

// Reversal: posts an opposite entry (source 'ap', reversal_of the original)
// and marks the original entry reversed. Corrections never edit posted lines.
export async function reverseJournalEntry(supabase, { schoolId, userId, entry, entryDate }) {
  const { data: original, error } = await supabase.from('journal_entries').select('*').eq('id', entry.id).single()
  if (error || original.status === 'reversed') throw new Error('Entry not found or already reversed')
  const { data: lines } = await supabase.from('journal_entry_lines').select('*').eq('journal_entry_id', entry.id)
  const reversedLines = (lines || []).map((l) => ({ account_id: l.account_id, debit: toNum(l.credit), credit: toNum(l.debit), notes: `Reversal of ${original.entry_no}${l.notes ? ` — ${l.notes}` : ''}` }))
  const je = await postToJournal(supabase, {
    schoolId, userId,
    entry_date: entryDate || new Date().toISOString().split('T')[0],
    description: `Reversal of ${original.entry_no} — ${original.description || ''}`.trim(),
    source: 'ap', reference_type: original.reference_type, reference_id: original.reference_id,
    lines: reversedLines,
  })
  await supabase.from('journal_entries').update({ status: 'reversed', reversed_by: userId, reversal_of: je.id }).eq('id', entry.id)
  return je
}

// Recompute a posted invoice's paid amount + status after payment activity.
export async function recomputeInvoicePaid(supabase, { schoolId, invoiceId }) {
  const { data: invoice } = await supabase.from('ap_invoices').select('*').eq('id', invoiceId).single()
  if (!invoice || !['posted', 'partially_paid', 'paid'].includes(invoice.status)) return
  const { data: payments } = await supabase.from('ap_payments').select('id, status').eq('school_id', schoolId).in('status', ['paid', 'posted'])
  const eff = new Set((payments || []).map((p) => p.id))
  const { data: allocs } = await supabase.from('ap_payment_allocations').select('payment_id, amount').eq('invoice_id', invoiceId)
  const paid = round2((allocs || []).filter((a) => eff.has(a.payment_id)).reduce((s, a) => s + toNum(a.amount), 0))
  const status = paid >= toNum(invoice.total_amount) - 0.01 ? 'paid' : (paid > 0 ? 'partially_paid' : 'posted')
  const { error } = await supabase.from('ap_invoices').update({ paid_amount: paid, status }).eq('id', invoiceId)
  if (error) throw error
}

// ─── Attachments ───────────────────────────────────────────────────────────

export function attachmentPublicUrl(supabase, storagePath) {
  return supabase.storage.from('finance-attachments').getPublicUrl(storagePath).data.publicUrl
}

export async function uploadAttachment(supabase, { schoolId, userId, entityType, entityId, file }) {
  const storagePath = `${schoolId}/${entityType}/${entityId}/${Date.now()}-${String(file?.name || 'file').replace(/[^\w.-]/g, '_')}`
  const { error: upErr } = await supabase.storage.from('finance-attachments').upload(storagePath, file, { contentType: file?.type || 'application/octet-stream' })
  if (upErr) throw upErr
  const { data, error } = await supabase.from('finance_attachments').insert({
    school_id: schoolId, entity_type: entityType, entity_id: entityId,
    file_name: file?.name || 'file', file_type: file?.type, file_size: file?.size || 0,
    storage_path: storagePath, uploaded_by: userId,
  }).select().single()
  if (error) throw error
  return data
}

export async function deleteAttachment(supabase, { schoolId, attachment }) {
  await supabase.storage.from('finance-attachments').remove([attachment.storage_path])
  const { error } = await supabase.from('finance_attachments').delete().eq('id', attachment.id).eq('school_id', schoolId)
  if (error) throw error
}

// ─── Dashboard summary + ageing ────────────────────────────────────────────

export function apSummary(d, today = new Date()) {
  const paidMap = paidByInvoice(d)
  const dayMs = 86400000
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 }
  let total = 0, overdue = 0, dueWeek = 0, dueMonth = 0, partiallyPaid = 0
  const invoiceCandidates = (d.invoices || []).filter((i) => ['posted', 'partially_paid', 'paid'].includes(i.status))
  for (const inv of invoiceCandidates) {
    const outstanding = Math.max(toNum(inv.total_amount) - toNum(paidMap[inv.id] || 0), 0)
    if (outstanding <= 0.01) continue
    total += outstanding
    if (inv.paid_amount > 0) partiallyPaid++
    const due = inv.due_date ? new Date(inv.due_date) : null
    if (due) {
      const overdueDays = Math.floor((startOfToday - new Date(due.getFullYear(), due.getMonth(), due.getDate())) / dayMs)
      if (overdueDays > 90) buckets.d90 += outstanding
      else if (overdueDays > 60) buckets.d61_90 += outstanding
      else if (overdueDays > 30) buckets.d31_60 += outstanding
      else if (overdueDays > 0) { buckets.d1_30 += outstanding; overdue += outstanding }
      else {
        buckets.current += outstanding
        const daysToDue = -overdueDays
        if (daysToDue <= 7) dueWeek += outstanding
        if (daysToDue <= 30) dueMonth += outstanding
      }
    } else {
      buckets.current += outstanding
    }
  }
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const effective = effectivePaymentIds(d.payments)
  const paidThisMonth = (d.payments || [])
    .filter((p) => effective.has(p.id) && p.payment_date && new Date(p.payment_date) >= monthStart)
    .reduce((s, p) => s + toNum(p.amount), 0)
  const awaitingApproval =
    (d.invoices || []).filter((i) => ['submitted', 'reviewed'].includes(i.status)).length +
    (d.payments || []).filter((p) => ['submitted', 'reviewed'].includes(p.status)).length
  return {
    totalPayables: round2(total),
    overduePayables: round2(overdue + buckets.d1_30 + buckets.d31_60 + buckets.d61_90 + buckets.d90),
    dueThisWeek: round2(dueWeek),
    dueThisMonth: round2(dueMonth),
    pendingApproval: awaitingApproval,
    partiallyPaid,
    paidThisMonth: round2(paidThisMonth),
    ageing: buckets,
  }
}

// ─── Supplier statement ────────────────────────────────────────────────────

export function buildSupplierStatement(d, supplierId, { from, to } = {}) {
  const paidMap = paidByInvoice(d)
  const invoices = (d.invoices || [])
    .filter((i) => i.supplier_id === supplierId && ['posted', 'partially_paid', 'paid'].includes(i.status))
    .sort((a, b) => (a.invoice_date || '').localeCompare(b.invoice_date || '') || (a.invoice_no || '').localeCompare(b.invoice_no || ''))
  const effective = effectivePaymentIds(d.payments)
  const payments = (d.payments || [])
    .filter((p) => effective.has(p.id) && p.payment_date &&
      (!from || new Date(p.payment_date) >= new Date(from)) && (!to || new Date(p.payment_date) <= new Date(to)))
    .sort((a, b) => (a.payment_date || '').localeCompare(b.payment_date || ''))

  let opening = 0
  const rows = []
  for (const inv of invoices) {
    const out = Math.max(toNum(inv.total_amount) - toNum(paidMap[inv.id] || 0), 0)
    const inRange = (!from || new Date(inv.invoice_date) >= new Date(from)) && (!to || new Date(inv.invoice_date) <= new Date(to))
    if (inRange) {
      rows.push({ date: inv.invoice_date, ref: inv.invoice_no, detail: `Invoice — ${inv.supplier_ref || inv.description || ''}`.trim(), debit: toNum(inv.total_amount), credit: 0, balance: 0 })
    } else if (out > 0.01) {
      opening += toNum(inv.total_amount)
    }
  }
  for (const p of payments) {
    rows.push({ date: p.payment_date, ref: p.payment_no, detail: `Payment (${p.payment_method})${p.reference_no ? ` — ${p.reference_no}` : ''}`, debit: 0, credit: toNum(p.amount), balance: 0 })
  }
  rows.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.ref || '').localeCompare(b.ref || ''))
  let running = opening
  for (const r of rows) {
    running = round2(running + toNum(r.debit) - toNum(r.credit))
    r.balance = running
  }
  const closing = round2(opening + rows.reduce((s, r) => s + toNum(r.debit) - toNum(r.credit), 0))
  return { opening, closing, rows }
}
