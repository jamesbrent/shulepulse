import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Search, RefreshCw, Pencil, Trash2, X, Eye, Printer,
  Wallet, Users, Settings2, FileText, CheckCircle,
  Banknote, AlertTriangle, UserPlus, Columns3
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { useBrandingStore } from '../../features/branding/brandingStore'
import { fmt, fmtDateTime, downloadFile } from '../admin/fees/utils/feesHelpers'
import { postToJournal, writeAudit, ensureAccounts } from './accountsUtils'
import {
  computeEmployeePay, loadPayrollData, nextEmployeeNo, nextRunNo, nextRequestNo,
  postPayrollJournal, resolveAccountMap, ACCOUNT_MAPPING_ITEMS, ACCOUNT_MAPPING_KEYS,
  ITEM_TYPES, PAY_METHODS, ALLOWANCE_TAX_TREATMENTS, allowanceTreatmentLabel,
  runStatus, paymentStatus,
} from './payrollUtils'
import Payslip from './Payslip'
import './Payroll.css'

const TODAY = new Date().toISOString().split('T')[0]
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const monthLabel = (m, y) => `${MONTHS[(Number(m)||1)-1]} ${y}`
const roleLabel = (r) => r ? r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : ''

const PAY_BADGES = {
  initiated: { label: 'Pending',  color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  reviewed:  { label: 'Reviewed', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  approved:  { label: 'Approved', color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
  processed: { label: 'Processed', color: '#0e7490', bg: '#ecfeff', border: '#a5f3fc' },
  posted:    { label: 'Posted',   color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  cancelled: { label: 'Cancelled', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
}
const RECON_BADGE = { label: 'Needs reconciliation', color: '#b45309', bg: '#fffbeb', border: '#f59e0b' }
const statusBadge = (status) => PAY_BADGES[status] || { label: status || '—', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' }

const blankEmployee = () => ({
  employee_no: '', profile_id: '', staff_type: 'teaching', job_title: '',
  department: '', basic_salary: '', kra_pin: '', shif_no: '', nssf_no: '',
  helb_number: '', sacco_name: '', union_name: '', bank_name: '', bank_account: '',
  pay_method: 'bank', active: true, notes: '',
})

const blankItem = () => ({ item_type: 'allowance', name: '', amount: '', is_taxable: true, tax_treatment: 'taxable', is_helb: false, active: true })

const CONFIG_LABELS = {
  paye_bands: 'PAYE Bands',
  personal_relief: 'Personal Relief',
  nssf_rate: 'NSSF Rate',
  shif_rate: 'SHIF / SHA',
  housing_levy_rate: 'Housing Levy',
  nita_amount: 'NITA Levy',
  allowance_exempt_threshold: 'Tax-Free Allowance Threshold',
}

export default function PayrollPage({ initialTab }) {
  const { profile } = useAuthStore()
  const { school } = useSchool()
  const { schoolName } = useBrandingStore()
  const schoolId = profile?.school_id
  const userId = profile?.id
  const role = profile?.role

  const [tab, setTab] = useState(initialTab || 'runs')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const [employees, setEmployees] = useState([])
  const [items, setItems] = useState([])
  const [config, setConfig] = useState(null)
  const [periods, setPeriods] = useState([])
  const [runs, setRuns] = useState([])
  const [payRequests, setPayRequests] = useState([])
  const [reqJournalLines, setReqJournalLines] = useState({})
  const [payCorrections, setPayCorrections] = useState({})
  const [fixingReq, setFixingReq] = useState(null)
  const [staff, setStaff] = useState([])
  const [teachers, setTeachers] = useState([])

  const [search, setSearch] = useState('')
  const [selectedRun, setSelectedRun] = useState(null)
  const [payslipLine, setPayslipLine] = useState(null)

  // Salary Payments filters
  const [paySearch, setPaySearch] = useState('')
  const [payStatusFilter, setPayStatusFilter] = useState('')
  const [payRunFilter, setPayRunFilter] = useState('')
  const [payMethodFilter, setPayMethodFilter] = useState('')

  // accounting integration (Payroll → Chart of Accounts mapping)
  const [glAccounts, setGlAccounts] = useState([])
  const [acctMap, setAcctMap] = useState({})
  const [acctMapDraft, setAcctMapDraft] = useState(null)
  const [acctMapSaving, setAcctMapSaving] = useState(false)

  // new run pickers
  const [runMonth, setRunMonth] = useState(new Date().getMonth() + 1)
  const [runYear, setRunYear] = useState(new Date().getFullYear())

  // modals
  const [empModal, setEmpModal] = useState(null)          // { employee } for edit, null closed
  const [empForm, setEmpForm] = useState(blankEmployee())
  const [empDetail, setEmpDetail] = useState(null)        // full employee details + pay preview
  const [itemEmp, setItemEmp] = useState(null)            // employee whose items we manage
  const [itemForm, setItemForm] = useState(blankItem())
  const [editingItemId, setEditingItemId] = useState(null)
  const [configItem, setConfigItem] = useState(null)
  const [confirm, setConfirm] = useState(null)            // { title, message, action }
  const [payModal, setPayModal] = useState(null)          // { run, amount, method, reference }

  const isAdmin = ['admin', 'deputy_administrator', 'superadmin'].includes(role)

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3200)
  }

  const load = useCallback(async () => {
    if (!schoolId) return
    setLoading(true)
    try {
      const data = await loadPayrollData(supabase, schoolId)
      const { data: staffRes } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role')
        .eq('school_id', schoolId)
        .order('full_name', { ascending: true })
      const { data: teacherRes } = await supabase
        .from('teachers')
        .select('id, full_name, email, staff_number, employee_number')
        .eq('school_id', schoolId)
      const { data: reqRes } = await supabase
        .from('payroll_payment_requests')
        .select('*, payroll_runs(run_label, journal_entry_id)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
      const reqIds = (reqRes || []).map((r) => r.journal_entry_id).filter(Boolean)
      let linesByJe = {}
      if (reqIds.length) {
        const { data: jel } = await supabase
          .from('journal_entry_lines')
          .select('journal_entry_id, debit, credit, chart_of_accounts(code, name)')
          .in('journal_entry_id', reqIds)
        ;(jel || []).forEach((l) => {
          (linesByJe[l.journal_entry_id] = linesByJe[l.journal_entry_id] || []).push(l)
        })
      }
      setReqJournalLines(linesByJe)
      let corrMap = {}
      if (reqIds.length) {
        const { data: corrRes } = await supabase
          .from('journal_entries')
          .select('reference_id')
          .eq('school_id', schoolId)
          .eq('source', 'payroll')
          .eq('reference_type', 'payroll_payment_correction')
          .in('reference_id', reqIds)
        ;(corrRes || []).forEach((j) => { corrMap[j.reference_id] = true })
      }
      setPayCorrections(corrMap)
      const { data: coaRes } = await supabase
        .from('chart_of_accounts')
        .select('id, code, name, type, category')
        .eq('school_id', schoolId)
        .order('code', { ascending: true })
      const { data: mapRes } = await supabase
        .from('payroll_account_mapping')
        .select('item, account_id')
        .eq('school_id', schoolId)
      setEmployees(data.employees)
      setItems(data.items)
      setConfig(data.config)
      setPeriods(data.periods)
      setRuns(data.runs)
      setPayRequests(reqRes || [])
      setStaff((staffRes || []).filter((s) => s.role !== 'student' && s.role !== 'parent'))
      setTeachers(teacherRes || [])
      setGlAccounts(coaRes || [])
      setAcctMap(Object.fromEntries((mapRes || []).map((r) => [r.item, r.account_id])))
    } catch (e) {
      console.error(e)
      showToast(e.message, false)
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => { load() }, [load])

  const itemsByEmp = useMemo(() => {
    const m = {}
    for (const it of items) (m[it.employee_id] = m[it.employee_id] || []).push(it)
    return m
  }, [items])

  const staffOptions = staff.filter((s) => !employees.some((e) => e.profile_id === s.id) || empModal?.employee?.profile_id === s.id)

  const empById = Object.fromEntries(employees.map((e) => [e.id, e]))

  // Live monthly pay preview for one employee using the current statutory config.
  const payPreview = (emp) => {
    if (!emp) return null
    try { return computeEmployeePay(emp, config) } catch { return null }
  }

  const runTotals = (run) => {
    const lines = run.payroll_lines || []
    const t = {
      gross: 0, net: 0, deductions: 0, employer: 0,
      count: lines.length || (run.status === 'draft' ? employees.filter((e) => e.active).length : 0),
    }
    for (const l of lines) {
      t.gross += Number(l.gross_pay || 0)
      t.net += Number(l.net_pay || 0)
      t.deductions += Number(l.paye || 0) + Number(l.shif || 0) + Number(l.nssf_employee || 0) +
        Number(l.housing_employee || 0) + Number(l.helb || 0) + Number(l.other_deductions || 0)
      t.employer += Number(l.employer_total || 0)
    }
    return t
  }

  const roster = useMemo(() => {
    const empByProfile = Object.fromEntries(employees.map((e) => [e.profile_id, e]))
    const staffById = Object.fromEntries(staff.map((s) => [s.id, s]))
    const teacherByEmail = Object.fromEntries(teachers.map((t) => [(t.email || '').toLowerCase(), t]))
    const rows = []
    for (const s of staff) {
      const emp = empByProfile[s.id]
      const t = teacherByEmail[(s.email || '').toLowerCase()]
      const ids = { staffNo: t?.employee_number || '', tscNo: t?.staff_number || '' }
      rows.push(emp
        ? { ...emp, isPayroll: true, staffRole: s.role, ...ids }
        : {
            id: s.id, profile_id: s.id, employee_no: '', full_name: s.full_name,
            staff_type: '', job_title: s.role, department: '', basic_salary: 0,
            bank_name: '', bank_account: '', kra_pin: '', shif_no: '', nssf_no: '',
            helb_number: '', active: null, items: [], isPayroll: false, staffRole: s.role,
            profiles: { phone: s.phone }, ...ids,
          })
    }
    for (const e of employees) {
      if (staffById[e.profile_id]) continue
      const t = teacherByEmail[((e.profiles?.email) || '').toLowerCase()]
      rows.push({ ...e, isPayroll: true, staffRole: e.profiles?.role, staffNo: t?.employee_number || '', tscNo: t?.staff_number || '' })
    }
    rows.sort((a, b) => {
      if (a.isPayroll !== b.isPayroll) return a.isPayroll ? -1 : 1
      return (a.full_name || '').localeCompare(b.full_name || '')
    })
    return rows
  }, [staff, employees, teachers])

  const filteredEmployees = roster.filter((e) => {
    const q = search.toLowerCase()
    return !q || (e.full_name || '').toLowerCase().includes(q) || (e.employee_no || '').toLowerCase().includes(q) ||
      (e.job_title || '').toLowerCase().includes(q) || (e.department || '').toLowerCase().includes(q)
  })

  const paidRuns = runs.filter((r) => ['posted', 'paid'].includes(r.status))
  const postedPaidRuns = runs.filter((r) => ['posted', 'paid'].includes(r.status))

  // ─── Employee CRUD ─────────────────────────────────────────────────────────
  const openAddEmployee = async (staffMember = null) => {
    setEmpForm({ ...blankEmployee(), employee_no: await nextEmployeeNo(supabase, schoolId), profile_id: staffMember?.id || '' })
    setEmpModal({ employee: null })
  }

  const openEditEmployee = (e) => {
    setEmpForm({ ...e })
    setEmpModal({ employee: e })
  }

  const saveEmployee = async () => {
    if (!empForm.profile_id) return showToast('Select a staff member', false)
    if (Number(empForm.basic_salary) < 0) return showToast('Basic salary cannot be negative', false)
    const COLUMNS = ['profile_id', 'employee_no', 'staff_type', 'job_title', 'department', 'basic_salary',
      'kra_pin', 'shif_no', 'nssf_no', 'helb_number', 'sacco_name', 'union_name',
      'bank_name', 'bank_account', 'pay_method', 'active', 'notes']
    const payload = { ...Object.fromEntries(COLUMNS.map((k) => [k, empForm[k]])), basic_salary: Number(empForm.basic_salary || 0) }
    const { error } = empModal?.employee
      ? await supabase.from('payroll_employees').update(payload).eq('id', empModal.employee.id)
      : await supabase.from('payroll_employees').insert({ ...payload, school_id: schoolId, created_by: userId })
    if (error) return showToast(error.message, false)
    setEmpModal(null)
    showToast(empModal?.employee ? 'Employee updated' : 'Employee added')
    load()
  }

  const deleteEmployee = async (e) => {
    const { error } = await supabase.from('payroll_employees').delete().eq('id', e.id)
    if (error) return showToast(error.message, false)
    showToast('Employee removed')
    load()
  }

  // ─── Items ─────────────────────────────────────────────────────────────────
  const openItems = (e) => {
    setItemEmp(e)
    setItemForm(blankItem())
    setEditingItemId(null)
  }

  const saveItem = async () => {
    if (!itemForm.name) return showToast('Item name is required', false)
    if (Number(itemForm.amount) <= 0) return showToast('Amount must be positive', false)
    const payload = { ...itemForm, amount: Number(itemForm.amount), employee_id: itemEmp.id }
    const { error } = editingItemId
      ? await supabase.from('payroll_employee_items').update(payload).eq('id', editingItemId)
      : await supabase.from('payroll_employee_items').insert({ ...payload, school_id: schoolId })
    if (error) return showToast(error.message, false)
    setItemForm(blankItem())
    setEditingItemId(null)
    showToast(editingItemId ? 'Item updated' : 'Item added')
    load()
  }

  const deleteItem = async (id) => {
    const { error } = await supabase.from('payroll_employee_items').delete().eq('id', id)
    if (error) return showToast(error.message, false)
    showToast('Item removed')
    load()
  }

  // ─── Run workflow ──────────────────────────────────────────────────────────
  const ensurePeriod = async (month, year) => {
    const existing = periods.find((p) => Number(p.period_month) === Number(month) && Number(p.period_year) === Number(year))
    if (existing) return existing
    const label = monthLabel(month, year)
    const { data, error } = await supabase
      .from('payroll_periods')
      .insert({ school_id: schoolId, period_month: month, period_year: year, period_label: label, start_date: `${year}-${String(month).padStart(2, '0')}-01` })
      .select()
      .single()
    if (error) throw error
    return data
  }

  const createRun = async () => {
    try {
      const period = await ensurePeriod(runMonth, runYear)
      const runNo = await nextRunNo(supabase, schoolId)
      const { error } = await supabase.from('payroll_runs').insert({
        school_id: schoolId, period_id: period.id, run_no: runNo,
        run_label: `${monthLabel(runMonth, runYear)} Payroll`, status: 'draft', created_by: userId,
      })
      if (error) throw error
      showToast(`Payroll run ${runNo} created`)
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const calculateRun = async (run) => {
    try {
      const actives = employees.filter((e) => e.active)
      if (!actives.length) return showToast('Add at least one active employee first', false)
      const computed = actives.map((e) => ({ emp: e, p: computeEmployeePay(e, config) }))
      const { error: delErr } = await supabase.from('payroll_lines').delete().eq('run_id', run.id)
      if (delErr) throw delErr
      const rows = computed.map(({ emp, p }) => ({
        school_id: schoolId, run_id: run.id, employee_id: emp.id,
        employee_no: emp.employee_no, employee_name: emp.full_name, staff_type: emp.staff_type,
        basic_salary: p.basic_salary, allowances_total: p.allowances_total, overtime: p.overtime,
        gross_pay: p.gross_pay, taxable_pay: p.taxable_pay, paye: p.paye, shif: p.shif,
        nssf_employee: p.nssf_employee, nssf_employer: p.nssf_employer,
        housing_employee: p.housing_employee, housing_employer: p.housing_employer,
        nita: p.nita, helb: p.helb, other_deductions: p.other_deductions, net_pay: p.net_pay,
        employer_total: p.employer_total, breakdown: p.breakdown,
      }))
      const { error: insErr } = await supabase.from('payroll_lines').insert(rows)
      if (insErr) throw insErr
      const totals = {
        gross: computed.reduce((s, c) => s + c.p.gross_pay, 0),
        net: computed.reduce((s, c) => s + c.p.net_pay, 0),
        paye: computed.reduce((s, c) => s + c.p.paye, 0),
        employer: computed.reduce((s, c) => s + c.p.employer_total, 0),
        count: rows.length,
      }
      const { error: upErr } = await supabase.from('payroll_runs').update({ status: 'calculated', totals }).eq('id', run.id)
      if (upErr) throw upErr
      showToast(`Calculated ${rows.length} payslips`)
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const advanceRun = async (run, nextStatus, extra = {}) => {
    const { error } = await supabase.from('payroll_runs').update({ status: nextStatus, ...extra, updated_at: new Date().toISOString() }).eq('id', run.id)
    if (error) return showToast(error.message, false)
    showToast(`Run ${nextStatus === 'paid' ? 'marked paid' : `moved to ${runStatus(nextStatus).label}`}`)
    load()
  }

  const approveRun = async (run) => {
    if (!isAdmin) return showToast('Only the admin / principal can approve payroll', false)
    await advanceRun(run, 'approved', { approved_by: userId, approved_at: new Date().toISOString() })
  }

  const deleteRun = async (run) => {
    try {
      const { error } = await supabase.from('payroll_runs').delete().eq('id', run.id)
      if (error) throw error
      showToast(`Run ${run.run_no} deleted`)
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const postRun = async (run) => {
    try {
      if (run.journal_entry_id) return showToast('Run already posted to the GL', false)
      const { data: lines } = await supabase.from('payroll_lines').select('*').eq('run_id', run.id)
      if (!lines?.length) return showToast('Nothing to post — calculate the run first', false)
      const je = await postPayrollJournal(supabase, { schoolId, userId, runId: run.id, entryDate: TODAY, lines })
      const nextStatus = run.status === 'paid' ? 'paid' : 'posted'
      const { error } = await supabase.from('payroll_runs').update({
        status: nextStatus, journal_entry_id: je.id, posted_by: userId, posted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', run.id)
      if (error) throw error
      showToast(`Journal ${je.entry_no} posted`)
      load()
    } catch (e) { showToast(e.message, false) }
  }

  // ─── Payment requests ──────────────────────────────────────────────────────
  const openPaymentModal = (run) => {
    if (payRequests.find((r) => r.run_id === run.id)) return showToast('A payment request already exists for this run', false)
    const totals = runTotals(run)
    if (totals.net <= 0) return showToast('Nothing to pay', false)
    setPayModal({ run, amount: totals.net, method: 'bank', reference: '' })
  }

  const submitPaymentRequest = async () => {
    try {
      const { run, method, reference } = payModal
      const existing = payRequests.find((r) => r.run_id === run.id)
      if (existing) return showToast('A payment request already exists for this run', false)
      const reqNo = await nextRequestNo(supabase, schoolId)
      const { error } = await supabase.from('payroll_payment_requests').insert({
        school_id: schoolId, run_id: run.id, request_no: reqNo,
        amount: Math.round(payModal.amount * 100) / 100,
        payment_method: method, reference_no: reference || null, status: 'initiated',
        requested_by: userId, notes: `Net pay for ${run.run_label}`,
      })
      if (error) throw error
      setPayModal(null)
      showToast(`Payment request ${reqNo} initiated (${PAY_METHODS.find((m) => m.value === method)?.label})`)
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const advanceRequest = async (req, nextStatus, extra = {}) => {
    if (nextStatus === 'approved' && !req.payroll_runs?.journal_entry_id) {
      return showToast('Post the payroll run to the General Ledger before approving its payment', false)
    }
    const { error } = await supabase.from('payroll_payment_requests').update({
      status: nextStatus, ...extra, updated_at: new Date().toISOString(),
    }).eq('id', req.id)
    if (error) return showToast(error.message, false)
    if (nextStatus === 'approved' && req.run_id) {
      await supabase.from('payroll_runs').update({ status: 'paid', paid_by: userId, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', req.run_id)
    }
    showToast(`Request ${paymentStatus(nextStatus).label.toLowerCase()}`)
    load()
  }

  const postRequest = async (req) => {
    try {
      if (req.journal_entry_id || req.status === 'posted') return showToast('Payment already posted to the GL', false)
      const method = req.payment_method || 'bank'
      await ensureAccounts(supabase, schoolId, ['1010', '1030'])
      const { map, byCode } = await resolveAccountMap(supabase, schoolId)
      const wagesId = map.net_pay
      const payAccId = method === 'cash' ? byCode['1010'] : method === 'mobile' ? byCode['1030'] : map.bank
      if (!wagesId || !payAccId) throw new Error('Map Net Pay (Wages Payable) and Bank/Cash accounts in Payroll → Accounting Mapping')
      const { data: payAcc } = await supabase.from('chart_of_accounts').select('*').eq('id', payAccId).single()
      if (payAcc.error || !payAcc.data) throw new Error('Disbursement account not found in the chart')
      const methodLabel = PAY_METHODS.find((m) => m.value === method)?.label || method
      const je = await postToJournal(supabase, {
        schoolId, userId, entry_date: TODAY,
        description: `Salary payment ${req.request_no}`,
        source: 'payroll', reference_type: 'payroll_payment', reference_id: req.id,
        lines: [
          { account_id: wagesId, debit: Number(req.amount), notes: 'Net pay disbursed' },
          { account_id: payAccId, credit: Number(req.amount), notes: `Paid via ${methodLabel} from ${payAcc.data.name}${req.reference_no ? ` (${req.reference_no})` : ''}` },
        ],
      })
      const { error: upErr } = await supabase.from('payroll_payment_requests').update({
        status: 'posted', journal_entry_id: je.id, updated_at: new Date().toISOString(),
      }).eq('id', req.id)
      if (upErr) throw upErr
      await writeAudit(supabase, { schoolId, action: 'salary_paid', details: { request_id: req.id, journal_id: je.id, amount: req.amount } })
      showToast(`Payment ${req.request_no} posted (${je.entry_no})`)
      load()
    } catch (e) { showToast(e.message, false) }
  }

  // ─── Statutory config ──────────────────────────────────────────────────────
  const configSummary = (row) => {
    const v = row.value
    switch (row.item) {
      case 'paye_bands': {
        const bands = v.bands || []
        return `${bands.length} bands · relief KSh ${config?.personalRelief ?? 2400}/mo`
      }
      case 'personal_relief': return `KSh ${v.amount}/month`
      case 'nssf_rate': {
        const t1 = v.tier1_ceiling, t2 = v.tier2_ceiling
        return t1 && t2
          ? `${v.rate}% ee/er · Tier I up to KSh ${t1} · Tier II up to KSh ${t2} (max ee ${v.rate}% × ${t2} = ${((v.rate / 100) * t2).toLocaleString()})`
          : `${v.rate}% capped at KSh ${v.max}`
      }
      case 'shif_rate': return `${v.rate}% of gross${v.ceiling ? ` (cap KSh ${v.ceiling})` : ''}`
      case 'housing_levy_rate': return `${v.rate}% employee + ${v.employer_rate}% employer`
      case 'nita_amount': return `KSh ${v.amount}/month (employer)`
      case 'allowance_exempt_threshold': return `KSh ${v.amount} per "Taxable Above Threshold" allowance per month`
      default: return JSON.stringify(v)
    }
  }

  const openConfigEdit = (row) => {
    setConfigItem({ ...row, value: JSON.parse(JSON.stringify(row.value || {})) })
  }

  const saveConfig = async () => {
    try {
      const v = configItem.value
      if (configItem.item === 'paye_bands') {
        if (typeof v.bands === 'string') v.bands = JSON.parse(v.bands)
        if (!Array.isArray(v.bands) || !v.bands.length) throw new Error('Enter valid PAYE bands JSON')
      }
      const direct = isAdmin
      const { error } = await supabase.from('payroll_statutory_config').insert({
        school_id: schoolId, item: configItem.item, value: v,
        effective_from: TODAY, notes: `Updated ${TODAY}`,
        status: direct ? 'approved' : 'pending',
        submitted_by: direct ? null : userId,
        submitted_at: direct ? null : new Date().toISOString(),
      })
      if (error) throw error
      setConfigItem(null)
      showToast(direct
        ? `${CONFIG_LABELS[configItem.item]} updated — applies from today`
        : `${CONFIG_LABELS[configItem.item]} change submitted — awaiting admin approval`)
      load()
    } catch (e) { showToast(e.message, false) }
  }

  const decideConfigChange = async (row, approve) => {
    if (!isAdmin) return showToast('Only the admin / principal can approve statutory changes', false)
    const { error } = await supabase.from('payroll_statutory_config').update({
      status: approve ? 'approved' : 'rejected',
      effective_from: approve ? TODAY : row.effective_from,
      approved_by: userId,
      approved_at: new Date().toISOString(),
      notes: approve ? `Approved ${TODAY} — ${row.notes || ''}`.trim() : `Rejected ${TODAY} — ${row.notes || ''}`.trim(),
    }).eq('id', row.id)
    if (error) return showToast(error.message, false)
    showToast(approve
      ? `${CONFIG_LABELS[row.item]} change approved — applies from today`
      : `${CONFIG_LABELS[row.item]} change rejected`)
    load()
  }

  // ─── Accounting mapping (Payroll → Chart of Accounts) ─────────────────────
  const openMappingEdit = () => {
    const draft = {}
    for (const key of ACCOUNT_MAPPING_KEYS) draft[key] = acctMap[key] || ''
    setAcctMapDraft(draft)
  }

  const saveAccountMapping = async () => {
    if (!acctMapDraft) return
    setAcctMapSaving(true)
    try {
      const rows = ACCOUNT_MAPPING_KEYS
        .filter((k) => acctMapDraft[k])
        .map((k) => ({ school_id: schoolId, item: k, account_id: acctMapDraft[k], updated_at: new Date().toISOString() }))
      if (!rows.length) throw new Error('Assign at least one account')
      const { error } = await supabase.from('payroll_account_mapping').upsert(rows, { onConflict: 'school_id,item' })
      if (error) throw error
      setAcctMapDraft(null)
      showToast('Accounting mapping saved — applies to new postings')
      await writeAudit(supabase, { schoolId, action: 'payroll_account_mapping_saved', details: { items: rows.length } })
      load()
    } catch (e) { showToast(e.message, false) }
    finally { setAcctMapSaving(false) }
  }

  const mappedAccountLabel = (key) => {
    const id = acctMap[key] || glAccounts.find((a) => a.code === ACCOUNT_MAPPING_ITEMS[key].defaultCode)?.id
    return glAccounts.find((a) => a.id === id)
  }

  const isCashBankAccount = (acc) => !!acc && (acc.category || '').toLowerCase() === 'cash & bank'

  // The GL account a salary payment is disbursed from, driven by the payment
  // method: cash → Petty Cash (1010), mobile → Mobile Money (1030), otherwise
  // the school's mapped Bank / Cash Disbursement account (default 1020). This
  // must mirror the resolution in postRequest() so Cash & Bank positions move
  // on the account the money actually leaves.
  const disbursementAccount = (req) => {
    const method = req?.payment_method || 'bank'
    if (method === 'cash') return glAccounts.find((a) => a.code === '1010')
    if (method === 'mobile') return glAccounts.find((a) => a.code === '1030')
    const mapped = mappedAccountLabel('bank')
    if (mapped && isCashBankAccount(mapped)) return mapped
    return glAccounts.find((a) => a.code === '1020')
  }

  // The account the posted salary journal ACTUALLY credited (what the money
  // really left). null = request not posted yet.
  const glCreditAccount = (req) => {
    const ls = reqJournalLines[req.journal_entry_id] || []
    const cr = ls.find((l) => Number(l.credit) > 0)
    return cr?.chart_of_accounts || null
  }

  // True when this posted payment's GL credit did not land on the method's
  // cash/bank source account (old code always credited the mapped Bank). These
  // never moved the Cash & Bank dashboard, so we can detect and repair them.
  const misplacementFor = (r) => {
    if (!r.journal_entry_id || payCorrections[r.id]) return null
    const credited = glCreditAccount(r)
    const shouldBe = disbursementAccount(r)
    if (!credited || !shouldBe) return null
    const wrong = credited.id !== shouldBe.id || !isCashBankAccount(credited)
    return wrong ? { req: r, credited, shouldBe } : null
  }

  const misplacedPayments = () => payRequests.map(misplacementFor).filter(Boolean)

  const payRunOptions = useMemo(
    () => [...new Set(payRequests.map((r) => r.payroll_runs?.run_label).filter(Boolean))],
    [payRequests]
  )

  const filteredRequests = useMemo(() => {
    const q = paySearch.trim().toLowerCase()
    return payRequests.filter((r) => {
      if (payStatusFilter && r.status !== payStatusFilter) return false
      if (payRunFilter && (r.payroll_runs?.run_label || '') !== payRunFilter) return false
      if (payMethodFilter && r.payment_method !== payMethodFilter) return false
      if (q && !`${r.request_no} ${r.reference_no || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [payRequests, paySearch, payStatusFilter, payRunFilter, payMethodFilter])

  const needsRecon = misplacedPayments()
  const hasPostedRequests = payRequests.some((r) => r.journal_entry_id)


  const fixMisplacement = async (item) => {
    const { req, credited, shouldBe } = item
    if (fixingReq || payCorrections[req.id]) return
    setFixingReq(req.id)
    try {
      const je = await postToJournal(supabase, {
        schoolId, userId, entry_date: TODAY,
        description: `Correct salary payment ${req.request_no}: ${credited.code} ${credited.name} → ${shouldBe.code} ${shouldBe.name}`,
        source: 'payroll', reference_type: 'payroll_payment_correction', reference_id: req.id,
        lines: [
          { account_id: credited.id, debit: Number(req.amount), notes: 'Reverse misplaced salary credit' },
          { account_id: shouldBe.id, credit: Number(req.amount), notes: `Re-allocated to ${shouldBe.code} ${shouldBe.name}` },
        ],
      })
      await writeAudit(supabase, {
        schoolId, action: 'salary_payment_corrected',
        details: { request_id: req.id, journal_id: je.id, amount: req.amount, from: credited.code, to: shouldBe.code },
      })
      showToast(`Corrected ${req.request_no} → ${shouldBe.code} ${shouldBe.name} (${je.entry_no})`)
      load()
    } catch (e) { showToast(e.message, false) } finally { setFixingReq(null) }
  }

  // ─── Export ────────────────────────────────────────────────────────────────
  const exportRun = (run) => {
    const rows = (run.payroll_lines || []).map((l) => [
      l.employee_no, l.employee_name, l.staff_type, l.basic_salary, l.allowances_total,
      l.overtime, l.gross_pay, l.paye, l.shif, l.nssf_employee, l.housing_employee,
      l.helb, l.other_deductions, l.net_pay, l.employer_total,
    ])
    const csv = [
      ['Staff No.','Name','Type','Basic','Allowances','Overtime','Gross','PAYE','SHIF','NSSF','Housing','HELB','Other','Net Pay','Employer Cost'],
      ...rows,
    ].map((r) => r.map((c) => (c ?? '').toString().includes(',') ? `"${c}"` : c).join(',')).join('\n')
    downloadFile(csv, `${run.run_no || 'payroll'}.csv`, 'text/csv')
    showToast('Run exported as CSV')
  }

  if (loading) return <div className="loading-state">Loading payroll...</div>

  return (
    <div className="prl-page">
      {/* ── Tab nav ── */}
      <div className="prl-tabs">
        <button className={`prl-tab ${tab === 'runs' ? 'active' : ''}`} onClick={() => setTab('runs')}><Wallet size={14} /> Payroll Runs</button>
        <button className={`prl-tab ${tab === 'employees' ? 'active' : ''}`} onClick={() => setTab('employees')}><Users size={14} /> Employees</button>
        <button className={`prl-tab ${tab === 'statutory' ? 'active' : ''}`} onClick={() => setTab('statutory')}><Settings2 size={14} /> Statutory</button>
        <button className={`prl-tab ${tab === 'mapping' ? 'active' : ''}`} onClick={() => setTab('mapping')}><Columns3 size={14} /> Accounting Mapping</button>
        <button className={`prl-tab ${tab === 'payments' ? 'active' : ''}`} onClick={() => setTab('payments')}><Banknote size={14} /> Salary Payments</button>
        <button className={`prl-tab ${tab === 'payslips' ? 'active' : ''}`} onClick={() => setTab('payslips')}><FileText size={14} /> Payslips</button>
      </div>

      {/* ══════════════ PAYROLL RUNS ══════════════ */}
      {tab === 'runs' && (
        <div className="prl-section">
          <div className="prl-toolbar">
            <div className="prl-toolbar-left">
              <label className="prl-inline-label">Month
                <select className="prl-select" value={runMonth} onChange={(e) => setRunMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
              <label className="prl-inline-label">Year
                <select className="prl-select" value={runYear} onChange={(e) => setRunYear(Number(e.target.value))}>
                  {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <button className="prl-btn-primary" onClick={createRun}><Plus size={15} /> New Payroll Run</button>
            </div>
            <button className="prl-btn-secondary" onClick={load}><RefreshCw size={15} /> Refresh</button>
          </div>

          <div className="prl-stats">
            {[
              { label: 'Runs This Period', value: runs.filter((r) => Number(r.payroll_periods?.period_month) === runMonth && Number(r.payroll_periods?.period_year) === runYear).length || '—', color: '#2563eb' },
              { label: 'Active Employees', value: employees.filter((e) => e.active).length, color: '#7c3aed' },
              { label: 'Pending Payment', value: payRequests.filter((r) => ['initiated', 'reviewed', 'approved'].includes(r.status)).length, color: '#d97706' },
              { label: 'Posted Runs', value: runs.filter((r) => ['posted', 'paid'].includes(r.status)).length, color: '#16a34a' },
            ].map((s) => (
              <div className="prl-stat" key={s.label}>
                <p>{s.label}</p>
                <strong style={{ color: s.color }}>{s.value}</strong>
              </div>
            ))}
          </div>

          {runs.length === 0 ? (
            <div className="prl-empty">
              <Wallet size={36} />
              <h3>No payroll runs yet</h3>
              <p>Pick a month above and create your first payroll run.</p>
            </div>
          ) : (
            <div className="prl-card-list">
              {runs.map((run) => {
                const t = runTotals(run)
                const st = runStatus(run.status)
                return (
                  <div className={`prl-run-card ${selectedRun?.id === run.id ? 'open' : ''}`} key={run.id}>
                    <div className="prl-run-head">
                      <div className="prl-run-info">
                        <div className="prl-run-title">
                          <strong>{run.run_label}</strong>
                          <span className="prl-badge" style={{ background: `${st.color}1a`, color: st.color }}>{st.label}</span>
                        </div>
                        <p className="prl-run-meta">{run.run_no} · created {fmtDateTime(run.created_at)} · {t.count} employees</p>
                      </div>
                      <div className="prl-run-totals">
                        <span>Gross <strong>{fmt(t.gross)}</strong></span>
                        <span>Net <strong style={{ color: '#16a34a' }}>{fmt(t.net)}</strong></span>
                        <span>Deductions <strong style={{ color: '#dc2626' }}>{fmt(t.deductions)}</strong></span>
                        <span>Employer <strong>{fmt(t.employer)}</strong></span>
                      </div>
                      <div className="prl-run-actions">
                        {run.status === 'draft' && (
                          <>
                            <button className="prl-btn-primary" onClick={() => calculateRun(run)}>Calculate</button>
                            <button className="prl-btn-danger-ghost" title="Delete draft run"
                              onClick={() => setConfirm({
                                title: 'Delete draft run?',
                                message: `${run.run_label} (${run.run_no}) will be permanently removed along with any calculated lines. This cannot be undone.`,
                                action: () => deleteRun(run),
                              })}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        {run.status === 'calculated' && <button className="prl-btn-primary" onClick={() => advanceRun(run, 'reviewed')}>Review</button>}
                        {run.status === 'reviewed' && (
                          <button className="prl-btn-primary" onClick={() => approveRun(run)} disabled={!isAdmin} title={isAdmin ? '' : 'Admin approval required'}>Approve</button>
                        )}
                        {run.status === 'approved' && <button className="prl-btn-primary" onClick={() => postRun(run)}>Post to GL</button>}
                        {run.status === 'posted' && <button className="prl-btn-primary" onClick={() => openPaymentModal(run)}>Initiate Payment</button>}
                        {['posted', 'paid'].includes(run.status) && !run.journal_entry_id && <button className="prl-btn-primary" onClick={() => postRun(run)}>Post to GL</button>}
                        {run.status === 'paid' && <span className="prl-paid-note"><CheckCircle size={14} /> Paid</span>}
                        <button className="prl-btn-secondary" onClick={() => exportRun(run)}>CSV</button>
                        <button className="prl-btn-ghost" onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}>
                          <Eye size={15} /> {selectedRun?.id === run.id ? 'Close' : 'View'}
                        </button>
                      </div>
                    </div>
                    {['posted', 'paid'].includes(run.status) && !run.journal_entry_id && (
                      <div className="prl-run-warn">
                        <AlertTriangle size={13} /> Not in the General Ledger — the payroll journal was never posted. Click <strong>Post to GL</strong> to book the payroll expense and liabilities.
                      </div>
                    )}
                    {selectedRun?.id === run.id && (
                      <div className="prl-run-detail">
                        <table className="prl-table">
                          <thead>
                            <tr>
                              <th>Staff No.</th><th>Name</th><th>Type</th><th>Basic</th><th>Gross</th>
                              <th>PAYE</th><th>SHIF</th><th>NSSF</th><th>Housing</th><th>Net Pay</th><th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(run.payroll_lines || []).map((l) => (
                              <tr key={l.id}>
                                <td className="prl-mono">{l.employee_no || '—'}</td>
                                <td style={{ fontWeight: 500 }}>{l.employee_name}</td>
                                <td className="prl-cap">{l.staff_type || '—'}</td>
                                <td>{fmt(l.basic_salary)}</td>
                                <td>{fmt(l.gross_pay)}</td>
                                <td>{fmt(l.paye)}</td>
                                <td>{fmt(l.shif)}</td>
                                <td>{fmt(l.nssf_employee)}</td>
                                <td>{fmt(l.housing_employee)}</td>
                                <td style={{ fontWeight: 700, color: '#16a34a' }}>{fmt(l.net_pay)}</td>
                                <td><button className="prl-btn-ghost" onClick={() => setPayslipLine({ line: l, run })}><Printer size={14} /> Payslip</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ EMPLOYEES ══════════════ */}
      {tab === 'employees' && (
        <div className="prl-section">
          <div className="prl-toolbar">
            <div className="prl-search-wrap">
              <Search size={15} />
              <input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button className="prl-btn-primary" onClick={openAddEmployee}><UserPlus size={15} /> Add Employee</button>
          </div>
          <div className="prl-card">
            <table className="prl-table">
              <thead>
                <tr>
                  <th>Employee No.</th><th>Staff No.</th><th>TSC No.</th><th>Employee</th><th>Type</th><th>Role</th><th>Contact</th>
                  <th>Basic Salary</th><th>Bank</th><th>Statutory</th><th>Items</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 && (
                  <tr><td colSpan="14" className="prl-norows">No staff found — add staff under Admin &gt; Staff &amp; Roles first.</td></tr>
                )}
                {filteredEmployees.map((e) => {
                  const empItems = itemsByEmp[e.id] || []
                  const empItemsTotal = empItems.filter((i) => ['allowance', 'overtime', 'bonus', 'employee_deduction', 'loan', 'advance'].includes(i.item_type)).reduce((s, i) => s + Number(i.amount || 0), 0)
                  if (!e.isPayroll) {
                    const staffMember = staff.find((s) => s.id === e.profile_id)
                    return (
                      <tr key={e.id}>
                        <td className="prl-mono">—</td>
                        <td className="prl-mono">{e.staffNo || '—'}</td>
                        <td className="prl-mono">{e.tscNo || '—'}</td>
                        <td style={{ fontWeight: 500 }}>{e.full_name}</td>
                        <td>—</td>
                        <td className="prl-cap">{roleLabel(e.staffRole)}</td>
                        <td className="prl-mono">{e.profiles?.phone || '—'}</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td><span className="prl-badge" style={{ background: '#d977061a', color: '#d97706' }}>Not on payroll</span></td>
                        <td className="prl-actions-cell">
                          <button className="prl-btn-secondary" onClick={() => openAddEmployee(staffMember)}><UserPlus size={14} /> Add to Payroll</button>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={e.id}>
                      <td className="prl-mono">{e.employee_no}</td>
                      <td className="prl-mono">{e.staffNo || '—'}</td>
                      <td className="prl-mono">{e.tscNo || '—'}</td>
                      <td style={{ fontWeight: 500 }}>{e.full_name}</td>
                      <td className="prl-cap">{e.staff_type}</td>
                      <td>{e.job_title || '—'}</td>
                      <td className="prl-mono">{e.profiles?.phone || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(e.basic_salary)}</td>
                      <td className="prl-cap">{e.bank_name ? `${e.bank_name}` : '—'}{e.bank_account ? <span className="prl-mono" style={{ color: '#6b7280', marginLeft: 4 }}>{e.bank_account}</span> : null}</td>
                      <td className="prl-mono" style={{ fontSize: 11 }}>
                        {[e.kra_pin && `KRA ${e.kra_pin}`, e.shif_no && `SHIF ${e.shif_no}`, e.nssf_no && `NSSF ${e.nssf_no}`].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td>
                        {empItems.length ? <span className="prl-badge" style={{ background: '#7c3aed1a', color: '#7c3aed' }}>{empItems.length} · {fmt(empItemsTotal)}</span> : '—'}
                      </td>
                      <td>
                        <span className="prl-badge" style={{ background: e.active ? '#16a34a1a' : '#64748b1a', color: e.active ? '#16a34a' : '#64748b' }}>
                          {e.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="prl-actions-cell">
                        <button className="prl-btn-ghost" onClick={() => setEmpDetail(e)}><Eye size={14} /> Details</button>
                        <button className="prl-btn-ghost" onClick={() => openItems(e)}><FileText size={14} /> Items</button>
                        <button className="prl-btn-ghost" onClick={() => openEditEmployee(e)}><Pencil size={14} /> Edit</button>
                        <button className="prl-btn-danger-ghost" onClick={() => setConfirm({ title: 'Remove employee?', message: `${e.full_name} will be removed from payroll. Their payslip history is kept.`, action: () => deleteEmployee(e) })}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════ STATUTORY ══════════════ */}
      {tab === 'statutory' && (
        <div className="prl-section">
          <p className="prl-hint">
            Statutory rates are effective-date based. {isAdmin ? 'Changes apply immediately.' : 'Your edits are submitted for admin approval before they take effect.'}
          </p>

          {(() => {
            const rows = config?._rows || []
            const pending = rows.filter((r) => r.status === 'pending')
            const active = rows.filter((r) => r.status === 'approved')
            return (
              <>
                {pending.length > 0 && (
                  <div className="prl-pending-block">
                    <div className="prl-pending-head">
                      <AlertTriangle size={15} />
                      <strong>Pending statutory changes</strong>
                      <span className="prl-badge" style={{ background: '#d977061a', color: '#d97706' }}>{pending.length} awaiting approval</span>
                    </div>
                    <div className="prl-config-grid">
                      {pending.map((row) => (
                        <div className="prl-config-card" key={row.id} style={{ borderColor: '#d97706' }}>
                          <div className="prl-config-head">
                            <strong>{CONFIG_LABELS[row.item] || row.item}</strong>
                            <span className="prl-badge" style={{ background: '#d977061a', color: '#d97706' }}>pending</span>
                          </div>
                          <p className="prl-config-value">{configSummary(row)}</p>
                          <p className="prl-config-note">{row.notes}</p>
                          {isAdmin ? (
                            <div className="prl-pending-actions">
                              <button className="prl-btn-primary" onClick={() => decideConfigChange(row, true)}><CheckCircle size={14} /> Approve</button>
                              <button className="prl-btn-danger" onClick={() => decideConfigChange(row, false)}>Reject</button>
                            </div>
                          ) : (
                            <p className="prl-config-note" style={{ color: '#d97706' }}>Awaiting admin / principal approval — not yet applied.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="prl-config-grid">
                  {active.map((row) => (
                    <div className="prl-config-card" key={row.id}>
                      <div className="prl-config-head">
                        <strong>{CONFIG_LABELS[row.item] || row.item}</strong>
                        <span className="prl-badge" style={{ background: '#2563eb1a', color: '#2563eb' }}>since {row.effective_from}</span>
                      </div>
                      <p className="prl-config-value">{configSummary(row)}</p>
                      <p className="prl-config-note">{row.notes}</p>
                      <button className="prl-btn-secondary" onClick={() => openConfigEdit(row)}><Pencil size={13} /> Edit</button>
                    </div>
                  ))}
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ══════════════ ACCOUNTING MAPPING ══════════════ */}
      {tab === 'mapping' && (
        <div className="prl-section">
          <div className="prl-toolbar">
            <p className="prl-hint" style={{ margin: 0 }}>
              Payroll integrates with the school Chart of Accounts through this mapping — no GL codes are hard-coded. Assign the account each payroll item posts to; defaults are applied until you change them.
            </p>
            <button className="prl-btn-secondary" onClick={openMappingEdit}><Pencil size={15} /> Edit Mapping</button>
          </div>
          {glAccounts.length === 0 ? (
            <div className="prl-empty">
              <Columns3 size={36} />
              <h3>No chart of accounts yet</h3>
              <p>Load the default chart under Finance → Chart of Accounts before mapping payroll items.</p>
            </div>
          ) : (
            <div className="prl-card">
              <table className="prl-table">
                <thead>
                  <tr><th>Payroll Item</th><th>Debit / Credit</th><th>Mapped GL Account</th></tr>
                </thead>
                <tbody>
                  {ACCOUNT_MAPPING_KEYS.filter((k) => k !== 'bank').map((k) => {
                    const acc = mappedAccountLabel(k)
                    const dr = ['basic_teaching', 'basic_non_teaching', 'allowances', 'employer_contributions'].includes(k)
                    return (
                      <tr key={k}>
                        <td style={{ fontWeight: 500 }}>{ACCOUNT_MAPPING_ITEMS[k].label}</td>
                        <td className="prl-cap" style={{ color: dr ? '#dc2626' : '#16a34a' }}>{dr ? 'Debit (Expense)' : 'Credit (Liability)'}</td>
                        <td className="prl-mono">{acc ? `${acc.code} · ${acc.name}` : <span className="prl-cap" style={{ color: '#d97706' }}>Default {ACCOUNT_MAPPING_ITEMS[k].defaultCode}</span>}</td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td style={{ fontWeight: 500 }}>{ACCOUNT_MAPPING_ITEMS.bank.label}</td>
                    <td className="prl-cap" style={{ color: '#16a34a' }}>Credit on salary payment</td>
                    <td className="prl-mono">{(() => { const acc = mappedAccountLabel('bank'); return acc ? `${acc.code} · ${acc.name}` : <span className="prl-cap" style={{ color: '#d97706' }}>Default {ACCOUNT_MAPPING_ITEMS.bank.defaultCode}</span> })()}</td>
                  </tr>
                </tbody>
              </table>
              <p className="prl-hint" style={{ margin: '12px 0 0' }}>
                Posting recognises payroll expense in the period worked (IAS 19) — salaries post to expense, statutory deductions to payables, and net pay to Wages Payable. The bank account is only credited when the salary is actually paid.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ SALARY PAYMENTS ══════════════ */}
      {tab === 'payments' && (
        <div className="prl-section">
          <div className="prl-toolbar">
            <p className="prl-hint" style={{ margin: 0 }}>Net pay disbursement workflow — bursar initiates, admin approves, then post to the GL.</p>
          </div>

          {needsRecon.length > 0 && (
            <div className="prl-recon-card">
              <div className="prl-recon-head">
                <span className="prl-recon-icon"><AlertTriangle size={15} /></span>
                <div className="prl-recon-copy">
                  <h4>Accounting Reconciliation Required</h4>
                  <p>
                    <strong>{needsRecon.length}</strong> payment{needsRecon.length > 1 ? 's' : ''} require reconciliation —
                    these were posted to <strong>{needsRecon[0].credited.code} {needsRecon[0].credited.name}</strong> instead of the
                    selected Cash/Bank/Mobile Money source account. Review the affected transactions.
                  </p>
                </div>
              </div>
              <div className="prl-table-wrap">
                <table className="prl-table prl-recon-table">
                  <thead>
                    <tr><th>Request</th><th>Payroll Run</th><th className="prl-th-right">Amount</th><th>Current GL Account</th><th>Correct Source</th><th className="prl-th-right">Action</th></tr>
                  </thead>
                  <tbody>
                    {needsRecon.map(({ req, credited, shouldBe }) => (
                      <tr key={req.id}>
                        <td className="prl-mono">{req.request_no}</td>
                        <td>{req.payroll_runs?.run_label || '—'}</td>
                        <td className="prl-amount">{fmt(req.amount)}</td>
                        <td><span className="prl-gl-acc">{credited.code} — {credited.name}</span></td>
                        <td><span className="prl-gl-acc prl-gl-ok">{shouldBe.code} — {shouldBe.name}</span></td>
                        <td className="prl-actions-cell">
                          <button
                            className="prl-btn-secondary prl-btn-sm"
                            disabled={fixingReq === req.id}
                            onClick={() => fixMisplacement({ req, credited, shouldBe })}
                          >{fixingReq === req.id ? 'Posting…' : 'Fix'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="prl-recon-note">
                Each fix posts a balanced correcting transfer (Dr the wrong account → Cr the correct source) so the Cash &amp; Bank dashboard reflects the true disbursement. Wages Payable is left untouched.
              </p>
            </div>
          )}

          {hasPostedRequests && needsRecon.length === 0 && (
            <div className="prl-recon-ok"><CheckCircle size={14} /> All posted salary payments credit a Cash &amp; Bank account — the dashboard reflects them.</div>
          )}

          <div className="prl-filters">
            <div className="prl-search-wrap prl-filter-search">
              <Search size={15} />
              <input
                placeholder="Search request no. or reference…"
                value={paySearch}
                onChange={(e) => setPaySearch(e.target.value)}
              />
            </div>
            <select className="prl-select prl-filter-select" value={payStatusFilter} onChange={(e) => setPayStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{statusBadge(s.value).label}</option>)}
            </select>
            <select className="prl-select prl-filter-select" value={payRunFilter} onChange={(e) => setPayRunFilter(e.target.value)}>
              <option value="">All runs</option>
              {payRunOptions.map((label) => <option key={label} value={label}>{label}</option>)}
            </select>
            <select className="prl-select prl-filter-select" value={payMethodFilter} onChange={(e) => setPayMethodFilter(e.target.value)}>
              <option value="">All methods</option>
              {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <span className="prl-filter-count">{filteredRequests.length} of {payRequests.length}</span>
          </div>

          <div className="prl-card">
            <div className="prl-table-wrap">
              <table className="prl-table">
                <thead>
                  <tr><th>Request No.</th><th>Payroll Run</th><th className="prl-th-right">Amount</th><th>Method</th><th>Disbursed From</th><th>GL Account</th><th>Reference</th><th>Status</th><th className="prl-th-right">Action</th></tr>
                </thead>
                <tbody>
                  {filteredRequests.length === 0 && (
                    <tr><td colSpan="9" className="prl-norows">{payRequests.length === 0 ? 'No payment requests — open a posted run and click "Initiate Payment".' : 'No payments match the current filters.'}</td></tr>
                  )}
                  {filteredRequests.map((r) => {
                    const disp = disbursementAccount(r)
                    const glCr = glCreditAccount(r)
                    const m = misplacementFor(r)
                    const badge = m ? RECON_BADGE : statusBadge(r.status)
                    return (
                      <tr key={r.id}>
                        <td className="prl-mono">{r.request_no}</td>
                        <td>{r.payroll_runs?.run_label || '—'}</td>
                        <td className="prl-amount">{fmt(r.amount)}</td>
                        <td className="prl-cap">{PAY_METHODS.find((x) => x.value === r.payment_method)?.label || r.payment_method}</td>
                        <td>{disp ? <span className="prl-cap">{disp.name}</span> : <span className="prl-muted">—</span>}</td>
                        <td>
                          {glCr ? (
                            <span className="prl-gl" title={`Journal ${r.journal_entry_id}`}>
                              <span className="prl-gl-acc">{glCr.code} — {glCr.name}</span>
                              {m && <span className="prl-gl-warn"><AlertTriangle size={11} /> Expected: {m.shouldBe.code} {m.shouldBe.name}</span>}
                            </span>
                          ) : (
                            <span className="prl-muted">—</span>
                          )}
                        </td>
                        <td className="prl-mono">{r.reference_no || '—'}</td>
                        <td><span className="prl-status-badge" style={{ color: badge.color, background: badge.bg, borderColor: badge.border }}>{badge.label}</span></td>
                        <td className="prl-actions-cell">
                          {r.status === 'initiated' && <button className="prl-btn-secondary prl-btn-sm" onClick={() => advanceRequest(r, 'reviewed')}>Review</button>}
                          {r.status === 'reviewed' && (
                            <button className="prl-btn-primary prl-btn-sm" onClick={() => advanceRequest(r, 'approved', { approved_by: userId, approved_at: new Date().toISOString() })} disabled={!isAdmin} title={isAdmin ? '' : 'Admin approval required'}>Approve</button>
                          )}
                          {r.status === 'approved' && <button className="prl-btn-primary prl-btn-sm" onClick={() => advanceRequest(r, 'processed', { processed_by: userId, processed_at: new Date().toISOString() })}>Process</button>}
                          {r.status === 'processed' && <button className="prl-btn-primary prl-btn-sm" onClick={() => postRequest(r)}>Post to GL</button>}
                          {r.status === 'posted' && <span className="prl-paid-note"><CheckCircle size={14} /> Posted</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ PAYSLIPS ══════════════ */}
      {tab === 'payslips' && (
        <div className="prl-section">
          <div className="prl-toolbar">
            <p className="prl-hint" style={{ margin: 0 }}>Payslips are available once a run is posted. Select a run to browse its payslips.</p>
          </div>
          {postedPaidRuns.length === 0 ? (
            <div className="prl-empty">
              <FileText size={36} />
              <h3>No posted runs yet</h3>
              <p>Post a payroll run to unlock payslips.</p>
            </div>
          ) : (
            <div className="prl-card">
              {postedPaidRuns.map((run) => (
                <div className="prl-payslip-run" key={run.id}>
                  <div className="prl-run-head" style={{ padding: '12px 4px' }}>
                    <div className="prl-run-info">
                      <div className="prl-run-title"><strong>{run.run_label}</strong>
                        <span className="prl-badge" style={{ background: `${runStatus(run.status).color}1a`, color: runStatus(run.status).color }}>{runStatus(run.status).label}</span>
                      </div>
                      <p className="prl-run-meta">{run.run_no} · {run.payroll_lines?.length || 0} employees</p>
                    </div>
                  </div>
                  <div className="prl-payslip-grid">
                    {(run.payroll_lines || []).map((l) => (
                      <button className="prl-payslip-card" key={l.id} onClick={() => setPayslipLine({ line: l, run })}>
                        <strong>{l.employee_name}</strong>
                        <span className="prl-mono">{l.employee_no || '—'}</span>
                        <span className="prl-payslip-net">Net {fmt(l.net_pay)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Employee Details Modal ═══ */}
      {empDetail && (() => {
        const e = empDetail
        const p = payPreview(e)
        const profile = e.profiles || staff.find((s) => s.id === e.profile_id) || {}
        const empItems = itemsByEmp[e.id] || []
        const Detail = ({ label, value }) => (
          <div className="prl-detail-item">
            <span>{label}</span>
            <strong>{value || '—'}</strong>
          </div>
        )
        return (
          <div className="prl-modal-overlay" onClick={() => setEmpDetail(null)}>
            <div className="prl-modal prl-modal-lg" onClick={(ev) => ev.stopPropagation()}>
              <div className="prl-modal-head">
                <h3>Employee Details — {e.full_name}</h3>
                <button className="prl-btn-icon" onClick={() => setEmpDetail(null)}><X size={16} /></button>
              </div>

              <div className="prl-detail-head">
                <div className="prl-detail-avatar">{e.full_name?.[0]?.toUpperCase() || 'E'}</div>
                <div>
                  <div className="prl-run-title">
                    <strong style={{ fontSize: 16 }}>{e.full_name}</strong>
                    <span className="prl-badge" style={{ background: e.active ? '#16a34a1a' : '#64748b1a', color: e.active ? '#16a34a' : '#64748b' }}>{e.active ? 'Active' : 'Inactive'}</span>
                    <span className="prl-badge prl-cap" style={{ background: '#7c3aed1a', color: '#7c3aed' }}>{e.staff_type}</span>
                  </div>
                  <p className="prl-run-meta">{e.employee_no} · {e.job_title || 'No job title'}{e.department ? ` · ${e.department}` : ''} · pays via {PAY_METHODS.find((m) => m.value === e.pay_method)?.label || e.pay_method}</p>
                </div>
              </div>

              <div className="prl-detail-grid">
                <div className="prl-detail-card">
                  <h4>Personal</h4>
                  <Detail label="Phone" value={profile.phone} />
                  <Detail label="Email" value={profile.email} />
                  <Detail label="System Role" value={profile.role} />
                  <Detail label="Department" value={e.department} />
                  <Detail label="Job Title" value={e.job_title} />
                  {e.notes && <Detail label="Notes" value={e.notes} />}
                </div>
                <div className="prl-detail-card">
                  <h4>Statutory</h4>
                  <Detail label="KRA PIN" value={e.kra_pin} />
                  <Detail label="SHIF No." value={e.shif_no} />
                  <Detail label="NSSF No." value={e.nssf_no} />
                  <Detail label="HELB Number" value={e.helb_number} />
                  <Detail label="SACCO" value={e.sacco_name} />
                  <Detail label="Union" value={e.union_name} />
                </div>
                <div className="prl-detail-card">
                  <h4>Banking</h4>
                  <Detail label="Bank" value={e.bank_name} />
                  <Detail label="Account No." value={e.bank_account} />
                  <Detail label="Pay Method" value={PAY_METHODS.find((m) => m.value === e.pay_method)?.label} />
                  <Detail label="Basic Salary" value={fmt(e.basic_salary)} />
                </div>
              </div>

              <div className="prl-detail-card" style={{ margin: '0 18px 14px' }}>
                <h4>Recurring Items ({empItems.length})</h4>
                {empItems.length === 0 ? (
                  <p className="prl-norows" style={{ padding: '12px' }}>No recurring items set up.</p>
                ) : (
                  <table className="prl-table">
                    <thead><tr><th>Item</th><th>Type</th><th>Amount</th><th>Treatment</th></tr></thead>
                    <tbody>
                      {empItems.map((it) => (
                        <tr key={it.id}>
                          <td>{it.name}</td>
                          <td className="prl-cap">{ITEM_TYPES.find((t) => t.value === it.item_type)?.label || it.item_type}</td>
                          <td style={{ fontWeight: 600 }}>{fmt(it.amount)}</td>
                          <td style={{ fontSize: 12, color: '#6b7280' }}>
                            {it.item_type === 'allowance' ? allowanceTreatmentLabel(it.tax_treatment || (it.is_taxable ? 'taxable' : 'non_taxable'))
                              : it.item_type === 'employee_deduction' && it.is_helb ? 'HELB recovery'
                              : it.item_type === 'employee_deduction' ? 'Deducted from pay'
                              : it.item_type === 'loan' || it.item_type === 'advance' ? 'Recovered from pay'
                              : it.item_type === 'employer_contribution' ? 'Paid by employer'
                              : 'Added to gross'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {p && (
                <div className="prl-detail-pay">
                  <h4>Monthly Pay Preview (current statutory config)</h4>
                  <div className="prl-detail-pay-grid">
                    <div><span>Gross Pay</span><strong>{fmt(p.gross_pay)}</strong></div>
                    <div><span>PAYE</span><strong style={{ color: '#dc2626' }}>− {fmt(p.paye)}</strong></div>
                    <div><span>SHIF</span><strong style={{ color: '#dc2626' }}>− {fmt(p.shif)}</strong></div>
                    <div><span>NSSF</span><strong style={{ color: '#dc2626' }}>− {fmt(p.nssf_employee)}</strong></div>
                    <div><span>Housing Levy</span><strong style={{ color: '#dc2626' }}>− {fmt(p.housing_employee)}</strong></div>
                    <div><span>HELB</span><strong style={{ color: '#dc2626' }}>− {fmt(p.helb)}</strong></div>
                    <div><span>Other Deductions</span><strong style={{ color: '#dc2626' }}>− {fmt(p.other_deductions)}</strong></div>
                    <div className="prl-net-cell"><span>Net Pay</span><strong style={{ color: '#16a34a' }}>{fmt(p.net_pay)}</strong></div>
                    <div><span>Employer Cost</span><strong>{fmt(p.employer_total)}</strong></div>
                  </div>
                </div>
              )}

              <div className="prl-modal-foot">
                <button className="prl-btn-secondary" onClick={() => setEmpDetail(null)}>Close</button>
                <button className="prl-btn-secondary" onClick={() => { openItems(e); setEmpDetail(null) }}>Manage Items</button>
                <button className="prl-btn-primary" onClick={() => { openEditEmployee(e); setEmpDetail(null) }}>Edit Employee</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ Employee Modal ═══ */}
      {empModal && (
        <div className="prl-modal-overlay" onClick={() => setEmpModal(null)}>
          <div className="prl-modal prl-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head">
              <h3>{empModal.employee ? 'Edit Employee' : 'Add Employee'}</h3>
              <button className="prl-btn-icon" onClick={() => setEmpModal(null)}><X size={16} /></button>
            </div>
            <div className="prl-form-grid">
              <label className="prl-field prl-field-full">
                <span>Staff Member *</span>
                <select value={empForm.profile_id || ''} onChange={(e) => setEmpForm({ ...empForm, profile_id: e.target.value })}>
                  <option value="">Select a staff member...</option>
                  {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.phone ? ` · ${s.phone}` : ''} ({s.role})</option>)}
                </select>
              </label>
              <label className="prl-field">
                <span>Employee No.</span>
                <input className="prl-mono" value={empForm.employee_no} readOnly />
              </label>
              <label className="prl-field">
                <span>Staff Type</span>
                <select value={empForm.staff_type} onChange={(e) => setEmpForm({ ...empForm, staff_type: e.target.value })}>
                  <option value="teaching">Teaching</option>
                  <option value="non_teaching">Non-Teaching</option>
                </select>
              </label>
              <label className="prl-field">
                <span>Job Title</span>
                <input value={empForm.job_title} onChange={(e) => setEmpForm({ ...empForm, job_title: e.target.value })} />
              </label>
              <label className="prl-field">
                <span>Department</span>
                <input value={empForm.department} onChange={(e) => setEmpForm({ ...empForm, department: e.target.value })} />
              </label>
              <label className="prl-field">
                <span>Basic Salary *</span>
                <input type="number" min="0" value={empForm.basic_salary} onChange={(e) => setEmpForm({ ...empForm, basic_salary: e.target.value })} />
              </label>
              <label className="prl-field">
                <span>Pay Method</span>
                <select value={empForm.pay_method} onChange={(e) => setEmpForm({ ...empForm, pay_method: e.target.value })}>
                  {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <label className="prl-field">
                <span>KRA PIN</span>
                <input className="prl-mono" value={empForm.kra_pin} onChange={(e) => setEmpForm({ ...empForm, kra_pin: e.target.value })} />
              </label>
              <label className="prl-field">
                <span>SHIF No.</span>
                <input className="prl-mono" value={empForm.shif_no} onChange={(e) => setEmpForm({ ...empForm, shif_no: e.target.value })} />
              </label>
              <label className="prl-field">
                <span>NSSF No.</span>
                <input className="prl-mono" value={empForm.nssf_no} onChange={(e) => setEmpForm({ ...empForm, nssf_no: e.target.value })} />
              </label>
              <label className="prl-field">
                <span>HELB Number</span>
                <input value={empForm.helb_number} onChange={(e) => setEmpForm({ ...empForm, helb_number: e.target.value })} />
              </label>
              <label className="prl-field">
                <span>SACCO</span>
                <input value={empForm.sacco_name} onChange={(e) => setEmpForm({ ...empForm, sacco_name: e.target.value })} />
              </label>
              <label className="prl-field">
                <span>Union</span>
                <input value={empForm.union_name} onChange={(e) => setEmpForm({ ...empForm, union_name: e.target.value })} />
              </label>
              <label className="prl-field">
                <span>Bank</span>
                <input value={empForm.bank_name} onChange={(e) => setEmpForm({ ...empForm, bank_name: e.target.value })} />
              </label>
              <label className="prl-field">
                <span>Bank Account No.</span>
                <input value={empForm.bank_account} onChange={(e) => setEmpForm({ ...empForm, bank_account: e.target.value })} />
              </label>
              <label className="prl-field prl-field-full">
                <span>Notes</span>
                <input value={empForm.notes} onChange={(e) => setEmpForm({ ...empForm, notes: e.target.value })} />
              </label>
              <label className="prl-check">
                <input type="checkbox" checked={empForm.active} onChange={(e) => setEmpForm({ ...empForm, active: e.target.checked })} />
                Active on payroll
              </label>
            </div>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setEmpModal(null)}>Cancel</button>
              <button className="prl-btn-primary" onClick={saveEmployee}>{empModal.employee ? 'Save Changes' : 'Add Employee'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Employee Items Modal ═══ */}
      {itemEmp && (
        <div className="prl-modal-overlay" onClick={() => setItemEmp(null)}>
          <div className="prl-modal prl-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head">
              <h3>Items — {itemEmp.full_name}</h3>
              <button className="prl-btn-icon" onClick={() => setItemEmp(null)}><X size={16} /></button>
            </div>
            <div className="prl-item-form">
              <select className="prl-select" value={itemForm.item_type} onChange={(e) => setItemForm({ ...itemForm, item_type: e.target.value })}>
                {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input placeholder="Item name (e.g. House Allowance)" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
              <input type="number" min="0" placeholder="Amount" value={itemForm.amount} onChange={(e) => setItemForm({ ...itemForm, amount: e.target.value })} />
              {itemForm.item_type === 'allowance' && (
                <label className="prl-item-select">
                  <span>Tax Treatment</span>
                  <select className="prl-select" value={itemForm.tax_treatment || (itemForm.is_taxable ? 'taxable' : 'non_taxable')}
                    onChange={(e) => setItemForm({ ...itemForm, tax_treatment: e.target.value, is_taxable: e.target.value !== 'non_taxable' && e.target.value !== 'reimbursement' })}>
                    {ALLOWANCE_TAX_TREATMENTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </label>
              )}
              {itemForm.item_type === 'employee_deduction' && (
                <label className="prl-check" style={{ margin: 0 }}><input type="checkbox" checked={itemForm.is_helb} onChange={(e) => setItemForm({ ...itemForm, is_helb: e.target.checked })} /> HELB recovery</label>
              )}
              <button className="prl-btn-primary" onClick={saveItem}>{editingItemId ? 'Update' : 'Add'} Item</button>
              {editingItemId && <button className="prl-btn-secondary" onClick={() => { setItemForm(blankItem()); setEditingItemId(null) }}>Cancel edit</button>}
            </div>
            <table className="prl-table">
              <thead>
                <tr><th>Item</th><th>Type</th><th>Amount</th><th>Tax Treatment</th><th></th></tr>
              </thead>
              <tbody>
                {(itemsByEmp[itemEmp.id] || []).map((it) => (
                  <tr key={it.id}>
                    <td>{it.name}</td>
                    <td className="prl-cap">{ITEM_TYPES.find((t) => t.value === it.item_type)?.label || it.item_type}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(it.amount)}</td>
                    <td>{it.item_type === 'allowance' ? allowanceTreatmentLabel(it.tax_treatment || (it.is_taxable ? 'taxable' : 'non_taxable')) : '—'}</td>
                    <td className="prl-actions-cell">
                      <button className="prl-btn-ghost" onClick={() => { setEditingItemId(it.id); setItemForm({ ...it }) }}><Pencil size={14} /></button>
                      <button className="prl-btn-danger-ghost" onClick={() => deleteItem(it.id)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Statutory Config Modal ═══ */}
      {configItem && (
        <div className="prl-modal-overlay" onClick={() => setConfigItem(null)}>
          <div className="prl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head">
              <h3>Edit {CONFIG_LABELS[configItem.item]}</h3>
              <button className="prl-btn-icon" onClick={() => setConfigItem(null)}><X size={16} /></button>
            </div>
            <div className="prl-form-grid">
              {configItem.item === 'paye_bands' && (
                <label className="prl-field prl-field-full">
                  <span>PAYE Bands (JSON)</span>
                  <textarea rows={8} className="prl-mono" value={typeof configItem.value.bands === 'string' ? configItem.value.bands : JSON.stringify(configItem.value.bands, null, 1)}
                    onChange={(e) => setConfigItem({ ...configItem, value: { bands: e.target.value } })} />
                  <small>{'Format: [{"from":0,"up_to":24000,"rate":10},...] with up_to: null for the top band.'}</small>
                </label>
              )}
              {configItem.item === 'personal_relief' && (
                <label className="prl-field prl-field-full"><span>Monthly Relief (KSh)</span><input type="number" value={configItem.value.amount} onChange={(e) => setConfigItem({ ...configItem, value: { amount: Number(e.target.value) } })} /></label>
              )}
              {configItem.item === 'nssf_rate' && (
                <>
                  <label className="prl-field"><span>Rate (%)</span><input type="number" step="0.1" value={configItem.value.rate} onChange={(e) => setConfigItem({ ...configItem, value: { ...configItem.value, rate: Number(e.target.value) } })} /></label>
                  <label className="prl-field"><span>Tier I Ceiling (KSh)</span><input type="number" value={configItem.value.tier1_ceiling} onChange={(e) => setConfigItem({ ...configItem, value: { ...configItem.value, tier1_ceiling: Number(e.target.value) } })} /></label>
                  <label className="prl-field"><span>Tier II Ceiling (KSh)</span><input type="number" value={configItem.value.tier2_ceiling} onChange={(e) => setConfigItem({ ...configItem, value: { ...configItem.value, tier2_ceiling: Number(e.target.value) } })} /></label>
                </>
              )}
              {configItem.item === 'shif_rate' && (
                <>
                  <label className="prl-field"><span>Rate (%)</span><input type="number" step="0.01" value={configItem.value.rate} onChange={(e) => setConfigItem({ ...configItem, value: { ...configItem.value, rate: Number(e.target.value) } })} /></label>
                  <label className="prl-field"><span>Ceiling (KSh, optional)</span><input type="number" value={configItem.value.ceiling || ''} onChange={(e) => setConfigItem({ ...configItem, value: { ...configItem.value, ceiling: e.target.value ? Number(e.target.value) : null } })} /></label>
                </>
              )}
              {configItem.item === 'housing_levy_rate' && (
                <>
                  <label className="prl-field"><span>Employee Rate (%)</span><input type="number" step="0.1" value={configItem.value.rate} onChange={(e) => setConfigItem({ ...configItem, value: { ...configItem.value, rate: Number(e.target.value) } })} /></label>
                  <label className="prl-field"><span>Employer Rate (%)</span><input type="number" step="0.1" value={configItem.value.employer_rate} onChange={(e) => setConfigItem({ ...configItem, value: { ...configItem.value, employer_rate: Number(e.target.value) } })} /></label>
                </>
              )}
              {configItem.item === 'nita_amount' && (
                <label className="prl-field prl-field-full"><span>NITA Levy (KSh / month)</span><input type="number" value={configItem.value.amount} onChange={(e) => setConfigItem({ ...configItem, value: { amount: Number(e.target.value) } })} /></label>
              )}
              {configItem.item === 'allowance_exempt_threshold' && (
                <label className="prl-field prl-field-full"><span>Tax-free amount per allowance (KSh / month)</span><input type="number" value={configItem.value.amount} onChange={(e) => setConfigItem({ ...configItem, value: { amount: Number(e.target.value) } })} /></label>
              )}
            </div>
            <p className="prl-hint">Saving adds a new effective-dated row (from {TODAY}). Historical runs keep their original rates.</p>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setConfigItem(null)}>Cancel</button>
              <button className="prl-btn-primary" onClick={saveConfig}>Save & Apply From Today</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Accounting Mapping Modal ═══ */}
      {acctMapDraft && (
        <div className="prl-modal-overlay" onClick={() => setAcctMapDraft(null)}>
          <div className="prl-modal prl-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head">
              <h3>Payroll → Chart of Accounts Mapping</h3>
              <button className="prl-btn-icon" onClick={() => setAcctMapDraft(null)}><X size={16} /></button>
            </div>
            <p className="prl-hint" style={{ margin: '0 0 12px' }}>Choose the GL account each payroll item posts to. Leave blank to keep the default code shown.</p>
            <div className="prl-form-grid" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              {ACCOUNT_MAPPING_KEYS.map((k) => {
                const dr = ['basic_teaching', 'basic_non_teaching', 'allowances', 'employer_contributions'].includes(k)
                return (
                  <label className="prl-field prl-field-full" key={k}>
                    <span>{ACCOUNT_MAPPING_ITEMS[k].label} · <span style={{ color: dr ? '#dc2626' : '#16a34a' }}>{dr ? 'Debit' : 'Credit'}</span></span>
                    <select
                      value={acctMapDraft[k] || ''}
                      onChange={(e) => setAcctMapDraft({ ...acctMapDraft, [k]: e.target.value })}
                    >
                      <option value="">Default — {ACCOUNT_MAPPING_ITEMS[k].defaultCode}</option>
                      {glAccounts
                        .filter((a) => dr ? ['expense', 'asset'].includes(a.type) : ['liability', 'equity', 'asset'].includes(a.type))
                        .map((a) => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                    </select>
                  </label>
                )
              })}
            </div>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setAcctMapDraft(null)}>Cancel</button>
              <button className="prl-btn-primary" onClick={saveAccountMapping} disabled={acctMapSaving}>{acctMapSaving ? 'Saving...' : 'Save Mapping'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Initiate Payment Modal ═══ */}
      {payModal && (
        <div className="prl-modal-overlay" onClick={() => setPayModal(null)}>
          <div className="prl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head">
              <h3>Initiate Payment — {payModal.run.run_label}</h3>
              <button className="prl-btn-icon" onClick={() => setPayModal(null)}><X size={16} /></button>
            </div>
            <div className="prl-form-grid">
              <label className="prl-field prl-field-full">
                <span>Payment Method</span>
                <select value={payModal.method} onChange={(e) => setPayModal({ ...payModal, method: e.target.value })}>
                  {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <p className="prl-hint" style={{ margin: '6px 0 0' }}>
                  Disbursed from: <strong>{disbursementAccount({ payment_method: payModal.method })?.name || '—'}</strong>
                </p>
              </label>
              <label className="prl-field prl-field-full">
                <span>Amount (Net Pay)</span>
                <input className="prl-mono" value={fmt(payModal.amount)} readOnly />
              </label>
              <label className="prl-field prl-field-full">
                <span>Reference No. (optional)</span>
                <input placeholder="e.g. M-PESA ref, cheque no., bank voucher" value={payModal.reference}
                  onChange={(e) => setPayModal({ ...payModal, reference: e.target.value })} />
              </label>
            </div>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setPayModal(null)}>Cancel</button>
              <button className="prl-btn-primary" onClick={submitPaymentRequest}>Create Payment Request</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Confirm Dialog ═══ */}
      {confirm && (
        <div className="prl-modal-overlay" onClick={() => setConfirm(null)}>
          <div className="prl-modal prl-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="prl-modal-head"><h3><AlertTriangle size={16} /> {confirm.title}</h3><button className="prl-btn-icon" onClick={() => setConfirm(null)}><X size={16} /></button></div>
            <p className="prl-confirm-msg">{confirm.message}</p>
            <div className="prl-modal-foot">
              <button className="prl-btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="prl-btn-danger" onClick={() => { setConfirm(null); confirm.action() }}>Yes, Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Payslip Modal ═══ */}
      {payslipLine && (
        <Payslip
          line={{ ...payslipLine.line, employee: employees.find((e) => e.id === payslipLine.line.employee_id) }}
          run={payslipLine.run}
          school={school}
          schoolName={schoolName}
          onClose={() => setPayslipLine(null)}
        />
      )}

      {toast && <div className={`prl-toast ${toast.ok ? '' : 'error'}`}>{toast.msg}</div>}
    </div>
  )
}
