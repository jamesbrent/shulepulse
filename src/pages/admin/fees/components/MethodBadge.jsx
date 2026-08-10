const METHOD_LABELS = {
  mpesa:        '📱 M-Pesa',
  bank:         '🏦 Bank',
  cash:         '💵 Cash',
  mobile_money: '📱 Mobile Money',
  cheque:       '📄 Cheque',
  adjustment:   '🔧 Adjustment',
}

const TYPE_CLASS = {
  mpesa: 'mpesa', mobile_money: 'mpesa',
  bank: 'bank',
  cash: 'cash',
  cheque: 'cheque',
  adjustment: 'waiver',
}

export function MethodBadge({ method, provider }) {
  const label = METHOD_LABELS[method] || method
  const cls = TYPE_CLASS[method] || method
  return (
    <span className={`method-badge ${cls}`}>
      {label}{provider ? ` — ${provider}` : ''}
    </span>
  )
}