// ─── Accounting core utilities ─────────────────────────────────────────────
// Shared helpers for the GL foundation. Future modules (Fees, Payroll,
// Assets, AP/Expenses) call postToJournal() so every transaction flows into
// the General Ledger → Trial Balance → Financial Statements.

export const ACCOUNT_TYPES = [
  { value: 'asset',     label: 'Asset',     normal: 'debit' },
  { value: 'liability', label: 'Liability', normal: 'credit' },
  { value: 'equity',    label: 'Equity',    normal: 'credit' },
  { value: 'income',    label: 'Income',    normal: 'credit' },
  { value: 'expense',   label: 'Expense',   normal: 'debit' },
]

export const isDebitNormal = (type) => type === 'asset' || type === 'expense'

// ─── Default Chart of Accounts (seeded per school) ─────────────────────────
export const DEFAULT_CHART = [
  // Assets
  { code: '1010', name: 'Petty Cash',                type: 'asset',     category: 'Cash & Bank' },
  { code: '1020', name: 'Cash at Bank (Main)',       type: 'asset',     category: 'Cash & Bank' },
  { code: '1030', name: 'Mobile Money Account',      type: 'asset',     category: 'Cash & Bank' },
  { code: '1040', name: 'Bank — Fixed Deposit',      type: 'asset',     category: 'Cash & Bank' },
  { code: '1110', name: 'Student Fee Receivables',   type: 'asset',     category: 'Accounts Receivable' },
  { code: '1210', name: 'Land & Buildings',          type: 'asset',     category: 'Fixed Assets' },
  { code: '1220', name: 'Furniture & Fittings',      type: 'asset',     category: 'Fixed Assets' },
  { code: '1230', name: 'Motor Vehicles',            type: 'asset',     category: 'Fixed Assets' },
  { code: '1240', name: 'Computers & IT Equipment',  type: 'asset',     category: 'Fixed Assets' },
  { code: '1250', name: 'Laboratory Equipment',      type: 'asset',     category: 'Fixed Assets' },
  { code: '1260', name: 'Library Books',             type: 'asset',     category: 'Fixed Assets' },
  { code: '1270', name: 'Sports Equipment',          type: 'asset',     category: 'Fixed Assets' },
  { code: '1280', name: 'Office Equipment',          type: 'asset',     category: 'Fixed Assets' },
  { code: '1290', name: 'Accumulated Depreciation',  type: 'asset',     category: 'Fixed Assets' },
  { code: '1310', name: 'Prepaid Expenses',          type: 'asset',     category: 'Prepayments' },
  // Liabilities
  { code: '2010', name: 'Trade Creditors',           type: 'liability', category: 'Accounts Payable' },
  { code: '2020', name: 'Accrued Expenses',          type: 'liability', category: 'Accounts Payable' },
  { code: '2110', name: 'PAYE Payable',              type: 'liability', category: 'Statutory Payables' },
  { code: '2120', name: 'NHIF Payable',              type: 'liability', category: 'Statutory Payables' },
  { code: '2130', name: 'NSSF Payable',              type: 'liability', category: 'Statutory Payables' },
  { code: '2140', name: 'HELB Payable',              type: 'liability', category: 'Statutory Payables' },
  { code: '2145', name: 'VAT Input (Receivable)',    type: 'asset',     category: 'Tax' },
  { code: '2115', name: 'SHIF Payable',              type: 'liability', category: 'Statutory Payables' },
  { code: '2116', name: 'Housing Levy Payable',      type: 'liability', category: 'Statutory Payables' },
  { code: '2117', name: 'NITA Payable',              type: 'liability', category: 'Statutory Payables' },
  { code: '2150', name: 'Wages Payable',             type: 'liability', category: 'Payroll Payables' },
  { code: '2151', name: 'Other Payroll Deductions Payable', type: 'liability', category: 'Payroll Payables' },
  { code: '2210', name: 'Caution Money Held',        type: 'liability', category: 'Deposits' },
  { code: '2220', name: 'Deferred Fee Income',       type: 'liability', category: 'Deposits' },
  // Equity
  { code: '3010', name: 'Accumulated Fund',          type: 'equity',    category: 'Fund Balances' },
  { code: '3020', name: 'Capital Grants',            type: 'equity',    category: 'Fund Balances' },
  { code: '3030', name: 'Operating Surplus / Deficit', type: 'equity',  category: 'Fund Balances' },
  // Income
  { code: '4010', name: 'Tuition Fees',              type: 'income',    category: 'Fee Income' },
  { code: '4020', name: 'Boarding Fees',             type: 'income',    category: 'Fee Income' },
  { code: '4030', name: 'Transport Fees',            type: 'income',    category: 'Fee Income' },
  { code: '4040', name: 'Registration Fees',         type: 'income',    category: 'Fee Income' },
  { code: '4050', name: 'Examination Fees',          type: 'income',    category: 'Fee Income' },
  { code: '4060', name: 'Activity Fees',             type: 'income',    category: 'Fee Income' },
  { code: '4070', name: 'Caution Money',             type: 'income',    category: 'Fee Income' },
  { code: '4080', name: 'Other Fee Income',          type: 'income',    category: 'Fee Income' },
  { code: '4110', name: 'Grants & Donations',        type: 'income',    category: 'Other Income' },
  { code: '4120', name: 'Interest Income',           type: 'income',    category: 'Other Income' },
  { code: '4130', name: 'Rental Income',             type: 'income',    category: 'Other Income' },
  { code: '4140', name: 'Miscellaneous Income',      type: 'income',    category: 'Other Income' },
  // Expenses
  { code: '5010', name: 'Teaching Staff Salaries',   type: 'expense',   category: 'Salaries & Wages' },
  { code: '5020', name: 'Non-Teaching Staff Salaries', type: 'expense', category: 'Salaries & Wages' },
  { code: '5030', name: 'Employer Statutory Contributions', type: 'expense', category: 'Salaries & Wages' },
  { code: '5040', name: 'Staff Allowances & Overtime', type: 'expense', category: 'Salaries & Wages' },
  { code: '5110', name: 'Electricity',               type: 'expense',   category: 'Utilities' },
  { code: '5120', name: 'Water & Sewerage',          type: 'expense',   category: 'Utilities' },
  { code: '5130', name: 'Internet & Telephone',      type: 'expense',   category: 'Utilities' },
  { code: '5210', name: 'Food & Catering',           type: 'expense',   category: 'Operational' },
  { code: '5220', name: 'Transport & Fuel',          type: 'expense',   category: 'Operational' },
  { code: '5230', name: 'Repairs & Maintenance',     type: 'expense',   category: 'Operational' },
  { code: '5240', name: 'Stationery & Printing',     type: 'expense',   category: 'Operational' },
  { code: '5250', name: 'Learning Materials',        type: 'expense',   category: 'Operational' },
  { code: '5260', name: 'Cleaning Supplies',         type: 'expense',   category: 'Operational' },
  { code: '5270', name: 'Medical Expenses',          type: 'expense',   category: 'Operational' },
  { code: '5280', name: 'Security Services',         type: 'expense',   category: 'Operational' },
  { code: '5310', name: 'Rent',                      type: 'expense',   category: 'Administrative' },
  { code: '5320', name: 'Insurance',                 type: 'expense',   category: 'Administrative' },
  { code: '5330', name: 'Professional Fees',         type: 'expense',   category: 'Administrative' },
  { code: '5340', name: 'Bank Charges',              type: 'expense',   category: 'Administrative' },
  { code: '5350', name: 'Advertising & Marketing',   type: 'expense',   category: 'Administrative' },
  { code: '5360', name: 'General Expenses',          type: 'expense',   category: 'Administrative' },
  { code: '5410', name: 'Depreciation Expense',      type: 'expense',   category: 'Depreciation' },
]

// ─── Helpers ───────────────────────────────────────────────────────────────

export const typeColor = (type) => {
  const map = { asset: '#2563eb', liability: '#d97706', equity: '#7c3aed', income: '#16a34a', expense: '#dc2626' }
  return map[type] || '#64748b'
}

// Net (debit − credit) from an array of { debit, credit }
export const netPosting = (lines) =>
  (lines || []).reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0)

// Running balance for one account, honouring the account type's normal side.
// Returns signed amount where positive = normal side, negative = abnormal.
export const accountBalance = (account, lines) => {
  const net = netPosting(lines)
  const debitNormal = isDebitNormal(account.type)
  return Number(account.opening_balance || 0) + (debitNormal ? net : -net)
}

// Validate a journal's lines balance before insert.
export const balanceError = (lines) => {
  if (!lines || lines.length < 2) return 'A journal entry needs at least two lines.'
  for (const l of lines) {
    if (!l.account_id) return 'Every line needs an account.'
    if ((Number(l.debit) || 0) <= 0 && (Number(l.credit) || 0) <= 0) return 'Each line needs a debit or credit amount.'
  }
  const debits = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const credits = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  if (Math.abs(debits - credits) > 0.01) return `Entry does not balance: Debits ${debits.toFixed(2)} vs Credits ${credits.toFixed(2)}.`
  return null
}

// Next sequential journal number, e.g. JE-26-000123 (mirrors the receipt pattern).
export async function nextJournalNumber(supabase, schoolId, year = new Date().getFullYear()) {
  const yearStr = String(year).slice(-2)
  const { data } = await supabase
    .from('journal_entries')
    .select('entry_no')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(1)
  let seq = 1
  if (data?.length && data[0].entry_no?.startsWith(`JE-${yearStr}-`)) {
    seq = parseInt(data[0].entry_no.split('-')[2]) + 1
  }
  return `JE-${yearStr}-${String(seq).padStart(5, '0')}`
}

// Ensure specific accounts exist for a school — inserts any missing defaults
// so downstream modules (Payroll, Assets, AP/Expenses) never break on absent
// accounts if the chart was never manually seeded.
export async function ensureAccounts(supabase, schoolId, codes) {
  const { data: existing } = await supabase
    .from('chart_of_accounts')
    .select('code')
    .eq('school_id', schoolId)
  const have = new Set((existing || []).map((a) => a.code))
  const missing = DEFAULT_CHART.filter((c) => codes.includes(c.code) && !have.has(c.code))
  if (!missing.length) return
  const { error } = await supabase
    .from('chart_of_accounts')
    .insert(missing.map((c) => ({ ...c, school_id: schoolId })))
  if (error) throw error
}

// Post a balanced entry straight through (status = posted). Used by this page
// and later by Payroll, Assets, AP/Expenses modules.
export async function postToJournal(supabase, {
  schoolId, userId, entry_date, description, source = 'manual',
  reference_type = null, reference_id = null, lines,
}) {
  const entry_no = await nextJournalNumber(supabase, schoolId)
  const { data: je, error } = await supabase
    .from('journal_entries')
    .insert({
      school_id: schoolId,
      entry_no,
      entry_date,
      description,
      source,
      reference_type,
      reference_id,
      status: 'posted',
      created_by: userId,
      posted_by: userId,
      posted_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  const { error: linesErr } = await supabase
    .from('journal_entry_lines')
    .insert(lines.map((l) => ({
      journal_entry_id: je.id,
      account_id: l.account_id,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      notes: l.notes || null,
    })))
  if (linesErr) throw linesErr
  return je
}

// Write a school-scoped finance audit record.
export async function writeAudit(supabase, { schoolId, action, details = {} }) {
  const { data: user } = await supabase.auth.getUser()
  return supabase.from('audit_logs').insert({
    school_id: schoolId,
    action,
    details,
    performed_by: user?.user?.id || null,
  })
}

// Load chart of accounts + all journal lines + entries in one pass.
// Lines carry their parent entry, so callers can filter to posted only.
export async function loadLedgerData(supabase, schoolId) {
  const [accRes, lineRes, entryRes] = await Promise.all([
    supabase.from('chart_of_accounts').select('*').eq('school_id', schoolId).order('code'),
    supabase
      .from('journal_entry_lines')
      .select('*, journal_entries!inner(entry_no, entry_date, description, source, status, posted_at)')
      .order('created_at', { ascending: true }),
    supabase.from('journal_entries').select('*').eq('school_id', schoolId).order('created_at', { ascending: false }),
  ])

  const accounts = accRes.data || []
  const lines = lineRes.data || []
  const entries = entryRes.data || []
  return { accounts, lines, entries }
}

// Lines belonging to entries that are actually posted (drives balances).
export const postedLines = (lines) =>
  (lines || []).filter((l) => l.journal_entries?.status === 'posted')

// Group posted lines by account id.
export const groupLinesByAccount = (lines) => {
  const map = {}
  lines.forEach((l) => {
    if (!map[l.account_id]) map[l.account_id] = []
    map[l.account_id].push(l)
  })
  return map
}
