import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Plus, Search, Pencil, Trash2, X, Eye, Printer, Download,
  FileText, CheckCircle, Banknote, AlertTriangle, Building2, Paperclip,
  Upload, Send, UserCheck, Clock, Receipt, Columns3, Settings2, ArrowDownCircle, Calendar, XCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { useBrandingStore } from '../../features/branding/brandingStore'
import { fmt, fmtDate, fmtDateTime, downloadFile } from '../admin/fees/utils/feesHelpers'
import { writeAudit, apDebitAccountOptions, ensureAccounts } from './accountsUtils'
import {
  AP_SUPPLIER_TYPES, AP_INVOICE_STATUSES, AP_PAYMENT_STATUSES, AP_PAYMENT_METHODS,
  apStatus, invoiceTotals, loadApData, nextSupplierNo, nextInvoiceNo, nextPaymentNo,
  voucherNo, supplierOf, invoiceLinesOf, attachmentsOf, invoiceOutstanding,
  effectivePaymentIds, postInvoiceJournal, postPaymentJournal, reverseJournalEntry,
  recomputeInvoicePaid, saveApConfig, decideApConfig, uploadAttachment, deleteAttachment,
  attachmentPublicUrl, apSummary, buildSupplierStatement, logInvoiceToAssets, logPaymentToAssets,
} from './apUtils'
import { generatePaymentVoucherPdf } from './generatePaymentVoucherPdf'
import './AccountsPayable.css'

const TODAY = new Date().toISOString().split('T')[0]

const blankSupplier = () => ({
  name: '', supplier_type: 'supplier', contact_person: '', phone: '', email: '',
  kra_pin: '', bank_name: '', bank_account: '', bank_branch: '', mpesa_number: '',
  address: '', payment_terms: '', notes: '', active: true,
})

const blankInvoice = () => ({
  supplier_id: '', invoice_no: '', supplier_ref: '', invoice_date: TODAY, due_date: '',
  description: '', department: '', cost_centre: '', tax_treatment: 'exclusive', vat_rate: '', notes: '',
  account_id: '',
})

const blankLine = () => ({ description: '', quantity: '1', unit_price: '', discount_amount: '0' })

const blankPayment = () => ({
  payment_type: 'invoice', supplier_id: '', payee_name: '', payee_type: '',
  payment_date: TODAY, payment_method: 'bank', payment_account_id: '', expense_account_id: '',
  reference_no: '', description: '', department: '', cost_centre: '', notes: '', amount: '',
})

const isAdminRole = (role) => ['admin', 'deputy_administrator', 'superadmin'].includes(role)

export default function AccountsPayablePage({ initialTab }) {
  const { profile } = useAuthStore()
  const { school } = useSchool()
  const { schoolName } = useBrandingStore()
  const schoolId = profile?.school_id
  const userId = profile?.id
  const role = profile?.role
  const isAdmin = isAdminRole(role)

  const [tab, setTab] = useState(initialTab || 'dashboard')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [d, setD] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [supplierModal, setSupplierModal] = useState(false)
  const [supplierForm, setSupplierForm] = useState(blankSupplier())
  const [editSupplierId, setEditSupplierId] = useState(null)

  const [invoiceModal, setInvoiceModal] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState(blankInvoice())
  const [invoiceLines, setInvoiceLines] = useState([blankLine()])
  const [editInvoiceId, setEditInvoiceId] = useState(null)
  const [saving, setSaving] = useState(false)

  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentForm, setPaymentForm] = useState(blankPayment())
  const [allocLines, setAllocLines] = useState([])

  const [view, setView] = useState(null)            // { type: 'invoice'|'payment'|'supplier', id }
  const [confirm, setConfirm] = useState(null)      // { message, action, danger }
  const [voucher, setVoucher] = useState(null)      // payment being viewed/printed
  const [statement, setStatement] = useState(null)  // supplier statement print
  const [configItem, setConfigItem] = useState(null)
  const [attachTarget, setAttachTarget] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)  // { type: 'invoice'|'payment', id }
  const [rejectReason, setRejectReason] = useState('')
  const fileRef = useRef(null)

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const load = async () => {
    setLoading(true)
    try { setD(await loadApData(supabase, schoolId)) } catch (e) { showToast(e.message, false) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [schoolId]) // eslint-disable-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const accountName = (id) => d?.accountOf[id] ? `${d.accountOf[id].code} — ${d.accountOf[id].name}` : '—'

  // ─── Suppliers ────────────────────────────────────────────────────────────
  const openSupplier = (s) => {
    setEditSupplierId(s?.id || null)
    setSupplierForm(s ? { ...s } : blankSupplier())
    setSupplierModal(true)
  }

  const saveSupplier = async () => {
    if (!supplierForm.name) return showToast('Payee / supplier name is required', false)
    try {
      if (editSupplierId) {
        const { error } = await supabase.from('ap_suppliers').update({ ...supplierForm, updated_at: new Date().toISOString() }).eq('id', editSupplierId)
        if (error) throw error
        showToast('Supplier updated')
      } else {
        const supplierNo = await nextSupplierNo(supabase, schoolId)
        const { error } = await supabase.from('ap_suppliers').insert({ ...supplierForm, school_id: schoolId, supplier_no: supplierNo, created_by: userId })
        if (error) throw error
        showToast(`Supplier ${supplierNo} added`)
      }
      setSupplierModal(false)
      await writeAudit(supabase, { schoolId, action: editSupplierId ? 'ap_supplier_updated' : 'ap_supplier_created', details: { name: supplierForm.name } })
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const deleteSupplier = async (s) => {
    const { error } = await supabase.from('ap_suppliers').delete().eq('id', s.id)
    if (error) return showToast(error.message, false)
    showToast('Supplier removed')
    load()
  }

  // ─── Invoices ─────────────────────────────────────────────────────────────
  const openInvoice = (inv) => {
    setEditInvoiceId(inv?.id || null)
    setInvoiceForm(inv ? {
      supplier_id: inv.supplier_id, invoice_no: inv.invoice_no, supplier_ref: inv.supplier_ref,
      invoice_date: inv.invoice_date, due_date: inv.due_date || '', description: inv.description,
      department: inv.department || '', cost_centre: inv.cost_centre || '',
      tax_treatment: inv.tax_treatment, vat_rate: inv.vat_rate, notes: inv.notes || '',
      account_id: invoiceLinesOf(d, inv.id)[0]?.account_id || '',
    } : blankInvoice())
    setInvoiceLines(inv ? invoiceLinesOf(d, inv.id).map((l) => ({
      description: l.description, quantity: l.quantity, unit_price: l.unit_price,
      discount_amount: l.discount_amount,
    })) : [blankLine()])
    setInvoiceModal(true)
  }

  const totals = useMemo(
    () => invoiceTotals(invoiceLines, { tax_treatment: invoiceForm.tax_treatment, vat_rate: invoiceForm.vat_rate }),
    [invoiceLines, invoiceForm.tax_treatment, invoiceForm.vat_rate]
  )

  const saveInvoice = async () => {
    if (!invoiceForm.supplier_id) return showToast('Select a supplier', false)
    const cleaned = invoiceLines
      .map((l) => ({ ...l, quantity: Number(l.quantity) || 0, unit_price: Number(l.unit_price) || 0, discount_amount: Number(l.discount_amount) || 0 }))
      .filter((l) => l.description && (l.quantity > 0 || l.unit_price > 0))
    if (!cleaned.length) return showToast('Add at least one line item', false)
    const defaultCode = d?.config?.defaults?.default_expense_account || '5360'
    await ensureAccounts(supabase, schoolId, [defaultCode])
    const { data: defaultAcc } = await supabase.from('chart_of_accounts')
      .select('id').eq('school_id', schoolId).eq('code', defaultCode).single()
    const lineAccountId = invoiceForm.account_id || defaultAcc?.id || ''
    if (!lineAccountId) return showToast('Set the default expense / asset account in Accounts Payable → Settings', false)
    if (totals.total_amount <= 0) return showToast('Invoice total must be positive', false)
    setSaving(true)
    try {
      let invoiceId = editInvoiceId
      if (editInvoiceId) {
        const wasRejected = (d.invoices || []).some((i) => i.id === editInvoiceId && i.status === 'rejected')
        const rest = { ...invoiceForm }
        delete rest.account_id
        const { error } = await supabase.from('ap_invoices').update({
          ...rest, vat_rate: Number(invoiceForm.vat_rate) || 0,
          ...(wasRejected ? { status: 'draft', rejection_reason: null, rejected_by: null, rejected_at: null } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', editInvoiceId)
        if (error) throw error
        await supabase.from('ap_invoice_lines').delete().eq('invoice_id', editInvoiceId)
      } else {
        const invoiceNo = await nextInvoiceNo(supabase, schoolId)
        const { data: inv, error } = await supabase.from('ap_invoices').insert({
          school_id: schoolId, supplier_id: invoiceForm.supplier_id, invoice_no: invoiceNo,
          supplier_ref: invoiceForm.supplier_ref, invoice_date: invoiceForm.invoice_date,
          due_date: invoiceForm.due_date || null, description: invoiceForm.description,
          department: invoiceForm.department, cost_centre: invoiceForm.cost_centre,
          tax_treatment: invoiceForm.tax_treatment, vat_rate: Number(invoiceForm.vat_rate) || 0,
          subtotal: totals.subtotal, taxable_amount: totals.taxable_amount, vat_amount: totals.vat_amount,
          total_amount: totals.total_amount, notes: invoiceForm.notes, created_by: userId,
        }).select().single()
        if (error) throw error
        invoiceId = inv.id
      }
      const { error: lineErr } = await supabase.from('ap_invoice_lines').insert(
        cleaned.map((l) => ({ school_id: schoolId, invoice_id: invoiceId, description: l.description, quantity: l.quantity, unit_price: l.unit_price, discount_amount: l.discount_amount, account_id: lineAccountId, department: l.department || invoiceForm.department, cost_centre: l.cost_centre || invoiceForm.cost_centre }))
      )
      if (lineErr) throw lineErr
      setInvoiceModal(false)
      showToast(editInvoiceId ? 'Invoice updated' : `Invoice ${invoiceForm.invoice_no || 'draft'} saved`)
      await writeAudit(supabase, { schoolId, action: editInvoiceId ? 'ap_invoice_updated' : 'ap_invoice_created', details: { invoice_id: invoiceId, total: totals.total_amount } })
      load()
    } catch (e) { showToast(e.message, false) }
    finally { setSaving(false) }
  }

  const invoiceTransition = async (inv, to) => {
    try {
      const payload = { status: to, updated_at: new Date().toISOString() }
      const who = { submitted: 'submitted_by', reviewed: 'reviewed_by', approved: 'approved_by', posted: 'posted_by' }[to]
      if (who) { payload[who] = userId; payload[`${who.replace('_by', '')}_at`] = new Date().toISOString() }
      if (to === 'approved' && !isAdmin) return showToast('Only the admin / principal can approve invoices', false)
      if (to === 'posted') {
        const je = await postInvoiceJournal(supabase, { schoolId, userId, invoice: inv, lines: invoiceLinesOf(d, inv.id), supplierName: supplierOf(d, inv.supplier_id)?.name, entryDate: inv.invoice_date })
        payload.journal_entry_id = je.id
        payload.posted_by = userId
        payload.posted_at = new Date().toISOString()
      }
      const { error } = await supabase.from('ap_invoices').update(payload).eq('id', inv.id)
      if (error) throw error
      showToast(`Invoice ${inv.invoice_no} → ${to.replace(/_/g, ' ')}`)
      await writeAudit(supabase, { schoolId, action: `ap_invoice_${to}`, details: { invoice_id: inv.id, invoice_no: inv.invoice_no } })
      if (to === 'approved') {
        await logInvoiceToAssets(supabase, { schoolId, invoiceId: inv.id, eventType: 'invoice_approved', description: `AP invoice ${inv.invoice_no} approved` })
      } else if (to === 'posted') {
        await logInvoiceToAssets(supabase, { schoolId, invoiceId: inv.id, eventType: 'invoice_posted', description: `AP invoice ${inv.invoice_no} posted to the General Ledger` })
      }
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const reverseInvoice = async (inv) => {
    try {
      if (!inv.journal_entry_id) return showToast('Invoice has no posted journal', false)
      const { data: je } = await supabase.from('journal_entries').select('*').eq('id', inv.journal_entry_id).single()
      await reverseJournalEntry(supabase, { schoolId, userId, entry: je })
      const { error } = await supabase.from('ap_invoices').update({ status: 'approved', journal_entry_id: null, paid_amount: 0, updated_at: new Date().toISOString() }).eq('id', inv.id)
      if (error) throw error
      showToast('Invoice reversed — GL restored, invoice back to Approved')
      await writeAudit(supabase, { schoolId, action: 'ap_invoice_reversed', details: { invoice_id: inv.id, invoice_no: inv.invoice_no } })
      load()
    } catch (e) { showToast(e.message, false) }
  }

  // ─── Payments ─────────────────────────────────────────────────────────────
  const openPayment = (presetSupplierId) => {
    const defaultAccount = d?.config?.defaults
    setPaymentForm({
      ...blankPayment(),
      payment_type: 'invoice',
      supplier_id: presetSupplierId || '',
      payment_account_id: d?.accountByCode?.[defaultAccount?.bank_account]?.id || '',
    })
    setAllocLines([])
    setPaymentModal(true)
  }

  const openDirectPayment = () => {
    const defaultAccount = d?.config?.defaults
    setPaymentForm({
      ...blankPayment(),
      payment_type: 'direct',
      payment_account_id: d?.accountByCode?.[defaultAccount?.bank_account]?.id || '',
    })
    setAllocLines([])
    setPaymentModal(true)
  }

  const pickSupplierForAlloc = (supplierId) => {
    setPaymentForm({ ...paymentForm, supplier_id: supplierId })
    const outstanding = (d.invoices || [])
      .filter((i) => i.supplier_id === supplierId && ['posted', 'partially_paid', 'paid'].includes(i.status))
      .map((i) => ({ invoice: i, outstanding: invoiceOutstanding(d, i) }))
      .filter((x) => x.outstanding > 0.01)
    setAllocLines(outstanding.map((x) => ({ invoice_id: x.invoice.id, invoice_no: x.invoice.invoice_no, supplier: x.invoice.supplier_id, outstanding: x.outstanding, amount: String(x.outstanding) })))
  }

  const allocTotal = allocLines.reduce((s, a) => s + (Number(a.amount) || 0), 0)

  const savePayment = async () => {
    try {
      const isInvoice = paymentForm.payment_type === 'invoice'
      const amount = isInvoice ? allocTotal : (Number(paymentForm.amount) || 0)
      if (amount <= 0) return showToast('Enter a payment amount', false)
      if (isInvoice && !allocLines.length) return showToast('Allocate the payment to at least one invoice', false)
      if (!isInvoice && !paymentForm.expense_account_id) return showToast('Select the expense account to charge', false)
      const payeeOk = isInvoice ? paymentForm.supplier_id : (paymentForm.supplier_id || paymentForm.payee_name)
      if (!payeeOk) return showToast('Select / enter the payee', false)
      if (!paymentForm.payment_account_id) return showToast('Select the bank / cash / M-Pesa account to pay from', false)
      setSaving(true)
      const paymentNo = await nextPaymentNo(supabase, schoolId)
      const { data: pay, error } = await supabase.from('ap_payments').insert({
        school_id: schoolId, payment_no: paymentNo, payment_type: paymentForm.payment_type,
        supplier_id: paymentForm.supplier_id || null,
        payee_name: !paymentForm.supplier_id ? paymentForm.payee_name : null,
        payee_type: !paymentForm.supplier_id ? paymentForm.payee_type : null,
        amount, payment_date: paymentForm.payment_date, payment_method: paymentForm.payment_method,
        payment_account_id: paymentForm.payment_account_id,
        expense_account_id: isInvoice ? null : paymentForm.expense_account_id,
        reference_no: paymentForm.reference_no, description: paymentForm.description,
        department: paymentForm.department, cost_centre: paymentForm.cost_centre,
        notes: paymentForm.notes, created_by: userId,
      }).select().single()
      if (error) throw error
      if (isInvoice) {
        const { error: aErr } = await supabase.from('ap_payment_allocations').insert(
          allocLines.filter((a) => Number(a.amount) > 0).map((a) => ({ school_id: schoolId, payment_id: pay.id, invoice_id: a.invoice_id, amount: Number(a.amount) }))
        )
        if (aErr) throw aErr
      }
      setPaymentModal(false)
      showToast(`Payment ${paymentNo} drafted`)
      await writeAudit(supabase, { schoolId, action: 'ap_payment_created', details: { payment_id: pay.id, payment_no: paymentNo, amount } })
      load()
    } catch (e) { showToast(e.message, false) }
    finally { setSaving(false) }
  }

  const paymentTransition = async (pay, to) => {
    try {
      if (to === 'approved') {
        if (!isAdmin) return showToast('Only the admin / principal can approve payments', false)
        if (pay.created_by === userId && !isAdminRole(role)) return showToast('You cannot approve your own payment request', false)
      }
      const payload = { status: to, updated_at: new Date().toISOString() }
      const who = { submitted: 'submitted_by', reviewed: 'reviewed_by', approved: 'approved_by', processed: 'processed_by', paid: 'paid_by', posted: 'posted_by' }[to]
      if (who) { payload[who] = userId; payload[`${who.replace('_by', '')}_at`] = new Date().toISOString() }
      if (to === 'posted') {
        const je = await postPaymentJournal(supabase, { schoolId, userId, payment: pay, payeeName: supplierOf(d, pay.supplier_id)?.name || pay.payee_name, entryDate: pay.payment_date })
        payload.journal_entry_id = je.id
      }
      const { error } = await supabase.from('ap_payments').update(payload).eq('id', pay.id)
      if (error) throw error
      if (['paid', 'posted', 'cancelled'].includes(to)) {
        const { data: allocs } = await supabase.from('ap_payment_allocations').select('invoice_id').eq('payment_id', pay.id)
        for (const a of allocs || []) await recomputeInvoicePaid(supabase, { schoolId, invoiceId: a.invoice_id })
      }
      showToast(`Payment ${pay.payment_no} → ${to.replace(/_/g, ' ')}`)
      await writeAudit(supabase, { schoolId, action: `ap_payment_${to}`, details: { payment_id: pay.id, payment_no: pay.payment_no } })
      if (to === 'posted') {
        await logPaymentToAssets(supabase, { schoolId, paymentId: pay.id, eventType: 'payment_made', description: `Payment ${pay.payment_no} made — payable settled` })
      }
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const reversePayment = async (pay) => {
    try {
      if (!pay.journal_entry_id) return showToast('Payment has no posted journal', false)
      const { data: je } = await supabase.from('journal_entries').select('*').eq('id', pay.journal_entry_id).single()
      await reverseJournalEntry(supabase, { schoolId, userId, entry: je })
      const { error } = await supabase.from('ap_payments').update({ status: 'cancelled', journal_entry_id: null, updated_at: new Date().toISOString() }).eq('id', pay.id)
      if (error) throw error
      const { data: allocs } = await supabase.from('ap_payment_allocations').select('invoice_id').eq('payment_id', pay.id)
      for (const a of allocs || []) await recomputeInvoicePaid(supabase, { schoolId, invoiceId: a.invoice_id })
      showToast('Payment reversed — GL restored, invoices updated')
      await writeAudit(supabase, { schoolId, action: 'ap_payment_reversed', details: { payment_id: pay.id, payment_no: pay.payment_no } })
      load()
    } catch (e) { showToast(e.message, false) }
  }

  // ─── Rejection ────────────────────────────────────────────────────────────
  const openReject = (type, id) => { setRejectReason(''); setRejectTarget({ type, id }) }

  const rejectInvoice = async (inv, reason) => {
    try {
      const { error } = await supabase.from('ap_invoices').update({
        status: 'rejected',
        rejection_reason: reason,
        rejected_by: userId,
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', inv.id)
      if (error) throw error
      showToast(`Invoice ${inv.invoice_no} rejected`)
      await writeAudit(supabase, { schoolId, action: 'ap_invoice_rejected', details: { invoice_id: inv.id, invoice_no: inv.invoice_no, reason } })
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const rejectPayment = async (pay, reason) => {
    try {
      const { error } = await supabase.from('ap_payments').update({
        status: 'rejected',
        rejection_reason: reason,
        rejected_by: userId,
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', pay.id)
      if (error) throw error
      showToast(`Payment ${pay.payment_no} rejected`)
      await writeAudit(supabase, { schoolId, action: 'ap_payment_rejected', details: { payment_id: pay.id, payment_no: pay.payment_no, reason } })
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const confirmReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return
    const reason = rejectReason.trim()
    const { type, id } = rejectTarget
    setRejectTarget(null)
    if (type === 'invoice') {
      const inv = (d.invoices || []).find((i) => i.id === id)
      if (inv) await rejectInvoice(inv, reason)
    } else {
      const pay = (d.payments || []).find((p) => p.id === id)
      if (pay) await rejectPayment(pay, reason)
    }
  }

  // ─── Voucher ──────────────────────────────────────────────────────────────
  const printVoucher = async (pay) => {
    try {
      const supplier = supplierOf(d, pay.supplier_id)
      const { data: allocs } = await supabase.from('ap_payment_allocations').select('invoice_id').eq('payment_id', pay.id)
      const invoices = (allocs || []).map((a) => (d.invoices || []).find((i) => i.id === a.invoice_id)).filter(Boolean)
      const accountNameStr = accountName(pay.payment_account_id)
      const blob = await generatePaymentVoucherPdf({
        school, payment: pay, supplier,
        signees: {
          prepared: d?.nameOf[pay.created_by] || '—',
          reviewed: d?.nameOf[pay.reviewed_by] || '—',
          approved: d?.nameOf[pay.approved_by] || '—',
          paid: d?.nameOf[pay.paid_by || pay.processed_by] || '—',
        },
        invoices, accountName: accountNameStr,
      })
      downloadFile(blob, `${voucherNo(pay)}.pdf`)
      showToast(`Voucher ${voucherNo(pay)} downloaded`)
    } catch (e) { showToast(e.message, false) }
  }

  // ─── Attachments ──────────────────────────────────────────────────────────
  const onAttachFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !attachTarget) return
    try {
      const att = await uploadAttachment(supabase, { schoolId, userId, entityType: attachTarget.type, entityId: attachTarget.id, file })
      showToast(`Attached ${att.file_name}`)
      load()
    } catch (err) { showToast(err.message, false) }
    finally { fileRef.current.value = '' }
  }

  const removeAttachment = async (att) => {
    try {
      await deleteAttachment(supabase, { schoolId, attachment: att })
      showToast('Attachment removed')
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const Attachments = ({ type, id }) => {
    const list = attachmentsOf(d, type, id)
    return (
      <div className="ap-attachments">
        <div className="ap-att-head">
          <Paperclip size={13} /> Documents
          <button className="ap-btn-ghost" onClick={() => { setAttachTarget({ type, id }); fileRef.current?.click() }}><Upload size={12} /> Attach</button>
        </div>
        {list.length === 0 ? (
          <p className="ap-norows">No documents attached.</p>
        ) : (
          <div className="ap-att-list">
            {list.map((a) => (
              <div className="ap-att-item" key={a.id}>
                <FileText size={14} />
                <a href={attachmentPublicUrl(supabase, a.storage_path)} target="_blank" rel="noreferrer">{a.file_name}</a>
                <span>{Math.round((a.file_size || 0) / 1024)} KB</span>
                <button className="ap-btn-danger-ghost" onClick={() => removeAttachment(a)}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Derived data ─────────────────────────────────────────────────────────
  const summary = useMemo(() => d ? apSummary(d) : null, [d])
  const effectiveIds = useMemo(() => d ? effectivePaymentIds(d.payments) : new Set(), [d])

  const invoiceList = useMemo(() => {
    if (!d) return []
    const q = search.toLowerCase()
    return (d.invoices || [])
      .map((inv) => ({ ...inv, _supplier: supplierOf(d, inv.supplier_id), _outstanding: invoiceOutstanding(d, inv) }))
      .filter((inv) => (!statusFilter || inv.status === statusFilter) && (!q || `${inv.invoice_no} ${inv._supplier?.name || ''} ${inv.supplier_ref || ''}`.toLowerCase().includes(q)))
  }, [d, search, statusFilter])

  const paymentList = useMemo(() => {
    if (!d) return []
    const q = search.toLowerCase()
    return (d.payments || [])
      .map((p) => ({ ...p, _payee: supplierOf(d, p.supplier_id)?.name || p.payee_name || '—' }))
      .filter((p) => (!statusFilter || p.status === statusFilter) && (!q || `${p.payment_no} ${p._payee} ${p.reference_no || ''}`.toLowerCase().includes(q)))
  }, [d, search, statusFilter])

  const renderActions = (list, statusList, s) => {
    const meta = apStatus(statusList, s)
    return <span className="ap-badge" style={{ background: meta.color + '1a', color: meta.color }}>{meta.label}</span>
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading && !d) return <div className="loading-state">Loading Accounts Payable...</div>

  return (
    <div className="prl-page">
      <div className="prl-tabs">
        {[
          { key: 'dashboard', label: 'Dashboard', icon: <Columns3 size={15} /> },
          { key: 'approvals', label: 'Approvals', icon: <UserCheck size={15} /> },
          { key: 'suppliers', label: 'Suppliers', icon: <Building2 size={15} /> },
          { key: 'invoices', label: 'Invoices & Bills', icon: <Receipt size={15} /> },
          { key: 'payments', label: 'Payments', icon: <Banknote size={15} /> },
          { key: 'vouchers', label: 'Vouchers', icon: <FileText size={15} /> },
          { key: 'settings', label: 'Settings', icon: <Settings2 size={15} /> },
        ].map((t) => (
          <button key={t.key} className={`prl-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ═══ DASHBOARD ═══ */}
      {tab === 'dashboard' && d && (
        <div className="prl-section">
          <div className="prl-stats">
            {[
              { label: 'Total Payables', value: fmt(summary.totalPayables), color: '#2563eb', icon: <Banknote size={18} /> },
              { label: 'Overdue Payables', value: fmt(summary.overduePayables), color: '#dc2626', icon: <AlertTriangle size={18} /> },
              { label: 'Due This Week', value: fmt(summary.dueThisWeek), color: '#d97706', icon: <Clock size={18} /> },
              { label: 'Due This Month', value: fmt(summary.dueThisMonth), color: '#7c3aed', icon: <Calendar size={18} /> },
              { label: 'Pending Approval', value: summary.pendingApproval, color: '#0891b2', icon: <Send size={18} /> },
              { label: 'Partially Paid', value: summary.partiallyPaid, color: '#ca8a04', icon: <ArrowDownCircle size={18} /> },
              { label: 'Paid This Month', value: fmt(summary.paidThisMonth), color: '#16a34a', icon: <CheckCircle size={18} /> },
            ].map((s) => (
              <div className="prl-stat" key={s.label}>
                <p>{s.label}</p>
                <strong style={{ color: s.color }}>{s.value}</strong>
              </div>
            ))}
          </div>

          <div className="prl-card">
            <h4 className="ap-card-title">Ageing Analysis (outstanding by days overdue)</h4>
            <div className="ap-ageing">
              {[
                { key: 'current', label: 'Current', val: summary.ageing.current, color: '#16a34a' },
                { key: 'd1_30', label: '1–30 days', val: summary.ageing.d1_30, color: '#2563eb' },
                { key: 'd31_60', label: '31–60 days', val: summary.ageing.d31_60, color: '#d97706' },
                { key: 'd61_90', label: '61–90 days', val: summary.ageing.d61_90, color: '#dc2626' },
                { key: 'd90', label: '90+ days', val: summary.ageing.d90, color: '#7f1d1d' },
              ].map((b) => {
                const pct = summary.totalPayables > 0 ? (b.val / summary.totalPayables) * 100 : 0
                return (
                  <div className="ap-age-row" key={b.key}>
                    <span className="ap-age-label">{b.label}</span>
                    <div className="ap-age-bar"><div style={{ width: `${pct}%`, background: b.color }} /></div>
                    <span className="ap-age-val">{fmt(b.val)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="prl-card">
            <h4 className="ap-card-title">Recent Invoices</h4>
            <table className="prl-table">
              <thead><tr><th>Invoice</th><th>Supplier</th><th>Date</th><th>Due</th><th>Amount</th><th>Outstanding</th><th>Status</th></tr></thead>
              <tbody>
                {(d.invoices || []).slice(0, 6).map((inv) => (
                  <tr key={inv.id}>
                    <td className="prl-mono">{inv.invoice_no}</td>
                    <td>{supplierOf(d, inv.supplier_id)?.name || '—'}</td>
                    <td>{fmtDate(inv.invoice_date)}</td>
                    <td>{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(inv.total_amount)}</td>
                    <td style={{ color: '#dc2626' }}>{fmt(invoiceOutstanding(d, inv))}</td>
                    <td>{renderActions(null, AP_INVOICE_STATUSES, inv.status)}</td>
                  </tr>
                ))}
                {(d.invoices || []).length === 0 && <tr><td colSpan={7} className="prl-norows">No invoices yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ APPROVALS ═══ */}
      {tab === 'approvals' && d && (() => {
        const labels = { vat_rate: 'VAT Rate (Purchases)', ap_defaults: 'Default GL Accounts' }
        const summaryOf = (row) => row.item === 'vat_rate' ? `${row.value.rate}%` : `AP ${row.value.ap_account} · VAT ${row.value.vat_input_account} · Bank ${row.value.bank_account} · M-Pesa ${row.value.mobile_account} · Cash ${row.value.cash_account}`
        const pendingInvoices = (d.invoices || []).filter((i) => ['submitted', 'reviewed'].includes(i.status))
        const pendingPayments = (d.payments || []).filter((p) => ['submitted', 'reviewed'].includes(p.status))
        const pendingConfig = (d.config?._rows || []).filter((r) => r.status === 'pending')
        return (
          <div className="prl-section">
            <p className="prl-hint">Everything waiting on your decision. Approve advances the item; Reject records a reason and returns it to the requestor.</p>

            <div className="prl-pending-block">
              <div className="prl-pending-head">
                <Receipt size={15} />
                <strong>Invoices awaiting approval</strong>
                <span className="prl-badge" style={{ background: '#d977061a', color: '#d97706' }}>{pendingInvoices.length} pending</span>
              </div>
              <div className="prl-card">
                <table className="prl-table">
                  <thead><tr><th>Invoice</th><th>Supplier</th><th>Date</th><th>Total</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {pendingInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="prl-mono">{inv.invoice_no}</td>
                        <td>{supplierOf(d, inv.supplier_id)?.name || '—'}</td>
                        <td>{fmtDate(inv.invoice_date)}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(inv.total_amount)}</td>
                        <td>{renderActions(null, AP_INVOICE_STATUSES, inv.status)}</td>
                        <td className="prl-actions-cell">
                          {inv.status === 'submitted' && <button className="prl-btn-ghost" onClick={() => invoiceTransition(inv, 'reviewed')} title="Review"><UserCheck size={14} /></button>}
                          {inv.status === 'reviewed' && isAdmin && <button className="prl-btn-primary" onClick={() => invoiceTransition(inv, 'approved')} title="Approve"><CheckCircle size={14} /> Approve</button>}
                          {isAdmin && <button className="prl-btn-danger-ghost" onClick={() => openReject('invoice', inv.id)} title="Reject"><XCircle size={14} /> Reject</button>}
                          <button className="prl-btn-ghost" onClick={() => setView({ type: 'invoice', id: inv.id })}><Eye size={14} /></button>
                        </td>
                      </tr>
                    ))}
                    {pendingInvoices.length === 0 && <tr><td colSpan={6} className="prl-norows">No invoices awaiting approval.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="prl-pending-block">
              <div className="prl-pending-head">
                <Banknote size={15} />
                <strong>Payments awaiting approval</strong>
                <span className="prl-badge" style={{ background: '#d977061a', color: '#d97706' }}>{pendingPayments.length} pending</span>
              </div>
              <div className="prl-card">
                <table className="prl-table">
                  <thead><tr><th>Payment</th><th>Payee</th><th>Date</th><th>Amount</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {pendingPayments.map((p) => (
                      <tr key={p.id}>
                        <td className="prl-mono">{p.payment_no}</td>
                        <td>{supplierOf(d, p.supplier_id)?.name || p.payee_name || '—'}</td>
                        <td>{fmtDate(p.payment_date)}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(p.amount)}</td>
                        <td>{renderActions(null, AP_PAYMENT_STATUSES, p.status)}</td>
                        <td className="prl-actions-cell">
                          {p.status === 'submitted' && <button className="prl-btn-ghost" onClick={() => paymentTransition(p, 'reviewed')} title="Review"><UserCheck size={14} /></button>}
                          {p.status === 'reviewed' && isAdmin && <button className="prl-btn-primary" onClick={() => paymentTransition(p, 'approved')} title="Approve"><CheckCircle size={14} /> Approve</button>}
                          {isAdmin && <button className="prl-btn-danger-ghost" onClick={() => openReject('payment', p.id)} title="Reject"><XCircle size={14} /> Reject</button>}
                          <button className="prl-btn-ghost" onClick={() => setView({ type: 'payment', id: p.id })}><Eye size={14} /></button>
                        </td>
                      </tr>
                    ))}
                    {pendingPayments.length === 0 && <tr><td colSpan={6} className="prl-norows">No payments awaiting approval.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="prl-pending-block">
              <div className="prl-pending-head">
                <Settings2 size={15} />
                <strong>AP settings changes awaiting approval</strong>
                <span className="prl-badge" style={{ background: '#d977061a', color: '#d97706' }}>{pendingConfig.length} pending</span>
              </div>
              <div className="prl-config-grid">
                {pendingConfig.map((row) => (
                  <div className="prl-config-card" key={row.id} style={{ borderColor: '#d97706' }}>
                    <div className="prl-config-head"><strong>{labels[row.item] || row.item}</strong><span className="prl-badge" style={{ background: '#d977061a', color: '#d97706' }}>pending</span></div>
                    <p className="prl-config-value">{summaryOf(row)}</p>
                    <p className="prl-config-note">{row.notes}</p>
                    <div className="prl-pending-actions">
                      <button className="prl-btn-primary" onClick={async () => { try { await decideApConfig(supabase, { userId, row, approve: true }); showToast('Change approved — applies from today'); load() } catch (e) { showToast(e.message, false) } }}><CheckCircle size={14} /> Approve</button>
                      <button className="prl-btn-danger" onClick={async () => { try { await decideApConfig(supabase, { userId, row, approve: false }); showToast('Change rejected'); load() } catch (e) { showToast(e.message, false) } }}>Reject</button>
                    </div>
                  </div>
                ))}
                {pendingConfig.length === 0 && <p className="prl-norows" style={{ gridColumn: '1 / -1' }}>No settings changes awaiting approval.</p>}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ SUPPLIERS ═══ */}
      {tab === 'suppliers' && d && (
        <div className="prl-section">
          <div className="prl-toolbar">
            <div className="prl-search-wrap"><Search size={15} /><input placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <button className="prl-btn-primary" onClick={() => openSupplier(null)}><Plus size={15} /> New Supplier / Payee</button>
          </div>
          <div className="prl-card">
            <table className="prl-table">
              <thead><tr><th>No.</th><th>Name</th><th>Type</th><th>Contact</th><th>KRA PIN</th><th>Outstanding</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {(d.suppliers || [])
                  .map((s) => {
                    const out = (d.invoices || [])
                      .filter((i) => i.supplier_id === s.id && ['posted', 'partially_paid', 'paid'].includes(i.status))
                      .reduce((sum, i) => sum + invoiceOutstanding(d, i), 0)
                    return { s, out }
                  })
                  .filter(({ s }) => !search || s.name.toLowerCase().includes(search.toLowerCase()))
                  .map(({ s, out }) => (
                    <tr key={s.id}>
                      <td className="prl-mono">{s.supplier_no}</td>
                      <td><button className="ap-link" onClick={() => setView({ type: 'supplier', id: s.id })}>{s.name}</button></td>
                      <td className="prl-cap">{AP_SUPPLIER_TYPES.find((t) => t.value === s.supplier_type)?.label || s.supplier_type}</td>
                      <td>{s.phone || s.email || '—'}</td>
                      <td className="prl-mono">{s.kra_pin || '—'}</td>
                      <td style={{ color: out > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{fmt(out)}</td>
                      <td>{s.active ? <span className="ap-badge" style={{ background: '#16a34a1a', color: '#16a34a' }}>Active</span> : <span className="ap-badge" style={{ background: '#ef44441a', color: '#dc2626' }}>Inactive</span>}</td>
                      <td className="prl-actions-cell">
                        <button className="prl-btn-ghost" onClick={() => setView({ type: 'supplier', id: s.id })}><Eye size={14} /></button>
                        <button className="prl-btn-ghost" onClick={() => openSupplier(s)}><Pencil size={14} /></button>
                        <button className="prl-btn-danger-ghost" onClick={() => setConfirm({ message: `Delete supplier "${s.name}"? History is kept unless invoices exist.`, action: () => deleteSupplier(s) })}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                {(d.suppliers || []).length === 0 && <tr><td colSpan={8} className="prl-norows">No suppliers yet — add the first one.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ INVOICES ═══ */}
      {tab === 'invoices' && d && (
        <div className="prl-section">
          <div className="prl-toolbar">
            <div className="prl-toolbar-left">
              <div className="prl-search-wrap"><Search size={15} /><input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <select className="prl-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {AP_INVOICE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <button className="prl-btn-primary" onClick={() => openInvoice(null)}><Plus size={15} /> Record Supplier Invoice</button>
          </div>
          <div className="prl-card">
            <table className="prl-table">
              <thead><tr><th>Invoice</th><th>Supplier</th><th>Date</th><th>Due</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {invoiceList.map((inv) => (
                  <tr key={inv.id}>
                    <td className="prl-mono">{inv.invoice_no}</td>
                    <td>{inv._supplier?.name || '—'}</td>
                    <td>{fmtDate(inv.invoice_date)}</td>
                    <td>{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(inv.total_amount)}</td>
                    <td>{fmt(inv.paid_amount)}</td>
                    <td style={{ color: inv._outstanding > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{fmt(inv._outstanding)}</td>
                    <td>{renderActions(null, AP_INVOICE_STATUSES, inv.status)}</td>
                    <td className="prl-actions-cell">
                      {inv.status === 'draft' && <button className="prl-btn-ghost" onClick={() => invoiceTransition(inv, 'submitted')} title="Submit"><Send size={14} /></button>}
                      {inv.status === 'submitted' && <button className="prl-btn-ghost" onClick={() => invoiceTransition(inv, 'reviewed')} title="Review"><UserCheck size={14} /></button>}
                      {inv.status === 'reviewed' && isAdmin && <button className="prl-btn-ghost" onClick={() => invoiceTransition(inv, 'approved')} title="Approve"><CheckCircle size={14} /></button>}
                      {['submitted', 'reviewed'].includes(inv.status) && isAdmin && <button className="prl-btn-danger-ghost" onClick={() => openReject('invoice', inv.id)} title="Reject"><XCircle size={14} /></button>}
                      {inv.status === 'approved' && <button className="prl-btn-ghost" onClick={() => invoiceTransition(inv, 'posted')} title="Post to GL"><Columns3 size={14} /></button>}
                      {['draft', 'submitted', 'reviewed', 'rejected'].includes(inv.status) && <button className="prl-btn-ghost" onClick={() => openInvoice(inv)}><Pencil size={14} /></button>}
                      {['posted', 'partially_paid', 'paid'].includes(inv.status) && isAdmin && <button className="prl-btn-danger-ghost" onClick={() => setConfirm({ message: `Reverse ${inv.invoice_no}? A reversing journal entry will be posted and the invoice returns to Approved.`, action: () => reverseInvoice(inv) })} title="Reverse"><ArrowDownCircle size={14} /></button>}
                      <button className="prl-btn-ghost" onClick={() => setView({ type: 'invoice', id: inv.id })}><Eye size={14} /></button>
                    </td>
                  </tr>
                ))}
                {invoiceList.length === 0 && <tr><td colSpan={9} className="prl-norows">No invoices match.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ PAYMENTS ═══ */}
      {tab === 'payments' && d && (
        <div className="prl-section">
          <div className="prl-toolbar">
            <div className="prl-toolbar-left">
              <div className="prl-search-wrap"><Search size={15} /><input placeholder="Search payments..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <select className="prl-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {AP_PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="prl-toolbar-left">
              <button className="prl-btn-secondary" onClick={openDirectPayment}><Plus size={15} /> Other Payment (no invoice)</button>
              <button className="prl-btn-primary" onClick={() => openPayment('')}><Plus size={15} /> Pay Supplier</button>
            </div>
          </div>
          <div className="prl-card">
            <table className="prl-table">
              <thead><tr><th>Payment</th><th>Payee</th><th>Type</th><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {paymentList.map((p) => (
                  <tr key={p.id}>
                    <td className="prl-mono">{p.payment_no}</td>
                    <td>{p._payee}</td>
                    <td className="prl-cap">{p.payment_type === 'direct' ? 'Direct' : 'Invoice'}</td>
                    <td>{fmtDate(p.payment_date)}</td>
                    <td className="prl-cap">{p.payment_method}</td>
                    <td className="prl-mono">{p.reference_no || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(p.amount)}</td>
                    <td>{renderActions(null, AP_PAYMENT_STATUSES, p.status)}</td>
                    <td className="prl-actions-cell">
                      {p.status === 'draft' && <button className="prl-btn-ghost" onClick={() => paymentTransition(p, 'submitted')} title="Submit"><Send size={14} /></button>}
                      {p.status === 'submitted' && <button className="prl-btn-ghost" onClick={() => paymentTransition(p, 'reviewed')} title="Review"><UserCheck size={14} /></button>}
                      {p.status === 'reviewed' && isAdmin && <button className="prl-btn-ghost" onClick={() => paymentTransition(p, 'approved')} title="Approve"><CheckCircle size={14} /></button>}
                      {['submitted', 'reviewed'].includes(p.status) && isAdmin && <button className="prl-btn-danger-ghost" onClick={() => openReject('payment', p.id)} title="Reject"><XCircle size={14} /></button>}
                      {p.status === 'approved' && <button className="prl-btn-ghost" onClick={() => paymentTransition(p, 'processing')} title="Mark processing"><Clock size={14} /></button>}
                      {p.status === 'processing' && <button className="prl-btn-ghost" onClick={() => paymentTransition(p, 'paid')} title="Mark paid"><CheckCircle size={14} /></button>}
                      {p.status === 'paid' && <button className="prl-btn-ghost" onClick={() => paymentTransition(p, 'posted')} title="Post to GL"><Columns3 size={14} /></button>}
                      {['paid', 'posted'].includes(p.status) && <button className="prl-btn-ghost" onClick={() => printVoucher(p)} title="Voucher"><Printer size={14} /></button>}
                      {['posted'].includes(p.status) && isAdmin && <button className="prl-btn-danger-ghost" onClick={() => setConfirm({ message: `Reverse ${p.payment_no}? A reversing journal entry will be posted and the payment cancelled.`, action: () => reversePayment(p) })} title="Reverse"><ArrowDownCircle size={14} /></button>}
                      <button className="prl-btn-ghost" onClick={() => setView({ type: 'payment', id: p.id })}><Eye size={14} /></button>
                    </td>
                  </tr>
                ))}
                {paymentList.length === 0 && <tr><td colSpan={9} className="prl-norows">No payments yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ VOUCHERS ═══ */}
      {tab === 'vouchers' && d && (
        <div className="prl-section">
          <p className="prl-hint">Every approved payment has a Payment Voucher. Vouchers become available once a payment is paid or posted.</p>
          <div className="prl-card">
            <table className="prl-table">
              <thead><tr><th>Voucher</th><th>Payee</th><th>Date</th><th>Method</th><th>Amount</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {(d.payments || []).filter((p) => ['paid', 'posted'].includes(p.status)).map((p) => (
                  <tr key={p.id}>
                    <td className="prl-mono">{voucherNo(p)}</td>
                    <td>{supplierOf(d, p.supplier_id)?.name || p.payee_name || '—'}</td>
                    <td>{fmtDate(p.payment_date)}</td>
                    <td className="prl-cap">{p.payment_method}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(p.amount)}</td>
                    <td>{renderActions(null, AP_PAYMENT_STATUSES, p.status)}</td>
                    <td className="prl-actions-cell">
                      <button className="prl-btn-ghost" onClick={() => setVoucher(p)}><Eye size={14} /></button>
                      <button className="prl-btn-primary" onClick={() => printVoucher(p)}><Download size={14} /> PDF</button>
                    </td>
                  </tr>
                ))}
                {(d.payments || []).filter((p) => ['paid', 'posted'].includes(p.status)).length === 0 && <tr><td colSpan={7} className="prl-norows">No vouchers yet — paid payments appear here.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ SETTINGS ═══ */}
      {tab === 'settings' && d && (
        <div className="prl-section">
          {(() => {
            const rows = d.config?._rows || []
            const pending = rows.filter((r) => r.status === 'pending')
            const active = rows.filter((r) => r.status === 'approved')
            const labels = { vat_rate: 'VAT Rate (Purchases)', ap_defaults: 'Default GL Accounts' }
            const summaryOf = (row) => row.item === 'vat_rate' ? `${row.value.rate}%` : `AP ${row.value.ap_account} · VAT ${row.value.vat_input_account} · Bank ${row.value.bank_account} · M-Pesa ${row.value.mobile_account} · Cash ${row.value.cash_account}`
            return (
              <>
                {pending.length > 0 && (
                  <div className="prl-pending-block">
                    <div className="prl-pending-head">
                      <AlertTriangle size={15} />
                      <strong>Pending AP settings changes</strong>
                      <span className="prl-badge" style={{ background: '#d977061a', color: '#d97706' }}>{pending.length} awaiting approval</span>
                    </div>
                    <div className="prl-config-grid">
                      {pending.map((row) => (
                        <div className="prl-config-card" key={row.id} style={{ borderColor: '#d97706' }}>
                          <div className="prl-config-head"><strong>{labels[row.item] || row.item}</strong><span className="prl-badge" style={{ background: '#d977061a', color: '#d97706' }}>pending</span></div>
                          <p className="prl-config-value">{summaryOf(row)}</p>
                          <p className="prl-config-note">{row.notes}</p>
                          {isAdmin ? (
                            <div className="prl-pending-actions">
                              <button className="prl-btn-primary" onClick={async () => { try { await decideApConfig(supabase, { userId, row, approve: true }); showToast('Change approved — applies from today'); load() } catch (e) { showToast(e.message, false) } }}><CheckCircle size={14} /> Approve</button>
                              <button className="prl-btn-danger" onClick={async () => { try { await decideApConfig(supabase, { userId, row, approve: false }); showToast('Change rejected'); load() } catch (e) { showToast(e.message, false) } }}>Reject</button>
                            </div>
                          ) : (
                            <p className="prl-config-note" style={{ color: '#d97706' }}>Awaiting admin approval — not yet applied.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="prl-config-grid">
                  {active.map((row) => (
                    <div className="prl-config-card" key={row.id}>
                      <div className="prl-config-head"><strong>{labels[row.item] || row.item}</strong><span className="prl-badge" style={{ background: '#2563eb1a', color: '#2563eb' }}>since {row.effective_from}</span></div>
                      <p className="prl-config-value">{summaryOf(row)}</p>
                      <p className="prl-config-note">{row.notes}</p>
                      <button className="prl-btn-secondary" onClick={() => setConfigItem({ ...row, value: JSON.parse(JSON.stringify(row.value)) })}><Pencil size={13} /> Edit</button>
                    </div>
                  ))}
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ═══ Supplier Modal ═══ */}
      {supplierModal && (
        <div className="prl-modal-overlay" onClick={() => setSupplierModal(false)}>
          <div className="prl-modal prl-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head">
              <h3>{editSupplierId ? 'Edit Supplier / Payee' : 'New Supplier / Payee'}</h3>
              <button className="prl-btn-icon" onClick={() => setSupplierModal(false)}><X size={16} /></button>
            </div>
            <div className="prl-form-grid">
              <label className="prl-field prl-field-full"><span>Payee / Supplier Name *</span><input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} /></label>
              <label className="prl-field"><span>Supplier Type</span>
                <select value={supplierForm.supplier_type} onChange={(e) => setSupplierForm({ ...supplierForm, supplier_type: e.target.value })}>
                  {AP_SUPPLIER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label className="prl-field"><span>Payment Terms</span><input placeholder="e.g. Net 30" value={supplierForm.payment_terms} onChange={(e) => setSupplierForm({ ...supplierForm, payment_terms: e.target.value })} /></label>
              <label className="prl-field"><span>Contact Person</span><input value={supplierForm.contact_person} onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })} /></label>
              <label className="prl-field"><span>Phone</span><input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></label>
              <label className="prl-field"><span>Email</span><input value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} /></label>
              <label className="prl-field"><span>KRA PIN</span><input value={supplierForm.kra_pin} onChange={(e) => setSupplierForm({ ...supplierForm, kra_pin: e.target.value })} /></label>
              <label className="prl-field prl-field-full"><span>Address</span><input value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} /></label>
              <label className="prl-field"><span>Bank Name</span><input value={supplierForm.bank_name} onChange={(e) => setSupplierForm({ ...supplierForm, bank_name: e.target.value })} /></label>
              <label className="prl-field"><span>Bank Account</span><input value={supplierForm.bank_account} onChange={(e) => setSupplierForm({ ...supplierForm, bank_account: e.target.value })} /></label>
              <label className="prl-field"><span>Bank Branch</span><input value={supplierForm.bank_branch} onChange={(e) => setSupplierForm({ ...supplierForm, bank_branch: e.target.value })} /></label>
              <label className="prl-field"><span>M-Pesa Number</span><input value={supplierForm.mpesa_number} onChange={(e) => setSupplierForm({ ...supplierForm, mpesa_number: e.target.value })} /></label>
              <label className="prl-field prl-field-full"><span>Notes</span><textarea rows={2} value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} /></label>
              <label className="prl-check" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={supplierForm.active} onChange={(e) => setSupplierForm({ ...supplierForm, active: e.target.checked })} /> Active</label>
            </div>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setSupplierModal(false)}>Cancel</button>
              <button className="prl-btn-primary" onClick={saveSupplier}>{editSupplierId ? 'Save Changes' : 'Add Supplier'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Invoice Modal ═══ */}
      {invoiceModal && (
        <div className="prl-modal-overlay" onClick={() => setInvoiceModal(false)}>
          <div className="prl-modal prl-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head">
              <h3>{editInvoiceId ? `Edit ${invoiceForm.invoice_no}` : 'Record Supplier Invoice'}</h3>
              <button className="prl-btn-icon" onClick={() => setInvoiceModal(false)}><X size={16} /></button>
            </div>
            <div className="prl-form-grid">
              <label className="prl-field"><span>Supplier *</span>
                <select value={invoiceForm.supplier_id} onChange={(e) => setInvoiceForm({ ...invoiceForm, supplier_id: e.target.value })}>
                  <option value="">Select supplier...</option>
                  {(d?.suppliers || []).filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="prl-field"><span>Supplier Invoice Ref.</span><input placeholder="Their invoice #" value={invoiceForm.supplier_ref} onChange={(e) => setInvoiceForm({ ...invoiceForm, supplier_ref: e.target.value })} /></label>
              <label className="prl-field"><span>Invoice Date</span><input type="date" value={invoiceForm.invoice_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })} /></label>
              <label className="prl-field"><span>Due Date</span><input type="date" value={invoiceForm.due_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })} /></label>
              <label className="prl-field"><span>Tax Treatment</span>
                <select value={invoiceForm.tax_treatment} onChange={(e) => setInvoiceForm({ ...invoiceForm, tax_treatment: e.target.value })}>
                  <option value="none">No tax</option>
                  <option value="exclusive">Tax exclusive (+VAT)</option>
                  <option value="inclusive">Tax inclusive (VAT in price)</option>
                </select>
              </label>
              <label className="prl-field"><span>VAT Rate (%)</span><input type="number" min="0" step="0.01" value={invoiceForm.vat_rate} onChange={(e) => setInvoiceForm({ ...invoiceForm, vat_rate: e.target.value })} /></label>
              <label className="prl-field"><span>Department</span><input value={invoiceForm.department} onChange={(e) => setInvoiceForm({ ...invoiceForm, department: e.target.value })} /></label>
              <label className="prl-field"><span>Cost Centre</span><input value={invoiceForm.cost_centre} onChange={(e) => setInvoiceForm({ ...invoiceForm, cost_centre: e.target.value })} /></label>
              <label className="prl-field prl-field-full"><span>Description</span><input value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} /></label>
            </div>

            <div className="ap-lines-head">
              <strong>Line Items</strong>
              <button className="prl-btn-ghost" onClick={() => setInvoiceLines([...invoiceLines, blankLine()])}><Plus size={13} /> Add line</button>
            </div>
            <div className="prl-card" style={{ margin: '0 18px 6px', borderRadius: 10 }}>
              <table className="prl-table" style={{ minWidth: 620 }}>
                <thead><tr><th>Description</th><th style={{ width: 60 }}>Qty</th><th style={{ width: 90 }}>Unit Price</th><th style={{ width: 90 }}>Discount</th><th style={{ width: 90 }}>Amount</th><th></th></tr></thead>
                <tbody>
                  {invoiceLines.map((l, i) => {
                    const amt = Math.max(Number(l.quantity || 0) * Number(l.unit_price || 0) - Number(l.discount_amount || 0), 0)
                    return (
                      <tr key={i}>
                        <td><input className="ap-line-input" value={l.description} onChange={(e) => setInvoiceLines(invoiceLines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} /></td>
                        <td><input className="ap-line-input" type="number" min="0" value={l.quantity} onChange={(e) => setInvoiceLines(invoiceLines.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} /></td>
                        <td><input className="ap-line-input" type="number" min="0" value={l.unit_price} onChange={(e) => setInvoiceLines(invoiceLines.map((x, j) => j === i ? { ...x, unit_price: e.target.value } : x))} /></td>
                        <td><input className="ap-line-input" type="number" min="0" value={l.discount_amount} onChange={(e) => setInvoiceLines(invoiceLines.map((x, j) => j === i ? { ...x, discount_amount: e.target.value } : x))} /></td>
                        <td style={{ fontWeight: 600 }}>{fmt(amt)}</td>
                        <td><button className="prl-btn-danger-ghost" onClick={() => setInvoiceLines(invoiceLines.filter((_, j) => j !== i))}><Trash2 size={13} /></button></td>
                      </tr>
                    )
                  })}
                  {invoiceLines.length === 0 && <tr><td colSpan={6} className="prl-norows">No lines — add one.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="ap-totals">
              <div><span>Subtotal</span><strong>{fmt(totals.subtotal)}</strong></div>
              <div><span>VAT ({invoiceForm.vat_rate || 0}%)</span><strong>{fmt(totals.vat_amount)}</strong></div>
              <div className="ap-totals-grand"><span>Total</span><strong>{fmt(totals.total_amount)}</strong></div>
            </div>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setInvoiceModal(false)}>Cancel</button>
              <button className="prl-btn-primary" disabled={saving} onClick={saveInvoice}>{saving ? 'Saving...' : editInvoiceId ? 'Save Changes' : 'Save Draft'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Payment Modal ═══ */}
      {paymentModal && (
        <div className="prl-modal-overlay" onClick={() => setPaymentModal(false)}>
          <div className="prl-modal prl-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head">
              <h3>{paymentForm.payment_type === 'invoice' ? 'Pay Supplier Invoice(s)' : 'Other Payment (no invoice)'}</h3>
              <button className="prl-btn-icon" onClick={() => setPaymentModal(false)}><X size={16} /></button>
            </div>
            <div className="prl-form-grid">
              <label className="prl-field prl-field-full"><span>Payment Type</span>
                <select value={paymentForm.payment_type} onChange={(e) => setPaymentForm({ ...paymentForm, payment_type: e.target.value })}>
                  <option value="invoice">Pay against supplier invoice(s)</option>
                  <option value="direct">Direct payment (utilities, fees, licences, emergency...)</option>
                </select>
              </label>

              {paymentForm.payment_type === 'invoice' ? (
                <>
                  <label className="prl-field prl-field-full"><span>Supplier *</span>
                    <select value={paymentForm.supplier_id} onChange={(e) => pickSupplierForAlloc(e.target.value)}>
                      <option value="">Select supplier...</option>
                      {(d?.suppliers || []).filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                  {allocLines.length > 0 && (
                    <div className="prl-card prl-field-full" style={{ borderRadius: 10, padding: 10 }}>
                      <table className="prl-table" style={{ minWidth: 480 }}>
                        <thead><tr><th>Invoice</th><th>Outstanding</th><th style={{ width: 110 }}>Pay</th></tr></thead>
                        <tbody>
                          {allocLines.map((a, i) => (
                            <tr key={a.invoice_id}>
                              <td className="prl-mono">{a.invoice_no}</td>
                              <td style={{ color: '#dc2626', fontWeight: 600 }}>{fmt(a.outstanding)}</td>
                              <td><input className="ap-line-input" type="number" min="0" max={a.outstanding} value={a.amount} onChange={(e) => setAllocLines(allocLines.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="prl-field prl-field-full"><span className="ap-total-note">Total payment: <strong>{fmt(allocTotal)}</strong></span></div>
                </>
              ) : (
                <>
                  <label className="prl-field"><span>Supplier (optional)</span>
                    <select value={paymentForm.supplier_id} onChange={(e) => setPaymentForm({ ...paymentForm, supplier_id: e.target.value })}>
                      <option value="">— Direct payee —</option>
                      {(d?.suppliers || []).filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                  <label className="prl-field"><span>Payee Name (if not a supplier)</span><input value={paymentForm.payee_name} onChange={(e) => setPaymentForm({ ...paymentForm, payee_name: e.target.value })} /></label>
                  <label className="prl-field"><span>Payee Type</span>
                    <select value={paymentForm.payee_type} onChange={(e) => setPaymentForm({ ...paymentForm, payee_type: e.target.value })}>
                      <option value="">—</option>
                      {AP_SUPPLIER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </label>
                  <label className="prl-field prl-field-full"><span>Expense Account Charged *</span>
                    <select value={paymentForm.expense_account_id} onChange={(e) => setPaymentForm({ ...paymentForm, expense_account_id: e.target.value })}>
                      <option value="">Select expense account...</option>
                      {(apDebitAccountOptions(d?.accounts, [paymentForm.expense_account_id])).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                  </label>
                  <label className="prl-field prl-field-full"><span>Amount (KSh) *</span><input type="number" min="0" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></label>
                </>
              )}

              <label className="prl-field"><span>Payment Method</span>
                <select value={paymentForm.payment_method} onChange={(e) => {
                  const def = d?.config?.defaults
                  const code = { bank: def?.bank_account, mobile: def?.mobile_account, cash: def?.cash_account, cheque: def?.bank_account }[e.target.value]
                  setPaymentForm({ ...paymentForm, payment_method: e.target.value, payment_account_id: d?.accountByCode?.[code]?.id || paymentForm.payment_account_id })
                }}>
                  {AP_PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <label className="prl-field"><span>Pay From (Bank / Cash / M-Pesa source account) *</span>
                <select value={paymentForm.payment_account_id} onChange={(e) => setPaymentForm({ ...paymentForm, payment_account_id: e.target.value })}>
                  <option value="">Select source account...</option>
                  {(d?.accounts || []).filter((a) => a.type === 'asset' && ['1010', '1020', '1030', '1040'].includes(a.code)).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </label>
              <label className="prl-field"><span>Payment Date</span><input type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} /></label>
              <label className="prl-field"><span>Transaction / Reference No.</span><input placeholder="M-Pesa ref / cheque no. / trx id" value={paymentForm.reference_no} onChange={(e) => setPaymentForm({ ...paymentForm, reference_no: e.target.value })} /></label>
              <label className="prl-field prl-field-full"><span>Description</span><input value={paymentForm.description} onChange={(e) => setPaymentForm({ ...paymentForm, description: e.target.value })} /></label>
              <label className="prl-field"><span>Department</span><input value={paymentForm.department} onChange={(e) => setPaymentForm({ ...paymentForm, department: e.target.value })} /></label>
              <label className="prl-field"><span>Cost Centre</span><input value={paymentForm.cost_centre} onChange={(e) => setPaymentForm({ ...paymentForm, cost_centre: e.target.value })} /></label>
            </div>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setPaymentModal(false)}>Cancel</button>
              <button className="prl-btn-primary" disabled={saving} onClick={savePayment}>{saving ? 'Saving...' : 'Create Payment Draft'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Config Modal ═══ */}
      {configItem && (
        <div className="prl-modal-overlay" onClick={() => setConfigItem(null)}>
          <div className="prl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head">
              <h3>Edit {configItem.item === 'vat_rate' ? 'VAT Rate' : 'Default GL Accounts'}</h3>
              <button className="prl-btn-icon" onClick={() => setConfigItem(null)}><X size={16} /></button>
            </div>
            <div className="prl-form-grid">
              {configItem.item === 'vat_rate' ? (
                <label className="prl-field prl-field-full"><span>VAT Rate (%)</span><input type="number" step="0.01" value={configItem.value.rate} onChange={(e) => setConfigItem({ ...configItem, value: { ...configItem.value, rate: Number(e.target.value) } })} /></label>
              ) : (
                <>
                  {[['ap_account', 'Accounts Payable (control)'], ['vat_input_account', 'VAT Input Account'], ['bank_account', 'Bank Account (default)'], ['mobile_account', 'Mobile Money Account (default)'], ['cash_account', 'Cash Account (default)'], ['default_expense_account', 'Default Expense / Asset Account (invoice lines)']].map(([k, label]) => (
                    <label className="prl-field prl-field-full" key={k}>
                      <span>{label}</span>
                      <select value={configItem.value[k]} onChange={(e) => setConfigItem({ ...configItem, value: { ...configItem.value, [k]: e.target.value } })}>
                        {(d?.accounts || []).map((a) => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
                      </select>
                    </label>
                  ))}
                </>
              )}
            </div>
            <p className="prl-hint" style={{ padding: '0 18px' }}>Saving adds a new effective-dated row (from today). Bursar changes need admin approval.</p>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setConfigItem(null)}>Cancel</button>
              <button className="prl-btn-primary" onClick={async () => {
                try {
                  const direct = await saveApConfig(supabase, { schoolId, userId, item: configItem.item, value: configItem.value, isAdmin })
                  setConfigItem(null)
                  showToast(direct ? 'Setting updated — applies from today' : 'Change submitted — awaiting admin approval')
                  load()
                } catch (e) { showToast(e.message, false) }
              }}>Save & Apply From Today</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ View modal (invoice / payment / supplier) ═══ */}
      {view && d && view.type === 'invoice' && (() => {
        const inv = (d.invoices || []).find((i) => i.id === view.id)
        if (!inv) return null
        const lines = invoiceLinesOf(d, inv.id)
        const sup = supplierOf(d, inv.supplier_id)
        const pays = (d.payments || []).filter((p) => effectiveIds.has(p.id) && (d.allocations || []).some((a) => a.payment_id === p.id && a.invoice_id === inv.id))
        return (
          <div className="prl-modal-overlay" onClick={() => setView(null)}>
            <div className="prl-modal prl-modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="prl-modal-head">
                <h3>Invoice {inv.invoice_no} <span className="ap-badge" style={{ background: '#2563eb1a', color: '#2563eb' }}>{apStatus(AP_INVOICE_STATUSES, inv.status).label}</span></h3>
                <button className="prl-btn-icon" onClick={() => setView(null)}><X size={16} /></button>
              </div>
              <div className="prl-detail-grid">
                <div className="prl-detail-card">
                  <h4>Invoice</h4>
                  <div className="prl-detail-item"><span>Supplier</span><strong>{sup?.name || '—'}</strong></div>
                  <div className="prl-detail-item"><span>Supplier Ref</span><strong>{inv.supplier_ref || '—'}</strong></div>
                  <div className="prl-detail-item"><span>Invoice Date</span><strong>{fmtDate(inv.invoice_date)}</strong></div>
                  <div className="prl-detail-item"><span>Due Date</span><strong>{inv.due_date ? fmtDate(inv.due_date) : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Tax Treatment</span><strong className="prl-cap">{inv.tax_treatment} @ {inv.vat_rate}%</strong></div>
                  <div className="prl-detail-item"><span>Account Charged</span><strong>{accountName(lines[0]?.account_id)}</strong></div>
                </div>
                <div className="prl-detail-card">
                  <h4>Totals</h4>
                  <div className="prl-detail-item"><span>Subtotal</span><strong>{fmt(inv.subtotal)}</strong></div>
                  <div className="prl-detail-item"><span>VAT</span><strong>{fmt(inv.vat_amount)}</strong></div>
                  <div className="prl-detail-item"><span>Total</span><strong>{fmt(inv.total_amount)}</strong></div>
                  <div className="prl-detail-item"><span>Paid</span><strong style={{ color: '#16a34a' }}>{fmt(inv.paid_amount)}</strong></div>
                  <div className="prl-detail-item"><span>Outstanding</span><strong style={{ color: '#dc2626' }}>{fmt(invoiceOutstanding(d, inv))}</strong></div>
                </div>
                <div className="prl-detail-card">
                  <h4>Approval Trail</h4>
                  <div className="prl-detail-item"><span>Created</span><strong>{d?.nameOf[inv.created_by] || '—'}{inv.created_at ? ` · ${fmtDateTime(inv.created_at)}` : ''}</strong></div>
                  <div className="prl-detail-item"><span>Submitted</span><strong>{inv.submitted_at ? `${d?.nameOf[inv.submitted_by] || '—'} · ${fmtDateTime(inv.submitted_at)}` : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Reviewed</span><strong>{inv.reviewed_at ? `${d?.nameOf[inv.reviewed_by] || '—'} · ${fmtDateTime(inv.reviewed_at)}` : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Approved</span><strong>{inv.approved_at ? `${d?.nameOf[inv.approved_by] || '—'} · ${fmtDateTime(inv.approved_at)}` : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Rejected</span><strong style={inv.rejected_at ? { color: '#dc2626' } : undefined}>{inv.rejected_at ? `${d?.nameOf[inv.rejected_by] || '—'} · ${fmtDateTime(inv.rejected_at)}${inv.rejection_reason ? ` — ${inv.rejection_reason}` : ''}` : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Posted</span><strong>{inv.posted_at ? `${d?.nameOf[inv.posted_by] || '—'} · ${fmtDateTime(inv.posted_at)}` : '—'}</strong></div>
                </div>
              </div>
              <div className="prl-card" style={{ margin: '0 18px 12px' }}>
                <h4 className="ap-card-title">Line Items</h4>
                <table className="prl-table" style={{ minWidth: 520 }}>
                  <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Discount</th><th>Amount</th></tr></thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i}>
                        <td>{l.description}</td>
                        <td>{l.quantity}</td>
                        <td>{fmt(l.unit_price)}</td>
                        <td>{fmt(l.discount_amount)}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(Math.max(Number(l.quantity) * Number(l.unit_price) - Number(l.discount_amount), 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {inv.journal_entry_id && <p className="prl-hint" style={{ marginTop: 8 }}>GL Entry: <span className="prl-mono">{inv.journal_entry_id}</span> (source: AP)</p>}
              </div>
              {pays.length > 0 && (
                <div className="prl-card" style={{ margin: '0 18px 12px' }}>
                  <h4 className="ap-card-title">Payments Applied</h4>
                  {pays.map((p) => {
                    const amt = (d.allocations || []).find((a) => a.payment_id === p.id && a.invoice_id === inv.id)?.amount || 0
                    return <div className="prl-detail-item" key={p.id}><span>{p.payment_no} · {p.payment_method}</span><strong>{fmt(amt)}</strong></div>
                  })}
                </div>
              )}
              <div className="prl-card" style={{ margin: '0 18px 12px' }}>
                <Attachments type="invoice" id={inv.id} />
              </div>
              <div className="prl-modal-foot">
                <button className="prl-btn-secondary" onClick={() => { setView(null); setPaymentForm({ ...blankPayment(), payment_type: 'invoice', supplier_id: inv.supplier_id }); pickSupplierForAlloc(inv.supplier_id); setPaymentModal(true) }}><Banknote size={14} /> Pay this invoice</button>
                <button className="prl-btn-secondary" onClick={() => setView(null)}>Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {view && d && view.type === 'payment' && (() => {
        const p = (d.payments || []).find((x) => x.id === view.id)
        if (!p) return null
        const sup = supplierOf(d, p.supplier_id)
        const allocs = (d.allocations || []).filter((a) => a.payment_id === p.id)
        const invs = allocs.map((a) => ({ inv: (d.invoices || []).find((i) => i.id === a.invoice_id), amount: a.amount })).filter((x) => x.inv)
        return (
          <div className="prl-modal-overlay" onClick={() => setView(null)}>
            <div className="prl-modal prl-modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="prl-modal-head">
                <h3>Payment {p.payment_no} <span className="ap-badge" style={{ background: '#2563eb1a', color: '#2563eb' }}>{apStatus(AP_PAYMENT_STATUSES, p.status).label}</span></h3>
                <button className="prl-btn-icon" onClick={() => setView(null)}><X size={16} /></button>
              </div>
              <div className="prl-detail-grid">
                <div className="prl-detail-card">
                  <h4>Payment</h4>
                  <div className="prl-detail-item"><span>Payee</span><strong>{sup?.name || p.payee_name || '—'}</strong></div>
                  <div className="prl-detail-item"><span>Type</span><strong className="prl-cap">{p.payment_type}</strong></div>
                  <div className="prl-detail-item"><span>Date</span><strong>{fmtDate(p.payment_date)}</strong></div>
                  <div className="prl-detail-item"><span>Method</span><strong className="prl-cap">{p.payment_method}</strong></div>
                  <div className="prl-detail-item"><span>Reference</span><strong className="prl-mono">{p.reference_no || '—'}</strong></div>
                </div>
                <div className="prl-detail-card">
                  <h4>Accounts</h4>
                  <div className="prl-detail-item"><span>Debit</span><strong>{p.payment_type === 'direct' ? accountName(p.expense_account_id) : accountName(d?.config?.defaults?.ap_account ? d.accountByCode?.[d.config.defaults.ap_account]?.id : p.payment_account_id)}</strong></div>
                  <div className="prl-detail-item"><span>Disbursed from</span><strong>{accountName(p.payment_account_id)}</strong></div>
                  <div className="prl-detail-item"><span>Amount</span><strong style={{ color: '#16a34a' }}>{fmt(p.amount)}</strong></div>
                </div>
                <div className="prl-detail-card">
                  <h4>Approval Trail</h4>
                  <div className="prl-detail-item"><span>Prepared</span><strong>{d?.nameOf[p.created_by] || '—'}{p.created_at ? ` · ${fmtDateTime(p.created_at)}` : ''}</strong></div>
                  <div className="prl-detail-item"><span>Reviewed</span><strong>{p.reviewed_at ? `${d?.nameOf[p.reviewed_by] || '—'} · ${fmtDateTime(p.reviewed_at)}` : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Approved</span><strong>{p.approved_at ? `${d?.nameOf[p.approved_by] || '—'} · ${fmtDateTime(p.approved_at)}` : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Rejected</span><strong style={p.rejected_at ? { color: '#dc2626' } : undefined}>{p.rejected_at ? `${d?.nameOf[p.rejected_by] || '—'} · ${fmtDateTime(p.rejected_at)}${p.rejection_reason ? ` — ${p.rejection_reason}` : ''}` : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Processed</span><strong>{p.processed_at ? `${d?.nameOf[p.processed_by] || '—'} · ${fmtDateTime(p.processed_at)}` : '—'}</strong></div>
                  <div className="prl-detail-item"><span>Paid</span><strong>{p.paid_at ? `${d?.nameOf[p.paid_by] || '—'} · ${fmtDateTime(p.paid_at)}` : '—'}</strong></div>
                </div>
              </div>
              {invs.length > 0 && (
                <div className="prl-card" style={{ margin: '0 18px 12px' }}>
                  <h4 className="ap-card-title">Settled Invoices</h4>
                  {invs.map(({ inv, amount }) => <div className="prl-detail-item" key={inv.id}><span>{inv.invoice_no} · {inv.supplier_ref || ''}</span><strong>{fmt(amount)}</strong></div>)}
                </div>
              )}
              <div className="prl-card" style={{ margin: '0 18px 12px' }}>
                <Attachments type="payment" id={p.id} />
              </div>
              <div className="prl-modal-foot">
                {['paid', 'posted'].includes(p.status) && <button className="prl-btn-primary" onClick={() => { setView(null); printVoucher(p) }}><Printer size={14} /> Voucher PDF</button>}
                <button className="prl-btn-secondary" onClick={() => setView(null)}>Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {view && d && view.type === 'supplier' && (() => {
        const s = (d.suppliers || []).find((x) => x.id === view.id)
        if (!s) return null
        const from = (d.invoices || []).filter((i) => i.supplier_id === s.id && i.invoice_date)
        const earliest = from.reduce((min, i) => (!min || i.invoice_date < min ? i.invoice_date : min), null) || TODAY
        const stmt = buildSupplierStatement(d, s.id, { from: earliest, to: TODAY })
        return (
          <div className="prl-modal-overlay" onClick={() => setView(null)}>
            <div className="prl-modal prl-modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="prl-modal-head">
                <h3>{s.name}</h3>
                <button className="prl-btn-icon" onClick={() => setView(null)}><X size={16} /></button>
              </div>
              <div className="prl-detail-grid">
                <div className="prl-detail-card">
                  <h4>Supplier</h4>
                  <div className="prl-detail-item"><span>Type</span><strong className="prl-cap">{AP_SUPPLIER_TYPES.find((t) => t.value === s.supplier_type)?.label || s.supplier_type}</strong></div>
                  <div className="prl-detail-item"><span>Contact</span><strong>{s.phone || s.email || '—'}</strong></div>
                  <div className="prl-detail-item"><span>KRA PIN</span><strong className="prl-mono">{s.kra_pin || '—'}</strong></div>
                  <div className="prl-detail-item"><span>Terms</span><strong>{s.payment_terms || '—'}</strong></div>
                </div>
                <div className="prl-detail-card">
                  <h4>Banking / M-Pesa</h4>
                  <div className="prl-detail-item"><span>Bank</span><strong>{s.bank_name || '—'}</strong></div>
                  <div className="prl-detail-item"><span>Account</span><strong className="prl-mono">{s.bank_account || '—'}</strong></div>
                  <div className="prl-detail-item"><span>Branch</span><strong>{s.bank_branch || '—'}</strong></div>
                  <div className="prl-detail-item"><span>M-Pesa</span><strong className="prl-mono">{s.mpesa_number || '—'}</strong></div>
                </div>
                <div className="prl-detail-card">
                  <h4>Balance</h4>
                  <div className="prl-detail-item"><span>Total Invoiced</span><strong>{fmt((d.invoices || []).filter((i) => i.supplier_id === s.id && ['posted', 'partially_paid', 'paid'].includes(i.status)).reduce((sum, i) => sum + Number(i.total_amount || 0), 0))}</strong></div>
                  <div className="prl-detail-item"><span>Outstanding</span><strong style={{ color: '#dc2626' }}>{fmt(stmt.closing)}</strong></div>
                </div>
              </div>
              <div className="prl-card" style={{ margin: '0 18px 12px' }}>
                <div className="prl-toolbar" style={{ marginBottom: 8 }}>
                  <h4 className="ap-card-title">Supplier Statement</h4>
                  <button className="prl-btn-secondary" onClick={() => setStatement({ supplier: s, statement: stmt })}><Printer size={13} /> Print Statement</button>
                </div>
                <table className="prl-table" style={{ minWidth: 520 }}>
                  <thead><tr><th>Date</th><th>Reference</th><th>Details</th><th>Debit (+)</th><th>Credit (−)</th><th>Balance</th></tr></thead>
                  <tbody>
                    <tr><td className="prl-mono">{fmtDate(earliest)}</td><td className="prl-mono">—</td><td>Opening balance</td><td></td><td></td><td style={{ fontWeight: 600 }}>{fmt(stmt.opening)}</td></tr>
                    {stmt.rows.map((r, i) => (
                      <tr key={i}>
                        <td>{fmtDate(r.date)}</td>
                        <td className="prl-mono">{r.ref}</td>
                        <td>{r.detail}</td>
                        <td style={{ color: '#dc2626' }}>{r.debit ? fmt(r.debit) : ''}</td>
                        <td style={{ color: '#16a34a' }}>{r.credit ? `(${fmt(r.credit)})` : ''}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(r.balance)}</td>
                      </tr>
                    ))}
                    <tr><td className="prl-mono">—</td><td className="prl-mono">—</td><td><strong>Closing balance</strong></td><td></td><td></td><td style={{ fontWeight: 700, color: '#dc2626' }}>{fmt(stmt.closing)}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="prl-card" style={{ margin: '0 18px 12px' }}>
                <Attachments type="supplier" id={s.id} />
              </div>
              <div className="prl-modal-foot">
                <button className="prl-btn-secondary" onClick={() => { setView(null); openPayment(s.id) }}><Banknote size={14} /> Pay this supplier</button>
                <button className="prl-btn-secondary" onClick={() => { setView(null); openInvoice({ ...blankInvoice(), supplier_id: s.id }) }}><Plus size={14} /> New invoice</button>
                <button className="prl-btn-secondary" onClick={() => setView(null)}>Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ Voucher modal ═══ */}
      {voucher && d && (() => {
        const p = voucher
        const sup = supplierOf(d, p.supplier_id)
        const allocs = (d.allocations || []).filter((a) => a.payment_id === p.id)
        const invs = allocs.map((a) => (d.invoices || []).find((i) => i.id === a.invoice_id)).filter(Boolean)
        return (
          <div className="prl-modal-overlay" onClick={() => setVoucher(null)}>
            <div className="prl-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
              <div className="prl-modal-head">
                <h3>Payment Voucher {voucherNo(p)}</h3>
                <div>
                  <button className="prl-btn-icon" onClick={() => printVoucher(p)} title="Download PDF"><Download size={16} /></button>
                  <button className="prl-btn-icon" onClick={() => window.print()} title="Print"><Printer size={16} /></button>
                  <button className="prl-btn-icon" onClick={() => setVoucher(null)}><X size={16} /></button>
                </div>
              </div>
              <div className="ap-sheet">
                <div className="ap-sheet-head">
                  <div>
                    <h2>{schoolName || 'ShulePulse'}</h2>
                    <p>{school?.address || ''} {school?.phone || ''}</p>
                  </div>
                  <div className="ap-sheet-right">
                    <h3>PAYMENT VOUCHER</h3>
                    <p>No: <strong className="prl-mono">{voucherNo(p)}</strong></p>
                    <p>Date: <strong>{fmtDate(p.payment_date)}</strong></p>
                  </div>
                </div>
                <div className="ap-sheet-rows">
                  <div><span>Payee</span><strong>{sup?.name || p.payee_name || '—'}</strong></div>
                  <div><span>Payee Type</span><strong className="prl-cap">{sup?.supplier_type || p.payee_type || '—'}</strong></div>
                  <div><span>Payment Method</span><strong className="prl-cap">{p.payment_method}</strong></div>
                  <div><span>Reference No.</span><strong className="prl-mono">{p.reference_no || '—'}</strong></div>
                  <div><span>Amount</span><strong>{fmt(p.amount)}</strong></div>
                  <div><span>Account Charged</span><strong>{accountName(p.payment_type === 'direct' ? p.expense_account_id : p.payment_account_id)}</strong></div>
                  <div className="ap-sheet-full"><span>Description</span><strong>{p.description || '—'}</strong></div>
                  <div className="ap-sheet-full"><span>Related Invoice(s)</span><strong>{invs.map((i) => i.invoice_no).join(', ') || '—'}</strong></div>
                </div>
                <div className="ap-sheet-signs">
                  <div><span>Prepared By</span><strong>{d.nameOf[p.created_by] || '—'}</strong><div className="ap-sign-line" /></div>
                  <div><span>Reviewed By</span><strong>{d.nameOf[p.reviewed_by] || '—'}</strong><div className="ap-sign-line" /></div>
                  <div><span>Approved By</span><strong>{d.nameOf[p.approved_by] || '—'}</strong><div className="ap-sign-line" /></div>
                  <div><span>Paid / Processed By</span><strong>{d.nameOf[p.paid_by || p.processed_by] || '—'}</strong><div className="ap-sign-line" /></div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ Statement print modal ═══ */}
      {statement && (
        <div className="prl-modal-overlay" onClick={() => setStatement(null)}>
          <div className="prl-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="prl-modal-head">
              <h3>Supplier Statement</h3>
              <div>
                <button className="prl-btn-icon" onClick={() => window.print()} title="Print"><Printer size={16} /></button>
                <button className="prl-btn-icon" onClick={() => setStatement(null)}><X size={16} /></button>
              </div>
            </div>
            <div className="ap-sheet">
              <div className="ap-sheet-head">
                <div>
                  <h2>{schoolName || 'ShulePulse'}</h2>
                  <p>{school?.address || ''} {school?.phone || ''}</p>
                </div>
                <div className="ap-sheet-right">
                  <h3>SUPPLIER STATEMENT</h3>
                  <p>{statement.supplier.name}</p>
                </div>
              </div>
              <table className="ap-stmt">
                <thead><tr><th>Date</th><th>Reference</th><th>Details</th><th>Invoice (+)</th><th>Payment (−)</th><th>Balance</th></tr></thead>
                <tbody>
                  <tr><td>—</td><td>—</td><td>Opening balance</td><td></td><td></td><td className="ap-stmt-strong">{fmt(statement.statement.opening)}</td></tr>
                  {statement.statement.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{fmtDate(r.date)}</td><td className="prl-mono">{r.ref}</td><td>{r.detail}</td>
                      <td style={{ color: '#dc2626' }}>{r.debit ? fmt(r.debit) : ''}</td>
                      <td style={{ color: '#16a34a' }}>{r.credit ? `(${fmt(r.credit)})` : ''}</td>
                      <td className="ap-stmt-strong">{fmt(r.balance)}</td>
                    </tr>
                  ))}
                  <tr><td>—</td><td>—</td><td><strong>Closing balance</strong></td><td></td><td></td><td className="ap-stmt-strong" style={{ color: '#dc2626' }}>{fmt(statement.statement.closing)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Reject dialog ═══ */}
      {rejectTarget && (
        <div className="prl-modal-overlay" onClick={() => setRejectTarget(null)}>
          <div className="prl-modal prl-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head">
              <h3>Reject {rejectTarget.type === 'invoice' ? 'Invoice' : 'Payment'}</h3>
              <button className="prl-btn-icon" onClick={() => setRejectTarget(null)}><X size={16} /></button>
            </div>
            <p className="prl-confirm-msg">Provide a reason so the requestor can correct and resubmit.</p>
            <div className="prl-form-grid" style={{ padding: '0 18px' }}>
              <label className="prl-field prl-field-full"><span>Rejection reason *</span>
                <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Missing invoice attachment, wrong GL account, no supporting document..." />
              </label>
            </div>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
              <button className="prl-btn-danger" disabled={!rejectReason.trim()} onClick={confirmReject}>Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Confirm dialog ═══ */}
      {confirm && (
        <div className="prl-modal-overlay" onClick={() => setConfirm(null)}>
          <div className="prl-modal prl-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head"><h3>Confirm action</h3><button className="prl-btn-icon" onClick={() => setConfirm(null)}><X size={16} /></button></div>
            <p className="prl-confirm-msg">{confirm.message}</p>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="prl-btn-danger" onClick={() => { confirm.action(); setConfirm(null) }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onAttachFile} />
      {toast && <div className={`prl-toast ${toast.ok ? '' : 'error'}`}>{toast.msg}</div>}
    </div>
  )
}
