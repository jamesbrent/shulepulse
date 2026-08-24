import { useState, useEffect } from 'react'
import {
  CreditCard, Plus, Edit3, Save, X, CheckCircle, XCircle,
  ChevronDown, ChevronRight, Loader, Trash2, ToggleLeft, ToggleRight,
  Users, DollarSign, Calendar, Star, GripVertical, Eye, EyeOff
} from 'lucide-react'
import {
  fetchAllPlans,
  fetchFeatureCatalog,
  fetchPlanFeatures,
  setPlanFeatures,
  updatePlan,
  createPlan,
  fetchSchoolFeatures,
} from '../../features/access/featureAccessService'
import './PlanManagementPage.css'

const PLAN_COLORS = {
  basic: { color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' },
  pro: { color: '#2563eb', bg: '#dbeafe', border: '#93c5fd' },
  enterprise: { color: '#ca8a04', bg: '#fef9c3', border: '#fde047' },
}

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available', icon: CheckCircle, color: '#16a34a' },
  { value: 'beta', label: 'Beta / Partial', icon: Eye, color: '#ca8a04' },
  { value: 'unavailable', label: 'Not Available', icon: EyeOff, color: '#94a3b8' },
]

export default function PlanManagementPage() {
  const [plans, setPlans] = useState([])
  const [catalog, setCatalog] = useState([])
  const [planFeatures, setPlanFeaturesState] = useState({})
  const [loading, setLoading] = useState(true)
  const [editingPlan, setEditingPlan] = useState(null)
  const [expandedPlan, setExpandedPlan] = useState(null)
  const [expandedModule, setExpandedModule] = useState({})
  const [showCreatePlan, setShowCreatePlan] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [plansData, catalogData] = await Promise.all([
        fetchAllPlans(),
        fetchFeatureCatalog(),
      ])
      setPlans(plansData)
      setCatalog(catalogData)

      const pfMap = {}
      for (const plan of plansData) {
        pfMap[plan.key] = await fetchPlanFeatures(plan.key)
      }
      setPlanFeaturesState(pfMap)
    } catch (err) {
      console.error('[PlanManagement] load error:', err)
    }
    setLoading(false)
  }

  const modules = [...new Set(catalog.map((f) => f.module))]

  const getModuleLabel = (mod) => {
    const labels = {
      students: 'Student Management',
      academics: 'Academics',
      finance: 'Finance',
      payroll: 'Payroll',
      hr: 'Human Resources',
      library: 'Library',
      communication: 'Communication',
      reception: 'Reception / Front Office',
      settings: 'Settings',
      platform: 'Platform',
    }
    return labels[mod] || mod
  }

  const toggleFeature = (planKey, featureKey) => {
    setPlanFeaturesState((prev) => {
      const current = prev[planKey] || []
      const next = current.includes(featureKey)
        ? current.filter((k) => k !== featureKey)
        : [...current, featureKey]
      return { ...prev, [planKey]: next }
    })
  }

  const savePlanFeatures = async (planKey) => {
    setSaving(true)
    try {
      await setPlanFeatures(planKey, planFeatures[planKey] || [])
      setToast({ type: 'success', message: `${planKey} plan features saved` })
      setTimeout(() => setToast(null), 3000)
    } catch (err) {
      setToast({ type: 'error', message: err.message })
      setTimeout(() => setToast(null), 3000)
    }
    setSaving(false)
  }

  const savePlanDetails = async (plan) => {
    setSaving(true)
    try {
      await updatePlan(plan.id, {
        label: plan.label,
        monthly_price: plan.monthly_price,
        annual_price: plan.annual_price,
        description: plan.description,
        color: plan.color,
        bg: plan.bg,
        is_active: plan.is_active,
        recommended: plan.recommended,
      })
      setEditingPlan(null)
      setToast({ type: 'success', message: `${plan.label} updated` })
      setTimeout(() => setToast(null), 3000)
      loadData()
    } catch (err) {
      setToast({ type: 'error', message: err.message })
      setTimeout(() => setToast(null), 3000)
    }
    setSaving(false)
  }

  const copyPlanFeatures = (fromKey, toKey) => {
    setPlanFeaturesState((prev) => ({
      ...prev,
      [toKey]: [...(prev[fromKey] || [])],
    }))
  }

  if (loading) return <div className="loading-state">Loading plan data...</div>

  return (
    <div className="plan-mgmt-page">
      {toast && (
        <div className={`plan-toast ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
          {toast.message}
        </div>
      )}

      <div className="plan-mgmt-header">
        <div>
          <h2>Plan Management</h2>
          <p className="plan-mgmt-subtitle">Manage subscription plans and feature assignments</p>
        </div>
        <button className="plan-btn plan-btn-primary" onClick={() => setShowCreatePlan(true)}>
          <Plus size={14} /> Create Plan
        </button>
      </div>

      {showCreatePlan && (
        <CreatePlanModal
          onClose={() => setShowCreatePlan(false)}
          onCreated={() => { setShowCreatePlan(false); loadData() }}
        />
      )}

      <div className="plan-cards-grid">
        {plans.map((plan) => {
          const colors = PLAN_COLORS[plan.key] || { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' }
          const featureCount = (planFeatures[plan.key] || []).length
          const totalFeatures = catalog.filter((f) => f.status !== 'unavailable').length
          const isExpanded = expandedPlan === plan.key
          const isEditing = editingPlan?.id === plan.id

          return (
            <div key={plan.id} className={`plan-card${isExpanded ? ' expanded' : ''}`} style={{ borderColor: colors.border }}>
              <div className="plan-card-header" style={{ background: colors.bg }}>
                <div className="plan-card-title-row">
                  <div className="plan-card-dot" style={{ background: colors.color }} />
                  {isEditing ? (
                    <input
                      className="plan-input"
                      value={editingPlan.label}
                      onChange={(e) => setEditingPlan({ ...editingPlan, label: e.target.value })}
                      style={{ fontSize: 18, fontWeight: 700 }}
                    />
                  ) : (
                    <h3 style={{ margin: 0, color: colors.color }}>{plan.label}</h3>
                  )}
                  {plan.recommended && <span className="plan-badge-rec"><Star size={10} /> Recommended</span>}
                </div>

                <div className="plan-card-price">
                  {isEditing ? (
                    <div className="plan-price-edit">
                      <input
                        className="plan-input plan-input-sm"
                        type="number"
                        value={editingPlan.monthly_price || 0}
                        onChange={(e) => setEditingPlan({ ...editingPlan, monthly_price: Number(e.target.value) })}
                        placeholder="Monthly"
                      />
                      <span className="plan-price-slash">/</span>
                      <input
                        className="plan-input plan-input-sm"
                        type="number"
                        value={editingPlan.annual_price || 0}
                        onChange={(e) => setEditingPlan({ ...editingPlan, annual_price: Number(e.target.value) })}
                        placeholder="Annual"
                      />
                    </div>
                  ) : (
                    <span className="plan-price-text">
                      KES {(plan.monthly_price || 0).toLocaleString()}/mo
                      <span className="plan-price-annual"> / KES {(plan.annual_price || 0).toLocaleString()}/yr</span>
                    </span>
                  )}
                </div>

                <div className="plan-card-stats">
                  <span className="plan-stat">
                    <CheckCircle size={12} /> {featureCount}/{totalFeatures} features
                  </span>
                  <span className="plan-stat">
                    {plan.is_active ? (
                      <><ToggleRight size={12} color="#16a34a" /> Active</>
                    ) : (
                      <><ToggleLeft size={12} color="#94a3b8" /> Inactive</>
                    )}
                  </span>
                </div>

                <div className="plan-card-actions">
                  {isEditing ? (
                    <>
                      <button className="plan-btn plan-btn-sm plan-btn-success" onClick={() => savePlanDetails(editingPlan)} disabled={saving}>
                        {saving ? <Loader size={12} className="spin" /> : <Save size={12} />} Save
                      </button>
                      <button className="plan-btn plan-btn-sm plan-btn-ghost" onClick={() => setEditingPlan(null)}>
                        <X size={12} /> Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="plan-btn plan-btn-sm plan-btn-outline" onClick={() => setEditingPlan({ ...plan })}>
                        <Edit3 size={12} /> Edit
                      </button>
                      <button
                        className="plan-btn plan-btn-sm plan-btn-outline"
                        onClick={() => setExpandedPlan(isExpanded ? null : plan.key)}
                      >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        Features
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="plan-card-features">
                  <div className="plan-features-toolbar">
                    <button
                      className="plan-btn plan-btn-sm plan-btn-outline"
                      onClick={() => copyPlanFeatures('basic', plan.key)}
                      disabled={plan.key === 'basic'}
                    >
                      Copy from Basic
                    </button>
                    <button
                      className="plan-btn plan-btn-sm plan-btn-outline"
                      onClick={() => copyPlanFeatures('pro', plan.key)}
                      disabled={plan.key === 'pro'}
                    >
                      Copy from Pro
                    </button>
                    <button
                      className="plan-btn plan-btn-sm plan-btn-outline"
                      onClick={() => copyPlanFeatures('enterprise', plan.key)}
                      disabled={plan.key === 'enterprise'}
                    >
                      Copy from Enterprise
                    </button>
                    <button
                      className="plan-btn plan-btn-sm plan-btn-primary"
                      onClick={() => savePlanFeatures(plan.key)}
                      disabled={saving}
                    >
                      {saving ? <Loader size={12} className="spin" /> : <Save size={12} />} Save Features
                    </button>
                  </div>

                  {modules.map((mod) => {
                    const modFeatures = catalog.filter((f) => f.module === mod && f.status !== 'unavailable')
                    if (modFeatures.length === 0) return null
                    const modKey = plan.key + '_' + mod
                    const isModExpanded = expandedModule[modKey]
                    const enabledInModule = modFeatures.filter((f) => (planFeatures[plan.key] || []).includes(f.feature_key)).length

                    return (
                      <div key={mod} className="plan-module-group">
                        <button
                          className="plan-module-header"
                          onClick={() => setExpandedModule((prev) => ({
                            ...prev,
                            [modKey]: !prev[modKey],
                          }))}
                        >
                          <span className="plan-module-toggle">
                            {isModExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                          <span className="plan-module-name">{getModuleLabel(mod)}</span>
                          <span className="plan-module-count">
                            {enabledInModule}/{modFeatures.length}
                          </span>
                          <span
                            className="plan-module-check"
                            onClick={(e) => {
                              e.stopPropagation()
                              const allEnabled = modFeatures.every((f) => (planFeatures[plan.key] || []).includes(f.feature_key))
                              setPlanFeaturesState((prev) => {
                                const current = prev[plan.key] || []
                                const modKeys = modFeatures.map((f) => f.feature_key)
                                const next = allEnabled
                                  ? current.filter((k) => !modKeys.includes(k))
                                  : [...new Set([...current, ...modKeys])]
                                return { ...prev, [plan.key]: next }
                              })
                            }}
                          >
                            {enabledInModule === modFeatures.length ? (
                              <CheckCircle size={14} color={colors.color} />
                            ) : enabledInModule > 0 ? (
                              <div className="plan-module-partial" style={{ borderColor: colors.color }} />
                            ) : (
                              <XCircle size={14} color="#cbd5e1" />
                            )}
                          </span>
                        </button>

                        {isModExpanded && (
                          <div className="plan-feature-list">
                            {modFeatures.map((feat) => {
                              const isEnabled = (planFeatures[plan.key] || []).includes(feat.feature_key)
                              return (
                                <label key={feat.feature_key} className={`plan-feature-item${isEnabled ? ' enabled' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={isEnabled}
                                    onChange={() => toggleFeature(plan.key, feat.feature_key)}
                                  />
                                  <span className="plan-feature-label">{feat.label}</span>
                                  <span className={`plan-feature-status${feat.status === 'beta' ? ' beta' : ''}`}>
                                    {feat.status === 'beta' ? 'Beta' : feat.status === 'unavailable' ? 'N/A' : ''}
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CreatePlanModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    key: '',
    label: '',
    monthly_price: 0,
    annual_price: 0,
    description: '',
    color: '#475569',
    bg: '#f1f5f9',
    recommended: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.key || !form.label) {
      setError('Key and Label are required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createPlan(form)
      onCreated()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <div className="plan-modal-overlay" onClick={onClose}>
      <div className="plan-modal" onClick={(e) => e.stopPropagation()}>
        <div className="plan-modal-header">
          <h3>Create New Plan</h3>
          <button className="plan-btn plan-btn-ghost plan-btn-sm" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="plan-modal-body">
          <div className="plan-form-row">
            <div className="plan-form-group">
              <label>Plan Key (unique identifier)</label>
              <input className="plan-input" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} placeholder="e.g. starter" />
            </div>
            <div className="plan-form-group">
              <label>Display Name</label>
              <input className="plan-input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Starter" />
            </div>
          </div>
          <div className="plan-form-row">
            <div className="plan-form-group">
              <label>Monthly Price (KES)</label>
              <input className="plan-input" type="number" value={form.monthly_price} onChange={(e) => setForm({ ...form, monthly_price: Number(e.target.value) })} />
            </div>
            <div className="plan-form-group">
              <label>Annual Price (KES)</label>
              <input className="plan-input" type="number" value={form.annual_price} onChange={(e) => setForm({ ...form, annual_price: Number(e.target.value) })} />
            </div>
          </div>
          <div className="plan-form-group">
            <label>Description</label>
            <textarea className="plan-input plan-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          </div>
          <div className="plan-form-row">
            <div className="plan-form-group">
              <label>Brand Color</label>
              <div className="plan-color-row">
                <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
                <input className="plan-input plan-input-sm" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
              </div>
            </div>
            <div className="plan-form-group">
              <label>Background Color</label>
              <div className="plan-color-row">
                <input type="color" value={form.bg} onChange={(e) => setForm({ ...form, bg: e.target.value })} />
                <input className="plan-input plan-input-sm" value={form.bg} onChange={(e) => setForm({ ...form, bg: e.target.value })} />
              </div>
            </div>
          </div>
          <label className="plan-checkbox-label">
            <input type="checkbox" checked={form.recommended} onChange={(e) => setForm({ ...form, recommended: e.target.checked })} />
            Mark as recommended
          </label>
          {error && <p className="plan-error">{error}</p>}
          <div className="plan-modal-actions">
            <button type="button" className="plan-btn plan-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="plan-btn plan-btn-primary" disabled={saving}>
              {saving ? <Loader size={14} className="spin" /> : <Plus size={14} />} Create Plan
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
