'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CONSENT_EVENT, CONSENT_OPEN_EVENT, readConsent, saveConsent, type Consent } from '../../lib/consent'
import { usePathname } from 'next/navigation'
import { useOrgSettings } from '@e-infak/api-client'

const TAWK_ID = /^[a-f0-9]{24}\/[a-z0-9]{6,16}$/

declare global {
  interface Window {
    Tawk_API?: Record<string, unknown>
    Tawk_LoadStart?: Date
  }
}

function isStaffArea(pathname: string | null) {
  return !!pathname && (pathname.startsWith('/admin') || pathname.startsWith('/giris'))
}

/** WhatsApp contact button and Tawk.to live chat, both configured in Site Ayarları. */
export function SiteWidgets() {
  const pathname = usePathname()
  const { data: settings } = useOrgSettings()
  const staffArea = isStaffArea(pathname)
  const chatId = settings?.live_chat_provider === 'tawk' && settings.live_chat_id && TAWK_ID.test(settings.live_chat_id)
    ? settings.live_chat_id
    : null

  // Optional services wait for the visitor's permission (KVKK / ePrivacy); essential ones need none.
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined)
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    setConsent(readConsent())
    const changed = (event: Event) => { setConsent((event as CustomEvent<Consent>).detail); setAsking(false) }
    const open = () => setAsking(true)
    window.addEventListener(CONSENT_EVENT, changed)
    window.addEventListener(CONSENT_OPEN_EVENT, open)
    return () => { window.removeEventListener(CONSENT_EVENT, changed); window.removeEventListener(CONSENT_OPEN_EVENT, open) }
  }, [])
  const hasOptional = !!chatId

  useEffect(() => {
    if (staffArea || !chatId || consent !== 'all' || document.getElementById('tawk-loader')) return
    window.Tawk_API = window.Tawk_API || {}
    window.Tawk_LoadStart = new Date()
    const script = document.createElement('script')
    script.id = 'tawk-loader'
    script.async = true
    script.src = `https://embed.tawk.to/${chatId}`
    script.charset = 'UTF-8'
    script.setAttribute('crossorigin', '*')
    document.body.appendChild(script)
  }, [chatId, staffArea, consent])

  const number = settings?.whatsapp_number?.replace(/\D/g, '')
  const instagramUrl = settings?.instagram_url?.trim() || null
  if (staffArea) return null
  const text = settings?.whatsapp_message ? `?text=${encodeURIComponent(settings.whatsapp_message)}` : ''
  const showBanner = hasOptional && (asking || consent === null)

  return (
    <>
      {showBanner && (
        <div role="dialog" aria-label="Çerez tercihleri" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-2xl sm:p-5">
          <p className="leading-6">
            Sitenin çalışması için gerekli çerezleri kullanıyoruz. İzin verirseniz canlı destek penceresi de yüklenir ve kendi
            çerezlerini kullanır. Ayrıntılar: <Link href="/gizlilik#cerezler" className="font-semibold text-primary-700 underline">Gizlilik ve Çerez Politikası</Link>.
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => saveConsent('essential')} className="rounded-xl border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:border-gray-400">Yalnız gerekli</button>
            <button type="button" onClick={() => saveConsent('all')} className="rounded-xl bg-primary-600 px-4 py-2 font-bold text-white hover:bg-primary-700">Tümüne izin ver</button>
          </div>
        </div>
      )}
      {(instagramUrl || number) && (
        <div className="float-above-tabbar fixed bottom-6 left-6 z-40 flex flex-col gap-3">
          {instagramUrl && <InstagramButton href={instagramUrl} />}
          {number && <WhatsAppButton href={`whatsapp://send?phone=${number}${text.startsWith('?') ? `&${text.slice(1)}` : text}`} />}
        </div>
      )}
    </>
  )
}

function InstagramButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Instagram hesabımız"
      className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white shadow-2xl transition hover:scale-105"
    >
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
        <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10m0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
      </svg>
    </a>
  )
}

function WhatsAppButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp ile yazın"
      className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl transition hover:scale-105"
    >
      <svg viewBox="0 0 32 32" width="30" height="30" fill="currentColor" aria-hidden="true">
        <path d="M16.04 3C9.4 3 4 8.36 4 14.97c0 2.11.56 4.17 1.62 5.99L4 29l8.27-1.6a12.1 12.1 0 0 0 3.77.6C22.68 28 28 22.64 28 16.03 28 9.4 22.68 3 16.04 3Zm0 22.3c-1.2 0-2.38-.2-3.5-.6l-.25-.09-4.9.95.98-4.73-.16-.26a9.97 9.97 0 0 1-1.54-5.33c0-5.5 4.48-9.98 9.99-9.98 5.48 0 9.94 4.53 9.94 10.03 0 5.5-4.47 10.01-9.95 10.01Zm5.48-7.48c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.78.97-.96 1.17-.18.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.49-.9-.8-1.5-1.78-1.67-2.08-.18-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.62-.93-2.22-.24-.58-.49-.5-.68-.51h-.58c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.48.71.31 1.27.5 1.7.63.72.23 1.37.2 1.88.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z" />
      </svg>
    </a>
  )
}
