'use client'

type ConversionEvent =
  | 'campaign_viewed'
  | 'add_to_cart'
  | 'checkout_started'
  | 'payment_redirected'
  | 'payment_succeeded'
  | 'payment_failed'

type EventProperties = Record<string, string | number | boolean | undefined>

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>
  }
}

/** Emits aggregate, non-PII events for a consent-aware analytics provider. */
export function trackConversion(event: ConversionEvent, properties: EventProperties = {}) {
  if (typeof window === 'undefined') return
  const payload = { event: `einfak_${event}`, ...properties }
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(payload)
  window.dispatchEvent(new CustomEvent('einfak:conversion', { detail: payload }))
}
