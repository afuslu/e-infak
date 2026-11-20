'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { BarChart3, BookmarkPlus, Check, CheckCircle2, ChevronDown, Edit3, ExternalLink, Filter, MousePointerClick, RotateCcw, Search, Send, Smartphone, Sparkles, TrendingUp, Upload, Users, X } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, useAdminAccess, can } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { SegmentInfo, SmsMeta, SmsTemplate, segmentSummary, updateSmsTemplateBody } from '../../../../lib/sms'
import { PageHeader, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'
import { SmsPhonePreview } from '../../../../components/admin/SmsPhonePreview'

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
  ab_sample?: { body: string; segments: SegmentInfo } | null
  send_at: string | null
  moved_for_quiet_hours: boolean
  label: string
  org_name?: string | null
}
interface Batch {
  id: string
  name: string
  body: string
  audience_label: string
  commercial: boolean
  total: number
  sent: number
  delivered?: number
  failed: number
  waiting: number
  cancelled: number
  state: 'sending' | 'scheduled' | 'done' | 'cancelled'
  send_after: string
  created_at: string
  created_by: string | null
  campaign_id?: string | null
  throttle_per_minute?: number | null
  ab_variant_body?: string | null
  ab_test_percent?: number | null
  clicks?: number
  donations_count?: number
  donations_cents?: number
  ab_stats?: Record<string, { total: number; delivered: number; clicks: number }> | null
}
interface SmsAccount {
  provider: string | null
  own_account: boolean
  balance: { text: string; amount: number | null; unit: string } | null
  org_name?: string | null
  sender?: string | null
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
const PERSONAL = ['ad_soyad', 'ad', 'kurum', 'kurum_telefon', 'iban', 'odeme_linki', 'ret_linki']
const money = (cents: number) =>
  (cents / 100).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' TL'
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
  const [campaignLinkId, setCampaignLinkId] = useState('')
  const [throttlePerMinute, setThrottlePerMinute] = useState('')
  const [abEnabled, setAbEnabled] = useState(false)
  const [abBody, setAbBody] = useState('')
  const [abPercent, setAbPercent] = useState('50')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testSampleName, setTestSampleName] = useState('')
  const [testing, setTesting] = useState(false)
  const [savingTpl, setSavingTpl] = useState(false)
  const [tplPromptOpen, setTplPromptOpen] = useState(false)
  const [tplName, setTplName] = useState('')
  const [showTests, setShowTests] = useState(false)
  const [batchSearch, setBatchSearch] = useState('')
  const [editBatch, setEditBatch] = useState<{ id: string; name: string; body: string; sendAt: string; quiet: boolean; throttle: string } | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [previewVariant, setPreviewVariant] = useState<'A' | 'B'>('A')
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const numFileRef = useRef<HTMLInputElement>(null)

  const loadBatches = () => adminGet<Batch[]>('/sms/batches').then((r) => setBatches(r.data)).catch(() => {})
  const loadTemplates = () =>
    adminGet<SmsTemplate[]>('/sms/templates')
      .then((r) => {
        const list = r.data.filter((t) => t.is_active && !t.event_key)
        setTemplates(list)
        const urlTpl = new URLSearchParams(window.location.search).get('template_id')
        if (urlTpl) {
          const found = list.find((t) => t.id === urlTpl)
          if (found) {
            setTemplateId(found.id)
            setBody((prev) => prev || found.body)
          }
        }
      })
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
    campaign_id: campaignLinkId || (kind === 'campaign' && campaignId ? campaignId : null),
    send_at: sendIso,
    quiet_hours: quiet,
    throttle_per_minute: throttlePerMinute ? Number(throttlePerMinute) : null,
    ab_variant_body: abEnabled && abBody.trim().length >= 2 ? abBody : null,
    ab_test_percent: abEnabled && abBody.trim().length >= 2 ? Number(abPercent) || 50 : null,
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
    campaignLinkId,
    abEnabled,
    abBody,
    abPercent,
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
      await adminSend('post', '/sms/batches/test', {
        phone,
        body,
        sample_name: testSampleName.trim() || null,
        campaign_id: campaignLinkId || (kind === 'campaign' && campaignId ? campaignId : null),
      })
      setMessage({ type: 'ok', text: `Test SMS'i ${phone} numarasına kuyruğa alındı.` })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Test SMS gönderilemedi') })
    } finally {
      setTesting(false)
    }
  }

  const retryFailed = async (b: Batch) => {
    if (!(await confirmDialog(`"${b.name}" gönderimindeki ${n(b.failed)} başarısız SMS tekrar kuyruğa alınsın mı?`))) return
    try {
      const res = await adminSend<{ retried: number }>('post', `/sms/batches/${b.id}/retry-failed`)
      setMessage({ type: 'ok', text: `${n(res.data.retried)} başarısız SMS tekrar kuyruğa alındı.` })
      loadBatches()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Tekrar gönderim başlatılamadı') })
    }
  }

  const openEditBatch = (b: Batch) => {
    const d = new Date(b.send_after)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    setEditBatch({
      id: b.id,
      name: b.name,
      body: b.body,
      sendAt: d.toISOString().slice(0, 16),
      quiet: true,
      throttle: b.throttle_per_minute ? String(b.throttle_per_minute) : '',
    })
  }

  const saveEditBatch = async () => {
    if (!editBatch || savingEdit) return
    setSavingEdit(true)
    setMessage(null)
    try {
      await adminSend('patch', `/sms/batches/${editBatch.id}`, {
        name: editBatch.name.trim() || null,
        body: editBatch.body,
        send_at: safeIso(editBatch.sendAt),
        quiet_hours: editBatch.quiet,
        throttle_per_minute: editBatch.throttle ? Number(editBatch.throttle) : null,
      })
      setMessage({ type: 'ok', text: 'Zamanlanmış gönderim güncellendi.' })
      setEditBatch(null)
      loadBatches()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Gönderim güncellenemedi') })
    } finally {
      setSavingEdit(false)
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

  const updateSelectedTemplate = async () => {
    const selected = templates.find((t) => t.id === templateId)
    if (!selected || body.trim().length < 2 || savingTpl) return
    setSavingTpl(true)
    setMessage(null)
    try {
      await updateSmsTemplateBody(selected, body)
      setMessage({ type: 'ok', text: `"${selected.name}" şablonu güncellendi.` })
      loadTemplates()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Şablon güncellenemedi') })
    } finally {
      setSavingTpl(false)
    }
  }

  const importNumbersFile = async (file?: File) => {
    if (!file) return
    const text = await file.text()
    const extracted = text
      .split(/[\r\n]+/)
      .map((s) => s.trim())
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

  const kpi = useMemo(() => {
    const real = batches.filter((b) => !b.name.startsWith('[TEST]') && b.state !== 'cancelled')
    const total = real.reduce((s, b) => s + b.total, 0)
    const delivered = real.reduce((s, b) => s + (b.delivered ?? 0), 0)
    const clicks = real.reduce((s, b) => s + (b.clicks ?? 0), 0)
    const donationsCount = real.reduce((s, b) => s + (b.donations_count ?? 0), 0)
    const donationsCents = real.reduce((s, b) => s + (b.donations_cents ?? 0), 0)
    const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0
    return { count: real.length, total, delivered, deliveryRate, clicks, donationsCount, donationsCents }
  }, [batches])

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

      {kpi.count > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-xs">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Toplam Gönderim</div>
              <div className="text-lg font-black tabular-nums text-gray-900">
                {n(kpi.total)} <span className="text-xs font-semibold text-gray-400">({kpi.count} kampanya)</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-xs">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">İletim Başarısı</div>
              <div className="text-lg font-black tabular-nums text-emerald-700">
                %{kpi.deliveryRate} <span className="text-xs font-semibold text-gray-400">({n(kpi.delivered)} iletildi)</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-xs">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <MousePointerClick className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Link Tıklama</div>
              <div className="text-lg font-black tabular-nums text-gray-900">{n(kpi.clicks)}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-xs">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">SMS Bağış ROI</div>
              <div className="text-lg font-black tabular-nums text-gray-900">
                {money(kpi.donationsCents)} <span className="text-xs font-semibold text-gray-400">({n(kpi.donationsCount)} bağış)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card className="space-y-6 border border-gray-100 p-6 shadow-sm lg:col-span-3">
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">1</span>
              <h2 className="text-sm font-bold text-gray-900">Hedef kitle</h2>
            </div>
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
                  placeholder={'0532 000 00 00, Ahmet Yılmaz\n0533 000 00 00, Ayşe Demir'}
                />
                <p className="text-[11px] text-gray-400">
                  Her satıra bir numara veya <code>numara, ad soyad</code> yazın. İsim eklerseniz <code>{'{ad_soyad}'}</code> ve{' '}
                  <code>{'{ad}'}</code> değişkenleri otomatik dolar.
                </p>
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
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">2</span>
                <h2 className="text-sm font-bold text-gray-900">Mesaj</h2>
              </div>
              {canSaveTemplate && body.trim().length >= 5 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {templateId && templates.some((t) => t.id === templateId) && (
                    <button
                      type="button"
                      disabled={savingTpl}
                      onClick={updateSelectedTemplate}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Seçili şablonu güncelle
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setTplName(name.trim() || '')
                      setTplPromptOpen((v) => !v)
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-bold text-primary-800 transition hover:bg-primary-100"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    Yeni şablon olarak kaydet
                  </button>
                </div>
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

            <div className="grid gap-3 sm:grid-cols-3">
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
              <Label label="Kampanya bağlantısı / ROI" hint="{odeme_linki} ve bağış dönüşümü takibi için.">
                <select className={inputClass} value={campaignLinkId} onChange={(e) => setCampaignLinkId(e.target.value)}>
                  <option value="">Genel bağış sitesi</option>
                  {options?.campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
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
              {commercial && !body.includes('{ret_linki}') && (
                <button
                  type="button"
                  onClick={() => setBody((b) => `${b.trimEnd()}\nSMS iptali: {ret_linki}`)}
                  className="cursor-pointer rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                >
                  + RET bağlantısı ekle
                </button>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
              <label className="flex cursor-pointer items-center justify-between gap-2 text-xs font-bold text-gray-700">
                <span>A/B Testi (İki farklı metin dene)</span>
                <input type="checkbox" checked={abEnabled} onChange={(e) => setAbEnabled(e.target.checked)} />
              </label>
              {abEnabled && (
                <div className="mt-3 space-y-2 border-t border-gray-200/80 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-600">B Varyantı Mesaj Metni</span>
                    <select className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs" value={abPercent} onChange={(e) => setAbPercent(e.target.value)}>
                      <option value="50">%50 A / %50 B</option>
                      <option value="30">%70 A / %30 B</option>
                      <option value="20">%80 A / %20 B</option>
                    </select>
                  </div>
                  <textarea
                    rows={4}
                    maxLength={1500}
                    className={`${inputClass} resize-y bg-white`}
                    placeholder="Alternatif mesaj metnini buraya yazın…"
                    value={abBody}
                    onChange={(e) => setAbBody(e.target.value)}
                  />
                </div>
              )}
            </div>
          </section>

          <section className="space-y-2 border-t pt-5">
            <div className="flex items-center gap-2.5 pb-1">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">3</span>
              <h2 className="text-sm font-bold text-gray-900">Zamanlama ve Hız</h2>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} /> İleri tarihli gönder
            </label>
            {later && <input type="datetime-local" min={localNow()} className={`${inputClass} sm:w-72`} value={sendAt} onChange={(e) => setSendAt(e.target.value)} />}
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> Gece gönderme (21:00–08:00 arası sabah 08:00&apos;e
              ertelenir)
            </label>
            <div className="pt-1 sm:w-72">
              <Label label="Gönderim hızı (opsiyonel)" hint="Büyük kitlelerde site/çağrı merkezi yoğunluğunu dengelemek için.">
                <select className={inputClass} value={throttlePerMinute} onChange={(e) => setThrottlePerMinute(e.target.value)}>
                  <option value="">Limitsiz (En hızlı)</option>
                  <option value="100">Dakikada 100 SMS</option>
                  <option value="250">Dakikada 250 SMS</option>
                  <option value="500">Dakikada 500 SMS</option>
                  <option value="1000">Dakikada 1.000 SMS</option>
                </select>
              </Label>
            </div>
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
                  {preview.max_parts > counter.info.parts
                    ? `${counter.info.parts}–${preview.max_parts} SMS / kişi`
                    : `${counter.info.parts} SMS / kişi`}
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
                  <SmsPhonePreview
                    senderTitle={account?.org_name || preview.org_name || 'Kurumunuz'}
                    senderSubtitle={account?.sender ? `SMS Başlığı: ${account.sender}` : 'SMS Başlığı'}
                    body={previewVariant === 'B' && preview.ab_sample ? preview.ab_sample.body : preview.sample.body}
                    counterText={counter.text}
                    counterWarn={counter.info.encoding === 'unicode' || counter.info.parts > 3}
                    variant={previewVariant}
                    onVariantChange={preview.ab_sample ? setPreviewVariant : undefined}
                  />
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
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-bold text-gray-600">Kendinize Test SMS&apos;i Gönderin</p>
                <input
                  className={inputClass}
                  placeholder="Örnek alıcı adı (opsiyonel, ör. Ahmet Yılmaz)"
                  value={testSampleName}
                  onChange={(e) => setTestSampleName(e.target.value)}
                />
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
                      <div className="mt-1 space-y-0.5 tabular-nums text-gray-600">
                        <div>
                          {n(b.sent)} / {n(b.total)}
                          {(b.delivered ?? 0) > 0 && (
                            <span className="ml-1.5 text-[11px] font-semibold text-emerald-700">
                              ({n(b.delivered || 0)} iletildi · %{b.total ? Math.round(((b.delivered || 0) / b.total) * 100) : 0})
                            </span>
                          )}
                        </div>
                        {((b.clicks ?? 0) > 0 || (b.donations_count ?? 0) > 0) && (
                          <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-sky-700">
                            {(b.clicks ?? 0) > 0 && <span>{n(b.clicks || 0)} tıklama</span>}
                            {(b.donations_count ?? 0) > 0 && (
                              <span className="text-emerald-700">
                                {n(b.donations_count || 0)} bağış ({money(b.donations_cents || 0)})
                              </span>
                            )}
                          </div>
                        )}
                        {b.ab_stats && (
                          <div className="text-[10px] text-indigo-700">
                            A: {b.ab_stats.A?.delivered || 0}/{b.ab_stats.A?.total || 0} ({b.ab_stats.A?.clicks || 0} tık) · B:{' '}
                            {b.ab_stats.B?.delivered || 0}/{b.ab_stats.B?.total || 0} ({b.ab_stats.B?.clicks || 0} tık)
                          </div>
                        )}
                        {b.failed > 0 && (
                          <Link
                            href={`/admin/sms-gonderimleri?status=failed&batch_id=${b.id}`}
                            className="inline-flex items-center gap-0.5 font-bold text-red-600 hover:underline"
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
                      <div className="flex flex-wrap justify-end gap-2">
                        {canSend && b.state === 'scheduled' && (
                          <button
                            type="button"
                            onClick={() => openEditBatch(b)}
                            className="inline-flex cursor-pointer items-center gap-1 font-semibold text-sky-700 hover:underline"
                          >
                            <Edit3 className="h-3 w-3" />
                            Düzenle
                          </button>
                        )}
                        {canSend && b.failed > 0 && (
                          <button
                            type="button"
                            onClick={() => retryFailed(b)}
                            className="inline-flex cursor-pointer items-center gap-1 font-semibold text-amber-700 hover:underline"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Başarısızları Tekrarla
                          </button>
                        )}
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

      {editBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg space-y-4 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Zamanlanmış Gönderimi Düzenle</h3>
              <button type="button" onClick={() => setEditBatch(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <TextInput label="Gönderim adı" maxLength={120} value={editBatch.name} onChange={(v) => setEditBatch({ ...editBatch, name: v })} />
            <Label label="Mesaj metni">
              <textarea
                rows={5}
                maxLength={1500}
                className={`${inputClass} resize-y`}
                value={editBatch.body}
                onChange={(e) => setEditBatch({ ...editBatch, body: e.target.value })}
              />
            </Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label label="Gönderim zamanı">
                <input
                  type="datetime-local"
                  min={localNow()}
                  className={inputClass}
                  value={editBatch.sendAt}
                  onChange={(e) => setEditBatch({ ...editBatch, sendAt: e.target.value })}
                />
              </Label>
              <Label label="Gönderim hızı">
                <select
                  className={inputClass}
                  value={editBatch.throttle}
                  onChange={(e) => setEditBatch({ ...editBatch, throttle: e.target.value })}
                >
                  <option value="">Limitsiz</option>
                  <option value="100">Dakikada 100 SMS</option>
                  <option value="250">Dakikada 250 SMS</option>
                  <option value="500">Dakikada 500 SMS</option>
                  <option value="1000">Dakikada 1.000 SMS</option>
                </select>
              </Label>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={editBatch.quiet} onChange={(e) => setEditBatch({ ...editBatch, quiet: e.target.checked })} />
              Gece gönderme (21:00–08:00 arası 08:00&apos;e ertelenir)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditBatch(null)} className={ghostButton}>
                Vazgeç
              </button>
              <button type="button" onClick={saveEditBatch} disabled={savingEdit || editBatch.body.trim().length < 2} className={primaryButton}>
                {savingEdit ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
