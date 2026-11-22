'use client'

/** STK PRO "Kurban Ülkesi Yönetimi": the list the kurban form offers as "Kesim ülkesi". */
import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { apiErrorMessage, v1Get, v1Send } from '../../../lib/admin-access'
import { Modal, toast } from '../ui'

export interface KurbanCountry { name: string; active: boolean; campaigns: number; unlisted?: boolean }

export function useKurbanCountries() {
  const [countries, setCountries] = useState<KurbanCountry[]>([])
  const reload = () => v1Get<KurbanCountry[]>('/kurban/countries').then((r) => setCountries(r.data)).catch(() => setCountries([]))
  useEffect(() => { reload() }, [])
  return { countries, reload }
}

export function KurbanCountriesModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<KurbanCountry[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { v1Get<KurbanCountry[]>('/kurban/countries').then((r) => setRows(r.data)).catch(() => setRows([])) }, [])
  const save = async () => {
    if (!rows) return
    setBusy(true)
    try {
      await v1Send('put', '/kurban/countries', { countries: rows.filter((r) => r.name.trim()).map(({ name, active }) => ({ name: name.trim(), active })) })
      toast.ok('Kurban ülkeleri kaydedildi')
      onSaved()
      onClose()
    } catch (err) { toast.error(apiErrorMessage(err, 'Kaydedilemedi')) } finally { setBusy(false) }
  }
  return (
    <Modal title="Kurban Ülkeleri" description="Organizasyon formunda kesim ülkesi bu listeden seçilir. Pasif ülkeler listede görünmez." onClose={onClose}
      footer={<button type="button" disabled={busy || !rows} onClick={save} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">Kaydet</button>}>
      {!rows ? <div className="h-24 animate-pulse rounded bg-slate-100" /> : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="flex-1 rounded-lg border border-gray-300 px-2.5 py-2 text-sm" value={r.name} aria-label="Ülke adı"
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={r.active} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} /> Aktif</label>
              <span className="w-24 text-right text-[12px] text-gray-400">{r.campaigns} organizasyon</span>
              <button type="button" aria-label="Sil" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="rounded p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setRows([...rows, { name: '', active: true, campaigns: 0 }])} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-700 hover:underline"><Plus className="h-4 w-4" /> Ülke ekle</button>
        </div>
      )}
    </Modal>
  )
}
