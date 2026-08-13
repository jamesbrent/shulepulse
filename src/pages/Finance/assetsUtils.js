// ─── Fixed Assets utilities ────────────────────────────────────────────────

export const ASSET_TYPES = ['equipment', 'furniture', 'vehicle', 'computer', 'building', 'land', 'other']

export const ASSET_STATUSES = [
  { value: 'active', label: 'Active', color: '#16a34a' },
  { value: 'in_storage', label: 'In Storage', color: '#d97706' },
  { value: 'under_maintenance', label: 'Under Maintenance', color: '#2563eb' },
  { value: 'transferred', label: 'Transferred', color: '#7c3aed' },
  { value: 'damaged', label: 'Damaged', color: '#ea580c' },
  { value: 'lost', label: 'Lost', color: '#dc2626' },
  { value: 'disposed', label: 'Disposed', color: '#64748b' },
]

export const DEPRECIATION_METHODS = [
  { value: 'straight_line', label: 'Straight-Line' },
  { value: 'reducing_balance', label: 'Reducing Balance' },
]

export const MAINTENANCE_TYPES = [
  { value: 'preventive', label: 'Preventive' },
  { value: 'corrective', label: 'Corrective' },
  { value: 'inspection', label: 'Inspection' },
]

export const MAINTENANCE_STATUSES = ['scheduled', 'in_progress', 'completed']

export const DOCUMENT_TYPES = [
  { value: 'purchase_invoice', label: 'Purchase Invoice' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'delivery_note', label: 'Delivery Note' },
  { value: 'allocation_form', label: 'Allocation Form' },
  { value: 'maintenance', label: 'Maintenance Document' },
  { value: 'disposal', label: 'Disposal Document' },
  { value: 'photo', label: 'Photo' },
  { value: 'other', label: 'Other' },
]

// Lightweight helper to prettify a KRA tax class code into a UI label.
// The authoritative tax rules live in taxUtils / the tax_rules table; this
// helper merely converts a code like "class_i" or "inv_b_hotel" into a
// human-readable label for display when the full rule metadata is not
// available in the calling context.
export const kraTaxClass = (code) => {
  if (!code) return null
  const label = String(code).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return { label }
}

export const assetStatus = (status) => ASSET_STATUSES.find((s) => s.value === status) || ASSET_STATUSES[0]

// NOTE: Kenyan tax capital allowances no longer live here. KRA tax classes,
// wear & tear rates and investment allowances are configured in the `tax_rules`
// table and computed in ./taxUtils.js. This module is FINANCIAL ACCOUNTING
// ONLY (straight-line / reducing balance) and is what posts to the General
// Ledger via Depreciation Runs.

export const calcNbv = (asset) =>
  Number(asset?.purchase_cost || 0) - Number(asset?.accumulated_depreciation || 0)

// Whole months between two dates (purchase month counts as month 1).
export const monthsBetween = (from, to = new Date()) => {
  if (!from) return 0
  const a = new Date(from)
  const b = new Date(to)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

// Depreciation charge for one period (monthly). Financial accounting only —
// never below residual value. Kenyan tax capital allowances are computed
// separately in taxUtils.js and do NOT influence this figure.
export const monthlyDepreciation = (asset, asOf = new Date()) => {
  if (!asset) return 0
  const cost = Number(asset.purchase_cost || 0)
  const residual = Number(asset.residual_value || 0)
  const acc = Number(asset.accumulated_depreciation || 0)
  const months = Math.max(1, Number(asset.useful_life_months || 60))
  const nbv = cost - acc
  const cap = Math.max(0, cost - residual - acc)

  if (asset.depreciation_method === 'reducing_balance') {
    const annualRate = Number(asset.depreciation_rate || 0) / 100
    const charge = (nbv * annualRate) / 12
    return Math.min(Math.max(0, charge), cap)
  }
  return Math.min(Math.max(0, (cost - residual) / months), cap)
}

// Next sequential asset id, e.g. AST-2026-0001
export async function nextAssetId(supabase, schoolId) {
  const year = new Date().getFullYear()
  const { data } = await supabase
    .from('fixed_assets')
    .select('asset_id')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(1)
  let seq = 1
  if (data?.length && data[0].asset_id?.startsWith(`AST-${year}-`)) {
    seq = parseInt(data[0].asset_id.split('-')[2]) + 1
  }
  return `AST-${year}-${String(seq).padStart(4, '0')}`
}

// Record an asset timeline event.
export async function addAssetEvent(supabase, { schoolId, assetId, eventType, description }) {
  const { data: user } = await supabase.auth.getUser()
  return supabase.from('asset_events').insert({
    school_id: schoolId,
    asset_id: assetId,
    event_type: eventType,
    description,
    performed_by: user?.user?.id || null,
  })
}

// Load all data needed by the assets module.
export async function loadAssetsData(supabase, schoolId) {
  const [assetRes, catRes, supRes, eventRes, custodyRes, locationRes, maintRes, runRes, lineRes, docRes, staffRes] =
    await Promise.all([
      supabase.from('fixed_assets').select('*').eq('school_id', schoolId).order('created_at', { ascending: false }),
      supabase.from('asset_categories').select('*').eq('school_id', schoolId).order('name'),
      supabase.from('suppliers').select('*').eq('school_id', schoolId).order('name'),
      supabase.from('asset_events').select('*, profiles!performed_by(full_name)').eq('school_id', schoolId).order('occurred_at', { ascending: false }),
      supabase.from('asset_custody_history').select('*, profiles!custodian_id(full_name)').eq('school_id', schoolId).order('created_at', { ascending: false }),
      supabase.from('asset_location_history').select('*').eq('school_id', schoolId).order('created_at', { ascending: false }),
      supabase.from('asset_maintenance').select('*, profiles!performed_by(full_name)').eq('school_id', schoolId).order('created_at', { ascending: false }),
      supabase.from('asset_depreciation_runs').select('*, journal_entries(entry_no)').eq('school_id', schoolId).order('created_at', { ascending: false }),
      supabase.from('asset_depreciation_lines').select('*, fixed_assets(name, asset_id)').eq('school_id', schoolId),
      supabase.from('asset_documents').select('*').eq('school_id', schoolId).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, role').eq('school_id', schoolId)
        .in('role', ['admin', 'bursar', 'deputy_administrator', 'registrar', 'hod', 'teacher', 'class_teacher', 'librarian', 'superadmin'])
        .order('full_name'),
    ])

  return {
    assets: assetRes.data || [],
    categories: catRes.data || [],
    suppliers: supRes.data || [],
    events: eventRes.data || [],
    custody: custodyRes.data || [],
    locations: locationRes.data || [],
    maintenance: maintRes.data || [],
    runs: runRes.data || [],
    runLines: lineRes.data || [],
    documents: docRes.data || [],
    staff: staffRes.data || [],
  }
}

// Compute per-asset depreciation preview for a run.
export const depreciationPreview = (assets) =>
  assets
    .filter((a) => a.status !== 'disposed')
    .map((a) => ({ asset: a, amount: monthlyDepreciation(a) }))
    .filter((p) => p.amount > 0)

export const formatPeriod = (dateStr) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })
}
