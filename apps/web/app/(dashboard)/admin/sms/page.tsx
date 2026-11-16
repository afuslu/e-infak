'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Edit2, Eye, EyeOff, RotateCcw, Search, Send, Sparkles, Trash2, X } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, useAdminAccess, v1Get, can } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { MODE_LABEL, SmsMeta, SmsTemplate, segmentSummary } from '../../../../lib/sms'
import { PageHeader, confirmDialog } from '../../../../components/admin/ui'
import { SmsPhonePreview } from '../../../../components/admin/SmsPhonePreview'

type Draft = {
  id: string | null
  name: string
  body: string
  event_key: string
  campaign_id: string
  auto_mode: SmsTemplate['auto_mode']
  is_active: boolean
}
type FilterKind = 'all' | 'event' | 'quick' | 'campaign'

const EMPTY: Draft = { id: null, name: '', body: '', event_key: '', campaign_id: '', auto_mode: 'manual', is_active: true }

// Shown in the preview so staff see a realistic message while writing.
const SAMPLE: Record<string, string> = {
  ad_soyad: 'Ahmet Yılmaz',
  ad: 'Ahmet',
  tutar: '1.000,00',
  para_birimi: 'TL',
  bagis_kalemi: 'Genel Bağış',
  makbuz_no: 'A-1234',
  tarih: new Date().toLocaleDateString('tr-TR'),
  vade: new Date().toLocaleDateString('tr-TR'),
  donem: '2026-11',
  kimin_adina: 'Fatma Yılmaz',
  kurban_no: 'K-17',
  portal: 'ornek.org/portal',
  kurum: 'Kurumunuz',
  kurum_unvan: 'Kurumunuzun Unvanı',
  kurum_telefon: '0212 000 00 00',
  iban: 'TR00 0000 0000 0000 0000 0000 00',
  odeme_linki: 'https://ornek.org/s/abc123',
  yonet_linki: 'https://ornek.org/duzenli-bagis/ornek',
  ret_linki: 'https://ornek.org/sms-iptal/ornek',
  gun: '15',
}
const TR_MAP: Record<string, string> = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' }
const toAsciiTr = (text: string) => text.replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => TR_MAP[ch] || ch)
const LIBRARY = [
  {
    name: 'Kandil / Bayram Tebriği',
    body: 'Sayın {ad_soyad}, mübarek gün ve gecenizi tebrik eder, hayırlara vesile olmasını dileriz.\n{kurum}',
  },
  {
    name: 'Ramazan Zekat / Fitre',
    body: 'Kıymetli {ad}, Ramazan-ı Şerif bereketiyle zekat ve fitrelerinizi ihtiyaç sahiplerine ulaştırıyoruz: {odeme_linki}\n{kurum}',
  },
  {
    name: 'Genel Kampanya Çağrısı',
    body: 'Sayın {ad_soyad}, desteklerinizle iyiliği büyütüyoruz. Katkı sağlamak için: {odeme_linki}\nSMS iptali: {ret_linki}\n{kurum}',
  },
]
const ALIASES: Record<string, string> = { donor_name: 'ad_soyad', amount_lira: 'tutar', campaign_name: 'bagis_kalemi' }
const fill = (body: string) => body.replace(/\{(\w+)\}/g, (all, name) => SAMPLE[ALIASES[name] || name] ?? all)
const hasLegacyAliases = (body: string) => /\{(donor_name|amount_lira|campaign_name)\}/.test(body)
const normalizeAliases = (body: string) => body.replace(/\{(\w+)\}/g, (all, name) => (ALIASES[name] ? `{${ALIASES[name]}}` : all))

function renderHighlightedBody(body: string) {
  const parts = body.split(/(\{\w+\})/g)
  return parts.map((part, idx) => {
    if (/^\{\w+\}$/.test(part)) {
      return (
        <span
          key={idx}
          className="mx-0.5 inline-block rounded border border-primary-200 bg-primary-50 px-1 py-0.2 font-mono text-[12px] font-semibold text-primary-800"
        >
          {part}
        </span>
      )
    }
    return <span key={idx}>{part}</span>
  })
}

export default function SmsTemplatesPage() {
  const { data: access } = useAdminAccess()
  const canEdit = can(access, 'sms.templates')
  const [templates, setTemplates] = useState<SmsTemplate[] | null>(null)
  const [meta, setMeta] = useState<SmsMeta | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([])
  const [search, setSearch] = useState('')
  const [filterKind, setFilterKind] = useState<FilterKind>('all')
  const [previewIds, setPreviewIds] = useState<Record<string, boolean>>({})
  const [testPhone, setTestPhone] = useState('')
  const [testing, setTesting] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const load = async () => {
    try {
      setTemplates((await adminGet<SmsTemplate[]>('/sms/templates')).data)
    } catch (err) {
      setTemplates([])
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Şablonlar yüklenemedi') })
    }
  }

  useEffect(() => {
    load()
    adminGet<SmsMeta>('/sms/meta').then((r) => setMeta(r.data)).catch(() => {})
    v1Get<{ items: { id: string; title: string }[] }>('/campaigns', { page_size: 100 })
      .then((r) => setCampaigns(r.data.items || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!draft) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDraft(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [draft])

  const edit = (t: SmsTemplate) =>
    setDraft({
      id: t.id,
      name: t.name,
      body: t.body,
      event_key: t.event_key || '',
      campaign_id: t.campaign_id || '',
      auto_mode: t.auto_mode,
      is_active: t.is_active,
    })

  const duplicate = (t: SmsTemplate) =>
    setDraft({
      id: null,
      name: `${t.name} (Kopya)`,
      body: t.body,
      event_key: '',
      campaign_id: '',
      auto_mode: 'manual',
      is_active: true,
    })

  const resetDefault = async (t: SmsTemplate) => {
    if (!(await confirmDialog(`"${t.name}" şablonunun metni yerleşik varsayılan metne sıfırlansın mı?`))) return
    try {
      await adminSend('post', `/sms/templates/${t.id}/reset`)
      setMessage({ type: 'ok', text: `"${t.name}" varsayılan metne sıfırlandı.` })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const sendTest = async () => {
    if (!draft || !testPhone.trim() || draft.body.trim().length < 2 || testing) return
    setTesting(true)
    setMessage(null)
    try {
      await adminSend('post', '/sms/batches/test', {
        phone: testPhone.trim(),
        body: draft.body,
        campaign_id: draft.campaign_id || null,
        variables: SAMPLE,
      })
      setMessage({ type: 'ok', text: `Test SMS'i ${testPhone.trim()} numarasına kuyruğa alındı.` })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Test SMS gönderilemedi') })
    } finally {
      setTesting(false)
    }
  }

  const insert = (key: string) => {
    if (!draft) return
    const el = bodyRef.current
    const at = el ? el.selectionStart : draft.body.length
    const end = el ? el.selectionEnd : draft.body.length
    setDraft({ ...draft, body: `${draft.body.slice(0, at)}{${key}}${draft.body.slice(end)}` })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + key.length + 2, at + key.length + 2)
    })
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft) return
    setSaving(true)
    try {
      const body = {
        name: draft.name,
        body: draft.body,
        event_key: draft.event_key || null,
        campaign_id: draft.event_key ? null : draft.campaign_id || null,
        auto_mode: draft.auto_mode,
        is_active: draft.is_active,
      }
      if (draft.id) await adminSend('put', `/sms/templates/${draft.id}`, body)
      else await adminSend('post', '/sms/templates', body)
      setMessage({ type: 'ok', text: 'Şablon kaydedildi' })
      setDraft(null)
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Şablon kaydedilemedi') })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (t: SmsTemplate) => {
    if (!(await confirmDialog(`"${t.name}" şablonu silinsin mi?${t.event_key ? ' Bu olay için yerleşik varsayılan metin kullanılacak.' : ''}`))) return
    try {
      await adminSend('delete', `/sms/templates/${t.id}`)
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const setMode = async (t: SmsTemplate, auto_mode: SmsTemplate['auto_mode']) => {
    try {
      await adminSend('put', `/sms/templates/${t.id}`, {
        name: t.name,
        body: t.body,
        event_key: t.event_key,
        campaign_id: t.campaign_id,
        auto_mode,
        is_active: t.is_active,
      })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const toggleActive = async (t: SmsTemplate) => {
    try {
      await adminSend('put', `/sms/templates/${t.id}`, {
        name: t.name,
        body: t.body,
        event_key: t.event_key,
        campaign_id: t.campaign_id,
        auto_mode: t.auto_mode,
        is_active: !t.is_active,
      })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const counts = useMemo(() => {
    const list = templates || []
    return {
      all: list.length,
      event: list.filter((t) => Boolean(t.event_key)).length,
      quick: list.filter((t) => !t.event_key && !t.campaign_id).length,
      campaign: list.filter((t) => !t.event_key && Boolean(t.campaign_id)).length,
    }
  }, [templates])

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (templates || []).filter((t) => {
      if (filterKind === 'event' && !t.event_key) return false
      if (filterKind === 'quick' && (t.event_key || t.campaign_id)) return false
      if (filterKind === 'campaign' && (t.event_key || !t.campaign_id)) return false
      if (q) {
        const hay = `${t.name} ${t.body} ${t.event_label || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [templates, filterKind, search])

  const usedEvents = new Set((templates || []).filter((t) => t.id !== draft?.id).map((t) => t.event_key).filter(Boolean))
  const draftCount = draft ? segmentSummary(fill(draft.body)) : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS Şablonları"
        description={<>Hızlı SMS penceresinde seçilen ve olaylarda otomatik giden metinler. Değişkenler gönderim anında doldurulur.</>}
        actions={
          <div className="flex shrink-0 gap-2 whitespace-nowrap">
            <Link href="/admin/broadcast" className={`${ghostButton} flex items-center gap-1.5`}>
              <Send className="h-3.5 w-3.5" />
              Toplu SMS Gönder
            </Link>
            <Link href="/admin/sms-gonderimleri" className={`${ghostButton} flex items-center`}>
              SMS Gönderimleri
            </Link>
            {canEdit && (
              <button onClick={() => setDraft({ ...EMPTY })} className={primaryButton}>
                + Yeni Şablon
              </button>
            )}
          </div>
        }
      />

      <Notice message={message} />

      {/* Filtre & Arama Çubuğu */}
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { key: 'all', label: 'Tümü', count: counts.all },
              { key: 'event', label: 'Otomatik Olaylar', count: counts.event },
              { key: 'quick', label: 'Hızlı SMS', count: counts.quick },
              { key: 'campaign', label: 'Kampanya', count: counts.campaign },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterKind(tab.key)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                filterKind === tab.key
                  ? 'bg-primary-600 text-white shadow-xs'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  filterKind === tab.key ? 'bg-white/20 text-white' : 'bg-gray-200/80 text-gray-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Şablon veya metin ara..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50/70 py-1.5 pl-9 pr-8 text-xs font-medium text-gray-800 outline-none transition focus:border-primary-400 focus:bg-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Aramayı temizle"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Şablon Kartları */}
      {!templates ? (
        <p className="animate-pulse py-10 text-center text-sm text-gray-400">Yükleniyor…</p>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-500">
          Seçilen filtreye uygun SMS şablonu bulunamadı.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredTemplates.map((t) => {
            const isPreview = Boolean(previewIds[t.id])
            const displayBody = isPreview ? fill(t.body) : t.body
            const summaryText = segmentSummary(fill(t.body)).text
            return (
              <Card
                key={t.id}
                className={`flex flex-col justify-between gap-3 border border-gray-100 p-5 shadow-sm transition hover:border-gray-200 ${
                  t.is_active ? '' : 'opacity-65'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-gray-900">{t.name}</h3>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-bold">
                      {t.campaign_id && (
                        <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-800">
                          Kalem: {campaigns.find((c) => c.id === t.campaign_id)?.title || 'Kampanya'}
                        </span>
                      )}
                      {t.event_label ? (
                        <span className="rounded-md border border-primary-200 bg-primary-50 px-2 py-0.5 text-primary-800">
                          Olay: {t.event_label}
                        </span>
                      ) : (
                        <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-600">
                          Hızlı SMS şablonu
                        </span>
                      )}
                      {!t.is_active && (
                        <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">
                          Kullanım dışı
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewIds((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
                      title={isPreview ? 'Ham şablonu göster' : 'Örnek değerlerle önizle'}
                      className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                        isPreview
                          ? 'border-primary-200 bg-primary-50 text-primary-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {isPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">{isPreview ? 'Şablon' : 'Önizle'}</span>
                    </button>
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleActive(t)}
                          title={t.is_active ? 'Kullanım dışı bırak' : 'Kullanıma al'}
                          className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                            t.is_active
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          <Check className="h-3 w-3" />
                          <span className="hidden sm:inline">{t.is_active ? 'Aktif' : 'Pasif'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicate(t)}
                          title="Şablonu Kopyala"
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-50"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        {t.has_default && (
                          <button
                            type="button"
                            onClick={() => resetDefault(t)}
                            title="Varsayılan Metne Sıfırla"
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => edit(t)}
                          title="Düzenle"
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-bold text-primary-700 transition hover:bg-primary-50"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(t)}
                          title="Sil"
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-bold text-red-600 transition hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div
                  className={`flex-1 whitespace-pre-line rounded-xl p-3.5 text-sm leading-relaxed ${
                    isPreview ? 'border border-primary-100 bg-primary-50/40 text-gray-800' : 'bg-gray-50 text-gray-700'
                  }`}
                >
                  {isPreview ? displayBody : renderHighlightedBody(displayBody)}
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2.5 text-xs text-gray-500">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{summaryText}</span>
                    {t.stats && t.stats.sent > 0 && (
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        {t.stats.sent.toLocaleString('tr-TR')} gönderim · %{Math.round((t.stats.delivered / t.stats.sent) * 100)} iletildi
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!t.event_key && t.is_active && (
                      <Link
                        href={`/admin/broadcast?template_id=${t.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-bold text-primary-800 hover:bg-primary-100"
                      >
                        <Send className="h-3 w-3" />
                        Toplu SMS&apos;te Kullan
                      </Link>
                    )}
                    {t.event_key && (
                      <select
                        disabled={!canEdit}
                        value={t.auto_mode}
                        onChange={(e) => setMode(t, e.target.value as SmsTemplate['auto_mode'])}
                        className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-bold text-gray-700"
                      >
                        {Object.entries(MODE_LABEL).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Düzenleme / Yeni Şablon Modalı */}
      {draft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setDraft(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{draft.id ? 'SMS Şablonunu Düzenle' : 'Yeni SMS Şablonu'}</h2>
                <p className="text-xs text-gray-500">Değişkenler gönderim anında gerçek bağış/bağışçı verileriyle doldurulur.</p>
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="cursor-pointer rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={save} className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3">
                {!draft.id && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-2.5">
                    <div className="mb-1.5 text-[11px] font-bold text-gray-500">Hazır Şablondan Başla</div>
                    <div className="flex flex-wrap gap-1.5">
                      {LIBRARY.map((item) => (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => setDraft({ ...draft, name: item.name, body: item.body })}
                          className="cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:border-primary-300 hover:bg-primary-50"
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <TextInput
                  label="Şablon adı"
                  required
                  maxLength={100}
                  value={draft.name}
                  onChange={(v) => setDraft({ ...draft, name: v })}
                  placeholder="Vacip Kurban Hisse"
                />
                <Label label="Mesaj metni">
                  <textarea
                    ref={bodyRef}
                    required
                    rows={7}
                    maxLength={1500}
                    className={`${inputClass} resize-y`}
                    value={draft.body}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  />
                </Label>
                {draftCount?.info.encoding === 'unicode' && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                    <span>Türkçe/özel karakterler SMS boyunu 70 karaktere düşürüyor.</span>
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, body: toAsciiTr(draft.body) })}
                      className="shrink-0 cursor-pointer font-bold text-primary-700 hover:underline"
                    >
                      Sadeleştir (ş→s)
                    </button>
                  </div>
                )}
                {hasLegacyAliases(draft.body) && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span>Metinde eski İngilizce değişkenler (`donor_name`, `amount_lira` vb.) bulunuyor.</span>
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, body: normalizeAliases(draft.body) })}
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700"
                    >
                      <Sparkles className="h-3 w-3" />
                      Türkçeye Çevir
                    </button>
                  </div>
                )}
                <div>
                  <div className="mb-1 text-xs font-bold text-gray-600">Değişken ekle</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(meta?.variables || []).map((v) => (
                      <button
                        type="button"
                        key={v.key}
                        onClick={() => insert(v.key)}
                        title={v.label}
                        className="cursor-pointer rounded border border-primary-200 bg-primary-50 px-2 py-1 font-mono text-[11px] font-bold text-primary-800 hover:bg-primary-100"
                      >{`{${v.key}}`}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label
                  label="Bağlı olay"
                  hint="Olaya bağlı şablon, o olay gerçekleştiğinde kullanılır. Olaysız şablonlar yalnızca hızlı SMS penceresinde seçilir."
                >
                  <select
                    className={inputClass}
                    value={draft.event_key}
                    onChange={(e) =>
                      setDraft({ ...draft, event_key: e.target.value, auto_mode: e.target.value ? draft.auto_mode : 'manual' })
                    }
                  >
                    <option value="">Olaya bağlı değil</option>
                    {(meta?.events || []).map((ev) => (
                      <option key={ev.key} value={ev.key} disabled={usedEvents.has(ev.key)}>
                        {ev.label}
                        {usedEvents.has(ev.key) ? ' (başka şablona bağlı)' : ''}
                      </option>
                    ))}
                  </select>
                </Label>
                {!draft.event_key && (
                  <Label
                    label="Bağış kalemi / kampanya"
                    hint="Seçilirse bu kampanyanın makbuz ve havale SMS'lerinde genel metin yerine bu şablon kullanılır."
                  >
                    <select
                      className={inputClass}
                      value={draft.campaign_id}
                      onChange={(e) => setDraft({ ...draft, campaign_id: e.target.value })}
                    >
                      <option value="">Kampanyaya bağlı değil</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </Label>
                )}
                {draft.event_key && (
                  <Label label="Olay gerçekleşince">
                    <select
                      className={inputClass}
                      value={draft.auto_mode}
                      onChange={(e) => setDraft({ ...draft, auto_mode: e.target.value as Draft['auto_mode'] })}
                    >
                      {Object.entries(MODE_LABEL).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Label>
                )}
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={draft.is_active}
                    onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                  />{' '}
                  Kullanımda
                </label>
                <div>
                  <div className="mb-2 text-xs font-bold text-gray-600">Telefon Önizlemesi</div>
                  <SmsPhonePreview
                    senderTitle="Kurumunuz"
                    body={fill(draft.body) || '…'}
                    counterText={draftCount ? `${draftCount.text} (örnek değerlerle)` : undefined}
                    counterWarn={Boolean(draftCount && (draftCount.info.encoding === 'unicode' || draftCount.info.parts > 3))}
                    compact
                  />
                </div>
                {draft.body.trim().length >= 2 && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="mb-1.5 text-[11px] font-bold text-gray-600">Kendinize Test SMS&apos;i Gönderin</p>
                    <div className="flex gap-2">
                      <input
                        className={`${inputClass} bg-white`}
                        placeholder="05XX XXX XX XX"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={sendTest}
                        disabled={testing || !testPhone.trim()}
                        className={`${ghostButton} shrink-0 bg-white`}
                      >
                        {testing ? '…' : 'Test Gönder'}
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setDraft(null)} className={ghostButton}>
                    Vazgeç
                  </button>
                  <button type="submit" disabled={saving} className={primaryButton}>
                    {saving ? 'Kaydediliyor…' : 'Kaydet'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
