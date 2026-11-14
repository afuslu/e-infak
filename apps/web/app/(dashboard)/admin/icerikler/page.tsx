'use client'

import { useEffect, useState } from 'react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import {
  BODY_HINT, Label, Notice, StatusPill, TextArea, TextInput, ghostButton, inputClass, primaryButton,
} from '../../../../components/admin/FormKit'
import { ImageField } from '../../../../components/admin/ImageField'
import { TranslationEditor, type Translations } from '../../../../components/admin/TranslationEditor'
import { PageHeader, confirmDialog } from '../../../../components/admin/ui'

interface Post {
  id: string
  kind: 'haber' | 'blog' | 'faaliyet'
  slug: string | null
  title: string
  summary: string | null
  body: string | null
  image_url: string | null
  gallery_urls: string[]
  video_url: string | null
  published_at: string | null
  display_order: number
  is_active: boolean
  seo_title: string | null
  seo_description: string | null
  translations?: Translations
}

const POST_I18N_FIELDS = [
  { key: 'title', label: 'Başlık' }, { key: 'summary', label: 'Kısa özet' }, { key: 'body', label: 'İçerik', long: true },
  { key: 'seo_title', label: 'SEO başlığı' }, { key: 'seo_description', label: 'SEO açıklaması' },
]

const KIND_LABELS: Record<Post['kind'], string> = { haber: 'Haber', blog: 'Blog', faaliyet: 'Faaliyet' }

const emptyForm = {
  kind: 'haber' as Post['kind'],
  title: '',
  slug: '',
  summary: '',
  body: '',
  image_url: '',
  gallery: '',
  video_url: '',
  published_at: '',
  display_order: 0,
  is_active: true,
  seo_title: '',
  seo_description: '',
  translations: {} as Translations,
}

export default function AdminContentPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [filter, setFilter] = useState<'' | Post['kind']>('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft'>('all')
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      setPosts((await adminGet<Post[]>('/content-posts')).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'İçerikler yüklenemedi') })
    }
  }

  useEffect(() => { load() }, [])

  const set = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) => setForm((f) => ({ ...f, [key]: value }))

  const startEdit = (post: Post | null) => {
    setEditingId(post?.id || null)
    setShowForm(true)
    setForm(post ? {
      kind: post.kind,
      title: post.title,
      slug: post.slug || '',
      summary: post.summary || '',
      body: post.body || '',
      image_url: post.image_url || '',
      gallery: (post.gallery_urls || []).join('\n'),
      video_url: post.video_url || '',
      published_at: post.published_at ? post.published_at.slice(0, 10) : '',
      display_order: post.display_order,
      is_active: post.is_active,
      seo_title: post.seo_title || '',
      seo_description: post.seo_description || '',
      translations: post.translations || {},
    } : emptyForm)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const body = {
      kind: form.kind,
      title: form.title,
      slug: form.slug || null,
      summary: form.summary || null,
      body: form.body || null,
      image_url: form.image_url || null,
      gallery_urls: form.gallery.split('\n').map((s) => s.trim()).filter(Boolean),
      video_url: form.video_url || null,
      published_at: form.published_at ? `${form.published_at}T09:00:00+03:00` : null,
      display_order: Number(form.display_order) || 0,
      is_active: form.is_active,
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
      translations: form.translations,
    }
    try {
      if (editingId) await adminSend('put', `/content-posts/${editingId}`, body)
      else await adminSend('post', '/content-posts', body)
      setMessage({
        type: 'ok',
        text: editingId
          ? 'İçerik güncellendi'
          : form.is_active ? 'İçerik yayınlandı' : 'İçerik taslak olarak kaydedildi',
      })
      setShowForm(false)
      setEditingId(null)
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const duplicate = (post: Post) => {
    setEditingId(null)
    setShowForm(true)
    setForm({
      kind: post.kind,
      title: `${post.title} (Kopya)`,
      slug: '',
      summary: post.summary || '',
      body: post.body || '',
      image_url: post.image_url || '',
      gallery: (post.gallery_urls || []).join('\n'),
      video_url: post.video_url || '',
      published_at: post.published_at ? post.published_at.slice(0, 10) : '',
      display_order: post.display_order,
      is_active: false,
      seo_title: post.seo_title || '',
      seo_description: post.seo_description || '',
      translations: post.translations || {},
    })
  }

  const remove = async (post: Post) => {
    if (!(await confirmDialog(`"${post.title}" silinsin mi?`))) return
    try {
      await adminSend('delete', `/content-posts/${post.id}`)
      setMessage({ type: 'ok', text: 'İçerik silindi' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const q = query.trim().toLocaleLowerCase('tr')
  const visible = posts.filter((p) => {
    if (filter && p.kind !== filter) return false
    if (statusFilter === 'active' && !p.is_active) return false
    if (statusFilter === 'draft' && p.is_active) return false
    return !q || `${p.title} ${p.summary || ''} ${p.slug || ''}`.toLocaleLowerCase('tr').includes(q)
  })
  const wordCount = form.body.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length
  const readMins = Math.max(1, Math.ceil(wordCount / 200))

  return (
    <div className="space-y-6">
      <PageHeader title="Haber, Blog & Faaliyetler" description={<>Yayındaki içerikler sitede /haberler adresinde ve ana sayfada listelenir.</>} actions={<button className={primaryButton} onClick={() => (showForm ? setShowForm(false) : startEdit(null))}>
          {showForm ? 'Vazgeç' : '+ Yeni İçerik'}
        </button>} />

      <Notice message={message} />

      {showForm && (
        <Card className="border border-gray-100 p-6 shadow-sm">
          <form onSubmit={save} className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <div className="grid gap-4 sm:grid-cols-3">
                <Label label="Tür">
                  <select className={inputClass} value={form.kind} onChange={(e) => set('kind', e.target.value as Post['kind'])}>
                    {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Label>
                <div className="sm:col-span-2">
                  <TextInput label="Başlık" required minLength={2} value={form.title} onChange={(v) => set('title', v)} />
                </div>
              </div>
              <TextArea label={`Kısa özet (${form.summary.length}/500 · liste ve paylaşımlarda görünür)`} rows={2} maxLength={500} value={form.summary} onChange={(v) => set('summary', v)} />
              <div>
                <TextArea label="İçerik" rows={14} hint={BODY_HINT} value={form.body} onChange={(v) => set('body', v)} />
                {wordCount > 0 && (
                  <div className="mt-1 text-end text-[11px] text-gray-400">{wordCount} kelime · ~{readMins} dk okuma</div>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <ImageField label="Kapak görseli" value={form.image_url} onChange={(v) => set('image_url', v)} />
              <TextArea label="Foto galerisi (her satıra bir görsel adresi)" rows={4} value={form.gallery} onChange={(v) => set('gallery', v)} />
              <TextInput label="Video (YouTube / Vimeo bağlantısı)" placeholder="https://youtu.be/..." value={form.video_url} onChange={(v) => set('video_url', v)} />
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Yayın tarihi" type="date" value={form.published_at} onChange={(v) => set('published_at', v)} />
                <TextInput label="Sıra" type="number" value={form.display_order} onChange={(v) => set('display_order', Number(v))} />
              </div>
              <details className="rounded-lg border border-gray-200 p-3">
                <summary className="cursor-pointer text-xs font-bold text-gray-600">Adres & SEO</summary>
                <div className="mt-3 space-y-3">
                  <TextInput label="Adres (slug)" hint="Boş bırakılırsa başlıktan üretilir" placeholder="kis-yardimi" value={form.slug} onChange={(v) => set('slug', v)} />
                  <TextInput label={`SEO başlığı (${form.seo_title.length}/60 önerilen)`} maxLength={160} value={form.seo_title} onChange={(v) => set('seo_title', v)} />
                  <TextArea label={`SEO açıklaması (${form.seo_description.length}/155 önerilen)`} rows={3} maxLength={320} value={form.seo_description} onChange={(v) => set('seo_description', v)} />
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Google Önizleme</div>
                    <div className="truncate text-sm font-medium text-blue-700">{form.seo_title || form.title || 'İçerik Başlığı'}</div>
                    <div className="truncate text-[11px] text-emerald-700">/haberler/{form.slug || 'icerik-adresi'}</div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-gray-600">{form.seo_description || form.summary || 'İçerik özeti arama sonuçlarında burada görünür.'}</div>
                  </div>
                </div>
              </details>
              <TranslationEditor fields={POST_I18N_FIELDS} value={form.translations} onChange={(v) => set('translations', v)} />
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Yayında
              </label>
              <button type="submit" disabled={saving} className={`${primaryButton} w-full`}>
                {saving ? 'Kaydediliyor...' : editingId ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </form>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {([['', 'Tümü'], ['haber', 'Haber'], ['blog', 'Blog'], ['faaliyet', 'Faaliyet']] as const).map(([k, l]) => {
            const count = k ? posts.filter((p) => p.kind === k).length : posts.length
            return (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === k ? 'border-primary-600 bg-primary-600 text-white' : 'bg-white text-gray-700'}`}>
                {l} ({count})
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Başlık veya özet ara…"
            className="w-52 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-primary-500"
          />
          <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 text-xs font-semibold">
            {([['all', 'Tümü'], ['active', 'Yayında'], ['draft', 'Taslak']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setStatusFilter(k)}
                className={`rounded-md px-2.5 py-1 ${statusFilter === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card className="border border-gray-100 p-6 shadow-sm">
        {posts.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">Henüz içerik yok.</p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">Arama kriterine uyan içerik bulunamadı.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((post) => (
              <li key={post.id} className="flex flex-wrap items-center gap-4 py-3">
                {post.image_url
                  ? <img src={post.image_url} alt="" className="h-12 w-16 flex-shrink-0 rounded object-cover" />
                  : <div className="h-12 w-16 flex-shrink-0 rounded bg-gray-100" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-gray-900">{post.title}</div>
                  <div className="text-xs text-gray-500">
                    {KIND_LABELS[post.kind]} · /haberler/{post.slug}
                    {post.published_at && ` · ${new Date(post.published_at).toLocaleDateString('tr-TR')}`}
                  </div>
                </div>
                <StatusPill active={post.is_active} />
                <div className="flex flex-wrap gap-2">
                  {post.is_active && post.slug && (
                    <a href={`/haberler/${post.slug}`} target="_blank" rel="noreferrer" className={ghostButton}>Görüntüle ↗</a>
                  )}
                  <button type="button" onClick={() => duplicate(post)} className={ghostButton}>Çoğalt</button>
                  <button type="button" onClick={() => startEdit(post)} className={ghostButton}>Düzenle</button>
                  <button type="button" onClick={() => remove(post)} className={`${ghostButton} text-red-600`}>Sil</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
