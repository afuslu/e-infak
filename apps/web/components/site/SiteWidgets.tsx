'use client'

import { useEffect } from 'react'
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

  useEffect(() => {
    if (staffArea || !chatId || document.getElementById('tawk-loader')) return
    window.Tawk_API = window.Tawk_API || {}
    window.Tawk_LoadStart = new Date()
    const script = document.createElement('script')
    script.id = 'tawk-loader'
    script.async = true
    script.src = `https://embed.tawk.to/${chatId}`
    script.charset = 'UTF-8'
    script.setAttribute('crossorigin', '*')
    document.body.appendChild(script)
  }, [chatId, staffArea])

  const number = settings?.whatsapp_number?.replace(/\D/g, '')
  if (staffArea || !number) return null
  const text = settings?.whatsapp_message ? `?text=${encodeURIComponent(settings.whatsapp_message)}` : ''

  return (
    <a
      href={`https://wa.me/${number}${text}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp ile yazın"
      className="float-above-tabbar fixed bottom-6 left-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl transition hover:scale-105"
    >
      <svg viewBox="0 0 32 32" width="30" height="30" fill="currentColor" aria-hidden="true">
        <path d="M16.04 3C9.4 3 4 8.36 4 14.97c0 2.11.56 4.17 1.62 5.99L4 29l8.27-1.6a12.1 12.1 0 0 0 3.77.6C22.68 28 28 22.64 28 16.03 28 9.4 22.68 3 16.04 3Zm0 22.3c-1.2 0-2.38-.2-3.5-.6l-.25-.09-4.9.95.98-4.73-.16-.26a9.97 9.97 0 0 1-1.54-5.33c0-5.5 4.48-9.98 9.99-9.98 5.48 0 9.94 4.53 9.94 10.03 0 5.5-4.47 10.01-9.95 10.01Zm5.48-7.48c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.78.97-.96 1.17-.18.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.49-.9-.8-1.5-1.78-1.67-2.08-.18-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.62-.93-2.22-.24-.58-.49-.5-.68-.51h-.58c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.48.71.31 1.27.5 1.7.63.72.23 1.37.2 1.88.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z" />
      </svg>
    </a>
  )
}
