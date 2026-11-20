'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, Film, Link2, MessageSquare, Trash2, Upload, Wand2 } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, v1Get } from '../../../../lib/admin-access'
import { Label, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { EmptyState, Modal, PageHeader, Pagination, StatCard, TBody, THead, Table, Td, Th, Tr, confirmDialog, toast } from '../../../../components/admin/ui'

interface Video {
  id: string; title: string; original_name: string; size_bytes: number; received_bytes: number; status: 'uploading' | 'ready'
  target: { type: string; label: string } | null; views: number; viewers: number; watch_path: string; created_at: string | null
}
interface Listing { total: number; used_bytes: number; items: Video[] }
interface Upload { name: string; size: number; sent: number; error?: string; done?: boolean }
interface KurbanCampaign { id: string; title: string }
interface Viewer { donor_id: string; name: string; phone: string | null; viewed: boolean; view_count: number; last_viewed_at: string | null }

const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

async function uploadOne(file: File, onProgress: (sent: number) => void): Promise<void> {
  const start = await adminSend<{ id: string; chunk_bytes: number }>('post', '/videos/uploads', { filename: file.name, size: file.size, content_type: file.type || null })
  const { id, chunk_bytes } = start.data
  let index = 0
  for (let offset = 0; offset < file.size; offset += chunk_bytes, index += 1) {
    const chunk = await file.slice(offset, offset + chunk_bytes).arrayBuffer()
    let attempt = 0
    for (;;) {
      try {
        await adminSend('put', `/videos/uploads/${id}/chunks/${index}`, chunk)
        break
      } catch (err) {
        attempt += 1
        if (attempt >= 3) throw err
        await new Promise((r) => setTimeout(r, 1500 * attempt))
      }
    }
    onProgress(Math.min(offset + chunk_bytes, file.size))
  }
}

export default function VideosPage() {
  const [data, setData] = useState<Listing | null>(null)
  const [q, setQ] = useState('')
  const [onlyFree, setOnlyFree] = useState(false)
  const [page, setPage] = useState(1)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [matchOpen, setMatchOpen] = useState(false)
  const [viewsOf, setViewsOf] = useState<Video | null>(null)
  const [linkOf, setLinkOf] = useState<Video | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    adminGet<Listing>('/videos', { q: q.trim() || undefined, unattached: onlyFree || undefined, page, page_size: 50 })
      .then((r) => setData(r.data)).catch((err) => toast.error(apiErrorMessage(err)))
  }, [q, onlyFree, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files)
    setUploads(list.map((f) => ({ name: f.name, size: f.size, sent: 0 })))
    for (let i = 0; i < list.length; i += 1) {
      try {
        await uploadOne(list[i], (sent) => setUploads((u) => u.map((x, j) => (j === i ? { ...x, sent } : x))))
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, done: true } : x)))
      } catch (err) {
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, error: apiErrorMessage(err, 'Yüklenemedi') } : x)))
      }
    }
    load()
  }
  const remove = async (v: Video) => {
    if (!(await confirmDialog({ title: `“${v.title}” silinsin mi?`, text: 'Dosya sunucudan da silinir; gönderilmiş bağlantılar çalışmaz.', danger: true, confirmLabel: 'Sil' }))) return
    try {
      await adminSend('delete', `/videos/${v.id}`)
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="flex items-center gap-2"><Film className="h-6 w-6 text-primary-600" /> Bağış Videoları</span>}
        description="Kesim, kuyu açılışı veya proje videolarını sunucuya yükleyin, bağışlarla eşleştirin; her bağışçıya kendi izleme bağlantısı gider ve kimin izlediği görünür."
        actions={<>
          <button type="button" className={`${ghostButton} flex items-center gap-1`} onClick={() => setMatchOpen(true)}><Wand2 className="h-3.5 w-3.5" /> Kurbanlarla toplu eşleştir</button>
          <button type="button" className={`${primaryButton} flex items-center gap-2`} onClick={() => input.current?.click()}><Upload className="h-4 w-4" /> Video yükle</button>
          <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
        </>}
      />
      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Video" value={data.total.toLocaleString('tr-TR')} icon={Film} />
          <StatCard label="Kullanılan alan" value={mb(data.used_bytes)} />
          <StatCard label="Toplam izlenme" value={data.items.reduce((s, v) => s + v.views, 0).toLocaleString('tr-TR')} icon={Eye} hint="Bu sayfadaki videolar" />
        </div>
      )}
      {uploads.length > 0 && (
        <Card className="space-y-2 p-4">
          {uploads.map((u, i) => (
            <div key={i} className="text-sm">
              <div className="flex justify-between"><span className="truncate">{u.name}</span><span className="text-gray-500">{u.error ? <span className="text-red-600">{u.error}</span> : u.done ? 'Tamamlandı' : `${Math.round((u.sent / u.size) * 100)}%`}</span></div>
              <div className="mt-1 h-1.5 rounded bg-gray-100"><div className={`h-1.5 rounded ${u.error ? 'bg-red-500' : 'bg-primary-600'}`} style={{ width: `${(u.sent / u.size) * 100}%` }} /></div>
            </div>
          ))}
          <p className="text-xs text-gray-500">Dosya adı kurban numarası olan videolar (ör. 12.mp4, K-012.mov) “Kurbanlarla toplu eşleştir” ile hayvanlara bağlanır.</p>
        </Card>
      )}
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input className={`${inputClass} max-w-xs`} placeholder="Dosya adı veya başlık" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyFree} onChange={(e) => { setOnlyFree(e.target.checked); setPage(1) }} /> Yalnız eşleşmemişler</label>
        </div>
        {data && !data.items.length ? <EmptyState icon={Film} title="Henüz video yok" text="MP4, MOV veya WEBM yükleyebilirsiniz (dosya başına en fazla 1 GB)." /> : (
          <Table>
            <THead><Tr><Th>Video</Th><Th>Bağlı olduğu</Th><Th>Boyut</Th><Th>İzlenme</Th><Th>Yüklenme</Th><Th /></Tr></THead>
            <TBody>
              {data?.items.map((v) => (
                <Tr key={v.id}>
                  <Td><div className="font-medium">{v.title}</div>{v.title !== v.original_name && <div className="text-xs text-gray-500">{v.original_name}</div>}
                    {v.status === 'uploading' && <span className="text-xs text-amber-700">Yükleme yarım kaldı ({Math.round((v.received_bytes / v.size_bytes) * 100)}%)</span>}</Td>
                  <Td>{v.target ? v.target.label : <span className="text-amber-700">Eşleşmedi</span>}</Td>
                  <Td className="tabular-nums">{mb(v.size_bytes)}</Td>
                  <Td>{v.viewers} kişi · {v.views} kez</Td>
                  <Td className="whitespace-nowrap text-gray-500">{when(v.created_at)}</Td>
                  <Td className="whitespace-nowrap">
                    {v.status === 'ready' && <a className={`${ghostButton} mr-1 inline-block`} href={v.watch_path} target="_blank" rel="noreferrer">İzle</a>}
                    <button type="button" className={`${ghostButton} mr-1`} onClick={() => setLinkOf(v)}><Link2 className="inline h-3.5 w-3.5" /> Bağla</button>
                    {v.target && <button type="button" className={`${ghostButton} mr-1`} onClick={() => setViewsOf(v)}><Eye className="inline h-3.5 w-3.5" /> İzleyenler</button>}
                    <button type="button" className={ghostButton} aria-label="Sil" onClick={() => remove(v)}><Trash2 className="inline h-3.5 w-3.5" /></button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        {data && <Pagination page={page} pages={Math.ceil(data.total / 50)} total={data.total} onChange={setPage} />}
      </Card>
      {matchOpen && <MatchDialog onClose={() => setMatchOpen(false)} onDone={load} />}
      {viewsOf && <ViewsDialog video={viewsOf} onClose={() => setViewsOf(null)} />}
      {linkOf && <LinkDialog video={linkOf} onClose={() => setLinkOf(null)} onDone={load} />}
    </div>
  )
}

function MatchDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [campaigns, setCampaigns] = useState<KurbanCampaign[]>([])
  const [id, setId] = useState('')
  const [result, setResult] = useState<{ matched: { video: string; animal_number: string }[]; unmatched: string[] } | null>(null)
  useEffect(() => { v1Get<KurbanCampaign[]>('/kurban/campaigns').then((r) => setCampaigns(r.data)).catch(() => {}) }, [])
  const run = async () => {
    try {
      const r = await adminSend<{ matched: { video: string; animal_number: string }[]; unmatched: string[] }>('post', '/videos/match-kurban', { kurban_campaign_id: id })
      setResult(r.data)
      onDone()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
  return (
    <Modal title="Kurban videolarını toplu eşleştir" description="Eşleşmemiş videolar, dosya adındaki numaraya göre bu kampanyanın hayvanlarına bağlanır." onClose={onClose}
      footer={<button type="button" className={primaryButton} disabled={!id} onClick={run}>Eşleştir</button>}>
      <Label label="Kurban kampanyası">
        <select className={inputClass} value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Seçin</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </Label>
      {result && (
        <div className="space-y-2 text-sm">
          <p className="text-emerald-700">{result.matched.length} video eşleşti.</p>
          {result.unmatched.length > 0 && <p className="text-amber-700">Eşleşmeyen: {result.unmatched.slice(0, 20).join(', ')}{result.unmatched.length > 20 ? '…' : ''}</p>}
          <p className="text-xs text-gray-500">Kesim SMS’i kurban sayfasındaki “kesildi” işaretlemesiyle gider; videosu yüklü hayvanlarda SMS’teki {'{video}'} her bağışçıya kendi izleme bağlantısını götürür.</p>
        </div>
      )}
    </Modal>
  )
}

function ViewsDialog({ video, onClose }: { video: Video; onClose: () => void }) {
  const [data, setData] = useState<{ items: Viewer[]; viewed: number; audience: number; other_views: number } | null>(null)
  const [message, setMessage] = useState('Sayın {ad_soyad}, bağışınıza ait videoyu buradan izleyebilirsiniz: {video}')
  const load = () => adminGet<{ items: Viewer[]; viewed: number; audience: number; other_views: number }>(`/videos/${video.id}/views`).then((r) => setData(r.data)).catch((err) => toast.error(apiErrorMessage(err)))
  useEffect(() => { load() }, [])
  const notify = async () => {
    if (!(await confirmDialog(`İzlememiş ${data ? data.audience - data.viewed : 0} bağışçıya SMS gönderilsin mi?`))) return
    try {
      const r = await adminSend<{ queued: number; skipped: number }>('post', `/videos/${video.id}/notify`, { message, only_unviewed: true })
      toast.ok(`${r.data.queued} SMS kuyruğa alındı`)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
  return (
    <Modal title={`İzleyenler · ${video.title}`} description={data ? `${data.audience} bağışçıdan ${data.viewed} kişi izledi${data.other_views ? ` · ${data.other_views} kez bağlantısız izlenme` : ''}` : undefined} onClose={onClose} size="lg">
      <div className="max-h-80 overflow-y-auto">
        <Table>
          <THead><Tr><Th>Bağışçı</Th><Th>Telefon</Th><Th>Durum</Th><Th>Son izlenme</Th></Tr></THead>
          <TBody>
            {data?.items.map((v) => (
              <Tr key={v.donor_id}>
                <Td>{v.name}</Td><Td>{v.phone || '—'}</Td>
                <Td>{v.viewed ? <span className="text-emerald-700">İzledi ({v.view_count})</span> : <span className="text-gray-500">İzlemedi</span>}</Td>
                <Td className="text-gray-500">{when(v.last_viewed_at)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
      <Label label="İzlemeyenlere SMS" hint="{video} her bağışçının kendi bağlantısı olur; {ad_soyad} adı.">
        <textarea className={`${inputClass} min-h-[80px]`} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={600} />
      </Label>
      <button type="button" className={`${primaryButton} flex items-center gap-2`} disabled={!data || data.audience === data.viewed} onClick={notify}><MessageSquare className="h-4 w-4" /> SMS gönder</button>
    </Modal>
  )
}

function LinkDialog({ video, onClose, onDone }: { video: Video; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<'campaign' | 'donation'>('campaign')
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [donationId, setDonationId] = useState('')
  const [title, setTitle] = useState(video.title)
  useEffect(() => { v1Get<{ items: { id: string; title: string }[] }>('/campaigns', { page_size: 200 }).then((r) => setCampaigns(r.data.items || [])).catch(() => {}) }, [])
  const save = async () => {
    try {
      await adminSend('patch', `/videos/${video.id}`, { title, campaign_id: kind === 'campaign' ? campaignId || null : null, donation_id: kind === 'donation' ? donationId.trim() || null : null })
      toast.ok('Video güncellendi')
      onClose(); onDone()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
  return (
    <Modal title="Videoyu bağla" description="Bağış kalemine bağlanan video, o kaleme bağış yapan herkesin bağışçı panelinde görünür." onClose={onClose}
      footer={<button type="button" className={primaryButton} onClick={save}>Kaydet</button>}>
      <Label label="Başlık (bağışçı görür)"><input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></Label>
      <div className="flex gap-2">
        <button type="button" className={kind === 'campaign' ? primaryButton : ghostButton} onClick={() => setKind('campaign')}>Bağış kalemi</button>
        <button type="button" className={kind === 'donation' ? primaryButton : ghostButton} onClick={() => setKind('donation')}>Tek bağış</button>
      </div>
      {kind === 'campaign' ? (
        <select className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
          <option value="">Seçin</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      ) : (
        <Label label="Bağış kimliği" hint="Bağış detayındaki kimlik (ID)."><input className={inputClass} value={donationId} onChange={(e) => setDonationId(e.target.value)} /></Label>
      )}
      <p className="text-xs text-gray-500">Kurban hayvanına bağlamak için “Kurbanlarla toplu eşleştir”i kullanın.</p>
    </Modal>
  )
}
