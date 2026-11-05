import 'server-only'
import { createHmac } from 'crypto'

export function tenantHeaders(orgSlug: string, locale?: string | null): HeadersInit {
  const headers: Record<string, string> = { 'x-organization-slug': orgSlug }
  if (locale && /^[a-z]{2}$/.test(locale)) headers['x-locale'] = locale
  const secret = process.env.TENANT_PROXY_SECRET
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    headers['x-einfak-tenant-timestamp'] = timestamp
    headers['x-einfak-tenant-signature'] = createHmac('sha256', secret)
      .update(`${orgSlug}:${timestamp}`)
      .digest('hex')
  }
  return headers
}
