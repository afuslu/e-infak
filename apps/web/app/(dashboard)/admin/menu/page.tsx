'use client'

import { useEffect, useState } from 'react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, primaryButton } from '../../../../components/admin/FormKit'
import { useExtraLanguages } from '../../../../components/admin/TranslationEditor'
import { LANGUAGE_NAMES } from '../../../../lib/i18n'
import { confirmDialog } from '../../../../components/admin/ui'

interface MenuItem {
  id: string
  location: 'header' | 'footer'
  label: string
  url: string
  open_in_new_tab: boolean
  display_order: number
  is_active: boolean
  translations?: Record<string, { label?: string }>
}

interface PageRef { slug: string; title: string; is_published: boolean }

const BUILT_IN_LINKS = [
  ['Ana Sayfa', '/'],
  ['Projeler / Kampanyalar', '/kampanyalar'],
  ['Haberler', '/haberler'],
  ['Blog', '/haberler?tur=blog'],
  ['Faaliyetler', '/haberler?tur=faaliyet'],
  ['Galeri', '/galeri'],
  ['Gönüllü Ol', '/gonullu'],
  ['Zekat Hesapla', '/zekat-hesapla'],
  ['Hakkımızda', '/hakkimizda'],
  ['İletişim', '/iletisim'],
  ['Bağışçı Girişi', '/portal'],
  ['Makbuz Doğrula', '/verify'],
]

export default function AdminMenuPage() {
  const extraLanguages = useExtraLanguages()
  const [items, setItems] = useState<MenuItem[]>([])
  const [pages, setPages] = useState<PageRef[]>([])
  const [location, setLocation] = useState<'header' | 'footer'>('header')
  const [form, setForm] = useState({ label: '', url: '', open_in_new_tab: false })
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const load = async () => {
    try {
      const [m, p] = await Promise.all([adminGet<MenuItem[]>('/menu'), adminGet<PageRef[]>('/pages')])
      setItems(m.data)
      setPages(p.data.filter((page) => page.is_published))
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Menü yüklenemedi') })
    }
  }
  useEffect(() => { load() }, [])

  const list = items.filter((i) => i.location === location).sort((a, b) => a.display_order - b.display_order)

  const add = async (e?: React.FormEvent, preset?: { label: string; url: string }) => {
    e?.preventDefault()
    const body = { location, ...(preset ? { ...preset, open_in_new_tab: false } : form), display_order: list.length }
    setMessage(null)
    try {
      await adminSend('post', '/menu', body)
      if (!preset) setForm({ label: '', url: '', open_in_new_tab: false })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const move = async (index: number, delta: number) => {
    const next = [...list]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setItems((prev) => prev.map((item) => {
      const pos = next.findIndex((n) => n.id === item.id)
      return pos >= 0 ? { ...item, display_order: pos } : item
    }))
    try {
      await adminSend('put', '/menu/order', { ids: next.map((n) => n.id) })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
      await load()
    }
  }

  const update = async (item: MenuItem, patch: Partial<MenuItem>) => {
    try {
      await adminSend('put', `/menu/${item.id}`, { ...item, ...patch })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const translate = (item: MenuItem) => {
    const translations = { ...(item.translations || {}) }
    for (const lang of extraLanguages) {
      const label = window.prompt(`"${item.label}" — ${LANGUAGE_NAMES[lang] || lang.toUpperCase()} (boş = Türkçe göster)`, translations[lang]?.label || '')
      if (label === null) return
      if (label.trim()) translations[lang] = { label: label.trim() }
      else delete translations[lang]
    }
    update(item, { translations })
  }

  const rename = (item: MenuItem) => {
    const label = window.prompt('Bağlantı adı', item.label)
    if (label && label !== item.label) update(item, { label })
  }

  const remove = async (item: MenuItem) => {
    if (!(await confirmDialog(`"${item.label}" menüden kaldırılsın mı?`))) return
    try {
      await adminSend('delete', `/menu/${item.id}`)
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Menü Yönetimi</h1>
        <p className="mt-1 text-sm text-gray-500">Üst menü boş bırakılırsa sitenin varsayılan menüsü kullanılır.</p>
      </div>

      <div className="flex rounded-lg border bg-white p-1 text-sm font-semibold w-fit">
        {(['header', 'footer'] as const).map((loc) => (
          <button key={loc} onClick={() => setLocation(loc)} className={`rounded-md px-4 py-1.5 ${location === loc ? 'bg-primary-600 text-white' : 'text-gray-600'}`}>
            {loc === 'header' ? 'Üst Menü' : 'Alt Bilgi (Footer)'}
          </button>
        ))}
      </div>

      <Notice message={message} />

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Card className="border border-gray-100 p-6 shadow-sm lg:col-span-7">
          {list.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400">Bu menüde bağlantı yok.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {list.map((item, index) => (
                <li key={item.id} className={`flex items-center gap-3 py-2.5 ${item.is_active ? '' : 'opacity-50'}`}>
                  <div className="flex flex-col">
                    <button onClick={() => move(index, -1)} disabled={index === 0} className="text-xs text-gray-500 disabled:opacity-20" aria-label="Yukarı taşı">▲</button>
                    <button onClick={() => move(index, 1)} disabled={index === list.length - 1} className="text-xs text-gray-500 disabled:opacity-20" aria-label="Aşağı taşı">▼</button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900">{item.label}{item.open_in_new_tab && ' ↗'}</div>
                    <div className="truncate font-mono text-[11px] text-gray-500">{item.url}</div>
                  </div>
                  <button onClick={() => update(item, { is_active: !item.is_active })} className={ghostButton}>{item.is_active ? 'Gizle' : 'Göster'}</button>
                  <button onClick={() => rename(item)} className={ghostButton}>Adı</button>
                  {extraLanguages.length > 0 && (
                    <button onClick={() => translate(item)} className={ghostButton}>
                      Çeviri{item.translations && Object.keys(item.translations).length ? ` (${Object.keys(item.translations).length})` : ''}
                    </button>
                  )}
                  <button onClick={() => remove(item)} className={`${ghostButton} text-red-600`}>Sil</button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6 lg:col-span-5">
          <Card className="border border-gray-100 p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-gray-900">Hızlı ekle</h2>
            <div className="flex flex-wrap gap-2">
              {BUILT_IN_LINKS.map(([label, url]) => (
                <button key={url} onClick={() => add(undefined, { label, url })} className={ghostButton}>+ {label}</button>
              ))}
              {pages.map((p) => (
                <button key={p.slug} onClick={() => add(undefined, { label: p.title, url: `/sayfa/${p.slug}` })} className={`${ghostButton} border-primary-200`}>
                  + {p.title}
                </button>
              ))}
            </div>
          </Card>
          <Card className="border border-gray-100 p-6 shadow-sm">
            <form onSubmit={add} className="space-y-3">
              <h2 className="text-sm font-bold text-gray-900">Özel bağlantı</h2>
              <TextInput label="Görünen ad" required maxLength={80} value={form.label} onChange={(v) => setForm({ ...form, label: v })} />
              <TextInput label="Adres" required placeholder="/sayfa/sss veya https://..." value={form.url} onChange={(v) => setForm({ ...form, url: v })} />
              <Label label="">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input type="checkbox" checked={form.open_in_new_tab} onChange={(e) => setForm({ ...form, open_in_new_tab: e.target.checked })} />
                  Yeni sekmede aç
                </span>
              </Label>
              <button type="submit" className={primaryButton}>Ekle</button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}
