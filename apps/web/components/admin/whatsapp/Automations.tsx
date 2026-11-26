'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../lib/admin-access'
import { Label, ghostButton, inputClass, primaryButton } from '../FormKit'
import { EmptyState, Modal, TBody, THead, Table, Td, Th, Tr, confirmDialog, toast } from '../ui'
import { TEMPLATE_STATUS, Template, TemplateFields } from './shared'

interface EventRow {
  key: string; label: string; sms_mode: 'auto' | 'manual' | 'off'
  channel: 'sms' | 'whatsapp' | 'both'; template_name: string; language: string | null; params: string[]
  suggested: { name: string; body: string; params: string[] } | null
}

const CHANNELS: [EventRow['channel'], string][] = [
  ['sms', 'Yalnız SMS'],
  ['whatsapp', 'WhatsApp (olmazsa SMS)'],
  ['both', 'WhatsApp + SMS'],
]
const SMS_MODE: Record<EventRow['sms_mode'], string> = { auto: 'SMS otomatik', manual: 'SMS elle', off: 'SMS kapalı' }

export function EventsTab({ templates, onTemplatesChanged }: { templates: Template[]; onTemplatesChanged: () => void }) {
  const [rows, setRows] = useState<EventRow[]>([])
  const [editing, setEditing] = useState<EventRow | null>(null)
  const load = useCallback(() => {
    adminGet<EventRow[]>('/whatsapp/events').then((r) => setRows(r.data)).catch((err) => toast.error(apiErrorMessage(err)))
  }, [])
  useEffect(() => { load() }, [load])

  const createSuggested = async (row: EventRow) => {
    if (!(await confirmDialog({ title: `“${row.suggested?.name}” şablonu Meta’ya onaya gönderilsin mi?`, text: row.suggested?.body, confirmLabel: 'Onaya gönder' }))) return
    try {
      await adminSend('post', `/whatsapp/events/${row.key}/suggested-template`)
      toast.ok('Şablon onaya gönderildi. Meta onaylayınca bildirim gelir; o zamana kadar SMS gider.')
      load()
      onTemplatesChanged()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Şablon oluşturulamadı'))
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="font-bold text-gray-900">Otomatik bildirimler</h2>
        <p className="text-sm text-gray-600">Bağış alındığında, makbuz kesildiğinde, kurban kesildiğinde… bağışçıya hangi kanaldan haber gideceğini seçin.
          “WhatsApp (olmazsa SMS)” seçilirse mesaj WhatsApp’tan gider; numara WhatsApp kullanmıyorsa, şablon onaylı değilse ya da bağışçı DUR yazdıysa yerine SMS gönderilir.</p>
      </div>
      <Table>
        <THead><Tr><Th>Olay</Th><Th>Kanal</Th><Th>WhatsApp şablonu</Th><Th /></Tr></THead>
        <TBody>
          {rows.map((row) => (
            <Tr key={row.key}>
              <Td><div className="font-medium">{row.label}</div><div className="text-xs text-gray-500">{SMS_MODE[row.sms_mode]}</div></Td>
              <Td>{CHANNELS.find(([k]) => k === row.channel)?.[1]}</Td>
              <Td className="text-sm">{row.template_name || <span className="text-gray-400">—</span>}</Td>
              <Td className="whitespace-nowrap text-right">
                {row.suggested && !templates.some((t) => t.name === row.suggested?.name) && (
                  <button type="button" className={`${ghostButton} mr-1 inline-flex items-center gap-1`} onClick={() => createSuggested(row)} title={row.suggested.body}>
                    <Sparkles className="h-3.5 w-3.5" /> Hazır şablon
                  </button>
                )}
                <button type="button" className={ghostButton} onClick={() => setEditing(row)}>Düzenle</button>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {editing && <EventEditor row={editing} templates={templates} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </Card>
  )
}

function EventEditor({ row, templates, onClose, onSaved }: { row: EventRow; templates: Template[]; onClose: () => void; onSaved: () => void }) {
  const [channel, setChannel] = useState(row.channel)
  const [name, setName] = useState(row.template_name)
  const [params, setParams] = useState<string[]>(row.params.length ? row.params : row.suggested?.params || [])
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await adminSend('put', `/whatsapp/events/${row.key}`, { channel, template_name: channel === 'sms' ? null : name, params })
      toast.ok('Kaydedildi')
      onSaved()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kaydedilemedi'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={row.label} onClose={onClose} size="lg" footer={<button type="button" className={primaryButton} disabled={busy || (channel !== 'sms' && !name)} onClick={save}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>}>
      <div className="space-y-4">
        <Label label="Kanal">
          <select className={inputClass} value={channel} onChange={(e) => setChannel(e.target.value as EventRow['channel'])}>
            {CHANNELS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </Label>
        {channel !== 'sms' && <TemplateFields templates={templates} name={name} setName={setName} params={params} setParams={setParams} />}
        {channel === 'whatsapp' && row.sms_mode !== 'auto' && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Bu olayın SMS’i otomatik değil; WhatsApp gönderilemezse yerine SMS de gitmez. SMS ayarını “SMS Şablonları” sayfasından açabilirsiniz.</p>
        )}
      </div>
    </Modal>
  )
}

export function TemplatesTab({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<Template[] | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const load = useCallback(() => {
    adminGet<Template[]>('/whatsapp/templates', { all: true }).then((r) => { setItems(r.data); setError('') })
      .catch((err) => setError(apiErrorMessage(err, 'Şablonlar alınamadı')))
  }, [])
  useEffect(() => { load() }, [load])
  const remove = async (t: Template) => {
    if (!(await confirmDialog({ title: `“${t.name}” şablonu silinsin mi?`, text: 'Meta’dan tüm dilleriyle silinir; aynı adı 30 gün kullanamazsınız.', danger: true, confirmLabel: 'Sil' }))) return
    try {
      await adminSend('delete', `/whatsapp/templates/${encodeURIComponent(t.name)}`)
      toast.ok('Şablon silindi')
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-gray-900">Mesaj şablonları</h2>
          <p className="text-sm text-gray-600">Bağışçı size son 24 saatte yazmadıysa yalnızca Meta’nın onayladığı şablonlar gönderilebilir. Onay genelde birkaç dakika ile 24 saat sürer.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={`${ghostButton} flex items-center gap-1`} onClick={load}><RefreshCw className="h-3.5 w-3.5" /> Yenile</button>
          {canManage && <button type="button" className={`${primaryButton} flex items-center gap-1`} onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Yeni şablon</button>}
        </div>
      </div>
      {error && <p className="text-sm text-amber-800">{error}</p>}
      {items && !items.length && <EmptyState title="Henüz şablon yok" text="“Otomatik Bildirimler” sekmesindeki hazır şablonlarla tek tıkla başlayabilirsiniz." />}
      {!!items?.length && (
        <Table>
          <THead><Tr><Th>Ad</Th><Th>Tür</Th><Th>Metin</Th><Th>Durum</Th><Th /></Tr></THead>
          <TBody>
            {items.map((t) => {
              const [label, tone] = TEMPLATE_STATUS[t.status || ''] || [t.status, 'bg-gray-100 text-gray-700']
              return (
                <Tr key={`${t.name}-${t.language}`}>
                  <Td><div className="font-medium">{t.name}</div><div className="text-xs text-gray-500">{t.language}</div></Td>
                  <Td className="text-xs">{t.category === 'MARKETING' ? 'Pazarlama' : t.category === 'UTILITY' ? 'Bilgilendirme' : t.category}</Td>
                  <Td className="max-w-md text-sm"><div className="line-clamp-3 whitespace-pre-wrap">{t.body}</div>
                    {!!t.buttons?.length && <div className="mt-1 flex flex-wrap gap-1">{t.buttons.map((b, i) => <span key={i} className="rounded-full border px-2 text-[11px]">{b.text}</span>)}</div>}</Td>
                  <Td><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{label}</span>{t.rejected_reason && <div className="text-xs text-red-600">{t.rejected_reason}</div>}</Td>
                  <Td>{canManage && <button type="button" className={`${ghostButton} text-red-700`} onClick={() => remove(t)} aria-label="Sil"><Trash2 className="h-3.5 w-3.5" /></button>}</Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
      )}
      {creating && <TemplateCreator onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load() }} />}
    </Card>
  )
}

interface Btn { type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phone_number?: string }

function TemplateCreator({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', category: 'UTILITY', language: 'tr', header_text: '', body: '', footer: '' })
  const [examples, setExamples] = useState<string[]>([])
  const [buttons, setButtons] = useState<Btn[]>([])
  const [busy, setBusy] = useState(false)
  const count = new Set(form.body.match(/\{\{\d+\}\}/g) || []).size
  useEffect(() => { setExamples((ex) => Array.from({ length: count }, (_, i) => ex[i] || '')) }, [count])
  const save = async () => {
    setBusy(true)
    try {
      await adminSend('post', '/whatsapp/templates', { ...form, header_text: form.header_text || null, footer: form.footer || null, examples, buttons })
      toast.ok('Şablon Meta’ya onaya gönderildi')
      onCreated()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Şablon oluşturulamadı'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Yeni WhatsApp şablonu" onClose={onClose} size="lg" footer={<button type="button" className={primaryButton} disabled={busy || !form.name || !form.body} onClick={save}>{busy ? 'Gönderiliyor…' : 'Onaya gönder'}</button>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2"><Label label="Şablon adı" hint="Küçük harf, rakam ve alt çizgi: bagis_tesekkur">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
          </Label></div>
          <Label label="Tür">
            <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="UTILITY">Bilgilendirme (makbuz, teşekkür)</option>
              <option value="MARKETING">Pazarlama (kampanya duyurusu)</option>
            </select>
          </Label>
        </div>
        <Label label="Başlık (isteğe bağlı)"><input className={inputClass} maxLength={60} value={form.header_text} onChange={(e) => setForm({ ...form, header_text: e.target.value })} /></Label>
        <Label label="Metin" hint="Değişkenler {{1}}, {{2}} … biçiminde; gönderirken {ad_soyad}, {tutar} gibi alanlarla doldurulur.">
          <textarea className={`${inputClass} min-h-[120px]`} maxLength={1024} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="Sayın {{1}}, {{2}} TL bağışınız alınmıştır. Allah kabul etsin." />
        </Label>
        {examples.map((ex, i) => (
          <Label key={i} label={`{{${i + 1}}} için örnek değer`} hint={i === 0 ? 'Meta onay için örnek ister.' : undefined}>
            <input className={inputClass} value={ex} onChange={(e) => setExamples(examples.map((x, j) => (j === i ? e.target.value : x)))} />
          </Label>
        ))}
        <Label label="Alt bilgi (isteğe bağlı)"><input className={inputClass} maxLength={60} value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })} placeholder="Çıkmak için DUR yazın" /></Label>
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-800">Butonlar</div>
          {buttons.map((b, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <select className={`${inputClass} max-w-[150px]`} value={b.type} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, type: e.target.value as Btn['type'] } : x)))}>
                <option value="QUICK_REPLY">Cevap</option><option value="URL">Bağlantı</option><option value="PHONE_NUMBER">Telefon</option>
              </select>
              <input className={`${inputClass} max-w-[180px]`} maxLength={25} placeholder="Buton yazısı" value={b.text} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              {b.type === 'URL' && <input className={`${inputClass} flex-1`} placeholder="https://…" value={b.url || ''} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />}
              {b.type === 'PHONE_NUMBER' && <input className={`${inputClass} flex-1`} placeholder="0850 …" value={b.phone_number || ''} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, phone_number: e.target.value } : x)))} />}
              <button type="button" className={ghostButton} onClick={() => setButtons(buttons.filter((_, j) => j !== i))} aria-label="Kaldır"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {buttons.length < 3 && <button type="button" className={ghostButton} onClick={() => setButtons([...buttons, { type: 'QUICK_REPLY', text: '' }])}>+ Buton ekle</button>}
        </div>
      </div>
    </Modal>
  )
}
