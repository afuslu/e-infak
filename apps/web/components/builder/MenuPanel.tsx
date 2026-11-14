'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminGet, adminSend, apiErrorMessage } from '../../lib/admin-access'
import type { PublicMenu } from '../../lib/default-links'
import { confirmDialog } from '../admin/ui'

interface MenuItem {
  id: string
  location: 'header' | 'footer'
  label: string
  url: string
  open_in_new_tab: boolean
  display_order: number
  is_active: boolean
}

interface PageRef {
  slug: string
  title: string
  is_published: boolean
}

const BUILT_IN_LINKS: [string, string][] = [
  ['Ana Sayfa', '/'],
  ['Projeler / Kampanyalar', '/kampanyalar'],
  ['Haberler', '/haberler'],
  ['Galeri', '/galeri'],
  ['Gönüllü Ol', '/gonullu'],
  ['Zekât Hesapla', '/zekat-hesapla'],
  ['Hakkımızda', '/hakkimizda'],
  ['İletişim', '/iletisim'],
]

function toPublicMenu(items: MenuItem[]): PublicMenu {
  const byOrder = (a: MenuItem, b: MenuItem) => a.display_order - b.display_order
  const toLink = (i: MenuItem) => ({ label: i.label, url: i.url, open_in_new_tab: i.open_in_new_tab })
  return {
    header: items.filter((i) => i.location === 'header' && i.is_active).sort(byOrder).map(toLink),
    footer: items.filter((i) => i.location === 'footer' && i.is_active).sort(byOrder).map(toLink),
  }
}

export function MenuPanel({ onMenuChanged }: { onMenuChanged: (menu: PublicMenu) => void }) {
  const [items, setItems] = useState<MenuItem[]>([])
  const [pages, setPages] = useState<PageRef[]>([])
  const [location, setLocation] = useState<'header' | 'footer'>('header')
  const [form, setForm] = useState({ label: '', url: '', open_in_new_tab: false })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ label: '', url: '', open_in_new_tab: false })
  const [saving, setSaving] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([adminGet<MenuItem[]>('/menu'), adminGet<PageRef[]>('/pages')])
      setItems(m.data)
      setPages(p.data.filter((page) => page.is_published))
      onMenuChanged(toPublicMenu(m.data))
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Menü yüklenemedi') })
    }
  }, [onMenuChanged])

  useEffect(() => { load() }, [load])

  const list = items.filter((i) => i.location === location).sort((a, b) => a.display_order - b.display_order)

  const add = async (e?: React.FormEvent, preset?: { label: string; url: string }) => {
    e?.preventDefault()
    if (saving) return
    const payload = { location, ...(preset ? { ...preset, open_in_new_tab: false } : form), display_order: list.length }
    if (!payload.label.trim() || !payload.url.trim()) return
    setMessage(null)
    setSaving(true)
    try {
      await adminSend('post', '/menu', payload)
      if (!preset) setForm({ label: '', url: '', open_in_new_tab: false })
      setMessage({ type: 'ok', text: `“${payload.label}” eklendi` })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const move = async (index: number, delta: number) => {
    const next = [...list]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    const updated = items.map((item) => {
      const pos = next.findIndex((n) => n.id === item.id)
      return pos >= 0 ? { ...item, display_order: pos } : item
    })
    setItems(updated)
    onMenuChanged(toPublicMenu(updated))
    try {
      await adminSend('put', '/menu/order', { ids: next.map((n) => n.id) })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
      await load()
    }
  }

  const reorder = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) return
    const next = [...list]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    const updated = items.map((item) => {
      const pos = next.findIndex((n) => n.id === item.id)
      return pos >= 0 ? { ...item, display_order: pos } : item
    })
    setItems(updated)
    onMenuChanged(toPublicMenu(updated))
    try {
      await adminSend('put', '/menu/order', { ids: next.map((n) => n.id) })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
      await load()
    }
  }

  const update = async (item: MenuItem, patch: Partial<MenuItem>, okText = 'Güncellendi') => {
    try {
      await adminSend('put', `/menu/${item.id}`, { ...item, ...patch })
      setMessage({ type: 'ok', text: okText })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const remove = async (item: MenuItem) => {
    if (!(await confirmDialog(`“${item.label}” menüden kaldırılsın mı?`))) return
    try {
      await adminSend('delete', `/menu/${item.id}`)
      setMessage({ type: 'ok', text: 'Bağlantı silindi' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const saveEdit = async (e: React.FormEvent, item: MenuItem) => {
    e.preventDefault()
    if (!editForm.label.trim() || !editForm.url.trim()) return
    await update(item, { label: editForm.label.trim(), url: editForm.url.trim(), open_in_new_tab: editForm.open_in_new_tab })
    setEditingId(null)
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-2 rounded-lg border bg-gray-50 p-0.5 text-[11px] font-semibold">
        {([['header', 'Üst Menü'], ['footer', 'Alt Menü']] as const).map(([loc, label]) => (
          <button
            key={loc}
            type="button"
            onClick={() => setLocation(loc)}
            className={`rounded-md py-1.5 transition ${location === loc ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <p className={`rounded px-2 py-1.5 text-[11px] font-semibold ${message.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </p>
      )}

      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-center text-[11px] text-gray-400">
          Bu menüde özel bağlantı yok; site varsayılan bağlantıları gösterir.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((item, i) => (
            <li
              key={item.id}
              draggable={editingId !== item.id}
              onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) setDropIdx(i) }}
              onDragLeave={() => setDropIdx((d) => (d === i ? null : d))}
              onDrop={(e) => {
                e.preventDefault()
                if (dragIdx !== null) reorder(dragIdx, i)
                setDragIdx(null)
                setDropIdx(null)
              }}
              onDragEnd={() => { setDragIdx(null); setDropIdx(null) }}
              className={`rounded-lg border bg-white p-2 transition ${dropIdx === i ? 'border-blue-500 ring-2 ring-blue-100' : ''} ${dragIdx === i ? 'opacity-60' : ''}`}
            >
              {editingId === item.id ? (
                <form onSubmit={(e) => saveEdit(e, item)} className="space-y-1.5">
                  <input className="w-full rounded border px-2 py-1 text-xs" placeholder="Başlık" value={editForm.label}
                    onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))} />
                  <input className="w-full rounded border px-2 py-1 text-xs font-mono" placeholder="/sayfa/..." value={editForm.url}
                    onChange={(e) => setEditForm((f) => ({ ...f, url: e.target.value }))} />
                  <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
                    <input type="checkbox" checked={editForm.open_in_new_tab}
                      onChange={(e) => setEditForm((f) => ({ ...f, open_in_new_tab: e.target.checked }))} />
                    Yeni sekmede aç
                  </label>
                  <div className="flex gap-1.5">
                    <button type="submit" className="rounded bg-blue-600 px-2 py-1 text-[11px] font-bold text-white">Kaydet</button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded border px-2 py-1 text-[11px] text-gray-600">Vazgeç</button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center gap-1.5">
                  <div className="flex flex-col">
                    <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-[10px] leading-none text-gray-400 hover:text-gray-700 disabled:opacity-20" aria-label="Yukarı">▲</button>
                    <button type="button" disabled={i === list.length - 1} onClick={() => move(i, 1)} className="text-[10px] leading-none text-gray-400 hover:text-gray-700 disabled:opacity-20" aria-label="Aşağı">▼</button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate font-semibold ${item.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{item.label}</div>
                    <div className="truncate font-mono text-[10px] text-gray-400">{item.url}</div>
                  </div>
                  <button type="button" title={item.is_active ? 'Gizle' : 'Göster'} onClick={() => update(item, { is_active: !item.is_active }, item.is_active ? 'Gizlendi' : 'Aktif edildi')}
                    className="rounded px-1 text-[11px] text-gray-500 hover:bg-gray-100">
                    {item.is_active ? '👁' : '🚫'}
                  </button>
                  <button type="button" title="Düzenle" onClick={() => { setEditingId(item.id); setEditForm({ label: item.label, url: item.url, open_in_new_tab: item.open_in_new_tab }) }}
                    className="rounded px-1 text-[11px] text-gray-500 hover:bg-gray-100">
                    ✎
                  </button>
                  <button type="button" title="Sil" onClick={() => remove(item)} className="rounded px-1 text-[11px] text-red-500 hover:bg-red-50">
                    ✕
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(e) => add(e)} className="space-y-2 rounded-lg border bg-gray-50 p-2.5">
        <p className="text-[11px] font-bold text-gray-600">+ Yeni Bağlantı Ekle</p>
        <input className="w-full rounded border bg-white px-2 py-1 text-xs" placeholder="Menü yazısı (ör. Projeler)" required value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
        <input className="w-full rounded border bg-white px-2 py-1 text-xs font-mono" placeholder="Adres (/kampanyalar veya https://...)" required value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
        <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <input type="checkbox" checked={form.open_in_new_tab} onChange={(e) => setForm((f) => ({ ...f, open_in_new_tab: e.target.checked }))} />
          Yeni sekmede aç
        </label>
        <button type="submit" disabled={saving} className="w-full rounded bg-blue-600 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Ekleniyor…' : 'Menüye Ekle'}
        </button>
      </form>

      <div className="space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Hızlı Ekle</p>
        <div className="flex flex-wrap gap-1">
          {BUILT_IN_LINKS.map(([label, url]) => (
            <button key={url} type="button" onClick={() => add(undefined, { label, url })}
              className="rounded border bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:border-blue-400 hover:text-blue-700">
              + {label}
            </button>
          ))}
          {pages.map((p) => (
            <button key={p.slug} type="button" onClick={() => add(undefined, { label: p.title, url: `/sayfa/${p.slug}` })}
              className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100">
              + {p.title}
            </button>
          ))}
        </div>
      </div>

      <p className="rounded-lg bg-gray-50 p-2 text-[11px] text-gray-500">
        Açılır alt menü veya mega menü oluşturmak için önizlemedeki <strong>Menü</strong> bloğuna tıklayıp <em>Bağlantılar › Burada tanımla</em> seçeneğini kullanabilirsiniz.
      </p>
    </div>
  )
}
