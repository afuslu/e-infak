'use client'

import axios from 'axios'
import { platformToken } from './platform-api'

/**
 * Kurum simülasyonu (E-Medrese's "İşlem Yapılan Kurum"): a platform operator opens any
 * organisation's admin panel in the same tab. On the platform host the backend resolves
 * the organisation from the token, so the support token simply replaces `access_token`;
 * the operator's own staff tokens (if any) are kept aside and restored on exit.
 */
const STATE_KEY = 'einfak_simulation'
const BACKUP_ACCESS = 'sim_backup_access_token'
const BACKUP_REFRESH = 'sim_backup_refresh_token'
const BACKUP_SLUG = 'sim_backup_org_slug'
const RECENT_KEY = 'einfak_simulation_recent'
const NONE = '__none__'

export interface SimulationState {
  orgId: string
  orgName: string
  slug: string
  asUser: { email: string; name?: string | null }
  expiresAt: number
}

interface SessionResponse {
  token: string
  expires_in: number
  organization: { id: string; name: string; slug: string }
  as_user: { email: string; name?: string | null }
}

const isLocal = () =>
  typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)

function readCookie(name: string) {
  const hit = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null
}

function writeOrgSlugCookie(slug: string | null) {
  // Only local development selects the tenant by cookie; production hosts ignore it.
  if (!isLocal()) return
  document.cookie = slug
    ? `org-slug=${encodeURIComponent(slug)}; path=/; samesite=lax`
    : 'org-slug=; path=/; max-age=0'
}

export function getSimulation(): SimulationState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STATE_KEY)
    return raw ? (JSON.parse(raw) as SimulationState) : null
  } catch {
    return null
  }
}

export function recentSimulations(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[]
  } catch {
    return []
  }
}

async function requestToken(orgId: string, renew: boolean) {
  const token = platformToken()
  if (!token) throw new Error('Platform oturumu bulunamadı; platform konsoluna yeniden giriş yapın')
  const res = await axios.post<SessionResponse>(
    `${window.location.origin}/api/v1/platform/organizations/${orgId}/support-session`,
    { inline: true, renew },
    { headers: { Authorization: `Bearer ${token}` } },
  )
  return res.data
}

function apply(data: SessionResponse) {
  const state: SimulationState = {
    orgId: data.organization.id,
    orgName: data.organization.name,
    slug: data.organization.slug,
    asUser: data.as_user,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  localStorage.setItem('access_token', data.token)
  localStorage.removeItem('refresh_token')
  localStorage.setItem(STATE_KEY, JSON.stringify(state))
  try { sessionStorage.setItem('support_session', '1') } catch { /* ignore */ }
  writeOrgSlugCookie(state.slug)
  try { window.dispatchEvent(new CustomEvent('einfak:simulation-updated', { detail: state })) } catch { /* ignore */ }
  return state
}

/** Opens the organisation's panel in this tab (switches organisation when already simulating). */
export async function startSimulation(orgId: string, target = '/admin') {
  const data = await requestToken(orgId, false)
  if (!getSimulation()) {
    // First simulation of this tab: keep the operator's own sign-in aside.
    localStorage.setItem(BACKUP_ACCESS, localStorage.getItem('access_token') ?? NONE)
    localStorage.setItem(BACKUP_REFRESH, localStorage.getItem('refresh_token') ?? NONE)
    localStorage.setItem(BACKUP_SLUG, (isLocal() && readCookie('org-slug')) || NONE)
  }
  apply(data)
  const recent = [orgId, ...recentSimulations().filter((id) => id !== orgId)].slice(0, 5)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)) } catch { /* ignore */ }
  window.location.assign(target)
}

let renewing: Promise<string | null> | null = null

/** A fresh token for the same organisation (banner "Uzat", or a 401 in the panel). */
export function renewSimulation(): Promise<string | null> {
  const current = getSimulation()
  if (!current) return Promise.resolve(null)
  if (!renewing) {
    renewing = requestToken(current.orgId, true)
      .then((data) => apply(data) && data.token)
      .catch(() => null)
      .finally(() => { renewing = null })
  }
  return renewing
}

/** Ends the simulation and returns to the platform console. */
export function exitSimulation(redirect = true) {
  const current = getSimulation()
  const restore = (key: string, backup: string) => {
    const value = localStorage.getItem(backup)
    if (value && value !== NONE) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
    localStorage.removeItem(backup)
  }
  restore('access_token', BACKUP_ACCESS)
  restore('refresh_token', BACKUP_REFRESH)
  const slug = localStorage.getItem(BACKUP_SLUG)
  writeOrgSlugCookie(slug && slug !== NONE ? slug : null)
  localStorage.removeItem(BACKUP_SLUG)
  localStorage.removeItem(STATE_KEY)
  try { sessionStorage.removeItem('support_session') } catch { /* ignore */ }
  if (redirect) window.location.assign(current ? `/platform/kurum/${current.orgId}` : '/platform')
}
