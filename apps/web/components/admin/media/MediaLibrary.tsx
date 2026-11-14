'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiErrorMessage } from '../../../lib/admin-access'
import { ACCEPTED_IMAGES, formatBytes, mediaApi, type MediaAsset, type MediaFolders, type MediaUsage } from '../../../lib/media'
import { ghostButton, inputClass } from '../FormKit'
import { confirmDialog } from '../ui'
import { Check, FolderPlus, Pencil, Trash2, Upload, X } from 'lucide-react'

const PAGE_SIZE = 40
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_SET = new Set(ACCEPTED_IMAGES.split(','))
const ALLOWED_EXT_RE = /\.(png|jpe?g|webp|gif|ico)$/i

type SortOrder = 'newest' | 'oldest' | 'largest' | 'name'

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
  const [missingAlt, setMissingAlt] = useState(false)
  const [sortBy, setSortBy] = useState<SortOrder>('newest')
  const [items, setItems] = useState<MediaAsset[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [usage, setUsage] = useState<MediaUsage | null>(null)
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renamingFolderName, setRenamingFolderName] = useState('')
  const [folderBusy, setFolderBusy] = useState(false)
  const [bulkIds, setBulkIds] = useState<string[]>([])
  const [bulkTargetFolder, setBulkTargetFolder] = useState<string>('')
  const [bulkBusy, setBulkBusy] = useState(false)
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

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return
    const targetFolder = folder && folder !== 'root' ? folder : null
    const valid: File[] = []
    const rejected: UploadItem[] = []
    files.forEach((file, i) => {
      const key = `${Date.now()}-${i}-${file.name}`
      const isAllowedType = (file.type && ALLOWED_MIME_SET.has(file.type)) || ALLOWED_EXT_RE.test(file.name)
      if (!isAllowedType) {
        rejected.push({ key, name: file.name, progress: 100, error: 'Desteklenmeyen dosya türü' })
      } else if (file.size > MAX_UPLOAD_BYTES) {
        rejected.push({ key, name: file.name, progress: 100, error: 'En fazla 5 MB olabilir' })
      } else {
        valid.push(file)
      }
    })
    if (rejected.length) setUploads((prev) => [...prev, ...rejected])
    if (!valid.length) return

    const queue = valid.map((file, i) => ({ file, key: `${Date.now()}-ok-${i}-${file.name}` }))
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
    if (last && valid.length === 1) onSelect(last)
  }, [folder, load, loadMeta, onSelect])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const pasted = Array.from(e.clipboardData?.files || []).filter(
        (f) => f.type.startsWith('image/') || ALLOWED_EXT_RE.test(f.name)
      )
      if (pasted.length) {
        e.preventDefault()
        uploadFiles(pasted)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [uploadFiles])

  const submitNewFolder = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const name = newFolderName.trim()
    if (!name || folderBusy) return
    setFolderBusy(true)
    try {
      const res = await mediaApi.createFolder(name)
      setNewFolderName('')
      setCreatingFolder(false)
      await loadMeta()
      setFolder(res.data.id)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setFolderBusy(false)
    }
  }

  const submitRenameFolder = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const name = renamingFolderName.trim()
    if (!renamingFolderId || !name || folderBusy) return
    setFolderBusy(true)
    try {
      await mediaApi.renameFolder(renamingFolderId, name)
      setRenamingFolderId(null)
      setRenamingFolderName('')
      await loadMeta()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setFolderBusy(false)
    }
  }

  const deleteFolder = async (id: string, name: string) => {
    if (!(await confirmDialog(`"${name}" klasörü silinsin mi? İçindeki görseller silinmez, "Klasörsüz" bölümüne taşınır.`))) return
    try {
      await mediaApi.deleteFolder(id)
      setFolder('')
      await Promise.all([load(1), loadMeta()])
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const toggleBulk = (id: string) => {
    setBulkIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const bulkMove = async () => {
    if (!bulkIds.length || bulkBusy) return
    setBulkBusy(true)
    setError('')
    try {
      await mediaApi.move(bulkIds, bulkTargetFolder ? bulkTargetFolder : null)
      setBulkIds([])
      await Promise.all([load(1), loadMeta()])
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkDelete = async () => {
    if (!bulkIds.length || bulkBusy) return
    if (!(await confirmDialog({ title: `Seçili ${bulkIds.length} görsel kalıcı olarak silinsin mi? Sitede kullanılanlar atlanacaktır.`, danger: true }))) return
    setBulkBusy(true)
    setError('')
    let skipped = 0
    try {
      for (const id of bulkIds) {
        try {
          await mediaApi.remove(id, false)
        } catch {
          skipped++
        }
      }
      setBulkIds([])
      await Promise.all([load(1), loadMeta()])
      if (skipped > 0) setError(`${skipped} görsel sitede kullanıldığı için silinmedi.`)
    } finally {
      setBulkBusy(false)
    }
  }

  const visibleItems = useMemo(() => {
    const base = missingAlt ? items.filter((a) => !a.alt_text.trim()) : items
    if (sortBy === 'newest') return base
    return [...base].sort((a, b) => {
      if (sortBy === 'oldest') return (a.created_at || '').localeCompare(b.created_at || '')
      if (sortBy === 'largest') return b.size_bytes - a.size_bytes
      return (a.original_name || '').localeCompare(b.original_name || '', 'tr')
    })
  }, [items, missingAlt, sortBy])

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
      {folderId && renamingFolderId === folderId ? (
        <form onSubmit={submitRenameFolder} className="flex flex-1 items-center gap-1 p-1">
          <input autoFocus maxLength={80} value={renamingFolderName} onChange={(e) => setRenamingFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setRenamingFolderId(null)}
            className="min-w-0 flex-1 rounded border border-primary-300 bg-white px-2 py-1 text-xs outline-none" />
          <button type="submit" disabled={folderBusy} title="Kaydet" className="rounded p-1 text-primary-700 hover:bg-primary-100"><Check className="h-3.5 w-3.5" /></button>
          <button type="button" title="Vazgeç" onClick={() => setRenamingFolderId(null)} className="rounded p-1 text-gray-500 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
        </form>
      ) : (
        <>
          <button type="button" onClick={() => setFolder(key)} className="flex flex-1 items-center justify-between px-3 py-1.5 text-left text-sm font-semibold">
            <span className="truncate">{label}</span>
            <span className="ml-2 text-xs text-gray-400">{count}</span>
          </button>
          {folderId && (
            <span className="hidden pr-1 group-hover:flex">
              <button type="button" title="Yeniden adlandır" onClick={() => { setRenamingFolderId(folderId); setRenamingFolderName(label) }} className="px-1 text-xs"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
              <button type="button" title="Klasörü sil" onClick={() => deleteFolder(folderId, label)} className="px-1 text-xs"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
            </span>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className={`flex gap-4 ${compact ? 'flex-col md:flex-row' : 'flex-col lg:flex-row'}`}>
      <aside className={`flex-shrink-0 space-y-1 ${compact ? 'md:w-48' : 'lg:w-56'}`}>
        {folderButton('', 'Tüm görseller', folders.total)}
        {folderButton('root', 'Klasörsüz', folders.root_count)}
        {folders.folders.map((f) => folderButton(f.id, f.name, f.count, f.id))}
        {creatingFolder ? (
          <form onSubmit={submitNewFolder} className="flex items-center gap-1 pt-1">
            <input autoFocus maxLength={80} placeholder="Klasör adı" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setCreatingFolder(false)}
              className="min-w-0 flex-1 rounded-lg border border-primary-300 bg-white px-2 py-1 text-xs outline-none" />
            <button type="submit" disabled={folderBusy} title="Ekle" className="rounded p-1 text-primary-700 hover:bg-primary-100"><Check className="h-3.5 w-3.5" /></button>
            <button type="button" title="Vazgeç" onClick={() => { setCreatingFolder(false); setNewFolderName('') }} className="rounded p-1 text-gray-500 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
          </form>
        ) : (
          <button type="button" onClick={() => setCreatingFolder(true)} className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-sm font-semibold text-primary-700 hover:bg-primary-50">
            <FolderPlus className="h-4 w-4" aria-hidden="true" /> Yeni klasör
          </button>
        )}
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
          <input className={`${inputClass} sm:max-w-xs`} placeholder="Ad, alt metin veya etiket ara…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {tags.length > 0 && (
            <select className="rounded-lg border border-gray-300 bg-white p-2.5 text-sm outline-none focus:border-primary-600" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Tüm etiketler</option>
              {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </select>
          )}
          <select className="rounded-lg border border-gray-300 bg-white p-2.5 text-sm outline-none focus:border-primary-600" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOrder)}>
            <option value="newest">En yeni</option>
            <option value="oldest">En eski</option>
            <option value="largest">En büyük dosya</option>
            <option value="name">Ada göre (A-Z)</option>
          </select>
          <label className="flex items-center gap-1 text-xs font-semibold text-gray-600">
            <input type="checkbox" checked={unused} onChange={(e) => setUnused(e.target.checked)} /> Kullanılmayanlar
          </label>
          <label className="flex items-center gap-1 text-xs font-semibold text-gray-600">
            <input type="checkbox" checked={missingAlt} onChange={(e) => setMissingAlt(e.target.checked)} /> Alt metinsizler
          </label>
          <span className="flex-1" />
          <button type="button" className={`${ghostButton} inline-flex items-center gap-1.5`} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" aria-hidden="true" /> Görsel yükle
          </button>
          <input ref={fileRef} type="file" multiple accept={ACCEPTED_IMAGES} className="hidden"
            onChange={(e) => { uploadFiles(Array.from(e.target.files || [])); e.target.value = '' }} />
        </div>

        {!compact && bulkIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs">
            <span className="font-bold text-primary-800">{bulkIds.length} görsel seçildi</span>
            <select className="rounded border border-primary-200 bg-white px-2 py-1 text-xs" value={bulkTargetFolder} onChange={(e) => setBulkTargetFolder(e.target.value)}>
              <option value="">Klasörsüz</option>
              {folders.folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button type="button" disabled={bulkBusy} onClick={bulkMove} className="rounded bg-primary-600 px-2.5 py-1 font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              Klasöre taşı
            </button>
            <button type="button" disabled={bulkBusy} onClick={bulkDelete} className="rounded border border-red-200 bg-white px-2.5 py-1 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
              Seçilenleri sil
            </button>
            <span className="flex-1" />
            <button type="button" onClick={() => setBulkIds([])} className="font-semibold text-gray-600 hover:text-gray-900">Seçimi temizle</button>
          </div>
        )}

        <div
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return
            e.preventDefault()
            setDragging(false)
            uploadFiles(Array.from(e.dataTransfer.files))
          }}
          className={`rounded-xl border-2 border-dashed p-3 transition ${dragging ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}
        >
          <p className="mb-3 text-center text-xs text-gray-400">
            Görselleri buraya sürükleyip bırakın veya <kbd className="rounded border bg-gray-50 px-1">Ctrl+V</kbd> ile yapıştırın (PNG, JPEG, WEBP, GIF, ICO · en fazla 5 MB). Otomatik olarak WebP’ye çevrilir ve her ekran için küçültülür.
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

          {visibleItems.length === 0 && !loading ? (
            <p className="py-10 text-center text-sm text-gray-400">Bu görünümde görsel yok.</p>
          ) : (
            <div className={`grid gap-3 ${compact ? 'grid-cols-[repeat(auto-fill,minmax(120px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]'}`}>
              {visibleItems.map((asset) => {
                const isBulk = bulkIds.includes(asset.id)
                return (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('application/x-media-id', asset.id)}
                    onClick={() => onSelect(asset)}
                    onDoubleClick={() => onOpen?.(asset)}
                    title={asset.original_name}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(asset) } }}
                    className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-white text-left shadow-sm transition ${selectedId === asset.id ? 'ring-2 ring-primary-600' : isBulk ? 'ring-2 ring-primary-400' : 'hover:border-primary-300'}`}
                  >
                    {!compact && (
                      <button
                        type="button"
                        aria-label="Toplu seçim"
                        onClick={(e) => { e.stopPropagation(); toggleBulk(asset.id) }}
                        className={`absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded border text-xs transition ${isBulk ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white/90 text-transparent opacity-0 group-hover:opacity-100'}`}
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    )}
                    <div className="aspect-square bg-[repeating-conic-gradient(#f3f4f6_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
                      <img src={asset.thumbnail_url} alt={asset.alt_text} loading="lazy" className="h-full w-full object-cover"
                        style={{ objectPosition: `${asset.focal_x * 100}% ${asset.focal_y * 100}%` }} />
                    </div>
                    <div className="px-2 py-1">
                      <p className="truncate text-xs font-semibold text-gray-700">{asset.original_name || 'Adsız'}</p>
                      <p className="text-[10px] text-gray-400">{asset.width}×{asset.height} · {formatBytes(asset.size_bytes)}{!asset.alt_text && ' · alt metin yok'}</p>
                    </div>
                  </div>
                )
              })}
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
