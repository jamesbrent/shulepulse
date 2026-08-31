-- ============================================================================
-- 129_journal_balance_trigger.sql
-- FINANCE HARDENING — ITEM 7: a posted journal entry MUST balance
-- ============================================================================
-- Deferred CONSTRAINT TRIGGER on journal_entries: at COMMIT, any entry whose
-- status is 'posted' must have SUM(debit) == SUM(credit) across its
-- journal_entry_lines, with tolerance 0.00. If not, the transaction is
-- rejected with a check_violation naming entry_no and both sums.
--
-- Why a deferred CONSTRAINT TRIGGER (AFTER ... DEFERRABLE INITIALLY DEFERRED)?
--   Every writer (postToJournal in accountsUtils.js; Payroll, AP, Expenses,
--   transfers, fee receipts) inserts the journal_entries header FIRST and the
--   lines AFTERWARDS, inside one transaction. A before/after trigger on
--   journal_entries INSERT would fire before the lines exist. Deferring to
--   end-of-transaction lets the whole pair land before validation.
--
-- Only rows created/updated in a transaction are checked, and only when
-- status = 'posted' — legacy unbalanced rows (shouldn't exist) are untouched
-- and reversals (status 'reversed') are exempt. Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_journal_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_debits  NUMERIC;
  v_credits NUMERIC;
BEGIN
  IF NEW.status = 'posted' THEN
    SELECT COALESCE(SUM(l.debit), 0), COALESCE(SUM(l.credit), 0)
    INTO v_debits, v_credits
    FROM public.journal_entry_lines l
    WHERE l.journal_entry_id = NEW.id;

    IF v_debits <> v_credits THEN
      RAISE EXCEPTION
        'Journal entry % (% ) is unbalanced: debits % vs credits %.',
        NEW.entry_no, NEW.id, v_debits, v_credits
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_journal_entry_balance ON public.journal_entries;
CREATE CONSTRAINT TRIGGER trg_journal_entry_balance
  AFTER INSERT OR UPDATE OF status ON public.journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.check_journal_balance();