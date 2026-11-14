'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { Card } from '@e-infak/ui'
import { adminApiBase, adminAuthHeaders, adminSend, apiErrorMessage, formatMoney } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { PageHeader, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'

type Kind = 'donors' | 'donations'
interface Intro { headers: string[]; row_count: number; fields: Record<string, string>; sample: (string | null)[][]; suggested_mapping: Record<string, number> }
interface Result {
  row_count: number; error_count: number; errors: { row: number; message: string }[]; preview: Record<string, unknown>[]; committed: boolean
  created?: number; matched?: number
  imported?: number; already_imported?: number; new_donors?: number; totals?: { currency: string; total_cents: number }[]
}

const KINDS: Record<Kind, { title: string; hint: string }> = {
  donors: { title: 'Bağışçı listesi', hint: 'Telefon, e-posta veya TC ile eşleşen kayıtların yalnız boş alanları doldurulur; yeni kişiler eklenir.' },
  donations: { title: 'Geçmiş makbuzlar', hint: 'Her satır onaylı bir bağış olur (makbuz e-postası gönderilmez). Aynı dosyayı tekrar yüklemek çift kayıt açmaz.' },
}

export default function DataImportPage() {
  const [kind, setKind] = useState<Kind>('donors')
  const [file, setFile] = useState<File | null>(null)
  const [intro, setIntro] = useState<Intro | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([])
  const [defaultCampaign, setDefaultCampaign] = useState('')
  const [extraTag, setExtraTag] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    axios.get(`${adminApiBase()}/api/v1/campaigns`, { headers: adminAuthHeaders(), params: { page_size: 100 } })
      .then((r) => setCampaigns(r.data.items || [])).catch(() => {})
  }, [])

  const reset = (k: Kind = kind) => { setKind(k); setFile(null); setIntro(null); setResult(null); setMapping({}); setMessage(null) }

  const send = async (step: 'intro' | 'check' | 'commit', f: File | null = file) => {
    if (!f) return
    const data = new FormData()
    data.append('file', f)
    if (step !== 'intro') {
      data.append('mapping', JSON.stringify(Object.fromEntries(Object.entries(mapping).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]))))
      data.append('dry_run', step === 'check' ? 'true' : 'false')
      if (kind === 'donors' && extraTag) data.append('extra_tag', extraTag)
      if (kind === 'donations' && defaultCampaign) data.append('default_campaign_id', defaultCampaign)
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await adminSend<Intro & Result>('post', `/${kind}/import`, data)
      if (step === 'intro') {
        setIntro(res.data)
        setMapping(Object.fromEntries(Object.entries(res.data.suggested_mapping).map(([k, v]) => [k, String(v)])))
        setResult(null)
      } else {
        setResult(res.data)
        if (step === 'commit') {
          setMessage({ type: 'ok', text: kind === 'donors'
            ? `${res.data.created} yeni bağışçı eklendi, ${res.data.matched} kayıt güncellendi`
            : `${res.data.imported} makbuz aktarıldı${res.data.already_imported ? `, ${res.data.already_imported} satır daha önce aktarılmıştı` : ''}` })
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Dosya işlenemedi') })
    } finally {
      setBusy(false)
    }
  }

  const used = new Set(Object.values(mapping).filter(Boolean))

  return (
    <div className="space-y-6">
      <PageHeader title="Excel&apos;den Aktarım" description={<>XLSX veya CSV dosyasını yükleyin, sütunları eşleyin, önce doğrulayın sonra aktarın. En fazla 5000 satır.</>} />

      <div className="flex gap-1 border-b text-sm font-semibold">
        {(Object.keys(KINDS) as Kind[]).map((k) => (
          <button key={k} onClick={() => reset(k)} className={`-mb-px border-b-2 px-3 py-2 ${kind === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500'}`}>{KINDS[k].title}</button>
        ))}
      </div>
      <Notice message={message} />

      <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
        <p className="text-sm text-gray-600">{KINDS[kind].hint}</p>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".xlsx,.csv" onChange={(e) => {
            const f = e.target.files?.[0] || null
            setFile(f)
            setIntro(null)
            setResult(null)
            if (f) send('intro', f)
          }} className="text-sm" />
          {busy && <span className="text-xs text-gray-400">İşleniyor…</span>}
        </div>
      </Card>

      {intro && (
        <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">1. Sütunları eşleyin <span className="font-normal text-gray-500">({intro.row_count} satır)</span></h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(intro.fields).map(([field, label]) => (
              <Label key={field} label={label}>
                <select className={inputClass} value={mapping[field] ?? ''} onChange={(e) => { setMapping({ ...mapping, [field]: e.target.value }); setResult(null) }}>
                  <option value="">— kullanma —</option>
                  {intro.headers.map((h, i) => (
                    <option key={i} value={String(i)} disabled={used.has(String(i)) && mapping[field] !== String(i)}>{h}</option>
                  ))}
                </select>
              </Label>
            ))}
          </div>
          {kind === 'donors' && (
            <div className="w-64"><TextInput label="Tüm satırlara eklenecek grup (isteğe bağlı)" value={extraTag} onChange={setExtraTag} placeholder="ör. 2026 Ramazan" /></div>
          )}
          {kind === 'donations' && (
            <div className="w-80">
              <Label label="Varsayılan kampanya" hint="Kampanya sütunu boş ya da eşleşmeyen satırlar buraya yazılır">
                <select className={inputClass} value={defaultCampaign} onChange={(e) => { setDefaultCampaign(e.target.value); setResult(null) }}>
                  <option value="">—</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </Label>
            </div>
          )}
          <div className="overflow-x-auto">
            <p className="mb-1 text-xs font-bold text-gray-500">Dosyadaki ilk satırlar</p>
            <Table>
              <THead><Tr>{intro.headers.map((h, i) => <Th key={i} className="whitespace-nowrap">{h}</Th>)}</Tr></THead>
              <TBody>{intro.sample.map((r, i) => <Tr key={i} className="border-t">{intro.headers.map((_, j) => <Td key={j} className="whitespace-nowrap">{r[j] ?? ''}</Td>)}</Tr>)}</TBody>
            </Table>
          </div>
          <div className="flex gap-2">
            <button className={ghostButton} disabled={busy} onClick={() => send('check')}>2. Doğrula</button>
            {result && !result.committed && result.row_count > result.error_count && (
              <button className={primaryButton} disabled={busy} onClick={async () => (await confirmDialog({ title: 'Geçerli satırlar aktarılsın mı?', danger: false })) && send('commit')}>3. Aktar</button>
            )}
          </div>
        </Card>
      )}

      {result && (
        <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">{result.committed ? 'Aktarım sonucu' : 'Doğrulama sonucu (henüz kaydedilmedi)'}</h2>
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            {(kind === 'donors'
              ? [['Satır', result.row_count], ['Yeni bağışçı', result.created], ['Mevcutla eşleşen', result.matched], ['Hatalı', result.error_count]]
              : [['Satır', result.row_count], ['Makbuz', result.imported], ['Yeni bağışçı', result.new_donors], ['Hatalı', result.error_count]]
            ).map(([k, v]) => (
              <div key={String(k)} className="rounded-lg bg-gray-50 p-3"><p className="text-[11px] font-bold text-gray-400">{k}</p><p className="font-semibold text-gray-800">{String(v ?? 0)}</p></div>
            ))}
          </div>
          {kind === 'donations' && !!result.totals?.length && (
            <p className="text-xs text-gray-600">Toplam: {result.totals.map((t) => formatMoney(t.total_cents, t.currency)).join(' · ')}
              {result.already_imported ? ` · ${result.already_imported} satır daha önce aktarılmış, atlandı` : ''}</p>
          )}
          {result.errors.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-red-700">Aktarılmayacak satırlar ({result.error_count})</p>
              <ul className="max-h-48 space-y-0.5 overflow-auto text-xs text-red-700">
                {result.errors.map((e) => <li key={e.row}>Satır {e.row}: {e.message}</li>)}
              </ul>
            </div>
          )}
          {result.preview.length > 0 && (
            <div className="overflow-x-auto">
              <p className="mb-1 text-xs font-bold text-gray-500">Örnek</p>
              <Table>
                <THead><Tr>{Object.keys(result.preview[0]).map((k) => <Th key={k}>{k}</Th>)}</Tr></THead>
                <TBody>{result.preview.map((r, i) => (
                  <Tr key={i} className="border-t">{Object.entries(r).map(([k, v]) => (
                    <Td key={k}>{k === 'amount_cents' ? (Number(v) / 100).toLocaleString('tr-TR') : Array.isArray(v) ? v.join(', ') : String(v ?? '')}</Td>
                  ))}</Tr>
                ))}</TBody>
              </Table>
            </div>
          )}
          {result.committed && <button className={ghostButton} onClick={() => reset()}>Yeni dosya</button>}
        </Card>
      )}
    </div>
  )
}
