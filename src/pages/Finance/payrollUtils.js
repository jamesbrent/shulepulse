// ─── Payroll utilities ────────────────────────────────────────────────────
// Kenya-compliant payroll engine. Statutory rates are NOT hard-coded in the
// math — they come from payroll_statutory_config (effective-date based), so
// when KRA/NSSF/SHIF change the school just edits a config row and re-runs.
// Payments flow into the General Ledger via postToJournal().

import { ensureAccounts, postToJournal, writeAudit } from './accountsUtils'

// ─── Kenya 2026 statutory defaults (mirrors migration 039 seed) ────────────
export const KENYA_STATUTORY_DEFAULTS = [
  {
    item: 'paye_bands',
    value: {
      bands: [
        { from: 0,      up_to: 24000,  rate: 10 },
        { from: 24000,  up_to: 32333,  rate: 25 },
        { from: 32333,  up_to: 500000, rate: 30 },
        { from: 500000, up_to: 800000, rate: 32.5 },
        { from: 800000, up_to: null,   rate: 35 },
      ],
    },
    effective_from: '2026-01-01',
    notes: 'Income Tax Act (Finance Act 2023) PAYE bands',
  },
  { item: 'personal_relief', value: { amount: 2400 }, effective_from: '2026-01-01', notes: 'Monthly personal relief' },
  {
    item: 'nssf_rate',
    value: { rate: 6, tier1_ceiling: 9000, tier2_ceiling: 108000, max: 6480, employer_match: true },
    effective_from: '2026-01-01',
    notes: 'NSSF Act 2013 as amended — 6% both tiers, capped at 6,480',
  },
  { item: 'shif_rate', value: { rate: 2.75, ceiling: null }, effective_from: '2026-01-01', notes: 'SHIF/SHA 2.75% of gross' },
  { item: 'housing_levy_rate', value: { rate: 1.5, employer_rate: 1.5 }, effective_from: '2026-01-01', notes: 'Affordable Housing Levy 1.5% employee + 1.5% employer' },
  { item: 'nita_amount', value: { amount: 50, employer_only: true }, effective_from: '2026-01-01', notes: 'NITA levy KSh 50/month, employer only' },
  { item: 'allowance_exempt_threshold', value: { amount: 2000 }, effective_from: '2026-01-01', notes: 'Tax-free amount per "Taxable Above Threshold" allowance (monthly)' },
]

export const RUN_STATUSES = [
  { value: 'draft',      label: 'Draft',      color: '#64748b' },
  { value: 'calculated', label: 'Calculated', color: '#2563eb' },
  { value: 'reviewed',   label: 'Reviewed',   color: '#7c3aed' },
  { value: 'approved',   label: 'Approved',   color: '#d97706' },
  { value: 'posted',     label: 'Posted',     color: '#0891b2' },
  { value: 'paid',       label: 'Paid',       color: '#16a34a' },
  { value: 'cancelled',  label: 'Cancelled',  color: '#dc2626' },
]

export const PAYMENT_STATUSES = [
  { value: 'initiated', label: 'Initiated', color: '#64748b' },
  { value: 'reviewed',  label: 'Reviewed',  color: '#2563eb' },
  { value: 'approved',  label: 'Approved',  color: '#d97706' },
  { value: 'processed', label: 'Processed', color: '#0891b2' },
  { value: 'posted',    label: 'Posted',    color: '#7c3aed' },
  { value: 'cancelled', label: 'Cancelled', color: '#dc2626' },
]

export const ITEM_TYPES = [
  { value: 'allowance',              label: 'Allowance' },
  { value: 'overtime',               label: 'Overtime' },
  { value: 'bonus',                  label: 'Bonus' },
  { value: 'employee_deduction',     label: 'Deduction' },
  { value: 'employer_contribution',  label: 'Employer Contribution' },
  { value: 'loan',                   label: 'Loan Recovery' },
  { value: 'advance',                label: 'Advance Recovery' },
]

export const PAY_METHODS = [
  { value: 'bank',   label: 'Bank Transfer' },
  { value: 'mobile', label: 'Mobile Money' },
  { value: 'cash',   label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
]

// Allowance tax treatments (payroll_employee_items.tax_treatment)
export const ALLOWANCE_TAX_TREATMENTS = [
  { value: 'taxable',                 label: 'Taxable' },
  { value: 'non_taxable',             label: 'Non-Taxable' },
  { value: 'taxable_above_threshold', label: 'Taxable Above Threshold' },
  { value: 'reimbursement',           label: 'Reimbursement / Expense Claim' },
]

export const allowanceTreatmentLabel = (t) =>
  ALLOWANCE_TAX_TREATMENTS.find((x) => x.value === t)?.label || 'Taxable'

export const runStatus = (s) => RUN_STATUSES.find((x) => x.value === s) || RUN_STATUSES[0]
export const paymentStatus = (s) => PAYMENT_STATUSES.find((x) => x.value === s) || PAYMENT_STATUSES[0]

const toNum = (n) => Number(n || 0)
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100

// ─── Config helpers ─────────────────────────────────────────────────────────

export async function ensureStatutoryDefaults(supabase, schoolId) {
  const { data } = await supabase
    .from('payroll_statutory_config')
    .select('id')
    .eq('school_id', schoolId)
    .limit(1)
  if (data?.length) return
  const { error } = await supabase.from('payroll_statutory_config').insert(
    KENYA_STATUTORY_DEFAULTS.map((d) => ({
      school_id: schoolId,
      item: d.item,
      value: d.value,
      effective_from: d.effective_from,
      notes: d.notes,
    }))
  )
  if (error) throw error
}

// Latest (by effective_from) approved config value per item. Pending/rejected
// rows (bursar edits awaiting admin approval) never affect calculations but
// are returned in _rows so the UI can surface approval requests.
export async function getStatutoryConfig(supabase, schoolId) {
  await ensureStatutoryDefaults(supabase, schoolId)
  const { data, error } = await supabase
    .from('payroll_statutory_config')
    .select('*')
    .eq('school_id', schoolId)
    .order('effective_from', { ascending: false })
  if (error) throw error
  const rows = data || []
  const approved = rows.filter((r) => r.status === 'approved')
  const latest = {}
  for (const row of approved) {
    if (!latest[row.item]) latest[row.item] = row.value
  }
  const paye = latest.paye_bands?.bands || KENYA_STATUTORY_DEFAULTS[0].value.bands
  return {
    payeBands: paye,
    personalRelief: toNum(latest.personal_relief?.amount ?? 2400),
    nssf: latest.nssf_rate || { rate: 6, max: 6480, employer_match: true },
    shif: latest.shif_rate || { rate: 2.75, ceiling: null },
    housing: latest.housing_levy_rate || { rate: 1.5, employer_rate: 1.5 },
    nita: latest.nita_amount || { amount: 50, employer_only: true },
    allowanceExemptAmount: toNum(latest.allowance_exempt_threshold?.amount ?? 2000),
    _rows: rows,
  }
}

// ─── Statutory math ─────────────────────────────────────────────────────────

export const progressiveTax = (taxable, bands = [], relief = 0) => {
  let tax = 0
  let remaining = Math.max(toNum(taxable), 0)
  for (const band of bands) {
    if (remaining <= 0) break
    const width = band.up_to == null ? remaining : Math.max(band.up_to - band.from, 0)
    const slice = Math.min(remaining, width)
    tax += slice * (band.rate / 100)
    remaining -= slice
  }
  return round2(Math.max(tax - toNum(relief), 0))
}

// NSSF Act 2013 two-tier structure (Third Schedule). Feb 2026 Phase 4 limits:
//   Tier I — 6% of pensionable earnings up to the Lower Earnings Limit (9,000)
//   Tier II — 6% of earnings between the Lower and Upper Earnings Limit (108,000)
// Employee and employer each contribute 6% (employer_match), employee side
// capped at 6,480/month (6% × 108,000).
export const nssfContribution = (gross, cfg = {}) => {
  const rate = (toNum(cfg.rate) || 6) / 100
  const tier1 = toNum(cfg.tier1_ceiling)
  const tier2 = toNum(cfg.tier2_ceiling)
  const g = Math.max(toNum(gross), 0)
  if (!(tier1 > 0) && !(tier2 > 0)) {
    const max = toNum(cfg.max)
    const raw = g * rate
    return round2(max > 0 ? Math.min(raw, max) : raw)
  }
  let contrib = 0
  if (tier1 > 0) contrib += Math.min(g, tier1) * rate
  if (tier2 > tier1) contrib += Math.min(Math.max(g - tier1, 0), tier2 - tier1) * rate
  return round2(contrib)
}

export const shifContribution = (gross, cfg = {}) => {
  const rate = toNum(cfg.rate) || 2.75
  const ceiling = toNum(cfg.ceiling)
  const grossAmt = Math.max(toNum(gross), 0)
  const capped = ceiling > 0 ? Math.min(grossAmt, ceiling) : grossAmt
  return round2(capped * (rate / 100))
}

// ─── Per-employee computation ───────────────────────────────────────────────
// emp.items is an array of payroll_employee_items rows. breakdown is stored
// on payroll_lines.breakdown for full payslip itemisation.
export function computeEmployeePay(emp, config) {
  const items = (emp.items || []).filter((i) => i.active !== false)
  const basic = round2(emp.basic_salary)
  const threshold = toNum(config.allowanceExemptAmount) || 0

  // Allowance tax treatments:
  //   taxable                 → Gross + Taxable
  //   non_taxable             → Gross only
  //   taxable_above_threshold → Gross + (amount − threshold) taxable
  //   reimbursement           → expense claim: excluded from Gross, Taxable and
  //                             the payroll journal (not in allowances_total)
  const allowances = items.filter((i) => i.item_type === 'allowance').map((i) => ({
    name: i.name,
    amount: toNum(i.amount),
    tax_treatment: i.tax_treatment || (i.is_taxable ? 'taxable' : 'non_taxable'),
  }))
  const earningsAllowances = allowances.filter((a) => a.tax_treatment !== 'reimbursement')
  const reimbursements = allowances.filter((a) => a.tax_treatment === 'reimbursement')
  const taxableAllowanceAmounts = earningsAllowances.map((a) => {
    if (a.tax_treatment === 'taxable') return a.amount
    if (a.tax_treatment === 'taxable_above_threshold') return Math.max(a.amount - threshold, 0)
    return 0
  })
  const allowancesTotal = round2(earningsAllowances.reduce((s, a) => s + a.amount, 0))
  const taxableAllowances = round2(taxableAllowanceAmounts.reduce((s, a) => s + a, 0))

  const overtime = round2(items.filter((i) => i.item_type === 'overtime').reduce((s, i) => s + toNum(i.amount), 0))
  const bonus = round2(items.filter((i) => i.item_type === 'bonus').reduce((s, i) => s + toNum(i.amount), 0))
  const grossPay = round2(basic + allowancesTotal + overtime + bonus)

  const taxablePay = round2(basic + taxableAllowances + overtime + bonus)
  const paye = progressiveTax(taxablePay, config.payeBands, config.personalRelief)
  const shif = shifContribution(grossPay, config.shif)
  const nssfEe = nssfContribution(grossPay, config.nssf)
  const nssfEr = round2(nssfEe * (config.nssf.employer_match === false ? 0 : 1))
  const housingEe = round2(grossPay * (toNum(config.housing.rate) / 100))
  const housingEr = round2(grossPay * (toNum(config.housing.employer_rate ?? config.housing.rate) / 100))
  const nita = config.nita.employer_only === false ? 0 : toNum(config.nita.amount)

  const helbItems = items.filter((i) => i.item_type === 'employee_deduction' && i.is_helb)
  const helb = round2(helbItems.reduce((s, i) => s + toNum(i.amount), 0))
  const otherDeductions = round2(
    items
      .filter((i) => ['employee_deduction', 'loan', 'advance'].includes(i.item_type) && !(i.item_type === 'employee_deduction' && i.is_helb))
      .reduce((s, i) => s + toNum(i.amount), 0)
  )

  const netPay = round2(grossPay - paye - shif - nssfEe - housingEe - helb - otherDeductions)

  const employerItems = items.filter((i) => i.item_type === 'employer_contribution')
  const employerItemsTotal = round2(employerItems.reduce((s, i) => s + toNum(i.amount), 0))
  const employerTotal = round2(nssfEr + housingEr + nita + employerItemsTotal)

  return {
    basic_salary: basic,
    allowances: earningsAllowances,
    allowances_total: allowancesTotal,
    reimbursements_total: round2(reimbursements.reduce((s, a) => s + a.amount, 0)),
    overtime,
    bonus,
    gross_pay: grossPay,
    taxable_pay: taxablePay,
    paye,
    shif,
    nssf_employee: nssfEe,
    nssf_employer: nssfEr,
    housing_employee: housingEe,
    housing_employer: housingEr,
    nita,
    helb,
    other_deductions: otherDeductions,
    net_pay: netPay,
    employer_items: employerItems.map((i) => ({ name: i.name, amount: toNum(i.amount) })),
    employer_total: employerTotal,
    breakdown: {
      allowances: earningsAllowances,
      taxable_allowances: earningsAllowances.filter((a) => a.tax_treatment === 'taxable').map((a) => ({ name: a.name, amount: a.amount })),
      non_taxable_allowances: earningsAllowances.filter((a) => a.tax_treatment === 'non_taxable').map((a) => ({ name: a.name, amount: a.amount })),
      threshold_allowances: earningsAllowances.filter((a) => a.tax_treatment === 'taxable_above_threshold').map((a) => ({
        name: a.name,
        amount: a.amount,
        tax_free_amount: round2(Math.min(a.amount, threshold)),
        taxable_amount: round2(Math.max(a.amount - threshold, 0)),
      })),
      reimbursements: reimbursements.map((a) => ({ name: a.name, amount: a.amount })),
      overtime: overtime,
      bonus: bonus,
      helb_items: helbItems.map((i) => ({ name: i.name, amount: toNum(i.amount) })),
      other_deductions_items: items
        .filter((i) => ['employee_deduction', 'loan', 'advance'].includes(i.item_type) && !(i.item_type === 'employee_deduction' && i.is_helb))
        .map((i) => ({ name: i.name, amount: toNum(i.amount) })),
      employer_items: employerItems.map((i) => ({ name: i.name, amount: toNum(i.amount) })),
    },
  }
}

// ─── Data loading ───────────────────────────────────────────────────────────

export async function loadPayrollData(supabase, schoolId) {
  const [cfg, empRes, periodRes, runRes] = await Promise.all([
    getStatutoryConfig(supabase, schoolId),
    supabase
      .from('payroll_employees')
      .select('*, profiles!payroll_employees_profile_id_fkey(full_name, phone)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: true }),
    supabase.from('payroll_periods').select('*').eq('school_id', schoolId).order('period_year', { ascending: false }).order('period_month', { ascending: false }),
    supabase.from('payroll_runs').select('*, payroll_periods(period_month, period_year, period_label), payroll_lines(*)').eq('school_id', schoolId).order('created_at', { ascending: false }),
  ])
  const employees = (empRes.data || []).map((e) => ({ ...e, full_name: e.profiles?.full_name || e.employee_no }))
  const itemsRes = await supabase
    .from('payroll_employee_items')
    .select('*')
    .eq('school_id', schoolId)
  const items = itemsRes.data || []
  const itemsByEmp = {}
  for (const it of items) (itemsByEmp[it.employee_id] = itemsByEmp[it.employee_id] || []).push(it)
  employees.forEach((e) => { e.items = itemsByEmp[e.id] || [] })
  const runs = runRes.data || []
  return { config: cfg, employees, items, periods: periodRes.data || [], runs }
}

export async function loadEmployee(supabase, schoolId, employeeId) {
  const { data: emp } = await supabase
    .from('payroll_employees')
    .select('*, profiles!payroll_employees_profile_id_fkey(full_name, phone)')
    .eq('school_id', schoolId)
    .eq('id', employeeId)
    .single()
  if (!emp) return null
  const { data: items } = await supabase
    .from('payroll_employee_items')
    .select('*')
    .eq('school_id', schoolId)
    .eq('employee_id', employeeId)
    .order('item_type', { ascending: true })
  return { ...emp, full_name: emp.profiles?.full_name || emp.employee_no, items: items || [] }
}

// ─── Number helpers ─────────────────────────────────────────────────────────

async function nextNumber(supabase, schoolId, table, prefix, codeColumn) {
  const { data } = await supabase
    .from(table)
    .select(codeColumn)
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(1)
  let seq = 1
  if (data?.length && data[0][codeColumn]?.startsWith(prefix)) {
    seq = parseInt(data[0][codeColumn].split('-').pop()) + 1
  }
  return `${prefix}${String(seq).padStart(4, '0')}`
}

export const nextEmployeeNo = (supabase, schoolId) => nextNumber(supabase, schoolId, 'payroll_employees', 'EMP-', 'employee_no')
export const nextRunNo = (supabase, schoolId) => nextNumber(supabase, schoolId, 'payroll_runs', 'PR-', 'run_no')
export const nextRequestNo = (supabase, schoolId) => nextNumber(supabase, schoolId, 'payroll_payment_requests', 'PRQ-', 'request_no')

// ─── GL posting ─────────────────────────────────────────────────────────────
// Payroll integrates with the school's Chart of Accounts through a configurable
// mapping (Payroll → Accounting Mapping). No GL codes are hard-coded here — each
// item resolves to the account the accountant chose, falling back to the default
// code only if the school never saved a mapping for it.
export const ACCOUNT_MAPPING_ITEMS = {
  basic_teaching:         { label: 'Teaching Staff Basic Salary', defaultCode: '5010' },
  basic_non_teaching:     { label: 'Non-Teaching Staff Basic Salary', defaultCode: '5020' },
  allowances:             { label: 'Allowances, Bonuses & Overtime', defaultCode: '5040' },
  employer_contributions: { label: 'Employer NSSF, Housing Levy, NITA', defaultCode: '5030' },
  paye:                   { label: 'PAYE Withheld', defaultCode: '2110' },
  shif:                   { label: 'SHIF/SHA Employee Contribution', defaultCode: '2115' },
  nssf:                   { label: 'NSSF (Employee + Employer)', defaultCode: '2130' },
  housing_levy:           { label: 'Housing Levy (Employee + Employer)', defaultCode: '2116' },
  nita:                   { label: 'NITA Levy', defaultCode: '2117' },
  helb:                   { label: 'HELB Recovery', defaultCode: '2140' },
  other_deductions:       { label: 'SACCO, Union & Other Recoveries', defaultCode: '2151' },
  net_pay:                { label: 'Net Pay (Wages Payable)', defaultCode: '2150' },
  bank:                   { label: 'Bank / Cash Disbursement', defaultCode: '1020' },
}

export const ACCOUNT_MAPPING_KEYS = Object.keys(ACCOUNT_MAPPING_ITEMS)
export const ACCOUNT_MAPPING_DEFAULT_CODES = ACCOUNT_MAPPING_KEYS.map((k) => ACCOUNT_MAPPING_ITEMS[k].defaultCode)

// Resolve { item → account_id } for a school. Unmapped items fall back to the
// default code; ensureAccounts() lazily creates any code the chart is missing.
export async function resolveAccountMap(supabase, schoolId) {
  await ensureAccounts(supabase, schoolId, ACCOUNT_MAPPING_DEFAULT_CODES)
  const [accRes, mapRes] = await Promise.all([
    supabase.from('chart_of_accounts').select('id, code').eq('school_id', schoolId),
    supabase.from('payroll_account_mapping').select('item, account_id').eq('school_id', schoolId),
  ])
  const byCode = Object.fromEntries((accRes.data || []).map((a) => [a.code, a.id]))
  const mapped = Object.fromEntries((mapRes.data || []).map((r) => [r.item, r.account_id]))
  const resolved = {}
  for (const key of ACCOUNT_MAPPING_KEYS) {
    const id = mapped[key] || byCode[ACCOUNT_MAPPING_ITEMS[key].defaultCode]
    if (id) resolved[key] = id
  }
  return { byCode, map: resolved }
}

// Aggregates a posted payroll run into one balanced journal entry:
//   Debit  Salaries (teaching / non-teaching) | Allowances & Overtime |
//          Employer Statutory Contributions
//   Credit PAYE | SHIF | NSSF | Housing Levy | NITA | HELB |
//          Other Deductions | Wages Payable
export async function postPayrollJournal(supabase, { schoolId, userId, runId, entryDate, lines }) {
  const { map } = await resolveAccountMap(supabase, schoolId)
  const acc = (item) => {
    const account_id = map[item]
    if (!account_id) throw new Error(`No GL account mapped for "${ACCOUNT_MAPPING_ITEMS[item].label}" — set it in Payroll → Accounting Mapping`)
    return account_id
  }
  const sum = (fn) => lines.reduce((s, l) => s + toNum(fn(l)), 0)
  const mk = (item, amount, notes) => ({ account_id: acc(item), amount: round2(amount), notes })
  const debit = (item, amount, notes) => mk(item, amount, notes)
  const credit = (item, amount, notes) => mk(item, amount, notes)

  const salaryTeaching = sum((l) => (l.staff_type === 'teaching' ? l.basic_salary : 0))
  const salaryNonTeaching = sum((l) => (l.staff_type === 'non_teaching' ? l.basic_salary : 0))
  const allowances = sum((l) => l.allowances_total + l.overtime + (l.breakdown?.bonus || 0))
  const employerItemsTotal = sum((l) => (l.breakdown?.employer_items || []).reduce((s, i) => s + toNum(i.amount), 0))
  const employerContrib = sum((l) => l.nssf_employer + l.housing_employer + l.nita)
  const nssfTotal = sum((l) => l.nssf_employee + l.nssf_employer)
  const housingTotal = sum((l) => l.housing_employee + l.housing_employer)

  const journalLines = []
  if (salaryTeaching > 0) journalLines.push(debit('basic_teaching', salaryTeaching, 'Teaching staff basic salaries'))
  if (salaryNonTeaching > 0) journalLines.push(debit('basic_non_teaching', salaryNonTeaching, 'Non-teaching staff basic salaries'))
  if (allowances > 0) journalLines.push(debit('allowances', allowances, 'Allowances, bonuses & overtime'))
  journalLines.push(debit('employer_contributions', employerContrib + employerItemsTotal, 'Employer NSSF, Housing Levy, NITA & contributions'))
  journalLines.push(credit('paye', sum((l) => l.paye), 'PAYE tax withheld'))
  journalLines.push(credit('shif', sum((l) => l.shif), 'SHIF/SHA employee contribution'))
  journalLines.push(credit('nssf', nssfTotal, 'NSSF (employee + employer)'))
  journalLines.push(credit('housing_levy', housingTotal, 'Housing Levy (employee + employer)'))
  journalLines.push(credit('nita', sum((l) => l.nita), 'NITA levy (employer)'))
  journalLines.push(credit('helb', sum((l) => l.helb), 'HELB loan recovery'))
  journalLines.push(credit('other_deductions', sum((l) => l.other_deductions) + employerItemsTotal, 'SACCO, union & other recoveries + employer contributions'))
  journalLines.push(credit('net_pay', sum((l) => l.net_pay), 'Net pay (wages payable)'))

  const je = await postToJournal(supabase, {
    schoolId,
    userId,
    entry_date: entryDate,
    description: 'Payroll journal',
    source: 'payroll',
    reference_type: 'payroll_run',
    reference_id: runId,
    lines: journalLines,
  })
  await writeAudit(supabase, {
    schoolId,
    action: 'payroll_posted',
    details: { run_id: runId, journal_id: je.id, employees: lines.length },
  })
  return je
}
