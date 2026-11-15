'use client'

/** Visitor's choice for optional services (live chat, statistics). Essential storage needs none. */
export type Consent = 'all' | 'essential'

const KEY = 'einfak_consent'
export const CONSENT_EVENT = 'einfak-consent-change'
export const CONSENT_OPEN_EVENT = 'einfak-consent-open'

export function readConsent(): Consent | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'all' || value === 'essential' ? value : null
  } catch {
    return null
  }
}

export function saveConsent(value: Consent) {
  try { localStorage.setItem(KEY, value) } catch { /* storage blocked: ask again next time */ }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }))
}

export const openConsent = () => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))
