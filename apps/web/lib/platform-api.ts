'use client'

import axios from 'axios'

/** Platform console API; the token is kept apart from organisation sign-ins. */
const TOKEN_KEY = 'platform_token'

export function platformToken() {
  return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
}

export function setPlatformToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export const PASSWORD_CHANGE_REQUIRED = 'password_change_required'

export interface PlatformMe { id?: string; email: string; full_name: string; role?: 'admin' | 'support'; must_change_password: boolean }

function base() {
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/platform`
}

export async function platformCall<T>(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, data?: unknown) {
  try {
    const res = await axios.request<T>({
      method, url: `${base()}${path}`, data,
      headers: platformToken() ? { Authorization: `Bearer ${platformToken()}` } : {},
    })
    return res.data
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 401 && path !== '/auth/login' && typeof window !== 'undefined') {
      setPlatformToken(null)
      window.location.href = '/platform/giris'
    }
    // Signed in with a temporary password: nothing else is allowed until it is changed.
    if (status === 403 && typeof window !== 'undefined' && window.location.pathname !== '/platform/sifre'
        && (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail === PASSWORD_CHANGE_REQUIRED) {
      window.location.href = '/platform/sifre'
    }
    throw err
  }
}

export interface PlatformDomain {
  id: string; domain: string; status: string; is_primary: boolean; verification_token: string
  last_checked_at: string | null; last_check_error: string | null
  dns_records: { type: string; name: string; host: string; value: string }[]
}
export interface PlatformOrg {
  id: string; slug: string; name: string; legal_name: string; email: string
  phone?: string | null; city?: string | null
  plan: string; plan_label: string; enabled_addons: string[]; extra_user_seats: number; user_limit: number
  subscription_status?: string; billing_cycle?: string; subscription_ends_at?: string | null; monthly_fee_cents?: number
  is_active: boolean; template: string; subdomain: string; url: string
  payment_provider: string; sms_provider: string; sms_platform_fallback: boolean
  domains: PlatformDomain[]; created_at: string | null
  user_count?: number; donation_count?: number; last_donation_at?: string | null
}
export interface Catalog {
  plans: { key: string; label: string; addons: string[] }[]
  features: Record<string, string>
  templates: { key: string; label: string }[]
  base_domain: string
  public_ip: string
  roles: { key: string; label: string }[]
  payment_providers: { key: string; label: string }[]
  sms_providers: { key: string; label: string }[]
}

export interface PlatformAlert {
  organization_id: string | null
  organization_name: string
  level: 'danger' | 'warning' | 'info'
  kind: string
  message: string
  hint: string | null
}

/** FastAPI error payload (string, {message} object or validation list) as one line. */
export function platformError(err: unknown, fallback: string) {
  const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(', ') || fallback
  if (detail && typeof detail === 'object' && 'message' in detail) return String((detail as { message: unknown }).message)
  return fallback
}

export const dateTr = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

/** Copies text; false when the browser refuses (insecure origin, denied permission). */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export interface Credentials { email: string; temporary_password: string; login_url: string; email_sent?: boolean }

export const credentialsText = (c: Credentials) =>
  `Giriş adresi: ${c.login_url}\nE-posta: ${c.email}\nGeçici şifre: ${c.temporary_password}\n(İlk girişte şifrenizi değiştirmeniz istenecek.)`
