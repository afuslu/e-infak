'use client'

/** STK PRO "Tercihlerim": what this browser remembers for you (table columns, rows per page, export columns, shortcuts). */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SlidersHorizontal } from 'lucide-react'
import { confirmDialog, toast } from '../../../../components/admin/ui'

const NAMES: Record<string, string> = {
  donors: 'Bağışçılar', campaigns: 'Kampanyalar', receipts: 'Makbuzlar', 'online-donations': 'Online Bağış', 'campaign-tabs': 'Kampanya Sekmeler',
  'campaign-pages': 'Kampanya Sayfaları', 'sms-lists': 'SMS Listeleri', 'mail-lists': 'Mail Listeleri', 'mail-templates': 'Mail Şablonları',
  'mail-batches': 'Mail Gönderimleri', representatives: 'Temsilciler', exports: 'Dışa Aktarımlar', 'active-sessions': 'Aktif Oturumlar',
}
const GROUPS: [string, string][] = [
  ['einfak-list-cols:', 'Tablo düzeni (gizlenen sütunlar)'],
  ['einfak-list-size:', 'Sayfa başına kayıt'],
  ['einfak-export-cols:', 'Dışa aktarma sütunları'],
]
const SINGLE: [string, string][] = [
  ['einfak-shortcuts', 'Klavye kısayolları'],
  ['einfak-admin-tema', 'Panel teması'],
  ['einfak-admin-egitim-modu', 'Eğitim modu'],
  ['einfak-admin-gorunum', 'Görünüm (sıkı / normal)'],
  ['einfak-admin-sidebar-collapsed', 'Menü paneli daraltma'],
]

function describe(key: string, value: string) {
  try {
    const v = JSON.parse(value)
    if (Array.isArray(v)) return v.length ? `${v.length} öğe` : 'varsayılan'
    if (v && typeof v === 'object') return `${Object.keys(v).length} ayar`
    return String(v)
  } catch {
    return value
  }
}

export default function PreferencesPage() {
  const [entries, setEntries] = useState<[string, string][]>([])
  const read = () => {
    try {
      const out: [string, string][] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('einfak-')) out.push([k, localStorage.getItem(k) || ''])
      }
      setEntries(out.sort())
    } catch { setEntries([]) }
  }
  useEffect(read, [])
  const reset = (key: string) => { try { localStorage.removeItem(key) } catch { /* ignore */ } read(); toast.ok('Varsayılana döndü') }
  const resetAll = async () => {
    if (!(await confirmDialog({ title: 'Tüm tercihler varsayılana dönsün mü?', text: 'Tablo düzenleri, kısayollar ve görünüm ayarları bu tarayıcıda sıfırlanır.', danger: true }))) return
    entries.forEach(([k]) => { try { localStorage.removeItem(k) } catch { /* ignore */ } })
    read()
  }
  const row = (key: string, label: string, sub: string, value: string) => (
    <li key={key} className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold text-gray-900">{label}</div><div className="text-[12.5px] text-gray-500">{sub} · {describe(key, value)}</div></div>
      <button type="button" onClick={() => reset(key)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700 hover:bg-gray-50">Varsayılana dön</button>
    </li>
  )
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><SlidersHorizontal className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Tercihlerim</h1>
        <button type="button" onClick={resetAll} disabled={!entries.length} className="ms-auto rounded-lg bg-rose-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40">Tümünü Varsayılana Döndür</button>
      </div>
      <p className="text-[13px] text-gray-500">Bu tercihler bu tarayıcıda saklanır. Kısayolları <Link href="/admin/kisayollar" className="font-semibold text-primary-700">Kısayollar</Link> sayfasından değiştirebilirsiniz.</p>
      <section className="rounded-2xl border border-slate-200/80 bg-white px-5">
        <ul className="divide-y divide-gray-100">
          {entries.map(([k, v]) => {
            const group = GROUPS.find(([p]) => k.startsWith(p))
            if (group) { const table = k.slice(group[0].length); return row(k, NAMES[table] || table, group[1], v) }
            const single = SINGLE.find(([key]) => key === k)
            return single ? row(k, single[1], 'Genel', v) : null
          })}
          {!entries.length && <li className="py-8 text-center text-[13px] text-gray-400">Kayıtlı tercih yok; her şey varsayılan.</li>}
        </ul>
      </section>
    </div>
  )
}
