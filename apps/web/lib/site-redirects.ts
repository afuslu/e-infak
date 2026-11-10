/**
 * Per-site permanent redirects (old address → new address), e.g. after moving from another
 * platform. The table lives in the backend (Site Builder › Yönlendirmeler); the middleware
 * answers matches with a 301. Tables are kept in memory for a minute per server instance.
 */
const API_BASE = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020').replace(/\/$/, '')
const TTL_MS = 60_000
const cache = new Map<string, { map: Record<string, string>; expires: number }>()

// Never looked up: the app's own areas and static files.
const SKIP = /^\/(api|_next|admin|platform|site-yapici-cerceve|portal|kampanyalar|haberler|sayfa)(\/|$)|\.[a-z0-9]{2,5}$/i

export function normalizePath(pathname: string) {
  const path = pathname.toLowerCase()
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

async function table(orgSlug: string): Promise<Record<string, string>> {
  const hit = cache.get(orgSlug)
  if (hit && hit.expires > Date.now()) return hit.map
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/redirects`, { headers: { 'X-Organization-Slug': orgSlug }, cache: 'no-store' })
    const map = res.ok ? ((await res.json()).redirects || {}) : {}
    if (res.ok || res.status === 404) cache.set(orgSlug, { map, expires: Date.now() + TTL_MS })
    if (cache.size > 2000) cache.clear()
    return map
  } catch {
    return {}
  }
}

/** Target of `pathname` for this organisation, or null. */
export async function redirectTarget(orgSlug: string, pathname: string): Promise<string | null> {
  if (!orgSlug || pathname === '/' || SKIP.test(pathname)) return null
  const map = await table(orgSlug)
  return map[normalizePath(pathname)] || null
}
