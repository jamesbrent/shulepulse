export async function loadLogoBase64(school) {
  if (!school?.logo_url) return null
  try {
    const res = await fetch(school.logo_url, { cache: 'force-cache', mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    try {
      const img = await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('image load failed'))
        img.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const dataUrl = canvas.toDataURL('image/png')
      return { dataUrl, aspectRatio: img.naturalWidth / img.naturalHeight }
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  }
}

export function logoSizes(logo) {
  if (!logo) return null
  const height = 22
  let width = height * logo.aspectRatio
  if (width > 55) { width = 55 }
  return { width, height }
}

export function fmtRef(ref) {
  if (!ref || ref === '—') return '—'
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) {
    return ref.slice(0, 8).toUpperCase()
  }
  return ref
}
