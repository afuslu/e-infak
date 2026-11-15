import * as SecureStore from 'expo-secure-store'

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://api.e-infak.org/api/v1'
export const WEB_BASE_URL =
  process.env.EXPO_PUBLIC_WEB_URL || 'https://e-infak.org'

const TOKEN_KEY = 'einfak_access_token'
const REFRESH_KEY = 'einfak_refresh_token'
const TENANT_KEY = 'einfak_tenant_host'

export async function getTokens() {
  const [access, refresh, tenant] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
    SecureStore.getItemAsync(TENANT_KEY),
  ])
  return { access, refresh, tenant }
}

export async function saveTokens(access: string, refresh?: string | null, tenant?: string | null) {
  await SecureStore.setItemAsync(TOKEN_KEY, access)
  if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh)
  if (tenant !== undefined) {
    if (tenant) await SecureStore.setItemAsync(TENANT_KEY, tenant)
    else await SecureStore.deleteItemAsync(TENANT_KEY)
  }
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ])
}

export function formatMoney(cents: number, currency = 'TRY'): string {
  const amount = (cents || 0) / 100
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const { refresh, tenant } = await getTokens()
  if (!refresh) return null
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (tenant) headers['X-Forwarded-Host'] = tenant
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ refresh_token: refresh }),
  })
  if (!res.ok) {
    await clearTokens()
    return null
  }
  const data = await res.json()
  if (data?.access_token) {
    await saveTokens(data.access_token, data.refresh_token || refresh)
    return data.access_token
  }
  return null
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { access, tenant } = await getTokens()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (tenant) headers['X-Forwarded-Host'] = tenant
  if (options.auth !== false && access) {
    headers.Authorization = `Bearer ${access}`
  }

  let res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  if (res.status === 401 && options.auth !== false) {
    const newAccess = await refreshAccessToken()
    if (newAccess) {
      headers.Authorization = `Bearer ${newAccess}`
      res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
    }
  }

  if (!res.ok) {
    let message = `İstek başarısız (${res.status})`
    try {
      const err = await res.json()
      message = err?.detail || err?.message || message
    } catch {
      // ignore json parse failure
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
