// ─── Formatters ──────────────────────────────────────────────────────────────
export const fmt = (n) => `KES ${Number(n || 0).toLocaleString()}`

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—'

export const initials = (name) =>
  (name || '').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()

// Waterfall allocation: assign totalPaid across fee assessment lines in order.
// Gives a deterministic per-line "paid" figure (sums exactly to totalPaid)
// without reading the never-written fee_assessments.amount_paid column.
export const paidWaterfall = (assessments, totalPaid) => {
  let rem = Number(totalPaid || 0)
  return (assessments || []).map((a) => {
    const due = Number(a.amount_due || 0)
    const share = Math.max(0, Math.min(due, rem))
    rem = Math.max(0, rem - due)
    return share
  })
}

// ─── File Download ────────────────────────────────────────────────────────────
import { Banknote, Smartphone, Landmark, FileText, SlidersHorizontal } from 'lucide-react'

export const downloadFile = (content, filename, type) => {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Constants ────────────────────────────────────────────────────────────────
export const TERMS = ['Term 1', 'Term 2', 'Term 3']

export const YEARS = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1]

// Legacy payment methods (backward compat)
export const PAYMENT_METHODS = ['mpesa', 'bank', 'cash']

// Flexible payment types (v2)
export const PAYMENT_TYPES = [
  { value: 'cash',         label: 'Cash',          icon: Banknote },
  { value: 'mobile_money', label: 'Mobile Money',  icon: Smartphone },
  { value: 'bank',         label: 'Bank Transfer',  icon: Landmark },
  { value: 'cheque',       label: 'Cheque',         icon: FileText },
  { value: 'adjustment',   label: 'Adjustment',     icon: SlidersHorizontal },
]

export const MOBILE_MONEY_PROVIDERS = [
  'M-Pesa',
  'Airtel Money',
  'Telkom T-Kash',
  'Equitel',
]

export const BANK_PROVIDERS = [
  'KCB',
  'Equity Bank',
  'Co-operative Bank',
  'Absa Bank',
  'NCBA Bank',
  'Standard Chartered',
  'Diamond Trust Bank',
  'Family Bank',
  'I&M Bank',
  'Stanbic Bank',
  'National Bank',
  'Other',
]

export const CHEQUE_STATUSES = [
  { value: 'pending', label: 'Pending',  color: '#d97706' },
  { value: 'cleared', label: 'Cleared',  color: '#16a34a' },
  { value: 'bounced', label: 'Bounced',  color: '#dc2626' },
]

export const ADJUSTMENT_TYPES = ['discount', 'scholarship', 'waiver', 'penalty']

// Role-based access levels
export const PAYMENT_ROLES = ['admin', 'bursar', 'deputy_administrator', 'superadmin']
