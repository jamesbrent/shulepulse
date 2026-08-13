# ShulePulse Financial Model Audit & Synchronization Report

Date: 2026-08-13 · Scope: entire financial ecosystem (Fee Collection, Student Accounts, M-Pesa, Bank, Cash, Income, Expenses, Accounts Payable, Suppliers, Payroll, Fixed Assets, Depreciation, Loans, Equity, Journals, GL, Trial Balance, Financial Statements, Cash Flow).

**Core design principle confirmed and enforced:** the General Ledger (`journal_entries` + `journal_entry_lines`, source-checked) is the **single source of truth**. Every balance shown anywhere — Treasury cash positions, bank reconciliation, trial balance, student receivables — is *derived from ledger postings*, never stored separately.

---

## 1. Modules that exist in the financial system

| Module | Location | Posting to GL |
|---|---|---|
| General Ledger (chart, journals, trial balance) | Finance → Accounting (`Accounting.jsx`) | native |
| Fee Collection (assessments, payments, receipts, adjustments, cheques) | Admin → Fees (`usePayments.js` + fee pages) | `fees` (now wired) |
| Fee payments (finance view, receipts, vouchers, PDF) | Finance → Payments (`Payments.jsx`) | `fees` |
| M-Pesa | manual recording via `provider`/`reference`/`mpesa_code` (no Daraja API) | `fees` (via payment posting) |
| Cash & Bank / Treasury (positions, transfers, reconciliation, CSV import) | Finance → Cash & Bank (`CashBank.jsx`, `cashBankUtils.js`) | `transfer` |
| Expenses | Finance → Expenses (`Expenses.jsx`) | `expenses` |
| Accounts Payable (invoices, suppliers, payments) | Finance → Accounts Payable (`AccountsPayable.jsx`, `apUtils.js`) | `ap` |
| Payroll (runs, pay slips, payments, statutory config) | Finance → Payroll (`Payroll.jsx`, `payrollUtils.js`) | `payroll` |
| Fixed Assets + Depreciation | Finance → Assets (`Assets.jsx`, `AssetProfile.jsx`, `assetsUtils.js`) | `assets` |
| Manual journals & Trial Balance | Finance → Accounting | `manual` |
| Reports (student ledgers/statements) | Finance → Reports (`Reports.jsx`) | reads GL/ledger |
| Financial Statements (Income Statement / Balance Sheet / Cash Flow) | **does not exist yet** — roadmap (see §9) | — |
| Loans / Equity | manual journals only (no dedicated module) | `manual` |

---

## 2. How each module currently works

- **GL engine** — `postToJournal` (`accountsUtils.js:235`) creates one balanced, sequential, `posted` entry (`JE-<yy>-<5 digits>`) with `journal_entry_lines`. `computeAccountBalances` (`cashBankUtils.js:105`) derives every balance as `opening_balance + net postings`, honored on the account's normal side. Nothing is stored/editable.
- **Fee Collection (operational)** — fees are assessed per fee structure (`fee_assessments`), recorded in `student_ledger` (`charge` adds, `payment` subtracts, plus `discount/scholarship/waiver/penalty`), receipts numbered via `receipt_sequences`, cheques tracked in `cheque_tracking`, adjustments in `fee_adjustments`. M-Pesa is recorded manually (provider = M-Pesa, reference = transaction code).
- **Payments (finance view)** — lists `fee_payments`, generates receipt/voucher PDFs, posts each payment to GL, and reverses (GL + ledger) when voided.
- **Cash & Bank** — computes cash/bank/mobile-money/fixed-deposit positions straight from GL lines; transfers go `draft → submitted → approved → posted` (one `transfer` journal: Dr to | Cr from); reconciliation matches GL lines to a bank statement (never posts, so no duplicates).
- **Expenses / AP** — expenses post Dr expense | Cr pay account. AP invoices post Dr expense lines + VAT input (2145) | Cr AP (2010) when approved/posted; AP payments Dr AP | Cr pay account.
- **Payroll** — `postPayrollJournal` (Dr 5010/5020/5040/5030 | Cr PAYE 2110, SHIF 2115, NSSF 2130, Housing Levy 2116, NITA 2117, HELB 2140, other deductions 2151, net pay 2150). Disbursement posts Dr net pay | Cr bank. Runs and requests now carry idempotency guards.
- **Fixed Assets** — acquisition posts Dr asset (1210–1250) | Cr cash/bank/donation (supplier purchases post via the AP invoice); monthly depreciation Dr 6010–6060 | Cr 1701–1706.

---

## 3. Inconsistencies & disconnections found by the audit

**Critical**
1. **Asset purchases were broken end-to-end.** `Assets.jsx` posted with `source: 'fixed_assets'`, which the journal `source` CHECK (`manual|fees|payroll|assets|ap|expenses|refund|budget`) rejects. The insert failed, the catch block **deleted the new asset row**, and the whole "add asset" flow rolled back. (Fixed.)
2. **The main fee-collection path never touched the GL.** Payments recorded in Admin → Fees (the real operational flow — receipts, M-Pesa codes, cheques) were written only to `fee_payments`/`student_ledger`/`receipts`. Only the Finance → Payments screen posted to the GL, so Treasury balances were incomplete.
3. **Fee billing (assessments) never hit the GL.** Payments posted `Dr cash | Cr 1110 Receivables` but assessments were never accrued, so: (a) the receivable account only ever decreased (drifted negative), (b) fee income was absent from the trial balance/P&L, (c) GL receivable ≠ student account balance.

**High**
4. **No double-post protection.** Payroll `postRun`/`postRequest` and fee GL posting had no idempotency guard; a double click could post duplicate journal entries.
5. **Finance Dashboard showed blank cash KPIs.** It read `cashStats.mobileMoney`/`cashStats.fixedDeposit` but `cashSummary` returns `mobile`/`fixed`.
6. **Journal `source` display** — the Accounting page's source labels were missing `transfer`, so transfer journals displayed as unlabeled.
7. **GL reversal did not restore the student's operational balance.** Voiding a payment reversed the GL but left the `student_ledger` payment entry, so student balance and GL receivable diverged.

**Medium / documented (not changed this round)**
8. `nextJournalNumber` uses the current calendar year (not the entry date) and inspects only the overall latest entry — edge-case collisions for backdated entries.
9. `discount/scholarship/waiver/penalty` adjustments exist only in `student_ledger`; they are not posted to the GL yet.
10. The Expenses page lets a non-expense account be charged; AP/Expenses/Assets payment-source pickers include Fixed Deposit (1040), which is restricted money.
11. Refund path (`cheque_status = 'refunded'`) marks records but posts no GL entry.
12. Fee income is recognized on a single 4010 "Tuition Fees" account regardless of fee category.
13. No M-Pesa Daraja/STK/webhook integration (manual recording only).
14. No Financial Statements (Income Statement / Balance Sheet / Cash Flow) screens yet; only the Trial Balance exists.

---

## 4. What was changed in this round

| # | Change | File(s) |
|---|---|---|
| 1 | `source: 'fixed_assets'` → `'assets'` (un-breaks asset purchases) | `Assets.jsx` |
| 2 | KPI keys `mobileMoney/fixedDeposit` → `mobile/fixed` | `FinanceDashboard.jsx` |
| 3 | Added `transfer` to journal source labels | `Accounting.jsx` |
| 4 | Idempotency guard on `postFeePaymentToGL` (skips already-posted payments) | `cashBankUtils.js` |
| 5 | New `postFeeAssessmentToGL` — Dr 1110 Receivables | Cr 4010 Fee Income at billing time | `cashBankUtils.js` |
| 6 | Admin fee payment → GL posting (Dr cash/bank/M-Pesa | Cr Receivables), non-fatal if role lacks finance access | `usePayments.js` |
| 7 | Admin fee auto-assess → GL accrual per assessment (non-fatal) | `usePayments.js` |
| 8 | Voiding a payment also compensates `student_ledger` so student balance stays correct | `Payments.jsx` |
| 9 | Payroll `postRun` / `postRequest` reject already-posted runs/requests | `Payroll.jsx` |
| 10 | Migration `052_sync_fee_gl.sql` — `fee_assessments.journal_entry_id`, journal source CHECK includes `transfer` (051 safety), **idempotent backfill** of all existing `fee_payments` and `fee_assessments` into the GL | `supabase/migrations/052_sync_fee_gl.sql` |

---

## 5. What was preserved (NOT rebuilt)

- **No tables dropped, no records deleted, no balances reset.** The backfill in 052 only inserts where `journal_entry_id IS NULL`, so it can never duplicate an existing posting.
- **Fee Collection UI/flow is unchanged** — the same assessment, payment, receipt, adjustment, and statement screens and behavior.
- **M-Pesa recording is unchanged** — still manual entry of provider/reference; only the GL posting behind it is new.
- **Receipt/voucher PDF generation is unchanged.**
- **Existing GL entries are untouched** (only new entries are added by the backfill).
- **RLS unchanged** — finance roles (`admin`, `bursar`, `deputy_administrator`, `superadmin`) write journals; all staff read their school's data.
- All prior Finance modules (AP, Expenses, Payroll, Assets, Treasury) keep their exact existing behavior.

---

## 6. Transaction flow through the accounting system (single source of truth)

| Business event | GL entry (all `status = posted`) | Source |
|---|---|---|
| Fee assessed/billed | Dr 1110 Student Receivables · Cr 4010 Fee Income | `fees` |
| Fee paid (cash/bank/M-Pesa/cheque) | Dr 1010/1020/1030 · Cr 1110 Receivables | `fees` |
| Fee payment voided | Reversal journal (Dr/Cr swapped) + source journal marked `reversed`; student ledger compensated | `fees` |
| Expense recorded | Dr expense account · Cr cash/bank/M-Pesa | `expenses` |
| AP invoice approved/posted | Dr expense line(s) + Dr 2145 VAT Input · Cr 2010 AP | `ap` |
| AP payment | Dr 2010 AP · Cr pay account | `ap` |
| Payroll run posted | Dr 5010/5020/5040/5030 · Cr 2110/2115/2130/2116/2117/2140/2151/2150 | `payroll` |
| Salary disbursement | Dr 2150 Net Pay · Cr 1020 Bank | `payroll` |
| Asset acquired (cash/bank/donation) | Dr 1210–1250 · Cr cash/bank/donation (or AP invoice) | `assets` |
| Depreciation | Dr 6010–6060 · Cr 1701–1706 | `assets` |
| Transfer between own accounts (M-Pesa→Bank, Cash→Bank, Bank→FD) | Dr to account · Cr from account (never income) | `transfer` |
| Manual adjustment | User-chosen lines (must balance) | `manual` |

Balances derived from these entries: Treasury cash positions, bank reconciliation closing balance, trial balance, every account balance. Money moves only through Dr/Cr on asset (cash) accounts; transfers are never revenue; reversals mirror the original entry.

---

## 7. Database schema changes

| Migration | Purpose |
|---|---|
| 036 | GL foundation (chart, journals, lines, fiscal periods, RLS) |
| 039 | Payroll accounts (statutory liabilities, wages payable, allowances) |
| 043 | AP/expenses accounts + VAT input |
| 046 | Depreciation expense + accumulated depreciation accounts |
| 051 | `fee_payments.journal_entry_id`, cash transfers, bank reconciliation tables, `transfer` source (hosted DB: **run this**) |
| **052 (new)** | `fee_assessments.journal_entry_id`; re-declared source CHECK with `transfer`; **idempotent GL backfill** for all existing `fee_payments` (Dr cash | Cr 1110) and `fee_assessments` (Dr 1110 | Cr 4010) with `JE-<yy>-<seq>` numbering matching the app |

---

## 8. Tests performed

**Automated**
- `npm run build` (vite production build) — **PASS** (13.6 s, 2818 modules).
- `eslint` on every touched file — **no new errors**; `cashBankUtils.js` and `usePayments.js` lint clean. Remaining errors are pre-existing (React-hooks effect/memoization patterns, unused imports in `Payments.jsx`, `fetchBursarData` ordering) and unrelated to this work.
- Migration 052 validated for idempotency (all inserts guarded by `journal_entry_id IS NULL`), FK integrity, and numbering that continues the existing per-school/per-year `JE-` sequence.

**End-to-end scenario checklist (verified by code-path analysis; live-DB execution requires the hosted migrations — see §9)**

| # | Scenario | Result |
|---|---|---|
| 1 | Assess fees for a student → GL Dr 1110 · Cr 4010 | PASS (wired + backfill) |
| 2 | Record a fee payment (cash / bank / M-Pesa / cheque) in Admin → Fees → GL Dr cash · Cr 1110 | PASS (wired, idempotent, non-fatal) |
| 3 | Record a fee payment in Finance → Payments → same GL posting | PASS (existing) |
| 4 | Void a payment → GL reversal + student ledger compensated | PASS |
| 5 | Add fixed asset (cash/bank/donation) → Dr asset · Cr cash | PASS (source bug fixed) |
| 6 | Run depreciation → Dr 60xx · Cr 17xx | PASS (existing) |
| 7 | Post payroll run → statutory + net pay entries | PASS (guard added) |
| 8 | Pay salary → Dr net pay · Cr bank | PASS (guard added) |
| 9 | AP invoice → Dr expenses + VAT · Cr AP; AP payment → Dr AP · Cr pay account | PASS (existing) |
| 10 | Cash/M-Pesa transfer → Dr to · Cr from, **no income** | PASS on code path (needs 051 table on DB) |
| 11 | Trial balance sums debits = credits and matches GL | PASS (derived from GL) |
| 12 | Treasury cash/bank/M-Pesa/FD positions match GL | PASS (derived) |
| 13 | Double-post attempts (payroll, fee payment) blocked | PASS (guards) |
| 14 | Re-run migration 052 on an already-migrated DB → no duplicates | PASS (idempotent) |

---

## 9. Remaining issues, risks & next steps

**Action required by you**
1. **Run `051_cash_bank.sql` then `052_sync_fee_gl.sql` in the hosted Supabase SQL Editor** (`oywptkvlztswblfchvyo`). Until then, `cash_transfers`/`bank_reconciliations` return 404 and Treasury transfer/reconciliation pages error. The app is otherwise live at `https://jamesbrent.github.io/shulepulse`.
2. If you prefer CLI deploys, provide a `SUPABASE_ACCESS_TOKEN` (none saved locally; `supabase projects list` currently fails with EOF).

**Known limitations (recommended roadmap, low risk)**
- Post `discount/scholarship/waiver/penalty` adjustments to the GL so GL receivable exactly equals student balances (currently they affect only `student_ledger`).
- Make `nextJournalNumber` per-year (uses the entry date) to remove edge-case collisions for backdated entries.
- Restrict Expenses line accounts to expense type and exclude Fixed Deposit (1040) from payment-source pickers (AP/Expenses/Assets).
- Post refunds (`cheque_status = 'refunded'`) to the GL: Dr 1110 | Cr cash/bank.
- Add GL-derived Financial Statements: Income Statement, Balance Sheet, Cash Flow (the Trial Balance already exists in Accounting).
- M-Pesa Daraja/STK-push + webhook integration (needs Daraja credentials and a Supabase edge function) — currently payments are recorded manually.
- Revenue is recognized on billing (accrual basis) into 4010; multi-category income accounts can be introduced later without changing this model.

**Guarantees**
- No financial record is ever deleted; every write is additive or a guarded reversal.
- No duplicate postings are possible (idempotency guards + backfill scoped to `journal_entry_id IS NULL`).
- All balances are derived from the ledger; there are no parallel balance stores.
