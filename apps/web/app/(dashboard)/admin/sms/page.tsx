'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, hasPermission, useAdminAccess, v1Get } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { MODE_LABEL, SmsMeta, SmsTemplate, segmentSummary } from '../../../../lib/sms'
import { PageHeader, confirmDialog } from '../../../../components/admin/ui'

type Draft = { id: string | null; name: string; body: string; event_key: string; campaign_id: string; auto_mode: SmsTemplate['auto_mode']; is_active: boolean }
const EMPTY: Draft = { id: null, name: '', body: '', event_key: '', campaign_id: '', auto_mode: 'manual', is_active: true }
// Shown in the preview so staff see a realistic message while writing.
const SAMPLE: Record<string, string> = {
  ad_soyad: 'Ahmet Yılmaz', ad: 'Ahmet', tutar: '1.000,00', para_birimi: 'TL', bagis_kalemi: 'Genel Bağış', makbuz_no: 'A-1234',
  tarih: new Date().toLocaleDateString('tr-TR'), vade: new Date().toLocaleDateString('tr-TR'), donem: '2026-11', kimin_adina: 'Fatma Yılmaz', kurban_no: 'K-17', portal: 'ornek.org/portal',
  kurum: 'Kurumunuz', kurum_unvan: 'Kurumunuzun Unvanı', kurum_telefon: '0212 000 00 00', iban: 'TR00 0000 0000 0000 0000 0000 00',
}
const ALIASES: Record<string, string> = { donor_name: 'ad_soyad', amount_lira: 'tutar', campaign_name: 'bagis_kalemi' }
const fill = (body: string) => body.replace(/\{(\w+)\}/g, (all, name) => SAMPLE[ALIASES[name] || name] ?? all)

export default function SmsTemplatesPage() {
  const { data: access } = useAdminAccess()
  const canEdit = hasPermission(access, 'donor_manage')
  const [templates, setTemplates] = useState<SmsTemplate[] | null>(null)
  const [meta, setMeta] = useState<SmsMeta | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([])
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
    v1Get<{ items: { id: string; title: string }[] }>('/campaigns', { page_size: 100 }).then((r) => setCampaigns(r.data.items || [])).catch(() => {})
  }, [])

  const edit = (t: SmsTemplate) => setDraft({ id: t.id, name: t.name, body: t.body, event_key: t.event_key || '', campaign_id: t.campaign_id || '', auto_mode: t.auto_mode, is_active: t.is_active })

  const insert = (key: string) => {
    if (!draft) return
    const el = bodyRef.current
    const at = el ? el.selectionStart : draft.body.length
    const end = el ? el.selectionEnd : draft.body.length
    setDraft({ ...draft, body: `${draft.body.slice(0, at)}{${key}}${draft.body.slice(end)}` })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + key.length + 2, at + key.length + 2) })
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft) return
    setSaving(true)
    try {
      const body = { name: draft.name, body: draft.body, event_key: draft.event_key || null, campaign_id: draft.event_key ? null : draft.campaign_id || null, auto_mode: draft.auto_mode, is_active: draft.is_active }
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
      await adminSend('put', `/sms/templates/${t.id}`, { name: t.name, body: t.body, event_key: t.event_key, campaign_id: t.campaign_id, auto_mode, is_active: t.is_active })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const usedEvents = new Set((templates || []).filter((t) => t.id !== draft?.id).map((t) => t.event_key).filter(Boolean))
  const draftCount = draft ? segmentSummary(fill(draft.body)) : null

  return (
    <div className="space-y-6">
      <PageHeader title="SMS Şablonları" description={<>Hızlı SMS penceresinde seçilen ve olaylarda otomatik giden metinler. Değişkenler gönderim anında doldurulur.</>} actions={<div className="flex shrink-0 gap-2 whitespace-nowrap">
          <Link href="/admin/sms-gonderimleri" className={`${ghostButton} flex items-center`}>SMS Gönderimleri</Link>
          {canEdit && <button onClick={() => setDraft({ ...EMPTY })} className={primaryButton}>+ Yeni Şablon</button>}
        </div>} />

      <Notice message={message} />

      {draft && (
        <Card className="border border-primary-100 p-6 shadow-sm">
          <form onSubmit={save} className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <TextInput label="Şablon adı" required maxLength={100} value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder="Vacip Kurban Hisse" />
              <Label label="Mesaj metni">
                <textarea ref={bodyRef} required rows={7} maxLength={1500} className={`${inputClass} resize-y`} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              </Label>
              <div>
                <div className="mb-1 text-xs font-bold text-gray-600">Değişken ekle</div>
                <div className="flex flex-wrap gap-1.5">
                  {(meta?.variables || []).map((v) => (
                    <button type="button" key={v.key} onClick={() => insert(v.key)} title={v.label}
                      className="rounded border border-primary-200 bg-primary-50 px-2 py-1 font-mono text-[11px] font-bold text-primary-800 hover:bg-primary-100">{`{${v.key}}`}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <Label label="Bağlı olay" hint="Olaya bağlı şablon, o olay gerçekleştiğinde kullanılır. Olaysız şablonlar yalnızca hızlı SMS penceresinde seçilir.">
                <select className={inputClass} value={draft.event_key} onChange={(e) => setDraft({ ...draft, event_key: e.target.value, auto_mode: e.target.value ? draft.auto_mode : 'manual' })}>
                  <option value="">Olaya bağlı değil</option>
                  {(meta?.events || []).map((ev) => <option key={ev.key} value={ev.key} disabled={usedEvents.has(ev.key)}>{ev.label}{usedEvents.has(ev.key) ? ' (başka şablona bağlı)' : ''}</option>)}
                </select>
              </Label>
              {!draft.event_key && (
                <Label label="Bağış kalemi / kampanya" hint="Seçilirse bu kampanyanın makbuz ve havale SMS'lerinde genel metin yerine bu şablon kullanılır.">
                  <select className={inputClass} value={draft.campaign_id} onChange={(e) => setDraft({ ...draft, campaign_id: e.target.value })}>
                    <option value="">Kampanyaya bağlı değil</option>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </Label>
              )}
              {draft.event_key && (
                <Label label="Olay gerçekleşince">
                  <select className={inputClass} value={draft.auto_mode} onChange={(e) => setDraft({ ...draft, auto_mode: e.target.value as Draft['auto_mode'] })}>
                    {Object.entries(MODE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Label>
              )}
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} /> Kullanımda
              </label>
              <div>
                <div className="mb-1 text-xs font-bold text-gray-600">Örnek görünüm</div>
                <div className="min-h-[96px] whitespace-pre-line rounded-2xl rounded-bl-sm bg-gray-100 p-3 text-sm text-gray-800">{fill(draft.body) || '…'}</div>
                {draftCount && (
                  <p className={`mt-1 text-xs font-semibold ${draftCount.info.encoding === 'unicode' || draftCount.info.parts > 3 ? 'text-amber-700' : 'text-gray-500'}`}>
                    {draftCount.text} <span className="font-normal text-gray-400">(örnek değerlerle)</span>
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setDraft(null)} className={ghostButton}>Vazgeç</button>
                <button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
              </div>
            </div>
          </form>
        </Card>
      )}

      {!templates ? (
        <p className="animate-pulse py-10 text-center text-sm text-gray-400">Yükleniyor…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} className={`space-y-3 border border-gray-100 p-5 shadow-sm ${t.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-gray-900">{t.name}</h3>
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-bold">
                    {t.campaign_id && <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-sky-800">Kalem: {campaigns.find((c) => c.id === t.campaign_id)?.title || 'kampanya'}</span>}
                    {t.event_label
                      ? <span className="rounded border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-primary-800">Olay: {t.event_label}</span>
                      : <span className="rounded border px-1.5 py-0.5 text-gray-500">Hızlı SMS şablonu</span>}
                    {!t.is_active && <span className="rounded border px-1.5 py-0.5 text-gray-500">Kullanım dışı</span>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-3 text-xs font-bold">
                    <button onClick={() => edit(t)} className="text-primary-700">Düzenle</button>
                    <button onClick={() => remove(t)} className="text-red-600">Sil</button>
                  </div>
                )}
              </div>
              <p className="whitespace-pre-line rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{t.body}</p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <span>{segmentSummary(fill(t.body)).text}</span>
                {t.event_key && (
                  <select disabled={!canEdit} value={t.auto_mode} onChange={(e) => setMode(t, e.target.value as SmsTemplate['auto_mode'])}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-bold text-gray-700">
                    {Object.entries(MODE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
