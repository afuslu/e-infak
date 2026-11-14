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
  const [filter, setFilter] = useState<'all' | 'photo' | 'video'>('all')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const load = async () => {
    try {
      setItems((await adminGet<GalleryItem[]>('/gallery')).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Galeri yüklenemedi') })
    }
  }
  useEffect(() => { load() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    try {
      await adminSend('post', '/gallery', {
        kind: form.kind,
        title: form.title,
        album: form.album || null,
        image_url: form.image_url || null,
        video_url: form.kind === 'video' ? form.video_url : null,
        display_order: Number(form.display_order) || 0,
        is_active: true,
        translations: form.translations,
      })
      setForm({ ...empty, kind: form.kind, album: form.album })
      setMessage({ type: 'ok', text: 'Galeriye eklendi' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
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
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const visible = filter === 'all' ? items : items.filter((i) => i.kind === filter)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Foto & Video Galeri</h1>
        <p className="mt-1 text-sm text-gray-500">Galeri sitede /galeri adresinde yayınlanır. Videolar yalnız YouTube veya Vimeo bağlantısıyla eklenir.</p>
      </div>

      <Notice message={message} />

      <Card className="border border-gray-100 p-6 shadow-sm">
        <form onSubmit={add} className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Label label="Tür">
            <select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'photo' | 'video' })}>
              <option value="photo">Fotoğraf</option>
              <option value="video">Video</option>
            </select>
          </Label>
          <div className="lg:col-span-2">
            <TextInput label="Başlık" required value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
          </div>
          <TextInput label="Albüm" placeholder="Ramazan 2026" value={form.album} onChange={(v) => setForm({ ...form, album: v })} />
          <div className="lg:col-span-2">
            {form.kind === 'photo' ? (
              <ImageField label="Görsel" value={form.image_url} onChange={(v) => setForm({ ...form, image_url: v })} />
            ) : (
              <TextInput label="YouTube / Vimeo bağlantısı" required placeholder="https://youtu.be/..." value={form.video_url} onChange={(v) => setForm({ ...form, video_url: v })} />
            )}
          </div>
          <div className="lg:col-span-6">
            <TranslationEditor fields={[{ key: 'title', label: 'Başlık' }, { key: 'album', label: 'Albüm' }]}
              value={form.translations} onChange={(v) => setForm({ ...form, translations: v })} />
          </div>
          <div className="flex justify-end lg:col-span-6">
            <button type="submit" className={primaryButton}>Ekle</button>
          </div>
        </form>
      </Card>

      <div className="flex gap-2">
        {([['all', 'Tümü'], ['photo', 'Fotoğraflar'], ['video', 'Videolar']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === k ? 'border-primary-600 bg-primary-600 text-white' : 'bg-white text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">Galeri boş.</p>
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
                <div className="text-xs text-gray-500">{item.album || 'Albümsüz'}</div>
                <div className="flex gap-2">
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
