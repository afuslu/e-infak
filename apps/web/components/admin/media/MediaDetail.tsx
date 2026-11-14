'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiErrorMessage } from '../../../lib/admin-access'
import { formatBytes, mediaApi, type MediaAsset, type MediaFolder, type MediaReference } from '../../../lib/media'
import { TextArea, TextInput, ghostButton, inputClass, primaryButton } from '../FormKit'
import { CropTool } from './CropTool'
import { confirmDialog } from '../ui'

/** Side panel of one image: texts, focal point, crop, address, where it is used, delete. */
export function MediaDetail({ asset, folders, onChanged, onDeleted, onClose }: {
  asset: MediaAsset
  folders: MediaFolder[]
  onChanged: (asset: MediaAsset) => void
  onDeleted: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState(asset)
  const [tagText, setTagText] = useState(asset.tags.join(', '))
  const [refs, setRefs] = useState<MediaReference[] | null>(null)
  const [cropping, setCropping] = useState(false)
  const [sourceSize, setSourceSize] = useState<{ w: number; h: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  // A saved version of the same image only refreshes the form; another image resets the panel.
  useEffect(() => {
    setForm(asset)
    setTagText(asset.tags.join(', '))
  }, [asset])
  useEffect(() => {
    setCropping(false)
    setMessage(null)
    setRefs(null)
    mediaApi.references(asset.id).then((r) => setRefs(r.data)).catch(() => setRefs([]))
  }, [asset.id])

  const absoluteUrl = typeof window !== 'undefined' ? `${window.location.origin}${asset.url}` : asset.url
  const canCrop = asset.mime !== 'image/gif' && asset.mime !== 'image/x-icon'

  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await mediaApi.update(asset.id, {
        original_name: form.original_name, alt_text: form.alt_text, caption: form.caption, credit: form.credit,
        focal_x: form.focal_x, focal_y: form.focal_y, folder_id: form.folder_id,
        tags: tagText.split(',').map((t) => t.trim()).filter(Boolean),
      })
      onChanged(res.data)
      setMessage({ type: 'ok', text: 'Kaydedildi' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const crop = async (box: { x: number; y: number; width: number; height: number }) => {
    setBusy(true)
    try {
      const res = await mediaApi.crop(asset.id, box)
      onChanged(res.data)
      setCropping(false)
      setMessage({ type: 'ok', text: 'Kırpıldı; bu görseli kullanan sayfalar yeni hâlini gösterir.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Kırpılamadı') })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const used = refs && refs.length > 0
    const question = used
      ? `Bu görsel ${refs!.length} yerde kullanılıyor. Silerseniz o yerlerde görsel görünmez. Yine de silinsin mi?`
      : 'Görsel kalıcı olarak silinsin mi?'
    if (!(await confirmDialog({ title: question, danger: false }))) return
    setBusy(true)
    try {
      await mediaApi.remove(asset.id, Boolean(used))
      onDeleted()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Silinemedi') })
      mediaApi.references(asset.id).then((r) => setRefs(r.data)).catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl)
      setMessage({ type: 'ok', text: 'Adres kopyalandı' })
    } catch {
      window.prompt('Görsel adresi', absoluteUrl)
    }
  }

  const setFocal = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setForm({
      ...form,
      focal_x: Math.round(((e.clientX - rect.left) / rect.width) * 100) / 100,
      focal_y: Math.round(((e.clientY - rect.top) / rect.height) * 100) / 100,
    })
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="break-all text-base font-bold text-gray-900">{asset.original_name || 'Görsel'}</h2>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Kapat">✕</button>
      </div>

      {cropping ? (
        <>
          <img src={asset.source_url} alt="" className="hidden" onLoad={(e) => setSourceSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
          <CropTool src={asset.source_url} imageWidth={sourceSize?.w || asset.width} imageHeight={sourceSize?.h || asset.height}
            busy={busy} onApply={crop} onCancel={() => setCropping(false)} />
        </>
      ) : (
        <div>
          <div className="relative cursor-crosshair overflow-hidden rounded border bg-[repeating-conic-gradient(#f3f4f6_0_25%,#fff_0_50%)] bg-[length:16px_16px]"
            onClick={setFocal} title="Odak noktasını seçmek için tıklayın">
            <img src={asset.url} alt={form.alt_text} className="block w-full" />
            <span className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary-600/70 shadow"
              style={{ left: `${form.focal_x * 100}%`, top: `${form.focal_y * 100}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            Odak noktası: görsel farklı oranlarda kesildiğinde bu nokta hep görünür. Değiştirmek için görsele tıklayın.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {canCrop && <button type="button" className={ghostButton} onClick={() => setCropping(true)}>✂️ Kırp</button>}
            <button type="button" className={ghostButton} onClick={copy}>🔗 Adresi kopyala</button>
            <a href={asset.url} target="_blank" rel="noreferrer" className={ghostButton}>↗ Aç</a>
          </div>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
        <dt className="font-semibold">Boyut</dt><dd>{asset.width} × {asset.height}</dd>
        <dt className="font-semibold">Dosya</dt><dd>{asset.mime.replace('image/', '').toUpperCase()} · {formatBytes(asset.size_bytes)}</dd>
        {asset.variants.length > 0 && (<><dt className="font-semibold">Üretilen boyutlar</dt><dd>{asset.variants.map((v) => v.width).join(', ')} px</dd></>)}
        {asset.created_at && (<><dt className="font-semibold">Yüklenme</dt><dd>{new Date(asset.created_at).toLocaleString('tr-TR')}</dd></>)}
      </dl>

      <div className="space-y-3">
        <TextInput label="Alt metin" hint="Görme engelliler ve arama motorları için görseli kısaca anlatın." value={form.alt_text}
          maxLength={300} onChange={(v) => setForm({ ...form, alt_text: v })} />
        <TextArea label="Açıklama" rows={2} value={form.caption} maxLength={500} onChange={(v) => setForm({ ...form, caption: v })} />
        <TextInput label="Telif / fotoğrafçı" placeholder="Foto: …" value={form.credit} maxLength={200} onChange={(v) => setForm({ ...form, credit: v })} />
        <TextInput label="Etiketler" hint="Virgülle ayırın" placeholder="ramazan, su kuyusu" value={tagText} onChange={setTagText} />
        <label className="block text-xs font-bold text-gray-600">
          <span className="mb-1 block">Klasör</span>
          <select className={inputClass} value={form.folder_id || ''} onChange={(e) => setForm({ ...form, folder_id: e.target.value || null })}>
            <option value="">Klasörsüz</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <TextInput label="Dosya adı" value={form.original_name} maxLength={255} onChange={(v) => setForm({ ...form, original_name: v })} />
      </div>

      {message && <p className={`text-xs font-semibold ${message.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
      <button type="button" disabled={busy} className={`${primaryButton} w-full`} onClick={save}>Kaydet</button>

      <div>
        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">Nerede kullanılıyor</h3>
        {refs === null ? <p className="text-xs text-gray-400">Kontrol ediliyor…</p> : refs.length === 0 ? (
          <p className="text-xs text-gray-400">Hiçbir yerde kullanılmıyor.</p>
        ) : (
          <ul className="space-y-1">
            {refs.map((r, i) => (
              <li key={`${r.type}-${r.id}-${r.field}-${i}`} className="text-xs">
                <Link href={r.link} className="font-semibold text-primary-700 hover:underline">{r.label}</Link>
                <span className="text-gray-500"> · {r.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" disabled={busy} onClick={remove}
        className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">
        Görseli sil
      </button>
    </div>
  )
}
