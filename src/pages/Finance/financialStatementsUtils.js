// ─── Financial statement computation (ONE accounting foundation) ────────────
// Every statement is derived from the SAME General Ledger source as the Trial
// Balance: chart_of_accounts + journal_entry_lines (posted only), loaded via
// accountsUtils.loadLedgerData. There is no second balance system — the four
// reports below are pure projections over the ledger, so a single posted entry
// flows automatically into the Trial Balance, Income Statement, Statement of
// Financial Position, Cash Flow Statement and Statement of Changes in Equity.
//
//   INCOME STATEMENT           → period movement (start ≤ entry_date ≤ end)
//   STATEMENT OF FINANCIAL POS → ending balances as at a date (opening + postings)
//   CASH FLOW STATEMENT        → classified net movements on cash accounts
//   CHANGES IN EQUITY / FUNDS  → opening + movements + surplus = closing
//
// Accounts are classified from the EXISTING chart (`type` + `category` + name
// fallbacks). Account codes are never changed, renumbered or recreated here.

import {
  postedLines, groupLinesByAccount, netPosting, accountBalance, isDebitNormal,
} from './accountsUtils'
import { isCashAccount } from './cashBankUtils'

const EPS = 0.005

// ─── Date helpers (local-time safe, day granularity) ────────────────────────
export const toDay = (d) => (d ? new Date(`${d}T00:00:00`) : null)
export const subDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() - n)
  return d
}

const lineDate = (l) => (l.journal_entries?.entry_date ? toDay(l.journal_entries.entry_date) : null)

// Posted lines whose entry_date falls within [from, to] (both inclusive).
export const periodLines = (lines, from, to) => {
  const posted = postedLines(lines)
  const start = toDay(from)
  const end = toDay(to)
  return posted.filter((l) => {
    const d = lineDate(l)
    if (!d) return false
    if (start && d < start) return false
    if (end && d > end) return false
    return true
  })
}

// Posted lines whose entry_date is on or before `asAt` (inclusive).
export const linesUpTo = (lines, asAt) => {
  const posted = postedLines(lines)
  const end = toDay(asAt)
  if (!end) return posted
  return posted.filter((l) => {
    const d = lineDate(l)
    return d && d <= end
  })
}

// Signed balance on the account's normal side (positive = normal).
const normalNet = (type, accLines) => (isDebitNormal(type) ? netPosting(accLines) : -netPosting(accLines))

const byCode = (a) => String(a.code)
const sortByCode = (a, b) => byCode(a).localeCompare(byCode(b), undefined, { numeric: true })

// ─── 1. INCOME STATEMENT (period report) ─────────────────────────────────────
// Includes ONLY accounts classified `income` / `expense` in the chart.
// Amounts are period activity (movement), never lifetime balances.
export function incomeStatementData(accounts, lines, { from, to }) {
  const byAcc = groupLinesByAccount(periodLines(lines, from, to))
  const income = []
  const expenses = []
  for (const a of accounts) {
    const net = normalNet(a.type, byAcc[a.id] || [])
    if (Math.abs(net) < EPS) continue
    if (a.type === 'income') income.push({ code: a.code, name: a.name, amount: net })
    else if (a.type === 'expense') expenses.push({ code: a.code, name: a.name, amount: net })
  }
  income.sort((x, y) => sortByCode(x, y))
  expenses.sort((x, y) => sortByCode(x, y))
  const totalIncome = income.reduce((s, r) => s + r.amount, 0)
  const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0)
  return { income, expenses, totalIncome, totalExpenses, surplus: totalIncome - totalExpenses }
}

// Surplus/(Deficit) accumulated for ALL posted entries up to a date. Used by
// the Statement of Financial Position so that Total Assets = Liabilities + Equity.
export function surplusUpTo(accounts, lines, asAt) {
  const byAcc = groupLinesByAccount(linesUpTo(lines, asAt))
  let s = 0
  for (const a of accounts) {
    if (a.type === 'income') s += -netPosting(byAcc[a.id] || [])
    else if (a.type === 'expense') s -= netPosting(byAcc[a.id] || [])
  }
  return s
}

// ─── 2. STATEMENT OF FINANCIAL POSITION (as-at) ──────────────────────────────
// Balance-sheet accounts only (asset / liability / equity). Ending balances =
// opening balance + all postings up to the as-at date. Accumulated depreciation
// is shown as a contra reducing Non-Current Assets. Equity includes the current
// period surplus/(deficit) computed from the ledger, which makes the statement
// balance:  TOTAL ASSETS = TOTAL LIABILITIES + TOTAL EQUITY/FUNDS.

const cat = (a) => (a.category || '').toLowerCase()
const name = (a) => (a.name || '').toLowerCase()

export const isContraAsset = (a) =>
  a.type === 'asset' && (cat(a) === 'accumulated depreciation' || /accumulated depreciation/.test(name(a)))

const isNonCurrentAsset = (a) => {
  if (a.type !== 'asset' || isContraAsset(a) || isCashAccount(a)) return false
  const c = cat(a)
  if (c === 'accounts receivable' || c === 'prepayments' || c === 'tax') return false
  if (c === 'fixed assets') return true
  return /land|building|vehicle|equipment|computer|furniture|fittings|fixture|library|sports|office|machinery|intangible/.test(name(a))
}

const isLoanLiability = (a) =>
  a.type === 'liability' && /loan|long.?term|mortgage|borrowing/.test(name(a) + ' ' + cat(a))

export function sfpData(accounts, lines, { asAt }) {
  const upTo = linesUpTo(lines, asAt)
  const byAcc = groupLinesByAccount(upTo)
  const bal = (a) => accountBalance(a, byAcc[a.id] || [])

  const asRows = (pred) =>
    accounts
      .filter((a) => pred(a))
      .map((a) => ({ code: a.code, name: a.name, amount: bal(a) }))
      .sort((x, y) => sortByCode(x, y))
      .filter((r) => Math.abs(r.amount) >= EPS)

  const rowSum = (rows) => rows.reduce((s, r) => s + r.amount, 0)

  const nonCurrent = asRows((a) => isNonCurrentAsset(a))
  const contra = asRows((a) => isContraAsset(a))
  const current = asRows((a) => a.type === 'asset' && !isContraAsset(a) && !isNonCurrentAsset(a))

  const currentLiab = asRows((a) => a.type === 'liability' && !isLoanLiability(a))
  const nonCurrentLiab = asRows((a) => a.type === 'liability' && isLoanLiability(a))

  const equityAccounts = asRows((a) => a.type === 'equity')
  const surplus = surplusUpTo(accounts, lines, asAt)
  const equityRows = [
    ...equityAccounts,
    { code: '', name: 'Surplus / (Deficit) for the period', amount: surplus },
  ].filter((r) => Math.abs(r.amount) >= EPS)

  const totalNonCurrent = rowSum(nonCurrent) + rowSum(contra)
  const totalCurrent = rowSum(current)
  const totalAssets = totalNonCurrent + totalCurrent
  const totalCurrentLiab = rowSum(currentLiab)
  const totalNonCurrentLiab = rowSum(nonCurrentLiab)
  const totalLiabilities = totalCurrentLiab + totalNonCurrentLiab
  const totalEquity = rowSum(equityRows)

  return {
    nonCurrent,
    contra,
    current,
    currentLiab,
    nonCurrentLiab,
    equityRows,
    totalNonCurrent,
    totalCurrent,
    totalAssets,
    totalCurrentLiab,
    totalNonCurrentLiab,
    totalLiabilities,
    totalEquity,
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1,
  }
}

// ─── 3. CASH FLOW STATEMENT (period report) ──────────────────────────────────
// Built from actual movements on Cash & Bank accounts in the ledger. Entries
// whose lines move only the school's own cash accounts (internal transfers)
// are excluded so they never count as income/expense. Each remaining entry's
// net cash effect is classified by the nature of its non-cash counterpart:
//   Operating  → income/expense, receivables, trade/statutory/payroll payables
//   Investing  → fixed assets & accumulated depreciation
//   Financing  → equity/fund accounts and loans
// Net increase/(decrease) ties to:  closing = opening + net change.

const CASH_ACTIVITY = {
  fees: 'Fees received',
  salaries: 'Salaries & wages paid',
  suppliers: 'Suppliers paid',
  statutory: 'Statutory contributions paid',
  utilities: 'Utilities paid',
  deposits: 'Deposits & deferred income',
  income: 'Other operating receipts',
  expense: 'Other operating payments',
  other: 'Other operating activities',
}

const operatingCategory = (others) => {
  const codes = new Set(others.map((a) => a.code))
  if (codes.has('1110')) return 'fees'
  if (codes.has('2150') || codes.has('2151')) return 'salaries'
  if (codes.has('2010')) return 'suppliers'
  if (['2110', '2115', '2116', '2117', '2130', '2140'].some((c) => codes.has(c))) return 'statutory'
  if (['5110', '5120', '5130'].some((c) => codes.has(c))) return 'utilities'
  if (codes.has('2210') || codes.has('2220')) return 'deposits'
  if (others.every((a) => a.type === 'income')) return 'income'
  if (others.every((a) => a.type === 'expense')) return 'expense'
  return 'other'
}

export function cashFlowData(accounts, lines, { from, to }) {
  const posted = postedLines(lines)
  const cashAccounts = accounts.filter((a) => isCashAccount(a))
  const cashIds = new Set(cashAccounts.map((a) => a.id))
  const accountById = Object.fromEntries(accounts.map((a) => [a.id, a]))

  // Cash balance (debit-normal, opening + postings) up to a cutoff day (incl).
  const cashBalanceUpTo = (cutoff) => {
    let total = 0
    for (const a of cashAccounts) {
      let net = Number(a.opening_balance) || 0
      for (const l of posted) {
        if (cashIds.has(l.account_id)) {
          const d = lineDate(l)
          if (cutoff && d && d > cutoff) continue
          net += (Number(l.debit) || 0) - (Number(l.credit) || 0)
        }
      }
      total += net
    }
    return total
  }

  const end = toDay(to)
  const start = toDay(from)
  const opening = cashBalanceUpTo(start ? subDays(from, 1) : null)
  const closing = cashBalanceUpTo(end)

  const entries = {}
  for (const l of periodLines(lines, from, to)) {
    const id = l.journal_entry_id
    if (!entries[id]) entries[id] = []
    entries[id].push(l)
  }

  const op = {}
  const inv = {}
  const fin = {}
  for (const entryLines of Object.values(entries)) {
    const cashLines = entryLines.filter((l) => cashIds.has(l.account_id))
    const cashNet = cashLines.reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0)
    if (Math.abs(cashNet) < EPS) continue
    const others = entryLines.filter((l) => !cashIds.has(l.account_id))
    if (!others.length) continue // internal transfer between own cash accounts

    const otherAccounts = others.map((l) => accountById[l.account_id]).filter(Boolean)
    const otherNets = {}
    for (const l of others) {
      if (!otherNets[l.account_id]) otherNets[l.account_id] = 0
      otherNets[l.account_id] += (Number(l.debit) || 0) - (Number(l.credit) || 0)
    }

    const investing = otherAccounts.some((a) => isNonCurrentAsset(a) || isContraAsset(a))
    const financing = otherAccounts.some((a) => a.type === 'equity' || isLoanLiability(a))

    if (investing) {
      const totalAbs = Object.values(otherNets).reduce((s, v) => s + Math.abs(v), 0) || 1
      for (const [accId, net] of Object.entries(otherNets)) {
        const acc = accountById[accId]
        if (!acc) continue
        const share = (Math.abs(net) / totalAbs) * cashNet
        inv[acc.name || acc.code] = (inv[acc.name || acc.code] || 0) + share
      }
    } else if (financing) {
      const totalAbs = Object.values(otherNets).reduce((s, v) => s + Math.abs(v), 0) || 1
      for (const [accId, net] of Object.entries(otherNets)) {
        const acc = accountById[accId]
        if (!acc) continue
        const share = (Math.abs(net) / totalAbs) * cashNet
        fin[acc.name || acc.code] = (fin[acc.name || acc.code] || 0) + share
      }
    } else {
      const key = operatingCategory(otherAccounts)
      op[key] = (op[key] || 0) + cashNet
    }
  }

  const mkRows = (map) =>
    Object.entries(map)
      .map(([label, amount]) => ({ label, amount }))
      .filter((r) => Math.abs(r.amount) >= EPS)
      .sort((a, b) => b.amount - a.amount)

  const operatingRows = CASH_ACTIVITY
    ? Object.keys(CASH_ACTIVITY).map((k) => ({ label: CASH_ACTIVITY[k], amount: op[k] || 0 })).filter((r) => Math.abs(r.amount) >= EPS)
    : mkRows(op)
  const investingRows = mkRows(inv)
  const financingRows = mkRows(fin)

  const total = (rows) => rows.reduce((s, r) => s + r.amount, 0)
  const operating = total(operatingRows)
  const investing = total(investingRows)
  const financing = total(financingRows)
  const netChange = operating + investing + financing

  return {
    operatingRows,
    investingRows,
    financingRows,
    operating,
    investing,
    financing,
    netChange,
    opening,
    closing,
    reconciled: Math.abs(opening + netChange - closing) < 1,
  }
}

// ─── 4. STATEMENT OF CHANGES IN EQUITY / FUNDS (period report) ───────────────
// Opening equity/funds + net movements in equity accounts during the period
// (contributions, capital grants, withdrawals) + surplus/(deficit) for the
// period = closing equity/funds.
export function equityData(accounts, lines, { from, to }) {
  const equityAccounts = accounts.filter((a) => a.type === 'equity')
  const openingByAcc = groupLinesByAccount(linesUpTo(lines, from ? subDays(from, 1) : null))
  const closingByAcc = groupLinesByAccount(linesUpTo(lines, to))

  const openingRows = []
  const movementRows = []
  for (const a of equityAccounts) {
    const op = accountBalance(a, openingByAcc[a.id] || [])
    const cl = accountBalance(a, closingByAcc[a.id] || [])
    if (Math.abs(op) >= EPS) openingRows.push({ code: a.code, name: a.name, amount: op })
    if (Math.abs(cl - op) >= EPS) movementRows.push({ code: a.code, name: a.name, amount: cl - op })
  }
  openingRows.sort((x, y) => sortByCode(x, y))
  movementRows.sort((x, y) => sortByCode(x, y))

  const opening = openingRows.reduce((s, r) => s + r.amount, 0)
  const movements = movementRows.reduce((s, r) => s + r.amount, 0)
  const surplus = incomeStatementData(accounts, lines, { from, to }).surplus
  const closing = opening + movements + surplus

  return { openingRows, movementRows, opening, movements, surplus, closing }
}
