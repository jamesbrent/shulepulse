const BASE = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')

export function basePath(p = '') {
  return p ? `${BASE}/${p.replace(/^\/+/, '')}` : BASE || '/'
}
