import axios, { AxiosInstance, AxiosError } from 'axios'

export interface ApiClientConfig {
  baseURL: string
  version?: string
}

export class ApiClient {
  private client: AxiosInstance
  private accessToken: string | null = null

  constructor(config: ApiClientConfig) {
    const { baseURL, version = 'v1' } = config

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
        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Try to refresh token
          const refreshed = await this.refreshToken()
          if (refreshed && error.config) {
            return this.client.request(error.config)
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
      this.setAccessToken(access_token)
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('refresh_token', newRefreshToken)

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
    if (typeof window === 'undefined') {
      return new ApiClient({ baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000' })
    }
    throw new Error('API client not initialized. Call createApiClient first.')
  }
  return defaultClient
}
