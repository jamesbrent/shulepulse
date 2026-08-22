import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  X, CreditCard,
  Loader, AlertTriangle, CheckCircle
} from 'lucide-react'
import { changeSchoolPlan, getPriceDiff } from '../superadmin/subscriptionService'
import { fetchAllPlans } from '../access/featureAccessService'

const PLAN_COLORS = {
  basic: '#475569',
  pro: '#2563eb',
  enterprise: '#ca8a04',
}

export default function PlanChangeModal({ school, onClose, onChanged }) {
  const [plans, setPlans] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(school.plan)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetchAllPlans().then(setPlans).catch(() => {})
  }, [])

  const currentPlan = school.plan
  const currentPrice = plans.find((p) => p.key === currentPlan)?.monthly_price || 0
  const selectedPrice = plans.find((p) => p.key === selectedPlan)?.monthly_price || 0
  const diff = selectedPrice - currentPrice
  const isDowngrade = diff < 0
  const isUpgrade = diff > 0
  const noChange = selectedPlan === currentPlan

  const handleConfirm = async () => {
    if (noChange) { onClose(); return }
    setSaving(true)
    setError('')
    try {
      await changeSchoolPlan(school.id, school.name, currentPlan, selectedPlan)
      setSuccess(`Plan changed to ${selectedPlan}`)
      setTimeout(() => {
        onChanged()
        onClose()
      }, 1500)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return createPortal(
    <div className="onboard-overlay" onClick={onClose}>
      <div className="onboard-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="onboard-header">
          <div className="onboard-header-left">
            <CreditCard size={20} />
            <h2>Change Plan — {school.name}</h2>
          </div>
          <button className="onboard-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="onboard-body">
          {error && <div className="onboard-error">{error}</div>}
          {success && (
            <div className="onboard-success">
              <CheckCircle size={18} /> {success}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {plans.filter((p) => p.is_active !== false).map((p) => {
              const color = PLAN_COLORS[p.key] || '#475569'
              const isCurrent = p.key === currentPlan
              const isSelected = p.key === selectedPlan
              return (
                <button
                  key={p.key}
                  onClick={() => !saving && setSelectedPlan(p.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: `2px solid ${isSelected ? color : '#e2e8f0'}`,
                    background: isSelected ? `${color}08` : '#fff',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{p.label}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>KES {(p.monthly_price || 0).toLocaleString()}/mo</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isCurrent && (
                      <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 99 }}>Current</span>
                    )}
                    {isSelected && !isCurrent && (
                      <span style={{ fontSize: 11, background: '#dbeafe', color: '#2563eb', padding: '2px 8px', borderRadius: 99 }}>
                        {isUpgrade ? 'Upgrade' : 'Downgrade'}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {!noChange && !success && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 8,
              background: isDowngrade ? '#fef9c3' : '#dcfce7',
              color: isDowngrade ? '#854d0e' : '#166534',
              fontSize: 13,
            }}>
              <AlertTriangle size={15} />
              {isDowngrade
                ? `Downgrade from ${currentPlan} to ${selectedPlan} (KES ${Math.abs(diff).toLocaleString()}/mo decrease)`
                : `Upgrade from ${currentPlan} to ${selectedPlan} (KES ${diff.toLocaleString()}/mo increase)`
              }
            </div>
          )}
        </div>

        <div className="onboard-footer">
          <div className="onboard-footer-right">
            <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={handleConfirm} disabled={saving || noChange || !!success}>
              {saving ? 'Saving...' : noChange ? 'Current Plan' : 'Confirm Change'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
