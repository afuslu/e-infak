'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { Download, FileSpreadsheet, UploadCloud } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminApiBase, adminAuthHeaders, adminSend, apiErrorMessage, formatMoney } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { PageHeader, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'

type Kind = 'donors' | 'donations'

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

const KINDS: Record<Kind, { title: string; hint: string; templateName: string; templateHeaders: string[]; templateRow: string[] }> = {
  donors: {
    title: 'Bağışçı listesi',
    hint: 'Telefon, e-posta veya TC ile eşleşen kayıtların yalnız boş alanları doldurulur; yeni kişiler eklenir.',
    templateName: 'bagisci-sablonu.csv',
    templateHeaders: ['Ad Soyad', 'Telefon', 'E-posta', 'TC Kimlik No', 'Şehir', 'Adres', 'Grup', 'SMS İzni', 'E-posta İzni'],
    templateRow: ['Ahmet Yılmaz', '05321112233', 'ahmet@ornek.com', '', 'İstanbul', 'Fatih Mah. No:1', '2026 Ramazan', 'Evet', 'Evet'],
  },
  donations: {
    title: 'Geçmiş makbuzlar',
    hint: 'Her satır onaylı bir bağış olur (makbuz e-postası gönderilmez). Aynı dosyayı tekrar yüklemek çift kayıt açmaz.',
    templateName: 'makbuz-sablonu.csv',
    templateHeaders: ['Ad Soyad', 'Telefon', 'Tutar', 'Para Birimi', 'Bağış Tarihi', 'Kampanya', 'Ödeme Yöntemi', 'Matbu Makbuz No', 'Açıklama'],
    templateRow: ['Ahmet Yılmaz', '05321112233', '1500', 'TRY', '2026-03-15', 'Genel Bağış', 'Nakit', 'A-00125', 'Elden teslim'],
  },
}

const PREVIEW_LABELS: Record<string, string> = {
  row: 'Satır',
  action: 'İşlem',
  name: 'Bağışçı',
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
  const [defaultCampaign, setDefaultCampaign] = useState('')
  const [extraTag, setExtraTag] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    axios
      .get(`${adminApiBase()}/api/v1/campaigns`, { headers: adminAuthHeaders(), params: { page_size: 100 } })
      .then((r) => setCampaigns(r.data.items || []))
      .catch(() => {})
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
                : `${res.data.imported} makbuz aktarıldı${res.data.already_imported ? `, ${res.data.already_imported} satır daha önce aktarılmıştı` : ''}`,
          })
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
  const hasNameMapping = Boolean(mapping.full_name || mapping.first_name || mapping.company_name)
  const hasAmountMapping = kind === 'donors' || Boolean(mapping.amount)
  const canValidate = hasNameMapping && hasAmountMapping && !busy

  const currentStep = result?.committed ? 4 : result ? 3 : intro ? 2 : 1
  const steps = ['1. Dosya Seç', '2. Sütun Eşle', '3. Doğrula', '4. Aktar']

  return (
    <div className="space-y-6">
      <PageHeader
        title="Excel'den Aktarım"
        description={<>XLSX veya CSV dosyasını yükleyin, sütunları eşleyin, önce doğrulayın sonra aktarın. En fazla 5000 satır.</>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                downloadCsv(KINDS[kind].templateName, KINDS[kind].templateHeaders, [KINDS[kind].templateRow])
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" /> Örnek Şablon İndir (CSV)
            </button>
            <Link
              href="/admin/crm"
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50"
            >
              Bağışçılar (CRM) →
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
              className={`-mb-1 border-b-2 px-3 py-2 ${
                kind === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {KINDS[k].title}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          {steps.map((label, idx) => {
            const stepNum = idx + 1
            const active = currentStep === stepNum
            const done = currentStep > stepNum
            return (
              <span
                key={label}
                className={`rounded-full px-2.5 py-1 font-semibold ${
                  active
                    ? 'bg-primary-600 text-white'
                    : done
                    ? 'bg-primary-50 text-primary-700'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {label}
              </span>
            )
          })}
        </div>
      </div>

      <Notice message={message} />

      <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
        <p className="text-sm text-gray-600">{KINDS[kind].hint}</p>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            handleSelectFile(e.dataTransfer.files?.[0] || null)
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${
            dragging ? 'border-primary-500 bg-primary-50/60' : 'border-gray-200 bg-gray-50/50 hover:border-primary-300 hover:bg-gray-50'
          }`}
        >
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
          {file ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <FileSpreadsheet className="h-5 w-5 text-primary-600" />
              <span>{file.name}</span>
              <span className="text-xs font-normal text-gray-500">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          ) : (
            <>
              <UploadCloud className="h-7 w-7 text-gray-400" />
              <p className="text-sm font-semibold text-gray-700">Dosyayı buraya sürükleyin veya seçmek için tıklayın</p>
              <p className="text-xs text-gray-400">Desteklenen biçimler: .xlsx, .csv (UTF-8 / Windows-1254, maks. 10 MB)</p>
            </>
          )}
          {busy && <span className="text-xs font-medium text-primary-600">Dosya işleniyor…</span>}
        </div>
      </Card>

      {intro && (
        <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-gray-900">
              Sütunları eşleyin <span className="font-normal text-gray-500">({intro.row_count} satır)</span>
            </h2>
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
                  {intro.sheet_names.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500">
            Zorunlu alanlar:{' '}
            <span className="font-semibold text-gray-700">
              Ad Soyad / Ad / Kurum adı{kind === 'donations' ? ' ve Tutar (*)' : ''}
            </span>
          </p>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(intro.fields).map(([field, label]) => {
              const isReq = field === 'amount' && kind === 'donations'
              return (
                <Label key={field} label={isReq ? `${label} *` : label}>
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
                </Label>
              )
            })}
          </div>

          {kind === 'donors' && (
            <div className="w-64">
              <TextInput
                label="Tüm satırlara eklenecek grup (isteğe bağlı)"
                value={extraTag}
                onChange={(v) => {
                  setExtraTag(v)
                  setResult(null)
                }}
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
                  onChange={(e) => {
                    setDefaultCampaign(e.target.value)
                    setResult(null)
                  }}
                >
                  <option value="">—</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </Label>
            </div>
          )}

          <div className="overflow-x-auto">
            <p className="mb-1 text-xs font-bold text-gray-500">Dosyadaki ilk satırlar</p>
            <Table>
              <THead>
                <Tr>
                  {intro.headers.map((h, i) => (
                    <Th key={i} className="whitespace-nowrap">
                      {h}
                    </Th>
                  ))}
                </Tr>
              </THead>
              <TBody>
                {intro.sample.map((r, i) => (
                  <Tr key={i} className="border-t">
                    {intro.headers.map((_, j) => (
                      <Td key={j} className="whitespace-nowrap">
                        {r[j] ?? ''}
                      </Td>
                    ))}
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

          <div className="flex gap-2">
            <button className={ghostButton} disabled={!canValidate} onClick={() => send('check')}>
              2. Doğrula
            </button>
            {result && !result.committed && result.row_count > result.error_count && (
              <button
                className={primaryButton}
                disabled={busy}
                onClick={async () =>
                  (await confirmDialog({ title: 'Geçerli satırlar aktarılsın mı?', danger: false })) && send('commit')
                }
              >
                3. Aktar
              </button>
            )}
          </div>
        </Card>
      )}

      {result && (
        <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">
            {result.committed ? 'Aktarım sonucu' : 'Doğrulama sonucu (henüz kaydedilmedi)'}
          </h2>
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            {(kind === 'donors'
              ? [
                  ['Toplam Satır', result.row_count, 'bg-gray-50 text-gray-800'],
                  ['Yeni Bağışçı', result.created, 'bg-emerald-50 text-emerald-800'],
                  ['Mevcutla Eşleşen', result.matched, 'bg-blue-50 text-blue-800'],
                  ['Hatalı', result.error_count, result.error_count > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-800'],
                ]
              : [
                  ['Toplam Satır', result.row_count, 'bg-gray-50 text-gray-800'],
                  ['Makbuz', result.imported, 'bg-emerald-50 text-emerald-800'],
                  ['Yeni Bağışçı', result.new_donors, 'bg-blue-50 text-blue-800'],
                  ['Hatalı', result.error_count, result.error_count > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-800'],
                ]
            ).map(([k, v, cls]) => (
              <div key={String(k)} className={`rounded-lg p-3 ${cls}`}>
                <p className="text-[11px] font-bold opacity-70">{k}</p>
                <p className="text-lg font-bold tabular-nums">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>

          {kind === 'donations' && !!result.totals?.length && (
            <p className="text-xs text-gray-600">
              Toplam: {result.totals.map((t) => formatMoney(t.total_cents, t.currency)).join(' · ')}
              {result.already_imported ? ` · ${result.already_imported} satır daha önce aktarılmış, atlandı` : ''}
            </p>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-red-100 bg-red-50/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-red-700">Aktarılmayacak satırlar ({result.error_count})</p>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      'aktarim-hatalari.csv',
                      ['Satır', 'Hata Mesajı'],
                      result.errors.map((e) => [e.row, e.message])
                    )
                  }
                  className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                >
                  <Download className="h-3 w-3" /> Hatalı Satırları İndir (CSV)
                </button>
              </div>
              <ul className="max-h-48 space-y-0.5 overflow-auto text-xs text-red-700">
                {result.errors.map((e, idx) => (
                  <li key={`${e.row}-${idx}`}>
                    Satır {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.preview.length > 0 && (
            <div className="overflow-x-auto">
              <p className="mb-1 text-xs font-bold text-gray-500">Örnek Önizleme (ilk {result.preview.length} satır)</p>
              <Table>
                <THead>
                  <Tr>
                    {Object.keys(result.preview[0]).map((k) => (
                      <Th key={k} className="whitespace-nowrap">
                        {PREVIEW_LABELS[k] || k}
                      </Th>
                    ))}
                  </Tr>
                </THead>
                <TBody>
                  {result.preview.map((r, i) => (
                    <Tr key={i} className="border-t">
                      {Object.entries(r).map(([k, v]) => (
                        <Td key={k} className="whitespace-nowrap">
                          {k === 'amount_cents'
                            ? formatMoney(Number(v), String(r.currency || 'TRY'))
                            : Array.isArray(v)
                            ? v.join(', ')
                            : String(v ?? '')}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}

          {result.committed && (
            <button className={ghostButton} onClick={() => reset()}>
              Yeni dosya
            </button>
          )}
        </Card>
      )}
    </div>
  )
}
