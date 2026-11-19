'use client'

import { Suspense, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDownLeft, CreditCard, Landmark } from 'lucide-react'
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

      {tab !== 'banka-hareketleri' && tabs}

      {tab === 'online-bagis' && <PaymentSmsSettings only="payment" embedded />}

      {tab === 'banka-hesaplari' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900">
            <p className="font-bold">Nasıl çalışır?</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              <li>Bankanın verdiği web servis kullanıcı adı ve şifresini &ldquo;Ayarla&rdquo; ile girin.</li>
              <li>&ldquo;Otomasyon Hesabı Bağla&rdquo; ile her hesabı IBAN&apos;ı ve hesap ek numarasıyla ekleyin.</li>
              <li>&ldquo;Bağlantıyı Test Et&rdquo; ile bankadan gelen IBAN ve bakiyeyi kontrol edin.</li>
              <li>Gelen havale/EFT&apos;ler otomatik çekilir ve &ldquo;Banka Hareketleri&rdquo; sekmesinde bağışçıyla eşleştirilir.</li>
            </ol>
          </div>
          <BankaEntegrasyonPanel defaultOpen="api" />
        </div>
      )}

      {tab === 'banka-hareketleri' && (
        <GelenHavalelerTab tabNavigation={tabs} onUnmatchedCountChange={setUnmatched} />
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
