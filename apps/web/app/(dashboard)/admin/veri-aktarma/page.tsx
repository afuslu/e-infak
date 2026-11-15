'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { AlertTriangle, ArrowRight, CheckCircle2, Download, FileSpreadsheet, History, RefreshCw, Sparkles, UploadCloud, Users, X } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminApiBase, adminAuthHeaders, adminGet, adminSend, apiErrorMessage, formatMoney } from '../../../../lib/admin-access'
import { GlobalStatCard, MuhasebeStatModal, type MuhasebeStatModalProps } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { PageHeader, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'

type Kind = 'donors' | 'donations' | 'members'

interface Intro {
  headers: string[]
  row_count: number
  fields: Record<string, string>
  sample: (string | null)[][]
  suggested_mapping: Record<string, number>
  sheet_names?: string[]
  active_sheet?: string | null
}

interface Result {
  row_count: number
  error_count: number
  errors: { row: number; message: string }[]
  preview: Record<string, unknown>[]
  committed: boolean
  created?: number
  matched?: number
  imported?: number
  already_imported?: number
  new_donors?: number
  totals?: { currency: string; total_cents: number }[]
}

interface HistoryRow {
  id: string
  action: 'bagisci_aktar' | 'makbuz_aktar' | 'uye_aktar'
  details: { file?: string; created?: number; matched?: number; imported?: number; skipped?: number; errors?: number }
  user_name: string | null
  created_at: string
}

const KINDS: Record<Kind, { title: string; hint: string; targetHref: string; targetLabel: string }> = {
  donors: {
    title: 'Bağışçı listesi',
    hint: 'Telefon, e-posta veya TC ile eşleşen kayıtların yalnız boş alanları doldurulur; yeni kişiler eklenir.',
    targetHref: '/admin/bagiscilar',
    targetLabel: 'Bağışçılara Git',
  },
  donations: {
    title: 'Geçmiş makbuzlar',
    hint: 'Her satır onaylı bir bağış olur (makbuz e-postası gönderilmez). Aynı dosyayı tekrar yüklemek çift kayıt açmaz.',
    targetHref: '/admin/bagislar',
    targetLabel: 'Bağışlara Git',
  },
  members: {
    title: 'Üye listesi',
    hint: 'Dernek üyelerini üye no, tür, durum, kayıt tarihi ve özel aidat bilgileriyle toplu içeri alın.',
    targetHref: '/admin/uyeler',
    targetLabel: 'Üyelere Git',
  },
}

const PREVIEW_LABELS: Record<string, string> = {
  row: 'Satır',
  action: 'İşlem',
  member_no: 'Üye No',
  member_type: 'Tür',
  status: 'Durum',
  name: 'Ad Soyad',
  donor: 'Bağışçı',
  donor_action: 'Bağışçı Durumu',
  phone: 'Telefon',
  email: 'E-posta',
  tags: 'Etiketler',
  amount_cents: 'Tutar',
  currency: 'Birim',
  paid_on: 'Bağış Tarihi',
  campaign: 'Kampanya',
  payment_method: 'Ödeme Yöntemi',
  official_receipt_no: 'Makbuz No',
}

const ACTION_LABEL: Record<string, { label: string; cls: string }> = {
  bagisci_aktar: { label: 'Bağışçı Aktarımı', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  makbuz_aktar: { label: 'Makbuz Aktarımı', cls: 'border-sky-200 bg-sky-50 text-sky-700' },
  uye_aktar: { label: 'Üye Aktarımı', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = '\uFEFF' + [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function DataImportPage() {
  const [kind, setKind] = useState<Kind>('donors')
  const [file, setFile] = useState<File | null>(null)
  const [sheetName, setSheetName] = useState<string>('')
  const [intro, setIntro] = useState<Intro | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([])
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [defaultCampaign, setDefaultCampaign] = useState('')
  const [extraTag, setExtraTag] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [statModal, setStatModal] = useState<Omit<MuhasebeStatModalProps, 'isOpen' | 'onClose'> | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadHistory = () =>
    adminGet<HistoryRow[]>('/import-history')
      .then((r) => setHistory(r.data))
      .catch(() => {})

  useEffect(() => {
    axios
      .get(`${adminApiBase()}/api/v1/campaigns`, { headers: adminAuthHeaders(), params: { page_size: 100 } })
      .then((r) => setCampaigns(r.data.items || []))
      .catch(() => {})
    loadHistory()
  }, [])

  const reset = (k: Kind = kind) => {
    setKind(k)
    setFile(null)
    setSheetName('')
    setIntro(null)
    setResult(null)
    setMapping({})
    setMessage(null)
  }

  const downloadXlsxTemplate = async () => {
    try {
      const res = await axios.get(`${adminApiBase()}/api/v1/admin-features/import-template/${kind}`, {
        headers: adminAuthHeaders(),
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = kind === 'donors' ? 'bagisci-sablonu.xlsx' : kind === 'donations' ? 'makbuz-sablonu.xlsx' : 'uye-sablonu.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Şablon indirilemedi') })
    }
  }

  const send = async (step: 'intro' | 'check' | 'commit', f: File | null = file, targetSheet: string = sheetName) => {
    if (!f) return
    const data = new FormData()
    data.append('file', f)
    if (targetSheet) data.append('sheet_name', targetSheet)
    if (step !== 'intro') {
      data.append(
        'mapping',
        JSON.stringify(
          Object.fromEntries(
            Object.entries(mapping)
              .filter(([, v]) => v !== '')
              .map(([k, v]) => [k, Number(v)])
          )
        )
      )
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
        setSheetName(res.data.active_sheet || '')
        setMapping(Object.fromEntries(Object.entries(res.data.suggested_mapping).map(([k, v]) => [k, String(v)])))
        setResult(null)
      } else {
        setResult(res.data)
        if (step === 'commit') {
          setMessage({
            type: 'ok',
            text:
              kind === 'donors'
                ? `${res.data.created} yeni bağışçı eklendi, ${res.data.matched} kayıt güncellendi`
                : kind === 'members'
                ? `${res.data.created} yeni üye eklendi, ${res.data.matched} mevcut üye eşleşti`
                : `${res.data.imported} makbuz aktarıldı${res.data.already_imported ? `, ${res.data.already_imported} satır daha önce aktarılmıştı` : ''}`,
          })
          loadHistory()
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Dosya işlenemedi') })
    } finally {
      setBusy(false)
    }
  }

  const handleSelectFile = (f: File | null) => {
    if (!f) return
    setFile(f)
    setSheetName('')
    setIntro(null)
    setResult(null)
    send('intro', f, '')
  }

  const used = new Set(Object.values(mapping).filter(Boolean))
  const mappedCount = Object.values(mapping).filter(Boolean).length
  const hasNameMapping = Boolean(mapping.full_name || mapping.first_name || mapping.company_name)
  const hasAmountMapping = kind !== 'donations' || Boolean(mapping.amount)
  const canValidate = hasNameMapping && hasAmountMapping && !busy

  const currentStep = result?.committed ? 4 : result ? 3 : intro ? 2 : 1
  const steps = ['1. Dosya Seç', '2. Sütun Eşle', '3. Doğrula', '4. Aktar']

  return (
    <div className="space-y-6">
      <PageHeader
        title="Excel'den Aktarım"
        description={<>XLSX veya CSV dosyasını yükleyin, sütunları eşleyin, önce doğrulayın sonra aktarın. En fazla 5.000 satır.</>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadXlsxTemplate}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5 text-primary-600" /> Örnek Şablon İndir (.xlsx)
            </button>
            <Link
              href={KINDS[kind].targetHref}
              className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-50"
            >
              {KINDS[kind].targetLabel} →
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-1">
        <div className="flex gap-1 text-sm font-semibold">
          {(Object.keys(KINDS) as Kind[]).map((k) => (
            <button
              key={k}
              onClick={() => reset(k)}
              className={`-mb-1 cursor-pointer border-b-2 px-3 py-2 transition ${
                kind === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {KINDS[k].title}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {steps.map((label, idx) => {
            const stepNum = idx + 1
            const active = currentStep === stepNum
            const done = currentStep > stepNum
            return (
              <span
                key={label}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${
                  active
                    ? 'bg-primary-600 text-white'
                    : done
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {done && <CheckCircle2 className="h-3 w-3" />}
                {label}
              </span>
            )
          })}
        </div>
      </div>

      <Notice message={message} />

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] || null
          e.target.value = ''
          handleSelectFile(f)
        }}
      />

      {!file ? (
        <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
          <p className="text-sm text-gray-600">{KINDS[kind].hint}</p>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleSelectFile(e.dataTransfer.files?.[0] || null) }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition ${
              dragging ? 'border-primary-500 bg-primary-50/60' : 'border-gray-200 bg-gray-50/50 hover:border-primary-300 hover:bg-gray-50'
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
              <UploadCloud className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold text-gray-800">Dosyayı buraya sürükleyin veya seçmek için tıklayın</p>
            <p className="text-xs text-gray-400">Desteklenen biçimler: .xlsx, .csv (UTF-8 / Windows-1254, maks. 10 MB)</p>
            {busy && <span className="mt-1 text-xs font-semibold text-primary-600">Dosya okunuyor…</span>}
          </div>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50/40 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{file.name}</p>
              <p className="text-xs text-gray-500">
                {(file.size / 1024).toFixed(1)} KB
                {intro ? ` · ${intro.row_count.toLocaleString('tr-TR')} satır · ${intro.headers.length} sütun` : ''}
                {busy ? ' · İşleniyor…' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => fileInputRef.current?.click()} className={ghostButton}>
              <RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Dosya Değiştir
            </button>
            <button type="button" onClick={() => reset(kind)} className="rounded-xl p-2 text-gray-400 hover:bg-white hover:text-gray-700" title="Temizle">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {intro && (
        <Card className="space-y-5 border border-gray-100 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-900">Sütunları Eşleştirin</h2>
              <p className="text-xs text-gray-500">
                <span className="font-semibold text-emerald-700">{mappedCount} alan eşlendi</span> · Zorunlu:{' '}
                <span className="font-semibold text-gray-700">
                  Ad / Ad Soyad{kind === 'donors' ? ' / Kurum Adı' : kind === 'donations' ? ' ve Tutar' : ''}
                </span>
              </p>
            </div>
            {intro.sheet_names && intro.sheet_names.length > 1 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-gray-600">Excel Sayfası:</span>
                <select
                  aria-label="Excel sayfası"
                  className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium outline-none focus:border-primary-500"
                  value={sheetName}
                  onChange={(e) => {
                    const next = e.target.value
                    setSheetName(next)
                    send('intro', file, next)
                  }}
                >
                  {intro.sheet_names.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(intro.fields).map(([field, label]) => {
              const isReq = (field === 'amount' && kind === 'donations')
              const isMapped = mapping[field] !== undefined && mapping[field] !== ''
              return (
                <div
                  key={field}
                  className={`rounded-xl border p-3 transition ${
                    isMapped ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-gray-700">
                      {label}
                      {isReq && <span className="ml-1 text-rose-600">*</span>}
                    </span>
                    {isMapped && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                  </div>
                  <select
                    className={inputClass}
                    value={mapping[field] ?? ''}
                    onChange={(e) => {
                      setMapping({ ...mapping, [field]: e.target.value })
                      setResult(null)
                    }}
                  >
                    <option value="">— kullanma —</option>
                    {intro.headers.map((h, i) => (
                      <option key={i} value={String(i)} disabled={used.has(String(i)) && mapping[field] !== String(i)}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>

          {kind === 'donors' && (
            <div className="w-72">
              <TextInput
                label="Tüm satırlara eklenecek grup / etiket (isteğe bağlı)"
                value={extraTag}
                onChange={(v) => { setExtraTag(v); setResult(null) }}
                placeholder="ör. 2026 Ramazan"
              />
            </div>
          )}

          {kind === 'donations' && (
            <div className="w-80">
              <Label label="Varsayılan kampanya" hint="Kampanya sütunu boş ya da eşleşmeyen satırlar buraya yazılır">
                <select
                  className={inputClass}
                  value={defaultCampaign}
                  onChange={(e) => { setDefaultCampaign(e.target.value); setResult(null) }}
                >
                  <option value="">—</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </Label>
            </div>
          )}

          <div className="overflow-x-auto">
            <p className="mb-1.5 text-xs font-bold text-gray-500">Dosyadaki İlk Satırlar</p>
            <Table>
              <THead>
                <Tr>
                  {intro.headers.map((h, i) => <Th key={i} className="whitespace-nowrap">{h}</Th>)}
                </Tr>
              </THead>
              <TBody>
                {intro.sample.map((r, i) => (
                  <Tr key={i} className="border-t">
                    {intro.headers.map((_, j) => <Td key={j} className="whitespace-nowrap text-xs">{r[j] ?? ''}</Td>)}
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>

          {!canValidate && !busy && (
            <p className="text-xs font-medium text-amber-700">
              Devam etmek için en az bir isim/kurum sütunu{kind === 'donations' ? ' ve Tutar sütunu' : ''} eşleyin.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button className={ghostButton} disabled={!canValidate} onClick={() => send('check')}>
              3. Doğrula (Önizleme)
            </button>
            {result && !result.committed && result.row_count > result.error_count && (
              <button
                className={primaryButton}
                disabled={busy}
                onClick={async () =>
                  (await confirmDialog({ title: 'Geçerli satırlar aktarılsın mı?', danger: false })) && send('commit')
                }
              >
                4. Veritabanına Aktar
              </button>
            )}
          </div>
        </Card>
      )}

      {result && (
        <Card className="space-y-5 border border-gray-100 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {result.committed ? 'Aktarım Tamamlandı' : 'Doğrulama Sonucu (Henüz Kaydedilmedi)'}
              </h2>
              {kind === 'donations' && !!result.totals?.length && (
                <p className="mt-0.5 text-xs text-gray-500">
                  Toplam Tutar: <strong className="text-gray-800">{result.totals.map((t) => formatMoney(t.total_cents, t.currency)).join(' · ')}</strong>
                  {result.already_imported ? ` · ${result.already_imported} satır daha önce aktarılmış, atlandı` : ''}
                </p>
              )}
            </div>
            {result.committed && (
              <div className="flex flex-wrap gap-2">
                <Link href={KINDS[kind].targetHref} className={primaryButton}>
                  {KINDS[kind].targetLabel} <ArrowRight className="ml-1 inline h-4 w-4" />
                </Link>
                <button type="button" className={ghostButton} onClick={() => reset()}>
                  Yeni Dosya Aktar
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <GlobalStatCard
              title="Toplam Satır"
              value={result.row_count.toLocaleString('tr-TR')}
              gradient="from-slate-600 to-slate-700"
              icon={<FileSpreadsheet className="h-5 w-5" />}
              onClick={() => setStatModal({
                title: 'Aktarım Özeti',
                subtitle: `Toplam ${result.row_count.toLocaleString('tr-TR')} satır işlendi`,
                items: [
                  { label: 'Toplam Satır', value: result.row_count.toLocaleString('tr-TR'), color: 'blue' },
                  { label: kind === 'donations' ? 'Aktarılan Makbuz' : kind === 'members' ? 'Yeni Üye' : 'Yeni Bağışçı', value: String(kind === 'donations' ? (result.imported ?? 0) : (result.created ?? 0)), color: 'emerald' },
                  { label: kind === 'donations' ? 'Yeni Bağışçı' : 'Mevcutla Eşleşen', value: String(kind === 'donations' ? (result.new_donors ?? 0) : (result.matched ?? 0)), color: 'indigo' },
                  { label: 'Hatalı Satır', value: String(result.error_count), color: result.error_count > 0 ? 'rose' : 'emerald' },
                ],
              })}
            />
            <GlobalStatCard
              title={kind === 'donations' ? 'Aktarılan Makbuz' : kind === 'members' ? 'Yeni Üye' : 'Yeni Bağışçı'}
              value={String(kind === 'donations' ? (result.imported ?? 0) : (result.created ?? 0))}
              gradient="from-emerald-600 to-teal-700"
              icon={<Sparkles className="h-5 w-5" />}
              onClick={() => setStatModal({
                title: kind === 'donations' ? 'Aktarılan Makbuzlar' : kind === 'members' ? 'Oluşturulan Üyeler' : 'Oluşturulan Bağışçılar',
                items: [
                  { label: 'Başarılı Yeni Kayıt', value: String(kind === 'donations' ? (result.imported ?? 0) : (result.created ?? 0)), color: 'emerald' },
                  { label: 'Toplam Satır', value: result.row_count.toLocaleString('tr-TR'), color: 'blue' },
                ],
              })}
            />
            <GlobalStatCard
              title={kind === 'donations' ? 'Yeni Bağışçı' : 'Mevcutla Eşleşen'}
              value={String(kind === 'donations' ? (result.new_donors ?? 0) : (result.matched ?? 0))}
              gradient="from-sky-600 to-blue-700"
              icon={<Users className="h-5 w-5" />}
              onClick={() => setStatModal({
                title: kind === 'donations' ? 'Yeni Bağışçılar' : 'Mevcut Kayıtlarla Eşleşenler',
                items: [
                  { label: kind === 'donations' ? 'Yeni Bağışçı' : 'Eşleşen Kayıt', value: String(kind === 'donations' ? (result.new_donors ?? 0) : (result.matched ?? 0)), color: 'blue' },
                  { label: 'Toplam Satır', value: result.row_count.toLocaleString('tr-TR'), color: 'indigo' },
                ],
              })}
            />
            <GlobalStatCard
              title="Hatalı Satır"
              value={String(result.error_count)}
              gradient={result.error_count > 0 ? 'from-rose-600 to-red-700' : 'from-slate-500 to-slate-600'}
              icon={<AlertTriangle className="h-5 w-5" />}
              onClick={() => setStatModal({
                title: 'Hatalı Satırlar',
                subtitle: `${result.error_count} hatalı satır`,
                items: result.errors.slice(0, 20).map((e) => ({
                  label: `Satır ${e.row}`,
                  value: e.message,
                  color: 'rose' as const,
                })),
              })}
            />
          </div>
          <MuhasebeStatModal
            isOpen={!!statModal}
            onClose={() => setStatModal(null)}
            title={statModal?.title || ''}
            subtitle={statModal?.subtitle}
            items={statModal?.items || []}
          />

          {result.errors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-red-700">Aktarılmayacak Satırlar ({result.error_count})</p>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      'aktarim-hatalari.csv',
                      ['Satır', 'Hata Mesajı'],
                      result.errors.map((e) => [e.row, e.message])
                    )
                  }
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                >
                  <Download className="h-3 w-3" /> Hatalı Satırları İndir (CSV)
                </button>
              </div>
              <ul className="max-h-48 space-y-0.5 overflow-auto text-xs text-red-700">
                {result.errors.map((e, idx) => (
                  <li key={`${e.row}-${idx}`}>Satır {e.row}: {e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {result.preview.length > 0 && (
            <div className="overflow-x-auto">
              <p className="mb-1.5 text-xs font-bold text-gray-500">Örnek Önizleme (ilk {result.preview.length} satır)</p>
              <Table>
                <THead>
                  <Tr>
                    {Object.keys(result.preview[0]).map((k) => (
                      <Th key={k} className="whitespace-nowrap">{PREVIEW_LABELS[k] || k}</Th>
                    ))}
                  </Tr>
                </THead>
                <TBody>
                  {result.preview.map((r, i) => (
                    <Tr key={i} className="border-t">
                      {Object.entries(r).map(([k, v]) => (
                        <Td key={k} className="whitespace-nowrap">
                          {k === 'amount_cents' ? (
                            <span className="font-semibold">{formatMoney(Number(v), String(r.currency || 'TRY'))}</span>
                          ) : k === 'action' || k === 'donor_action' ? (
                            <span
                              className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                v === 'yeni'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-sky-200 bg-sky-50 text-sky-700'
                              }`}
                            >
                              {String(v)}
                            </span>
                          ) : Array.isArray(v) ? (
                            v.join(', ')
                          ) : (
                            String(v ?? '')
                          )}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </Card>
      )}

      {history.length > 0 && (
        <Card className="space-y-3 border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <History className="h-4 w-4 text-gray-400" />
            <span>Son Aktarımlar</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr><Th>Tarih</Th><Th>Tür</Th><Th>Dosya</Th><Th>Özet</Th><Th>Kullanıcı</Th></Tr>
              </THead>
              <TBody>
                {history.map((h) => {
                  const meta = ACTION_LABEL[h.action] || { label: h.action, cls: 'border-gray-200 bg-gray-50 text-gray-700' }
                  const d = h.details || {}
                  const summary = h.action === 'makbuz_aktar'
                    ? `${d.imported ?? 0} makbuz${d.skipped ? `, ${d.skipped} atlandı` : ''}${d.errors ? `, ${d.errors} hata` : ''}`
                    : `${d.created ?? 0} yeni, ${d.matched ?? 0} eşleşen${d.errors ? `, ${d.errors} hata` : ''}`
                  return (
                    <Tr key={h.id} className="border-t">
                      <Td className="whitespace-nowrap text-xs text-gray-500">{new Date(h.created_at).toLocaleString('tr-TR')}</Td>
                      <Td>
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>{meta.label}</span>
                      </Td>
                      <Td className="max-w-[220px] truncate text-xs font-medium text-gray-800">{d.file || '—'}</Td>
                      <Td className="text-xs text-gray-600">{summary}</Td>
                      <Td className="text-xs text-gray-500">{h.user_name || '—'}</Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  )
}
