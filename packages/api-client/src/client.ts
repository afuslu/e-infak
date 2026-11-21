import axios, { AxiosInstance, AxiosError } from 'axios'

export interface ApiClientConfig {
  baseURL: string
  version?: string
}

export class ApiClient {
  private client: AxiosInstance
  private accessToken: string | null = null

  constructor(config: ApiClientConfig) {
    let { baseURL, version = 'v1' } = config

    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      // Production browser traffic is always same-origin. The Next gateway
      // derives and signs tenant context before forwarding to the API.
      baseURL = '/api/backend'
    }

    this.client = axios.create({
      baseURL: `${baseURL}/api/${version}`,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    })

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`
        }
        if (typeof document !== 'undefined' && typeof window !== 'undefined') {
          if (!window.location.pathname.startsWith('/admin')) {
            const lang = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('lang='))?.slice(5)
            if (lang && /^[a-z]{2}$/.test(lang)) config.headers['x-locale'] = lang
          }
          const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          if (isLocal) {
            const orgSlug = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('org_slug='))?.slice(9)
            if (orgSlug) config.headers['x-organization-slug'] = decodeURIComponent(orgSlug)
          }
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const reqConfig = error.config as (typeof error.config & { _retried?: boolean }) | undefined
        const reqUrl = String(reqConfig?.url || '')
        if (error.response?.status === 401 && reqConfig && !reqConfig._retried && !reqUrl.includes('/auth/refresh')) {
          reqConfig._retried = true
          // Try to refresh token once
          const refreshed = await this.refreshToken()
          if (refreshed) {
            return this.client.request(reqConfig)
          }
        }
        return Promise.reject(error)
      }
    )
  }

  setAccessToken(token: string) {
    this.accessToken = token
  }

  clearAccessToken() {
    this.accessToken = null
  }

  private async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) return false

      const response = await this.client.post('/auth/refresh', {
        refresh_token: refreshToken,
      })

      const { access_token, refresh_token: newRefreshToken } = response.data
      if (!access_token) return false
      this.setAccessToken(access_token)
      localStorage.setItem('access_token', access_token)
      if (newRefreshToken) {
        localStorage.setItem('refresh_token', newRefreshToken)
      }

      return true
    } catch {
      this.clearAccessToken()
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      return false
    }
  }

  get<T>(url: string, config?: any) {
    return this.client.get<T>(url, config)
  }

  post<T>(url: string, data?: any, config?: any) {
    return this.client.post<T>(url, data, config)
  }

  patch<T>(url: string, data?: any, config?: any) {
    return this.client.patch<T>(url, data, config)
  }

  delete<T>(url: string, config?: any) {
    return this.client.delete<T>(url, config)
  }
}

// Default client instance
let defaultClient: ApiClient | null = null

export function createApiClient(config: ApiClientConfig): ApiClient {
  defaultClient = new ApiClient(config)
  return defaultClient
}

export function getApiClient(): ApiClient {
  if (!defaultClient) {
    const baseURL = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'
    defaultClient = new ApiClient({ baseURL })
  }
  return defaultClient
}
