'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy, FileUp, KeyRound, ListChecks, MessageSquareText, Plus, Trash2 } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, v1Get } from '../../../../lib/admin-access'
import { Label, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { EmptyState, Modal, PageHeader, Pagination, StatCard, TBody, THead, Table, Tabs, Td, Th, Tr, toast } from '../../../../components/admin/ui'

interface Settings {
  keywords: Record<string, string>; default_campaign_id: string | null; default_amount: number | null
  create_donors: boolean; send_receipt: boolean; webhook_url: string | null
}
interface RecordRow {
  id: string; ref: string; source: string; phone: string | null; amount_cents: number; keyword: string | null
  operator: string | null; received_at: string | null; status: 'recorded' | 'unmatched' | 'ignored' | 'error'
  error: string | null; campaign_title: string | null; donor_id: string | null; donor_name: string | null
}
interface Stats { count: number; total_cents: number; unmatched: number; keywords: { keyword: string; count: number; total_cents: number }[] }
interface Campaign { id: string; title: string }
interface ImportResult { rows: number; created: number; recorded: number; unmatched: number; duplicates: number; errors: { row: number; error: string }[]; preview?: Record<string, unknown>[] }
type Tab = 'records' | 'import' | 'settings'

const STATUS: Record<RecordRow['status'], [string, string]> = {
  recorded: ['Kaydedildi', 'bg-emerald-100 text-emerald-800'],
  unmatched: ['Eşleşmedi', 'bg-amber-100 text-amber-800'],
  ignored: ['Yok sayıldı', 'bg-gray-100 text-gray-600'],
  error: ['Hata', 'bg-red-100 text-red-700'],
}
const tl = (cents: number) => (cents / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export default function SmsDonationsPage() {
  const [tab, setTab] = useState<Tab>('records')
  const [stats, setStats] = useState<Stats | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const loadStats = () => adminGet<Stats>('/sms-donations/stats', { days: 30 }).then((r) => setStats(r.data)).catch(() => {})
  useEffect(() => {
    loadStats()
    v1Get<{ items: Campaign[] }>('/campaigns', { page_size: 200 }).then((r) => setCampaigns(r.data.items || [])).catch(() => {})
  }, [])
  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="flex items-center gap-2"><MessageSquareText className="h-6 w-6 text-primary-600" /> SMS Bağışları</span>}
        description="Operatör kısa numarasına gelen SMS bağışları, aracı firmanın bildirimiyle ya da aylık raporu yüklenerek bağış olarak kaydedilir; bağışçı telefon numarasından bulunur."
      />
      {stats && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Son 30 gün bağış" value={stats.count.toLocaleString('tr-TR')} hint={tl(stats.total_cents)} tone="good" />
          <StatCard label="Eşleşmeyen" value={stats.unmatched.toLocaleString('tr-TR')} tone={stats.unmatched ? 'warn' : 'neutral'} />
          <StatCard label="En çok kullanılan kelime" value={stats.keywords[0]?.keyword || '—'} hint={stats.keywords[0] ? `${stats.keywords[0].count} SMS · ${tl(stats.keywords[0].total_cents)}` : undefined} />
        </div>
      )}
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'records', label: 'Gelen SMS Bağışları', icon: ListChecks },
        { key: 'import', label: 'Rapor Yükle', icon: FileUp },
        { key: 'settings', label: 'Anahtar Kelimeler & Bağlantı', icon: KeyRound },
      ]} />
      {tab === 'records' && <Records campaigns={campaigns} onChange={loadStats} />}
      {tab === 'import' && <ImportFile onDone={() => { loadStats(); setTab('records') }} />}
      {tab === 'settings' && <SettingsForm campaigns={campaigns} />}
    </div>
  )
}

function Records({ campaigns, onChange }: { campaigns: Campaign[]; onChange: () => void }) {
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ total: number; items: RecordRow[] } | null>(null)
  const [assigning, setAssigning] = useState<RecordRow | null>(null)
  const [campaignId, setCampaignId] = useState('')
  const load = useCallback(() => {
    adminGet<{ total: number; items: RecordRow[] }>('/sms-donations/records', { status: status || undefined, q: q.trim() || undefined, page, page_size: 50 })
      .then((r) => setData(r.data)).catch((err) => toast.error(apiErrorMessage(err)))
  }, [status, q, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  const assign = async () => {
    if (!assigning) return
    try {
      await adminSend('post', `/sms-donations/records/${assigning.id}/assign`, { campaign_id: campaignId || null })
      toast.ok('Bağış kaydedildi')
      setAssigning(null)
      load(); onChange()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
  const ignore = async (r: RecordRow) => {
    try {
      await adminSend('post', `/sms-donations/records/${r.id}/ignore`)
      load(); onChange()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${inputClass} max-w-[180px]`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Tüm durumlar</option>
          {Object.entries(STATUS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <input className={`${inputClass} max-w-xs`} placeholder="Telefon, kelime veya işlem no" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
      </div>
      {data && !data.items.length ? <EmptyState icon={MessageSquareText} title="Henüz SMS bağışı yok" text="Aracı firmanın bildirim adresini tanımlayın veya raporunu yükleyin." /> : (
        <Table>
          <THead><Tr><Th>Tarih</Th><Th>Telefon</Th><Th>Kelime</Th><Th className="text-right">Tutar</Th><Th>Bağış kalemi</Th><Th>Bağışçı</Th><Th>Durum</Th><Th /></Tr></THead>
          <TBody>
            {data?.items.map((r) => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap text-gray-500">{when(r.received_at)}</Td>
                <Td>{r.phone || '—'}<div className="text-xs text-gray-400">{r.operator}</div></Td>
                <Td className="font-mono text-xs">{r.keyword || '—'}</Td>
                <Td className="text-right tabular-nums">{tl(r.amount_cents)}</Td>
                <Td>{r.campaign_title || '—'}</Td>
                <Td>{r.donor_id ? <Link className="text-primary-700 hover:underline" href={`/admin/bagiscilar?donor=${r.donor_id}`}>{r.donor_name}</Link> : '—'}</Td>
                <Td>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                  {r.error && r.status !== 'recorded' && <div className="mt-1 max-w-[220px] text-xs text-gray-500">{r.error}</div>}
                </Td>
                <Td className="whitespace-nowrap">
                  {r.status === 'unmatched' && (
                    <>
                      <button type="button" className={`${ghostButton} mr-1`} onClick={() => { setAssigning(r); setCampaignId('') }}>Kaydet</button>
                      <button type="button" className={ghostButton} onClick={() => ignore(r)}>Yok say</button>
                    </>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      {data && <Pagination page={page} pages={Math.ceil(data.total / 50)} total={data.total} onChange={setPage} />}
      {assigning && (
        <Modal title="SMS bağışını kaydet" description={`${assigning.phone || ''} · ${tl(assigning.amount_cents)} · ${assigning.keyword || 'kelime yok'}`} onClose={() => setAssigning(null)}
          footer={<button type="button" className={primaryButton} disabled={!campaignId} onClick={assign}>Bağış olarak kaydet</button>}>
          <Label label="Bağış kalemi" hint="Telefon kayıtlı bir bağışçıya aitse ona, değilse yeni bir “SMS Bağışçısı” kaydına yazılır.">
            <select className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Seçin</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </Label>
        </Modal>
      )}
    </Card>
  )
}

function ImportFile({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (dryRun: boolean) => {
    if (!file) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('dry_run', String(dryRun))
      const body = (await adminSend<ImportResult>('post', '/sms-donations/import', form)).data
      setResult(body)
      if (!dryRun) {
        toast.ok(`${body.recorded} bağış kaydedildi, ${body.unmatched} eşleşmeyen, ${body.duplicates} tekrar`)
        onDone()
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Dosya aktarılamadı'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="max-w-3xl space-y-4 p-6">
      <p className="text-sm text-gray-600">
        Aracı firmanın Excel (.xlsx) veya CSV raporunu yükleyin. Sütun adları otomatik tanınır: telefon (MSISDN, GSM, Telefon),
        tutar (Tutar, Amount), anahtar kelime (Mesaj, Keyword), tarih (Tarih, Date), işlem no (İşlem No, ID), operatör.
        Aynı işlem iki kez yüklenirse ikinci kez kaydedilmez.
      </p>
      <input type="file" accept=".xlsx,.csv" onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null) }} />
      <div className="flex gap-2">
        <button type="button" className={ghostButton} disabled={!file || busy} onClick={() => run(true)}>Önizle</button>
        <button type="button" className={primaryButton} disabled={!file || busy} onClick={() => run(false)}>{busy ? 'Aktarılıyor…' : 'Aktar'}</button>
      </div>
      {result?.preview && (
        <div className="space-y-2 text-sm">
          <p>{result.rows} satır okundu{result.errors.length ? `, ${result.errors.length} satırda hata` : ''}. İlk satırlar:</p>
          <Table>
            <THead><Tr><Th>Telefon</Th><Th>Tutar</Th><Th>Kelime</Th><Th>Tarih</Th><Th>İşlem no</Th></Tr></THead>
            <TBody>
              {result.preview.map((p, i) => (
                <Tr key={i}>
                  <Td>{String(p.phone ?? '—')}</Td><Td>{tl(Number(p.amount_cents))}</Td><Td>{String(p.keyword ?? '—')}</Td>
                  <Td>{when(String(p.received_at))}</Td><Td className="font-mono text-xs">{String(p.ref)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
      {result && result.errors.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-red-700">{result.errors.slice(0, 10).map((e) => <li key={e.row}>{e.row}. satır: {e.error}</li>)}</ul>
      )}
    </Card>
  )
}

function SettingsForm({ campaigns }: { campaigns: Campaign[] }) {
  const [s, setS] = useState<Settings | null>(null)
  const [rows, setRows] = useState<{ word: string; campaign: string }[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    adminGet<Settings>('/sms-donations/settings').then((r) => {
      setS(r.data)
      setRows(Object.entries(r.data.keywords).map(([word, campaign]) => ({ word, campaign })))
    }).catch((err) => toast.error(apiErrorMessage(err)))
  }, [])
  if (!s) return null
  const save = async () => {
    setBusy(true)
    try {
      const keywords = Object.fromEntries(rows.filter((r) => r.word.trim() && r.campaign).map((r) => [r.word.trim().toUpperCase(), r.campaign]))
      const r = await adminSend<Settings>('put', '/sms-donations/settings', { ...s, keywords, default_amount: s.default_amount || null })
      setS(r.data)
      toast.ok('Ayarlar kaydedildi')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kaydedilemedi'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-6">
        <h2 className="font-bold text-gray-900">Anahtar kelimeler</h2>
        <p className="text-sm text-gray-600">Bağışçının SMS’e yazdığı ilk kelime hangi bağış kalemine gideceğini belirler (ör. SU → Su Kuyusu).</p>
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input className={`${inputClass} max-w-[140px] uppercase`} placeholder="KELİME" value={row.word}
              onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, word: e.target.value } : r)))} />
            <select className={inputClass} value={row.campaign} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, campaign: e.target.value } : r)))}>
              <option value="">Bağış kalemi seçin</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <button type="button" className={ghostButton} aria-label="Sil" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" className={`${ghostButton} flex items-center gap-1`} onClick={() => setRows([...rows, { word: '', campaign: '' }])}><Plus className="h-3.5 w-3.5" /> Kelime ekle</button>
        <Label label="Kelime eşleşmezse">
          <select className={inputClass} value={s.default_campaign_id || ''} onChange={(e) => setS({ ...s, default_campaign_id: e.target.value || null })}>
            <option value="">Eşleşmeyen olarak beklet</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Label>
        <Label label="Tutar raporda yoksa (TL)">
          <input className={inputClass} type="number" min={0} value={s.default_amount ?? ''} onChange={(e) => setS({ ...s, default_amount: e.target.value ? Number(e.target.value) : null })} />
        </Label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.create_donors} onChange={(e) => setS({ ...s, create_donors: e.target.checked })} /> Kayıtlı olmayan numaralar için bağışçı kaydı aç</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.send_receipt} onChange={(e) => setS({ ...s, send_receipt: e.target.checked })} /> Bağışçıya teşekkür / makbuz SMS’i gönder</label>
        <button type="button" className={primaryButton} disabled={busy} onClick={save}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </Card>
      <Card className="space-y-4 p-6 text-sm text-gray-700">
        <h2 className="font-bold text-gray-900">Aracı firmaya verilecek bildirim adresi</h2>
        {s.webhook_url ? (
          <>
            <div className="flex gap-2">
              <input readOnly className={inputClass} value={s.webhook_url} />
              <button type="button" className={ghostButton} onClick={() => navigator.clipboard.writeText(s.webhook_url!).then(() => toast.ok('Kopyalandı'))}><Copy className="h-4 w-4" /></button>
            </div>
            <p>Firma her SMS bağışında bu adrese <b>POST</b> atar. JSON nesne, liste veya form verisi kabul edilir; örnek:</p>
            <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{`{"id": "TRX-123", "msisdn": "905321112233",
 "amount": "10.00", "keyword": "SU",
 "operator": "Turkcell", "date": "2026-11-20 14:05:00"}`}</pre>
            <p className="text-xs text-gray-500">Adresi gizli tutun: içindeki anahtar, isteğin kurumunuzdan geldiğini kanıtlar.</p>
          </>
        ) : <p className="text-amber-700">Bildirim adresi, ayarları ilk kaydettiğinizde oluşur.</p>}
      </Card>
    </div>
  )
}
