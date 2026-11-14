'use client'

import { useEffect, useState } from 'react'
import { Card } from '@e-infak/ui'
import { RefreshCw } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage, hasPermission, useAdminAccess } from '../../../../lib/admin-access'
import { primaryButton } from '../../../../components/admin/FormKit'
import { PageHeader, TBody, THead, Table, Td, Th, Tr, toast } from '../../../../components/admin/ui'

interface Rates {
  currencies: { code: string; name: string; rate: number; fetched_at: string }[]
  gold: { name: string; price: number }[]
  gold_updated_at: string | null
}
const tl = (value: number) => value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

/** STK PRO's "Döviz Kurları": rates used for foreign-currency donations and zakat. */
export default function RatesPage() {
  const { data: access } = useAdminAccess()
  const [rates, setRates] = useState<Rates | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { adminGet<Rates>('/exchange-rates').then((r) => setRates(r.data)).catch((err) => toast.error(apiErrorMessage(err))) }, [])
  const refresh = async () => {
    setBusy(true)
    try {
      setRates((await adminSend<Rates>('post', '/exchange-rates/refresh')).data)
      toast.ok('Kurlar güncellendi')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kurlar güncellenemedi'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Döviz ve Altın Kurları"
        description="Dövizli bağışların TL karşılığı ve zekât hesabı bu kurlarla yapılır. Kaynak: TCMB; saatte bir kendiliğinden güncellenir."
        actions={hasPermission(access, 'settings_manage') && (
          <button onClick={refresh} disabled={busy} className={`${primaryButton} flex items-center gap-1.5`}>
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Kurları güncelle
          </button>
        )} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border border-gray-100 p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-gray-900">Döviz</h2>
          {!rates ? <p className="animate-pulse text-sm text-gray-400">Yükleniyor…</p> : rates.currencies.length === 0 ? (
            <p className="text-sm text-gray-400">Henüz kur alınmadı; “Kurları güncelle” ile alabilirsiniz.</p>
          ) : (
            <Table>
              <THead><Tr><Th>Para birimi</Th><Th className="text-right">1 birim (₺)</Th><Th className="text-right">Güncelleme</Th></Tr></THead>
              <TBody>
                {rates.currencies.map((c) => (
                  <Tr key={c.code}>
                    <Td><span className="font-semibold text-gray-900">{c.code}</span> <span className="text-gray-500">{c.name}</span></Td>
                    <Td className="text-right font-mono font-semibold">{tl(c.rate)}</Td>
                    <Td className="text-right text-xs text-gray-500">{new Date(c.fetched_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <Card className="border border-gray-100 p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-gray-900">Altın</h2>
          {!rates ? <p className="animate-pulse text-sm text-gray-400">Yükleniyor…</p> : rates.gold.length === 0 ? (
            <p className="text-sm text-gray-400">Altın fiyatı henüz alınmadı (Zekât Ayarları otomatik güncellemesi açık olmalı).</p>
          ) : (
            <>
              <Table>
                <THead><Tr><Th>Tür</Th><Th className="text-right">Fiyat (₺)</Th></Tr></THead>
                <TBody>
                  {rates.gold.map((g) => (
                    <Tr key={g.name}><Td className="font-semibold text-gray-900">{g.name}</Td><Td className="text-right font-mono font-semibold">{tl(g.price)}</Td></Tr>
                  ))}
                </TBody>
              </Table>
              <p className="mt-3 text-xs text-gray-500">Çeyrek, yarım, tam, Cumhuriyet ve bilezik fiyatları gram altından saf altın miktarına göre hesaplanır; kuyumcu işçilik farkı içermez.</p>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
