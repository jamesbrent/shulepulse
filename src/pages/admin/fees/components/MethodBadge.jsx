import { Smartphone, Landmark, Banknote, FileText, SlidersHorizontal } from 'lucide-react'

const METHOD_ICONS = {
  mpesa: Smartphone,
  mobile_money: Smartphone,
  bank: Landmark,
  cash: Banknote,
  cheque: FileText,
  adjustment: SlidersHorizontal,
}

const METHOD_LABELS = {
  mpesa:        'M-Pesa',
  bank:         'Bank',
  cash:         'Cash',
  mobile_money: 'Mobile Money',
  cheque:       'Cheque',
  adjustment:   'Adjustment',
}

const TYPE_CLASS = {
  mpesa: 'mpesa', mobile_money: 'mpesa',
  bank: 'bank',
  cash: 'cash',
  cheque: 'cheque',
  adjustment: 'waiver',
}

export function MethodBadge({ method, provider }) {
  const Icon = METHOD_ICONS[method]
  const label = METHOD_LABELS[method] || method
  const cls = TYPE_CLASS[method] || method
  return (
    <span className={`method-badge ${cls}`}>
      {Icon ? <Icon size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> : null}
      {label}{provider ? ` — ${provider}` : ''}
    </span>
  )
}