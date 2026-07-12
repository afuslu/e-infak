import { createApiClient } from '@e-infak/api-client'

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const apiClient = createApiClient({
  baseURL: apiUrl,
  version: 'v1',
})
