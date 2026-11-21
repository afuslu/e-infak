'use client'

/** "Mail Gönder": subject + text to a saved list or to the donors picked on the donor list. */
import { useEffect, useState } from 'react'
import { adminGet, adminSend, apiErrorMessage } from '../../../lib/admin-access'
import { Label, inputClass } from '../FormKit'
import { Modal, toast } from '../ui'

export interface MailTarget {
  list_id?: string
  target?: { ids: string[]; select_all: boolean; filters?: Record<string, unknown> }
}
interface Template { id: string; name: string; subject: string; body: string; is_active: boolean }
interface Preview { recipients: number; matched: number; no_email: number; no_consent: number; invalid: number; duplicate: number }

export function MailComposer({ target, label, onClose, onSent }: { target: MailTarget; label: string; onClose: () => void; onSent?: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [commercial, setCommercial] = useState(true)
  const [withoutConsent, setWithoutConsent] = useState(false)
  const [later, setLater] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { adminGet<Template[]>('/mail/templates').then((r) => setTemplates(r.data.filter((t) => t.is_active))).catch(() => {}) }, [])
  const payload = (extra: Record<string, unknown> = {}) => ({
    ...target, subject: subject || '-', body: body || '-', commercial, include_without_consent: !commercial && withoutConsent,
    send_after: later ? new Date(later).toISOString() : null, ...extra,
  })
  useEffect(() => {
    const t = setTimeout(() => {
      adminSend<Preview>('post', '/mail/batches', payload({ preview: true })).then((r) => setPreview(r.data)).catch(() => setPreview(null))
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commercial, withoutConsent, JSON.stringify(target)])

  const send = async () => {
    if (!subject.trim() || !body.trim()) { toast.error('Konu ve metin yazın'); return }
    setBusy(true)
    try {
      const r = await adminSend<{ recipients: number; seq_no: number }>('post', '/mail/batches', payload())
      toast.ok(`Mail gönderimi #${r.data.seq_no} sıraya alındı: ${r.data.recipients} alıcı.`)
      onSent?.()
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gönderilemedi'))
    } finally {
      setBusy(false)
    }
  }

  const skipped = preview ? preview.no_email + preview.no_consent + preview.invalid + preview.duplicate : 0
  return (
    <Modal title="Mail Gönder" description={label} size="lg" onClose={onClose}
      footer={<button type="button" disabled={busy || !preview?.recipients} onClick={send} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">{busy ? 'Gönderiliyor…' : `${preview?.recipients ?? 0} kişiye gönder`}</button>}>
      <div className="grid gap-3">
        {templates.length > 0 && (
          <Label label="Şablon">
            <select className={inputClass} defaultValue="" onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value)
              if (t) { setSubject(t.subject); setBody(t.body) }
            }}>
              <option value="">Şablon seçin (isteğe bağlı)</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Label>
        )}
        <Label label="Konu *"><input className={inputClass} maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} /></Label>
        <Label label="Metin *" hint="Değişkenler: {ad}, {ad_soyad}, {kurum}. Paragrafları boş satırla ayırın.">
          <textarea className={`${inputClass} min-h-[180px]`} value={body} onChange={(e) => setBody(e.target.value)} />
        </Label>
        <div className="flex flex-wrap gap-5 text-[13.5px]">
          <label className="flex items-center gap-2"><input type="radio" checked={commercial} onChange={() => setCommercial(true)} /> Tanıtım / kampanya (yalnız e-posta izni olanlar)</label>
          <label className="flex items-center gap-2"><input type="radio" checked={!commercial} onChange={() => setCommercial(false)} /> Bilgilendirme</label>
        </div>
        {!commercial && (
          <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={withoutConsent} onChange={(e) => setWithoutConsent(e.target.checked)} /> İzni olmayanlara da gönder (yalnız bilgilendirme: makbuz, duyuru)</label>
        )}
        <Label label="İleri tarihte gönder (isteğe bağlı)"><input type="datetime-local" className={inputClass} value={later} onChange={(e) => setLater(e.target.value)} /></Label>
        {preview && (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
            <b className="text-gray-900">{preview.recipients}</b> alıcı{skipped > 0 && ` · gönderilmeyecek: ${[
              preview.no_email && `${preview.no_email} e-postasız`, preview.no_consent && `${preview.no_consent} izinsiz`,
              preview.invalid && `${preview.invalid} geçersiz`, preview.duplicate && `${preview.duplicate} tekrar`,
            ].filter(Boolean).join(', ')}`}
          </p>
        )}
      </div>
    </Modal>
  )
}
