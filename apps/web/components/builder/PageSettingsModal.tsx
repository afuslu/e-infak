'use client'

import { useEffect, useState } from 'react'
import { adminGet, adminSend, apiErrorMessage } from '../../lib/admin-access'
import { confirmDialog } from '../admin/ui'

interface SitePageDetail {
  id: string
  slug: string
  title: string
  body: string
  cover_image_url: string | null
  seo_title: string | null
  seo_description: string | null
  is_published: boolean
}

export function PageSettingsModal({
  pageId,
  onClose,
  onSaved,
  onDeleted,
}: {
  pageId: string
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [page, setPage] = useState<SitePageDetail | null>(null)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [isPublished, setIsPublished] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    adminGet<SitePageDetail[]>('/pages')
      .then((res) => {
        const found = res.data.find((p) => p.id === pageId)
        if (!found) {
          setError('Sayfa bulunamadı')
          return
        }
        setPage(found)
        setTitle(found.title)
        setSlug(found.slug)
        setSeoTitle(found.seo_title || '')
        setSeoDescription(found.seo_description || '')
        setIsPublished(found.is_published)
      })
      .catch((err) => setError(apiErrorMessage(err, 'Sayfa bilgileri yüklenemedi')))
  }, [pageId])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!page || saving) return
    setSaving(true)
    setError('')
    try {
      await adminSend('put', `/pages/${page.id}`, {
        title: title.trim(),
        slug: slug.trim() || null,
        body: page.body,
        cover_image_url: page.cover_image_url,
        seo_title: seoTitle.trim() || null,
        seo_description: seoDescription.trim() || null,
        is_published: isPublished,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Kaydedilemedi'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!page) return
    if (!(await confirmDialog(`“${page.title}” sayfası kalıcı olarak silinsin mi?`))) return
    setSaving(true)
    setError('')
    try {
      await adminSend('delete', `/pages/${page.id}`)
      onDeleted()
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Silinemedi'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">Sayfa Ayarları &amp; SEO</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Kapat">✕</button>
        </div>

        {!page && !error ? (
          <p className="py-6 text-center text-xs text-gray-400">Yükleniyor…</p>
        ) : (
          <form onSubmit={save} className="space-y-3 text-xs">
            {error && <p className="rounded bg-red-50 px-2.5 py-2 font-semibold text-red-700">{error}</p>}
            {page && (
              <>
                <label className="block font-semibold text-gray-600">
                  <span className="mb-1 block">Sayfa Başlığı</span>
                  <input className="w-full rounded-md border px-2.5 py-1.5 text-sm" required value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label className="block font-semibold text-gray-600">
                  <span className="mb-1 block">URL Adresi (slug)</span>
                  <div className="flex items-center rounded-md border bg-gray-50 px-2">
                    <span className="text-gray-400">/sayfa/</span>
                    <input className="min-w-0 flex-1 bg-transparent py-1.5 pl-1 font-mono text-xs outline-none" value={slug} onChange={(e) => setSlug(e.target.value)} />
                  </div>
                </label>
                <label className="block font-semibold text-gray-600">
                  <span className="mb-1 block">SEO Başlığı</span>
                  <input className="w-full rounded-md border px-2.5 py-1.5 text-xs" maxLength={120} placeholder="Arama motorları için başlık"
                    value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
                </label>
                <label className="block font-semibold text-gray-600">
                  <span className="mb-1 block">SEO Açıklaması</span>
                  <textarea rows={2} className="w-full rounded-md border px-2.5 py-1.5 text-xs" maxLength={300} placeholder="Kısa özet (150-160 karakter önerilir)"
                    value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />
                </label>
                <label className="flex items-center gap-2 pt-1 font-semibold text-gray-700">
                  <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
                  Yayında (ziyaretçilere açık)
                </label>
                <div className="flex items-center justify-between border-t pt-3">
                  <button type="button" onClick={remove} disabled={saving} className="font-semibold text-red-600 hover:underline disabled:opacity-50">
                    Sayfayı Sil
                  </button>
                  <div className="flex gap-2">
                    <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 font-semibold text-gray-600 hover:bg-gray-50">Vazgeç</button>
                    <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-3 py-1.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                      {saving ? 'Kaydediliyor…' : 'Kaydet'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
