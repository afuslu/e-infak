'use client'

/** STK PRO "Bildirim Merkezi" and "Bildirim Kuralları": the staff notifications the mobile app also shows. */
import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Bell, CheckCheck, SlidersHorizontal } from 'lucide-react'
import { apiErrorMessage, formatMoney, v1Get, v1Send } from '../../../../lib/admin-access'
import { Tabs, toast } from '../../../../components/admin/ui'

interface Note {
  id: string; kind: string; channel: string | null; title: string; body: string; amount_cents: number | null; currency: string | null
  data: Record<string, string>; read: boolean; created_at: string
}
const RULES: [string, string, string][] = [
  ['online', 'Online bağış geldiğinde', 'Sanal POS ile yapılan her kartlı bağış.'],
  ['transfer', 'Havale / EFT eşleştiğinde', 'Banka hareketi bir bağışçıyla eşleşip makbuz kesildiğinde.'],
  ['transfer_waiting', 'Eşleşmeyen havale beklediğinde', 'Onay bekleyen banka hareketleri.'],
  ['offline', 'Elden / kumbara makbuzu kesildiğinde', 'Personelin kestiği makbuzlar.'],
  ['payment_failed', 'Ödeme başarısız olduğunda', 'Kart reddi, düzenli ödeme çekilemedi.'],
  ['refund', 'İade yapıldığında', 'Kart iadeleri.'],
  ['digest', 'Günlük özet (21:00)', 'Günün toplam bağışları.'],
  ['quiet_hours', 'Gece sessiz saatler', '23:00–08:00 arası bildirim gönderilmez.'],
]

export default function NotificationsPage() {
  return <Suspense fallback={null}><Notifications /></Suspense>
}

function Notifications() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const sekme = params.get('sekme')
  const [tab, setTab] = useState<'merkez' | 'kurallar'>(sekme === 'kurallar' ? 'kurallar' : 'merkez')
  useEffect(() => {
    setTab(sekme === 'kurallar' ? 'kurallar' : 'merkez')
  }, [sekme])
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Bell className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">{tab === 'merkez' ? 'Bildirim Merkezi' : 'Bildirim Kuralları'}</h1>
      </div>
      <Tabs value={tab} onChange={(k) => { setTab(k); router.replace(`${pathname}?sekme=${k}`, { scroll: false }) }}
        tabs={[{ key: 'merkez', label: 'Bildirim Merkezi', icon: Bell }, { key: 'kurallar', label: 'Bildirim Kuralları', icon: SlidersHorizontal }]} />
      {tab === 'merkez' ? <Center /> : <Rules />}
    </div>
  )
}

function Center() {
  const [items, setItems] = useState<Note[]>([])
  const [unread, setUnread] = useState(0)
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    try {
      const r = await v1Get<{ items: Note[]; unread: number }>('/mobile/notifications', { unread_only: onlyUnread, page_size: 100 })
      setItems(r.data.items); setUnread(r.data.unread)
    } catch (err) { toast.error(apiErrorMessage(err, 'Bildirimler yüklenemedi')) } finally { setLoading(false) }
  }, [onlyUnread])
  useEffect(() => { load() }, [load])
  const markAll = async () => { await v1Send('post', '/mobile/notifications/read', { all: true }).catch(() => {}); load() }
  const link = (n: Note) => (n.data?.donor_id ? `/admin/bagiscilar/${n.data.donor_id}` : n.kind.startsWith('transfer') ? '/admin/banka-odeme?sekme=banka-hareketleri' : '/admin/makbuzlar')
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3 text-[13px]">
        <span className="font-semibold text-gray-700">{unread} okunmamış</span>
        <label className="flex items-center gap-2"><input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Yalnız okunmamışlar</label>
        <button type="button" onClick={markAll} disabled={!unread} className="ms-auto inline-flex items-center gap-1.5 font-semibold text-primary-700 hover:underline disabled:opacity-40"><CheckCheck className="h-4 w-4" /> Tümünü okundu işaretle</button>
      </div>
      <ul className="divide-y divide-gray-100">
        {loading && <li className="p-6"><div className="h-6 animate-pulse rounded bg-slate-100" /></li>}
        {items.map((n) => (
          <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.read ? '' : 'bg-primary-50/40'}`}>
            <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${n.read ? 'bg-gray-200' : 'bg-primary-500'}`} />
            <div className="min-w-0 flex-1">
              <Link href={link(n)} onClick={() => v1Send('post', '/mobile/notifications/read', { ids: [n.id] }).catch(() => {})} className="text-[14px] font-semibold text-gray-900 hover:text-primary-700">{n.title}</Link>
              <p className="text-[13px] text-gray-600">{n.body}</p>
              <p className="mt-0.5 text-[12px] text-gray-400">{new Date(n.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>
            {n.amount_cents != null && <span className="whitespace-nowrap font-bold tabular-nums text-emerald-600">{formatMoney(n.amount_cents, n.currency || 'TRY')}</span>}
          </li>
        ))}
        {!loading && !items.length && <li className="px-4 py-10 text-center text-[13px] text-gray-400">Bildirim yok.</li>}
      </ul>
    </section>
  )
}

function Rules() {
  const [data, setData] = useState<{ settings: Record<string, boolean | number>; available: Record<string, boolean> } | null>(null)
  useEffect(() => { v1Get<NonNullable<typeof data>>('/mobile/notification-settings').then((r) => setData(r.data)).catch((err) => toast.error(apiErrorMessage(err, 'Yüklenemedi'))) }, [])
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
  const set = async (key: string, value: boolean | number) => {
    try { setData((await v1Send<NonNullable<typeof data>>('put', '/mobile/notification-settings', { [key]: value })).data) } catch (err) { toast.error(apiErrorMessage(err, 'Kaydedilemedi')) }
  }
  return (
    <section className="max-w-2xl space-y-1 rounded-2xl border border-slate-200/80 bg-white p-4">
      <p className="mb-2 text-[13px] text-gray-500">Kurallar size özeldir; hem paneldeki zil hem mobil uygulama bildirimleri bunlara göre gelir.</p>
      {RULES.filter(([k]) => k === 'quiet_hours' || data.available[k] !== false).map(([key, label, hint]) => (
        <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-gray-50">
          <input type="checkbox" className="mt-1" checked={!!data.settings[key]} onChange={(e) => set(key, e.target.checked)} />
          <span><span className="block text-[14px] font-semibold text-gray-900">{label}</span><span className="text-[12.5px] text-gray-500">{hint}</span></span>
        </label>
      ))}
      <label className="flex items-center gap-3 px-2 pt-3 text-[13.5px]">
        En az tutar (TL)
        <input type="number" min={0} className="w-32 rounded-lg border border-gray-200 px-2 py-1.5" defaultValue={Number(data.settings.min_amount_cents || 0) / 100}
          onBlur={(e) => set('min_amount_cents', Math.round(Number(e.target.value || 0) * 100))} />
      </label>
    </section>
  )
}
