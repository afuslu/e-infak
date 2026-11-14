'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, hasPermission, useAdminAccess } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { SegmentInfo, SmsMeta, SmsTemplate, segmentSummary } from '../../../../lib/sms'
import { PageHeader, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'

interface Options {
  kinds: { key: string; label: string }[]
  tags: string[]; cities: string[]; campaigns: { id: string; title: string }[]; kurban_years: number[]
}
interface Preview {
  recipients: number
  stats: { matched: number; no_phone: number; no_consent: number; invalid: number; duplicate: number }
  parts_total: number; max_parts: number
  sample: { name: string; phone: string; body: string; segments: SegmentInfo } | null
  send_at: string | null; moved_for_quiet_hours: boolean; label: string
}
interface Batch {
  id: string; name: string; body: string; audience_label: string; commercial: boolean; total: number; sent: number
  failed: number; waiting: number; cancelled: number; state: 'sending' | 'scheduled' | 'done' | 'cancelled'
  send_after: string; created_at: string; created_by: string | null
}

const KIND_LABEL: Record<string, string> = {
  all_donors: 'Tüm bağışçılar', active_donors: 'Son aylarda bağış yapanlar', lapsed_donors: 'Bir süredir bağış yapmayanlar',
  tag: 'Etikete göre', city: 'Şehre göre', campaign: 'Bir kampanyaya bağış yapanlar', members: 'Aktif üyeler',
  dues_overdue: 'Aidatı geciken üyeler', kurban: 'Kurban bağışçıları', numbers: 'Numara listesi (yapıştır)',
}
const STATE: Record<Batch['state'], [string, string]> = {
  sending: ['Gönderiliyor', 'border-amber-200 bg-amber-50 text-amber-700'],
  scheduled: ['Zamanlandı', 'border-sky-200 bg-sky-50 text-sky-700'],
  done: ['Tamamlandı', 'border-green-200 bg-green-50 text-green-700'],
  cancelled: ['İptal edildi', 'border-gray-200 bg-gray-100 text-gray-500'],
}
const PERSONAL = ['ad_soyad', 'ad', 'kurum', 'kurum_telefon', 'iban']
const when = (iso: string) => new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
const n = (value: number) => value.toLocaleString('tr-TR')
const localSoon = () => {
  const d = new Date(Date.now() + 3_600_000)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function BulkSmsPage() {
  const { data: access } = useAdminAccess()
  const canSend = hasPermission(access, 'donor_manage')
  const [options, setOptions] = useState<Options | null>(null)
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [meta, setMeta] = useState<SmsMeta | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [kind, setKind] = useState('all_donors')
  const [months, setMonths] = useState('6')
  const [tag, setTag] = useState('')
  const [city, setCity] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [year, setYear] = useState('')
  const [numbers, setNumbers] = useState('')
  const [commercial, setCommercial] = useState(false)
  const [withoutConsent, setWithoutConsent] = useState(false)
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [body, setBody] = useState('')
  const [later, setLater] = useState(false)
  const [sendAt, setSendAt] = useState(localSoon())
  const [quiet, setQuiet] = useState(true)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const loadBatches = () => adminGet<Batch[]>('/sms/batches').then((r) => setBatches(r.data)).catch(() => {})
  useEffect(() => {
    adminGet<Options>('/sms/audience-options').then((r) => {
      setOptions(r.data)
      setYear(String(r.data.kurban_years[0] || new Date().getFullYear()))
    }).catch((err) => setMessage({ type: 'error', text: apiErrorMessage(err, 'Hedef kitle seçenekleri yüklenemedi') }))
    adminGet<SmsTemplate[]>('/sms/templates').then((r) => setTemplates(r.data.filter((t) => t.is_active && !t.event_key))).catch(() => {})
    adminGet<SmsMeta>('/sms/meta').then((r) => setMeta(r.data)).catch(() => {})
    loadBatches()
  }, [])

  // Keep progress fresh while something is being sent.
  const active = batches.some((b) => b.state === 'sending')
  useEffect(() => {
    if (!active) return
    const t = setInterval(loadBatches, 4000)
    return () => clearInterval(t)
  }, [active])

  const payload = () => ({
    name: name.trim() || null,
    body,
    commercial,
    template_id: templateId || null,
    send_at: later ? new Date(sendAt).toISOString() : null,
    quiet_hours: quiet,
    audience: {
      kind, months: Number(months) || 6, tag: tag || null, city: city || null, campaign_id: campaignId || null,
      year: Number(year) || null, numbers: kind === 'numbers' ? numbers : null,
      include_without_consent: withoutConsent && !commercial,
    },
  })

  const ready = body.trim().length >= 2
    && (kind !== 'tag' || tag) && (kind !== 'city' || city) && (kind !== 'campaign' || campaignId) && (kind !== 'numbers' || numbers.trim())

  // Recount whenever the audience or the text changes.
  useEffect(() => {
    setPreview(null)
    setPreviewError('')
    if (!ready) return
    const t = setTimeout(() => {
      adminSend<Preview>('post', '/sms/batches/preview', payload())
        .then((r) => setPreview(r.data))
        .catch((err) => setPreviewError(apiErrorMessage(err, 'Önizleme alınamadı')))
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, months, tag, city, campaignId, year, numbers, commercial, withoutConsent, body, later, sendAt, quiet])

  const insert = (key: string) => {
    const el = bodyRef.current
    const at = el ? el.selectionStart : body.length
    const end = el ? el.selectionEnd : body.length
    setBody(`${body.slice(0, at)}{${key}}${body.slice(end)}`)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + key.length + 2, at + key.length + 2) })
  }

  const send = async () => {
    if (!preview || !preview.recipients) return
    const timing = preview.send_at ? `${when(preview.send_at)} tarihinde` : 'şimdi'
    if (!(await confirmDialog({ title: `${n(preview.recipients)} kişiye, toplam ${n(preview.parts_total)} SMS ${timing} gönderilecek. Onaylıyor musunuz?`, danger: false }))) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await adminSend<Batch>('post', '/sms/batches', payload())
      setMessage({ type: 'ok', text: `${n(res.data.total)} SMS ${res.data.state === 'scheduled' ? 'zamanlandı' : 'kuyruğa alındı'}. İlerleme aşağıdaki listede.` })
      setBody(''); setName(''); setTemplateId(''); setNumbers('')
      loadBatches()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Gönderim başlatılamadı') })
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (b: Batch) => {
    if (!(await confirmDialog(`"${b.name}" gönderimi durdurulsun mu? Henüz gönderilmemiş ${n(b.waiting)} SMS iptal edilir.`))) return
    try {
      const res = await adminSend<{ cancelled: number }>('post', `/sms/batches/${b.id}/cancel`)
      setMessage({ type: 'ok', text: `${n(res.data.cancelled)} SMS iptal edildi.` })
      loadBatches()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const counter = segmentSummary(preview?.sample?.body || body)
  const skipped = preview ? preview.stats.no_phone + preview.stats.no_consent + preview.stats.invalid + preview.stats.duplicate : 0

  return (
    <div className="space-y-6">
      <PageHeader title="Toplu SMS Gönder" description={<>Hedef kitleyi seçin, metni yazın; kime gideceğini ve kaç SMS tutacağını görüp gönderin.</>} actions={<div className="flex shrink-0 gap-2 whitespace-nowrap">
          <Link href="/admin/sms-gonderimleri" className={ghostButton}>SMS Gönderimleri</Link>
          <Link href="/admin/sms" className={ghostButton}>Şablonlar</Link>
        </div>} />

      <Notice message={message} />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="space-y-5 border border-gray-100 p-6 shadow-sm lg:col-span-3">
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-900">1. Hedef kitle</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label label="Kime gönderilecek">
                <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
                  {(options?.kinds || [{ key: 'all_donors', label: '' }]).map((k) => <option key={k.key} value={k.key}>{KIND_LABEL[k.key] || k.label}</option>)}
                </select>
              </Label>
              {(kind === 'active_donors' || kind === 'lapsed_donors') && (
                <TextInput label={kind === 'active_donors' ? 'Son kaç ayda' : 'Kaç aydır'} type="number" min={1} max={120} value={months} onChange={setMonths} />
              )}
              {kind === 'tag' && (
                <Label label="Etiket" hint={options && !options.tags.length ? 'Bağışçılarda henüz etiket yok.' : undefined}>
                  <select className={inputClass} value={tag} onChange={(e) => setTag(e.target.value)}>
                    <option value="">Seçin</option>
                    {options?.tags.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Label>
              )}
              {kind === 'city' && (
                <Label label="Şehir">
                  <select className={inputClass} value={city} onChange={(e) => setCity(e.target.value)}>
                    <option value="">Seçin</option>
                    {options?.cities.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Label>
              )}
              {kind === 'campaign' && (
                <Label label="Kampanya">
                  <select className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                    <option value="">Seçin</option>
                    {options?.campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </Label>
              )}
              {kind === 'kurban' && <TextInput label="Kurban yılı" type="number" min={2000} max={2100} value={year} onChange={setYear} />}
            </div>
            {kind === 'numbers' && (
              <Label label="Numaralar" hint="Her satıra bir numara ya da virgülle ayırın. Tekrar edenler ve hatalı numaralar ayıklanır.">
                <textarea rows={4} className={`${inputClass} resize-y font-mono`} value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder={'0532 000 00 00\n0533 000 00 00'} />
              </Label>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {([[false, 'Bilgilendirme', 'Duyuru, hatırlatma, teşekkür. İYS kontrolü yapılmaz.'], [true, 'Ticari / tanıtım', 'Kampanya ve bağış çağrısı. Yalnızca izinlilere, İYS kontrolüyle gider.']] as [boolean, string, string][]).map(([value, title, hint]) => (
                <label key={title} className={`cursor-pointer rounded-lg border p-3 text-xs ${commercial === value ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}>
                  <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <input type="radio" name="kind" checked={commercial === value} onChange={() => setCommercial(value)} /> {title}
                  </span>
                  <span className="mt-1 block text-gray-500">{hint}</span>
                </label>
              ))}
            </div>
            {!commercial && kind !== 'numbers' && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <input type="checkbox" className="mt-0.5" checked={withoutConsent} onChange={(e) => setWithoutConsent(e.target.checked)} />
                <span><strong>SMS izni olmayanlara da gönder.</strong> Yalnızca bilgilendirme içerikli iletilerde kullanın; tanıtım veya bağış çağrısı içeren ileti izinsiz kişiye gönderilemez.</span>
              </label>
            )}
          </section>

          <section className="space-y-3 border-t pt-5">
            <h2 className="text-sm font-bold text-gray-900">2. Mesaj</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label label="Şablon (opsiyonel)">
                <select className={inputClass} value={templateId} onChange={(e) => {
                  setTemplateId(e.target.value)
                  const t = templates.find((x) => x.id === e.target.value)
                  if (t) setBody(t.body)
                }}>
                  <option value="">Şablonsuz</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Label>
              <TextInput label="Gönderim adı (opsiyonel)" maxLength={120} placeholder="Kandil mesajı" value={name} onChange={setName} />
            </div>
            <Label label="Mesaj metni">
              <textarea ref={bodyRef} rows={6} maxLength={1500} className={`${inputClass} resize-y`} value={body} onChange={(e) => setBody(e.target.value)} />
            </Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-gray-600">Kişiye özel:</span>
              {(meta?.variables || []).filter((v) => PERSONAL.includes(v.key)).map((v) => (
                <button type="button" key={v.key} onClick={() => insert(v.key)} title={v.label}
                  className="rounded border border-primary-200 bg-primary-50 px-2 py-1 font-mono text-[11px] font-bold text-primary-800 hover:bg-primary-100">{`{${v.key}}`}</button>
              ))}
            </div>
          </section>

          <section className="space-y-2 border-t pt-5">
            <h2 className="text-sm font-bold text-gray-900">3. Zamanlama</h2>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} /> İleri tarihli gönder
            </label>
            {later && <input type="datetime-local" className={`${inputClass} sm:w-72`} value={sendAt} onChange={(e) => setSendAt(e.target.value)} />}
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> Gece gönderme (21:00–08:00 arası sabah 08:00&apos;e ertelenir)
            </label>
          </section>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900">Önizleme</h2>
            {!ready ? (
              <p className="text-sm text-gray-400">Hedef kitleyi seçip metni yazdığınızda burada kime gideceğini görürsünüz.</p>
            ) : previewError ? (
              <p className="text-sm font-semibold text-red-600">{previewError}</p>
            ) : !preview ? (
              <p className="animate-pulse text-sm text-gray-400">Hesaplanıyor…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-gray-50 p-3"><div className="text-[10px] font-bold uppercase text-gray-500">Alıcı</div><div className="text-2xl font-black tabular-nums text-gray-900">{n(preview.recipients)}</div></div>
                  <div className="rounded-lg bg-gray-50 p-3"><div className="text-[10px] font-bold uppercase text-gray-500">Toplam SMS</div><div className="text-2xl font-black tabular-nums text-gray-900">{n(preview.parts_total)}</div></div>
                </div>
                <p className="text-xs text-gray-500">
                  {preview.label}: {n(preview.stats.matched)} kayıt.
                  {skipped > 0 && <> Dışarıda kalan {n(skipped)}: {[
                    preview.stats.no_consent && `${n(preview.stats.no_consent)} izinsiz`,
                    preview.stats.no_phone && `${n(preview.stats.no_phone)} telefonsuz`,
                    preview.stats.invalid && `${n(preview.stats.invalid)} hatalı numara`,
                    preview.stats.duplicate && `${n(preview.stats.duplicate)} tekrar eden`,
                  ].filter(Boolean).join(', ')}.</>}
                </p>
                {preview.sample && (
                  <div>
                    <div className="mb-1 text-xs font-bold text-gray-600">İlk alıcıya gidecek ileti{preview.sample.name ? ` (${preview.sample.name})` : ''}</div>
                    <div className="whitespace-pre-line rounded-2xl rounded-bl-sm bg-gray-100 p-3 text-sm text-gray-800">{preview.sample.body}</div>
                    <p className={`mt-1 text-xs font-semibold ${counter.info.encoding === 'unicode' || counter.info.parts > 3 ? 'text-amber-700' : 'text-gray-500'}`}>{counter.text}</p>
                  </div>
                )}
                {preview.send_at && (
                  <p className="rounded-lg border border-sky-200 bg-sky-50 p-2 text-xs font-semibold text-sky-800">
                    {preview.moved_for_quiet_hours ? 'Gece saatine denk geldiği için ' : ''}{when(preview.send_at)} tarihinde gönderilecek.
                  </p>
                )}
              </>
            )}
            <button type="button" onClick={send} disabled={!canSend || busy || !preview || !preview.recipients} className={`${primaryButton} w-full`}>
              {busy ? 'Hazırlanıyor…' : preview?.send_at ? 'Gönderimi Zamanla' : 'Gönder'}
            </button>
            {!canSend && <p className="text-xs text-gray-400">Toplu SMS göndermek için &quot;Bağışçı ve SMS yönetimi&quot; yetkisi gerekir.</p>}
          </Card>
        </div>
      </div>

      <Card className="space-y-3 border border-gray-100 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">Toplu gönderimler</h2>
        {batches.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Henüz toplu gönderim yapılmadı.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr><Th>Gönderim</Th><Th>Hedef kitle</Th><Th>Zaman</Th><Th>İlerleme</Th><Th>Durum</Th><Th /></Tr>
              </THead>
              <TBody>
                {batches.map((b) => (
                  <Tr key={b.id} className="align-top">
                    <Td className="max-w-xs">
                      <div className="font-bold text-gray-900">{b.name}{b.commercial && <span className="ml-2 rounded border px-1 text-[10px] text-gray-500">Ticari</span>}</div>
                      <div className="line-clamp-2 text-gray-500" title={b.body}>{b.body}</div>
                    </Td>
                    <Td className="text-gray-600">{b.audience_label}</Td>
                    <Td className="whitespace-nowrap text-gray-500">{when(b.send_after)}<div className="text-[10px] text-gray-400">{b.created_by}</div></Td>
                    <Td>
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-primary-600" style={{ width: `${b.total ? Math.round((b.sent / b.total) * 100) : 0}%` }} /></div>
                      <div className="mt-1 tabular-nums text-gray-600">{n(b.sent)} / {n(b.total)}{b.failed > 0 && <span className="ml-2 font-bold text-red-600">{n(b.failed)} başarısız</span>}</div>
                    </Td>
                    <Td><span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold ${STATE[b.state][1]}`}>{STATE[b.state][0]}</span></Td>
                    <Td className="whitespace-nowrap text-right">
                      {canSend && b.waiting > 0 && <button onClick={() => cancel(b)} className="font-bold text-red-600">Durdur</button>}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}
