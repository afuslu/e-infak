'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { BookmarkPlus, Check, ChevronDown, ExternalLink, Filter, Search, Send, Smartphone, Sparkles, Upload, X } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, useAdminAccess, can } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { SegmentInfo, SmsMeta, SmsTemplate, segmentSummary } from '../../../../lib/sms'
import { PageHeader, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'

interface Options {
  kinds: { key: string; label: string }[]
  tags: string[]
  cities: string[]
  campaigns: { id: string; title: string }[]
  kurban_years: number[]
}
interface Preview {
  recipients: number
  stats: { matched: number; no_phone: number; no_consent: number; invalid: number; duplicate: number }
  parts_total: number
  max_parts: number
  sample: { name: string; phone: string; body: string; segments: SegmentInfo } | null
  send_at: string | null
  moved_for_quiet_hours: boolean
  label: string
}
interface Batch {
  id: string
  name: string
  body: string
  audience_label: string
  commercial: boolean
  total: number
  sent: number
  failed: number
  waiting: number
  cancelled: number
  state: 'sending' | 'scheduled' | 'done' | 'cancelled'
  send_after: string
  created_at: string
  created_by: string | null
}
interface SmsAccount {
  provider: string | null
  own_account: boolean
  balance: { text: string; amount: number | null; unit: string } | null
}

const KIND_LABEL: Record<string, string> = {
  all_donors: 'Tüm bağışçılar',
  active_donors: 'Son aylarda bağış yapanlar',
  lapsed_donors: 'Bir süredir bağış yapmayanlar',
  never_donated: 'Henüz bağış yapmamış kişiler',
  tag: 'Etikete göre',
  city: 'Şehre göre',
  campaign: 'Bir kampanyaya bağış yapanlar',
  members: 'Aktif üyeler',
  dues_overdue: 'Aidatı geciken üyeler',
  kurban: 'Kurban bağışçıları',
  numbers: 'Numara listesi (yapıştır)',
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
const localNow = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
const localSoon = () => {
  const d = new Date(Date.now() + 3_600_000)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
const safeIso = (val: string) => {
  const d = new Date(val)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
const TR_MAP: Record<string, string> = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' }
const toAsciiTr = (text: string) => text.replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => TR_MAP[ch] || ch)

export default function BulkSmsPage() {
  const { data: access } = useAdminAccess()
  const canSend = can(access, 'sms.bulk')
  const canSaveTemplate = can(access, 'sms.templates')
  const [options, setOptions] = useState<Options | null>(null)
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [meta, setMeta] = useState<SmsMeta | null>(null)
  const [account, setAccount] = useState<SmsAccount | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [kind, setKind] = useState('all_donors')
  const [months, setMonths] = useState('6')
  const [tag, setTag] = useState('')
  const [city, setCity] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [year, setYear] = useState('')
  const [numbers, setNumbers] = useState('')
  const [filterCity, setFilterCity] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterDonorType, setFilterDonorType] = useState<'' | 'individual' | 'corporate'>('')
  const [minTotalLira, setMinTotalLira] = useState('')
  const [excludeRecentSmsDays, setExcludeRecentSmsDays] = useState('')
  const [showMoreFilters, setShowMoreFilters] = useState(false)
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
  const [testPhone, setTestPhone] = useState('')
  const [testing, setTesting] = useState(false)
  const [savingTpl, setSavingTpl] = useState(false)
  const [tplPromptOpen, setTplPromptOpen] = useState(false)
  const [tplName, setTplName] = useState('')
  const [showTests, setShowTests] = useState(false)
  const [batchSearch, setBatchSearch] = useState('')
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const numFileRef = useRef<HTMLInputElement>(null)

  const loadBatches = () => adminGet<Batch[]>('/sms/batches').then((r) => setBatches(r.data)).catch(() => {})
  const loadTemplates = () =>
    adminGet<SmsTemplate[]>('/sms/templates')
      .then((r) => setTemplates(r.data.filter((t) => t.is_active && !t.event_key)))
      .catch(() => {})

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlKind = params.get('kind')
    if (urlKind && KIND_LABEL[urlKind]) {
      setKind(urlKind)
      if (urlKind === 'dues_overdue') setName((n) => n || 'Aidat Hatırlatma')
    }
    try {
      const prefill = sessionStorage.getItem('broadcast_prefill_numbers')
      if (prefill) {
        setKind('numbers')
        setNumbers(prefill)
        sessionStorage.removeItem('broadcast_prefill_numbers')
      }
    } catch { /* ignore */ }
    adminGet<Options>('/sms/audience-options')
      .then((r) => {
        setOptions(r.data)
        setYear(String(r.data.kurban_years[0] || new Date().getFullYear()))
      })
      .catch((err) => setMessage({ type: 'error', text: apiErrorMessage(err, 'Hedef kitle seçenekleri yüklenemedi') }))
    loadTemplates()
    adminGet<SmsMeta>('/sms/meta').then((r) => setMeta(r.data)).catch(() => {})
    adminGet<SmsAccount>('/sms/account').then((r) => setAccount(r.data)).catch(() => {})
    loadBatches()
  }, [])

  // Keep progress fresh while something is being sent.
  const active = batches.some((b) => b.state === 'sending')
  useEffect(() => {
    if (!active) return
    const t = setInterval(loadBatches, 4000)
    return () => clearInterval(t)
  }, [active])

  const sendIso = later ? safeIso(sendAt) : null
  const payload = () => ({
    name: name.trim() || null,
    body,
    commercial,
    template_id: templateId || null,
    send_at: sendIso,
    quiet_hours: quiet,
    audience: {
      kind,
      months: Number(months) || 6,
      tag: tag || null,
      city: city || null,
      campaign_id: campaignId || null,
      year: Number(year) || null,
      numbers: kind === 'numbers' ? numbers : null,
      include_without_consent: withoutConsent && !commercial,
      filter_city: kind !== 'numbers' && kind !== 'city' ? filterCity || null : null,
      filter_tag: kind !== 'numbers' && kind !== 'tag' ? filterTag || null : null,
      filter_donor_type: kind !== 'numbers' && filterDonorType ? filterDonorType : null,
      min_total_lira: kind !== 'numbers' && minTotalLira ? Number(minTotalLira) : null,
      exclude_recent_sms_days: kind !== 'numbers' && excludeRecentSmsDays ? Number(excludeRecentSmsDays) : null,
    },
  })

  const ready =
    body.trim().length >= 2 &&
    (!later || Boolean(sendIso)) &&
    (kind !== 'tag' || tag) &&
    (kind !== 'city' || city) &&
    (kind !== 'campaign' || campaignId) &&
    (kind !== 'numbers' || numbers.trim())

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
  }, [
    kind,
    months,
    tag,
    city,
    campaignId,
    year,
    numbers,
    filterCity,
    filterTag,
    filterDonorType,
    minTotalLira,
    excludeRecentSmsDays,
    commercial,
    withoutConsent,
    body,
    later,
    sendAt,
    quiet,
  ])

  const insert = (key: string) => {
    const el = bodyRef.current
    const at = el ? el.selectionStart : body.length
    const end = el ? el.selectionEnd : body.length
    setBody(`${body.slice(0, at)}{${key}}${body.slice(end)}`)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + key.length + 2, at + key.length + 2)
    })
  }

  const send = async () => {
    if (!preview || !preview.recipients) return
    const timing = preview.send_at ? `${when(preview.send_at)} tarihinde` : 'şimdi'
    if (
      !(await confirmDialog({
        title: `${n(preview.recipients)} kişiye, toplam ${n(preview.parts_total)} SMS ${timing} gönderilecek. Onaylıyor musunuz?`,
        danger: false,
      }))
    )
      return
    setBusy(true)
    setMessage(null)
    try {
      const res = await adminSend<Batch>('post', '/sms/batches', payload())
      setMessage({
        type: 'ok',
        text: `${n(res.data.total)} SMS ${res.data.state === 'scheduled' ? 'zamanlandı' : 'kuyruğa alındı'}. İlerleme aşağıdaki listede.`,
      })
      setBody('')
      setName('')
      setTemplateId('')
      setNumbers('')
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

  const sendTest = async () => {
    const phone = testPhone.trim()
    if (!phone || body.trim().length < 2 || testing) return
    setTesting(true)
    setMessage(null)
    try {
      await adminSend<Batch>('post', '/sms/batches', {
        name: `[TEST] ${name.trim() || 'Toplu SMS'}`,
        body,
        commercial: false,
        template_id: templateId || null,
        send_at: null,
        quiet_hours: false,
        audience: { kind: 'numbers', numbers: phone, include_without_consent: true },
      })
      setMessage({ type: 'ok', text: `Test SMS'i ${phone} numarasına kuyruğa alındı.` })
      loadBatches()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Test SMS gönderilemedi') })
    } finally {
      setTesting(false)
    }
  }

  const saveAsTemplate = async () => {
    const title = tplName.trim()
    if (!title || body.trim().length < 2 || savingTpl) return
    setSavingTpl(true)
    setMessage(null)
    try {
      const res = await adminSend<SmsTemplate>('post', '/sms/templates', {
        name: title,
        body,
        event_key: null,
        campaign_id: null,
        auto_mode: 'manual',
        is_active: true,
      })
      setTplPromptOpen(false)
      setTplName('')
      setTemplateId(res.data.id)
      setMessage({ type: 'ok', text: `"${title}" şablonlara kaydedildi.` })
      loadTemplates()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Şablon kaydedilemedi') })
    } finally {
      setSavingTpl(false)
    }
  }

  const importNumbersFile = async (file?: File) => {
    if (!file) return
    const text = await file.text()
    const extracted = text
      .split(/[\r\n,;]+/)
      .map((s) => s.replace(/^["']|["']$/g, '').trim())
      .filter((s) => /\d{7,}/.test(s))
    if (!extracted.length) {
      setMessage({ type: 'error', text: 'Dosyada geçerli telefon numarası bulunamadı.' })
      return
    }
    setNumbers((prev) => (prev.trim() ? `${prev.trim()}\n${extracted.join('\n')}` : extracted.join('\n')))
    setMessage({ type: 'ok', text: `${extracted.length} satır numara listeye eklendi.` })
  }

  const reuseBatch = (b: Batch) => {
    setName(`${b.name.replace(/^\[TEST\]\s*/i, '')} (Tekrar)`)
    setBody(b.body)
    setCommercial(b.commercial)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const pastedNumbersCount = useMemo(() => {
    if (kind !== 'numbers' || !numbers.trim()) return 0
    return numbers
      .split(/[\r\n,;]+/)
      .map((s) => s.trim())
      .filter((s) => /\d{7,}/.test(s)).length
  }, [kind, numbers])

  const filteredBatches = useMemo(() => {
    const q = batchSearch.trim().toLowerCase()
    return batches.filter((b) => {
      if (!showTests && b.name.startsWith('[TEST]')) return false
      if (q) {
        const hay = `${b.name} ${b.body} ${b.audience_label}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [batches, showTests, batchSearch])

  const testCount = useMemo(() => batches.filter((b) => b.name.startsWith('[TEST]')).length, [batches])
  const extraFilterCount = useMemo(() => {
    if (kind === 'numbers') return 0
    return [
      kind !== 'city' ? filterCity : '',
      kind !== 'tag' ? filterTag : '',
      filterDonorType,
      minTotalLira,
      excludeRecentSmsDays,
    ].filter(Boolean).length
  }, [kind, filterCity, filterTag, filterDonorType, minTotalLira, excludeRecentSmsDays])

  const counter = segmentSummary(preview?.sample?.body || body)
  const liveCounter = segmentSummary(body)
  const skipped = preview ? preview.stats.no_phone + preview.stats.no_consent + preview.stats.invalid + preview.stats.duplicate : 0
  const balanceAmount = account?.balance?.amount
  const balanceInsufficient = balanceAmount != null && preview ? preview.parts_total > balanceAmount : false

  return (
    <div className="space-y-6">
      <PageHeader
        title="Toplu SMS Gönder"
        description={<>Hedef kitleyi seçin, metni yazın; kime gideceğini ve kaç SMS tutacağını görüp gönderin.</>}
        actions={
          <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
            {account?.balance?.text && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
                <Sparkles className="h-3.5 w-3.5" />
                Bakiye: {account.balance.text}
              </span>
            )}
            <Link href="/admin/sms-gonderimleri" className={ghostButton}>
              SMS Gönderimleri
            </Link>
            <Link href="/admin/sms" className={ghostButton}>
              Şablonlar
            </Link>
          </div>
        }
      />

      <Notice message={message} />

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card className="space-y-5 border border-gray-100 p-6 shadow-sm lg:col-span-3">
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-900">1. Hedef kitle</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label label="Kime gönderilecek">
                <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
                  {(options?.kinds || [{ key: 'all_donors', label: '' }]).map((k) => (
                    <option key={k.key} value={k.key}>
                      {KIND_LABEL[k.key] || k.label}
                    </option>
                  ))}
                </select>
              </Label>
              {(kind === 'active_donors' || kind === 'lapsed_donors') && (
                <TextInput
                  label={kind === 'active_donors' ? 'Son kaç ayda' : 'Kaç aydır'}
                  type="number"
                  min={1}
                  max={120}
                  value={months}
                  onChange={setMonths}
                />
              )}
              {kind === 'tag' && (
                <Label label="Etiket" hint={options && !options.tags.length ? 'Bağışçılarda henüz etiket yok.' : undefined}>
                  <select className={inputClass} value={tag} onChange={(e) => setTag(e.target.value)}>
                    <option value="">Seçin</option>
                    {options?.tags.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Label>
              )}
              {kind === 'city' && (
                <Label label="Şehir">
                  <select className={inputClass} value={city} onChange={(e) => setCity(e.target.value)}>
                    <option value="">Seçin</option>
                    {options?.cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Label>
              )}
              {kind === 'campaign' && (
                <Label label="Kampanya">
                  <select className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                    <option value="">Seçin</option>
                    {options?.campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </Label>
              )}
              {kind === 'kurban' && <TextInput label="Kurban yılı" type="number" min={2000} max={2100} value={year} onChange={setYear} />}
            </div>
            {kind === 'numbers' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-600">
                    Numaralar {pastedNumbersCount > 0 && <span className="text-primary-700">({n(pastedNumbersCount)} satır algılandı)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => numFileRef.current?.click()}
                    className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Dosyadan yükle (.txt / .csv)
                  </button>
                  <input
                    ref={numFileRef}
                    type="file"
                    accept=".txt,.csv"
                    className="hidden"
                    onChange={(e) => {
                      importNumbersFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </div>
                <textarea
                  rows={4}
                  className={`${inputClass} resize-y font-mono`}
                  value={numbers}
                  onChange={(e) => setNumbers(e.target.value)}
                  placeholder={'0532 000 00 00\n0533 000 00 00'}
                />
                <p className="text-[11px] text-gray-400">Her satıra bir numara ya da virgülle ayırın. Tekrar edenler ve hatalı numaralar ayıklanır.</p>
              </div>
            )}
            {kind !== 'numbers' && (
              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMoreFilters((v) => !v)}
                    className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-gray-700 hover:text-primary-700"
                  >
                    <Filter className="h-3.5 w-3.5 text-primary-600" />
                    <span>Ek Segment Filtreleri</span>
                    {extraFilterCount > 0 && (
                      <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {extraFilterCount}
                      </span>
                    )}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
                  </button>
                  {extraFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterCity('')
                        setFilterTag('')
                        setFilterDonorType('')
                        setMinTotalLira('')
                        setExcludeRecentSmsDays('')
                      }}
                      className="cursor-pointer text-[11px] font-semibold text-rose-600 hover:underline"
                    >
                      Filtreleri temizle
                    </button>
                  )}
                </div>
                {showMoreFilters && (
                  <div className="mt-3 grid gap-3 border-t border-gray-200/80 pt-3 sm:grid-cols-2">
                    {kind !== 'city' && (
                      <Label label="Şehir ile daralt">
                        <select className={inputClass} value={filterCity} onChange={(e) => setFilterCity(e.target.value)}>
                          <option value="">Tüm şehirler</option>
                          {options?.cities.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </Label>
                    )}
                    {kind !== 'tag' && (
                      <Label label="Etiket ile daralt">
                        <select className={inputClass} value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
                          <option value="">Tüm etiketler</option>
                          {options?.tags.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </Label>
                    )}
                    <Label label="Bağışçı türü">
                      <select
                        className={inputClass}
                        value={filterDonorType}
                        onChange={(e) => setFilterDonorType(e.target.value as '' | 'individual' | 'corporate')}
                      >
                        <option value="">Bireysel + Kurumsal</option>
                        <option value="individual">Yalnızca Bireysel</option>
                        <option value="corporate">Yalnızca Kurumsal</option>
                      </select>
                    </Label>
                    <TextInput
                      label="En az toplam bağış (TL)"
                      type="number"
                      min={0}
                      placeholder="Örn. 1000"
                      value={minTotalLira}
                      onChange={setMinTotalLira}
                    />
                    <Label label="Anti-spam (son SMS hariç tut)" hint="Yakın zamanda SMS alan kişileri tekrar rahatsız etmemek için.">
                      <select
                        className={inputClass}
                        value={excludeRecentSmsDays}
                        onChange={(e) => setExcludeRecentSmsDays(e.target.value)}
                      >
                        <option value="">Hariç tutma yok</option>
                        <option value="3">Son 3 günde SMS alanları hariç tut</option>
                        <option value="7">Son 7 günde SMS alanları hariç tut</option>
                        <option value="14">Son 14 günde SMS alanları hariç tut</option>
                        <option value="30">Son 30 günde SMS alanları hariç tut</option>
                      </select>
                    </Label>
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  [false, 'Bilgilendirme', 'Duyuru, hatırlatma, teşekkür. İYS kontrolü yapılmaz.'],
                  [true, 'Ticari / tanıtım', 'Kampanya ve bağış çağrısı. Yalnızca izinlilere, İYS kontrolüyle gider.'],
                ] as [boolean, string, string][]
              ).map(([value, title, hint]) => (
                <label
                  key={title}
                  className={`cursor-pointer rounded-xl border p-3 text-xs transition ${
                    commercial === value ? 'border-primary-600 bg-primary-50/70' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <input type="radio" name="kind" checked={commercial === value} onChange={() => setCommercial(value)} /> {title}
                  </span>
                  <span className="mt-1 block text-gray-500">{hint}</span>
                </label>
              ))}
            </div>
            {!commercial && kind !== 'numbers' && (
              <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <input type="checkbox" className="mt-0.5" checked={withoutConsent} onChange={(e) => setWithoutConsent(e.target.checked)} />
                <span>
                  <strong>SMS izni olmayanlara da gönder.</strong> Yalnızca bilgilendirme içerikli iletilerde kullanın; tanıtım veya bağış çağrısı içeren ileti
                  izinsiz kişiye gönderilemez.
                </span>
              </label>
            )}
          </section>

          <section className="space-y-3 border-t pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-gray-900">2. Mesaj</h2>
              {canSaveTemplate && body.trim().length >= 5 && (
                <button
                  type="button"
                  onClick={() => {
                    setTplName(name.trim() || '')
                    setTplPromptOpen((v) => !v)
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-bold text-primary-800 transition hover:bg-primary-100"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  Şablon olarak kaydet
                </button>
              )}
            </div>

            {tplPromptOpen && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary-200 bg-primary-50/60 p-3">
                <input
                  type="text"
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  placeholder="Yeni şablon adı (ör. Ramazan Tebrik)"
                  maxLength={100}
                  className={`${inputClass} flex-1 bg-white`}
                />
                <button
                  type="button"
                  onClick={saveAsTemplate}
                  disabled={savingTpl || !tplName.trim()}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {savingTpl ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
                <button
                  type="button"
                  onClick={() => setTplPromptOpen(false)}
                  className="cursor-pointer rounded-xl px-2.5 py-2 text-xs font-semibold text-gray-600 hover:bg-white"
                >
                  Vazgeç
                </button>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Label label="Şablon (opsiyonel)">
                <select
                  className={inputClass}
                  value={templateId}
                  onChange={(e) => {
                    setTemplateId(e.target.value)
                    const t = templates.find((x) => x.id === e.target.value)
                    if (t) setBody(t.body)
                  }}
                >
                  <option value="">Şablonsuz</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Label>
              <TextInput label="Gönderim adı (opsiyonel)" maxLength={120} placeholder="Kandil mesajı" value={name} onChange={setName} />
            </div>
            <Label label="Mesaj metni">
              <textarea
                ref={bodyRef}
                rows={6}
                maxLength={1500}
                className={`${inputClass} resize-y`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </Label>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className={liveCounter.info.encoding === 'unicode' ? 'font-semibold text-amber-700' : 'text-gray-500'}>
                {liveCounter.text}
                {liveCounter.info.encoding === 'unicode' && ' (Türkçe karakterler nedeniyle 1 SMS 70 karakter sayılır)'}
              </span>
              {liveCounter.info.encoding === 'unicode' && (
                <button type="button" onClick={() => setBody((b) => toAsciiTr(b))} className="cursor-pointer font-semibold text-primary-700 hover:underline">
                  Türkçe karakterleri sadeleştir (ş→s)
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-gray-600">Kişiye özel:</span>
              {(meta?.variables || [])
                .filter((v) => PERSONAL.includes(v.key))
                .map((v) => (
                  <button
                    type="button"
                    key={v.key}
                    onClick={() => insert(v.key)}
                    title={v.label}
                    className="cursor-pointer rounded border border-primary-200 bg-primary-50 px-2 py-1 font-mono text-[11px] font-bold text-primary-800 hover:bg-primary-100"
                  >{`{${v.key}}`}</button>
                ))}
            </div>
          </section>

          <section className="space-y-2 border-t pt-5">
            <h2 className="text-sm font-bold text-gray-900">3. Zamanlama</h2>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} /> İleri tarihli gönder
            </label>
            {later && <input type="datetime-local" min={localNow()} className={`${inputClass} sm:w-72`} value={sendAt} onChange={(e) => setSendAt(e.target.value)} />}
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> Gece gönderme (21:00–08:00 arası sabah 08:00&apos;e
              ertelenir)
            </label>
          </section>
        </Card>

        <div className="space-y-4 lg:sticky lg:top-6 lg:col-span-2">
          <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
                <Smartphone className="h-4 w-4 text-primary-600" />
                Canlı Önizleme
              </h2>
              {preview && (
                <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-700">
                  {counter.info.parts} SMS / kişi
                </span>
              )}
            </div>

            {!ready ? (
              <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 p-4 text-xs leading-relaxed text-gray-500">
                Hedef kitleyi seçip metni yazdığınızda burada alıcı sayısı, toplam SMS kredisi ve telefon ekranındaki görünüm anlık hesaplanır.
              </p>
            ) : previewError ? (
              <p className="text-sm font-semibold text-red-600">{previewError}</p>
            ) : !preview ? (
              <p className="animate-pulse py-4 text-center text-sm text-gray-400">Hedef kitle ve SMS maliyeti hesaplanıyor…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="text-[10px] font-bold uppercase text-gray-500">Alıcı</div>
                    <div className="text-2xl font-black tabular-nums text-gray-900">{n(preview.recipients)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="text-[10px] font-bold uppercase text-gray-500">Toplam SMS</div>
                    <div className="text-2xl font-black tabular-nums text-gray-900">{n(preview.parts_total)}</div>
                  </div>
                </div>
                {balanceInsufficient && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs font-semibold text-amber-800">
                    Tahmini {n(preview.parts_total)} SMS, mevcut bakiyenizi ({account?.balance?.text}) aşıyor olabilir.
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  {preview.label}: {n(preview.stats.matched)} kayıt.
                  {skipped > 0 && (
                    <>
                      {' '}
                      Dışarıda kalan {n(skipped)}:{' '}
                      {[
                        preview.stats.no_consent && `${n(preview.stats.no_consent)} izinsiz`,
                        preview.stats.no_phone && `${n(preview.stats.no_phone)} telefonsuz`,
                        preview.stats.invalid && `${n(preview.stats.invalid)} hatalı numara`,
                        preview.stats.duplicate && `${n(preview.stats.duplicate)} tekrar eden`,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                      .
                    </>
                  )}
                </p>
                {preview.sample && (
                  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-slate-900 p-3 shadow-inner">
                    <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5 text-[11px] text-slate-300">
                      <span className="font-semibold text-white">{preview.sample.name || 'Alıcı Önizleme'}</span>
                      <span className="font-mono text-[10px] text-slate-400">{preview.sample.phone || '05XX...'}</span>
                    </div>
                    <div className="whitespace-pre-line rounded-2xl rounded-bl-sm bg-emerald-500/95 p-3 text-xs leading-relaxed font-medium text-white shadow-xs">
                      {preview.sample.body}
                    </div>
                    <p
                      className={`mt-2 text-[11px] font-semibold ${
                        counter.info.encoding === 'unicode' || counter.info.parts > 3 ? 'text-amber-300' : 'text-slate-400'
                      }`}
                    >
                      {counter.text}
                    </p>
                  </div>
                )}
                {preview.send_at && (
                  <p className="rounded-xl border border-sky-200 bg-sky-50 p-2.5 text-xs font-semibold text-sky-800">
                    {preview.moved_for_quiet_hours ? 'Gece saatine denk geldiği için ' : ''}
                    {when(preview.send_at)} tarihinde gönderilecek.
                  </p>
                )}
              </>
            )}

            <button
              type="button"
              onClick={send}
              disabled={!canSend || busy || !preview || !preview.recipients}
              className={`${primaryButton} flex w-full items-center justify-center gap-2`}
            >
              <Send className="h-4 w-4" />
              {busy ? 'Hazırlanıyor…' : preview?.send_at ? 'Gönderimi Zamanla' : 'Toplu SMS Gönder'}
            </button>

            {canSend && body.trim().length >= 2 && (
              <div className="border-t pt-3">
                <p className="mb-1.5 text-xs font-bold text-gray-600">Kendinize Test SMS&apos;i Gönderin</p>
                <div className="flex gap-2">
                  <input className={inputClass} placeholder="05XX XXX XX XX" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
                  <button type="button" onClick={sendTest} disabled={testing || !testPhone.trim()} className={`${ghostButton} shrink-0`}>
                    {testing ? '…' : 'Test Gönder'}
                  </button>
                </div>
              </div>
            )}
            {!canSend && <p className="text-xs text-gray-400">Toplu SMS göndermek için &quot;Bağışçı ve SMS yönetimi&quot; yetkisi gerekir.</p>}
          </Card>
        </div>
      </div>

      <Card className="space-y-3 border border-gray-100 p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-bold text-gray-900">Toplu gönderimler</h2>
          <div className="flex flex-wrap items-center gap-2">
            {testCount > 0 && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600">
                <input type="checkbox" checked={showTests} onChange={(e) => setShowTests(e.target.checked)} />
                Testleri göster ({testCount})
              </label>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
                placeholder="Gönderim ara..."
                className="w-48 rounded-xl border border-gray-200 bg-gray-50/70 py-1 pl-8 pr-7 text-xs font-medium text-gray-800 outline-none focus:border-primary-400 focus:bg-white"
              />
              {batchSearch && (
                <button
                  type="button"
                  onClick={() => setBatchSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Temizle"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {filteredBatches.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {batches.length === 0 ? 'Henüz toplu gönderim yapılmadı.' : 'Filtreye uygun gönderim bulunamadı.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Gönderim</Th>
                  <Th>Hedef kitle</Th>
                  <Th>Zaman</Th>
                  <Th>İlerleme</Th>
                  <Th>Durum</Th>
                  <Th />
                </Tr>
              </THead>
              <TBody>
                {filteredBatches.map((b) => (
                  <Tr key={b.id} className="align-top">
                    <Td className="max-w-xs">
                      <div className="font-bold text-gray-900">
                        {b.name}
                        {b.commercial && <span className="ml-2 rounded border px-1 text-[10px] text-gray-500">Ticari</span>}
                      </div>
                      <div className="line-clamp-2 text-gray-500" title={b.body}>
                        {b.body}
                      </div>
                    </Td>
                    <Td className="text-gray-600">{b.audience_label}</Td>
                    <Td className="whitespace-nowrap text-gray-500">
                      {when(b.send_after)}
                      <div className="text-[10px] text-gray-400">{b.created_by}</div>
                    </Td>
                    <Td>
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full bg-primary-600" style={{ width: `${b.total ? Math.round((b.sent / b.total) * 100) : 0}%` }} />
                      </div>
                      <div className="mt-1 tabular-nums text-gray-600">
                        {n(b.sent)} / {n(b.total)}
                        {b.failed > 0 && (
                          <Link
                            href={`/admin/sms-gonderimleri?status=failed&batch_id=${b.id}`}
                            className="ml-2 inline-flex items-center gap-0.5 font-bold text-red-600 hover:underline"
                            title="Hata detaylarını SMS Gönderimleri sayfasında inceleyin"
                          >
                            {n(b.failed)} başarısız
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold ${STATE[b.state][1]}`}>
                        {STATE[b.state][0]}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => reuseBatch(b)} className="cursor-pointer font-semibold text-primary-700 hover:underline">
                          Forma kopyala
                        </button>
                        {canSend && b.waiting > 0 && (
                          <button type="button" onClick={() => cancel(b)} className="cursor-pointer font-bold text-red-600">
                            Durdur
                          </button>
                        )}
                      </div>
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
