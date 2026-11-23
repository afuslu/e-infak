'use client'

/** Card payments the bank declined or whose outcome needs a manual check, with who and why. */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { apiErrorMessage, formatMoney, v1Get, whatsappUrl } from '../../../../lib/admin-access'
import { ghostButton, primaryButton } from '../../../../components/admin/FormKit'
import { EmptyState, Modal, PageHeader, TBody, THead, Table, Td, Th, Tr } from '../../../../components/admin/ui'

interface Payment {
  id: string; status: string; total_cents: number; currency: string; created_at: string; merchant_payment_id: string
  failure_code: string | null; failure_message: string | null; retried_paid: boolean
  later_payments: { total_cents: number; currency: string; created_at: string }[]
  donor: { id: string; name: string | null; phone: string | null; email: string | null }
  items: { campaign_title: string; quantity: number; total_amount_cents: number }[]
  attempts: {
    id: string; provider: string; response_code: string | null; response_message: string | null
    card_brand: string | null; card_last_4: string | null; created_at: string; completed_at: string | null
  }[]
}
type Period = 'today' | 'week' | 'month'

const PERIODS: [Period, string][] = [['today', 'Bugün'], ['week', 'Bu hafta'], ['month', 'Bu ay']]
const PROVIDER: Record<string, string> = {
  vakifkatilim: 'Vakıf Katılım', ziraatpay: 'Ziraat Katılım', iyzico: 'iyzico', paytr: 'PayTR', nestpay: 'Nestpay',
}
const when = (iso: string) => new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
const reason = (p: Payment) => p.failure_message || p.attempts[0]?.response_message || 'Neden kaydedilmemiş'
const badge = (p: Payment): [string, string] =>
  p.retried_paid ? ['Sonradan ödedi', 'bg-emerald-100 text-emerald-800']
    : p.status === 'review' ? ['İncelemede', 'bg-amber-100 text-amber-800']
      : p.status === 'failed' ? ['Başarısız', 'bg-red-100 text-red-700'] : ['Sonuçlandı', 'bg-gray-100 text-gray-600']

export default function FailedPaymentsPage() {
  const [period, setPeriod] = useState<Period>('today')
  const [data, setData] = useState<{ total: number; items: Payment[] } | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Payment | null>(null)
  const load = useCallback(() => {
    setError('')
    v1Get<{ total: number; items: Payment[] }>('/mobile/failed-payments', { period })
      .then((r) => setData(r.data))
      .catch((err) => { setData(null); setError(apiErrorMessage(err, 'Ödemeler yüklenemedi')) })
  }, [period])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <PageHeader title="Başarısız Online Ödemeler"
        description="Bankanın reddettiği ya da sonucu doğrulanamayan kart ödemeleri. Nedenini görmek için satıra tıklayın."
        actions={<button type="button" className={`${ghostButton} flex items-center gap-1.5`} onClick={load}><RefreshCw className="h-3.5 w-3.5" /> Yenile</button>} />
      <div className="flex flex-wrap gap-2">
        {PERIODS.map(([key, label]) => (
          <button key={key} type="button" className={period === key ? primaryButton : ghostButton} onClick={() => setPeriod(key)}>{label}</button>
        ))}
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {data && (
        <Card className="p-4">
          {!data.items.length ? <EmptyState icon={AlertTriangle} title="Sorunlu ödeme yok" text="Bu dönemde başarısız ya da incelemede online ödeme bulunmuyor." /> : (
            <Table>
              <THead><Tr><Th>Tarih</Th><Th>Bağışçı</Th><Th>Bağış kalemi</Th><Th className="text-right">Tutar</Th><Th>Neden</Th><Th>Durum</Th></Tr></THead>
              <TBody>
                {data.items.map((p) => (
                  <Tr key={p.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelected(p)}>
                    <Td className="whitespace-nowrap">{when(p.created_at)}</Td>
                    <Td><button type="button" className="font-bold text-primary-700 hover:underline">{p.donor.name || 'İsimsiz'}</button></Td>
                    <Td>{p.items.map((i) => i.campaign_title).join(', ')}</Td>
                    <Td className="whitespace-nowrap text-right font-semibold tabular-nums">{formatMoney(p.total_cents, p.currency)}</Td>
                    <Td className="max-w-[320px]">{reason(p)}</Td>
                    <Td><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${badge(p)[1]}`}>{badge(p)[0]}</span></Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
          {data.total > data.items.length && <p className="mt-3 text-xs text-gray-500">{data.total} kaydın en yeni {data.items.length} tanesi gösteriliyor.</p>}
        </Card>
      )}
      {selected && <Detail payment={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function Detail({ payment: p, onClose }: { payment: Payment; onClose: () => void }) {
  const attempt = p.attempts[0]
  const wa = p.donor.phone ? whatsappUrl(p.donor.phone, '') : null
  const rows: [string, string][] = [
    ['Neden', reason(p)],
    ['Banka kodu', p.failure_code || attempt?.response_code || 'Kaydedilmemiş'],
    ['Bağışçı', p.donor.name || 'İsimsiz'],
    ['Telefon', p.donor.phone || '—'],
    ['E-posta', p.donor.email || '—'],
    ...p.items.map((i): [string, string] => [`${i.campaign_title}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`, formatMoney(i.total_amount_cents, p.currency)]),
    ['Tarih', when(p.created_at)],
    ['Sipariş no', p.merchant_payment_id],
    ...(attempt?.card_last_4 ? [['Kart', `${attempt.card_brand || ''} •••• ${attempt.card_last_4}`.trim()] as [string, string]] : []),
    ...p.later_payments.map((l): [string, string] => [`Sonraki ödeme · ${when(l.created_at)}`, formatMoney(l.total_cents, l.currency)]),
    ...p.attempts.map((a): [string, string] => [
      `Deneme · ${when(a.created_at)} · ${PROVIDER[a.provider] || a.provider}`,
      [a.response_code, a.response_message].filter(Boolean).join(' · ') || (a.completed_at ? '—' : 'Bankadan dönüş yok'),
    ]),
  ]
  return (
    <Modal title={formatMoney(p.total_cents, p.currency)} description={badge(p)[0]} onClose={onClose} size="lg"
      footer={<>
        {wa && <a className={ghostButton} href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
        {p.donor.phone && <a className={ghostButton} href={`tel:${p.donor.phone}`}>Ara</a>}
        <Link className={primaryButton} href={`/admin/bagiscilar/${p.donor.id}`}>Bağışçıyı aç</Link>
      </>}>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
        {p.retried_paid && <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">Bağışçı daha sonra aynı tutarı başarıyla ödedi.</p>}
        {p.status === 'review' && <p className="rounded-lg bg-amber-50 p-3 text-amber-800">Sonuç doğrulanamadı; para çekilmiş olabilir. Sipariş numarasıyla banka panelinden kontrol edin, kontrol etmeden tekrar ödeme istemeyin.</p>}
        {p.status === 'failed' && <p className="rounded-lg bg-red-50 p-3 text-red-700">Banka ödemeyi onaylamadı; bağış kaydı oluşmadı.</p>}
        <dl className="divide-y divide-gray-100">
          {rows.map(([label, value], i) => (
            <div key={i} className="flex justify-between gap-4 py-2">
              <dt className="text-gray-500">{label}</dt><dd className="break-words text-right font-semibold text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  )
}
