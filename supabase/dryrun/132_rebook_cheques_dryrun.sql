-- ============================================================================
-- 132_rebook_cheques_dryrun.sql — READ-ONLY. NO WRITES.
-- ============================================================================
-- Preview for the historical cheque rebooking (migration 132, NOT yet written;
-- 131 was used by the cheque_status CHECK hotfix).
-- After migration 130, cheque receipts must live in 1050 'Cheques in Clearing'
-- until they clear. This script shows exactly what a rebooking WOULD change:
--
--   (part 1) receipt GL lines on 1020 that would move to 1050 (the record-time
--            bookkeeping correction); and
--   (part 2) already-'cleared' historical cheques that would additionally get
--            a Dr 1020 | Cr 1050 move entry so their money lands in the bank.
--
-- Plus anomaly checks (receipts with no GL link, debit lines not on 1020).
-- Run this AFTER 130, in the SQL editor, and share the output before 132 is
-- written. Nothing here modifies data. Nothing here persists.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- PART 1 — detail: every historical cheque receipt whose receipt GL would be
-- rebooked from its cash/bank debit line (1020) to 1050 Cheques in Clearing.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  s.name                                        AS school,
  COALESCE(p.receipt_number, p.id::text)        AS receipt,
  st.full_name                                  AS student,
  p.term || ' ' || p.year                       AS term_year,
  p.amount                                      AS amount,
  COALESCE(p.cheque_status, 'pending')          AS status,
  je.entry_no                                   AS entry_no,
  je.id                                         AS journal_id,
  COALESCE(dr.code, '(no debit line)')          AS dr_account
FROM fee_payments p
JOIN students st           ON st.id = p.student_id
JOIN schools s             ON s.id = p.school_id
JOIN journal_entries je    ON je.id = p.journal_entry_id
LEFT JOIN LATERAL (
  SELECT a.code
  FROM journal_entry_lines l
  JOIN chart_of_accounts a ON a.id = l.account_id
  WHERE l.journal_entry_id = p.journal_entry_id AND COALESCE(l.debit, 0) > 0
  ORDER BY l.debit DESC
  LIMIT 1
) dr ON TRUE
WHERE (p.payment_type = 'cheque' OR p.payment_method = 'cheque')
  AND p.journal_entry_id IS NOT NULL
  AND je.status = 'posted'
ORDER BY s.name, p.term, p.year, je.entry_no;

-- ────────────────────────────────────────────────────────────────────────────
-- PART 1 — summary by status (what moves from 1020 → 1050).
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  COALESCE(p.cheque_status, 'pending')     AS status,
  count(*)::int                            AS payments,
  COALESCE(SUM(p.amount), 0)               AS total_amount,
  'moves from Cash at Bank (1020) to Cheques in Clearing (1050)'
                                            AS effect
FROM fee_payments p
JOIN journal_entries je ON je.id = p.journal_entry_id
WHERE (p.payment_type = 'cheque' OR p.payment_method = 'cheque')
  AND p.journal_entry_id IS NOT NULL
  AND je.status = 'posted'
GROUP BY 1
ORDER BY 1;

-- ────────────────────────────────────────────────────────────────────────────
-- PART 2 — already-'cleared' cheques: these would ALSO receive a clearing→
-- bank move entry (Dr 1020 | Cr 1050) so their money returns to the bank,
-- leaving Cash at Bank END BALANCE UNCHANGED for this group.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  count(*)::int              AS already_cleared_cheques,
  COALESCE(SUM(p.amount), 0) AS move_entry_total
FROM fee_payments p
JOIN journal_entries je ON je.id = p.journal_entry_id
WHERE (p.payment_type = 'cheque' OR p.payment_method = 'cheque')
  AND p.journal_entry_id IS NOT NULL
  AND je.status = 'posted'
  AND COALESCE(p.cheque_status, 'pending') = 'cleared';

-- ────────────────────────────────────────────────────────────────────────────
-- ANOMALIES — review these before 131 is written.
-- 1. Cheque receipts with NO GL link (postFeePaymentToGL never ran) — cannot
--    be rebooked; they are listed so the client can decide how to handle.
-- 2. Cheque receipts whose debit line is NOT 1020 — unexpected for the rebook
--    path; needs a look before assuming 1020 → 1050.
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'no GL link' AS anomaly, count(*)::int AS count
FROM fee_payments p
WHERE (p.payment_type = 'cheque' OR p.payment_method = 'cheque')
  AND p.journal_entry_id IS NULL
UNION ALL
SELECT 'debit line not on 1020', count(*)::int
FROM fee_payments p
JOIN journal_entries je ON je.id = p.journal_entry_id
LEFT JOIN LATERAL (
  SELECT a.code
  FROM journal_entry_lines l
  JOIN chart_of_accounts a ON a.id = l.account_id
  WHERE l.journal_entry_id = p.journal_entry_id AND COALESCE(l.debit, 0) > 0
  ORDER BY l.debit DESC
  LIMIT 1
) dr ON TRUE
WHERE (p.payment_type = 'cheque' OR p.payment_method = 'cheque')
  AND p.journal_entry_id IS NOT NULL
  AND je.status = 'posted'
  AND COALESCE(dr.code, '') <> '1020';