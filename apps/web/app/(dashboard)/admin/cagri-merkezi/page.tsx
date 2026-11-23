'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy, KeyRound, Link2, ListChecks, Phone, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, Plus, RefreshCw, Sparkles, Users } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, formatMoney } from '../../../../lib/admin-access'
import { Label, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { EmptyState, Modal, PageHeader, Pagination, StatCard, TBody, THead, Table, Tabs, Td, Th, Tr, toast } from '../../../../components/admin/ui'

interface Account { configured: boolean; values: Record<string, string | null>; webhook_url: string | null; my_extension: string | null }
interface Call {
  id: string; direction: 'in' | 'out'; phone: string | null; extension: string | null; status: string; status_label: string
  talk_seconds: number | null; recording_url: string | null; note: string | null; donor_id: string | null
  donor_name: string | null; started_by: string | null; started_at: string | null
}
interface Stats { incoming: number; outgoing: number; missed: number; talk_seconds: number }
interface Ext { id: string; name: string; email: string; extension: string | null }
interface SmartQueueItem {
  donor_id: string
  full_name: string
  phone: string
  city: string | null
  score: number
  priority: 'high' | 'medium' | 'normal'
  category: string
  categories: string[]
  reasons: string[]
  suggested_script: string
  total_cents: number
  donation_count: number
  avg_gap_days: number | null
  days_since_last: number | null
  last_donation_at: string | null
  last_campaign: string | null
  last_called_at: string | null
}
interface SmartQueueResponse {
  items: SmartQueueItem[]
  counts: Record<string, number>
}
type Tab = 'smart' | 'calls' | 'extensions' | 'account'

const FIELDS: [string, string, boolean][] = [
  ['pbx_number', 'Santral numarası (850…, başında 0 olmadan)', false],
  ['username', 'API kullanıcı adı (santral / abone numarası)', false],
  ['password', 'API yetkili alt kullanıcı şifresi', true],
  ['trunk', 'Arayan numara (trunk; boşsa santral numarası)', false],
]
const STATUS_CLASS: Record<string, string> = {
  ringing: 'bg-amber-100 text-amber-800', answered: 'bg-sky-100 text-sky-800', ended: 'bg-emerald-100 text-emerald-800',
  missed: 'bg-red-100 text-red-700', busy: 'bg-red-100 text-red-700', failed: 'bg-gray-100 text-gray-700',
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const duration = (s: number | null) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)

export default function CallCenterPage() {
  const [tab, setTab] = useState<Tab>('smart')
  const [account, setAccount] = useState<Account | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [callFilter, setCallFilter] = useState({ direction: '', status: '' })
  const openCalls = (direction: string, status = '') => { setCallFilter({ direction, status }); setTab('calls') }
  const loadAccount = useCallback(() => {
    adminGet<Account>('/call-center/account').then((r) => {
      setAccount(r.data)
      if (!r.data.configured) setTab('account')
    }).catch((err) => toast.error(apiErrorMessage(err, 'Santral hesabı okunamadı')))
  }, [])
  const loadStats = useCallback(() => {
    adminGet<Stats>('/call-center/stats').then((r) => setStats(r.data)).catch(() => {})
  }, [])
  useEffect(() => {
    loadAccount()
    loadStats()
  }, [loadAccount, loadStats])

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="flex items-center gap-2"><PhoneCall className="h-6 w-6 text-primary-600" /> Çağrı Merkezi</span>}
        description="NetGSM Netsantral ile bağışçıları sistemden arayın; gelen çağrılar bağışçı kartıyla ekranınıza düşer, ses kayıtları çağrıya bağlanır."
        actions={<MyExtension account={account} onSaved={loadAccount} />}
      />
      {stats && (
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Gelen (30 gün)" value={stats.incoming.toLocaleString('tr-TR')} icon={PhoneIncoming} onClick={() => openCalls('in')} />
          <StatCard label="Giden (30 gün)" value={stats.outgoing.toLocaleString('tr-TR')} icon={PhoneOutgoing} onClick={() => openCalls('out')} />
          <StatCard label="Cevapsız" value={stats.missed.toLocaleString('tr-TR')} tone={stats.missed ? 'bad' : 'neutral'} icon={PhoneMissed} onClick={() => openCalls('in', 'missed')} />
          <StatCard label="Konuşma süresi" value={`${Math.round(stats.talk_seconds / 60).toLocaleString('tr-TR')} dk`} onClick={() => openCalls('', 'ended')} />
        </div>
      )}
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'smart', label: 'Bugün Kimi Arayalım?', icon: Sparkles },
        { key: 'calls', label: 'Çağrılar', icon: ListChecks },
        { key: 'extensions', label: 'Personel Dahilileri', icon: Users },
        { key: 'account', label: 'Santral Ayarları', icon: KeyRound },
      ]} />
      {tab === 'smart' && <SmartQueue onRefreshStats={loadStats} />}
      {tab === 'calls' && <CallList key={`${callFilter.direction}-${callFilter.status}`} initial={callFilter} onRefreshStats={loadStats} />}
      {tab === 'extensions' && <Extensions />}
      {tab === 'account' && account && <AccountForm account={account} onSaved={loadAccount} />}
    </div>
  )
}

function MyExtension({ account, onSaved }: { account: Account | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  useEffect(() => setValue(account?.my_extension || ''), [account])
  const save = async () => {
    try {
      await adminSend('put', '/call-center/my-extension', { extension: value.trim() || null })
      toast.ok('Dahili numaranız kaydedildi')
      setOpen(false)
      onSaved()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
  return (
    <>
      <button type="button" className={`${ghostButton} flex items-center gap-1`} onClick={() => setOpen(true)}>
        <Phone className="h-3.5 w-3.5" /> Dahilim: {account?.my_extension || 'tanımsız'}
      </button>
      {open && (
        <Modal title="Santral dahili numaranız" description="Aramalar önce bu dahiliyi çaldırır; gelen çağrılar bu dahiliye düşünce ekranınızda görünür." onClose={() => setOpen(false)} size="sm"
          footer={<button type="button" className={primaryButton} onClick={save}>Kaydet</button>}>
          <input className={inputClass} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} placeholder="ör. 101" />
        </Modal>
      )}
    </>
  )
}

interface DonorOption { id: string; full_name: string; phone: string | null; city: string | null }

function CallList({ initial, onRefreshStats }: { initial: { direction: string; status: string }; onRefreshStats: () => void }) {
  const [direction, setDirection] = useState(initial.direction)
  const [status, setStatus] = useState(initial.status)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ total: number; items: Call[] } | null>(null)
  const [editing, setEditing] = useState<Call | null>(null)
  const [note, setNote] = useState('')
  const [dialOpen, setDialOpen] = useState(false)
  const [dialPhone, setDialPhone] = useState('')
  const [dialBusy, setDialBusy] = useState(false)
  const [linking, setLinking] = useState<Call | null>(null)
  const [donorQuery, setDonorQuery] = useState('')
  const [donorHits, setDonorHits] = useState<DonorOption[]>([])

  const load = useCallback(() => {
    adminGet<{ total: number; items: Call[] }>('/call-center/calls', { direction: direction || undefined, status: status || undefined, q: q.trim() || undefined, page, page_size: 50 })
      .then((r) => setData(r.data)).catch((err) => toast.error(apiErrorMessage(err)))
  }, [direction, status, q, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  useEffect(() => {
    if (!linking) return
    const term = donorQuery.trim()
    const t = setTimeout(() => {
      adminGet<{ items: DonorOption[] }>('/donors', { q: term || undefined, page_size: 10 })
        .then((r) => setDonorHits(r.data.items)).catch(() => setDonorHits([]))
    }, 200)
    return () => clearTimeout(t)
  }, [linking, donorQuery])

  const call = async (c: Call) => {
    try {
      const r = await adminSend<{ message: string }>('post', '/call-center/call', { donor_id: c.donor_id, phone: c.phone })
      toast.ok(r.data.message)
      setTimeout(() => { load(); onRefreshStats() }, 3000)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Arama başlatılamadı'))
    }
  }
  const dialManual = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dialPhone.trim()) return
    setDialBusy(true)
    try {
      const r = await adminSend<{ message: string }>('post', '/call-center/call', { phone: dialPhone.trim() })
      toast.ok(r.data.message)
      setDialOpen(false)
      setDialPhone('')
      setTimeout(() => { load(); onRefreshStats() }, 3000)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Arama başlatılamadı'))
    } finally {
      setDialBusy(false)
    }
  }
  const linkDonor = async (donorId: string) => {
    if (!linking) return
    try {
      await adminSend('patch', `/call-center/calls/${linking.id}`, { donor_id: donorId })
      toast.ok('Çağrı bağışçıya bağlandı')
      setLinking(null)
      setDonorQuery('')
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
  const saveNote = async () => {
    if (!editing) return
    try {
      await adminSend('patch', `/call-center/calls/${editing.id}`, { note })
      toast.ok('Not kaydedildi')
      setEditing(null)
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${inputClass} max-w-[160px]`} value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1) }}>
          <option value="">Gelen + giden</option><option value="in">Gelen</option><option value="out">Giden</option>
        </select>
        <select className={`${inputClass} max-w-[160px]`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Tüm durumlar</option><option value="ended">Tamamlandı</option><option value="missed">Cevapsız</option>
          <option value="busy">Meşgul</option><option value="answered">Görüşmede</option><option value="ringing">Çalıyor</option>
        </select>
        <input className={`${inputClass} max-w-xs`} placeholder="Telefon, isim veya dahili" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <button type="button" className={`${ghostButton} flex items-center gap-1`} onClick={() => { load(); onRefreshStats() }}><RefreshCw className="h-3.5 w-3.5" /> Yenile</button>
        <button type="button" className={`${primaryButton} ml-auto flex items-center gap-1`} onClick={() => setDialOpen(true)}><Plus className="h-3.5 w-3.5" /> Yeni Arama</button>
      </div>
      {data && !data.items.length ? <EmptyState icon={PhoneCall} title="Henüz çağrı yok" text="Santral webhook’u tanımlanınca gelen ve giden çağrılar burada listelenir." /> : (
        <Table>
          <THead><Tr><Th>Tarih</Th><Th>Yön</Th><Th>Bağışçı / Numara</Th><Th>Dahili</Th><Th>Durum</Th><Th>Süre</Th><Th>Kayıt</Th><Th /></Tr></THead>
          <TBody>
            {data?.items.map((c) => (
              <Tr key={c.id}>
                <Td className="whitespace-nowrap text-gray-500">{when(c.started_at)}</Td>
                <Td>{c.direction === 'in' ? <PhoneIncoming className="h-4 w-4 text-sky-600" aria-label="Gelen" /> : <PhoneOutgoing className="h-4 w-4 text-emerald-600" aria-label="Giden" />}</Td>
                <Td>
                  {c.donor_id ? <Link className="font-medium text-primary-700 hover:underline" href={`/admin/bagiscilar?donor=${c.donor_id}`}>{c.donor_name}</Link> : <span className="text-gray-500">Kayıtlı değil</span>}
                  <div className="text-xs text-gray-500">{c.phone}</div>
                  {c.note && <div className="mt-1 max-w-xs truncate text-xs text-gray-700">📝 {c.note}</div>}
                </Td>
                <Td>{c.extension || '—'}{c.started_by && <div className="text-xs text-gray-500">{c.started_by}</div>}</Td>
                <Td><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_CLASS[c.status] || ''}`}>{c.status_label}</span></Td>
                <Td className="tabular-nums">{duration(c.talk_seconds)}</Td>
                <Td>{c.recording_url ? <audio controls preload="none" src={c.recording_url} className="h-8 w-48" /> : '—'}</Td>
                <Td className="whitespace-nowrap">
                  {c.phone && <button type="button" className={`${ghostButton} mr-1`} onClick={() => call(c)}>Ara</button>}
                  <button type="button" className={`${ghostButton} mr-1`} onClick={() => { setEditing(c); setNote(c.note || '') }}>Not</button>
                  {!c.donor_id && (
                    <button type="button" className={ghostButton} title="Bağışçıya bağla" onClick={() => { setLinking(c); setDonorQuery(c.phone || '') }}>
                      <Link2 className="mr-1 inline h-3.5 w-3.5" />Bağla
                    </button>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      {data && <Pagination page={page} pages={Math.ceil(data.total / 50)} total={data.total} onChange={setPage} />}
      {dialOpen && (
        <Modal title="Yeni arama başlat" description="Önce kendi santral dahiliniz çalar, açınca girdiğiniz numara aranır." onClose={() => setDialOpen(false)} size="sm"
          footer={<button type="button" disabled={dialBusy || !dialPhone.trim()} className={primaryButton} onClick={dialManual}>{dialBusy ? 'Aranıyor…' : 'Ara'}</button>}>
          <form onSubmit={dialManual}>
            <Label label="Telefon numarası">
              <input className={inputClass} type="tel" autoFocus placeholder="05XX XXX XX XX" value={dialPhone} onChange={(e) => setDialPhone(e.target.value)} />
            </Label>
          </form>
        </Modal>
      )}
      {linking && (
        <Modal title="Çağrıyı bağışçıya bağla" description={`${linking.phone || 'Bilinmeyen numara'} · ${when(linking.started_at)}`} onClose={() => setLinking(null)} size="sm">
          <div className="space-y-3">
            <input className={inputClass} autoFocus placeholder="Ad, soyad veya telefonla bağışçı ara…" value={donorQuery} onChange={(e) => setDonorQuery(e.target.value)} />
            <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border">
              {donorHits.map((d) => (
                <li key={d.id}>
                  <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => linkDonor(d.id)}>
                    <div>
                      <div className="font-medium text-gray-900">{d.full_name}</div>
                      <div className="text-xs text-gray-500">{d.phone || 'Telefon yok'}{d.city ? ` · ${d.city}` : ''}</div>
                    </div>
                    <span className="text-xs font-semibold text-primary-700">Seç</span>
                  </button>
                </li>
              ))}
              {!donorHits.length && <li className="px-3 py-4 text-center text-xs text-gray-400">Eşleşen bağışçı bulunamadı.</li>}
            </ul>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal title="Görüşme notu" description={`${editing.donor_name || editing.phone} · ${when(editing.started_at)}`} onClose={() => setEditing(null)}
          footer={<button type="button" className={primaryButton} onClick={saveNote}>Kaydet</button>}>
          <textarea className={`${inputClass} min-h-[120px]`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </Modal>
      )}
    </Card>
  )
}

function Extensions() {
  const [rows, setRows] = useState<Ext[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const load = () => adminGet<Ext[]>('/call-center/extensions').then((r) => {
    setRows(r.data)
    setDrafts(Object.fromEntries(r.data.map((x) => [x.id, x.extension || ''])))
  }).catch((err) => toast.error(apiErrorMessage(err)))
  useEffect(() => { load() }, [])
  const save = async (row: Ext) => {
    const extension = (drafts[row.id] ?? '').replace(/\D/g, '')
    if (extension === (row.extension || '')) return
    try {
      await adminSend('put', '/call-center/extensions', { user_id: row.id, extension: extension || null })
      toast.ok(`${row.name}: dahili kaydedildi`)
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, extension: extension || null } : r)))
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    const v = (drafts[r.id] ?? r.extension ?? '').trim()
    if (v) acc[v] = (acc[v] || 0) + 1
    return acc
  }, {})
  return (
    <Card className="p-4">
      <Table>
        <THead><Tr><Th>Personel</Th><Th>E-posta</Th><Th>Santral dahilisi</Th></Tr></THead>
        <TBody>
          {rows.map((r) => {
            const val = drafts[r.id] ?? ''
            const dirty = val !== (r.extension || '')
            const duplicate = !!val && (counts[val] || 0) > 1
            return (
              <Tr key={r.id}>
                <Td className="font-medium">{r.name}</Td>
                <Td className="text-gray-500">{r.email}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <input
                      className={`${inputClass} max-w-[120px]`}
                      inputMode="numeric"
                      value={val}
                      placeholder="—"
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value.replace(/\D/g, '') }))}
                      onBlur={() => save(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(r) } }}
                    />
                    {dirty && <button type="button" className={ghostButton} onClick={() => save(r)}>Kaydet</button>}
                    {duplicate && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Ortak dahili</span>}
                  </div>
                </Td>
              </Tr>
            )
          })}
        </TBody>
      </Table>
    </Card>
  )
}

function AccountForm({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map(([k, , secret]) => [k, secret ? '' : account.values[k] || ''])))
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await adminSend('put', '/call-center/account', { values })
      toast.ok('Santral hesabı kaydedildi')
      onSaved()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kaydedilemedi'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-6">
        <h2 className="font-bold text-gray-900">NetGSM Netsantral</h2>
        {FIELDS.map(([key, label, secret]) => (
          <Label key={key} label={label} hint={secret && account.values[key] ? `Kayıtlı (${account.values[key]}). Değiştirmek için yenisini yazın.` : undefined}>
            <input className={inputClass} type={secret ? 'password' : 'text'} value={values[key]} autoComplete="off"
              onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
          </Label>
        ))}
        <button type="button" className={primaryButton} disabled={busy} onClick={save}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </Card>
      <Card className="space-y-4 p-6 text-sm text-gray-700">
        <h2 className="font-bold text-gray-900">Kurulum</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>NetGSM’de <b>Abonelik İşlemleri › Alt Kullanıcı Hesapları</b>’ndan API yetkili bir alt kullanıcı açın (NetGSM onaylar).</li>
          <li>Santral numarasını, kullanıcı adını ve alt kullanıcının şifresini soldaki forma girip kaydedin.</li>
          <li>Netsantral arayüzünde <b>Ayarlar › Genel Ayarlar › API Talep Ayarları</b>’na aşağıdaki adresi girip aktif edin.</li>
          <li>“Personel Dahilileri” sekmesinden her personelin dahili numarasını yazın.</li>
        </ol>
        {account.webhook_url ? (
          <Label label="Çağrı bildirim adresi (URL’e yönlendirme)">
            <div className="flex gap-2">
              <input readOnly className={inputClass} value={account.webhook_url} />
              <button type="button" className={ghostButton} onClick={() => navigator.clipboard.writeText(account.webhook_url!).then(() => toast.ok('Kopyalandı'))}><Copy className="h-4 w-4" /></button>
            </div>
          </Label>
        ) : <p className="text-amber-700">Bildirim adresi, bilgileri ilk kaydettiğinizde oluşur.</p>}
        <p className="text-xs text-gray-500">Not: NetGSM soket ve URL yönteminden yalnızca birini kullanmanızı ister; URL yöntemini seçin.</p>
      </Card>
    </div>
  )
}

const FOCUS_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'missed_callback', label: 'Cevapsız Dönüş' },
  { key: 'monthly', label: 'Aylık Düzen' },
  { key: 'churn_risk', label: 'Pasifleşme Riski' },
  { key: 'seasonal', label: 'Ramazan / Kurban' },
  { key: 'high_value', label: 'Yüksek Tutarlı' },
]

const PRIORITY_STYLE: Record<SmartQueueItem['priority'], { label: string; cls: string }> = {
  high: { label: 'Yüksek Öncelik', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  medium: { label: 'Orta Öncelik', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  normal: { label: 'Normal', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
}

function SmartQueue({ onRefreshStats }: { onRefreshStats: () => void }) {
  const [focus, setFocus] = useState('all')
  const [cooldownDays, setCooldownDays] = useState(7)
  const [data, setData] = useState<SmartQueueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [callingId, setCallingId] = useState<string | null>(null)
  const [calledIds, setCalledIds] = useState<Record<string, boolean>>({})

  const load = useCallback(() => {
    setLoading(true)
    adminGet<SmartQueueResponse>('/call-center/smart-queue', { focus, cooldown_days: cooldownDays, limit: 40 })
      .then((r) => setData(r.data))
      .catch((err) => toast.error(apiErrorMessage(err, 'Akıllı arama listesi yüklenemedi')))
      .finally(() => setLoading(false))
  }, [focus, cooldownDays])

  useEffect(() => { load() }, [load])

  const dialDonor = async (item: SmartQueueItem) => {
    setCallingId(item.donor_id)
    try {
      const r = await adminSend<{ message: string }>('post', '/call-center/call', {
        donor_id: item.donor_id,
        phone: item.phone,
      })
      toast.ok(r.data.message)
      setCalledIds((prev) => ({ ...prev, [item.donor_id]: true }))
      setTimeout(() => onRefreshStats(), 3000)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Arama başlatılamadı'))
    } finally {
      setCallingId(null)
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
            <Sparkles className="h-4 w-4 text-primary-600" /> Bugün Kimi Arayalım?
          </h2>
          <p className="text-xs text-gray-500">
            Aylık bağış düzeni, Ramazan/Kurban mevsimselliği, pasifleşme riski ve cevapsız çağrılara göre otomatik önceliklendirilir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${inputClass} w-auto text-xs`}
            value={cooldownDays}
            onChange={(e) => setCooldownDays(Number(e.target.value))}
          >
            <option value={3}>Son 3 gün arananları gizle</option>
            <option value={7}>Son 7 gün arananları gizle</option>
            <option value={14}>Son 14 gün arananları gizle</option>
            <option value={0}>Tümünü göster (soğuma yok)</option>
          </select>
          <button type="button" className={`${ghostButton} flex items-center gap-1`} onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FOCUS_OPTIONS.map((opt) => {
          const count = data?.counts?.[opt.key]
          const active = focus === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFocus(opt.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                active
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50/40'
              }`}
            >
              <span>{opt.label}</span>
              {typeof count === 'number' && (
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {loading && !data ? (
        <div className="py-10 text-center text-sm text-gray-500">Bağışçı geçmişi analiz ediliyor…</div>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Bu filtrede öncelikli bağışçı yok"
          text="Soğuma süresini kısaltabilir veya başka bir odak filtresi seçebilirsiniz."
        />
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {data?.items.map((item) => {
            const p = PRIORITY_STYLE[item.priority]
            const isCalled = Boolean(calledIds[item.donor_id])
            return (
              <div key={item.donor_id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${isCalled ? 'bg-emerald-50/40 opacity-75' : ''}`}>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${p.cls}`}>
                      {item.score} puan · {p.label}
                    </span>
                    <Link href={`/admin/bagiscilar?donor=${item.donor_id}`} className="text-sm font-bold text-gray-900 hover:text-primary-700 hover:underline">
                      {item.full_name}
                    </Link>
                    <span className="text-xs text-gray-500">{item.phone}{item.city ? ` · ${item.city}` : ''}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.reasons.map((r, i) => (
                      <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11.5px] font-medium text-slate-700">
                        {r}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500">
                    Toplam: <strong className="text-gray-800">{formatMoney(item.total_cents)}</strong> ({item.donation_count} bağış)
                    {item.last_campaign ? ` · Son: ${item.last_campaign}` : ''}
                    {item.days_since_last !== null ? ` (${item.days_since_last} gün önce)` : ''}
                  </div>
                  <p className="rounded-lg bg-primary-50/50 px-2.5 py-1.5 text-xs italic text-primary-900">
                    💬 “{item.suggested_script}”
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={callingId === item.donor_id}
                    onClick={() => dialDonor(item)}
                    className={`${isCalled ? ghostButton : primaryButton} inline-flex items-center gap-1.5 whitespace-nowrap`}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {callingId === item.donor_id ? 'Aranıyor…' : isCalled ? 'Tekrar Ara' : 'Hemen Ara'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
