'use client'

import { useEffect } from 'react'
import { useOrgSettings, type OrgLegalInfo } from '@e-infak/api-client'

const FALLBACK_LEGAL: Pick<OrgLegalInfo, 'kvkk_url' | 'terms_url' | 'preinfo_url'> = {
  kvkk_url: '/kvkk',
  terms_url: '/bagis-kosullari#mesafeli-bagis-sozlesmesi',
  preinfo_url: '/bagis-kosullari#on-bilgilendirme',
}

/** Legal links and whether card payments are possible for the current organisation.
 *  While the settings load, card payments count as available so nothing flickers away. */
export function useCheckoutLegal() {
  const { data } = useOrgSettings()
  return {
    legal: data?.legal ?? FALLBACK_LEGAL,
    cardPayments: data?.card_payments !== false,
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
  legal, kvkk, onKvkk, terms, onTerms, requireTerms, className = '',
}: {
  legal: Pick<OrgLegalInfo, 'kvkk_url' | 'terms_url' | 'preinfo_url'>
  kvkk: boolean
  onKvkk: (v: boolean) => void
  terms: boolean
  onTerms: (v: boolean) => void
  /** Card payments need the distance contract; bank transfers only the KVKK notice. */
  requireTerms: boolean
  className?: string
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      <label className="flex gap-2 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-700">
        <input type="checkbox" checked={kvkk} onChange={(e) => onKvkk(e.target.checked)} />
        <span><DocLink href={legal.kvkk_url}>KVKK Aydınlatma Metni</DocLink>&apos;ni okudum. *</span>
      </label>
      <label className="flex gap-2 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-700">
        <input type="checkbox" checked={terms} onChange={(e) => onTerms(e.target.checked)} />
        <span>
          <DocLink href={legal.preinfo_url}>Ön Bilgilendirme Formu</DocLink>&apos;nu ve{' '}
          <DocLink href={legal.terms_url}>Mesafeli Bağış Sözleşmesi</DocLink>&apos;ni okudum, onaylıyorum.{requireTerms ? ' *' : ''}
        </span>
      </label>
    </div>
  )
}
