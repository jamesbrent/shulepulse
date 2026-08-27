import { Shield, ArrowUp, Mail } from 'lucide-react'
import { useFeatureAccess } from './FeatureAccessContext'

const PLAN_LABELS = {
  basic: 'Basic',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

const PLAN_SUGGESTIONS = {
  'students.transfers': 'Pro',
  'students.discipline': 'Pro',
  'students.alumni': 'Pro',
  'academics.transcripts': 'Pro',
  'academics.performance': 'Pro',
  'academics.cbc_analysis': 'Pro',
  'academics.teacher_review': 'Pro',
  'hr.staff_management': 'Pro',
  'hr.departments': 'Pro',
  'hr.comments': 'Pro',
  'library.catalogue': 'Pro',
  'library.circulation': 'Pro',
  'library.fines': 'Pro',
  'library.reports': 'Pro',
  'communication.messages': 'Pro',
  'reception.front_office': 'Pro',
  'reception.calendar': 'Pro',
  'platform.reports': 'Pro',
  'finance.accounting': 'Enterprise',
  'finance.journal': 'Enterprise',
  'finance.ledger': 'Enterprise',
  'finance.expenses': 'Enterprise',
  'finance.cash_bank': 'Enterprise',
  'finance.assets': 'Enterprise',
  'finance.financial_statements': 'Enterprise',
  'finance.ap': 'Enterprise',
  'finance.reports': 'Enterprise',
  'payroll.employees': 'Enterprise',
  'payroll.runs': 'Enterprise',
  'payroll.statutory': 'Enterprise',
  'payroll.gl_posting': 'Enterprise',
  'payroll.reports': 'Enterprise',
}

export default function FeatureLocked({ featureKey }) {
  const { catalog } = useFeatureAccess()

  const key = Array.isArray(featureKey) ? featureKey[0] : featureKey
  const feature = catalog.find((f) => f.feature_key === key)
  const featureLabel = feature?.label || String(key || '').replace(/[.]/g, ' ') || 'This feature'
  const requiredPlan = PLAN_SUGGESTIONS[key] || 'Pro'

  return (
    <div className="feature-locked-container">
      <div className="feature-locked-card">
        <div className="feature-locked-icon">
          <Shield size={48} strokeWidth={1.5} />
        </div>
        <h2 className="feature-locked-title">Feature Not Available</h2>
        <p className="feature-locked-description">
          <strong>{featureLabel}</strong> is not included in your current ShulePulse plan.
        </p>
        <div className="feature-locked-plan-info">
          <div className="feature-locked-current">
            <span className="feature-locked-label">Current Plan</span>
            <span className="feature-locked-plan-badge current">Contact Admin</span>
          </div>
          <div className="feature-locked-arrow">
            <ArrowUp size={16} />
          </div>
          <div className="feature-locked-required">
            <span className="feature-locked-label">Available in</span>
            <span className="feature-locked-plan-badge required">{requiredPlan} or Enterprise</span>
          </div>
        </div>
        <p className="feature-locked-help">
          Contact your school administrator or platform support to upgrade your plan.
        </p>
        <a href="mailto:support@shulepulse.com" className="feature-locked-contact">
          <Mail size={14} />
          Contact Support
        </a>
      </div>
    </div>
  )
}
