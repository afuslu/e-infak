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

export interface AdminAccess {
  plan: string
  plan_label: string
  features: string[]
  addons: string[]
  catalog: FeatureInfo[]
  plans: { key: string; label: string; features: string[]; addons: string[]; users: number }[]
  limits: { users: number; extra_user_seats: number; bank_accounts: number }
  usage: { users: number }
  me: { id: string; role: string; is_platform_admin: boolean; permissions: string[] }
  permission_catalog: { key: string; label: string }[]
  builtin_roles: { key: string; label: string; permissions: string[] }[]
}

export function adminApiBase() {
  return (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'
}

export function adminAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
  return { Authorization: `Bearer ${token}` }
}

export function adminGet<T>(path: string, params?: Record<string, unknown>) {
  return axios.get<T>(`${adminApiBase()}/api/v1/admin-features${path}`, { headers: adminAuthHeaders(), params })
}

export function adminSend<T>(method: 'post' | 'put' | 'delete', path: string, data?: unknown) {
  return axios.request<T>({
    method,
    url: `${adminApiBase()}/api/v1/admin-features${path}`,
    headers: adminAuthHeaders(),
    data,
  })
}

/** Turns FastAPI error payloads (string, object or validation list) into one message. */
export function apiErrorMessage(err: unknown, fallback = 'İşlem tamamlanamadı') {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
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

export const formatMoney = (cents: number, currency = 'TRY') =>
  (cents / 100).toLocaleString('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 })

/** Requests to /api/v1/<path> (modules that are not under /admin-features, e.g. /kurban). */
export function v1Get<T>(path: string, params?: Record<string, unknown>) {
  return axios.get<T>(`${adminApiBase()}/api/v1${path}`, { headers: adminAuthHeaders(), params })
}

export function v1Send<T>(method: 'post' | 'put' | 'patch' | 'delete', path: string, data?: unknown) {
  return axios.request<T>({ method, url: `${adminApiBase()}/api/v1${path}`, headers: adminAuthHeaders(), data })
}

/** Downloads an authenticated file (PDF etc.) and saves it under `filename`. */
export async function downloadFile(path: string, filename: string, params?: Record<string, unknown>) {
  const res = await axios.get(`${adminApiBase()}/api/v1${path}`, { headers: adminAuthHeaders(), responseType: 'blob', params })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = '﻿' + [header, ...rows].map((r) => r.map(escape).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
