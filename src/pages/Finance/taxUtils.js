// ─── Kenyan Tax Capital Allowances utilities ────────────────────────────────
// A fully separate layer from accounting depreciation. Accounting depreciation
// posts to the General Ledger; tax capital allowances are a tax-computation
// item maintained ONLY in the tax schedule / reporting layer.
//
// All statutory rates/classes live in the `tax_rules` table (school-scoped,
// effective-date based) and are editable by authorised finance users in
// Finance → Fixed Assets → Tax Rules. The seed below is initial data ONLY —
// never treat these as permanently correct legislation.

import { calcNbv } from './assetsUtils'

export const TAX_METHODS = [
  { value: 'reducing_balance', label: 'Reducing Balance' },
  { value: 'straight_line', label: 'Straight-Line (% of cost)' },
  { value: 'flat_percentage', label: 'Flat % of Cost' },
]

export const TAX_RULE_TYPES = [
  { value: 'wear_tear', label: 'Wear & Tear Allowance' },
  { value: 'investment', label: 'Investment Allowance' },
]

export const FINANCE_ROLES = ['admin', 'bursar', 'deputy_administrator', 'superadmin']

// Initial statutory seed — mirrors supabase/migrations/045_tax_capital_allowances.sql.
// Only inserted for a school that has no rules yet; everything here is editable.
export const DEFAULT_TAX_RULES = [
  // Wear & Tear — Income Tax Act (Cap 470) Second Schedule
  { rule_type: 'wear_tear', tax_class: 'class_i', description: 'Class I', asset_classification: 'Computers, word processors, calculators, copiers, duplicating machines and other electronic/data-processing equipment', rate: 37.5, first_year_rate: 0, calc_method: 'reducing_balance', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Second Schedule, Class I (as amended)', is_active: true },
  { rule_type: 'wear_tear', tax_class: 'class_ii', description: 'Class II', asset_classification: 'Self-propelling and other machines and plant (incl. manufacturing machinery, construction and earth-moving equipment)', rate: 30, first_year_rate: 0, calc_method: 'reducing_balance', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Second Schedule, Class II (as amended)', is_active: true },
  { rule_type: 'wear_tear', tax_class: 'class_iii', description: 'Class III', asset_classification: 'Motor vehicles and heavy earth-moving equipment (non-self-propelling)', rate: 25, first_year_rate: 0, calc_method: 'reducing_balance', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Second Schedule, Class III (as amended)', is_active: true },
  { rule_type: 'wear_tear', tax_class: 'class_iv', description: 'Class IV', asset_classification: 'Furniture, fixtures and general fittings', rate: 12.5, first_year_rate: 0, calc_method: 'reducing_balance', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Second Schedule, Class IV (as amended)', is_active: true },
  // Investment allowance — Buildings
  { rule_type: 'investment', tax_class: 'inv_b_hotel', description: 'Buildings — Hotel buildings', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
  { rule_type: 'investment', tax_class: 'inv_b_manufacture', description: 'Buildings — Buildings used for manufacture', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
  { rule_type: 'investment', tax_class: 'inv_b_hospital', description: 'Buildings — Hospital buildings', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
  { rule_type: 'investment', tax_class: 'inv_b_petroleum', description: 'Buildings — Petroleum/gas storage facilities', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
  { rule_type: 'investment', tax_class: 'inv_b_educational', description: 'Buildings — Educational buildings incl. student hostels', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
  { rule_type: 'investment', tax_class: 'inv_b_commercial', description: 'Buildings — Commercial buildings', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
  { rule_type: 'investment', tax_class: 'inv_b_industrial', description: 'Buildings — Industrial buildings', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
  { rule_type: 'investment', tax_class: 'inv_b_other', description: 'Buildings — Other qualifying buildings', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
  // Investment allowance — Machinery
  { rule_type: 'investment', tax_class: 'inv_m_manufacture', description: 'Machinery — Machinery used for manufacture', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
  { rule_type: 'investment', tax_class: 'inv_m_hospital', description: 'Machinery — Hospital equipment', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
  { rule_type: 'investment', tax_class: 'inv_m_ships_aircraft', description: 'Machinery — Ships/aircraft', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
  { rule_type: 'investment', tax_class: 'inv_m_motor_vehicles', description: 'Machinery — Motor vehicles and heavy earth-moving equipment', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
  { rule_type: 'investment', tax_class: 'inv_m_computers', description: 'Machinery — Computer and peripheral computer hardware/software', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
  { rule_type: 'investment', tax_class: 'inv_m_copiers', description: 'Machinery — Calculators, copiers and duplicating machines', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
  { rule_type: 'investment', tax_class: 'inv_m_other', description: 'Machinery — Other qualifying machinery', asset_classification: null, rate: 25, first_year_rate: 50, calc_method: 'flat_percentage', effective_date: '2017-01-01', source_reference: 'Income Tax Act (Cap 470) — Investment Deduction (as amended)', is_active: true },
]

export const methodLabel = (m) => TAX_METHODS.find((x) => x.value === m)?.label || m || '—'

// Pick the active rule for a tax class + type as at a given date (latest effective).
export const activeRule = (rules, taxClass, type, asOf = new Date()) => {
  if (!taxClass) return null
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf)
  return (rules || [])
    .filter((r) =>
      r.tax_class === taxClass &&
      r.rule_type === type &&
      r.is_active &&
      new Date(r.effective_date) <= asOfDate &&
      (!r.expiry_date || new Date(r.expiry_date) >= asOfDate))
    .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date))[0] || null
}

// Human label for a class among a rule set (or the raw code).
export const taxRuleLabel = (rules, taxClass, type) => {
  if (!taxClass) return null
  const r = (rules || []).find((x) => x.tax_class === taxClass && (!type || x.rule_type === type))
  return r ? (r.description || r.asset_classification || r.tax_class) : taxClass
}

// Snapshot of the rule version used for a schedule row — retains history.
export const ruleSnapshot = (rule) => rule ? {
  rule_id: rule.id,
  tax_class: rule.tax_class,
  description: rule.description,
  asset_classification: rule.asset_classification,
  rate: Number(rule.rate),
  first_year_rate: Number(rule.first_year_rate),
  calc_method: rule.calc_method,
  effective_date: rule.effective_date,
  expiry_date: rule.expiry_date,
  source_reference: rule.source_reference,
} : null

// Ensure a school has the default statutory rules (safety net for schools
// created before migration 045's trigger / backfill ran).
export async function ensureDefaultTaxRules(supabase, schoolId) {
  if (!schoolId) return
  const { count } = await supabase
    .from('tax_rules')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
  if (count === 0) {
    await supabase.from('tax_rules').insert(
      DEFAULT_TAX_RULES.map((r) => ({ ...r, school_id: schoolId }))
    )
  }
}

// Load rules + per-asset tax schedules in one pass.
export async function loadTaxData(supabase, schoolId) {
  const [ruleRes, schedRes] = await Promise.all([
    supabase.from('tax_rules').select('*').eq('school_id', schoolId).order('effective_date', { ascending: false }),
    supabase.from('asset_tax_schedules').select('*, fixed_assets(name, asset_id)')
      .eq('school_id', schoolId).order('year_of_income', { ascending: false }),
  ])
  return { taxRules: ruleRes.data || [], taxSchedules: schedRes.data || [] }
}

// ─── Tax computation ────────────────────────────────────────────────────────
// Pure function: computes one year of income for one asset. Never touches
// accounting fields — accounting NBV / accumulated depreciation are unchanged.

export function computeTaxAllowance({ asset, rule, investmentRule, yearOfIncome, opening }) {
  const basis = Number(asset?.purchase_cost || 0)
  const openingWtd = opening != null ? Math.max(0, Number(opening)) : basis
  const acqYear = asset?.purchase_date ? new Date(asset.purchase_date).getFullYear() : yearOfIncome

  let wearRate = 0
  let wearAllowance = 0
  if (rule) {
    wearRate = Number(rule.rate) || 0
    wearAllowance = rule.calc_method === 'reducing_balance'
      ? (openingWtd * wearRate) / 100
      : (basis * wearRate) / 100
  }

  let invRate = 0
  let invAllowance = 0
  if (investmentRule) {
    const firstYearRate = Number(investmentRule.first_year_rate) || 0
    const annualRate = Number(investmentRule.rate) || 0
    if (firstYearRate > 0 && yearOfIncome === acqYear) {
      invRate = firstYearRate
      invAllowance = (basis * firstYearRate) / 100
    } else if (annualRate > 0) {
      invRate = annualRate
      invAllowance = (openingWtd * annualRate) / 100
    }
  }

  const total = Math.min(Math.max(0, wearAllowance + invAllowance), openingWtd)
  return {
    tax_basis: basis,
    opening_wtd: openingWtd,
    wear_tear_rate: wearRate,
    wear_tear_allowance: Math.min(Math.max(0, wearAllowance), openingWtd),
    investment_rate: invRate,
    investment_allowance: invAllowance,
    total_allowance: total,
    closing_wtd: Math.max(0, openingWtd - total),
  }
}

// Compute an in-memory schedule row for one asset + year (live preview).
export function computeAssetSchedule({ asset, taxRules, taxSchedules, yearOfIncome }) {
  const asOf = `${yearOfIncome}-12-31`
  const rule = activeRule(taxRules, asset.tax_class, 'wear_tear', asOf)
  const investmentRule = activeRule(taxRules, asset.investment_class, 'investment', asOf)
  const prev = (taxSchedules || []).find((s) => s.asset_id === asset.id && s.year_of_income === yearOfIncome - 1)
  const calc = computeTaxAllowance({ asset, rule, investmentRule, yearOfIncome, opening: prev ? prev.closing_wtd : null })
  return {
    asset,
    rule,
    investmentRule,
    ...calc,
    persisted: (taxSchedules || []).find((s) => s.asset_id === asset.id && s.year_of_income === yearOfIncome) || null,
  }
}

// Build the schedule view for all eligible assets for a year.
export const buildTaxSchedule = ({ assets, taxRules, taxSchedules, yearOfIncome }) =>
  (assets || [])
    .filter((a) => a.status !== 'disposed' && a.tax_class)
    .map((a) => computeAssetSchedule({ asset: a, taxRules, taxSchedules, yearOfIncome }))

// Persist a year's tax allowances. Tax rows carry a snapshot of the rule
// version used; re-running later (after a rule change) writes a NEW row via
// upsert with the then-current rules — prior rows keep their snapshot.
export async function runTaxAllowances({ supabase, schoolId, userId, yearOfIncome, rows }) {
  const eligible = rows.filter((r) => r.rule)
  if (!eligible.length) return 0
  const inserts = eligible.map((r) => ({
    school_id: schoolId,
    asset_id: r.asset.id,
    year_of_income: yearOfIncome,
    rule_id: r.rule?.id || null,
    investment_rule_id: r.investmentRule?.id || null,
    tax_class: r.asset.tax_class,
    tax_basis: r.tax_basis,
    opening_wtd: r.opening_wtd,
    wear_tear_rate: r.wear_tear_rate,
    wear_tear_allowance: r.wear_tear_allowance,
    investment_rate: r.investment_rate,
    investment_allowance: r.investment_allowance,
    total_allowance: r.total_allowance,
    closing_wtd: r.closing_wtd,
    rule_snapshot: {
      wear_tear: ruleSnapshot(r.rule),
      investment: ruleSnapshot(r.investmentRule),
    },
    created_by: userId,
  }))
  const { error } = await supabase
    .from('asset_tax_schedules')
    .upsert(inserts, { onConflict: 'school_id,asset_id,year_of_income' })
  if (error) throw error
  return inserts.length
}

// Reconciliation: accounting NBV vs tax WTD per asset.
export const taxVsAccounting = ({ assets, taxRules, taxSchedules, yearOfIncome }) =>
  buildTaxSchedule({ assets, taxRules, taxSchedules, yearOfIncome })
    .map((r) => ({
      asset: r.asset,
      accountingNbv: calcNbv(r.asset),
      taxWtd: r.closing_wtd,
      difference: r.closing_wtd - calcNbv(r.asset),
    }))
    .sort((a, b) => a.asset.name.localeCompare(b.asset.name))
