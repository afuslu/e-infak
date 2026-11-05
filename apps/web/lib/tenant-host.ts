/**
 * Host name → organisation slug, shared by middleware.ts (edge) and the API
 * gateway route (node). The backend owns the mapping (subdomains and verified
 * custom domains, see services/backend/app/services/tenancy.py); answers are
 * kept in memory for a minute per server instance.
 */

const API_BASE = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020').replace(/\/$/, '')
const PLATFORM_DOMAIN = (process.env.PLATFORM_BASE_DOMAIN || 'e-infak.org').toLowerCase()
const DEV_DEFAULT_ORG = process.env.DEFAULT_ORG_SLUG || 'hicret-dernegi'
const TTL_MS = 60_000
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/

const cache = new Map<string, { slug: string; expires: number }>()

export function normalizeHost(value: string | null): string {
  return (value || '').split(':')[0].trim().toLowerCase().replace(/\.$/, '')
}

export function isLocalHost(host: string) {
  return host === 'localhost' || host === '127.0.0.1'
}

/** e-infak.org itself (platform landing page and console). */
export function isPlatformHost(host: string) {
  return host === PLATFORM_DOMAIN || host === `www.${PLATFORM_DOMAIN}`
}

export function validSlug(value: string | null | undefined): string {
  const slug = (value || '').toLowerCase()
  return SLUG.test(slug) ? slug : ''
}

/** Local development: ?org=, then the org-slug cookie, then DEFAULT_ORG_SLUG. */
export function devOrgSlug(queryOrg: string | null, cookieOrg: string | null | undefined) {
  return validSlug(queryOrg) || validSlug(cookieOrg) || DEV_DEFAULT_ORG
}

export async function resolveHostSlug(host: string): Promise<string> {
  if (!host || isLocalHost(host) || isPlatformHost(host)) return ''
  const hit = cache.get(host)
  if (hit && hit.expires > Date.now()) return hit.slug
  try {
    const res = await fetch(`${API_BASE}/api/v1/internal/resolve-host?host=${encodeURIComponent(host)}`, { cache: 'no-store' })
    const slug = res.ok ? validSlug((await res.json()).slug) : ''
    if (res.ok || res.status === 404) cache.set(host, { slug, expires: Date.now() + TTL_MS })
    if (cache.size > 5000) cache.clear()
    return slug
  } catch {
    return '' // backend unreachable: don't cache, try again on the next request
  }
}
