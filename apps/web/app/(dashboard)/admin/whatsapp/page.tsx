'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCheck, Copy, KeyRound, ListChecks, RefreshCw, Send, Users } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Label, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import {
  EmptyState, PageHeader, Pagination, StatCard, TBody, THead, Table, Tabs, Td, Th, Tr, WhatsAppIcon, confirmDialog, toast,
} from '../../../../components/admin/ui'

interface Account {
  configured: boolean
  values: Record<string, string | null>
  webhook_url: string | null
  verify_token: string | null
  can_list_templates: boolean
}
interface Template { name: string; language: string; category: string; body: string; param_count: number }
interface Message {
  id: string; phone: string; donor_name: string | null; kind: string; template_name: string | null; body: string | null
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'; error: string | null; created_at: string | null
  batch_id: string | null
}
interface Options { kinds: { key: string; label: string }[]; lists?: { id: string; name: string; count: number }[]; tags: string[]; cities: string[]; campaigns: { id: string; title: string }[]; kurban_years: number[] }
interface Stats { counts: Record<string, number>; total: number }

type Tab = 'send' | 'bulk' | 'log' | 'account'
const STATUS: Record<Message['status'], [string, string]> = {
  queued: ['Kuyrukta', 'bg-gray-100 text-gray-700'],
  sent: ['Gönderildi', 'bg-sky-100 text-sky-800'],
  delivered: ['İletildi', 'bg-emerald-100 text-emerald-800'],
  read: ['Okundu', 'bg-emerald-600 text-white'],
  failed: ['Başarısız', 'bg-red-100 text-red-700'],
}
const FIELDS: [string, string, boolean][] = [
  ['phone_number_id', 'Telefon numarası kimliği (Phone number ID)', false],
  ['access_token', 'Kalıcı erişim anahtarı (System user token)', true],
  ['business_account_id', 'WhatsApp Business hesap kimliği (WABA ID)', false],
  ['default_language', 'Şablon dili (ör. tr)', false],
]
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

function TemplateFields({ templates, name, setName, params, setParams }: {
  templates: Template[]; name: string; setName: (v: string) => void; params: string[]; setParams: (v: string[]) => void
}) {
  const current = templates.find((t) => t.name === name)
  return (
    <div className="space-y-3">
      <Label label="Onaylı şablon" hint={templates.length ? undefined : 'Şablonlar Meta Business Manager’da onaylanır; listelemek için WABA ID gerekir. Adını elle de yazabilirsiniz.'}>
        {templates.length ? (
          <select className={inputClass} value={name} onChange={(e) => {
            setName(e.target.value)
            const t = templates.find((x) => x.name === e.target.value)
            setParams(Array.from({ length: t?.param_count || 0 }, () => ''))
          }}>
            <option value="">Şablon seçin</option>
            {templates.map((t) => <option key={`${t.name}-${t.language}`} value={t.name}>{t.name} ({t.language}, {t.category})</option>)}
          </select>
        ) : (
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. kurban_kesildi" />
        )}
      </Label>
      {current?.body && <p className="whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{current.body}</p>}
      {params.map((p, i) => (
        <Label key={i} label={`Değişken {{${i + 1}}}`} hint={i === 0 ? '{ad}, {ad_soyad}, {kurum}, {portal} gibi SMS değişkenleri kullanılabilir.' : undefined}>
          <input className={inputClass} value={p} onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} />
        </Label>
      ))}
      <button type="button" className={ghostButton} onClick={() => setParams([...params, ''])}>+ Değişken ekle</button>
    </div>
  )
}

export default function WhatsAppPage() {
  const [tab, setTab] = useState<Tab>('send')
  const [account, setAccount] = useState<Account | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [log, setLog] = useState<{ status: string; days?: number }>({ status: '' })
  const openLog = (status: string) => { setLog({ status, days: 30 }); setTab('log') }

  const loadAccount = useCallback(async () => {
    try {
      const acc = (await adminGet<Account>('/whatsapp/account')).data
      setAccount(acc)
      if (!acc.configured) setTab('account')
      if (acc.can_list_templates) {
        adminGet<Template[]>('/whatsapp/templates').then((r) => setTemplates(r.data)).catch((err) => toast.error(apiErrorMessage(err, 'Şablonlar alınamadı')))
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'WhatsApp hesabı okunamadı'))
    }
  }, [])
  useEffect(() => {
    loadAccount()
    adminGet<Stats>('/whatsapp/stats').then((r) => setStats(r.data)).catch(() => {})
  }, [loadAccount])

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="flex items-center gap-2"><WhatsAppIcon className="h-6 w-6 text-emerald-600" /> WhatsApp Business</span>}
        description="Bağışçılara Meta’nın onayladığı şablonlarla tekli ve toplu WhatsApp mesajı gönderin; iletildi/okundu durumunu izleyin."
      />
      {stats && (
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Son 30 gün" value={stats.total.toLocaleString('tr-TR')} icon={Send} onClick={() => openLog('')} />
          <StatCard label="İletildi" value={(stats.counts.delivered + stats.counts.read).toLocaleString('tr-TR')} tone="good" icon={CheckCheck} detail={{
            title: 'İletilen mesajlar',
            content: () => <Table><THead><Tr><Th>Durum</Th><Th className="text-right">Adet</Th></Tr></THead><TBody>
              <Tr><Td>İletildi, henüz okunmadı</Td><Td className="text-right tabular-nums">{stats.counts.delivered}</Td></Tr>
              <Tr><Td>Okundu</Td><Td className="text-right tabular-nums">{stats.counts.read}</Td></Tr>
            </TBody></Table>,
          }} />
          <StatCard label="Okundu" value={stats.counts.read.toLocaleString('tr-TR')} tone="brand" icon={CheckCheck} onClick={() => openLog('read')} />
          <StatCard label="Başarısız" value={stats.counts.failed.toLocaleString('tr-TR')} tone={stats.counts.failed ? 'bad' : 'neutral'} onClick={() => openLog('failed')} />
        </div>
      )}
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'send', label: 'Tekli Gönder', icon: Send },
        { key: 'bulk', label: 'Toplu Gönderim', icon: Users },
        { key: 'log', label: 'Mesajlar', icon: ListChecks },
        { key: 'account', label: 'Hesap Ayarları', icon: KeyRound },
      ]} />
      {tab === 'send' && <SingleSend templates={templates} configured={!!account?.configured} />}
      {tab === 'bulk' && <BulkSend templates={templates} configured={!!account?.configured} onSent={() => setTab('log')} />}
      {tab === 'log' && <MessageLog key={`${log.status}-${log.days}`} initialStatus={log.status} initialDays={log.days} />}
      {tab === 'account' && account && <AccountForm account={account} onSaved={loadAccount} />}
    </div>
  )
}

function SingleSend({ templates, configured }: { templates: Template[]; configured: boolean }) {
  const [phone, setPhone] = useState('')
  const [kind, setKind] = useState<'template' | 'text'>('template')
  const [name, setName] = useState('')
  const [params, setParams] = useState<string[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try {
      await adminSend('post', '/whatsapp/send', { phone, kind, template_name: kind === 'template' ? name : null, params, text: kind === 'text' ? text : null })
      toast.ok('Mesaj gönderildi')
      setText('')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Mesaj gönderilemedi'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="max-w-2xl space-y-4 p-6">
      <Label label="Telefon"><input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xx xxx xx xx" /></Label>
      <div className="flex gap-2">
        <button type="button" className={kind === 'template' ? primaryButton : ghostButton} onClick={() => setKind('template')}>Şablon</button>
        <button type="button" className={kind === 'text' ? primaryButton : ghostButton} onClick={() => setKind('text')}>Serbest metin</button>
      </div>
      {kind === 'template'
        ? <TemplateFields templates={templates} name={name} setName={setName} params={params} setParams={setParams} />
        : (
          <Label label="Mesaj" hint="Serbest metin yalnızca bağışçı size son 24 saat içinde yazdıysa iletilir; aksi halde Meta reddeder.">
            <textarea className={`${inputClass} min-h-[120px]`} value={text} onChange={(e) => setText(e.target.value)} maxLength={4096} />
          </Label>
        )}
      <button type="button" className={`${primaryButton} flex items-center gap-2`} disabled={busy || !configured || !phone.trim() || (kind === 'template' ? !name : !text.trim())} onClick={send}>
        <Send className="h-4 w-4" /> {busy ? 'Gönderiliyor…' : 'Gönder'}
      </button>
      {!configured && <p className="text-sm text-amber-700">Önce “Hesap Ayarları” sekmesinden WhatsApp hesabını tanımlayın.</p>}
    </Card>
  )
}

function BulkSend({ templates, configured, onSent }: { templates: Template[]; configured: boolean; onSent: () => void }) {
  const [options, setOptions] = useState<Options | null>(null)
  const [kind, setKind] = useState('active_donors')
  const [months, setMonths] = useState('6')
  const [tag, setTag] = useState('')
  const [city, setCity] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [listId, setListId] = useState('')
  const [year, setYear] = useState('')
  const [numbers, setNumbers] = useState('')
  const [withoutConsent, setWithoutConsent] = useState(false)
  const [name, setName] = useState('')
  const [params, setParams] = useState<string[]>([])
  const [preview, setPreview] = useState<{ recipients: number; audience: string; stats: Record<string, number> } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    adminGet<Options>('/sms/audience-options').then((r) => {
      setOptions(r.data)
      setYear(String(r.data.kurban_years[0] || new Date().getFullYear()))
    }).catch((err) => toast.error(apiErrorMessage(err, 'Hedef kitle seçenekleri yüklenemedi')))
  }, [])
  const audience = useMemo(() => ({
    kind, months: Number(months) || 6, tag: tag || null, city: city || null, campaign_id: campaignId || null,
    list_id: listId || null, year: Number(year) || null, numbers: kind === 'numbers' ? numbers : null, include_without_consent: withoutConsent,
  }), [kind, months, tag, city, campaignId, listId, year, numbers, withoutConsent])
  useEffect(() => {
    setPreview(null)
    if (!name || (kind === 'numbers' && !numbers.trim()) || (kind === 'list' && !listId)) return
    const t = setTimeout(() => {
      adminSend<{ recipients: number; audience: string; stats: Record<string, number> }>('post', '/whatsapp/bulk', { kind: 'template', template_name: name, params, audience, dry_run: true })
        .then((r) => setPreview(r.data)).catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [audience, name, params, kind, numbers, listId])

  const send = async () => {
    if (!preview || !(await confirmDialog({ title: `${preview.recipients.toLocaleString('tr-TR')} kişiye WhatsApp gönderilsin mi?`, text: `${preview.audience} · şablon: ${name}`, confirmLabel: 'Gönder' }))) return
    setBusy(true)
    try {
      const r = await adminSend<{ queued: number }>('post', '/whatsapp/bulk', { kind: 'template', template_name: name, params, audience })
      toast.ok(`${r.data.queued.toLocaleString('tr-TR')} mesaj kuyruğa alındı`)
      onSent()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Toplu gönderim başlatılamadı'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-6">
        <h2 className="font-bold text-gray-900">Kime?</h2>
        <Label label="Hedef kitle">
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            {(options?.kinds || []).map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Label>
        {(kind === 'active_donors' || kind === 'lapsed_donors') && <Label label="Ay"><input className={inputClass} type="number" min={1} value={months} onChange={(e) => setMonths(e.target.value)} /></Label>}
        {kind === 'tag' && <Label label="Etiket"><select className={inputClass} value={tag} onChange={(e) => setTag(e.target.value)}><option value="">Seçin</option>{options?.tags.map((t) => <option key={t}>{t}</option>)}</select></Label>}
        {kind === 'city' && <Label label="Şehir"><select className={inputClass} value={city} onChange={(e) => setCity(e.target.value)}><option value="">Seçin</option>{options?.cities.map((c) => <option key={c}>{c}</option>)}</select></Label>}
        {kind === 'campaign' && <Label label="Bağış kalemi"><select className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">Seçin</option>{options?.campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Label>}
        {kind === 'list' && <Label label="Kayıtlı liste"><select className={inputClass} value={listId} onChange={(e) => setListId(e.target.value)}><option value="">Seçin</option>{(options?.lists || []).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.count})</option>)}</select></Label>}
        {kind === 'kurban' && <Label label="Yıl"><select className={inputClass} value={year} onChange={(e) => setYear(e.target.value)}>{options?.kurban_years.map((y) => <option key={y}>{y}</option>)}</select></Label>}
        {kind === 'numbers' && <Label label="Numaralar" hint="Her satıra bir numara"><textarea className={`${inputClass} min-h-[120px]`} value={numbers} onChange={(e) => setNumbers(e.target.value)} /></Label>}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={withoutConsent} onChange={(e) => setWithoutConsent(e.target.checked)} />
          Bilgilendirme mesajı: izin vermemiş bağışçılara da gönder
        </label>
      </Card>
      <Card className="space-y-4 p-6">
        <h2 className="font-bold text-gray-900">Ne?</h2>
        <TemplateFields templates={templates} name={name} setName={setName} params={params} setParams={setParams} />
        {preview && (
          <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
            <b>{preview.recipients.toLocaleString('tr-TR')}</b> kişiye gidecek
            {preview.stats.no_phone ? ` · ${preview.stats.no_phone} kişinin telefonu yok` : ''}
            {preview.stats.no_consent ? ` · ${preview.stats.no_consent} kişi izin vermemiş` : ''}
          </p>
        )}
        <button type="button" className={`${primaryButton} flex items-center gap-2`} disabled={busy || !configured || !preview?.recipients} onClick={send}>
          <Send className="h-4 w-4" /> {busy ? 'Kuyruğa alınıyor…' : 'Toplu Gönder'}
        </button>
      </Card>
    </div>
  )
}

function MessageLog({ initialStatus, initialDays }: { initialStatus: string; initialDays?: number }) {
  const [days, setDays] = useState(initialDays)
  const [status, setStatus] = useState(initialStatus)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ total: number; items: Message[] } | null>(null)
  const load = useCallback(() => {
    adminGet<{ total: number; items: Message[] }>('/whatsapp/messages', { days, status: status || undefined, q: q.trim() || undefined, page, page_size: 50 })
      .then((r) => setData(r.data)).catch((err) => toast.error(apiErrorMessage(err)))
  }, [status, q, page, days])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  const waiting = data?.items.some((m) => m.status === 'queued')
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [waiting, load])
  const cancel = async (batchId: string) => {
    if (!(await confirmDialog('Bu toplu gönderimin kuyruktaki mesajları iptal edilsin mi?'))) return
    try {
      const r = await adminSend<{ cancelled: number }>('post', `/whatsapp/batches/${batchId}/cancel`)
      toast.ok(`${r.data.cancelled} mesaj iptal edildi`)
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
  return (
    <Card className="space-y-4 p-4">
      {days && <p className="text-xs text-gray-500">Son {days} gün gösteriliyor. <button type="button" className="font-bold text-primary-700" onClick={() => { setDays(undefined); setPage(1) }}>Tümünü göster</button></p>}
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${inputClass} max-w-[180px]`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Tüm durumlar</option>
          {Object.entries(STATUS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <input className={`${inputClass} max-w-xs`} placeholder="Telefon, isim veya şablon" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <button type="button" className={`${ghostButton} flex items-center gap-1`} onClick={load}><RefreshCw className="h-3.5 w-3.5" /> Yenile</button>
      </div>
      {data && !data.items.length ? <EmptyState icon={ListChecks} title="Henüz mesaj yok" /> : (
        <Table>
          <THead><Tr><Th>Tarih</Th><Th>Alıcı</Th><Th>İçerik</Th><Th>Durum</Th><Th /></Tr></THead>
          <TBody>
            {data?.items.map((m) => (
              <Tr key={m.id}>
                <Td className="whitespace-nowrap text-gray-500">{when(m.created_at)}</Td>
                <Td><div className="font-medium">{m.donor_name || '—'}</div><div className="text-xs text-gray-500">{m.phone}</div></Td>
                <Td className="max-w-md">
                  <div className="text-xs font-semibold text-gray-500">{m.kind === 'template' ? `Şablon: ${m.template_name}` : 'Serbest metin'}</div>
                  <div className="truncate text-sm">{m.body}</div>
                  {m.error && <div className="text-xs text-red-600">{m.error}</div>}
                </Td>
                <Td><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[m.status][1]}`}>{STATUS[m.status][0]}</span></Td>
                <Td>{m.status === 'queued' && m.batch_id && <button type="button" className={ghostButton} onClick={() => cancel(m.batch_id!)}>Toplu gönderimi durdur</button>}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      {data && <Pagination page={page} pages={Math.ceil(data.total / 50)} total={data.total} onChange={setPage} />}
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
      await adminSend('put', '/whatsapp/account', { values })
      toast.ok('WhatsApp hesabı kaydedildi')
      onSaved()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kaydedilemedi'))
    } finally {
      setBusy(false)
    }
  }
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.ok('Kopyalandı'))
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-6">
        <h2 className="font-bold text-gray-900">Meta Cloud API bilgileri</h2>
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
          <li>business.facebook.com’da bir Meta uygulaması açıp WhatsApp ürününü ekleyin ve kurumun numarasını bağlayın.</li>
          <li>Business Manager › Sistem kullanıcıları’ndan <b>whatsapp_business_messaging</b> ve <b>whatsapp_business_management</b> izinli kalıcı bir anahtar üretin.</li>
          <li>Telefon numarası kimliğini ve WABA kimliğini buraya girip kaydedin.</li>
          <li>Uygulamanın WhatsApp › Yapılandırma sayfasında Webhook adresini ve doğrulama anahtarını girin, <b>messages</b> alanına abone olun.</li>
          <li>Mesaj şablonlarını WhatsApp Manager’da oluşturup onaya gönderin.</li>
        </ol>
        {account.webhook_url ? (
          <div className="space-y-2">
            <Label label="Webhook adresi (Callback URL)">
              <div className="flex gap-2"><input readOnly className={inputClass} value={account.webhook_url} /><button type="button" className={ghostButton} onClick={() => copy(account.webhook_url!)}><Copy className="h-4 w-4" /></button></div>
            </Label>
            <Label label="Doğrulama anahtarı (Verify token)">
              <div className="flex gap-2"><input readOnly className={inputClass} value={account.verify_token || ''} /><button type="button" className={ghostButton} onClick={() => copy(account.verify_token || '')}><Copy className="h-4 w-4" /></button></div>
            </Label>
          </div>
        ) : <p className="text-amber-700">Webhook adresi, bilgileri ilk kaydettiğinizde oluşur.</p>}
      </Card>
    </div>
  )
}
