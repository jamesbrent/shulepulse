import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useAuthStore } from '../../../../store/authStore'
import {
  postFeeAssessmentToGL,
  postFeePaymentToGL,
  postCreditApplicationToGL,
  postRefundToGL,
} from '../../../Finance/cashBankUtils'

export function usePayments(schoolId, term, year) {
  const { profile } = useAuthStore()
  const [students,       setStudents]       = useState([])
  const [selected,       setSelected]       = useState(null)
  const [ledger,         setLedger]         = useState([])
  const [assessments,    setAssessments]    = useState([])
  const [creditHistory,  setCreditHistory]  = useState([])
  const [loading,        setLoading]        = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  const [autoAssessed,   setAutoAssessed]   = useState(false)   // ← new: toast trigger
  const [balance,        setBalance]        = useState(0)
  const [creditBalance,  setCreditBalance]  = useState(0)

  // Server-side balances (student_term_outstanding / student_credit_balance),
  // refreshed on every selectStudent so the numbers are single-source. Local
  // reduces remain as a fallback only if an RPC round-trip fails.
  const localBalance = (rows) => (rows || []).reduce(
    (acc, e) => (['charge', 'penalty'].includes(e.entry_type) ? acc + Number(e.amount) : acc - Number(e.amount)),
    0
  )
  const localCreditBalance = (rows) => (rows || []).reduce(
    (bal, t) => bal + (t.type === 'credit' ? Number(t.amount) : -Number(t.amount)),
    0
  )

  // Load all active students once
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('students')
        .select('id, full_name, class, stream, admission_number, day_boarding, transport_route')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .order('full_name')
      setStudents(data || [])
    }
    load()
  }, [schoolId])

  // Balance derived from server RPC (see selectStudent); local fallback helper
  // above keeps the returned API shape stable.

  // ── Select a student & load their account ────────────────────────────────
  const selectStudent = async (student) => {
    setSelected(student)
    setError('')
    setAutoAssessed(false)   // reset toast on each selection
    setLoading(true)

    const [ledgerRes, assRes, creditRes, balRes, creditBalRes] = await Promise.all([
      supabase
        .from('student_ledger')
        .select('*')
        .eq('school_id', schoolId)
        .eq('student_id', student.id)
        .eq('term', term)
        .eq('year', year)
        .order('created_at'),
      supabase
        .from('fee_assessments')
        .select('*, fee_structures(*, fee_categories(name))')
        .eq('school_id', schoolId)
        .eq('student_id', student.id)
        .eq('term', term)
        .eq('year', year),
      supabase
        .from('student_credit_transactions')
        .select('*')
        .eq('school_id', schoolId)
        .eq('student_id', student.id)
        .order('created_at'),
      supabase.rpc('student_term_outstanding', {
        p_school_id: schoolId,
        p_student_id: student.id,
        p_term: term,
        p_year: year,
      }),
      supabase.rpc('student_credit_balance', {
        p_school_id: schoolId,
        p_student_id: student.id,
      }),
    ])

    let assessmentData = assRes.data || []
    let ledgerData     = ledgerRes.data || []
    const creditData   = creditRes.data || []

    setBalance(balRes.error ? localBalance(ledgerData) : Number(balRes.data ?? 0))
    setCreditBalance(creditBalRes.error ? localCreditBalance(creditData) : Number(creditBalRes.data ?? 0))

    // ── Enrich ledger entries with actual dates from source tables ──
    const paymentRefIds = ledgerData
      .filter((e) => e.entry_type === 'payment' && e.reference_id)
      .map((e) => e.reference_id)
    const chargeRefIds = ledgerData
      .filter((e) => e.entry_type === 'charge' && e.reference_id)
      .map((e) => e.reference_id)

    const [payDatesRes, chargeDatesRes] = await Promise.all([
      paymentRefIds.length > 0
        ? supabase.from('fee_payments').select('id, transaction_date').in('id', paymentRefIds)
        : { data: [] },
      chargeRefIds.length > 0
        ? supabase.from('fee_assessments').select('id, created_at').in('id', chargeRefIds)
        : { data: [] },
    ])

    const payDateMap = Object.fromEntries((payDatesRes.data || []).map((p) => [p.id, p.transaction_date]))
    const chargeDateMap = Object.fromEntries((chargeDatesRes.data || []).map((a) => [a.id, a.created_at]))

    ledgerData = ledgerData.map((e) => {
      if (e.entry_type === 'payment' && e.reference_id && payDateMap[e.reference_id]) {
        return { ...e, transaction_date: payDateMap[e.reference_id] }
      }
      if (e.entry_type === 'charge' && e.reference_id && chargeDateMap[e.reference_id]) {
        return { ...e, transaction_date: chargeDateMap[e.reference_id] }
      }
      return e
    })

    // ── Auto-assess: student exists but has no assessment rows yet ──────────
    if (assessmentData.length === 0) {
      // Build the stream filter: match fee structures that apply to ALL streams
      // (stream IS NULL) or specifically to this student's stream
      const streamFilter = student.stream
        ? `stream.is.null,stream.eq.${student.stream}`
        : `stream.is.null`

      const { data: rawStructures } = await supabase
        .from('fee_structures')
        .select('*, fee_categories(name, applies_to)')
        .eq('school_id', schoolId)
        .eq('term', term)
        .eq('year', parseInt(year))
        .or(`class.eq.${student.class},class.eq.__all__`)
        .eq('is_active', true)
        .or(streamFilter)

      // Filter by applies_to (boarding/day/transport)
      const structures = (rawStructures || []).filter((s) => {
        const appliesTo = s.fee_categories?.applies_to
        if (!appliesTo || appliesTo === 'all') return true
        if (appliesTo === 'boarding') return student.day_boarding === 'boarding'
        if (appliesTo === 'day') return student.day_boarding === 'day'
        if (appliesTo === 'transport') return !!student.transport_route
        return true
      })

      if (structures?.length > 0) {
        // Insert assessment rows
        const newAssessments = structures.map((fs) => ({
          school_id:        schoolId,
          student_id:       student.id,
          fee_structure_id: fs.id,
          amount_due:       fs.amount,
          term,
          year:             parseInt(year),
        }))

        const { data: inserted } = await supabase
          .from('fee_assessments')
          .insert(newAssessments)
          .select('*, fee_structures(*, fee_categories(name))')

        // Insert corresponding charge entries into the ledger
        if (inserted?.length > 0) {
          const ledgerCharges = inserted.map((a) => ({
            school_id:    schoolId,
            student_id:   student.id,
            entry_type:   'charge',
            amount:       a.amount_due,
            term,
            year:         parseInt(year),
            description:  a.fee_structures?.fee_categories?.name || 'Fee Charge',
            reference_id: a.id,
          }))

          await supabase.from('student_ledger').insert(ledgerCharges)

          // ── GL accrual: Dr Receivables | Cr Fee Income at billing time.
          // Non-fatal — a finance role is required to write the ledger, so
          // assessment generation must never fail because the GL is missing.
          if (profile?.id) {
            for (const a of inserted) {
              try {
                await postFeeAssessmentToGL(supabase, {
                  schoolId,
                  userId: profile.id,
                  assessment: a,
                  studentName: student.full_name,
                })
              } catch { /* GL unavailable for this role — backfill covers later */ }
            }
          }

          // Re-fetch fresh ledger now that charges exist
          const { data: freshLedger } = await supabase
            .from('student_ledger')
            .select('*')
            .eq('school_id', schoolId)
            .eq('student_id', student.id)
            .eq('term', term)
            .eq('year', year)
            .order('created_at')

          ledgerData     = freshLedger || []
          assessmentData = inserted || []

          // Enrich payment and charge entries with dates from source tables
          const freshPaymentRefIds = ledgerData
            .filter((e) => e.entry_type === 'payment' && e.reference_id)
            .map((e) => e.reference_id)
          const freshChargeRefIds = ledgerData
            .filter((e) => e.entry_type === 'charge' && e.reference_id)
            .map((e) => e.reference_id)

          const [freshPayRes, freshChargeRes] = await Promise.all([
            freshPaymentRefIds.length > 0
              ? supabase.from('fee_payments').select('id, transaction_date').in('id', freshPaymentRefIds)
              : { data: [] },
            freshChargeRefIds.length > 0
              ? supabase.from('fee_assessments').select('id, created_at').in('id', freshChargeRefIds)
              : { data: [] },
          ])

          const freshPayDateMap = Object.fromEntries((freshPayRes.data || []).map((p) => [p.id, p.transaction_date]))
          const freshChargeDateMap = Object.fromEntries((freshChargeRes.data || []).map((a) => [a.id, a.created_at]))

          ledgerData = ledgerData.map((e) => {
            if (e.entry_type === 'payment' && e.reference_id && freshPayDateMap[e.reference_id]) {
              return { ...e, transaction_date: freshPayDateMap[e.reference_id] }
            }
            if (e.entry_type === 'charge' && e.reference_id && freshChargeDateMap[e.reference_id]) {
              return { ...e, transaction_date: freshChargeDateMap[e.reference_id] }
            }
            return e
          })
          setAutoAssessed(true)   // ← fires the toast in the UI
        }
      }
    }

    setLedger(ledgerData)
    setAssessments(assessmentData)
    setCreditHistory(creditData)
    setLoading(false)
  }

  // ── Generate a receipt number ─────────────────────────────────────────────
  const generateReceiptNumber = async () => {
    const { data: receiptNumber, error: receiptErr } = await supabase.rpc('next_receipt_number', { p_school_id: schoolId })
    if (!receiptErr && receiptNumber) return receiptNumber
    // Fallback for backward compatibility
    const yearStr = String(year)
    return `RCT-${yearStr}-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`
  }

  // ── Record Payment (flexible) ─────────────────────────────────────────────
  const recordPayment = async (form, profileId, studentOverride) => {
    setSaving(true); setError('')
    const amount = parseFloat(form.amount)
    if (amount <= 0) { setError('Amount must be greater than 0.'); setSaving(false); return null }

    const studentId = studentOverride?.id || selected?.id
    if (!studentId) { setError('No student selected.'); setSaving(false); return null }

    const receiptNumber = await generateReceiptNumber()

    const isLegacy = !form.payment_type

    const resolvedType = isLegacy
      ? (form.payment_method === 'mpesa' ? 'mobile_money' : form.payment_method || 'cash')
      : form.payment_type

    const resolvedProvider = isLegacy
      ? (form.payment_method === 'mpesa' ? 'M-Pesa' : null)
      : form.provider || null

    const resolvedRef = isLegacy
      ? (form.mpesa_code || null)
      : form.reference || null

    // Atomic payment + ledger recording via RPC
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('record_fee_payment', {
      p_school_id: schoolId,
      p_student_id: studentId,
      p_amount: amount,
      p_payment_type: resolvedType,
      p_payment_method: isLegacy ? form.payment_method : resolvedType,
      p_provider: resolvedProvider,
      p_reference: resolvedRef,
      p_receipt_number: receiptNumber,
      p_received_by: profileId,
      p_transaction_date: form.transaction_date || new Date().toISOString().split('T')[0],
      p_term: term,
      p_year: parseInt(year),
      p_description: buildLedgerDescription(form),
    })

    if (rpcErr || !rpcResult?.success) {
      setError(rpcErr?.message || rpcResult?.error || 'Payment recording failed')
      setSaving(false)
      return null
    }

    const payData = {
      id: rpcResult.payment_id, receipt_number: receiptNumber, student_id: studentId, amount,
      payment_type: resolvedType,
      applied_amount: Number(rpcResult.applied_amount ?? amount),
      credit_amount: Number(rpcResult.credit_amount ?? 0),
      allocations: rpcResult.allocations || [],
    }

    if (rpcResult?.duplicate) {
      setSaving(false)
      setError('Possible duplicate — that payment was already recorded. No changes were made.')
      return null
    }

    // ── Cheque tracking ──
    if (form.payment_type === 'cheque') {
      await supabase.from('cheque_tracking').insert({
        school_id:      schoolId,
        payment_id:     payData.id,
        student_id:     studentId,
        cheque_number:  form.reference || '',
        bank_name:      form.provider  || '',
        amount,
        issue_date:     form.issue_date || new Date().toISOString().split('T')[0],
        clearance_date: form.cheque_clearance_date || null,
        status:         form.cheque_status || 'pending',
        notes:          form.metadata?.notes || null,
        term,
        year:           parseInt(year),
      })
    }

    // ── Receipt ──
    // The receipts row is now created server-side by the AFTER INSERT trigger
    // on fee_payments (migration 128). Local object keeps the modal/PDF shape.
    const receipt = {
      payment_id: payData.id,
      receipt_number: receiptNumber,
      total_amount: amount,
    }

    setSaving(false)
    const studentObj = studentOverride || selected

    // ── GL posting: Dr <Cash/Bank/M-Pesa> | Cr <Receivables> so Treasury
    // reflects every receipt. Non-fatal — requires a finance role.
    if (!payData.journal_entry_id) {
      try {
        await postFeePaymentToGL(supabase, {
          schoolId,
          userId: profileId,
          payment: { ...payData, student_name: studentObj?.full_name },
          method: resolvedType,
        })
      } catch { /* GL unavailable for this role — backfill covers later */ }
    }

    if (studentObj) await selectStudent(studentObj)
    return { ...payData, student: studentObj, receipt, receipt_number: receiptNumber }
  }

  // ── Add Adjustment (scholarships/waivers/discounts/penalties) ────────────
  const addAdjustment = async (form, profileId, studentOverride) => {
    setSaving(true); setError('')
    const amount    = parseFloat(form.amount)
    const studentId = studentOverride?.id || selected?.id
    if (!studentId) { setError('No student selected.'); setSaving(false); return }

    await supabase.from('fee_adjustments').insert({
      school_id:   schoolId,
      student_id:  studentId,
      type:        form.type,
      amount,
      reason:      form.reason,
      approved_by: profileId,
      term,
      year:        parseInt(year),
    })

    const description = `${form.type.charAt(0).toUpperCase() + form.type.slice(1)}: ${form.reason}`

    await supabase.from('student_ledger').insert({
      school_id:   schoolId,
      student_id:  studentId,
      entry_type:  form.type,
      amount,
      term,
      year:        parseInt(year),
      description,
    })

    setSaving(false)
    const studentObj = studentOverride || selected
    if (studentObj) await selectStudent(studentObj)
  }

  // ── Student credit ───────────────────────────────────────────────────────
  // Live preview of where a payment of `amount` would go: the selected term
  // first, then other current-year terms in order, then student credit.
  const previewAllocation = async (amount, studentIdOverride) => {
    const studentId = studentIdOverride || selected?.id
    if (!studentId || !amount) return null
    const { data, error } = await supabase.rpc('preview_fee_allocation', {
      p_school_id: schoolId,
      p_student_id: studentId,
      p_amount: parseFloat(amount) || 0,
      p_term: term,
      p_year: parseInt(year),
    })
    if (error || !data) return null
    return data
  }

  // Consume stored student credit against a term's outstanding assessment.
  const applyCredit = async ({ targetTerm = term, targetYear = year, amount: creditAmount, description = '' }) => {
    const studentId = selected?.id
    if (!studentId) return { error: 'No student selected.' }
    setSaving(true)
    const { data, error } = await supabase.rpc('apply_student_credit', {
      p_school_id: schoolId,
      p_student_id: studentId,
      p_term: targetTerm,
      p_year: parseInt(targetYear),
      p_amount: parseFloat(creditAmount) || 0,
      p_user_id: profile?.id ?? null,
      p_description: description,
    })
    if (error || !data?.success) {
      setSaving(false)
      return { error: error?.message || data?.error || 'Failed to apply credit.' }
    }
    if (profile?.id) {
      try {
        await postCreditApplicationToGL(supabase, {
          schoolId,
          userId: profile.id,
          entry: { ...data, term: targetTerm, year: targetYear },
          studentName: selected?.full_name,
        })
      } catch { /* GL unavailable for this role — backfill covers later */ }
    }
    if (selected) await selectStudent(selected)
    setSaving(false)
    return { ...data }
  }

  // Controlled, auditable refund of stored student credit.
  const refundCredit = async ({ amount: refundAmount, paymentId = null, method = 'cash', reference = '', entryDate, description = '' }) => {
    const studentId = selected?.id
    if (!studentId) return { error: 'No student selected.' }
    setSaving(true)
    const desc = [
      description,
      method ? `via ${method}` : '',
      reference ? `Ref: ${reference}` : '',
    ].filter(Boolean).join(' — ')
    const { data, error } = await supabase.rpc('refund_student_credit', {
      p_school_id: schoolId,
      p_student_id: studentId,
      p_amount: parseFloat(refundAmount) || 0,
      p_payment_id: paymentId,
      p_refund_date: entryDate || new Date().toISOString().split('T')[0],
      p_description: desc,
      p_user_id: profile?.id ?? null,
    })
    if (error || !data?.success) {
      setSaving(false)
      return { error: error?.message || data?.error || 'Refund failed.' }
    }
    if (profile?.id) {
      try {
        await postRefundToGL(supabase, {
          schoolId,
          userId: profile.id,
          refund: data,
          method,
          studentName: selected?.full_name,
        })
      } catch { /* GL unavailable for this role — backfill covers later */ }
    }
    if (selected) await selectStudent(selected)
    setSaving(false)
    return { ...data }
  }

  return {
    students, selected, ledger, assessments,
    loading, saving, error,
    balance,
    creditHistory, creditBalance,      // ← student credit ledger + running balance
    autoAssessed,         // ← exported so PaymentsTab can read it
    setAutoAssessed,      // ← exported so the tab can dismiss the toast
    setError,
    selectStudent, recordPayment, addAdjustment, generateReceiptNumber,
    previewAllocation, applyCredit, refundCredit,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildLedgerDescription(form) {
  const type = form.payment_type
  const prov = form.provider
  const ref  = form.reference
  if (type === 'mobile_money') return `Payment via ${prov || 'Mobile Money'}${ref ? ` — ${ref}` : ''}`
  if (type === 'bank')         return `Bank Transfer${prov ? ` — ${prov}` : ''}${ref ? ` (Ref: ${ref})` : ''}`
  if (type === 'cheque')       return `Cheque${prov ? ` — ${prov}` : ''} #${ref || ''}`
  if (type === 'cash')         return `Cash payment${ref ? ` — Receipt: ${ref}` : ''}`
  if (type === 'adjustment')   return `Adjustment — ${form.metadata?.adjType || 'General'}`
  return `Payment via ${type}`
}