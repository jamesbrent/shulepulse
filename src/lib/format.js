export function formatCurrency(amount) {
  const value = Number(amount || 0)
  return `KES ${value.toLocaleString('en-KE')}`
}

export function formatCompactCurrency(amount) {
  const value = Number(amount || 0)
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000
    return `KES ${millions.toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`
  }
  if (abs >= 1_000) {
    return `KES ${Math.round(abs / 1_000)}K`
  }
  return `KES ${abs.toLocaleString('en-KE')}`
}