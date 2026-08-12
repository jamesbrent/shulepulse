import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search, RefreshCw, Eye, Pencil, Trash2, Download,
  X, TrendingDown, Wrench, User, FileText, Archive, Landmark, ShieldCheck, Power
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmt, fmtDate, downloadFile } from '../admin/fees/utils/feesHelpers'
import { writeAudit, postToJournal } from './accountsUtils'
import {
  ASSET_STATUSES, assetStatus, calcNbv, monthlyDepreciation, nextAssetId,
  addAssetEvent, loadAssetsData, formatPeriod, kraTaxClass,
} from './assetsUtils'
import {
  TAX_RULE_TYPES, TAX_METHODS, FINANCE_ROLES, methodLabel as taxMethodLabel,
  ensureDefaultTaxRules, loadTaxData, activeRule, taxRuleLabel,
  buildTaxSchedule, runTaxAllowances, taxVsAccounting,
} from './taxUtils'
import AssetProfile from './AssetProfile'
import './Assets.css'

const TODAY = new Date().toISOString().split('T')[0]

const blankAsset = () => ({
  name: '', category_id: '', asset_type: 'equipment', serial_number: '', model: '',
  manufacturer: '', description: '', purchase_date: TODAY, supplier_id: '',
  purchase_invoice_ref: '', purchase_cost: '', residual_value: 0, useful_life_months: 60,
  depreciation_method: 'straight_line', depreciation_rate: 0, warranty_until: '',
  status: 'active', campus: '', building: '', department: '', room: '', specific_location: '',
  custodian_id: '', assigned_date: TODAY,
  tax_class: '', investment_class: '',
})

const blankCategory = () => ({
  name: '', description: '', depreciation_method: 'straight_line',
  useful_life_months: 60, depreciation_rate: 0, residual_value: 0,
  tax_class: '',
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
  const [disposeForm, setDisposeForm] = useState({ disposal_date: TODAY, disposal_reason: '', disposal_amount: 0 })
  const [maintModal, setMaintModal] = useState(false)
  const [maintForm, setMaintForm] = useState({
    asset_id: '', maintenance_date: TODAY, maintenance_type: 'preventive',
    description: '', cost: 0, service_provider: '', status: 'completed', next_service_date: '',
  })
  const [deprModal, setDeprModal] = useState(null)
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
    const { data: accData } = await supabase.from('chart_of_accounts').select('*').eq('school_id', schoolId).order('code')
    setAccountOptions(accData || [])
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
    // Prefer dedicated depreciation accounts if present
    const expense = accs.find((a) => a.code === '6010')
      || accs.find((a) => a.category === 'Depreciation' && a.type === 'expense')
      || accs.find((a) => a.type === 'expense' && /deprec/i.test(a.name))
      || accs.find((a) => a.type === 'expense')

    const accumulated = accs.find((a) => a.code === '1701')
      || accs.find((a) => a.category === 'Accumulated Depreciation' && a.type === 'asset')
      || accs.find((a) => a.type === 'asset' && /accumulated/i.test(a.name))
      || accs.find((a) => a.type === 'asset')

    setDeprForm((f) => ({
      ...f,
      expense_account_id: expense?.id || '',
      accumulated_account_id: accumulated?.id || '',
    }))
  }, [fetchAccounts])

  const openAssetModal = (asset = null) => {
    setAssetModal({ isNew: !asset, asset })
    setAssetForm(asset ? {
      name: asset.name, category_id: asset.category_id || '', asset_type: asset.asset_type || 'equipment',
      serial_number: asset.serial_number || '', model: asset.model || '', manufacturer: asset.manufacturer || '',
      description: asset.description || '', purchase_date: asset.purchase_date || TODAY, supplier_id: asset.supplier_id || '',
      purchase_invoice_ref: asset.purchase_invoice_ref || '', purchase_cost: asset.purchase_cost || '',
      residual_value: asset.residual_value || 0, useful_life_months: asset.useful_life_months || 60,
      depreciation_method: asset.depreciation_method || 'straight_line', depreciation_rate: asset.depreciation_rate || 0,
      warranty_until: asset.warranty_until || '', status: asset.status || 'active',
      campus: asset.campus || '', building: asset.building || '', department: asset.department || '',
      room: asset.room || '', specific_location: asset.specific_location || '',
      custodian_id: asset.custodian_id || '', assigned_date: asset.assigned_date || TODAY,
      tax_class: asset.tax_class || '', investment_class: asset.investment_class || '',
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
    setSaving(true)
    try {
      const cost = Number(assetForm.purchase_cost)
      const policyCat = categories.find((c) => c.id === assetForm.category_id)
      const base = {
        school_id: schoolId,
        name: assetForm.name.trim(), category_id: assetForm.category_id || null,
        asset_type: assetForm.asset_type, serial_number: assetForm.serial_number || null,
        model: assetForm.model || null, manufacturer: assetForm.manufacturer || null,
        description: assetForm.description || null, purchase_date: assetForm.purchase_date || null,
        supplier_id: assetForm.supplier_id || null, purchase_invoice_ref: assetForm.purchase_invoice_ref || null,
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
        depreciation_method: policyCat?.depreciation_method || assetForm.depreciation_method || 'straight_line',
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
      let assetId = assetModal.asset?.asset_id
      if (assetModal.isNew) {
        assetId = await nextAssetId(supabase, schoolId)
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

      setToast({ type: 'success', msg: assetModal.isNew ? `Asset ${assetId} registered.` : 'Asset updated.' })
      setAssetModal(null)
      load()
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
    setDisposeForm({ disposal_date: TODAY, disposal_reason: '', disposal_amount: 0 })
  }

  const saveDispose = async () => {
    if (!disposeForm.disposal_reason.trim()) { setToast({ type: 'error', msg: 'A disposal reason is required.' }); return }
    setSaving(true)
    await supabase.from('fixed_assets').update({
      status: 'disposed', disposal_date: disposeForm.disposal_date || TODAY,
      disposal_reason: disposeForm.disposal_reason.trim(), disposal_amount: Number(disposeForm.disposal_amount) || 0,
      custodian_id: null,
    }).eq('id', disposeModal.id)
    await supabase.from('asset_custody_history')
      .update({ to_date: disposeForm.disposal_date || TODAY })
      .eq('asset_id', disposeModal.id)
      .is('to_date', null)
    await addAssetEvent(supabase, {
      schoolId, assetId: disposeModal.id, eventType: 'disposed',
      description: `Disposed (${disposeForm.disposal_reason.trim()})${disposeForm.disposal_amount ? ` — proceeds ${fmt(disposeForm.disposal_amount)}` : ''}`,
    })
    await writeAudit(supabase, { schoolId, action: 'assets.disposed', details: { asset_id: disposeModal.asset_id } })
    setSaving(false)
    setDisposeModal(null)
    setToast({ type: 'success', msg: 'Asset disposed.' })
    load()
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

  const openDeprModal = (assetIds = null) => {
    setDeprModal({ assetIds })
    setDeprForm((f) => ({ ...f, period_label: formatPeriod(TODAY), run_date: TODAY }))
    setDeprAccountDefaults()
  }

  const runDepreciation = async () => {
    if (!deprForm.expense_account_id || !deprForm.accumulated_account_id) {
      setToast({ type: 'error', msg: 'Set the depreciation expense and accumulated depreciation accounts.' }); return
    }
    const preview = previewDepreciation(deprModal.assetIds)
    if (!preview.length) { setToast({ type: 'error', msg: 'No assets are due for depreciation this period.' }); return }
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

      // Map each asset to the appropriate accounts based on its category
      const groups = {} // key -> { expenseAccountId, accAccountId, amount }
      const findAccountByCode = (code) => accountOptions.find((a) => a.code === code)
      for (const p of preview) {
        const pc = categories.find((c) => c.id === p.asset.category_id)
        const cname = (pc?.name || '').toLowerCase()
        let expenseCode = '6060'
        let accCode = '1706'
        if (/build|land/i.test(cname)) { expenseCode = '6010'; accCode = '1701' }
        else if (/motor|vehicle/i.test(cname)) { expenseCode = '6020'; accCode = '1702' }
        else if (/furnitur|fitting/i.test(cname)) { expenseCode = '6030'; accCode = '1703' }
        else if (/computer|it|ict|technology/i.test(cname)) { expenseCode = '6040'; accCode = '1704' }
        else if (/school|equipment|lab|laboratory/i.test(cname)) { expenseCode = '6050'; accCode = '1705' }

        const expenseAcc = findAccountByCode(expenseCode)
        const accAcc = findAccountByCode(accCode)
        const expenseId = expenseAcc ? expenseAcc.id : deprForm.expense_account_id
        const accId = accAcc ? accAcc.id : deprForm.accumulated_account_id
        const key = `${expenseId}|${accId}`
        if (!groups[key]) groups[key] = { expenseId, accId, amount: 0, assets: [] }
        groups[key].amount += p.amount
        groups[key].assets.push(p.asset.id)
      }

      // Build journal lines aggregated by account pair
      const journalLines = []
      const accountIds = new Set()
      Object.values(groups).forEach((g) => {
        accountIds.add(g.expenseId); accountIds.add(g.accId)
      })
      const ids = [...accountIds].filter(Boolean)

      // Validate accounts server-side: fetch their records and ensure correct types/categories
      if (!ids.length) throw new Error('No valid accounts selected for posting.')
      const { data: accRecords } = await supabase.from('chart_of_accounts').select('*').in('id', ids)
      const accById = Object.fromEntries((accRecords || []).map((a) => [a.id, a]))

      for (const g of Object.values(groups)) {
        const exp = accById[g.expenseId]
        const acc = accById[g.accId]
        if (!exp || exp.type !== 'expense' || !(exp.category === 'Depreciation' || /^60\d0$/.test(exp.code))) {
          throw new Error(`Invalid depreciation expense account selected: ${exp ? `${exp.code} — ${exp.name}` : g.expenseId}`)
        }
        if (!acc || acc.type !== 'asset' || !(acc.category === 'Accumulated Depreciation' || /^17\d{2}$/.test(acc.code))) {
          throw new Error(`Invalid accumulated depreciation account selected: ${acc ? `${acc.code} — ${acc.name}` : g.accId}`)
        }
        journalLines.push({ account_id: g.expenseId, debit: g.amount, credit: 0, notes: deprForm.period_label })
        journalLines.push({ account_id: g.accId, debit: 0, credit: g.amount, notes: deprForm.period_label })
      }

      // Post the aggregated journal lines
      const je = await postToJournal(supabase, {
        schoolId, userId, entry_date: deprForm.run_date || TODAY,
        description: `Depreciation for ${deprForm.period_label} (${preview.length} assets)`,
        source: 'assets', reference_type: 'depreciation_run', reference_id: run.id,
        lines: journalLines,
      })

      await supabase.from('asset_depreciation_runs').update({ journal_entry_id: je.id }).eq('id', run.id)
      await writeAudit(supabase, {
        schoolId, action: 'assets.depreciation_run',
        details: { period: deprForm.period_label, total, entry_no: je.entry_no },
      })
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
      ['Asset ID', 'Name', 'Serial No.', 'Category', 'Custodian', 'Location', 'Cost', 'Accumulated Depn', 'NBV', 'Status'],
      ...filteredAssets.map((a) => [
        a.asset_id, a.name, a.serial_number || '',
        categories.find((c) => c.id === a.category_id)?.name || '',
        staffMap[a.custodian_id] || '', [a.building, a.room].filter(Boolean).join(', '),
        a.purchase_cost, a.accumulated_depreciation, calcNbv(a), a.status,
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
                <tr><th>Period</th><th>Run Date</th><th>Assets</th><th className="num">Total</th><th>Journal Entry</th><th>Run By</th></tr>
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
                      <td className="as-mono">{r.journal_entries?.entry_no || '—'}</td>
                      <td>{staffMap[r.created_by] || '—'}</td>
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
                  <select className="as-select" value={assetForm.category_id} onChange={(e) => setAssetForm({ ...assetForm, category_id: e.target.value })}>
                    <option value="">Select category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="as-label">Supplier</label>
                  <select className="as-select" value={assetForm.supplier_id} onChange={(e) => setAssetForm({ ...assetForm, supplier_id: e.target.value })}>
                    <option value="">Select supplier</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
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
              {(() => {
                const pc = categories.find((c) => c.id === assetForm.category_id)
                if (!pc?.tax_class) return null
                const k = kraTaxClass(pc.tax_class)
                return k ? (
                  <p className="as-policy-hint">
                    Depreciation policy: {k.label} — {k.rate}% p.a. reducing balance
                    {k.first_year_allowance ? `, ${k.first_year_allowance}% first-year allowance` : ''}.
                  </p>
                ) : null
              })()}
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
          <div className="as-modal as-modal-sm">
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
                    <div className="as-grid-2">
                      <div>
                        <label className="as-label">Period Label</label>
                        <input className="as-input" value={deprForm.period_label} onChange={(e) => setDeprForm({ ...deprForm, period_label: e.target.value })} />
                      </div>
                      <div>
                        <label className="as-label">Run Date</label>
                        <input className="as-input" type="date" value={deprForm.run_date} onChange={(e) => setDeprForm({ ...deprForm, run_date: e.target.value })} />
                      </div>
                    </div>
                    <div className="as-grid-2">
                      <div>
                        <label className="as-label">Depreciation Expense Account</label>
                        <select className="as-select" value={deprForm.expense_account_id} onChange={(e) => setDeprForm({ ...deprForm, expense_account_id: e.target.value })}>
                          <option value="">Select account</option>
                          {accountOptions
                            .filter((a) => a.type === 'expense' && (a.category === 'Depreciation' || /^60\d0$/.test(a.code)))
                            .map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="as-label">Accumulated Depreciation Account</label>
                        <select className="as-select" value={deprForm.accumulated_account_id} onChange={(e) => setDeprForm({ ...deprForm, accumulated_account_id: e.target.value })}>
                          <option value="">Select account</option>
                          {accountOptions
                            .filter((a) => a.type === 'asset' && (a.category === 'Accumulated Depreciation' || /^17\d{2}$/.test(a.code)))
                            .map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="as-depr-preview">
                      <p className="as-depr-preview-title">Preview</p>
                      {preview.length === 0 ? (
                        <p className="as-muted">No assets due for depreciation.</p>
                      ) : (
                        preview.slice(0, 6).map((p) => (
                          <div className="as-depr-line" key={p.asset.id}>
                            <span>{p.asset.name}</span><span>{fmt(p.amount)}</span>
                          </div>
                        ))
                      )}
                      {preview.length > 6 && <p className="as-muted">+{preview.length - 6} more…</p>}
                      <div className="as-depr-total"><span>Total ({preview.length} assets)</span><span>{fmt(total)}</span></div>
                    </div>
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
      {tab === 'maintenance' && renderMaintenance()}
      {tab === 'transfers' && renderTransfers()}

      {renderModals()}
    </>
  )
}
