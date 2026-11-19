'use client'

import { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDownLeft, CreditCard, HelpCircle, Landmark, X } from 'lucide-react'
import { AppPageHeader } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { Tabs } from '../../../../components/admin/ui'

const PaymentSmsSettings = dynamic(
  () => import('../../../../components/admin/PaymentSmsSettings').then((m) => m.PaymentSmsSettings),
  { ssr: false },
)
const BankaEntegrasyonPanel = dynamic(
  () => import('../../../../components/admin/muhasebe/BankaEntegrasyonPanel').then((m) => m.BankaEntegrasyonPanel),
  { ssr: false },
)
const GelenHavalelerTab = dynamic(
  () => import('../../../../components/admin/muhasebe/GelenHavalelerTab').then((m) => m.GelenHavalelerTab),
  { ssr: false },
)

type TabKey = 'online-bagis' | 'banka-hesaplari' | 'banka-hareketleri'
const TAB_KEYS: TabKey[] = ['online-bagis', 'banka-hesaplari', 'banka-hareketleri']

function BankaOdemeContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const raw = searchParams.get('sekme') as TabKey | null
  const tab: TabKey = raw && TAB_KEYS.includes(raw) ? raw : 'online-bagis'
  const [unmatched, setUnmatched] = useState<number | undefined>(undefined)
  const [showGuide, setShowGuide] = useState<boolean>(true)

  useEffect(() => {
    try {
      if (localStorage.getItem('einfak_hide_bank_guide') === '1') setShowGuide(false)
    } catch {
      // ignore
    }
  }, [])

  const toggleGuide = (visible: boolean) => {
    setShowGuide(visible)
    try {
      if (visible) localStorage.removeItem('einfak_hide_bank_guide')
      else localStorage.setItem('einfak_hide_bank_guide', '1')
    } catch {
      // ignore
    }
  }

  const setTab = (next: TabKey) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sekme', next)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const tabs = (
    <Tabs
      tabs={[
        { key: 'online-bagis' as const, label: 'Online Bağış (Sanal POS)', icon: CreditCard },
        { key: 'banka-hesaplari' as const, label: 'Banka Hesapları & Web Servis', icon: Landmark },
        { key: 'banka-hareketleri' as const, label: 'Banka Hareketleri', icon: ArrowDownLeft, count: unmatched },
      ]}
      value={tab}
      onChange={setTab}
    />
  )

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Finans Altyapısı"
        title="Banka & Ödeme"
        meta="Kartla online bağış (sanal POS), banka web servis bağlantıları ve hesaba gelen havale/EFT hareketleri tek yerde. Şifreler kurum bazında şifrelenerek saklanır."
        icon={<Landmark className="h-5 w-5" />}
      />

      {tabs}

      {tab === 'online-bagis' && <PaymentSmsSettings only="payment" embedded />}

      {tab === 'banka-hesaplari' && (
        <div className="space-y-4">
          {showGuide ? (
            <div className="relative rounded-2xl border border-blue-200 bg-blue-50/70 p-4 pr-10 text-xs text-blue-900">
              <button
                type="button"
                onClick={() => toggleGuide(false)}
                title="Rehberi gizle"
                className="absolute right-3 top-3 cursor-pointer rounded-lg p-1 text-blue-500 hover:bg-blue-100 hover:text-blue-800"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="font-bold">Nasıl çalışır?</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                <li>Bankanın verdiği web servis kullanıcı adı ve şifresini &ldquo;Ayarla&rdquo; ile girin.</li>
                <li>&ldquo;Otomasyon Hesabı Bağla&rdquo; ile her hesabı IBAN&apos;ı ve hesap ek numarasıyla ekleyin.</li>
                <li>&ldquo;Bağlantıyı Test Et&rdquo; ile bankadan gelen IBAN ve bakiyeyi kontrol edin.</li>
                <li>Gelen havale/EFT&apos;ler otomatik çekilir ve &ldquo;Banka Hareketleri&rdquo; sekmesinde bağışçıyla eşleştirilir.</li>
              </ol>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => toggleGuide(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <HelpCircle className="h-3.5 w-3.5 text-blue-600" /> Kurulum Rehberini Göster
              </button>
            </div>
          )}
          <BankaEntegrasyonPanel defaultOpen="api" />
        </div>
      )}

      {tab === 'banka-hareketleri' && (
        <GelenHavalelerTab onUnmatchedCountChange={setUnmatched} />
      )}
    </div>
  )
}

export default function BankaOdemePage() {
  return (
    <Suspense fallback={null}>
      <BankaOdemeContent />
    </Suspense>
  )
}
