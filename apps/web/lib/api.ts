import { createApiClient } from '@e-infak/api-client'
import axios from 'axios'
import { getOrgSlugFromCookie } from './theme'

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Every browser request gets its tenant from the hostname-derived cookie. This
// deliberately replaces any stale page-level header so one tenant cannot leak
// into another after navigating between domains.
axios.interceptors.request.use((config) => {
  const organizationSlug = getOrgSlugFromCookie()
  if (organizationSlug) {
    config.headers.set('x-organization-slug', organizationSlug)
  } else {
    config.headers.delete('x-organization-slug')
  }
  return config
})

export const apiClient = createApiClient({
  baseURL: apiUrl,
  version: 'v1',
})
