'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Menu, X } from 'lucide-react'

export function PortalMobileNav({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Menüyü aç"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-pt-line text-pt-muted hover:border-pt-brand hover:text-pt-text">
        {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-30 border-b border-pt-line bg-pt-bg px-4 py-4 shadow-lg">
          <nav className="flex flex-col gap-1 text-sm font-semibold" aria-label="Mobil menü">
            {items.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-pt-text hover:bg-pt-soft">
                {label}
              </a>
            ))}
            <Link href="/giris" onClick={() => setOpen(false)}
              className="mt-1 rounded-lg border border-pt-line px-3 py-2.5 text-center text-pt-text hover:border-pt-brand">
              Kurum Girişi
            </Link>
          </nav>
        </div>
      )}
    </div>
  )
}

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Ödeme tutarları nereye geçer? Hangi sanal POS’ları kullanabiliriz?',
    a: 'Bağışlar aracı bir havuza değil, doğrudan kurumunuzun anlaşmalı olduğu ödeme kuruluşu (iyzico, PayTR vb.) veya banka sanal POS’u üzerinden kendi hesabınıza geçer.',
  },
  {
    q: 'Kendi alan adımızı ve eski bağışçı listemizi taşıyabilir miyiz?',
    a: 'Evet. Kendi alan adınızı (ör. bagis.dernegimiz.org) bağlıyoruz; Excel veya mevcut yazılımınızdaki bağışçı ve bağış geçmişini kurulum sırasında ücretsiz aktarıyoruz.',
  },
  {
    q: 'Verilerimiz güvende mi? KVKK ve yedekleme nasıl sağlanıyor?',
    a: 'Tüm trafik SSL ile şifrelenir, her kurumun verisi mantıksal olarak izole edilir ve günlük otomatik yedek alınır. SMS gönderimleri İYS ve gece saati kurallarına uygun çalışır.',
  },
  {
    q: 'Kurulum ne kadar sürer? Uzun süreli taahhüt var mı?',
    a: 'Ödeme ve SMS bilgileriniz hazırsa genellikle birkaç iş günü içinde siteniz ve panelleriniz yayına alınır. Yıllık veya aylık esnek paketlerle çalışabilirsiniz; gizli kurulum ücreti yoktur.',
  },
]

export function PortalFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <div className="mt-10 divide-y divide-pt-line rounded-2xl border border-pt-line bg-pt-card">
      {FAQS.map((item, idx) => {
        const isOpen = openIndex === idx
        return (
          <div key={item.q}>
            <button type="button" onClick={() => setOpenIndex(isOpen ? null : idx)} aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left">
              <span className="font-bold text-pt-text">{item.q}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-pt-faint transition-transform ${isOpen ? 'rotate-180 text-pt-brand' : ''}`} aria-hidden="true" />
            </button>
            {isOpen && (
              <p className="px-6 pb-5 text-sm leading-relaxed text-pt-muted">{item.a}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function PortalKvkkModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('einfak-kvkk', onOpen)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('einfak-kvkk', onOpen)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!open) return null

  return (
    <div role="dialog" aria-modal="true" aria-label="KVKK Aydınlatma Metni" onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-pt-line bg-pt-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-pt-line pb-3">
          <h3 className="text-base font-bold text-pt-text">Demo Talebi · KVKK Aydınlatma Metni</h3>
          <button type="button" onClick={() => setOpen(false)} aria-label="Kapat"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-pt-line text-pt-muted hover:text-pt-text">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-pt-muted">
          <p>
            Demo talep formunda paylaştığınız ad-soyad, kurum adı, telefon numarası ve isteğe bağlı e-posta bilgileri; yalnızca talebinizi yanıtlamak, canlı tanıtım randevusu planlamak ve kurumunuza uygun paket teklifini iletmek amacıyla işlenir.
          </p>
          <p>
            Verileriniz üçüncü taraflarla pazarlama amacıyla paylaşılmaz. Talebinizle ilgili silme veya güncelleme haklarınız için <a href="mailto:info@e-infak.org" className="font-semibold text-pt-brand hover:underline">info@e-infak.org</a> adresinden bize ulaşabilirsiniz.
          </p>
        </div>
      </div>
    </div>
  )
}
