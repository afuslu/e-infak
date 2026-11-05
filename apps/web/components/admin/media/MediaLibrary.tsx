'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiErrorMessage } from '../../../lib/admin-access'
import { ACCEPTED_IMAGES, formatBytes, mediaApi, type MediaAsset, type MediaFolders, type MediaUsage } from '../../../lib/media'
import { ghostButton, inputClass } from '../FormKit'

const PAGE_SIZE = 40

interface UploadItem { key: string; name: string; progress: number; error?: string }

/** Folder list, search, upload area and image grid of the organisation's media library.
 *  `selectedId` / `onSelect` drive the detail panel (admin page) or the choice (MediaPicker). */
export function MediaLibrary({ selectedId, onSelect, onOpen, reloadKey = 0, compact = false }: {
  selectedId?: string | null
  onSelect: (asset: MediaAsset) => void
  onOpen?: (asset: MediaAsset) => void
  reloadKey?: number
  compact?: boolean
}) {
  const [folders, setFolders] = useState<MediaFolders>({ folders: [], root_count: 0, total: 0 })
  const [folder, setFolder] = useState<string>('')  // '' all, 'root' unfiled, otherwise id
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [unused, setUnused] = useState(false)
  const [items, setItems] = useState<MediaAsset[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [usage, setUsage] = useState<MediaUsage | null>(null)
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadMeta = useCallback(async () => {
    try {
      const [f, u, t] = await Promise.all([mediaApi.folders(), mediaApi.usage(), mediaApi.tags()])
      setFolders(f.data)
      setUsage(u.data)
      setTags(t.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Medya kütüphanesi yüklenemedi'))
    }
  }, [])

  const load = useCallback(async (nextPage = 1) => {
    setLoading(true)
    setError('')
    try {
      const res = await mediaApi.list({
        folder: folder || undefined, q: query || undefined, tag: tag || undefined,
        unused: unused || undefined, page: nextPage, page_size: PAGE_SIZE,
      })
      setItems((prev) => (nextPage === 1 ? res.data.items : [...prev, ...res.data.items]))
      setTotal(res.data.total)
      setPage(nextPage)
    } catch (err) {
      setError(apiErrorMessage(err, 'Görseller yüklenemedi'))
    } finally {
      setLoading(false)
    }
  }, [folder, query, tag, unused])

  useEffect(() => { load(1) }, [load, reloadKey])
  useEffect(() => { loadMeta() }, [loadMeta, reloadKey])
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return
    const targetFolder = folder && folder !== 'root' ? folder : null
    const queue = files.map((file, i) => ({ file, key: `${Date.now()}-${i}-${file.name}` }))
    setUploads((prev) => [...prev, ...queue.map(({ key, file }) => ({ key, name: file.name, progress: 0 }))])
    const patch = (key: string, data: Partial<UploadItem>) =>
      setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...data } : u)))
    let last: MediaAsset | null = null
    // Three at a time: fast enough, and the server converts each image right away.
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length) {
        const { file, key } = queue.shift()!
        try {
          const res = await mediaApi.upload(file, targetFolder, (p) => patch(key, { progress: p }))
          last = res.data
          setUploads((prev) => prev.filter((u) => u.key !== key))
        } catch (err) {
          patch(key, { error: apiErrorMessage(err, 'Yüklenemedi'), progress: 100 })
        }
      }
    })
    await Promise.all(workers)
    await Promise.all([load(1), loadMeta()])
    if (last && files.length === 1) onSelect(last)
  }

  const addFolder = async () => {
    const name = window.prompt('Yeni klasör adı')
    if (!name?.trim()) return
    try {
      const res = await mediaApi.createFolder(name.trim())
      await loadMeta()
      setFolder(res.data.id)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const renameFolder = async (id: string, current: string) => {
    const name = window.prompt('Klasörün yeni adı', current)
    if (!name?.trim() || name === current) return
    try {
      await mediaApi.renameFolder(id, name.trim())
      await loadMeta()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const deleteFolder = async (id: string, name: string) => {
    if (!window.confirm(`"${name}" klasörü silinsin mi? İçindeki görseller silinmez, "Klasörsüz" bölümüne taşınır.`)) return
    try {
      await mediaApi.deleteFolder(id)
      setFolder('')
      await loadMeta()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const dropOnFolder = async (e: React.DragEvent, folderId: string | null) => {
    const assetId = e.dataTransfer.getData('application/x-media-id')
    if (!assetId) return
    e.preventDefault()
    try {
      await mediaApi.move([assetId], folderId)
      await Promise.all([load(1), loadMeta()])
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const percent = usage && usage.quota_bytes ? Math.min(100, (usage.used_bytes / usage.quota_bytes) * 100) : 0
  const folderButton = (key: string, label: string, count: number, folderId?: string) => (
    <div key={key} className={`group flex items-center rounded-lg ${folder === key ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'}`}
      onDragOver={(e) => key !== '' && e.preventDefault()}
      onDrop={(e) => key !== '' && dropOnFolder(e, key === 'root' ? null : key)}>
      <button type="button" onClick={() => setFolder(key)} className="flex flex-1 items-center justify-between px-3 py-1.5 text-left text-sm font-semibold">
        <span className="truncate">{key === '' ? '🗂️' : key === 'root' ? '📄' : '📁'} {label}</span>
        <span className="ml-2 text-xs text-gray-400">{count}</span>
      </button>
      {folderId && (
        <span className="hidden pr-1 group-hover:flex">
          <button type="button" title="Yeniden adlandır" onClick={() => renameFolder(folderId, label)} className="px-1 text-xs">✏️</button>
          <button type="button" title="Klasörü sil" onClick={() => deleteFolder(folderId, label)} className="px-1 text-xs">🗑️</button>
        </span>
      )}
    </div>
  )

  return (
    <div className={`flex gap-4 ${compact ? 'flex-col md:flex-row' : 'flex-col lg:flex-row'}`}>
      <aside className={`flex-shrink-0 space-y-1 ${compact ? 'md:w-48' : 'lg:w-56'}`}>
        {folderButton('', 'Tüm görseller', folders.total)}
        {folderButton('root', 'Klasörsüz', folders.root_count)}
        {folders.folders.map((f) => folderButton(f.id, f.name, f.count, f.id))}
        <button type="button" onClick={addFolder} className="w-full rounded-lg px-3 py-1.5 text-left text-sm font-semibold text-primary-700 hover:bg-primary-50">
          + Yeni klasör
        </button>
        {usage && (
          <div className="mt-4 rounded-lg border bg-white p-3 text-xs text-gray-600" title={`${usage.count} görsel`}>
            <div className="mb-1 flex justify-between font-semibold"><span>Depolama</span><span>%{percent.toFixed(0)}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full ${percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-amber-500' : 'bg-primary-600'}`} style={{ width: `${percent}%` }} />
            </div>
            <div className="mt-1 text-gray-400">{formatBytes(usage.used_bytes)} / {formatBytes(usage.quota_bytes)}</div>
          </div>
        )}
      </aside>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${inputClass} max-w-xs`} placeholder="Ad, alt metin veya etiket ara…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {tags.length > 0 && (
            <select className={`${inputClass} w-auto`} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Tüm etiketler</option>
              {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1 text-xs font-semibold text-gray-600">
            <input type="checkbox" checked={unused} onChange={(e) => setUnused(e.target.checked)} /> Yalnız kullanılmayanlar
          </label>
          <span className="flex-1" />
          <button type="button" className={ghostButton} onClick={() => fileRef.current?.click()}>⬆️ Görsel yükle</button>
          <input ref={fileRef} type="file" multiple accept={ACCEPTED_IMAGES} className="hidden"
            onChange={(e) => { uploadFiles(Array.from(e.target.files || [])); e.target.value = '' }} />
        </div>

        <div
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return
            e.preventDefault()
            setDragging(false)
            uploadFiles(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/')))
          }}
          className={`rounded-xl border-2 border-dashed p-3 transition ${dragging ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}
        >
          <p className="mb-3 text-center text-xs text-gray-400">
            Görselleri buraya sürükleyip bırakın (PNG, JPEG, WEBP, GIF, ICO · en fazla 5 MB). Otomatik olarak WebP’ye çevrilir ve her ekran için küçültülür.
          </p>

          {uploads.length > 0 && (
            <ul className="mb-3 space-y-1">
              {uploads.map((u) => (
                <li key={u.key} className="text-xs">
                  <div className="flex justify-between">
                    <span className="truncate font-semibold text-gray-700">{u.name}</span>
                    {u.error ? (
                      <button type="button" className="text-red-600" onClick={() => setUploads((prev) => prev.filter((x) => x.key !== u.key))}>{u.error} ✕</button>
                    ) : <span className="text-gray-400">{u.progress < 100 ? `%${u.progress}` : 'İşleniyor…'}</span>}
                  </div>
                  <div className="h-1 overflow-hidden rounded bg-gray-100">
                    <div className={`h-full ${u.error ? 'bg-red-500' : 'bg-primary-600'}`} style={{ width: `${u.progress}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="mb-2 text-sm font-semibold text-red-600">{error}</p>}

          {items.length === 0 && !loading ? (
            <p className="py-10 text-center text-sm text-gray-400">Bu görünümde görsel yok.</p>
          ) : (
            <div className={`grid gap-3 ${compact ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
              {items.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/x-media-id', asset.id)}
                  onClick={() => onSelect(asset)}
                  onDoubleClick={() => onOpen?.(asset)}
                  title={asset.original_name}
                  className={`group overflow-hidden rounded-lg border bg-white text-left shadow-sm transition ${selectedId === asset.id ? 'ring-2 ring-primary-600' : 'hover:border-primary-300'}`}
                >
                  <div className="aspect-square bg-[repeating-conic-gradient(#f3f4f6_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
                    <img src={asset.thumbnail_url} alt={asset.alt_text} loading="lazy" className="h-full w-full object-cover"
                      style={{ objectPosition: `${asset.focal_x * 100}% ${asset.focal_y * 100}%` }} />
                  </div>
                  <div className="px-2 py-1">
                    <p className="truncate text-xs font-semibold text-gray-700">{asset.original_name || 'Adsız'}</p>
                    <p className="text-[10px] text-gray-400">{asset.width}×{asset.height} · {formatBytes(asset.size_bytes)}{!asset.alt_text && ' · alt metin yok'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {items.length < total && (
            <div className="mt-3 text-center">
              <button type="button" disabled={loading} className={ghostButton} onClick={() => load(page + 1)}>
                {loading ? 'Yükleniyor…' : `Daha fazla göster (${total - items.length})`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
