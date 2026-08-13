import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search, RefreshCw, Eye, Pencil, Trash2, Download,
  X, TrendingDown, Wrench, User, FileText, Archive, Landmark, ShieldCheck, Power, CheckCircle2
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmt, fmtDate, downloadFile } from '../admin/fees/utils/feesHelpers'
import { writeAudit, postToJournal, ensureAccounts, DEPRECIATION_ACCOUNT_CODES } from './accountsUtils'
import {
  ASSET_STATUSES, assetStatus, calcNbv, monthlyDepreciation, nextAssetId,
  addAssetEvent, loadAssetsData, formatPeriod, kraTaxClass, depreciationAccountsFor,
  fixedAssetAccountCodeFor,
} from './assetsUtils'
import {
  TAX_RULE_TYPES, TAX_METHODS, FINANCE_ROLES, methodLabel as taxMethodLabel,
  ensureDefaultTaxRules, loadTaxData, taxRuleLabel,
  buildTaxSchedule, runTaxAllowances, taxVsAccounting,
} from './taxUtils'
import { nextSupplierNo, nextInvoiceNo, nextPaymentNo, postInvoiceJournal, postPaymentJournal, recomputeInvoicePaid } from './apUtils'
import AssetProfile from './AssetProfile'
import AccountSelect from './AccountSelect'
import './Assets.css'

const TODAY = new Date().toISOString().split('T')[0]

const blankAsset = () => ({
  name: '', category_id: '', asset_type: 'equipment', serial_number: '', model: '',
  manufacturer: '', description: '', purchase_date: TODAY, supplier_id: '',
  purchase_invoice_ref: '', purchase_cost: '', residual_value: 0, useful_life_months: 60,
  depreciation_method: 'reducing_balance', depreciation_rate: 0, warranty_until: '',
  status: 'active', campus: '', building: '', department: '', room: '', specific_location: '',
  custodian_id: '', assigned_date: TODAY,
  tax_class: '', investment_class: '', acquisition_source: 'supplier',
  invoice_mode: 'create', existing_invoice_id: '', payment_status: 'unpaid',
  payment_account_id: '', payment_amount: '',
  gl_cash_account_id: '', gl_donation_account_id: '',
})

const blankCategory = () => ({
  name: '', description: '', depreciation_method: 'reducing_balance',
  useful_life_months: 60, depreciation_rate: 0, residual_value: 0,
  tax_class: '', expense_account_id: '', accumulated_account_id: '',
})

const blankTaxRule = () => ({
  rule_type: 'wear_tear', tax_class: '', description: '', asset_classification: '',
  rate: 0, first_year_rate: 0, calc_method: 'reducing_balance',
  effective_date: TODAY, expiry_date: '', source_reference: '', is_active: true,
})

export default function AssetsPage({ initialTab }) {
  const { profile } = useAuthStore()
  const { school } = useSchool()
  const schoolId = profile?.school_id
  const userId = profile?.id

  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(initialTab || 'register')
  const [toast, setToast] = useState(null)

  const [assets, setAssets] = useState([])
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [apInvoices, setApInvoices] = useState([])
  const [showQuickSupplier, setShowQuickSupplier] = useState(false)
  const [quickSupplier, setQuickSupplier] = useState({ name: '', phone: '', email: '', kra_pin: '' })
  const [events, setEvents] = useState([])
  const [custody, setCustody] = useState([])
  const [locations, setLocations] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [runs, setRuns] = useState([])
  const [runLines, setRunLines] = useState([])
  const [documents, setDocuments] = useState([])
  const [staff, setStaff] = useState([])
  const [taxRules, setTaxRules] = useState([])
  const [taxSchedules, setTaxSchedules] = useState([])

  const staffMap = Object.fromEntries(staff.map((s) => [s.id, s.full_name]))
  const isFinanceRole = (profile?.roles?.length
    ? profile.roles
    : [profile?.role])
    .some((r) => FINANCE_ROLES.includes(r))

  const [taxYear, setTaxYear] = useState(String(new Date().getFullYear()))
  const [taxFilterCat, setTaxFilterCat] = useState('')
  const [taxFilterClass, setTaxFilterClass] = useState('')
  const [taxFilterDept, setTaxFilterDept] = useState('')
  const [taxFilterLoc, setTaxFilterLoc] = useState('')
  const [taxRuleModal, setTaxRuleModal] = useState(null)
  const [taxRuleForm, setTaxRuleForm] = useState(blankTaxRule())
  const [taxRunning, setTaxRunning] = useState(false)

  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  const [assetModal, setAssetModal] = useState(null)
  const [assetForm, setAssetForm] = useState(blankAsset())
  const [photoFile, setPhotoFile] = useState(null)
  const [catModal, setCatModal] = useState(null)
  const [catForm, setCatForm] = useState(blankCategory())
  const [assignModal, setAssignModal] = useState(null)
  const [assignForm, setAssignForm] = useState({
    custodian_id: '', from_date: TODAY, notes: '',
    campus: '', building: '', department: '', room: '', specific_location: '',
  })
  const [disposeModal, setDisposeModal] = useState(null)
  const [disposeForm, setDisposeForm] = useState({ disposal_date: TODAY, disposal_reason: '', disposal_amount: 0, gl_cash_account_id: '' })
  const [maintModal, setMaintModal] = useState(false)
  const [maintForm, setMaintForm] = useState({
    asset_id: '', maintenance_date: TODAY, maintenance_type: 'preventive',
    description: '', cost: 0, service_provider: '', status: 'completed', next_service_date: '',
  })
  const [deprModal, setDeprModal] = useState(null)
  const [viewRun, setViewRun] = useState(null)
  const [viewRunLines, setViewRunLines] = useState([])
  const [deprForm, setDeprForm] = useState({
    period_label: formatPeriod(TODAY), run_date: TODAY, expense_account_id: '', accumulated_account_id: '',
  })
  const [docModal, setDocModal] = useState(null)
  const [docForm, setDocForm] = useState({ document_type: 'purchase_invoice', title: '' })
  const [docFile, setDocFile] = useState(null)
  const [accountOptions, setAccountOptions] = useState([])
  const [saving, setSaving] = useState(false)
  const [selectedAssetId, setSelectedAssetId] = useState(null)

  const load = useCallback(async () => {
    if (!schoolId) return
    setLoading(true)
    const data = await loadAssetsData(supabase, schoolId)
    setAssets(data.assets); setCategories(data.categories); setSuppliers(data.suppliers)
    setEvents(data.events); setCustody(data.custody); setLocations(data.locations)
    setMaintenance(data.maintenance); setRuns(data.runs); setRunLines(data.runLines)
    setDocuments(data.documents); setStaff(data.staff)
    const tax = await loadTaxData(supabase, schoolId)
    setTaxRules(tax.taxRules); setTaxSchedules(tax.taxSchedules)
    // Lazily create the standard depreciation accounts if the chart is missing
    // them (RLS restricts inserts to finance roles; everyone else just reads).
    try {
      await ensureAccounts(supabase, schoolId, DEPRECIATION_ACCOUNT_CODES)
    } catch { /* non-finance role — migration 046 covers the seed */ }
    const { data: accData } = await supabase.from('chart_of_accounts').select('*').eq('school_id', schoolId).order('code')
    setAccountOptions(accData || [])
    // Backfill per-class GL account pairs (spec: asset_classes.expense_account_id
    // / accumulated_account_id) from the standard depreciation codes whenever a
    // class has no pair yet. Non-finance roles can't write — they still resolve
    // the per-class accounts at run time, so this is best-effort.
    try {
      const needsPair = (data.categories || []).filter((c) => !c.expense_account_id || !c.accumulated_account_id)
      if (needsPair.length) {
        const updated = []
        for (const c of needsPair) {
          const { expenseCode, accCode } = depreciationAccountsFor({}, c.name)
          const exp = (accData || []).find((a) => a.code === expenseCode)
          const acc = (accData || []).find((a) => a.code === accCode)
          if (!exp || !acc) { updated.push(c); continue }
          const { data: row } = await supabase.from('asset_categories').update({
            expense_account_id: exp.id, accumulated_account_id: acc.id,
          }).eq('id', c.id).select().single()
          updated.push(row || c)
        }
        setCategories((prev) => prev.map((old) => updated.find((u) => u.id === old.id) || old))
      }
    } catch { /* non-finance role — migration 054 covers the seed */ }
    const { data: invData } = await supabase.from('ap_invoices').select('*').eq('school_id', schoolId).order('invoice_date', { ascending: false })
    setApInvoices(invData || [])
    setLoading(false)
  }, [schoolId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!schoolId) return
    ensureDefaultTaxRules(supabase, schoolId).then(() => {
      if (!taxRules.length) load()
    })
  }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const fetchAccounts = useCallback(async () => {
    const { data } = await supabase.from('chart_of_accounts').select('*').eq('school_id', schoolId)
    return data || []
  }, [schoolId])

  const setDeprAccountDefaults = useCallback(async () => {
    const accs = await fetchAccounts()
    // Only ever default to dedicated depreciation accounts so the dropdowns
    // stay strictly filtered and safe to post.
    const validExpense = accs.filter((a) => a.type === 'expense' && (a.category === 'Depreciation' || /^60\d0$/.test(a.code)))
    const validAccum = accs.filter((a) => a.type === 'asset' && (a.category === 'Accumulated Depreciation' || /^17\d{2}$/.test(a.code)))
    const expense = validExpense.find((a) => a.code === '6010') || validExpense[0] || null
    const accumulated = validAccum.find((a) => a.code === '1701') || validAccum[0] || null
    setDeprForm((f) => ({
      ...f,
      expense_account_id: expense?.id || '',
      accumulated_account_id: accumulated?.id || '',
    }))
  }, [fetchAccounts])

  const createDeprAccounts = async () => {
    setSaving(true)
    try {
      await ensureAccounts(supabase, schoolId, DEPRECIATION_ACCOUNT_CODES)
      const accs = await fetchAccounts()
      setAccountOptions(accs)
      const expense = accs.find((a) => a.code === '6010') || accs.find((a) => a.type === 'expense' && (a.category === 'Depreciation' || /^60\d0$/.test(a.code)))
      const accumulated = accs.find((a) => a.code === '1701') || accs.find((a) => a.type === 'asset' && (a.category === 'Accumulated Depreciation' || /^17\d{2}$/.test(a.code)))
      setDeprForm((f) => ({
        ...f,
        expense_account_id: expense?.id || '',
        accumulated_account_id: accumulated?.id || '',
      }))
      setToast({ type: 'success', msg: 'Depreciation accounts created. Choose the default accounts, then post.' })
    } catch (e) {
      setToast({ type: 'error', msg: `Could not create accounts: ${e.message || e}` })
    } finally {
      setSaving(false)
    }
  }

  const openAssetModal = (asset = null) => {
    setAssetModal({ isNew: !asset, asset })
    setAssetForm(asset ? {
      name: asset.name, category_id: asset.category_id || '', asset_type: asset.asset_type || 'equipment',
      serial_number: asset.serial_number || '', model: asset.model || '', manufacturer: asset.manufacturer || '',
      description: asset.description || '', purchase_date: asset.purchase_date || TODAY, supplier_id: asset.supplier_id || '',
      purchase_invoice_ref: asset.purchase_invoice_ref || '', purchase_cost: asset.purchase_cost || '',
      residual_value: asset.residual_value || 0, useful_life_months: asset.useful_life_months || 60,
      depreciation_method: asset.depreciation_method || 'reducing_balance', depreciation_rate: asset.depreciation_rate || 0,
      warranty_until: asset.warranty_until || '', status: asset.status || 'active',
      campus: asset.campus || '', building: asset.building || '', department: asset.department || '',
      room: asset.room || '', specific_location: asset.specific_location || '',
      custodian_id: asset.custodian_id || '', assigned_date: asset.assigned_date || TODAY,
      tax_class: asset.tax_class || '', investment_class: asset.investment_class || '',
      acquisition_source: asset.acquisition_source || 'supplier',
      invoice_mode: 'create', existing_invoice_id: '',
      payment_status: asset.payment_status || 'unpaid', payment_account_id: '',
      payment_amount: '', gl_cash_account_id: '', gl_donation_account_id: '',
    } : blankAsset())
    setPhotoFile(null)
  }

  const uploadToBucket = async (path, file) => {
    const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
    if (error) throw error
    return path
  }

  const saveAsset = async () => {
    if (!assetForm.name.trim()) { setToast({ type: 'error', msg: 'Asset name is required.' }); return }
    if (!assetForm.purchase_cost || Number(assetForm.purchase_cost) < 0) { setToast({ type: 'error', msg: 'Enter a valid purchase cost.' }); return }
    if (assetModal.isNew && assetForm.acquisition_source === 'supplier' && !assetForm.supplier_id) { setToast({ type: 'error', msg: 'Select a supplier for supplier purchases.' }); return }
    setSaving(true)
    try {
      const cost = Number(assetForm.purchase_cost)
      const policyCat = categories.find((c) => c.id === assetForm.category_id)
      let assetId = assetModal.asset?.asset_id
      if (assetModal.isNew) assetId = await nextAssetId(supabase, schoolId)

      // Integrated Accounts Payable workflow. Supplier purchases either link to
      // an existing AP invoice or raise a new one (draft); the asset carries the
      // real link (purchase_invoice_id). VAT is 0% — asset purchases are
      // typically not subject to input VAT recovery. Runs BEFORE the asset
      // insert so a failure here rolls back cleanly.
      let apInvoiceNo = null
      let apInvoiceId = null
      let apPaymentNo = null
      const isSupplierPurchase = assetModal.isNew && assetForm.acquisition_source === 'supplier'
      if (isSupplierPurchase) {
        if (!assetForm.supplier_id) throw new Error('Select a supplier for supplier purchases.')

        if (assetForm.invoice_mode === 'existing') {
          if (!assetForm.existing_invoice_id) throw new Error('Select the AP invoice to link, or switch to “Create new invoice”.')
          const linked = apInvoices.find((i) => i.id === assetForm.existing_invoice_id)
          if (!linked) throw new Error('The selected invoice could not be found.')
          if (linked.supplier_id !== assetForm.supplier_id) throw new Error('The selected invoice does not belong to the chosen supplier.')
          apInvoiceId = linked.id
          apInvoiceNo = linked.invoice_no
        } else {
          const assetAccCode = fixedAssetAccountCodeFor({ asset_type: assetForm.asset_type }, policyCat?.name || '')
          await ensureAccounts(supabase, schoolId, [assetAccCode])
          const { data: accAcc } = await supabase.from('chart_of_accounts')
            .select('id').eq('school_id', schoolId).eq('code', assetAccCode).single()
          if (!accAcc) throw new Error(`Fixed asset account ${assetAccCode} is missing from the chart — add it or run “Create depreciation accounts”.`)

          apInvoiceNo = await nextInvoiceNo(supabase, schoolId)
          let dueDate = null
          if (assetForm.purchase_date) {
            const termsDays = parseInt((suppliers.find((s) => s.id === assetForm.supplier_id)?.payment_terms) || '', 10)
            const days = Number.isFinite(termsDays) && termsDays > 0 ? termsDays : 30
            const d = new Date(assetForm.purchase_date)
            d.setDate(d.getDate() + days)
            dueDate = d.toISOString().split('T')[0]
          }
          const { data: invRow, error: invErr } = await supabase.from('ap_invoices').insert({
            school_id: schoolId, supplier_id: assetForm.supplier_id, invoice_no: apInvoiceNo,
            supplier_ref: assetForm.purchase_invoice_ref || null,
            invoice_date: assetForm.purchase_date || TODAY, due_date: dueDate,
            description: `Asset acquisition — ${assetForm.name.trim()}`,
            department: assetForm.department || null, cost_centre: null,
            tax_treatment: 'none', vat_rate: 0,
            subtotal: cost, taxable_amount: cost, vat_amount: 0, total_amount: cost,
            notes: `Created from Fixed Assets — asset ${assetId}`, status: 'draft', created_by: userId,
          }).select().single()
          if (invErr) throw invErr
          apInvoiceId = invRow.id
          const { error: lineErr } = await supabase.from('ap_invoice_lines').insert({
            school_id: schoolId, invoice_id: invRow.id, description: assetForm.name.trim(),
            quantity: 1, unit_price: cost, discount_amount: 0, account_id: accAcc.id,
            department: assetForm.department || null, cost_centre: null,
          })
          if (lineErr) throw lineErr

          const apSupplierName = suppliers.find((s) => s.id === assetForm.supplier_id)?.name || 'Supplier'

          // Post the invoice straight to the GL so the acquisition appears as an
          // already payment-pending bill (outstanding payable) in Accounts
          // Payable — no manual draft → submit → review → approve → post steps.
          const invJe = await postInvoiceJournal(supabase, {
            schoolId, userId,
            invoice: invRow,
            lines: [{ account_id: accAcc.id, description: assetForm.name.trim(), quantity: 1, unit_price: cost, discount_amount: 0 }],
            supplierName: apSupplierName,
            entryDate: assetForm.purchase_date || TODAY,
          })
          const { error: invPostErr } = await supabase.from('ap_invoices').update({
            status: 'posted', journal_entry_id: invJe.id, posted_by: userId,
            posted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq('id', invRow.id)
          if (invPostErr) throw invPostErr

          // Raise the payment against the new invoice so the paid portion shows
          // instantly in AP. Fully Paid = the full invoice total (locked);
          // Partially Paid = the actual amount paid (editable, below the total).
          // The payment is posted to the GL immediately so the bill shows
          // settled — it follows the normal AP posting rules, just without the
          // manual submit → review → approve → post steps.
          if (assetForm.payment_status !== 'unpaid') {
            if (!assetForm.payment_account_id) throw new Error('Select the payment account for this acquisition.')
            const payAmount = assetForm.payment_status === 'fully_paid'
              ? cost
              : Math.round((Number(assetForm.payment_amount) || cost) * 100) / 100
            if (!(payAmount > 0)) throw new Error('Enter a valid payment amount.')
            if (assetForm.payment_status === 'partially_paid' && payAmount >= cost) throw new Error('Partially paid amount must be less than the invoice total.')
            const payAcc = accountOptions.find((a) => a.id === assetForm.payment_account_id)
            const methodMap = { 1010: 'cash', 1030: 'mobile' }
            const paymentMethod = methodMap[payAcc?.code] || 'bank'
            apPaymentNo = await nextPaymentNo(supabase, schoolId)
            const { data: payRow, error: payErr } = await supabase.from('ap_payments').insert({
              school_id: schoolId, payment_no: apPaymentNo, payment_type: 'invoice',
              supplier_id: assetForm.supplier_id, amount: payAmount,
              payment_date: assetForm.purchase_date || TODAY, payment_method: paymentMethod,
              payment_account_id: assetForm.payment_account_id,
              reference_no: `Asset ${assetId}`, description: `Payment for ${assetForm.name.trim()} (${assetId})`,
              department: assetForm.department || null, cost_centre: null,
              status: 'draft', created_by: userId,
            }).select().single()
            if (payErr) throw payErr
            const { error: allocErr } = await supabase.from('ap_payment_allocations').insert({
              school_id: schoolId, payment_id: payRow.id, invoice_id: invRow.id, amount: payAmount,
            })
            if (allocErr) throw allocErr

            const payJe = await postPaymentJournal(supabase, {
              schoolId, userId, payment: payRow, payeeName: apSupplierName,
              entryDate: assetForm.purchase_date || TODAY,
            })
            const { error: payPostErr } = await supabase.from('ap_payments').update({
              status: 'posted', journal_entry_id: payJe.id, posted_by: userId,
              posted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }).eq('id', payRow.id)
            if (payPostErr) throw payPostErr
            await recomputeInvoicePaid(supabase, { schoolId, invoiceId: invRow.id })
          }
        }
      }

      // Direct GL for acquisitions with no supplier invoice (cash/bank/donation).
      // The supplier invoice is the source of truth for supplier purchases (it
      // posts automatically to the GL at acquisition), so NO entry is posted
      // here. For these sources this is the single GL posting of the acquisition.
      let glDrAcc = null
      let glCrAccId = null
      const isDirectGL = assetModal.isNew && ['cash', 'bank', 'donation'].includes(assetForm.acquisition_source)
      if (isDirectGL) {
        const assetAccCode = fixedAssetAccountCodeFor({ asset_type: assetForm.asset_type }, policyCat?.name || '')
        await ensureAccounts(supabase, schoolId, [assetAccCode])
        const { data: drAcc } = await supabase.from('chart_of_accounts')
          .select('*').eq('school_id', schoolId).eq('code', assetAccCode).single()
        if (!drAcc) throw new Error(`Fixed asset account ${assetAccCode} is missing from the chart — add it or run “Create depreciation accounts”.`)
        glDrAcc = drAcc
        glCrAccId = assetForm.acquisition_source === 'donation' ? assetForm.gl_donation_account_id : assetForm.gl_cash_account_id
        if (!glCrAccId) throw new Error(assetForm.acquisition_source === 'donation'
          ? 'Select the donation / grant / income account.'
          : 'Select the bank / cash account.')
      }

      const base = {
        school_id: schoolId,
        name: assetForm.name.trim(), category_id: assetForm.category_id || null,
        asset_type: assetForm.asset_type, serial_number: assetForm.serial_number || null,
        model: assetForm.model || null, manufacturer: assetForm.manufacturer || null,
        description: assetForm.description || null, purchase_date: assetForm.purchase_date || null,
        supplier_id: assetForm.supplier_id || null,
        purchase_invoice_ref: apInvoiceNo || assetForm.purchase_invoice_ref || null,
        purchase_invoice_id: assetModal.isNew ? apInvoiceId : assetModal.asset.purchase_invoice_id ?? null,
        acquisition_source: assetForm.acquisition_source,
        payment_status: assetModal.isNew
          ? (isSupplierPurchase ? assetForm.payment_status : null)
          : assetModal.asset.payment_status ?? null,
        purchase_cost: cost,
        // Financial-accounting policy (independent of tax). New assets inherit
        // the ACCOUNTING policy only from the category; tax_class never
        // overrides method / rate / life / residual.
        residual_value: assetModal.isNew
          ? Number(policyCat?.residual_value ?? assetForm.residual_value) || 0
          : Number(assetForm.residual_value) || 0,
        useful_life_months: assetModal.isNew
          ? Number(policyCat?.useful_life_months ?? assetForm.useful_life_months) || 60
          : Number(assetForm.useful_life_months) || 60,
        depreciation_method: policyCat?.depreciation_method || assetForm.depreciation_method || 'reducing_balance',
        depreciation_rate: Number(policyCat?.depreciation_rate ?? assetForm.depreciation_rate) || 0,
        // Kenyan tax classification — controls the tax capital-allowance
        // schedule ONLY. It does not affect accounting depreciation.
        tax_class: assetForm.tax_class || null,
        investment_class: assetForm.investment_class || null,
        first_year_allowance: assetModal.isNew ? 0 : Number(assetModal.asset.first_year_allowance || 0),
        warranty_until: assetForm.warranty_until || null, status: assetForm.status,
        campus: assetForm.campus || null, building: assetForm.building || null, department: assetForm.department || null,
        room: assetForm.room || null, specific_location: assetForm.specific_location || null,
        custodian_id: assetForm.custodian_id || null, assigned_date: assetForm.assigned_date || null,
        nbv: cost,
      }

      let newAsset
      if (assetModal.isNew) {
        const { data, error } = await supabase.from('fixed_assets')
          .insert({ ...base, asset_id: assetId, created_by: userId }).select().single()
        if (error) throw error
        newAsset = data
      } else {
        const { data, error } = await supabase.from('fixed_assets')
          .update(base).eq('id', assetModal.asset.id).select().single()
        if (error) throw error
        newAsset = data
      }

      // Post the acquisition entry for cash/bank/donation purchases (single GL
      // posting — supplier purchases post via the approved invoice instead).
      let glJournal = null
      if (glDrAcc) {
        const crAcc = accountOptions.find((a) => a.id === glCrAccId)
        try {
          glJournal = await postToJournal(supabase, {
            schoolId, userId,
            entry_date: assetForm.purchase_date || TODAY,
            description: `Acquire ${newAsset.name} (${assetId}) — ${assetForm.acquisition_source}`,
            source: 'assets', reference_type: 'fixed_asset', reference_id: newAsset.id,
            lines: [
              { account_id: glDrAcc.id, debit: cost, credit: 0, notes: `Fixed asset ${assetId}` },
              { account_id: glCrAccId, debit: 0, credit: cost, notes: crAcc?.name || '' },
            ],
          })
        } catch (e) {
          await supabase.from('fixed_assets').delete().eq('id', newAsset.id)
          throw e
        }
      }

      if (photoFile) {
        const ext = photoFile.name.split('.').pop()
        const path = `${schoolId}/asset_docs/${assetId}/photo_${Date.now()}.${ext}`
        await uploadToBucket(path, photoFile)
        await supabase.from('fixed_assets').update({ photo_path: path }).eq('id', newAsset.id)
        newAsset.photo_path = path
      }

      await addAssetEvent(supabase, {
        schoolId, assetId: newAsset.id,
        eventType: assetModal.isNew ? 'acquired' : 'updated',
        description: assetModal.isNew
          ? `Acquired ${newAsset.name} (${newAsset.asset_id}) for ${fmt(cost)}`
          : 'Asset details updated',
      })
      await writeAudit(supabase, {
        schoolId,
        action: assetModal.isNew ? 'assets.acquired' : 'assets.updated',
        details: { asset_id: newAsset.asset_id, name: newAsset.name },
      })

      if (apInvoiceNo) {
        await addAssetEvent(supabase, {
          schoolId, assetId: newAsset.id, eventType: 'invoice',
          description: assetForm.invoice_mode === 'existing'
            ? `Linked to AP invoice ${apInvoiceNo}`
            : `AP invoice ${apInvoiceNo} raised & posted to GL for ${fmt(cost)}${apPaymentNo ? ` — settled by payment ${apPaymentNo}` : ' — payment pending in Accounts Payable'}`,
        })
        await writeAudit(supabase, {
          schoolId, action: 'assets.ap_invoice_created',
          details: { asset_id: assetId, invoice_no: apInvoiceNo, total: cost, posted: true },
        })
      }
      if (apPaymentNo) {
        await addAssetEvent(supabase, {
          schoolId, assetId: newAsset.id, eventType: 'payment',
          description: `AP payment ${apPaymentNo} raised & posted for ${fmt(cost)} — bill settled`,
        })
        await writeAudit(supabase, {
          schoolId, action: 'assets.ap_payment_created',
          details: { asset_id: assetId, payment_no: apPaymentNo, posted: true },
        })
      }
      if (glJournal) {
        const crAcc = accountOptions.find((a) => a.id === glCrAccId)
        await addAssetEvent(supabase, {
          schoolId, assetId: newAsset.id, eventType: 'gl_posted',
          description: `Acquisition posted to GL — Dr ${glDrAcc.name} / Cr ${crAcc?.name || ''} (${fmt(cost)})`,
        })
        await writeAudit(supabase, {
          schoolId, action: 'assets.gl_posted',
          details: { asset_id: assetId, journal_id: glJournal.id, entry_date: assetForm.purchase_date || TODAY },
        })
      }

      if (assetModal.isNew && newAsset.custodian_id) {
        await supabase.from('asset_custody_history').insert({
          school_id: schoolId, asset_id: newAsset.id, custodian_id: newAsset.custodian_id,
          from_date: newAsset.assigned_date || TODAY, notes: 'Initial assignment',
        })
        await addAssetEvent(supabase, {
          schoolId, assetId: newAsset.id, eventType: 'assigned',
          description: `Assigned to ${staffMap[newAsset.custodian_id] || 'staff member'}`,
        })
      }

      const linkedBits = [
        apInvoiceNo ? `AP invoice ${apInvoiceNo} posted (${apPaymentNo ? 'settled' : 'payment pending'})` : null,
        apPaymentNo ? `payment ${apPaymentNo} posted` : null,
        glJournal ? `posted to GL (${glJournal.entry_no})` : null,
      ].filter(Boolean).join(' · ')
      setToast({ type: 'success', msg: assetModal.isNew
        ? `Asset ${assetId} registered${linkedBits ? ` · ${linkedBits} created.` : '.'}`
        : 'Asset updated.' })
      setAssetModal(null)
      load()
    } catch (e) {
      setToast({ type: 'error', msg: e.message })
    }
    setSaving(false)
  }

  // Quick supplier registration inside the Acquire Asset modal. Writes to the
  // global AP supplier master so the vendor is available everywhere.
  const saveQuickSupplier = async () => {
    if (!quickSupplier.name.trim()) { setToast({ type: 'error', msg: 'Supplier name is required.' }); return }
    setSaving(true)
    try {
      const supplierNo = await nextSupplierNo(supabase, schoolId)
      const { data, error } = await supabase.from('ap_suppliers').insert({
        school_id: schoolId, supplier_no: supplierNo, name: quickSupplier.name.trim(),
        supplier_type: 'supplier', phone: quickSupplier.phone || null, email: quickSupplier.email || null,
        kra_pin: quickSupplier.kra_pin || null, active: true, created_by: userId,
      }).select().single()
      if (error) throw error
      await writeAudit(supabase, {
        schoolId, action: 'assets.supplier_created', details: { name: quickSupplier.name.trim(), supplier_no: supplierNo },
      })
      setSuppliers((prev) => [...prev, data])
      setAssetForm((f) => ({ ...f, supplier_id: data.id }))
      setQuickSupplier({ name: '', phone: '', email: '', kra_pin: '' })
      setShowQuickSupplier(false)
      setToast({ type: 'success', msg: `Supplier ${supplierNo} added and selected.` })
    } catch (e) {
      setToast({ type: 'error', msg: e.message })
    }
    setSaving(false)
  }

  const openCategoryModal = (cat = null) => {
    setCatModal({ isNew: !cat, cat })
    setCatForm(cat ? { ...cat } : blankCategory())
  }

  const saveCategory = async () => {
    if (!catForm.name.trim()) { setToast({ type: 'error', msg: 'Category name is required.' }); return }
    const payload = {
      ...catForm, name: catForm.name.trim(),
      depreciation_rate: Number(catForm.depreciation_rate) || 0,
      residual_value: Number(catForm.residual_value) || 0,
      useful_life_months: Number(catForm.useful_life_months) || 60,
      expense_account_id: catForm.expense_account_id || null,
      accumulated_account_id: catForm.accumulated_account_id || null,
    }
    const { error } = catModal.isNew
      ? await supabase.from('asset_categories').insert({ ...payload, school_id: schoolId })
      : await supabase.from('asset_categories').update(payload).eq('id', catModal.cat.id)
    if (error) {
      setToast({ type: 'error', msg: error.message })
      return
    }
    if (!catModal.isNew) {
      // Push the ACCOUNTING depreciation policy only. tax_class on a category
      // is just a default for new assets — it must never override an asset's
      // accounting method / rate / useful life / residual value.
      await supabase.from('fixed_assets').update({
        depreciation_method: payload.depreciation_method,
        depreciation_rate: payload.depreciation_rate,
        useful_life_months: payload.useful_life_months,
        residual_value: payload.residual_value,
      }).eq('school_id', schoolId).eq('category_id', catModal.cat.id)
    }
    setToast({ type: 'success', msg: catModal.isNew ? 'Category created.' : 'Category updated.' })
    setCatModal(null)
    load()
  }

  const openAssignModal = (asset) => {
    setAssignModal(asset)
    setAssignForm({
      asset_id: asset?.id || '', custodian_id: '', from_date: TODAY, notes: '',
      campus: asset?.campus || '', building: asset?.building || '', department: asset?.department || '',
      room: asset?.room || '', specific_location: asset?.specific_location || '',
    })
  }

  const saveAssign = async () => {
    if (!assignForm.custodian_id) { setToast({ type: 'error', msg: 'Select a custodian.' }); return }
    const asset = assignModal || assets.find((a) => a.id === assignForm.asset_id)
    if (!asset) { setToast({ type: 'error', msg: 'Select an asset.' }); return }
    setSaving(true)
    const hadCustodian = !!asset.custodian_id
    const locationChanged = [
      ['campus', asset.campus], ['building', asset.building],
      ['department', asset.department], ['room', asset.room],
      ['specific_location', asset.specific_location],
    ].some(([k, oldVal]) => (assignForm[k] || null) !== (oldVal || null))

    if (hadCustodian) {
      await supabase.from('asset_custody_history')
        .update({ to_date: assignForm.from_date || TODAY })
        .eq('asset_id', asset.id)
        .is('to_date', null)
    }
    await supabase.from('asset_custody_history').insert({
      school_id: schoolId, asset_id: asset.id, custodian_id: assignForm.custodian_id,
      from_date: assignForm.from_date || TODAY, notes: assignForm.notes || null, recorded_by: userId,
    })
    await supabase.from('fixed_assets').update({
      custodian_id: assignForm.custodian_id, assigned_date: assignForm.from_date || TODAY, status: 'active',
    }).eq('id', asset.id)

    if (locationChanged) {
      await supabase.from('asset_location_history').insert({
        school_id: schoolId, asset_id: asset.id, campus: assignForm.campus || null,
        building: assignForm.building || null, department: assignForm.department || null,
        room: assignForm.room || null, specific_location: assignForm.specific_location || null,
        from_date: assignForm.from_date || TODAY,
      })
      await supabase.from('fixed_assets').update({
        campus: assignForm.campus || null, building: assignForm.building || null,
        department: assignForm.department || null, room: assignForm.room || null,
        specific_location: assignForm.specific_location || null,
      }).eq('id', asset.id)
    }

    await addAssetEvent(supabase, {
      schoolId, assetId: asset.id,
      eventType: hadCustodian ? 'transferred' : 'assigned',
      description: `${hadCustodian ? 'Transferred' : 'Assigned'} to ${staffMap[assignForm.custodian_id] || 'new custodian'}`,
    })
    await writeAudit(supabase, { schoolId, action: 'assets.transferred', details: { asset_id: asset.asset_id } })
    setSaving(false)
    setAssignModal(null)
    setToast({ type: 'success', msg: hadCustodian ? 'Asset transferred.' : 'Asset assigned.' })
    load()
  }

  const openDisposeModal = (asset) => {
    setDisposeModal(asset)
    setDisposeForm({ disposal_date: TODAY, disposal_reason: '', disposal_amount: 0, gl_cash_account_id: '' })
  }

  const saveDispose = async () => {
    if (!disposeForm.disposal_reason.trim()) { setToast({ type: 'error', msg: 'A disposal reason is required.' }); return }
    const asset = disposeModal
    const cost = Number(asset?.purchase_cost || 0)
    const accDep = Number(asset?.accumulated_depreciation || 0)
    const proceeds = Number(disposeForm.disposal_amount) || 0
    if (proceeds > 0 && !disposeForm.gl_cash_account_id) { setToast({ type: 'error', msg: 'Select the bank / cash account for the disposal proceeds.' }); return }
    setSaving(true)
    try {
      let journal = null
      // Post the disposal to the GL FIRST so the asset is never marked disposed
      // without removing it from the balance sheet:
      //   Dr Accumulated Depreciation (removed)
      //   Dr Bank / Cash / M-Pesa (proceeds, if any)
      //   Dr/Cr Gain or Loss on Disposal (balancing figure)
      //   Cr Fixed Asset (cost removed)
      if (cost > 0) {
        const pc = categories.find((c) => c.id === asset?.category_id)
        const catName = pc?.name || ''
        const assetAccCode = fixedAssetAccountCodeFor(asset, catName)
        const { accCode } = depreciationAccountsFor(asset, catName)
        await ensureAccounts(supabase, schoolId, [assetAccCode, accCode, '5370', '4150'])
        const { data: accs } = await supabase.from('chart_of_accounts')
          .select('*').eq('school_id', schoolId).in('code', [assetAccCode, accCode, '5370', '4150'])
        const accByCode = Object.fromEntries((accs || []).map((a) => [a.code, a]))
        const fixedAssetAcc = accByCode[assetAccCode]
        if (!fixedAssetAcc) throw new Error(`Fixed asset account ${assetAccCode} is missing from the chart.`)
        const resolved = resolveClassAccounts(asset, pc)
        const accDepAcc = resolved?.accId ? accountOptions.find((a) => a.id === resolved.accId) : accByCode[accCode]
        if (!accDepAcc) throw new Error(`Accumulated depreciation account ${accCode} is missing from the chart.`)
        const proceedsAcc = proceeds > 0 ? accountOptions.find((a) => a.id === disposeForm.gl_cash_account_id) : null
        const lossAcc = accByCode['5370']
        const gainAcc = accByCode['4150']
        if (!lossAcc || !gainAcc) throw new Error('Gain / Loss on disposal accounts are missing from the chart.')
        const balance = cost - accDep - proceeds
        const lines = []
        if (accDep > 0) lines.push({ account_id: accDepAcc.id, debit: accDep, credit: 0, notes: `Accumulated depreciation removed — ${asset.asset_id}` })
        if (proceeds > 0 && proceedsAcc) lines.push({ account_id: proceedsAcc.id, debit: proceeds, credit: 0, notes: 'Disposal proceeds' })
        lines.push({ account_id: fixedAssetAcc.id, debit: 0, credit: cost, notes: `Asset ${asset.asset_id} removed at cost` })
        if (balance > 0.01) lines.push({ account_id: lossAcc.id, debit: balance, credit: 0, notes: 'Loss on disposal' })
        else if (balance < -0.01) lines.push({ account_id: gainAcc.id, debit: 0, credit: -balance, notes: 'Gain on disposal' })
        journal = await postToJournal(supabase, {
          schoolId, userId,
          entry_date: disposeForm.disposal_date || TODAY,
          description: `Dispose ${asset.name} (${asset.asset_id})${proceeds ? ` — proceeds ${fmt(proceeds)}` : ''}`,
          source: 'assets', reference_type: 'asset_disposal', reference_id: asset.id,
          lines,
        })
      }
      await supabase.from('fixed_assets').update({
        status: 'disposed', disposal_date: disposeForm.disposal_date || TODAY,
        disposal_reason: disposeForm.disposal_reason.trim(), disposal_amount: proceeds,
        custodian_id: null,
      }).eq('id', asset.id)
      await supabase.from('asset_custody_history')
        .update({ to_date: disposeForm.disposal_date || TODAY })
        .eq('asset_id', asset.id)
        .is('to_date', null)
      await addAssetEvent(supabase, {
        schoolId, assetId: asset.id, eventType: 'disposed',
        description: `Disposed (${disposeForm.disposal_reason.trim()})${proceeds ? ` — proceeds ${fmt(proceeds)}` : ''}${journal ? ` · Journal ${journal.entry_no}` : ''}`,
      })
      await writeAudit(supabase, { schoolId, action: 'assets.disposed', details: { asset_id: asset.asset_id, name: asset.name, proceeds, journal_entry: journal?.entry_no || null } })
      setSaving(false)
      setDisposeModal(null)
      setToast({ type: 'success', msg: journal ? `Asset disposed · Journal ${journal.entry_no}` : 'Asset disposed.' })
      load()
    } catch (e) {
      setSaving(false)
      setToast({ type: 'error', msg: e.message || 'Disposal failed. Nothing was changed.' })
    }
  }

  const openMaintModal = (asset = null) => {
    setMaintModal(true)
    setMaintForm({
      asset_id: asset?.id || '', maintenance_date: TODAY, maintenance_type: 'preventive',
      description: '', cost: 0, service_provider: '', status: 'completed', next_service_date: '',
    })
  }

  const saveMaintenance = async () => {
    if (!maintForm.asset_id) { setToast({ type: 'error', msg: 'Select an asset.' }); return }
    setSaving(true)
    const { error } = await supabase.from('asset_maintenance').insert({
      school_id: schoolId, asset_id: maintForm.asset_id, maintenance_date: maintForm.maintenance_date || TODAY,
      maintenance_type: maintForm.maintenance_type, description: maintForm.description || null,
      cost: Number(maintForm.cost) || 0, service_provider: maintForm.service_provider || null,
      status: maintForm.status, next_service_date: maintForm.next_service_date || null, performed_by: userId,
    }).select().single()
    if (error) {
      setToast({ type: 'error', msg: error.message }); setSaving(false); return
    }
    const a = assets.find((x) => x.id === maintForm.asset_id)
    await addAssetEvent(supabase, {
      schoolId, assetId: maintForm.asset_id, eventType: 'maintained',
      description: `${maintForm.maintenance_type} maintenance — ${a?.name || 'asset'} (${fmt(Number(maintForm.cost) || 0)})`,
    })
    setSaving(false)
    setMaintModal(false)
    setToast({ type: 'success', msg: 'Maintenance record saved.' })
    load()
  }

  const previewDepreciation = (assetIds) => {
    const targets = assets.filter((a) => assetIds ? assetIds.includes(a.id) : a.status !== 'disposed')
    return targets.map((a) => ({ asset: a, amount: monthlyDepreciation(a) })).filter((p) => p.amount > 0)
  }

  const findAccountByCode = (code) => accountOptions.find((a) => a.code === code)

  // Resolve the GL account pair for one asset's class. Uses the account IDs
  // stored on the class (asset_categories); falls back to the standard codes
  // derived from the class name so existing schools keep working unchanged.
  const resolveClassAccounts = (asset, pc) => {
    if (pc?.expense_account_id && pc?.accumulated_account_id) {
      return { expenseId: pc.expense_account_id, accId: pc.accumulated_account_id, className: pc.name }
    }
    const { expenseCode, accCode } = depreciationAccountsFor(asset, pc?.name)
    const exp = findAccountByCode(expenseCode)
    const acc = findAccountByCode(accCode)
    if (exp && acc) return { expenseId: exp.id, accId: acc.id, className: pc?.name || 'Uncategorised', derived: true }
    return null
  }

  // Per-class totals for a run preview / post — ONE Dr/Cr pair per class, the
  // exact table shown in the run modal and the journal entry report.
  const deprClassTotals = (preview) => {
    const groups = {}
    for (const p of preview) {
      const pc = categories.find((c) => c.id === p.asset.category_id)
      const resolved = resolveClassAccounts(p.asset, pc)
      const expenseId = resolved?.expenseId || deprForm.expense_account_id
      const accId = resolved?.accId || deprForm.accumulated_account_id
      const key = expenseId && accId ? `${expenseId}|${accId}` : 'unset'
      if (!groups[key]) {
        groups[key] = { className: resolved?.className || pc?.name || 'Uncategorised', expenseId, accId, amount: 0, assets: 0 }
      }
      groups[key].amount += p.amount
      groups[key].assets += 1
    }
    return Object.values(groups)
  }

  // Depreciation year-to-date for an asset (current calendar year), used by the
  // Asset Register report. There is no fiscal-year concept, so "year" is the
  // calendar year of each run's period label (e.g. "Mar 2026").
  const deprYtd = (assetId) => runLines
    .filter((l) => l.asset_id === assetId && String(l.period_label).endsWith(` ${new Date().getFullYear()}`))
    .reduce((s, l) => s + l.depreciation_amount, 0)

  const openDeprModal = (assetIds = null) => {
    setDeprModal({ assetIds })
    setDeprForm((f) => ({ ...f, period_label: formatPeriod(TODAY), run_date: TODAY }))
    setDeprAccountDefaults()
  }

  // Journal Entry Report for a run: the exact posted lines (one Dr/Cr pair per
  // asset class), straight from the journal entry.
  const openRunView = async (run) => {
    setViewRun(run)
    setViewRunLines([])
    if (!run?.journal_entry_id) return
    const { data } = await supabase.from('journal_entry_lines')
      .select('*, chart_of_accounts(code, name, type)')
      .eq('journal_entry_id', run.journal_entry_id)
      .order('id')
    setViewRunLines(data || [])
  }

  // Post (or complete) the GL journal entry for a depreciation run. Groups the
  // per-asset amounts by class — ONE Dr/Cr account pair per class — and returns
  // the created journal entry. Throws if a class has no resolvable accounts.
  const postJournalForRun = async (run, entries) => {
    const groups = {}
    const unsetClasses = new Set()
    for (const p of entries) {
      const pc = categories.find((c) => c.id === p.asset.category_id)
      const resolved = resolveClassAccounts(p.asset, pc)
      const expenseId = resolved?.expenseId || deprForm.expense_account_id
      const accId = resolved?.accId || deprForm.accumulated_account_id
      if (!expenseId || !accId) { unsetClasses.add(resolved?.className || pc?.name || 'Uncategorised'); continue }
      const key = `${expenseId}|${accId}`
      if (!groups[key]) groups[key] = { expenseId, accId, amount: 0 }
      groups[key].amount += p.amount
    }
    if (unsetClasses.size) {
      throw new Error(`Set the depreciation accounts for: ${[...unsetClasses].join(', ')}. Nothing was posted.`)
    }
    const accountIds = new Set()
    Object.values(groups).forEach((g) => { accountIds.add(g.expenseId); accountIds.add(g.accId) })
    const ids = [...accountIds].filter(Boolean)
    if (!ids.length) throw new Error('No valid accounts selected for posting.')
    const { data: accRecords } = await supabase.from('chart_of_accounts').select('*').in('id', ids)
    const accById = Object.fromEntries((accRecords || []).map((a) => [a.id, a]))
    const journalLines = []
    for (const g of Object.values(groups)) {
      const exp = accById[g.expenseId]
      const acc = accById[g.accId]
      if (!exp || exp.type !== 'expense' || !(exp.category === 'Depreciation' || /^60\d0$/.test(exp.code))) {
        throw new Error(`Invalid depreciation expense account selected: ${exp ? `${exp.code} — ${exp.name}` : g.expenseId}`)
      }
      if (!acc || acc.type !== 'asset' || !(acc.category === 'Accumulated Depreciation' || /^17\d{2}$/.test(acc.code))) {
        throw new Error(`Invalid accumulated depreciation account selected: ${acc ? `${acc.code} — ${acc.name}` : g.accId}`)
      }
      journalLines.push({ account_id: g.expenseId, debit: g.amount, credit: 0, notes: run.period_label })
      journalLines.push({ account_id: g.accId, debit: 0, credit: g.amount, notes: run.period_label })
    }
    const je = await postToJournal(supabase, {
      schoolId, userId, entry_date: run.run_date || TODAY,
      description: `Depreciation for ${run.period_label} (${entries.length} assets)`,
      source: 'assets', reference_type: 'depreciation_run', reference_id: run.id,
      lines: journalLines,
    })
    await supabase.from('asset_depreciation_runs').update({ journal_entry_id: je.id }).eq('id', run.id)
    await writeAudit(supabase, {
      schoolId, action: 'assets.depreciation_run',
      details: { period: run.period_label, total: run.total_depreciation, entry_no: je.entry_no },
    })
    return je
  }

  // Complete the GL posting of a run whose journal insert failed midway (an
  // orphan: the run, its lines and the asset updates exist, but no journal
  // entry). Entries are rebuilt from the run's line rows, so nothing is
  // double-booked.
  const completeOrphanRun = async (run) => {
    setSaving(true)
    try {
      const { data: lns } = await supabase.from('asset_depreciation_lines')
        .select('*').eq('run_id', run.id)
      const entries = (lns || [])
        .map((l) => ({ asset: assets.find((a) => a.id === l.asset_id), amount: l.depreciation_amount }))
        .filter((e) => e.asset)
      if (!entries.length) throw new Error('No depreciation lines found for this run.')
      const je = await postJournalForRun(run, entries)
      setSaving(false)
      setToast({ type: 'success', msg: `Completed posting as ${je.entry_no}.` })
      load()
    } catch (e) {
      setSaving(false)
      setToast({ type: 'error', msg: e.message })
    }
  }

  const runDepreciation = async () => {
    const preview = previewDepreciation(deprModal.assetIds)
    if (!preview.length) { setToast({ type: 'error', msg: 'No assets are due for depreciation this period.' }); return }
    // Never run the same period twice. A leftover run with no journal entry is
    // an orphan from a failed posting — complete it instead of double-posting.
    const { data: existing } = await supabase.from('asset_depreciation_runs')
      .select('*, journal_entries(entry_no)').eq('school_id', schoolId).eq('period_label', deprForm.period_label)
    if (existing?.length) {
      if (existing[0].journal_entry_id) {
        setToast({ type: 'error', msg: `Depreciation for ${deprForm.period_label} is already posted as ${existing[0].journal_entries?.entry_no}.` })
        return
      }
      setToast({ type: 'info', msg: 'An earlier attempt for this period failed before the GL entry was posted — completing it now.' })
      await completeOrphanRun(existing[0])
      return
    }
    setSaving(true)
    try {
      const total = preview.reduce((s, p) => s + p.amount, 0)
      const { data: run, error: runErr } = await supabase.from('asset_depreciation_runs').insert({
        school_id: schoolId, run_date: deprForm.run_date || TODAY, period_label: deprForm.period_label,
        total_depreciation: total, created_by: userId,
      }).select().single()
      if (runErr) throw runErr

      // Insert detailed lines for the run
      const lineRows = preview.map((p) => {
        const accBefore = Number(p.asset.accumulated_depreciation || 0)
        return {
          run_id: run.id, asset_id: p.asset.id, school_id: schoolId, period_label: deprForm.period_label,
          depreciation_amount: p.amount, accumulated_before: accBefore,
          accumulated_after: accBefore + p.amount, nbv_before: calcNbv(p.asset), nbv_after: calcNbv(p.asset) - p.amount,
          posted: true,
        }
      })
      const { error: linesErr } = await supabase.from('asset_depreciation_lines').insert(lineRows)
      if (linesErr) throw linesErr

      // Update each asset NBV and add events
      for (const p of preview) {
        const acc = Number(p.asset.accumulated_depreciation || 0) + p.amount
        await supabase.from('fixed_assets').update({
          accumulated_depreciation: acc, nbv: calcNbv(p.asset) - p.amount,
        }).eq('id', p.asset.id)
        await addAssetEvent(supabase, {
          schoolId, assetId: p.asset.id, eventType: 'depreciated',
          description: `${fmt(p.amount)} depreciation for ${deprForm.period_label}`,
        })
      }

      const je = await postJournalForRun(run, preview)
      setSaving(false)
      setDeprModal(null)
      setToast({ type: 'success', msg: `Depreciation ${fmt(total)} posted as ${je.entry_no}.` })
      load()
    } catch (e) {
      setSaving(false)
      setToast({ type: 'error', msg: e.message })
    }
  }

  const openDocModal = (asset) => {
    setDocModal(asset)
    setDocForm({ document_type: 'purchase_invoice', title: '' })
    setDocFile(null)
  }

  const saveDocument = async () => {
    if (!docFile) { setToast({ type: 'error', msg: 'Select a file to upload.' }); return }
    setSaving(true)
    try {
      const safeName = docFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${schoolId}/asset_docs/${docModal.asset_id}/${Date.now()}_${safeName}`
      await uploadToBucket(path, docFile)
      await supabase.from('asset_documents').insert({
        school_id: schoolId, asset_id: docModal.id, document_type: docForm.document_type,
        title: docForm.title || null, file_name: docFile.name, storage_path: path, created_by: userId,
      })
      await addAssetEvent(supabase, {
        schoolId, assetId: docModal.id, eventType: 'document_added',
        description: `${docForm.title || docForm.document_type} uploaded`,
      })
      await writeAudit(supabase, { schoolId, action: 'assets.document_added', details: { asset_id: docModal.asset_id } })
      setSaving(false)
      setDocModal(null)
      setToast({ type: 'success', msg: 'Document uploaded.' })
      load()
    } catch (e) {
      setSaving(false)
      setToast({ type: 'error', msg: e.message })
    }
  }

  const viewDocument = async (doc) => {
    try {
      const { data } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 3600)
      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
      else setToast({ type: 'error', msg: 'Could not open document.' })
    } catch {
      setToast({ type: 'error', msg: 'Could not open document.' })
    }
  }

  // ─── Tax: rules admin ──────────────────────────────────────────────────
  const openTaxRuleModal = (rule = null) => {
    setTaxRuleModal({ isNew: !rule, rule })
    setTaxRuleForm(rule ? {
      rule_type: rule.rule_type, tax_class: rule.tax_class, description: rule.description || '',
      asset_classification: rule.asset_classification || '',
      rate: rule.rate, first_year_rate: rule.first_year_rate || 0,
      calc_method: rule.calc_method || 'reducing_balance',
      effective_date: rule.effective_date, expiry_date: rule.expiry_date || '',
      source_reference: rule.source_reference || '', is_active: rule.is_active,
    } : blankTaxRule())
  }

  const saveTaxRule = async () => {
    if (!taxRuleForm.tax_class.trim() || !taxRuleForm.effective_date) {
      setToast({ type: 'error', msg: 'A class code and effective date are required.' }); return
    }
    if (Number(taxRuleForm.rate) < 0 || Number(taxRuleForm.first_year_rate) < 0) {
      setToast({ type: 'error', msg: 'Rates cannot be negative.' }); return
    }
    setSaving(true)
    const payload = {
      ...taxRuleForm,
      tax_class: taxRuleForm.tax_class.trim(),
      rate: Number(taxRuleForm.rate) || 0,
      first_year_rate: Number(taxRuleForm.first_year_rate) || 0,
      expiry_date: taxRuleForm.expiry_date || null,
      source_reference: taxRuleForm.source_reference || null,
    }
    const { error } = taxRuleModal.isNew
      ? await supabase.from('tax_rules').insert({ ...payload, school_id: schoolId, created_by: userId })
      : await supabase.from('tax_rules').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', taxRuleModal.rule.id)
    if (error) {
      setToast({ type: 'error', msg: error.message }); setSaving(false); return
    }
    await writeAudit(supabase, {
      schoolId,
      action: taxRuleModal.isNew ? 'assets.tax_rule_created' : 'assets.tax_rule_updated',
      details: { tax_class: payload.tax_class, rule_type: payload.rule_type },
    })
    setSaving(false)
    setTaxRuleModal(null)
    setToast({ type: 'success', msg: taxRuleModal.isNew ? 'Tax rule created.' : 'Tax rule updated.' })
    load()
  }

  const toggleTaxRule = async (rule) => {
    const next = !rule.is_active
    await supabase.from('tax_rules').update({ is_active: next, updated_at: new Date().toISOString() }).eq('id', rule.id)
    await writeAudit(supabase, { schoolId, action: 'assets.tax_rule_toggled', details: { tax_class: rule.tax_class, active: next } })
    setToast({ type: 'success', msg: `Rule ${rule.tax_class} ${next ? 'activated' : 'deactivated'}.` })
    load()
  }

  // ─── Tax: schedules + reconciliation ───────────────────────────────────
  const taxRows = buildTaxSchedule({ assets, taxRules, taxSchedules, yearOfIncome: Number(taxYear) })
  const reconRows = taxVsAccounting({ assets, taxRules, taxSchedules, yearOfIncome: Number(taxYear) })

  const filteredTaxRows = taxRows.filter((r) => {
    const a = r.asset
    const matchCat = !taxFilterCat || a.category_id === taxFilterCat
    const matchClass = !taxFilterClass || a.tax_class === taxFilterClass
    const matchDept = !taxFilterDept || a.department === taxFilterDept
    const matchLoc = !taxFilterLoc || [a.campus, a.building, a.room, a.specific_location].some((x) => x === taxFilterLoc)
    return matchCat && matchClass && matchDept && matchLoc
  })

  const handleRunTaxAllowances = async () => {
    if (!isFinanceRole) { setToast({ type: 'error', msg: 'Only finance roles can run tax allowances.' }); return }
    setTaxRunning(true)
    try {
      const count = await runTaxAllowances({
        supabase, schoolId, userId, yearOfIncome: Number(taxYear), rows: taxRows,
      })
      await writeAudit(supabase, {
        schoolId, action: 'assets.tax_allowances_run',
        details: { year: Number(taxYear), assets: count },
      })
      setToast({ type: 'success', msg: count
        ? `Tax allowances saved for ${count} asset${count === 1 ? '' : 's'} (year ${taxYear}).`
        : 'No eligible assets (assign a KRA tax class first).' })
      load()
    } catch (e) {
      setToast({ type: 'error', msg: e.message })
    }
    setTaxRunning(false)
  }

  const exportTaxCSV = () => {
    const rows = [
      ['Asset ID', 'Asset Name', 'Category', 'Acquisition Date', 'Cost', 'Tax Class', 'Opening Tax WDV', 'W&T Rate', 'Wear & Tear', 'Investment Rate', 'Investment Allowance', 'Total Allowance', 'Closing Tax WDV'],
      ...filteredTaxRows.map((r) => [
        r.asset.asset_id, r.asset.name,
        categories.find((c) => c.id === r.asset.category_id)?.name || '',
        r.asset.purchase_date || '', r.asset.purchase_cost, r.asset.tax_class,
        r.opening_wtd, r.wear_tear_rate, r.wear_tear_allowance,
        r.investment_rate, r.investment_allowance, r.total_allowance, r.closing_wtd,
      ]),
    ]
    downloadFile(rows.map((x) => x.join(',')).join('\n'), `tax_allowances_${taxYear}.csv`, 'text/csv')
  }

  const exportReconCSV = () => {
    const rows = [
      ['Asset ID', 'Asset Name', 'Accounting NBV', 'Tax Written Down Value', 'Difference'],
      ...reconRows.map((r) => [r.asset.asset_id, r.asset.name, calcNbv(r.asset), r.taxWtd, r.difference]),
    ]
    downloadFile(rows.map((x) => x.join(',')).join('\n'), `tax_vs_accounting_${taxYear}.csv`, 'text/csv')
  }

  const exportRegisterCSV = () => {
    const rows = [
      ['Asset ID', 'Name', 'Serial No.', 'Category', 'Custodian', 'Location', 'Cost', 'Dep YTD', 'Accumulated Depn', 'NBV', 'Status'],
      ...filteredAssets.map((a) => [
        a.asset_id, a.name, a.serial_number || '',
        categories.find((c) => c.id === a.category_id)?.name || '',
        staffMap[a.custodian_id] || '', [a.building, a.room].filter(Boolean).join(', '),
        a.purchase_cost, deprYtd(a.id), a.accumulated_depreciation, calcNbv(a), a.status,
      ]),
    ]
    downloadFile(rows.map((r) => r.join(',')).join('\n'), 'asset_register.csv', 'text/csv')
  }

  const filteredAssets = assets.filter((a) => {
    const q = search.toLowerCase()
    const matchSearch = !q || a.name.toLowerCase().includes(q)
      || (a.asset_id || '').toLowerCase().includes(q)
      || (a.serial_number || '').toLowerCase().includes(q)
    const matchCat = !filterCat || a.category_id === filterCat
    const matchStatus = filterStatus === 'all' || a.status === filterStatus
    return matchSearch && matchCat && matchStatus
  })

  const activeAssets = assets.filter((a) => a.status !== 'disposed')
  const totalCost = activeAssets.reduce((s, a) => s + Number(a.purchase_cost || 0), 0)
  const totalDepn = activeAssets.reduce((s, a) => s + Number(a.accumulated_depreciation || 0), 0)
  const totalNbv = activeAssets.reduce((s, a) => s + calcNbv(a), 0)
  const activeCount = assets.filter((a) => a.status === 'active').length

  const selectedAsset = assets.find((a) => a.id === selectedAssetId) || null

  const statusBadge = (s) => {
    const meta = assetStatus(s)
    return <span className="as-status-badge" style={{ background: `${meta.color}1a`, color: meta.color }}>{meta.label}</span>
  }

  const tabs = [
    { key: 'register', label: 'Asset Register', icon: <Archive size={14} /> },
    { key: 'categories', label: 'Categories', icon: <FileText size={14} /> },
    { key: 'depreciation', label: 'Depreciation', icon: <TrendingDown size={14} /> },
    { key: 'tax', label: 'Tax & Capital Allowances', icon: <Landmark size={14} /> },
    { key: 'taxrules', label: 'Tax Rules', icon: <ShieldCheck size={14} /> },
    { key: 'maintenance', label: 'Maintenance', icon: <Wrench size={14} /> },
    { key: 'transfers', label: 'Transfers & Custody', icon: <User size={14} /> },
  ]

  if (loading) return <div className="loading-state">Loading assets...</div>

  const renderRegister = () => (
    <>
      <div className="as-kpi-row">
        <div className="as-kpi blue"><p className="as-kpi-label">Total Cost</p><p className="as-kpi-value">{fmt(totalCost)}</p></div>
        <div className="as-kpi amber"><p className="as-kpi-label">Accumulated Depreciation</p><p className="as-kpi-value">{fmt(totalDepn)}</p></div>
        <div className="as-kpi green"><p className="as-kpi-label">Net Book Value</p><p className="as-kpi-value">{fmt(totalNbv)}</p></div>
        <div className="as-kpi purple"><p className="as-kpi-label">Active Assets</p><p className="as-kpi-value">{activeCount}</p></div>
      </div>

      <div className="as-toolbar">
        <div className="as-search-wrap">
          <Search size={13} className="as-search-icon" />
          <input className="as-search-input" placeholder="Search name, ID, serial…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="as-select" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="as-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          {ASSET_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button className="as-btn-ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
        <button className="as-btn-outline" onClick={exportRegisterCSV}><Download size={14} /> Export</button>
        <button className="as-btn-primary" onClick={() => openAssetModal()}><Plus size={14} /> Acquire Asset</button>
      </div>

      <div className="as-table-card">
        <div className="as-table-head">
          <h3>Asset Register <span>· {filteredAssets.length} of {assets.length}</span></h3>
        </div>
        {filteredAssets.length === 0 ? (
          <p className="as-empty">No assets found. Acquire the first asset to build your register.</p>
        ) : (
          <div className="as-table-wrap">
            <table className="as-table">
              <thead>
                <tr>
                  <th>Asset ID</th>
                  <th>S/No.</th>
                  <th>Asset Name</th>
                  <th>Category</th>
                  <th>Custodian</th>
                  <th>Location</th>
                  <th className="num">Purchase Cost</th>
                  <th className="num">Dep. YTD</th>
                  <th className="num">Acc. Dep</th>
                  <th className="num">NBV</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((a) => (
                  <tr key={a.id}>
                    <td className="as-mono as-fw600">{a.asset_id}</td>
                    <td className="as-mono">{a.serial_number || '—'}</td>
                    <td>{a.name}</td>
                    <td>{categories.find((c) => c.id === a.category_id)?.name || '—'}</td>
                    <td>{staffMap[a.custodian_id] || <span className="as-muted">Unassigned</span>}</td>
                    <td className="as-muted">{[a.building, a.room].filter(Boolean).join(', ') || '—'}</td>
                    <td className="num">{fmt(a.purchase_cost)}</td>
                    <td className="num">{fmt(deprYtd(a.id))}</td>
                    <td className="num">{fmt(a.accumulated_depreciation)}</td>
                    <td className="num as-fw600 as-green">{fmt(calcNbv(a))}</td>
                    <td>{statusBadge(a.status)}</td>
                    <td className="as-actions-cell">
                      <button className="as-icon-btn" title="View" onClick={() => setSelectedAssetId(a.id)}><Eye size={14} /></button>
                      <button className="as-icon-btn" title="Edit" onClick={() => openAssetModal(a)}><Pencil size={14} /></button>
                      <button className="as-icon-btn" title="Assign / Transfer" onClick={() => openAssignModal(a)}><User size={14} /></button>
                      {a.status !== 'disposed' && (
                        <button className="as-icon-btn danger" title="Dispose" onClick={() => openDisposeModal(a)}><Trash2 size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )

  const renderCategories = () => (
    <>
      <div className="as-toolbar">
        <button className="as-btn-ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
        <button className="as-btn-primary" onClick={() => openCategoryModal()}><Plus size={14} /> Add Category</button>
      </div>
      <div className="as-table-card">
        <div className="as-table-head"><h3>Asset Categories <span>· depreciation policy</span></h3></div>
        {categories.length === 0 ? (
          <p className="as-empty">No categories yet. Create one to define the depreciation policy for a class of assets.</p>
        ) : (
          <div className="as-table-wrap">
            <table className="as-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Tax Class (KRA)</th>
                  <th>Method</th>
                  <th className="num">Useful Life</th>
                  <th className="num">Rate (p.a.)</th>
                  <th className="num">Residual</th>
                  <th>Dep. Expense Acct</th>
                  <th>Accum. Dep Acct</th>
                  <th>Assets</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td className="as-fw600">{c.name}</td>
                    <td>{kraTaxClass(c.tax_class)?.label || <span className="as-muted">Custom</span>}</td>
                    <td>{c.depreciation_method === 'straight_line' ? 'Straight-Line' : 'Reducing Balance'}</td>
                    <td className="num">{c.useful_life_months} mo</td>
                    <td className="num">{c.depreciation_rate || '—'}{c.first_year_allowance ? ` (+${c.first_year_allowance}% FYA)` : ''}</td>
                    <td className="num">{fmt(c.residual_value)}</td>
                    <td className="as-mono">{accountOptions.find((a) => a.id === c.expense_account_id)?.code || '—'}</td>
                    <td className="as-mono">{accountOptions.find((a) => a.id === c.accumulated_account_id)?.code || '—'}</td>
                    <td>{assets.filter((a) => a.category_id === c.id).length}</td>
                    <td className="as-actions-cell">
                      <button className="as-icon-btn" title="Edit" onClick={() => openCategoryModal(c)}><Pencil size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )

  const renderDepreciation = () => (
    <>
      <div className="as-toolbar">
        <button className="as-btn-ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
        <button className="as-btn-primary" onClick={() => openDeprModal()}><TrendingDown size={14} /> Run Depreciation</button>
      </div>
      <div className="as-table-card">
        <div className="as-table-head"><h3>Depreciation Runs <span>· posted to General Ledger</span></h3></div>
        {runs.length === 0 ? (
          <p className="as-empty">No depreciation has been run yet. Run depreciation to post it to the General Ledger.</p>
        ) : (
          <div className="as-table-wrap">
            <table className="as-table">
              <thead>
                <tr><th>Period</th><th>Run Date</th><th>Assets</th><th className="num">Total</th><th>Journal Entry</th><th>Run By</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const count = runLines.filter((l) => l.run_id === r.id).length
                  return (
                    <tr key={r.id}>
                      <td className="as-fw600">{r.period_label}</td>
                      <td>{fmtDate(r.run_date)}</td>
                      <td>{count}</td>
                      <td className="num as-fw600">{fmt(r.total_depreciation)}</td>
                      <td className="as-mono">{r.journal_entries?.entry_no || <span className="as-muted">Pending</span>}</td>
                      <td>{staffMap[r.created_by] || '—'}</td>
                      <td className="as-actions-cell">
                        {r.journal_entry_id ? (
                          <button className="as-icon-btn" title="Journal entry report" onClick={() => openRunView(r)}><FileText size={14} /></button>
                        ) : (
                          <button className="as-icon-btn" title="Complete posting" onClick={() => completeOrphanRun(r)}><CheckCircle2 size={14} /></button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )

  const renderTax = () => (
    <>
      <div className="as-kpi-row">
        <div className="as-kpi blue"><p className="as-kpi-label">Accounting NBV ({taxYear})</p><p className="as-kpi-value">{fmt(reconRows.reduce((s, r) => s + r.accountingNbv, 0))}</p></div>
        <div className="as-kpi purple"><p className="as-kpi-label">Tax Written Down Value ({taxYear})</p><p className="as-kpi-value">{fmt(reconRows.reduce((s, r) => s + r.taxWtd, 0))}</p></div>
        <div className="as-kpi amber"><p className="as-kpi-label">Wear & Tear + Investment</p><p className="as-kpi-value">{fmt(filteredTaxRows.reduce((s, r) => s + r.total_allowance, 0))}</p></div>
        <div className="as-kpi green"><p className="as-kpi-label">Tax Schedule Rows</p><p className="as-kpi-value">{taxSchedules.filter((s) => s.year_of_income === Number(taxYear)).length}</p></div>
      </div>

      <div className="as-tax-banner">
        <Landmark size={16} />
        <div>
          <strong>Tax capital allowances are NOT posted to the General Ledger.</strong>
          <p>Accounting depreciation (Dr Depreciation Expense / Cr Accumulated Depreciation) is separate and unchanged. This schedule is a tax-computation item based on the applicable statutory rules for the selected year of income.</p>
        </div>
      </div>

      <div className="as-toolbar">
        <select className="as-select" value={taxYear} onChange={(e) => setTaxYear(e.target.value)}>
          {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1, new Date().getFullYear() + 2].map((y) => (
            <option key={y} value={y}>Year of Income {y}</option>
          ))}
        </select>
        <select className="as-select" value={taxFilterCat} onChange={(e) => setTaxFilterCat(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="as-select" value={taxFilterClass} onChange={(e) => setTaxFilterClass(e.target.value)}>
          <option value="">All Tax Classes</option>
          {[...new Set(taxRows.map((r) => r.asset.tax_class).filter(Boolean))].map((c) => (
            <option key={c} value={c}>{taxRuleLabel(taxRules, c, 'wear_tear')}</option>
          ))}
        </select>
        <select className="as-select" value={taxFilterDept} onChange={(e) => setTaxFilterDept(e.target.value)}>
          <option value="">All Departments</option>
          {[...new Set(assets.map((a) => a.department).filter(Boolean))].map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="as-select" value={taxFilterLoc} onChange={(e) => setTaxFilterLoc(e.target.value)}>
          <option value="">All Locations</option>
          {[...new Set(assets.map((a) => a.building).filter(Boolean))].map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <button className="as-btn-ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
        <button className="as-btn-outline" onClick={exportTaxCSV}><Download size={14} /> Export</button>
        <button className="as-btn-primary" disabled={!isFinanceRole || taxRunning} onClick={handleRunTaxAllowances}>
          {taxRunning ? 'Saving…' : <><TrendingDown size={14} /> Run Tax Allowances ({taxYear})</>}
        </button>
      </div>

      <div className="as-table-card">
        <div className="as-table-head"><h3>Tax Capital Allowance Schedule <span>· year of income {taxYear} · {filteredTaxRows.length} assets</span></h3></div>
        {filteredTaxRows.length === 0 ? (
          <p className="as-empty">No assets with a KRA tax class for this year. Assign a Kenyan tax classification to an asset first.</p>
        ) : (
          <div className="as-table-wrap">
            <table className="as-table">
              <thead>
                <tr>
                  <th>Asset</th><th>Category</th><th>Tax Class</th>
                  <th className="num">Cost</th>
                  <th className="num">Opening WDV</th>
                  <th className="num">W&amp;T Rate</th>
                  <th className="num">Wear &amp; Tear</th>
                  <th className="num">Inv. Rate</th>
                  <th className="num">Investment</th>
                  <th className="num">Total Allowance</th>
                  <th className="num">Closing WDV</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {filteredTaxRows.map((r) => (
                  <tr key={r.asset.id}>
                    <td className="as-fw600">{r.asset.name} <span className="as-muted as-mono">{r.asset.asset_id}</span></td>
                    <td>{categories.find((c) => c.id === r.asset.category_id)?.name || '—'}</td>
                    <td>{taxRuleLabel(taxRules, r.asset.tax_class, 'wear_tear')}</td>
                    <td className="num">{fmt(r.tax_basis)}</td>
                    <td className="num">{fmt(r.opening_wtd)}</td>
                    <td className="num">{r.wear_tear_rate || '—'}{r.wear_tear_rate ? '%' : ''}</td>
                    <td className="num">{fmt(r.wear_tear_allowance)}</td>
                    <td className="num">{r.investment_rate || '—'}{r.investment_rate ? '%' : ''}</td>
                    <td className="num">{fmt(r.investment_allowance)}</td>
                    <td className="num as-fw600">{fmt(r.total_allowance)}</td>
                    <td className="num as-fw600 as-green">{fmt(r.closing_wtd)}</td>
                    <td>{r.persisted
                      ? <span className="as-status-badge" style={{ background: '#16a34a1a', color: '#16a34a' }}>Saved</span>
                      : <span className="as-muted">Preview</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="as-fw600">Total</td>
                  <td className="num as-fw600">{fmt(filteredTaxRows.reduce((s, r) => s + r.opening_wtd, 0))}</td>
                  <td />
                  <td className="num as-fw600">{fmt(filteredTaxRows.reduce((s, r) => s + r.wear_tear_allowance, 0))}</td>
                  <td />
                  <td className="num as-fw600">{fmt(filteredTaxRows.reduce((s, r) => s + r.investment_allowance, 0))}</td>
                  <td className="num as-fw600">{fmt(filteredTaxRows.reduce((s, r) => s + r.total_allowance, 0))}</td>
                  <td className="num as-fw600 as-green">{fmt(filteredTaxRows.reduce((s, r) => s + r.closing_wtd, 0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="as-table-card">
        <div className="as-table-head">
          <h3>Asset Tax vs Accounting Reconciliation <span>· {taxYear}</span></h3>
          <button className="as-btn-outline" onClick={exportReconCSV}><Download size={14} /> Export</button>
        </div>
        <p className="as-tax-note">Accounting NBV and Tax WDV are legitimately different — accounting follows the depreciation policy, tax follows the statutory capital-allowance rules.</p>
        {reconRows.length === 0 ? (
          <p className="as-empty">Nothing to reconcile for this year.</p>
        ) : (
          <div className="as-table-wrap">
            <table className="as-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="num">Accounting NBV</th>
                  <th className="num">Tax Written Down Value</th>
                  <th className="num">Difference</th>
                </tr>
              </thead>
              <tbody>
                {reconRows.map((r) => (
                  <tr key={r.asset.id}>
                    <td className="as-fw600">{r.asset.name} <span className="as-muted as-mono">{r.asset.asset_id}</span></td>
                    <td className="num">{fmt(r.accountingNbv)}</td>
                    <td className="num">{fmt(r.taxWtd)}</td>
                    <td className={`num as-fw600 ${r.difference > 0 ? 'as-green' : 'as-red'}`}>{fmt(r.difference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )

  const renderTaxRules = () => (
    <>
      <div className="as-toolbar">
        <button className="as-btn-ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
        {isFinanceRole && (
          <button className="as-btn-primary" onClick={() => openTaxRuleModal()}><Plus size={14} /> Add Tax Rule</button>
        )}
      </div>
      <div className="as-table-card">
        <div className="as-table-head">
          <h3>Statutory Tax Rules <span>· effective-date based · configurable</span></h3>
        </div>
        <p className="as-tax-note">
          Kenyan statutory tax rates change when the Income Tax Act, Finance Act or KRA guidance is amended.
          These rules are editable by authorised finance users and are versioned by effective date — a new rule only
          applies from its effective date; previously computed tax schedules keep the rule version they used.
        </p>
        {taxRules.length === 0 ? (
          <p className="as-empty">No tax rules yet. The system seeds the default statutory classes on first load.</p>
        ) : (
          <div className="as-table-wrap">
            <table className="as-table">
              <thead>
                <tr>
                  <th>Type</th><th>Class</th><th>Classification</th>
                  <th className="num">Rate (p.a.)</th><th className="num">1st Year</th><th>Method</th>
                  <th>Effective</th><th>Expiry</th><th>Source</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {taxRules.map((r) => (
                  <tr key={r.id}>
                    <td>{TAX_RULE_TYPES.find((t) => t.value === r.rule_type)?.label || r.rule_type}</td>
                    <td className="as-mono as-fw600">{r.tax_class}</td>
                    <td className="as-desc">{r.description || r.asset_classification || '—'}</td>
                    <td className="num">{r.rate}{r.rate ? '%' : ''}</td>
                    <td className="num">{r.first_year_rate ? `${r.first_year_rate}%` : '—'}</td>
                    <td>{taxMethodLabel(r.calc_method)}</td>
                    <td>{fmtDate(r.effective_date)}</td>
                    <td>{r.expiry_date ? fmtDate(r.expiry_date) : <span className="as-muted">Open-ended</span>}</td>
                    <td className="as-muted as-desc">{r.source_reference || '—'}</td>
                    <td>
                      <span className={`as-status-badge ${r.is_active ? '' : 'as-status-off'}`} style={{ background: r.is_active ? '#16a34a1a' : '#64748b1a', color: r.is_active ? '#16a34a' : '#64748b' }}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="as-actions-cell">
                      {isFinanceRole && (
                        <>
                          <button className="as-icon-btn" title="Edit" onClick={() => openTaxRuleModal(r)}><Pencil size={14} /></button>
                          <button className="as-icon-btn" title={r.is_active ? 'Deactivate' : 'Activate'} onClick={() => toggleTaxRule(r)}><Power size={14} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )

  const renderMaintenance = () => (
    <>
      <div className="as-toolbar">
        <button className="as-btn-ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
        <button className="as-btn-primary" onClick={() => openMaintModal()}><Plus size={14} /> Add Maintenance</button>
      </div>
      <div className="as-table-card">
        <div className="as-table-head"><h3>Maintenance Records <span>· {maintenance.length}</span></h3></div>
        {maintenance.length === 0 ? (
          <p className="as-empty">No maintenance records yet.</p>
        ) : (
          <div className="as-table-wrap">
            <table className="as-table">
              <thead>
                <tr><th>Asset</th><th>Date</th><th>Type</th><th>Description</th><th>Provider</th><th className="num">Cost</th><th>Status</th><th>Next Service</th></tr>
              </thead>
              <tbody>
                {maintenance.map((m) => {
                  const a = assets.find((x) => x.id === m.asset_id)
                  return (
                    <tr key={m.id}>
                      <td className="as-fw600">{a?.name || '—'} <span className="as-muted as-mono">{a?.asset_id}</span></td>
                      <td>{fmtDate(m.maintenance_date)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{m.maintenance_type}</td>
                      <td className="as-desc">{m.description || '—'}</td>
                      <td>{m.service_provider || '—'}</td>
                      <td className="num">{fmt(m.cost)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{m.status}</td>
                      <td>{m.next_service_date ? fmtDate(m.next_service_date) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )

  const renderTransfers = () => (
    <>
      <div className="as-table-card">
        <div className="as-table-head">
          <h3>Custody History <span>· assign or transfer assets between staff</span></h3>
          <button className="as-btn-primary" onClick={() => openAssignModal(null)}><User size={14} /> Assign / Transfer</button>
        </div>
        {custody.length === 0 ? (
          <p className="as-empty">No custody movements yet.</p>
        ) : (
          <div className="as-table-wrap">
            <table className="as-table">
              <thead>
                <tr><th>Asset</th><th>Custodian</th><th>From</th><th>To</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {custody.map((c) => {
                  const a = assets.find((x) => x.id === c.asset_id)
                  return (
                    <tr key={c.id}>
                      <td>{a?.name || '—'} <span className="as-muted as-mono">{a?.asset_id}</span></td>
                      <td>{c.profiles?.full_name || '—'}</td>
                      <td>{fmtDate(c.from_date)}</td>
                      <td>{c.to_date ? fmtDate(c.to_date) : <span className="as-green">Current</span>}</td>
                      <td className="as-muted">{c.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )

  const renderModals = () => (
    <>
      {catModal && (
        <div className="as-modal-overlay">
          <div className="as-modal as-modal-sm">
            <div className="as-modal-head">
              <h3>{catForm.id ? 'Edit' : 'New'} Category</h3>
              <button className="as-icon-btn" onClick={() => setCatModal(false)}><X size={16} /></button>
            </div>
            <div className="as-modal-body">
              <label className="as-label">Name *</label>
              <input className="as-input" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="e.g. Furniture & Fixtures" />
              <label className="as-label">Kenyan Tax Classification (KRA)</label>
              <select className="as-select" value={catForm.tax_class} onChange={(e) => setCatForm({ ...catForm, tax_class: e.target.value })}>
                <option value="">No default tax class</option>
                {taxRules.filter((r) => r.rule_type === 'wear_tear').map((r) => (
                  <option key={r.id} value={r.tax_class}>{r.description || r.tax_class} — {r.rate}% p.a.</option>
                ))}
              </select>
              <p className="as-tax-note">
                Pre-fills the KRA tax class for NEW assets in this category only. It does NOT change accounting
                depreciation — the depreciation policy below is independent.
              </p>
              <label className="as-label">Depreciation Method <span className="as-muted">(accounting)</span></label>
              <select className="as-select" value={catForm.depreciation_method} onChange={(e) => setCatForm({ ...catForm, depreciation_method: e.target.value })}>
                <option value="straight_line">Straight-Line</option>
                <option value="reducing_balance">Reducing Balance</option>
              </select>
              <div className="as-grid-2">
                <div>
                  <label className="as-label">Useful Life (months)</label>
                  <input className="as-input" type="number" min="1" value={catForm.useful_life_months} onChange={(e) => setCatForm({ ...catForm, useful_life_months: e.target.value })} />
                </div>
                <div>
                  <label className="as-label">Residual Value</label>
                  <input className="as-input" type="number" min="0" value={catForm.residual_value} onChange={(e) => setCatForm({ ...catForm, residual_value: e.target.value })} />
                </div>
              </div>
              <label className="as-label">Depreciation Rate % p.a. <span className="as-muted">(accounting)</span></label>
              <input className="as-input" type="number" step="0.01" min="0" max="100" value={catForm.depreciation_rate} onChange={(e) => setCatForm({ ...catForm, depreciation_rate: e.target.value })} placeholder="Leave blank to auto-calculate" />
              <div className="as-grid-2 as-cat-accounts">
                <div>
                  <label className="as-label">Depreciation Expense Account</label>
                  <AccountSelect
                    value={catForm.expense_account_id}
                    onChange={(id) => setCatForm({ ...catForm, expense_account_id: id })}
                    options={accountOptions.filter((a) => a.type === 'expense' && (a.category === 'Depreciation' || /^60\d0$/.test(a.code)))}
                  />
                </div>
                <div>
                  <label className="as-label">Accumulated Depreciation Account</label>
                  <AccountSelect
                    value={catForm.accumulated_account_id}
                    onChange={(id) => setCatForm({ ...catForm, accumulated_account_id: id })}
                    options={accountOptions.filter((a) => a.type === 'asset' && (a.category === 'Accumulated Depreciation' || /^17\d{2}$/.test(a.code)))}
                  />
                </div>
              </div>
              <p className="as-tax-note">
                One GL pair per asset class. Each Depreciation Run debits the class's
                Depreciation Expense account and credits its Accumulated Depreciation
                account — the asset cost account is never credited. If either is missing
                the run is blocked until you set it.
              </p>
            </div>
            <div className="as-modal-foot">
              <button className="as-btn-outline" onClick={() => setCatModal(false)}>Cancel</button>
              <button className="as-btn-primary" disabled={saving} onClick={saveCategory}>{saving ? 'Saving…' : 'Save Category'}</button>
            </div>
          </div>
        </div>
      )}

      {assetModal && (
        <div className="as-modal-overlay">
          <div className="as-modal as-modal-lg">
            <div className="as-modal-head">
              <h3>{assetForm.id ? 'Edit' : 'Acquire'} Asset</h3>
              <button className="as-icon-btn" onClick={() => setAssetModal(false)}><X size={16} /></button>
            </div>
            <div className="as-modal-body">
              <div className="as-grid-2">
                <div>
                  <label className="as-label">Name *</label>
                  <input className="as-input" value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} />
                </div>
                <div>
                  <label className="as-label">Serial Number</label>
                  <input className="as-input" value={assetForm.serial_number} onChange={(e) => setAssetForm({ ...assetForm, serial_number: e.target.value })} />
                </div>
                <div>
                  <label className="as-label">Category *</label>
                  <select className="as-select" value={assetForm.category_id} onChange={(e) => {
                    const cat = categories.find((c) => c.id === e.target.value)
                    setAssetForm((f) => assetModal.isNew ? {
                      ...f, category_id: e.target.value,
                      // Accounting policy comes from the category; KRA tax class
                      // is only a default for the tax schedule, never a driver
                      // of accounting depreciation.
                      depreciation_method: cat?.depreciation_method || f.depreciation_method,
                      useful_life_months: cat?.useful_life_months ?? f.useful_life_months,
                      residual_value: cat?.residual_value ?? f.residual_value,
                      depreciation_rate: cat?.depreciation_rate ?? f.depreciation_rate,
                      tax_class: cat?.tax_class || f.tax_class,
                    } : { ...f, category_id: e.target.value })
                  }}>
                    <option value="">Select category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="as-label">Supplier</label>
                  <div className="as-select-row">
                    <select className="as-select" value={assetForm.supplier_id} onChange={(e) => setAssetForm({ ...assetForm, supplier_id: e.target.value })}>
                      <option value="">Select supplier</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button type="button" className="as-select-add" title="Add supplier" aria-label="Add supplier" aria-expanded={showQuickSupplier} onClick={() => { setShowQuickSupplier(!showQuickSupplier); if (!showQuickSupplier) setQuickSupplier({ name: '', phone: '', email: '', kra_pin: '' }) }}>
                      <Plus size={15} />
                    </button>
                  </div>
                  {showQuickSupplier && (
                    <div className="as-quick-supplier">
                      <input className="as-input" placeholder="Supplier name *" value={quickSupplier.name} onChange={(e) => setQuickSupplier({ ...quickSupplier, name: e.target.value })} />
                      <div className="as-grid-2">
                        <input className="as-input" placeholder="Phone" value={quickSupplier.phone} onChange={(e) => setQuickSupplier({ ...quickSupplier, phone: e.target.value })} />
                        <input className="as-input" placeholder="KRA PIN" value={quickSupplier.kra_pin} onChange={(e) => setQuickSupplier({ ...quickSupplier, kra_pin: e.target.value })} />
                      </div>
                      <input className="as-input" placeholder="Email" value={quickSupplier.email} onChange={(e) => setQuickSupplier({ ...quickSupplier, email: e.target.value })} />
                      <div className="as-quick-supplier-foot">
                        <button className="as-btn-primary" disabled={saving} onClick={saveQuickSupplier}>{saving ? 'Saving…' : 'Save Supplier'}</button>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="as-label">Purchase Date *</label>
                  <input className="as-input" type="date" value={assetForm.purchase_date} onChange={(e) => setAssetForm({ ...assetForm, purchase_date: e.target.value })} />
                </div>
                <div>
                  <label className="as-label">Purchase Cost *</label>
                  <input className="as-input" type="number" min="0" step="0.01" value={assetForm.purchase_cost} onChange={(e) => setAssetForm({ ...assetForm, purchase_cost: e.target.value })} />
                </div>
                <div>
                  <label className="as-label">Custodian</label>
                  <select className="as-select" value={assetForm.custodian_id} onChange={(e) => setAssetForm({ ...assetForm, custodian_id: e.target.value })}>
                    <option value="">Assign later</option>
                    {Object.entries(staffMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="as-label">Location (Building)</label>
                  <input className="as-input" value={assetForm.building} onChange={(e) => setAssetForm({ ...assetForm, building: e.target.value })} />
                </div>
                <div>
                  <label className="as-label">Room</label>
                  <input className="as-input" value={assetForm.room} onChange={(e) => setAssetForm({ ...assetForm, room: e.target.value })} />
                </div>
                <div>
                  <label className="as-label">Status</label>
                  <select className="as-select" value={assetForm.status} onChange={(e) => setAssetForm({ ...assetForm, status: e.target.value })}>
                    {ASSET_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              {assetModal.isNew && (
                <div className="as-acq-block">
                  <label className="as-label">Acquisition Source</label>
                  <select className="as-select" value={assetForm.acquisition_source} onChange={(e) => setAssetForm((f) => ({ ...f, acquisition_source: e.target.value, invoice_mode: 'create', existing_invoice_id: '', payment_account_id: '', payment_amount: '' }))}>
                    <option value="supplier">Supplier Purchase</option>
                    <option value="cash">Cash Purchase</option>
                    <option value="bank">Bank Purchase</option>
                    <option value="donation">Donation</option>
                    <option value="transfer">Transfer</option>
                    <option value="other">Other</option>
                  </select>

                  {assetForm.acquisition_source === 'supplier' ? (
                    <>
                      <div className="as-grid-2">
                        <div>
                          <label className="as-label">Invoice</label>
                          <select className="as-select" value={assetForm.invoice_mode} onChange={(e) => setAssetForm({ ...assetForm, invoice_mode: e.target.value, existing_invoice_id: '' })}>
                            <option value="create">Create a new invoice</option>
                            <option value="existing">Use an existing invoice</option>
                          </select>
                        </div>
                        <div>
                          <label className="as-label">Payment Status</label>
                          <select className="as-select" value={assetForm.payment_status} onChange={(e) => setAssetForm({ ...assetForm, payment_status: e.target.value, payment_account_id: '', payment_amount: e.target.value === 'unpaid' ? '' : assetForm.payment_amount })}>
                            <option value="unpaid">Unpaid</option>
                            <option value="partially_paid">Partially Paid</option>
                            <option value="fully_paid">Fully Paid</option>
                          </select>
                        </div>
                      </div>

                      {assetForm.invoice_mode === 'existing' ? (
                        <div>
                          <label className="as-label">Link to AP Invoice</label>
                          {(() => {
                            const supplierInvoices = apInvoices.filter((i) => i.supplier_id === assetForm.supplier_id)
                            if (!supplierInvoices.length) {
                              return <p className="as-tax-note">No invoices for this supplier yet — choose “Create a new invoice”.</p>
                            }
                            return (
                              <select className="as-select" value={assetForm.existing_invoice_id} onChange={(e) => setAssetForm({ ...assetForm, existing_invoice_id: e.target.value })}>
                                <option value="">Select invoice…</option>
                                {supplierInvoices.map((i) => (
                                  <option key={i.id} value={i.id}>
                                    {i.invoice_no} — {fmtDate(i.invoice_date)} — {fmt(i.total_amount)}
                                    {['cancelled', 'rejected'].includes(i.status) ? ` (${i.status})` : ''}
                                  </option>
                                ))}
                              </select>
                            )
                          })()}
                          <p className="as-tax-note">The asset links to this invoice — no new invoice is created. Payment for it is handled in Accounts Payable.</p>
                        </div>
                      ) : (
                        <>
                          <div>
                            <label className="as-label">Supplier Invoice Ref <span className="as-muted">(their invoice no.)</span></label>
                            <input className="as-input" placeholder="e.g. INV-00452" value={assetForm.purchase_invoice_ref} onChange={(e) => setAssetForm({ ...assetForm, purchase_invoice_ref: e.target.value })} />
                          </div>
                          {assetForm.payment_status !== 'unpaid' && (
                            <>
                              <div className="as-grid-2">
                                <div>
                                  <label className="as-label">Payment Account</label>
                                  <select className="as-select" value={assetForm.payment_account_id} onChange={(e) => setAssetForm({ ...assetForm, payment_account_id: e.target.value })}>
                                    <option value="">Select account…</option>
                                    {accountOptions.filter((a) => a.type === 'asset' && ['1010', '1020', '1030', '1040'].includes(a.code)).map((a) => (
                                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="as-label">Amount Paid {assetForm.payment_status === 'fully_paid' && <span className="as-muted">(full)</span>}</label>
                                  <input className="as-input" type="number" min="0" step="0.01"
                                    value={assetForm.payment_status === 'fully_paid' ? assetForm.purchase_cost : assetForm.payment_amount}
                                    disabled={assetForm.payment_status === 'fully_paid'}
                                    onChange={(e) => setAssetForm({ ...assetForm, payment_amount: e.target.value })}
                                    placeholder={fmt(assetForm.purchase_cost || 0)} />
                                </div>
                              </div>
                              <p className="as-tax-note">{assetForm.payment_status === 'fully_paid'
                                ? 'Payment equals the invoice total. A payment draft will be created and posted to the General Ledger only after it is approved in Accounts Payable.'
                                : 'A payment draft for this amount will be created against the new invoice and posted to the General Ledger only after it is approved in Accounts Payable.'}</p>
                            </>
                          )}
                          <p className="as-tax-note">An AP invoice draft will be created from the selected supplier for {fmt(assetForm.purchase_cost || 0)}. It will appear under Accounts Payable → Invoices for review, posting and payment. VAT is treated as 0% (asset purchases are typically not subject to input VAT recovery).</p>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="as-label">Invoice / Reference No. <span className="as-muted">(optional)</span></label>
                        <input className="as-input" placeholder="e.g. INV-00452" value={assetForm.purchase_invoice_ref} onChange={(e) => setAssetForm({ ...assetForm, purchase_invoice_ref: e.target.value })} />
                      </div>
                      {(assetForm.acquisition_source === 'cash' || assetForm.acquisition_source === 'bank') ? (
                        <>
                          <div>
                            <label className="as-label">Bank / Cash Account *</label>
                            <select className="as-select" value={assetForm.gl_cash_account_id} onChange={(e) => setAssetForm({ ...assetForm, gl_cash_account_id: e.target.value })}>
                              <option value="">Select account…</option>
                              {accountOptions.filter((a) => a.type === 'asset' && ['1010', '1020', '1030', '1040'].includes(a.code)).map((a) => (
                                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                              ))}
                            </select>
                          </div>
                          <p className="as-tax-note">No AP invoice is created. The acquisition posts straight to the General Ledger: Dr Fixed Asset / Cr {assetForm.gl_cash_account_id ? accountOptions.find((a) => a.id === assetForm.gl_cash_account_id)?.name : 'Bank / Cash account'}.</p>
                        </>
                      ) : assetForm.acquisition_source === 'donation' ? (
                        <>
                          <div>
                            <label className="as-label">Donation / Grant / Income Account *</label>
                            <select className="as-select" value={assetForm.gl_donation_account_id} onChange={(e) => setAssetForm({ ...assetForm, gl_donation_account_id: e.target.value })}>
                              <option value="">Select account…</option>
                              {accountOptions.filter((a) => a.type === 'income').map((a) => (
                                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                              ))}
                            </select>
                          </div>
                          <p className="as-tax-note">No AP invoice is created. The donation posts straight to the General Ledger: Dr Fixed Asset / Cr {assetForm.gl_donation_account_id ? accountOptions.find((a) => a.id === assetForm.gl_donation_account_id)?.name : 'Donation / Grant / Income account'} per the school's accounting policy.</p>
                        </>
                      ) : (
                        <p className="as-tax-note">{assetForm.acquisition_source === 'transfer'
                          ? 'Transferred assets do not create an AP invoice or a GL entry — they are recorded in the register with the transfer reference.'
                          : 'No AP invoice or GL entry will be created for this acquisition. Enter the reference for record-keeping only.'}</p>
                      )}
                    </>
                  )}
                </div>
              )}
              {(() => {
                const pc = categories.find((c) => c.id === assetForm.category_id)
                if (!pc) return null
                return (
                  <p className="as-policy-hint">
                    Category policy: {pc.depreciation_method === 'straight_line' ? 'Straight-Line' : 'Reducing Balance'}
                    {pc.depreciation_rate ? ` @ ${pc.depreciation_rate}% p.a.` : ''}
                    {' · '}{pc.useful_life_months} months · residual {fmt(pc.residual_value)}.
                    These prefill the accounting fields below and are independent of the KRA tax class.
                  </p>
                )
              })()}

              <div className="as-tax-section-title"><span className="as-tax-section-label">FINANCIAL ACCOUNTING</span> <span className="as-muted">posts to the General Ledger</span></div>
              <div className="as-grid-2">
                <div>
                  <label className="as-label">Depreciation Method <span className="as-muted">(accounting)</span></label>
                  <select className="as-select" value={assetForm.depreciation_method} onChange={(e) => setAssetForm({ ...assetForm, depreciation_method: e.target.value })}>
                    <option value="straight_line">Straight-Line</option>
                    <option value="reducing_balance">Reducing Balance</option>
                  </select>
                </div>
                <div>
                  <label className="as-label">Useful Life (months)</label>
                  <input className="as-input" type="number" min="1" value={assetForm.useful_life_months} onChange={(e) => setAssetForm({ ...assetForm, useful_life_months: e.target.value })} />
                </div>
                <div>
                  <label className="as-label">Residual Value</label>
                  <input className="as-input" type="number" min="0" step="0.01" value={assetForm.residual_value} onChange={(e) => setAssetForm({ ...assetForm, residual_value: e.target.value })} />
                </div>
                <div>
                  <label className="as-label">Depreciation Rate % p.a. <span className="as-muted">(reducing balance)</span></label>
                  <input className="as-input" type="number" step="0.01" min="0" max="100" value={assetForm.depreciation_rate} onChange={(e) => setAssetForm({ ...assetForm, depreciation_rate: e.target.value })} placeholder="Auto if blank" />
                </div>
              </div>
              <p className="as-tax-note">
                The accounting policy is independent of tax. KRA tax class never overrides method, rate,
                useful life or residual value.
              </p>

              <div className="as-tax-section-title"><span className="as-tax-section-label">KENYAN TAX CLASSIFICATION</span> <span className="as-muted">tax capital allowances only · never posted to the GL</span></div>
              <div className="as-grid-2">
                <div>
                  <label className="as-label">KRA Tax Class <span className="as-muted">(wear &amp; tear)</span></label>
                  <select className="as-select" value={assetForm.tax_class} onChange={(e) => setAssetForm({ ...assetForm, tax_class: e.target.value })}>
                    <option value="">No wear &amp; tear class</option>
                    {taxRules.filter((r) => r.rule_type === 'wear_tear').map((r) => (
                      <option key={r.id} value={r.tax_class}>{r.description || r.tax_class} — {r.rate}% p.a.</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="as-label">Investment Allowance <span className="as-muted">(optional)</span></label>
                  <select className="as-select" value={assetForm.investment_class} onChange={(e) => setAssetForm({ ...assetForm, investment_class: e.target.value })}>
                    <option value="">None</option>
                    {taxRules.filter((r) => r.rule_type === 'investment').map((r) => (
                      <option key={r.id} value={r.tax_class}>{r.description || r.tax_class}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="as-modal-foot">
              <button className="as-btn-outline" onClick={() => setAssetModal(false)}>Cancel</button>
              <button className="as-btn-primary" disabled={saving} onClick={saveAsset}>{saving ? 'Saving…' : assetForm.id ? 'Save Changes' : 'Acquire Asset'}</button>
            </div>
          </div>
        </div>
      )}

      {disposeModal && (
        <div className="as-modal-overlay">
          <div className="as-modal as-modal-sm">
            <div className="as-modal-head">
              <h3>Dispose Asset</h3>
              <button className="as-icon-btn" onClick={() => setDisposeModal(false)}><X size={16} /></button>
            </div>
            <div className="as-modal-body">
              <p><strong>{disposeModal?.name}</strong></p>
              <p className="as-muted">Book value: {fmt(calcNbv(disposeModal))}</p>
              <label className="as-label">Disposal Date *</label>
              <input className="as-input" type="date" value={disposeForm.disposal_date} onChange={(e) => setDisposeForm({ ...disposeForm, disposal_date: e.target.value })} />
              <label className="as-label">Proceeds</label>
              <input className="as-input" type="number" min="0" step="0.01" value={disposeForm.disposal_amount} onChange={(e) => setDisposeForm({ ...disposeForm, disposal_amount: e.target.value })} />
              {Number(disposeForm.disposal_amount) > 0 && (
                <>
                  <label className="as-label">Proceeds Bank / Cash Account *</label>
                  <select className="as-select" value={disposeForm.gl_cash_account_id} onChange={(e) => setDisposeForm({ ...disposeForm, gl_cash_account_id: e.target.value })}>
                    <option value="">Select account…</option>
                    {accountOptions.filter((a) => a.type === 'asset' && ['1010', '1020', '1030', '1040'].includes(a.code)).map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </>
              )}
              <label className="as-label">Reason / Notes *</label>
              <textarea className="as-input" rows="3" value={disposeForm.disposal_reason} onChange={(e) => setDisposeForm({ ...disposeForm, disposal_reason: e.target.value })} />
            </div>
            <div className="as-modal-foot">
              <button className="as-btn-outline" onClick={() => setDisposeModal(false)}>Cancel</button>
              <button className="as-btn-danger" disabled={saving} onClick={saveDispose}>{saving ? 'Posting…' : 'Dispose Asset'}</button>
            </div>
          </div>
        </div>
      )}

      {assignModal && (
        <div className="as-modal-overlay">
          <div className="as-modal as-modal-sm">
            <div className="as-modal-head">
              <h3>Assign / Transfer Asset</h3>
              <button className="as-icon-btn" onClick={() => setAssignModal(false)}><X size={16} /></button>
            </div>
            <div className="as-modal-body">
              {assignModal ? (
                <p className="as-muted">Transferring <strong>{assignModal.name}</strong> <span className="as-mono">({assignModal.asset_id})</span></p>
              ) : (
                <>
                  <label className="as-label">Asset *</label>
                  <select className="as-select" value={assignForm.asset_id} onChange={(e) => setAssignForm({ ...assignForm, asset_id: e.target.value })}>
                    <option value="">Select asset</option>
                    {activeAssets.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.asset_id}</option>)}
                  </select>
                </>
              )}
              <label className="as-label">Custodian *</label>
              <select className="as-select" value={assignForm.custodian_id} onChange={(e) => setAssignForm({ ...assignForm, custodian_id: e.target.value })}>
                <option value="">Select staff member</option>
                {Object.entries(staffMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <label className="as-label">From Date *</label>
              <input className="as-input" type="date" value={assignForm.from_date} onChange={(e) => setAssignForm({ ...assignForm, from_date: e.target.value })} />
              <label className="as-label">Notes</label>
              <textarea className="as-input" rows="2" value={assignForm.notes} onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })} placeholder="e.g. handed over keys" />
            </div>
            <div className="as-modal-foot">
              <button className="as-btn-outline" onClick={() => setAssignModal(false)}>Cancel</button>
              <button className="as-btn-primary" disabled={saving} onClick={saveAssign}>{saving ? 'Saving…' : 'Assign Asset'}</button>
            </div>
          </div>
        </div>
      )}

      {maintModal && (
        <div className="as-modal-overlay">
          <div className="as-modal as-modal-sm">
            <div className="as-modal-head">
              <h3>Maintenance Record</h3>
              <button className="as-icon-btn" onClick={() => setMaintModal(false)}><X size={16} /></button>
            </div>
            <div className="as-modal-body">
              <label className="as-label">Asset *</label>
              <select className="as-select" value={maintForm.asset_id} onChange={(e) => setMaintForm({ ...maintForm, asset_id: e.target.value })}>
                <option value="">Select asset</option>
                {activeAssets.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.asset_id}</option>)}
              </select>
              <div className="as-grid-2">
                <div>
                  <label className="as-label">Maintenance Date</label>
                  <input className="as-input" type="date" value={maintForm.maintenance_date} onChange={(e) => setMaintForm({ ...maintForm, maintenance_date: e.target.value })} />
                </div>
                <div>
                  <label className="as-label">Type</label>
                  <select className="as-select" value={maintForm.maintenance_type} onChange={(e) => setMaintForm({ ...maintForm, maintenance_type: e.target.value })}>
                    <option value="preventive">Preventive</option>
                    <option value="corrective">Corrective</option>
                    <option value="inspection">Inspection</option>
                  </select>
                </div>
                <div>
                  <label className="as-label">Cost</label>
                  <input className="as-input" type="number" min="0" step="0.01" value={maintForm.cost} onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value })} />
                </div>
                <div>
                  <label className="as-label">Status</label>
                  <select className="as-select" value={maintForm.status} onChange={(e) => setMaintForm({ ...maintForm, status: e.target.value })}>
                    <option value="completed">Completed</option>
                    <option value="in_progress">In Progress</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </div>
              </div>
              <label className="as-label">Service Provider</label>
              <input className="as-input" value={maintForm.service_provider} onChange={(e) => setMaintForm({ ...maintForm, service_provider: e.target.value })} />
              <label className="as-label">Description</label>
              <textarea className="as-input" rows="2" value={maintForm.description} onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })} />
              <label className="as-label">Next Service Date</label>
              <input className="as-input" type="date" value={maintForm.next_service_date} onChange={(e) => setMaintForm({ ...maintForm, next_service_date: e.target.value })} />
            </div>
            <div className="as-modal-foot">
              <button className="as-btn-outline" onClick={() => setMaintModal(false)}>Cancel</button>
              <button className="as-btn-primary" disabled={saving} onClick={saveMaintenance}>{saving ? 'Saving…' : 'Save Record'}</button>
            </div>
          </div>
        </div>
      )}

      {deprModal && (
        <div className="as-modal-overlay">
          <div className="as-modal as-modal-fit">
            <div className="as-modal-head">
              <h3>Run Depreciation</h3>
              <button className="as-icon-btn" onClick={() => setDeprModal(null)}><X size={16} /></button>
            </div>
            <div className="as-modal-body">
              {(() => {
                const preview = previewDepreciation(deprModal.assetIds)
                const total = preview.reduce((s, p) => s + p.amount, 0)
                return (
                  <>
                    <div className="as-grid-2 as-depr-dates">
                      <div>
                        <label className="as-label">Period Label</label>
                        <input className="as-input" value={deprForm.period_label} onChange={(e) => setDeprForm({ ...deprForm, period_label: e.target.value })} />
                      </div>
                      <div>
                        <label className="as-label">Run Date</label>
                        <input className="as-input" type="date" value={deprForm.run_date} onChange={(e) => setDeprForm({ ...deprForm, run_date: e.target.value })} />
                      </div>
                    </div>
                    <div className="as-depr-accounts">
                      <div>
                        <label className="as-label">Default Depreciation Expense Account <span className="as-muted">(uncategorised assets)</span></label>
                        <AccountSelect
                          value={deprForm.expense_account_id}
                          onChange={(id) => setDeprForm({ ...deprForm, expense_account_id: id })}
                          options={accountOptions.filter((a) => a.type === 'expense' && (a.category === 'Depreciation' || /^60\d0$/.test(a.code)))}
                        />
                      </div>
                      <div>
                        <label className="as-label">Default Accumulated Depreciation Account <span className="as-muted">(uncategorised assets)</span></label>
                        <AccountSelect
                          value={deprForm.accumulated_account_id}
                          onChange={(id) => setDeprForm({ ...deprForm, accumulated_account_id: id })}
                          options={accountOptions.filter((a) => a.type === 'asset' && (a.category === 'Accumulated Depreciation' || /^17\d{2}$/.test(a.code)))}
                        />
                      </div>
                    </div>
                    {accountOptions.filter((a) => a.type === 'expense' && (a.category === 'Depreciation' || /^60\d0$/.test(a.code))).length === 0
                      || accountOptions.filter((a) => a.type === 'asset' && (a.category === 'Accumulated Depreciation' || /^17\d{2}$/.test(a.code))).length === 0 ? (
                      <div className="as-depr-warn">
                        <p>No depreciation accounts found. Click below to create the standard set (expense 6010–6060, accumulated 1701–1706) for this school, then set each class's accounts.</p>
                        <button className="as-btn-outline" type="button" disabled={saving} onClick={createDeprAccounts}>{saving ? 'Creating…' : 'Create depreciation accounts'}</button>
                      </div>
                    ) : null}
                    {(() => {
                      const totals = deprClassTotals(preview)
                      const missing = totals.filter((g) => !g.expenseId || !g.accId)
                      return (
                        <div className="as-depr-preview">
                          <p className="as-depr-preview-title">Journal entry preview <span className="as-muted">· one Dr/Cr pair per asset class</span></p>
                          {preview.length === 0 ? (
                            <p className="as-muted">No assets due for depreciation.</p>
                          ) : (
                            <div className="as-table-wrap">
                              <table className="as-table as-depr-class-table">
                                <thead>
                                  <tr>
                                    <th>Asset Class</th>
                                    <th className="num">Assets</th>
                                    <th className="num">Amount</th>
                                    <th>Debit Account</th>
                                    <th>Credit Account</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {totals.map((g) => {
                                    const exp = accountOptions.find((a) => a.id === g.expenseId)
                                    const acc = accountOptions.find((a) => a.id === g.accId)
                                    const ok = !!(g.expenseId && g.accId && exp && acc)
                                    return (
                                      <tr key={`${g.expenseId}|${g.accId}`}>
                                        <td className="as-fw600">{g.className}</td>
                                        <td className="num">{g.assets}</td>
                                        <td className="num as-fw600">{fmt(g.amount)}</td>
                                        <td className="as-mono">{ok ? `Dr. ${exp.code} — ${exp.name}` : <span style={{ color: '#dc2626' }}>Missing</span>}</td>
                                        <td className="as-mono">{ok ? `Cr. ${acc.code} — ${acc.name}` : <span style={{ color: '#dc2626' }}>Missing</span>}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {missing.length > 0 && (
                            <div className="as-depr-warn" style={{ marginTop: 10 }}>
                              <p>Set the depreciation accounts for: {missing.map((g) => g.className).join(', ')} — depreciation cannot be posted until then.</p>
                            </div>
                          )}
                          <div className="as-depr-total"><span>Total ({preview.length} assets)</span><span>{fmt(total)}</span></div>
                        </div>
                      )
                    })()}
                  </>
                )
              })()}
            </div>
            <div className="as-modal-foot">
              <button className="as-btn-outline" onClick={() => setDeprModal(null)}>Cancel</button>
              <button className="as-btn-primary" disabled={saving} onClick={runDepreciation}>{saving ? 'Posting…' : 'Post to Journal'}</button>
            </div>
          </div>
        </div>
      )}

      {docModal && (
        <div className="as-modal-overlay">
          <div className="as-modal as-modal-sm">
            <div className="as-modal-head">
              <h3>Upload Document</h3>
              <button className="as-icon-btn" onClick={() => setDocModal(null)}><X size={16} /></button>
            </div>
            <div className="as-modal-body">
              <p className="as-muted">Attaching to <strong>{docModal.name}</strong></p>
              <label className="as-label">Document Type</label>
              <select className="as-select" value={docForm.document_type} onChange={(e) => setDocForm({ ...docForm, document_type: e.target.value })}>
                <option value="purchase_invoice">Purchase Invoice</option>
                <option value="warranty">Warranty</option>
                <option value="manual">Manual</option>
                <option value="certificate">Certificate</option>
                <option value="other">Other</option>
              </select>
              <label className="as-label">Title</label>
              <input className="as-input" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} />
              <label className="as-label">File</label>
              <input className="as-input" type="file" onChange={(e) => setDocFile(e.target.files[0])} />
            </div>
            <div className="as-modal-foot">
              <button className="as-btn-outline" onClick={() => setDocModal(null)}>Cancel</button>
              <button className="as-btn-primary" disabled={saving} onClick={saveDocument}>{saving ? 'Uploading…' : 'Upload'}</button>
            </div>
          </div>
        </div>
      )}

      {taxRuleModal && (
        <div className="as-modal-overlay">
          <div className="as-modal as-modal-lg">
            <div className="as-modal-head">
              <h3>{taxRuleModal.isNew ? 'Add' : 'Edit'} Statutory Tax Rule</h3>
              <button className="as-icon-btn" onClick={() => setTaxRuleModal(null)}><X size={16} /></button>
            </div>
            <div className="as-modal-body">
              {!taxRuleModal.isNew && (
                <p className="as-tax-note">
                  Editing a rule does NOT rewrite historical tax schedules — each schedule row keeps the
                  rule version it was computed with. New computations pick up this version from its effective date.
                </p>
              )}
              <div className="as-grid-2">
                <div>
                  <label className="as-label">Rule Type *</label>
                  <select className="as-select" value={taxRuleForm.rule_type} onChange={(e) => setTaxRuleForm({ ...taxRuleForm, rule_type: e.target.value })}>
                    {TAX_RULE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="as-label">Tax Class Code *</label>
                  <input className="as-input" value={taxRuleForm.tax_class} onChange={(e) => setTaxRuleForm({ ...taxRuleForm, tax_class: e.target.value })} placeholder="e.g. class_ii or inv_b_manufacture" />
                </div>
              </div>
              <label className="as-label">Description</label>
              <input className="as-input" value={taxRuleForm.description} onChange={(e) => setTaxRuleForm({ ...taxRuleForm, description: e.target.value })} placeholder="e.g. Class II — machines & plant" />
              <label className="as-label">Asset Classification <span className="as-muted">(statutory wording)</span></label>
              <textarea className="as-input" rows="2" value={taxRuleForm.asset_classification} onChange={(e) => setTaxRuleForm({ ...taxRuleForm, asset_classification: e.target.value })} placeholder="What the class covers under the legislation" />
              <div className="as-grid-2">
                <div>
                  <label className="as-label">Annual Rate % *</label>
                  <input className="as-input" type="number" step="0.01" min="0" max="100" value={taxRuleForm.rate} onChange={(e) => setTaxRuleForm({ ...taxRuleForm, rate: e.target.value })} />
                </div>
                <div>
                  <label className="as-label">First-Year Rate %</label>
                  <input className="as-input" type="number" step="0.01" min="0" max="100" value={taxRuleForm.first_year_rate} onChange={(e) => setTaxRuleForm({ ...taxRuleForm, first_year_rate: e.target.value })} placeholder="e.g. investment initial allowance" />
                </div>
              </div>
              <label className="as-label">Calculation Method</label>
              <select className="as-select" value={taxRuleForm.calc_method} onChange={(e) => setTaxRuleForm({ ...taxRuleForm, calc_method: e.target.value })}>
                {TAX_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <div className="as-grid-2">
                <div>
                  <label className="as-label">Effective Date *</label>
                  <input className="as-input" type="date" value={taxRuleForm.effective_date} onChange={(e) => setTaxRuleForm({ ...taxRuleForm, effective_date: e.target.value })} />
                </div>
                <div>
                  <label className="as-label">Expiry Date</label>
                  <input className="as-input" type="date" value={taxRuleForm.expiry_date} onChange={(e) => setTaxRuleForm({ ...taxRuleForm, expiry_date: e.target.value })} />
                </div>
              </div>
              <label className="as-label">Source / Reference</label>
              <input className="as-input" value={taxRuleForm.source_reference} onChange={(e) => setTaxRuleForm({ ...taxRuleForm, source_reference: e.target.value })} placeholder="e.g. Income Tax Act (Cap 470) — Second Schedule" />
              <label className="as-label as-inline-check" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={taxRuleForm.is_active} onChange={(e) => setTaxRuleForm({ ...taxRuleForm, is_active: e.target.checked })} />
                Active
              </label>
            </div>
            <div className="as-modal-foot">
              <button className="as-btn-outline" onClick={() => setTaxRuleModal(null)}>Cancel</button>
              <button className="as-btn-primary" disabled={saving} onClick={saveTaxRule}>{saving ? 'Saving…' : 'Save Rule'}</button>
            </div>
          </div>
        </div>
      )}

      {viewRun && (
        <div className="as-modal-overlay">
          <div className="as-modal as-modal-fit">
            <div className="as-modal-head">
              <h3>Journal Entry Report</h3>
              <button className="as-icon-btn" onClick={() => setViewRun(null)}><X size={16} /></button>
            </div>
            <div className="as-modal-body">
              <p className="as-fw600">{viewRun.period_label} <span className="as-muted">· run {fmtDate(viewRun.run_date)} · {viewRunLines.length} GL lines</span></p>
              {viewRunLines.length === 0 ? (
                <p className="as-muted">No GL lines found for this run.</p>
              ) : (
                <div className="as-table-wrap">
                  <table className="as-table as-depr-class-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Notes</th>
                        <th className="num">Debit</th>
                        <th className="num">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewRunLines.map((l) => (
                        <tr key={l.id}>
                          <td className="as-mono">{l.chart_of_accounts ? `${l.chart_of_accounts.code} — ${l.chart_of_accounts.name}` : l.account_id}</td>
                          <td>{l.notes || '—'}</td>
                          <td className="num as-fw600">{l.debit > 0 ? fmt(l.debit) : ''}</td>
                          <td className="num as-fw600">{l.credit > 0 ? fmt(l.credit) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="as-modal-foot">
              <button className="as-btn-outline" onClick={() => setViewRun(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`as-toast ${toast.type}`}>{toast.msg}</div>}
    </>
  )

  if (selectedAsset) {
    return (
      <>
        <AssetProfile
          asset={selectedAsset}
          school={school}
          categories={categories}
          suppliers={suppliers}
          staffMap={staffMap}
          events={events}
          custody={custody}
          locations={locations}
          maintenance={maintenance}
          documents={documents}
          taxRules={taxRules}
          taxSchedules={taxSchedules}
          runLines={runLines}
          onBack={() => setSelectedAssetId(null)}
          onAssign={openAssignModal}
          onDispose={openDisposeModal}
          onMaintain={openMaintModal}
          onDepreciate={(a) => openDeprModal([a.id])}
          onEdit={openAssetModal}
          onUploadDoc={openDocModal}
          onViewDoc={viewDocument}
        />
        {renderModals()}
      </>
    )
  }

  return (
    <>
      <div className="as-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`as-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'register' && renderRegister()}
      {tab === 'categories' && renderCategories()}
      {tab === 'depreciation' && renderDepreciation()}
      {tab === 'tax' && renderTax()}
      {tab === 'taxrules' && renderTaxRules()}
      {tab === 'maintenance' && renderMaintenance()}
      {tab === 'transfers' && renderTransfers()}

      {renderModals()}
    </>
  )
}
