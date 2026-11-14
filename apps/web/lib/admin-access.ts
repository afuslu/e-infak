'use client'

import axios from 'axios'
import { useQuery } from '@tanstack/react-query'

export interface FeatureInfo {
  key: string
  label: string
  enabled: boolean
  in_plan: boolean
  addon_available: boolean
}

/** One module card of the role screen (services/backend/app/core/capabilities.py). */
export interface CapabilityGroup {
  key: string
  label: string
  permission: string
  capabilities: { key: string; label: string; rule: boolean }[]
}

export interface AdminAccess {
  plan: string
  plan_label: string
  features: string[]
  addons: string[]
  catalog: FeatureInfo[]
  plans: { key: string; label: string; features: string[]; addons: string[]; users: number; bank_accounts: number; storage_mb: number }[]
  limits: { users: number; extra_user_seats: number; bank_accounts: number; storage_bytes: number }
  usage: { users: number; bank_accounts: number; storage_bytes: number; media_count: number }
  me: { id: string; role: string; is_platform_admin: boolean; permissions: string[]; capabilities?: string[] }
  permission_catalog: { key: string; label: string }[]
  capability_catalog?: CapabilityGroup[]
  builtin_roles: { key: string; label: string; permissions: string[] }[]
}

export function adminApiBase() {
  return (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'
}

export function adminAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  if (refreshInFlight) return refreshInFlight
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return null
  refreshInFlight = axios
    .post<{ access_token: string; refresh_token?: string }>(`${adminApiBase()}/api/v1/auth/refresh`, {
      refresh_token: refreshToken,
    })
    .then((res) => {
      const nextAccess = res.data?.access_token
      if (!nextAccess) return null
      localStorage.setItem('access_token', nextAccess)
      if (res.data?.refresh_token) localStorage.setItem('refresh_token', res.data.refresh_token)
      return nextAccess
    })
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

function redirectToLogin() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  if (!window.location.pathname.startsWith('/giris')) {
    window.location.assign('/giris')
  }
}

async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 401) {
      const nextToken = await refreshAccessToken()
      if (nextToken) {
        try {
          return await fn()
        } catch (retryErr) {
          if ((retryErr as { response?: { status?: number } })?.response?.status === 401) {
            redirectToLogin()
          }
          throw retryErr
        }
      }
      redirectToLogin()
    }
    throw err
  }
}

export function adminGet<T>(path: string, params?: Record<string, unknown>) {
  return withAuthRetry(() => axios.get<T>(`${adminApiBase()}/api/v1/admin-features${path}`, { headers: adminAuthHeaders(), params }))
}

export function adminSend<T>(method: 'post' | 'put' | 'patch' | 'delete', path: string, data?: unknown) {
  return withAuthRetry(() =>
    axios.request<T>({
      method,
      url: `${adminApiBase()}/api/v1/admin-features${path}`,
      headers: adminAuthHeaders(),
      data,
    }),
  )
}

/** Turns FastAPI error payloads (string, object or validation list) into one message. */
export function apiErrorMessage(err: unknown, fallback = 'İşlem tamamlanamadı') {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') {
    if (detail === 'Invalid authentication credentials' || detail === 'Not authenticated') {
      return 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.'
    }
    return detail
  }
  if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(', ') || fallback
  if (typeof detail === 'object' && 'message' in detail) return String((detail as { message: unknown }).message)
  return fallback
}

export function useAdminAccess() {
  return useQuery({
    queryKey: ['admin-access'],
    queryFn: async () => (await adminGet<AdminAccess>('/access')).data,
    staleTime: 60_000,
    retry: false,
  })
}

export function hasFeature(access: AdminAccess | undefined, feature?: string) {
  if (!feature) return true
  // Until the package is known, don't hide anything; the API enforces access anyway.
  if (!access) return true
  return access.features.includes(feature)
}

export function hasPermission(access: AdminAccess | undefined, permission?: string) {
  if (!permission) return true
  if (!access) return true
  return access.me.permissions.includes(permission)
}

/** Fine-grained permission (e.g. "donors.phone"). Unknown until loaded: allowed, the API enforces it. */
export function can(access: AdminAccess | undefined, capability: string) {
  if (!access || !access.me.capabilities) return true
  return access.me.capabilities.includes(capability)
}

export const formatMoney = (cents: number, currency = 'TRY') =>
  (cents / 100).toLocaleString('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 })

/** Requests to /api/v1/<path> (modules that are not under /admin-features, e.g. /kurban). */
export function v1Get<T>(path: string, params?: Record<string, unknown>) {
  return withAuthRetry(() => axios.get<T>(`${adminApiBase()}/api/v1${path}`, { headers: adminAuthHeaders(), params }))
}

export function v1Send<T>(method: 'post' | 'put' | 'patch' | 'delete', path: string, data?: unknown) {
  return withAuthRetry(() => axios.request<T>({ method, url: `${adminApiBase()}/api/v1${path}`, headers: adminAuthHeaders(), data }))
}

/** Downloads an authenticated file (PDF etc.) and saves it under `filename`. */
export async function downloadFile(path: string, filename: string, params?: Record<string, unknown>) {
  const res = await withAuthRetry(() => axios.get(`${adminApiBase()}/api/v1${path}`, { headers: adminAuthHeaders(), responseType: 'blob', params }))
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = '\uFEFF' + [header, ...rows].map((r) => r.map(escape).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Builds a WhatsApp (`wa.me`) link for Turkish/international phone numbers. */
export function whatsappUrl(phone: string | null | undefined, text: string): string | null {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length < 10) return null
  const normalized = digits.startsWith('00')
    ? digits.slice(2)
    : digits.startsWith('0')
      ? `90${digits.slice(1)}`
      : digits.length === 10 && digits.startsWith('5')
        ? `90${digits}`
        : digits
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`
}
