'use client'

/** STK PRO "Slug/URL Yönetimi": permanent (301) redirects from old addresses, e.g. after moving the site. */
import { useEffect, useMemo, useState } from 'react'
import { Check, Link2, Plus, Trash2, Upload } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Modal, toast } from '../../../../components/admin/ui'

interface Redirect { from: string; to: string }

export default function RedirectsPage() {
  const [rows, setRows] = useState<Redirect[]>([])
  const [saved, setSaved] = useState<Redirect[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  useEffect(() => {
    adminGet<{ redirects: Redirect[] }>('/site-builder/redirects')
      .then((r) => { setRows(r.data.redirects); setSaved(r.data.redirects) })
      .catch((err) => toast.error(apiErrorMessage(err, 'Yönlendirmeler yüklenemedi')))
  }, [])
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved)
  const shown = useMemo(() => rows.map((r, i) => [r, i] as const).filter(([r]) => !q || `${r.from} ${r.to}`.toLowerCase().includes(q.toLowerCase())), [rows, q])
  const set = (i: number, key: keyof Redirect, value: string) => setRows((list) => list.map((r, j) => (j === i ? { ...r, [key]: value } : r)))
  const save = async () => {
    setBusy(true)
    try {
      const clean = rows.filter((r) => r.from.trim() || r.to.trim())
      const r = await adminSend<{ redirects: Redirect[] }>('put', '/site-builder/redirects', { redirects: clean })
      setRows(r.data.redirects); setSaved(r.data.redirects)
      toast.ok(`${r.data.redirects.length} yönlendirme kaydedildi`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kaydedilemedi'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Link2 className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Slug/URL Yönetimi</h1>
        <div className="ms-auto flex gap-2">
          <button type="button" onClick={() => setBulkOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"><Upload className="h-4 w-4" /> Toplu Ekle</button>
          <button type="button" onClick={() => setRows((list) => [{ from: '', to: '' }, ...list])} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-primary-700"><Plus className="h-4 w-4" /> Yönlendirme Ekle</button>
        </div>
      </div>
      <p className="max-w-3xl text-[13px] text-gray-500">
        Eski bir adres açıldığında ziyaretçi kalıcı olarak (301) yeni adrese gönderilir; arama motorları da yeni adresi öğrenir.
        Kampanya ve sayfa adresleri (slug) kendi düzenleme ekranlarında değiştirilir; eski adresi buraya ekleyin ki eski bağlantılar kırılmasın.
      </p>
      <section className="rounded-2xl border border-slate-200/80 bg-white">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-2.5">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara" aria-label="Yönlendirmelerde ara"
            className="h-8 w-64 rounded-lg border border-gray-200 px-3 text-[13px] outline-none focus:border-primary-500" />
          <span className="ms-auto text-[13px] text-gray-500">{rows.length} / 500 yönlendirme</span>
        </div>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50/70 text-[12px] font-bold text-gray-600"><tr>
              <th className="px-3 py-2.5 text-left">Eski Adres</th><th className="px-3 py-2.5 text-left">Yeni Adres</th><th className="w-12" />
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map(([r, i]) => (
                <tr key={i}>
                  <td className="px-3 py-2"><input className="w-full rounded-md border border-gray-200 px-2 py-1.5 font-mono text-[12.5px] outline-none focus:border-primary-500" placeholder="/eski-sayfa" value={r.from} onChange={(e) => set(i, 'from', e.target.value)} aria-label="Eski adres" /></td>
                  <td className="px-3 py-2"><input className="w-full rounded-md border border-gray-200 px-2 py-1.5 font-mono text-[12.5px] outline-none focus:border-primary-500" placeholder="/kampanyalar/yeni-slug veya https://…" value={r.to} onChange={(e) => set(i, 'to', e.target.value)} aria-label="Yeni adres" /></td>
                  <td className="px-2"><button type="button" aria-label="Sil" onClick={() => setRows((list) => list.filter((_, j) => j !== i))} className="rounded-md p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={3} className="py-10 text-center text-gray-400">Yönlendirme yok.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <div className="sticky bottom-0 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white/95 px-5 py-3 backdrop-blur">
        {dirty && <span className="text-[13px] font-medium text-amber-600">Kaydedilmemiş değişiklik var</span>}
        <div className="ms-auto flex gap-2">
          <button type="button" disabled={!dirty} onClick={() => setRows(saved)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">İptal</button>
          <button type="button" disabled={busy || !dirty} onClick={save} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"><Check className="h-4 w-4" /> Kaydet</button>
        </div>
      </div>
      {bulkOpen && <BulkModal onClose={() => setBulkOpen(false)} onAdd={(list) => { setRows((cur) => [...list, ...cur]); setBulkOpen(false) }} />}
    </div>
  )
}

function BulkModal({ onClose, onAdd }: { onClose: () => void; onAdd: (rows: Redirect[]) => void }) {
  const [text, setText] = useState('')
  const parsed = text.split(/\r?\n/).map((line) => line.split(/[,;\t]|\s+→\s+|\s+/).map((p) => p.trim()).filter(Boolean)).filter((p) => p.length >= 2).map(([from, to]) => ({ from, to }))
  return (
    <Modal title="Toplu Yönlendirme Ekle" description="Her satıra: eski-adres yeni-adres (boşluk, virgül veya sekme ile ayırın)." size="lg" onClose={onClose}
      footer={<button type="button" disabled={!parsed.length} onClick={() => onAdd(parsed)} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">{parsed.length} satır ekle</button>}>
      <textarea className="min-h-[220px] w-full rounded-lg border border-gray-300 p-2.5 font-mono text-[12.5px]" placeholder={'/eski-bagis /kampanyalar/genel-bagis\n/hakkimizda.html /sayfa/hakkimizda'} value={text} onChange={(e) => setText(e.target.value)} />
    </Modal>
  )
}
