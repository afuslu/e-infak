'use client'

import { useEffect, useState } from 'react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { ImageField } from '../../../../components/admin/ImageField'
import { TranslationEditor, type Translations } from '../../../../components/admin/TranslationEditor'
import { confirmDialog } from '../../../../components/admin/ui'

interface GalleryItem {
  id: string
  kind: 'photo' | 'video'
  title: string
  album: string | null
  image_url: string | null
  thumbnail_url: string | null
  video_embed_url: string | null
  display_order: number
  is_active: boolean
  translations?: Translations
}

const empty = { kind: 'photo' as 'photo' | 'video', title: '', album: '', image_url: '', video_url: '', display_order: 0, translations: {} as Translations }

export default function AdminGalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'photo' | 'video'>('all')
  const [albumFilter, setAlbumFilter] = useState('')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const load = async () => {
    try {
      setItems((await adminGet<GalleryItem[]>('/gallery')).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Galeri yüklenemedi') })
    }
  }
  useEffect(() => { load() }, [])

  const startEdit = (item: GalleryItem) => {
    setEditingId(item.id)
    setForm({
      kind: item.kind,
      title: item.title,
      album: item.album || '',
      image_url: item.image_url || '',
      video_url: item.video_embed_url || '',
      display_order: item.display_order,
      translations: item.translations || {},
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(empty)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (form.kind === 'photo' && !form.image_url.trim()) {
      setMessage({ type: 'error', text: 'Lütfen bir fotoğraf seçin veya görsel adresi girin.' })
      return
    }
    setMessage(null)
    setSaving(true)
    const payload = {
      kind: form.kind,
      title: form.title,
      album: form.album || null,
      image_url: form.image_url || null,
      video_url: form.kind === 'video' ? form.video_url : null,
      display_order: Number(form.display_order) || 0,
      is_active: editingId ? items.find((i) => i.id === editingId)?.is_active ?? true : true,
      translations: form.translations,
    }
    try {
      if (editingId) {
        await adminSend('put', `/gallery/${editingId}`, payload)
        setMessage({ type: 'ok', text: 'Galeri öğesi güncellendi' })
        setEditingId(null)
        setForm(empty)
      } else {
        await adminSend('post', '/gallery', payload)
        setForm({ ...empty, kind: form.kind, album: form.album })
        setMessage({ type: 'ok', text: 'Galeriye eklendi' })
      }
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (item: GalleryItem) => {
    try {
      await adminSend('put', `/gallery/${item.id}`, {
        kind: item.kind, title: item.title, album: item.album, image_url: item.image_url,
        video_url: item.video_embed_url, display_order: item.display_order, is_active: !item.is_active,
        translations: item.translations || {},
      })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const remove = async (item: GalleryItem) => {
    if (!(await confirmDialog(`"${item.title}" galeriden silinsin mi?`))) return
    try {
      await adminSend('delete', `/gallery/${item.id}`)
      if (editingId === item.id) cancelEdit()
      setMessage({ type: 'ok', text: 'Galeriden silindi' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const albums = Array.from(new Set(items.map((i) => i.album?.trim()).filter((a): a is string => !!a))).sort((a, b) => a.localeCompare(b, 'tr'))
  const q = query.trim().toLocaleLowerCase('tr')
  const visible = items.filter((i) => {
    if (filter !== 'all' && i.kind !== filter) return false
    if (albumFilter && (i.album || '') !== albumFilter) return false
    return !q || `${i.title} ${i.album || ''}`.toLocaleLowerCase('tr').includes(q)
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Foto & Video Galeri</h1>
          <p className="mt-1 text-sm text-gray-500">Galeri sitede /galeri adresinde yayınlanır. Videolar yalnız YouTube veya Vimeo bağlantısıyla eklenir.</p>
        </div>
        <a href="/galeri" target="_blank" rel="noreferrer" className={ghostButton}>Galeriyi Görüntüle ↗</a>
      </div>

      <Notice message={message} />

      <Card className="border border-gray-100 p-6 shadow-sm">
        <form onSubmit={save} className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Label label="Tür">
            <select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'photo' | 'video' })}>
              <option value="photo">Fotoğraf</option>
              <option value="video">Video</option>
            </select>
          </Label>
          <div className="lg:col-span-2">
            <TextInput label="Başlık" required value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
          </div>
          <Label label="Albüm">
            <input list="gallery-albums" className={inputClass} placeholder="Ramazan 2026" value={form.album} onChange={(e) => setForm({ ...form, album: e.target.value })} />
            <datalist id="gallery-albums">
              {albums.map((a) => <option key={a} value={a} />)}
            </datalist>
          </Label>
          <TextInput label="Sıra" type="number" value={form.display_order} onChange={(v) => setForm({ ...form, display_order: Number(v) || 0 })} />
          <div className="lg:col-span-1">
            {form.kind === 'photo' ? (
              <ImageField label="Görsel" value={form.image_url} onChange={(v) => setForm({ ...form, image_url: v })} />
            ) : (
              <TextInput label="YouTube / Vimeo" required placeholder="https://youtu.be/..." value={form.video_url} onChange={(v) => setForm({ ...form, video_url: v })} />
            )}
          </div>
          <div className="lg:col-span-6">
            <TranslationEditor fields={[{ key: 'title', label: 'Başlık' }, { key: 'album', label: 'Albüm' }]}
              value={form.translations} onChange={(v) => setForm({ ...form, translations: v })} />
          </div>
          <div className="flex justify-end gap-2 lg:col-span-6">
            {editingId && <button type="button" onClick={cancelEdit} className={ghostButton}>Vazgeç</button>}
            <button type="submit" disabled={saving} className={`${primaryButton} disabled:opacity-50`}>
              {saving ? 'Kaydediliyor…' : editingId ? 'Güncelle' : 'Ekle'}
            </button>
          </div>
        </form>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {([['all', 'Tümü'], ['photo', 'Fotoğraflar'], ['video', 'Videolar']] as const).map(([k, l]) => {
            const count = k === 'all' ? items.length : items.filter((i) => i.kind === k).length
            return (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === k ? 'border-primary-600 bg-primary-600 text-white' : 'bg-white text-gray-700'}`}>
                {l} ({count})
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {albums.length > 0 && (
            <select value={albumFilter} onChange={(e) => setAlbumFilter(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs">
              <option value="">Tüm albümler</option>
              {albums.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Başlık veya albüm ara…"
            className="w-48 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-primary-500"
          />
        </div>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">Galeri boş.</p>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">Arama kriterine uyan galeri öğesi bulunamadı.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((item) => (
            <Card key={item.id} className={`overflow-hidden border border-gray-100 shadow-sm ${item.is_active ? '' : 'opacity-50'}`}>
              <div className="relative aspect-video bg-gray-100">
                {item.thumbnail_url && <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" />}
                {item.kind === 'video' && <span className="absolute inset-0 flex items-center justify-center text-3xl text-white drop-shadow">▶</span>}
              </div>
              <div className="space-y-2 p-3">
                <div className="truncate text-sm font-semibold text-gray-900">{item.title}</div>
                <div className="text-xs text-gray-500">{item.album || 'Albümsüz'} · Sıra: {item.display_order}</div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => startEdit(item)} className={ghostButton}>Düzenle</button>
                  <button onClick={() => toggle(item)} className={ghostButton}>{item.is_active ? 'Gizle' : 'Yayınla'}</button>
                  <button onClick={() => remove(item)} className={`${ghostButton} text-red-600`}>Sil</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
