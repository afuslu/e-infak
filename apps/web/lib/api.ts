import { createApiClient } from '@e-infak/api-client'
import axios from 'axios'
import { getOrgSlugFromCookie } from './theme'
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// In production requests use the same-origin gateway. It derives tenant from
// the Host header, so a browser-controlled cookie/header cannot switch tenant.
axios.interceptors.request.use((config) => {
  // The admin panel always works on the default-language records.
  if (typeof document !== 'undefined' && !window.location.pathname.startsWith('/admin')) {
    const lang = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('lang='))?.slice(5)
    if (lang && /^[a-z]{2}$/.test(lang)) config.headers.set('x-locale', lang)
  }
  const isLocal = typeof window !== 'undefined'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  if (isLocal) {
    const orgSlug = getOrgSlugFromCookie()
    if (orgSlug) config.headers.set('x-organization-slug', orgSlug)
  } else {
    config.headers.delete('x-organization-slug')
  }
  return config
})

export const apiClient = createApiClient({
  baseURL: apiUrl,
  version: 'v1',
})
