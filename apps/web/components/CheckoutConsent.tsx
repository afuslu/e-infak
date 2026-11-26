'use client'

import { useEffect, useState } from 'react'
import { useOrgSettings, type OrgLegalInfo } from '@e-infak/api-client'

const FALLBACK_LEGAL: Pick<OrgLegalInfo, 'kvkk_url' | 'terms_url' | 'preinfo_url'> = {
  kvkk_url: '/kvkk',
  terms_url: '/bagis-kosullari#mesafeli-bagis-sozlesmesi',
  preinfo_url: '/bagis-kosullari#on-bilgilendirme',
}

export interface LoggedInDonorProfile {
  firstName: string
  lastName: string
  email: string
  phone: string
}

/** Detects if the visitor is signed into the Donor Portal (`einfak-portal`) and fetches their profile. */
export function useLoggedInDonor(): { isLoggedIn: boolean; donor: LoggedInDonorProfile | null } {
  const [donor, setDonor] = useState<LoggedInDonorProfile | null>(null)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const raw = localStorage.getItem('einfak-portal') || sessionStorage.getItem('einfak-portal')
        const saved = raw ? JSON.parse(raw) : null
        if (!saved?.token || (saved.role && saved.role !== 'donor')) {
          if (!cancelled) setDonor(null)
          return
        }
        const res = await fetch('/api/backend/api/v1/portal/me/profile', {
          headers: { Authorization: `Bearer ${saved.token}` },
        })
        if (!res.ok) {
          if (!cancelled) setDonor(null)
          return
        }
        const data = await res.json()
        if (cancelled) return
        const firstName = String(data?.first_name || '').trim() || 'Değerli'
        const lastName = String(data?.last_name || '').trim() || 'Bağışçı'
        const email = String(data?.email || '').trim()
        const phone = String(data?.phone || '').trim() || '05000000000'
        setDonor({ firstName, lastName, email, phone })
      } catch {
        if (!cancelled) setDonor(null)
      }
    }
    check()
    window.addEventListener('storage', check)
    window.addEventListener('portal-session-changed', check)
    return () => {
      cancelled = true
      window.removeEventListener('storage', check)
      window.removeEventListener('portal-session-changed', check)
    }
  }, [])

  return { isLoggedIn: donor !== null, donor }
}

/** Legal links and whether card payments are possible for the current organisation.
 *  While the settings load, card payments count as available so nothing flickers away. */
export function useCheckoutLegal() {
  const { data } = useOrgSettings()
  return {
    legal: data?.legal ?? FALLBACK_LEGAL,
    cardPayments: data?.card_payments !== false,
    whatsappOptin: Boolean(data?.whatsapp_optin),
    ibanPageUrl: data?.iban_page_url || '/hesap-numaralarimiz',
  }
}

/** Switches a form to bank transfer once it is known the organisation has no card provider. */
export function useCardFallback(
  cardPayments: boolean,
  method: 'credit_card' | 'bank_transfer',
  setMethod: (m: 'credit_card' | 'bank_transfer') => void,
) {
  useEffect(() => {
    if (!cardPayments && method === 'credit_card') setMethod('bank_transfer')
  }, [cardPayments, method, setMethod])
}

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  // New tab: the donor keeps what they typed into the form.
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-bold text-primary-700 underline underline-offset-2">
      {children}
    </a>
  )
}

export function ConsentChecks({
  legal, kvkk, onKvkk, onTerms, className = '', whatsapp, onWhatsapp,
}: {
  legal: Pick<OrgLegalInfo, 'kvkk_url' | 'terms_url' | 'preinfo_url'>
  kvkk: boolean
  onKvkk: (v: boolean) => void
  terms?: boolean
  onTerms?: (v: boolean) => void
  requireTerms?: boolean
  className?: string
  /** Optional WhatsApp opt-in; shown only when `onWhatsapp` is given. */
  whatsapp?: boolean
  onWhatsapp?: (v: boolean) => void
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      <label className="flex gap-2 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-700">
        <input
          type="checkbox"
          checked={kvkk}
          onChange={(e) => {
            onKvkk(e.target.checked)
            onTerms?.(e.target.checked)
          }}
        />
        <span><DocLink href={legal.kvkk_url}>KVKK Aydınlatma Metni</DocLink>&apos;ni okudum. *</span>
      </label>
      {onWhatsapp && (
        <label className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
          <input type="checkbox" checked={Boolean(whatsapp)} onChange={(e) => onWhatsapp(e.target.checked)} />
          <span>Bağışım ve projeler hakkında WhatsApp&apos;tan bilgilendirilmek istiyorum. (İstediğiniz zaman DUR yazarak çıkabilirsiniz.)</span>
        </label>
      )}
    </div>
  )
}
