// ─── Cash & Bank / Treasury utilities ──────────────────────────────────
// Treasury derives EVERY balance from the EXISTING General Ledger
// (journal_entries / journal_entry_lines). There is no second balance
// system: opening + postings = balance, per the account's normal side.
//
//   • Dashboard balances      — computed from posted GL lines
//   • Transfers               — one balanced GL entry: Dr <to> | Cr <from>
//   • Reconciliation          — matches GL lines to a bank statement; the
//                               module NEVER posts, so importing a statement
//                               can never create duplicate journal entries
//   • Fee payment posting     — Dr <Bank/M-Pesa/Cash> | Cr <Receivables>,
//                               so student receipts flow into Treasury

import { ensureAccounts, postToJournal, writeAudit, isDebitNormal } from './accountsUtils'

export const CASH_CATEGORY = 'Cash & Bank'
export const FIXED_DEPOSIT_CODES = ['1040']

export const TRANSFER_STATUSES = [
  { value: 'draft', label: 'Draft', color: '#64748b' },
  { value: 'submitted', label: 'Submitted', color: '#2563eb' },
  { value: 'approved', label: 'Approved', color: '#d97706' },
  { value: 'posted', label: 'Posted', color: '#16a34a' },
  { value: 'cancelled', label: 'Cancelled', color: '#dc2626' },
  { value: 'reversed', label: 'Reversed', color: '#dc2626' },
]

export const RECON_STATUSES = [
  { value: 'draft', label: 'Draft', color: '#64748b' },
  { value: 'reconciled', label: 'Reconciled', color: '#16a34a' },
  { value: 'cancelled', label: 'Cancelled', color: '#dc2626' },
]

export const RECON_LINE_STATUSES = [
  { value: 'unreconciled', label: 'Unreconciled', color: '#d97706' },
  { value: 'reconciled', label: 'Reconciled', color: '#16a34a' },
]

// Payment method → default chart code (same mapping AP uses). Note: 'cheque'
// receipts are special-cased to 1050 (Cheques in Clearing) in
// postFeePaymentToGL — this map keeps 'cheque' → 1020 so cheque METHOD
// REFUNDS remain bank outflows (money genuinely leaves the bank).
export const METHOD_ACCOUNT_CODE = { bank: '1020', mobile: '1030', mpesa: '1030', mobile_money: '1030', cash: '1010', cheque: '1020' }

const toNum = (n) => Number(n || 0)
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100
const today = () => new Date().toISOString().split('T')[0]

// ─── Account classification ────────────────────────────────────────────────
export const isCashAccount = (a) => !!a && a.type === 'asset' && (a.category || '').toLowerCase() === CASH_CATEGORY.toLowerCase()
export const isFixedDeposit = (a) => !!a && (FIXED_DEPOSIT_CODES.includes(a.code) || /fixed deposit/i.test(a.name || ''))
export const isMobileMoney = (a) => !!a && (a.code === '1030' || /mobile|m-pesa|mpesa/i.test(a.name || ''))
export const isPettyCash = (a) => !!a && (a.code === '1010' || /petty cash/i.test(a.name || ''))
export const isClearingAccount = (a) => !!a && (a.code === '1050' || /clearing/i.test(a.name || ''))

export const accountKind = (a) => {
  if (!isCashAccount(a)) return 'Other'
  if (isFixedDeposit(a)) return 'Fixed Deposit'
  if (isMobileMoney(a)) return 'Mobile Money'
  if (isPettyCash(a)) return 'Petty Cash'
  if (isClearingAccount(a)) return 'Cheques in Clearing'
  return 'Bank'
}

// ─── Numbering ─────────────────────────────────────────────────────────────
export const nextTransferNo = async (supabase, schoolId) => {
  const { data } = await supabase.from('cash_transfers').select('transfer_no').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(1)
  let seq = 1
  if (data?.length && data[0].transfer_no?.startsWith('TR-')) seq = parseInt(data[0].transfer_no.split('-').pop()) + 1
  return `TR-${String(seq).padStart(4, '0')}`
}

// ─── Data loading ──────────────────────────────────────────────────────────
export async function loadCashBankData(supabase, schoolId) {
  await ensureAccounts(supabase, schoolId, ['1010', '1020', '1030', '1040'])
  const [accRes, lineRes, entryRes, tfRes, recRes, brlRes, profRes] = await Promise.all([
    supabase.from('chart_of_accounts').select('*').eq('school_id', schoolId).order('code'),
    supabase
      .from('journal_entry_lines')
      .select('*, journal_entries!inner(entry_no, entry_date, description, source, status, posted_at, reference_type, reference_id)')
      .order('created_at', { ascending: true }),
    supabase.from('journal_entries').select('*').eq('school_id', schoolId).order('created_at', { ascending: false }),
    supabase.from('cash_transfers').select('*').eq('school_id', schoolId).order('transfer_date', { ascending: false }),
    supabase.from('bank_reconciliations').select('*').eq('school_id', schoolId).order('created_at', { ascending: false }),
    supabase.from('bank_reconciliation_lines').select('*').eq('school_id', schoolId),
    supabase.from('profiles').select('id, full_name').eq('school_id', schoolId),
  ])
  const accounts = accRes.data || []
  const allLines = lineRes.data || []
  const lines = allLines.filter((l) => l.journal_entries?.status === 'posted')
  const accountByCode = Object.fromEntries(accounts.map((a) => [a.code, a]))
  const accountOf = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const nameOf = Object.fromEntries((profRes.data || []).map((p) => [p.id, p.full_name]))
  return {
    accounts,
    accountByCode,
    accountOf,
    lines,
    entries: entryRes.data || [],
    transfers: tfRes.data || [],
    reconciliations: recRes.data || [],
    reconLines: brlRes.data || [],
    nameOf,
  }
}

// ─── Balance computation (GL is the single source of truth) ────────────────
// balance = opening_balance + net postings, honoured on the account's normal
// side. Nothing here is editable — it is always derived from the ledger.
export function computeAccountBalances(accounts, lines) {
  const map = {}
  for (const a of accounts) {
    map[a.id] = { account: a, opening: toNum(a.opening_balance), debits: 0, credits: 0, balance: 0, net: 0 }
  }
  for (const l of lines) {
    const m = map[l.account_id]
    if (!m) continue
    m.debits = round2(m.debits + toNum(l.debit))
    m.credits = round2(m.credits + toNum(l.credit))
  }
  for (const id of Object.keys(map)) {
    const m = map[id]
    const net = round2(m.debits - m.credits)
    m.net = net
    m.balance = round2(m.opening + (isDebitNormal(m.account.type) ? net : -net))
  }
  return map
}

// Cash & Bank summary split by kind. Available = operating funds (excludes
// fixed deposits, which are restricted/invested and shown separately).
// Cheques in Clearing counts toward Total/Available (money in transit the
// school already holds) but is reported under its own bucket — never under
// 'bank' — so cleared-cheque cash is not double-imagined as bank balance.
export function cashSummary(balances) {
  const out = { total: 0, bank: 0, mobile: 0, cash: 0, fixed: 0, clearing: 0, available: 0 }
  for (const b of Object.values(balances)) {
    const a = b.account
    if (!isCashAccount(a)) continue
    const v = toNum(b.balance)
    out.total = round2(out.total + v)
    if (isFixedDeposit(a)) out.fixed = round2(out.fixed + v)
    else if (isMobileMoney(a)) out.mobile = round2(out.mobile + v)
    else if (isPettyCash(a)) out.cash = round2(out.cash + v)
    else if (isClearingAccount(a)) out.clearing = round2(out.clearing + v)
    else out.bank = round2(out.bank + v)
  }
  out.available = round2(out.total - out.fixed)
  return out
}

// Transfer in/out split for an account (from posted GL 'transfer' entries).
export function accountTransfers(accountId, entries, lines) {
  let inAmt = 0, outAmt = 0
  for (const e of entries || []) {
    if (e.source !== 'transfer' || e.status !== 'posted') continue
    for (const l of lines || []) {
      if (l.journal_entry_id !== e.id || l.account_id !== accountId) continue
      inAmt += toNum(l.debit)
      outAmt += toNum(l.credit)
    }
  }
  return { transfersIn: round2(inAmt), transfersOut: round2(outAmt) }
}

// Net (debit−credit) of an account's GL lines that have not been reconciled.
export function unreconciledNet(accountId, reconLines) {
  return round2((reconLines || [])
    .filter((l) => l.account_id === accountId && l.status === 'unreconciled')
    .reduce((s, l) => s + (toNum(l.debit) - toNum(l.credit)), 0))
}

// Full statement for one account: chronological posted lines with running
// balance and reconciled status.
export function accountStatement(account, lines, reconLines) {
  const reconciled = new Set((reconLines || [])
    .filter((l) => l.status === 'reconciled' && l.journal_line_id)
    .map((l) => l.journal_line_id))
  const rows = (lines || [])
    .filter((l) => l.account_id === account.id)
    .map((l) => ({
      ...l,
      entry_no: l.journal_entries?.entry_no || '—',
      entry_date: l.journal_entries?.entry_date || l.created_at?.slice(0, 10),
      description: l.journal_entries?.description || l.notes || '',
      source: l.journal_entries?.source || 'manual',
      reconciled: reconciled.has(l.id),
    }))
    .sort((a, b) => (a.entry_date || '').localeCompare(b.entry_date || '') || (a.entry_no || '').localeCompare(b.entry_no || ''))
  let bal = toNum(account.opening_balance)
  const debitNormal = isDebitNormal(account.type)
  for (const r of rows) {
    bal = round2(bal + (debitNormal ? toNum(r.debit) - toNum(r.credit) : -toNum(r.debit) + toNum(r.credit)))
    r.balance = bal
  }
  return rows
}

// ─── Transfers ─────────────────────────────────────────────────────────────
// Exactly one balanced entry: Dr <to> | Cr <from>. Never income/expense.
export async function postTransferJournal(supabase, { schoolId, userId, transfer, fromAccount, toAccount }) {
  const amount = round2(toNum(transfer.amount))
  if (amount <= 0) throw new Error('Transfer amount must be positive')
  const fromName = fromAccount ? `${fromAccount.code} ${fromAccount.name}` : 'source'
  const toName = toAccount ? `${toAccount.code} ${toAccount.name}` : 'destination'
  const notes = transfer.description || `Transfer ${fromName} → ${toName}`
  const je = await postToJournal(supabase, {
    schoolId, userId,
    entry_date: transfer.transfer_date || today(),
    description: `Transfer ${transfer.transfer_no} — ${fromName} → ${toName}`.trim(),
    source: 'transfer', reference_type: 'cash_transfer', reference_id: transfer.id,
    lines: [
      { account_id: transfer.to_account_id, debit: amount, credit: 0, notes },
      { account_id: transfer.from_account_id, debit: 0, credit: amount, notes },
    ],
  })
  await supabase.from('cash_transfers').update({
    journal_entry_id: je.id, status: 'posted', posted_by: userId, posted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', transfer.id)
  await writeAudit(supabase, { schoolId, action: 'cash_transfer_posted', details: { transfer_id: transfer.id, transfer_no: transfer.transfer_no, amount, journal_id: je.id } })
  return je
}

// Reverse a posted transfer: posts an opposite 'transfer' entry (never edits
// the original), marks the original journal reversed and the transfer 'reversed'.
export async function reverseTransfer(supabase, { schoolId, userId, transfer }) {
  const { data: je } = await supabase.from('journal_entries').select('*').eq('id', transfer.journal_entry_id).single()
  if (!je || je.status === 'reversed') throw new Error('Transfer has no reversible journal entry')
  const { data: lines } = await supabase.from('journal_entry_lines').select('*').eq('journal_entry_id', je.id)
  const reversed = (lines || []).map((l) => ({
    account_id: l.account_id,
    debit: toNum(l.credit),
    credit: toNum(l.debit),
    notes: `Reversal of ${je.entry_no}${l.notes ? ` — ${l.notes}` : ''}`,
  }))
  const newJe = await postToJournal(supabase, {
    schoolId, userId,
    entry_date: today(),
    description: `Reversal of ${je.entry_no} — ${je.description || 'transfer'}`.trim(),
    source: 'transfer', reference_type: 'cash_transfer', reference_id: transfer.id,
    lines: reversed,
  })
  await supabase.from('journal_entries').update({ status: 'reversed', reversed_by: userId, reversal_of: newJe.id }).eq('id', je.id)
  await supabase.from('cash_transfers').update({
    status: 'reversed', journal_entry_id: null, reversed_by: userId, reversed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', transfer.id)
  await writeAudit(supabase, { schoolId, action: 'cash_transfer_reversed', details: { transfer_id: transfer.id, transfer_no: transfer.transfer_no, amount: transfer.amount } })
  return newJe
}

// ─── Reconciliation ────────────────────────────────────────────────────────
// GL closing = opening + all posted postings up to statement end.
// Expected statement = GL closing − unreconciled GL items in the period.
// difference = statement closing − expected statement.
export function reconciliationMath(account, lines, periodLines, reconLineStates) {
  const debitNormal = isDebitNormal(account.type)
  const opening = toNum(account.opening_balance)
  let glClosing = opening
  for (const l of lines || []) {
    if (l.journal_entries?.status !== 'posted') continue
    const d = l.entry_date || l.journal_entries?.entry_date
    if (d && new Date(d) > new Date(account.statement_end_date)) continue
    glClosing = round2(glClosing + (debitNormal ? toNum(l.debit) - toNum(l.credit) : -toNum(l.debit) + toNum(l.credit)))
  }
  const unreconciled = round2((reconLineStates || periodLines || [])
    .filter((l) => l.status !== 'reconciled' && l.journal_line_id)
    .reduce((s, l) => s + (debitNormal ? toNum(l.debit) - toNum(l.credit) : -toNum(l.debit) + toNum(l.credit)), 0))
  const expected = round2(glClosing - unreconciled)
  const difference = round2(toNum(account.statement_closing_balance) - expected)
  return { glClosing: round2(glClosing), unreconciled: round2(unreconciled), expected, difference }
}

// Create a reconciliation: snapshot the period's GL lines for the account.
export async function createReconciliation(supabase, { schoolId, userId, accountId, start, end, statementClosing, notes }) {
  const { data: account } = await supabase.from('chart_of_accounts').select('*').eq('id', accountId).single()
  if (!account) throw new Error('Account not found')
  const { data: rawLines } = await supabase
    .from('journal_entry_lines')
    .select('*, journal_entries!inner(entry_no, entry_date, description, source, status)')
    .eq('account_id', accountId)
    .eq('journal_entries.status', 'posted')
  const periodLines = (rawLines || []).filter((l) => {
    const d = l.journal_entries?.entry_date
    return d && new Date(d) >= new Date(start) && new Date(d) <= new Date(end)
  })
  const math = reconciliationMath({ ...account, statement_end_date: end }, rawLines || [], periodLines, [])
  const { data: recon, error } = await supabase.from('bank_reconciliations').insert({
    school_id: schoolId, account_id: accountId,
    statement_start_date: start, statement_end_date: end,
    statement_closing_balance: toNum(statementClosing),
    gl_closing_balance: math.glClosing,
    unreconciled_amount: math.unreconciled,
    difference: math.difference,
    status: 'draft', created_by: userId, notes: notes || null,
  }).select().single()
  if (error) throw error
  const lines = periodLines.map((l) => ({
    school_id: schoolId, reconciliation_id: recon.id, account_id: accountId,
    journal_line_id: l.id, source: 'gl',
    entry_date: l.journal_entries?.entry_date,
    reference: l.journal_entries?.entry_no,
    description: l.journal_entries?.description || l.notes || '',
    debit: toNum(l.debit), credit: toNum(l.credit),
    status: 'unreconciled',
  }))
  if (lines.length) {
    const { error: linesErr } = await supabase.from('bank_reconciliation_lines').insert(lines)
    if (linesErr) throw linesErr
  }
  return { recon, math }
}

export async function setReconciled(supabase, { userId, itemId, reconciled, matchedJournalLineId, notes }) {
  const payload = {
    status: reconciled ? 'reconciled' : 'unreconciled',
    matched_journal_line_id: reconciled ? (matchedJournalLineId || null) : null,
    reconciled_by: reconciled ? userId : null,
    reconciled_at: reconciled ? new Date().toISOString() : null,
    notes: notes || null,
  }
  const { error } = await supabase.from('bank_reconciliation_lines').update(payload).eq('id', itemId)
  if (error) throw error
}

export async function addImportedLines(supabase, { schoolId, recon, rows }) {
  const { data, error } = await supabase.from('bank_reconciliation_lines').insert(
    rows.map((r) => ({
      school_id: schoolId, reconciliation_id: recon.id, account_id: recon.account_id,
      journal_line_id: null, source: 'imported',
      entry_date: r.date || null, reference: r.reference || null, description: r.description || '',
      debit: toNum(r.debit), credit: toNum(r.credit),
      status: 'unreconciled',
    }))
  ).select()
  if (error) throw error
  return data || []
}

// Recomputed header (balances + difference) after matching changes.
export async function refreshReconciliationHeader(supabase, { recon, account, lines, periodLines, reconLineStates }) {
  const math = reconciliationMath({ ...account, statement_end_date: recon.statement_end_date }, lines, periodLines, reconLineStates)
  const status = Math.abs(math.difference) < 0.01 ? 'reconciled' : 'draft'
  const { error } = await supabase.from('bank_reconciliations').update({
    gl_closing_balance: math.glClosing,
    unreconciled_amount: math.unreconciled,
    difference: math.difference,
    status,
    updated_at: new Date().toISOString(),
  }).eq('id', recon.id)
  if (error) throw error
  return { ...recon, ...math, status }
}

export async function deleteReconciliation(supabase, { schoolId, reconId }) {
  const { error } = await supabase.from('bank_reconciliations').delete().eq('id', reconId).eq('school_id', schoolId)
  if (error) throw error
}

// ─── CSV parsing + matching ────────────────────────────────────────────────
// Small CSV/TSV/;-parser that understands quoted fields.
export function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQ = false
  const delim = text.includes('\t') ? '\t' : (text.includes(';') && !text.includes(',') ? ';' : ',')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((x) => String(x ?? '').trim() !== ''))
}

// Guess a header map from a statement row: finds date/description/debit/credit.
export function guessStatementColumns(row) {
  const hasHeader = row.some((h) => /date|dd|mm|yy/i.test(String(h)))
  if (!hasHeader) {
    return row.map((_, i) => ({ index: i, field: i === 0 ? 'date' : i === 1 ? 'description' : i === 2 ? 'debit' : 'credit' }))
  }
  const lower = row.map((h) => String(h ?? '').toLowerCase())
  return lower.map((h, i) => {
    let field = 'description'
    if (/(date|dd|day|date de)/.test(h)) field = 'date'
    else if (/(debit|dr|withdrawal|outflow|payment out|paid)/.test(h)) field = 'debit'
    else if (/(credit|cr|deposit|inflow|payment in|received)/.test(h)) field = 'credit'
    else if (/(amount|amt|value)/.test(h)) field = 'amount'
    else if (/(ref|particulars|narration|details|description|trans|name|memo)/.test(h)) field = 'reference'
    return { index: i, field }
  })
}

// Suggest GL matches for imported statement rows (same amount, near date,
// not already matched). Never mutates — the caller applies matches.
export function suggestMatches(imported, glLines) {
  const used = new Set()
  const out = []
  for (const im of imported || []) {
    const amt = Math.abs(toNum(im.debit || 0) - toNum(im.credit || 0))
    if (amt <= 0) continue
    const imDate = im.date ? new Date(im.date) : null
    const cand = (glLines || []).find((l) => {
      if (used.has(l.id)) return false
      const lineAmt = Math.abs(toNum(l.debit) - toNum(l.credit))
      if (Math.abs(lineAmt - amt) > 0.01) return false
      if (imDate) {
        const ld = l.journal_entries?.entry_date ? new Date(l.journal_entries.entry_date) : null
        if (ld && Math.abs(ld - imDate) > 5 * 86400000) return false
      }
      return true
    })
    if (cand) { used.add(cand.id); out.push({ importedRowId: im.id, journalLineId: cand.id }) }
  }
  return out
}

// ─── Fee payment → GL (so Treasury reflects student receipts) ─────────────
// Dr <Bank/M-Pesa/Cash> | Cr <Student Fee Receivables> for the applied
// portion; any excess (overpayment) is credited to the Student Credit
// liability account (2230) instead of over-clearing receivables.
export async function postFeePaymentToGL(supabase, { schoolId, userId, payment, method }) {
  if (payment?.journal_entry_id) return null
  const credit = Math.max(toNum(payment.credit_amount), 0)
  const applied = Math.max(toNum(payment.applied_amount ?? payment.amount) - credit, 0)
  await ensureAccounts(supabase, schoolId, ['1010', '1020', '1030', '1050', '1110', '2230'])
  // Cheque receipts park in 1050 Cheques in Clearing until 'cleared' (RPC)
  // moves them into 1020 Cash at Bank. Bank/M-Pesa/Cash book immediately.
  const code = method === 'cheque' ? '1050' : (METHOD_ACCOUNT_CODE[method] || '1020')
  const { data: accs } = await supabase.from('chart_of_accounts').select('*').eq('school_id', schoolId).in('code', [code, '1110', '2230'])
  const payAcc = (accs || []).find((a) => a.code === code)
  const recv = (accs || []).find((a) => a.code === '1110')
  const creditLiab = (accs || []).find((a) => a.code === '2230')
  if (!payAcc || !recv) throw new Error('Cash / receivable account missing from the chart')
  const amount = toNum(payment.amount)
  const studentName = payment.student?.full_name || payment.student_name || 'Student'
  const lines = [
    { account_id: payAcc.id, debit: amount, credit: 0, notes: `Receipt ${payment.receipt_number || ''} — ${method || 'cash'}` },
    { account_id: recv.id, debit: 0, credit: applied, notes: `Fee receivable cleared — ${studentName}` },
  ]
  if (credit > 0) {
    if (!creditLiab) throw new Error('Student credit liability account (2230) missing from the chart')
    lines.push({ account_id: creditLiab.id, debit: 0, credit, notes: `Advance held as student credit — ${studentName}` })
  }
  const je = await postToJournal(supabase, {
    schoolId, userId,
    entry_date: payment.transaction_date || today(),
    description: `Fee payment ${payment.receipt_number || ''} — ${studentName} (${method || 'cash'})`.trim(),
    source: 'fees', reference_type: 'fee_payment', reference_id: payment.id,
    lines,
  })
  await supabase.from('fee_payments').update({ journal_entry_id: je.id }).eq('id', payment.id)
  await writeAudit(supabase, { schoolId, action: 'fee_payment_posted', details: { payment_id: payment.id, receipt: payment.receipt_number, amount, applied, credit, journal_id: je.id } })
  return je
}

// ─── Student credit application → GL ──────────────────────────────────────
// Consuming stored credit against a term's assessment clears the receivable
// already accrued by the assessment: Dr <Student Credit (2230) | Cr <Receivables>.
export async function postCreditApplicationToGL(supabase, { schoolId, userId, entry, studentName }) {
  await ensureAccounts(supabase, schoolId, ['1110', '2230'])
  const { data: accs } = await supabase.from('chart_of_accounts').select('*').eq('school_id', schoolId).in('code', ['1110', '2230'])
  const recv = (accs || []).find((a) => a.code === '1110')
  const creditLiab = (accs || []).find((a) => a.code === '2230')
  if (!recv || !creditLiab) throw new Error('Receivable / student credit account missing from the chart')
  const amount = toNum(entry.applied)
  const name = studentName || 'Student'
  const je = await postToJournal(supabase, {
    schoolId, userId,
    entry_date: today(),
    description: `Student credit applied — ${entry.term || ''} ${entry.year || ''} — ${name}`.trim(),
    source: 'fees', reference_type: 'fee_credit', reference_id: entry.ledger_entry_id || null,
    lines: [
      { account_id: creditLiab.id, debit: amount, credit: 0, notes: `Credit applied to ${entry.term || ''} — ${name}` },
      { account_id: recv.id, debit: 0, credit: amount, notes: `Receivable cleared by student credit — ${name}` },
    ],
  })
  await writeAudit(supabase, { schoolId, action: 'student_credit_applied', details: { term: entry.term, year: entry.year, amount, journal_id: je.id } })
  return je
}

// ─── Student credit refund → GL ──────────────────────────────────────────
// Returning stored credit: Dr <Student Credit (2230)> | Cr <Cash/Bank/M-Pesa>
// (authorizer confirmed the refund is actually disbursed).
export async function postRefundToGL(supabase, { schoolId, userId, refund, method, studentName }) {
  await ensureAccounts(supabase, schoolId, ['1010', '1020', '1030', '2230'])
  const code = METHOD_ACCOUNT_CODE[method] || '1020'
  const { data: accs } = await supabase.from('chart_of_accounts').select('*').eq('school_id', schoolId).in('code', [code, '2230'])
  const cashAcc = (accs || []).find((a) => a.code === code)
  const creditLiab = (accs || []).find((a) => a.code === '2230')
  if (!cashAcc || !creditLiab) throw new Error('Cash / student credit account missing from the chart')
  const amount = toNum(refund.amount)
  const name = studentName || 'Student'
  const je = await postToJournal(supabase, {
    schoolId, userId,
    entry_date: today(),
    description: `Refund of student credit — ${name} (${method || 'cash'})`.trim(),
    source: 'refund', reference_type: 'fee_refund', reference_id: refund.refund_id || null,
    lines: [
      { account_id: creditLiab.id, debit: amount, credit: 0, notes: `Student credit refunded — ${name}` },
      { account_id: cashAcc.id, debit: 0, credit: amount, notes: `Refund paid out — ${method || 'cash'}` },
    ],
  })
  await writeAudit(supabase, { schoolId, action: 'student_credit_refund', details: { refund_id: refund.refund_id, amount, method, journal_id: je.id } })
  return je
}

// ─── Fee assessment → GL (receivable accrual + fee income recognition) ────
// Dr <Student Fee Receivables> | Cr <Fee Income> at billing time. Payments
// later clear the receivable (see postFeePaymentToGL), so the receivable
// always equals assessed − collected.
export async function postFeeAssessmentToGL(supabase, { schoolId, userId, assessment, studentName }) {
  if (assessment?.journal_entry_id) return null
  await ensureAccounts(supabase, schoolId, ['1110', '4010'])
  const { data: accs } = await supabase.from('chart_of_accounts').select('*').eq('school_id', schoolId).in('code', ['1110', '4010'])
  const recv = (accs || []).find((a) => a.code === '1110')
  const income = (accs || []).find((a) => a.code === '4010')
  if (!recv || !income) throw new Error('Receivable / fee income account missing from the chart')
  const amount = toNum(assessment.amount_due)
  const category = assessment.fee_structures?.fee_categories?.name || 'Fees'
  const name = studentName || 'Student'
  const je = await postToJournal(supabase, {
    schoolId, userId,
    entry_date: assessment.created_at ? assessment.created_at.split('T')[0] : today(),
    description: `Fee assessment — ${category} — ${name}`.trim(),
    source: 'fees', reference_type: 'fee_assessment', reference_id: assessment.id,
    lines: [
      { account_id: recv.id, debit: amount, credit: 0, notes: `Billed ${category} — ${name}` },
      { account_id: income.id, debit: 0, credit: amount, notes: `Fee income — ${category}` },
    ],
  })
  await supabase.from('fee_assessments').update({ journal_entry_id: je.id }).eq('id', assessment.id)
  await writeAudit(supabase, { schoolId, action: 'fee_assessment_posted', details: { assessment_id: assessment.id, amount, journal_id: je.id } })
  return je
}

// Reverse any journal entry (generic, preserves source). Used to unwind a
// fee payment's GL posting. Never edits the original entry.
export async function reverseJournal(supabase, { schoolId, userId, entry }) {
  const { data: lines } = await supabase.from('journal_entry_lines').select('*').eq('journal_entry_id', entry.id)
  const reversed = (lines || []).map((l) => ({
    account_id: l.account_id,
    debit: toNum(l.credit),
    credit: toNum(l.debit),
    notes: `Reversal of ${entry.entry_no}${l.notes ? ` — ${l.notes}` : ''}`,
  }))
  const je = await postToJournal(supabase, {
    schoolId, userId,
    entry_date: today(),
    description: `Reversal of ${entry.entry_no} — ${entry.description || ''}`.trim(),
    source: entry.source, reference_type: entry.reference_type, reference_id: entry.reference_id,
    lines: reversed,
  })
  await supabase.from('journal_entries').update({ status: 'reversed', reversed_by: userId, reversal_of: je.id }).eq('id', entry.id)
  return je
}
