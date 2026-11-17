'use client'

import axios from 'axios'
import { useMemo, useRef, useState } from 'react'
import { Button } from '@e-infak/ui'
import { ClipboardPaste, FileDown, FileUp, Plus, Printer, Save, Trash2 } from 'lucide-react'
import { adminApiBase, adminAuthHeaders, apiErrorMessage, downloadFile, formatMoney, v1Send } from '../../../lib/admin-access'
import { inputClass } from '../FormKit'
import { applyToAll as fillAll, emptyBulkRow, isBlankRow, parsePastedRows, toPayloadRows, type BulkRow } from '../../../lib/kurban-bulk'
import { toast } from '../ui'

export type { BulkRow } from '../../../lib/kurban-bulk'

interface CreatedRow {
  row: number
  donation_id: string
  receipt_number: string
  status: string
  donor_name: string
  kurban_shares: { share_id: string; animal_number: string | null; share_number: number | null; name: string }[]
}

interface BulkResult {
  created: CreatedRow[]
  failed: { row: number; detail: string } | null
  total: number
}

const START_ROWS = 5

function newBatchKey() {
  return `kb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`
}

export async function downloadShareCards(shareIds: string[]) {
  const res = await axios.post(`${adminApiBase()}/api/v1/kurban/shares/cards.pdf`, { share_ids: shareIds }, {
    headers: adminAuthHeaders(), responseType: 'blob',
  })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = 'kurban-isim-kartlari.pdf'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Toplu kurban girişi: her satır gerçek bir makbuz olur (elle makbuzla aynı yol) ve kampanyada
 * otomatik yerleştirme açıksa kurban numarası kayıt anında döner.
 */
export function KurbanBulkEntry({
  campaignId, pricePerShareCents, capacity, types, onSaved,
}: {
  campaignId: string
  pricePerShareCents: number
  capacity: number
  types: { key: string; label: string }[]
  onSaved: () => void
}) {
  const [defaults, setDefaults] = useState<BulkRow>(() => emptyBulkRow())
  const [rows, setRows] = useState<BulkRow[]>(() => Array.from({ length: START_ROWS }, () => emptyBulkRow()))
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [sendReceipt, setSendReceipt] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)
  // Aynı liste yeniden gönderilirse makbuzlar çoğalmasın: anahtar liste değişene kadar aynı kalır.
  const batchKey = useRef(newBatchKey())
  const fileInput = useRef<HTMLInputElement>(null)

  const filled = useMemo(() => rows.filter((r) => !isBlankRow(r)), [rows])
  const totalShares = filled.reduce((sum, r) => sum + (Number(r.shares) || 1), 0)

  const touch = () => { batchKey.current = newBatchKey() }
  const setRow = (index: number, patch: Partial<BulkRow>) => {
    touch()
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }
  const applyToAll = (field: keyof BulkRow) => {
    touch()
    setRows((prev) => fillAll(prev, field, defaults[field]))
  }
  const appendRows = (incoming: BulkRow[]) => {
    touch()
    setRows((prev) => [...prev.filter((r) => !isBlankRow(r)), ...incoming])
  }

  const paste = () => {
    const parsed = parsePastedRows(pasteText, defaults)
    if (!parsed.length) return toast.error('Yapıştırılan metinde satır bulunamadı.')
    appendRows(parsed)
    setPasteText('')
    setPasteOpen(false)
    toast.ok(`${parsed.length} satır eklendi.`)
  }

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await v1Send<{ rows: Partial<Record<keyof BulkRow, string | number>>[]; skipped_columns: string[] }>('post', '/kurban/bulk-parse', body)
      const parsed = res.data.rows.map((r) => ({
        ...defaults,
        ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])),
      })) as BulkRow[]
      if (!parsed.length) return toast.error('Dosyada hissedar bulunamadı.')
      appendRows(parsed)
      toast.ok(`${file.name}: ${parsed.length} satır eklendi. Kaydetmeden önce kontrol edin.`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Dosya okunamadı'))
    }
  }

  const save = async () => {
    if (!filled.length) return toast.error('En az bir hissedar yazın.')
    const nameless = filled.findIndex((r) => !r.donor_name.trim())
    if (nameless >= 0) return toast.error(`${nameless + 1}. dolu satırda bağışçı adı eksik.`)
    setSaving(true)
    try {
      const res = await v1Send<BulkResult>('post', `/kurban/campaigns/${campaignId}/bulk-receipts`, {
        batch_key: batchKey.current,
        send_receipt: sendReceipt,
        rows: toPayloadRows(filled),
      })
      setResult(res.data)
      if (res.data.failed) {
        // Kayıtlı satırlar listeden çıkar; kalanlar düzeltilip yeniden gönderilir.
        const saved = res.data.created.length
        setRows(filled.slice(saved))
        touch()
        toast.error(`${saved} satır kaydedildi. ${res.data.failed.row}. satır kaydedilemedi: ${res.data.failed.detail}`)
      } else {
        setRows(Array.from({ length: START_ROWS }, () => emptyBulkRow(defaults)))
        touch()
        toast.ok(`${res.data.created.length} makbuz kesildi.`)
      }
      onSaved()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Toplu giriş kaydedilemedi'))
    } finally {
      setSaving(false)
    }
  }

  const printCards = async () => {
    const ids = (result?.created || []).flatMap((r) => r.kurban_shares.filter((s) => s.animal_number).map((s) => s.share_id))
    if (!ids.length) return toast.error('Hayvana yerleşmiş hisse yok; önce hisseleri dağıtın.')
    try {
      await downloadShareCards(ids)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'İsim kartları hazırlanamadı'))
    }
  }

  const cell = `${inputClass} h-9 text-xs`
  const typeOptions = types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)
  const methodOptions = (
    <>
      <option value="cash">Nakit</option>
      <option value="bank_transfer">Havale / EFT</option>
      <option value="credit_card">Kart / POS</option>
    </>
  )
  const statusOptions = (
    <>
      <option value="paid">Ödeme alındı</option>
      <option value="pending">Beklemede</option>
    </>
  )

  return (
    <div className="space-y-4">
      {result && result.created.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-emerald-900">
              {result.created.length} makbuz kesildi{result.failed ? ` · ${result.total - result.created.length} satır bekliyor` : ''}
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={printCards}><Printer className="mr-1.5 h-3.5 w-3.5" />İsim kartlarını yazdır</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setResult(null)}>Kapat</Button>
            </div>
          </div>
          <ul className="mt-2 grid gap-1 text-xs text-emerald-950 sm:grid-cols-2 lg:grid-cols-3">
            {result.created.map((r) => (
              <li key={r.donation_id}>
                <span className="font-mono font-bold">
                  {r.kurban_shares.length
                    ? [...new Set(r.kurban_shares.map((s) => s.animal_number || 'Atanmadı'))].join(', ')
                    : r.status === 'pending' ? 'Ödeme bekliyor' : '—'}
                </span>
                {' · '}{r.donor_name} <span className="text-emerald-700">({r.receipt_number})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900">Tümüne uygula</h3>
        <p className="mb-3 text-xs text-slate-500">Değeri seçip “Tümüne”ye basın; bütün satırlara yazılır. Yeni satırlar da bu değerlerle açılır.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DefaultField label="Niyet" onApply={() => applyToAll('kurban_type')}>
            <select className={cell} value={defaults.kurban_type} onChange={(e) => setDefaults({ ...defaults, kurban_type: e.target.value })}>{typeOptions}</select>
          </DefaultField>
          <DefaultField label={`Hisse adedi${capacity > 1 ? '' : ' (hayvan)'}`} onApply={() => applyToAll('shares')}>
            <input className={cell} inputMode="numeric" value={defaults.shares} onChange={(e) => setDefaults({ ...defaults, shares: e.target.value })} />
          </DefaultField>
          <DefaultField label="Ödeme yöntemi" onApply={() => applyToAll('payment_method')}>
            <select className={cell} value={defaults.payment_method} onChange={(e) => setDefaults({ ...defaults, payment_method: e.target.value as BulkRow['payment_method'] })}>{methodOptions}</select>
          </DefaultField>
          <DefaultField label="Ödeme" onApply={() => applyToAll('status')}>
            <select className={cell} value={defaults.status} onChange={(e) => setDefaults({ ...defaults, status: e.target.value as BulkRow['status'] })}>{statusOptions}</select>
          </DefaultField>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
          <p className="text-xs text-slate-600">
            <b className="text-slate-900">{filled.length}</b> bağışçı · <b className="text-slate-900">{totalShares}</b> hisse ·{' '}
            <b className="text-slate-900">{formatMoney(totalShares * pricePerShareCents)}</b>
            <span className="ml-1 text-slate-400">(hisse {formatMoney(pricePerShareCents)})</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => downloadFile('/kurban/bulk-template.xlsx', 'kurban-toplu-giris-sablonu.xlsx').catch((err) => toast.error(apiErrorMessage(err, 'Şablon indirilemedi')))}><FileDown className="mr-1.5 h-3.5 w-3.5" />Excel şablonu</Button>
            <input ref={fileInput} type="file" accept=".xlsx,.csv" className="hidden" onChange={upload} />
            <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()}><FileUp className="mr-1.5 h-3.5 w-3.5" />Excel dosyası yükle</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setPasteOpen((v) => !v)}><ClipboardPaste className="mr-1.5 h-3.5 w-3.5" />Excel'den yapıştır</Button>
          </div>
        </div>

        {pasteOpen && (
          <div className="space-y-2 border-b border-slate-200 p-3">
            <p className="text-xs text-slate-500">Excel'de sütunları şu sırayla seçip kopyalayın: <b>Bağışçı · Telefon · Kimin adına · Hisse</b>. Dosya yüklemede sütunlar başlık adıyla tanınır (Bağışçı, Telefon, Kimin Adına, Niyet, Hisse, Ödeme, Ödeme Yöntemi).</p>
            <textarea className={`${inputClass} h-32 font-mono text-xs`} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'Ahmet Yılmaz\t0555 111 22 33\tMerhum Mehmet Yılmaz\t1'} />
            <Button type="button" size="sm" onClick={paste}>Satırlara ekle</Button>
          </div>
        )}

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[980px] text-xs">
            <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase text-slate-500">
              <tr>
                <th className="w-8 px-2 py-2">#</th>
                <th className="px-2 py-2">Bağışçı</th>
                <th className="px-2 py-2">Telefon</th>
                <th className="px-2 py-2">Kimin adına{capacity > 1 ? ' (çok hissede ; ile)' : ''}</th>
                <th className="px-2 py-2">Niyet</th>
                <th className="w-20 px-2 py-2">Hisse</th>
                <th className="px-2 py-2">Yöntem</th>
                <th className="px-2 py-2">Ödeme</th>
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                  <td className="px-1 py-1"><input className={cell} value={r.donor_name} onChange={(e) => setRow(i, { donor_name: e.target.value })} placeholder="Ad Soyad" /></td>
                  <td className="px-1 py-1"><input className={cell} value={r.phone} onChange={(e) => setRow(i, { phone: e.target.value })} inputMode="tel" /></td>
                  <td className="px-1 py-1"><input className={cell} value={r.on_behalf_of} onChange={(e) => setRow(i, { on_behalf_of: e.target.value })} placeholder="Boşsa bağışçı" /></td>
                  <td className="px-1 py-1"><select className={cell} value={r.kurban_type} onChange={(e) => setRow(i, { kurban_type: e.target.value })}>{typeOptions}</select></td>
                  <td className="px-1 py-1"><input className={cell} inputMode="numeric" value={r.shares} onChange={(e) => setRow(i, { shares: e.target.value })} /></td>
                  <td className="px-1 py-1"><select className={cell} value={r.payment_method} onChange={(e) => setRow(i, { payment_method: e.target.value as BulkRow['payment_method'] })}>{methodOptions}</select></td>
                  <td className="px-1 py-1"><select className={cell} value={r.status} onChange={(e) => setRow(i, { status: e.target.value as BulkRow['status'] })}>{statusOptions}</select></td>
                  <td className="px-1 py-1">
                    <button type="button" aria-label="Satırı sil" onClick={() => { touch(); setRows((prev) => prev.filter((_, j) => j !== i)) }} className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Telefon: her bağışçı bir kart */}
        <div className="space-y-3 p-3 sm:hidden">
          {rows.map((r, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">{i + 1}. bağışçı</span>
                <button type="button" aria-label="Satırı sil" onClick={() => { touch(); setRows((prev) => prev.filter((_, j) => j !== i)) }} className="rounded p-1.5 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              <input className={cell} value={r.donor_name} onChange={(e) => setRow(i, { donor_name: e.target.value })} placeholder="Bağışçı (Ad Soyad)" aria-label="Bağışçı" />
              <input className={cell} value={r.phone} onChange={(e) => setRow(i, { phone: e.target.value })} placeholder="Telefon" inputMode="tel" aria-label="Telefon" />
              <input className={cell} value={r.on_behalf_of} onChange={(e) => setRow(i, { on_behalf_of: e.target.value })} placeholder="Kimin adına (boşsa bağışçı)" aria-label="Kimin adına" />
              <div className="grid grid-cols-2 gap-2">
                <select className={cell} value={r.kurban_type} onChange={(e) => setRow(i, { kurban_type: e.target.value })} aria-label="Niyet">{typeOptions}</select>
                <input className={cell} inputMode="numeric" value={r.shares} onChange={(e) => setRow(i, { shares: e.target.value })} placeholder="Hisse" aria-label="Hisse adedi" />
                <select className={cell} value={r.payment_method} onChange={(e) => setRow(i, { payment_method: e.target.value as BulkRow['payment_method'] })} aria-label="Ödeme yöntemi">{methodOptions}</select>
                <select className={cell} value={r.status} onChange={(e) => setRow(i, { status: e.target.value as BulkRow['status'] })} aria-label="Ödeme">{statusOptions}</select>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" variant="outline" onClick={() => setRows((prev) => [...prev, ...Array.from({ length: 5 }, () => emptyBulkRow(defaults))])}><Plus className="mr-1.5 h-3.5 w-3.5" />5 satır ekle</Button>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={sendReceipt} onChange={(e) => setSendReceipt(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              Bağışçılara makbuz bildirimi gönder
            </label>
          </div>
          <Button type="button" disabled={saving || !filled.length} onClick={save}><Save className="mr-1.5 h-4 w-4" />{saving ? 'Kaydediliyor…' : `${filled.length} makbuzu kes`}</Button>
        </div>
      </div>
    </div>
  )
}

function DefaultField({ label, onApply, children }: { label: string; onApply: () => void; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-bold text-slate-600">
      {label}
      <div className="mt-1 flex gap-1">
        {children}
        <button type="button" onClick={onApply} className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-2 text-[11px] font-bold text-slate-600 hover:bg-slate-100">Tümüne</button>
      </div>
    </label>
  )
}
