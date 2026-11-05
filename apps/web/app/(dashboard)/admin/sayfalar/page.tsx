'use client'

import { useEffect, useState } from 'react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { BODY_HINT, Notice, StatusPill, TextArea, TextInput, ghostButton, primaryButton } from '../../../../components/admin/FormKit'
import { ImageField } from '../../../../components/admin/ImageField'
import { TranslationEditor, type Translations } from '../../../../components/admin/TranslationEditor'

const PAGE_I18N_FIELDS = [
  { key: 'title', label: 'Sayfa başlığı' }, { key: 'body', label: 'İçerik', long: true },
  { key: 'seo_title', label: 'SEO başlığı' }, { key: 'seo_description', label: 'SEO açıklaması' },
]

interface SitePage {
  id: string
  slug: string
  title: string
  body: string
  cover_image_url: string | null
  seo_title: string | null
  seo_description: string | null
  is_published: boolean
  updated_at: string
  translations?: Translations
}

const empty = { title: '', slug: '', body: '', cover_image_url: '', seo_title: '', seo_description: '', is_published: false, translations: {} as Translations }

export default function AdminPagesPage() {
  const [pages, setPages] = useState<SitePage[]>([])
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const load = async () => {
    try {
      setPages((await adminGet<SitePage[]>('/pages')).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Sayfalar yüklenemedi') })
    }
  }
  useEffect(() => { load() }, [])

  const set = <K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) => setForm((f) => ({ ...f, [key]: value }))

  const edit = (page: SitePage | null) => {
    setEditingId(page?.id || null)
    setShowForm(true)
    setForm(page ? {
      title: page.title, slug: page.slug, body: page.body, cover_image_url: page.cover_image_url || '',
      seo_title: page.seo_title || '', seo_description: page.seo_description || '', is_published: page.is_published,
      translations: page.translations || {},
    } : empty)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    const body = {
      ...form,
      slug: form.slug || null,
      cover_image_url: form.cover_image_url || null,
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
    }
    try {
      if (editingId) await adminSend('put', `/pages/${editingId}`, body)
      else await adminSend('post', '/pages', body)
      setMessage({ type: 'ok', text: 'Sayfa kaydedildi' })
      setShowForm(false)
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const remove = async (page: SitePage) => {
    if (!window.confirm(`"${page.title}" sayfası silinsin mi? Menüdeki bağlantıları ayrıca kaldırmayı unutmayın.`)) return
    try {
      await adminSend('delete', `/pages/${page.id}`)
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sayfalar</h1>
          <p className="mt-1 text-sm text-gray-500">Yayındaki sayfalar /sayfa/adres altında açılır. Menüye eklemek için Menü Yönetimi&apos;ni kullanın.</p>
        </div>
        <button className={primaryButton} onClick={() => (showForm ? setShowForm(false) : edit(null))}>
          {showForm ? 'Vazgeç' : '+ Yeni Sayfa'}
        </button>
      </div>

      <Notice message={message} />

      {showForm && (
        <Card className="border border-gray-100 p-6 shadow-sm">
          <form onSubmit={save} className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <TextInput label="Sayfa başlığı" required minLength={2} value={form.title} onChange={(v) => set('title', v)} />
              <TextArea label="İçerik" rows={16} hint={BODY_HINT} value={form.body} onChange={(v) => set('body', v)} />
            </div>
            <div className="space-y-4">
              <TextInput label="Adres (slug)" hint="Boş bırakılırsa başlıktan üretilir" placeholder="tarihcemiz" value={form.slug} onChange={(v) => set('slug', v)} />
              <ImageField label="Kapak görseli" value={form.cover_image_url} onChange={(v) => set('cover_image_url', v)} />
              <TextInput label="SEO başlığı" maxLength={160} value={form.seo_title} onChange={(v) => set('seo_title', v)} />
              <TextArea label="SEO açıklaması" rows={3} maxLength={320} value={form.seo_description} onChange={(v) => set('seo_description', v)} />
              <TranslationEditor fields={PAGE_I18N_FIELDS} value={form.translations} onChange={(v) => set('translations', v)} />
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={form.is_published} onChange={(e) => set('is_published', e.target.checked)} /> Yayında
              </label>
              <button type="submit" className={`${primaryButton} w-full`}>{editingId ? 'Güncelle' : 'Kaydet'}</button>
            </div>
          </form>
        </Card>
      )}

      <Card className="border border-gray-100 p-6 shadow-sm">
        {pages.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">Henüz sayfa yok. Tarihçe, SSS, Banka Hesapları gibi sayfaları buradan oluşturabilirsiniz.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {pages.map((page) => (
              <li key={page.id} className="flex items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-900">{page.title}</div>
                  <div className="text-xs text-gray-500">/sayfa/{page.slug} · {new Date(page.updated_at).toLocaleDateString('tr-TR')}</div>
                </div>
                <StatusPill active={page.is_published} />
                {page.is_published && <a href={`/sayfa/${page.slug}`} target="_blank" rel="noreferrer" className={ghostButton}>Görüntüle ↗</a>}
                <button onClick={() => edit(page)} className={ghostButton}>Düzenle</button>
                <button onClick={() => remove(page)} className={`${ghostButton} text-red-600`}>Sil</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
