'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { adminGet, adminSend, apiErrorMessage } from '../../lib/admin-access'
import { RelatedSms, STATUS_CLASS, STATUS_LABEL, SmsTemplate, segmentSummary } from '../../lib/sms'
import { ghostButton, inputClass, primaryButton } from './FormKit'

export interface SmsTarget {
  donorId?: string | null
  donationId?: string | null
  transferId?: string | null
  name?: string | null
  phone?: string | null
  /** false: the donor has no SMS permission; only messages about their own donation may be sent */
  allowSms?: boolean
  /** Values of a form that is not saved yet: { tutar: '1.000,00', bagis_kalemi: 'Gazze Yemek' } */
  variables?: Record<string, string>
}

export interface SmsSent { id: string; seq_no: number; status: string }

export const sentNotice = (r: SmsSent) =>
  `SMS ${r.status === 'scheduled' ? 'zamanlandı' : 'kuyruğa alındı'} #${r.seq_no} — durum: İletişim → SMS Gönderimleri`

const localNow = (plusMinutes = 60) => {
  const d = new Date(Date.now() + plusMinutes * 60_000)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

/**
 * Quick SMS window: optional template, editable text with a live length counter, optional later send.
 * With `compose` nothing is sent; the text is handed back (used on forms that are saved afterwards,
 * so the SMS goes out together with the receipt and is tied to it).
 */
export function QuickSmsDialog({
  target, title = 'Hızlı SMS Gönder', eventKey, compose, onClose, onSent,
}: {
  target: SmsTarget
  title?: string
  /** Preselects the template bound to this event ("makbuz", "havale_eslesti"…) */
  eventKey?: string
  compose?: { initial?: string | null; onDone: (body: string | null) => void }
  onClose: () => void
  onSent?: (result: SmsSent) => void
}) {
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [body, setBody] = useState(compose?.initial || '')
  const [phone, setPhone] = useState(target.phone || '')
  const [later, setLater] = useState(false)
  const [sendAt, setSendAt] = useState(localNow())
  const [informational, setInformational] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const aboutRecord = Boolean(target.donationId || target.transferId || compose)
  const hasDonor = Boolean(target.donorId || target.donationId)
  const needsConfirm = target.allowSms === false && !aboutRecord
  const { info, text: counter } = segmentSummary(body)

  const applyTemplate = async (id: string) => {
    setTemplateId(id)
    if (!id) return
    setError('')
    try {
      const res = await adminGet<{ body: string; phone: string | null }>('/sms/preview', {
        template_id: id,
        donor_id: target.donorId || undefined,
        donation_id: target.donationId || undefined,
        transfer_id: target.transferId || undefined,
        variables: target.variables && Object.keys(target.variables).length ? JSON.stringify(target.variables) : undefined,
      })
      setBody(res.data.body)
      if (res.data.phone) setPhone((current) => current || res.data.phone || '')
    } catch (err) {
      setError(apiErrorMessage(err, 'Şablon yüklenemedi'))
    }
  }

  useEffect(() => {
    adminGet<SmsTemplate[]>('/sms/templates')
      .then((res) => {
        const active = res.data.filter((t) => t.is_active)
        setTemplates(active)
        const preset = eventKey && !compose?.initial ? active.find((t) => t.event_key === eventKey) : undefined
        if (preset) applyTemplate(preset.id)
      })
      .catch(() => setTemplates([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Not a <form>: this window also opens inside the receipt and transfer forms.
  const submit = async () => {
    setError('')
    if (!compose && !phone.trim() && !hasDonor) return setError('Telefon numarası girin')
    if (!compose && body.trim().length < 2) return setError('Mesaj metni yazın')
    if (later && !sendAt) return setError('Gönderim tarihini seçin')
    if (compose) {
      compose.onDone(body.trim() || null)
      onClose()
      return
    }
    setBusy(true)
    try {
      const res = await adminSend<SmsSent>('post', '/sms/send', {
        donor_id: target.donorId || null,
        donation_id: target.donationId || null,
        transfer_id: target.transferId || null,
        phone: phone.trim() || null,
        body,
        template_id: templateId || null,
        send_at: later ? new Date(sendAt).toISOString() : null,
        informational,
      })
      onSent?.(res.data)
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'SMS gönderilemedi'))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="mt-10 w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 text-left shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}{target.name ? ` — ${target.name}` : ''}</h2>
            <p className="text-xs text-gray-500">
              {compose
                ? 'Bu metin kayıtla birlikte bağışçının numarasına gönderilir.'
                : 'Bağışçının numarasına gönderilir; durum: İletişim → SMS Gönderimleri.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-700" aria-label="Kapat">×</button>
        </div>

        {!compose && (
          <label className="block text-xs font-bold text-gray-600">
            <span className="mb-1 block">Telefon</span>
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={hasDonor ? 'Bağışçının kayıtlı numarası' : '05xx xxx xx xx'} inputMode="tel" />
          </label>
        )}

        <label className="block text-xs font-bold text-gray-600">
          <span className="mb-1 block">Şablon (opsiyonel)</span>
          <select className={inputClass} value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">Şablonsuz — metni kendim yazacağım</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>

        <label className="block text-xs font-bold text-gray-600">
          <span className="mb-1 block">Mesaj Metni</span>
          <textarea rows={6} maxLength={1500} className={`${inputClass} resize-y`} value={body} onChange={(e) => setBody(e.target.value)} />
          <span className={`mt-1 block font-semibold ${info.encoding === 'unicode' || info.parts > 3 ? 'text-amber-700' : 'text-gray-500'}`}>
            {counter}
          </span>
          <span className="block font-normal text-gray-400">Türkçe karakterler SMS boyutunu etkiler.</span>
        </label>

        {needsConfirm && (
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <input type="checkbox" className="mt-0.5" checked={informational} onChange={(e) => setInformational(e.target.checked)} />
            <span>
              <strong>Bu bağışçının SMS izni yok.</strong> Bu ileti yalnızca kendi bağışıyla ilgili bilgilendirmedir;
              tanıtım veya kampanya duyurusu içermez.
            </span>
          </label>
        )}

        {!compose && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="text-xs font-bold text-gray-600">Zamanlama</div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} /> İleri tarihli gönder
            </label>
            {later
              ? <input type="datetime-local" min={localNow(1)} className={inputClass} value={sendAt} onChange={(e) => setSendAt(e.target.value)} />
              : <p className="text-xs text-gray-400">Kapalıysa hemen gönderilir.</p>}
          </div>
        )}

        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        <div className="flex items-center gap-2">
          <button type="button" onClick={submit} disabled={busy || (needsConfirm && !informational)} className={primaryButton}>
            {compose ? 'Bu metni kullan' : busy ? 'Gönderiliyor…' : later ? 'SMS Zamanla' : 'SMS Gönder'}
          </button>
          <button type="button" onClick={onClose} className={ghostButton}>İptal</button>
          {compose?.initial && (
            <button type="button" onClick={() => { compose.onDone(null); onClose() }} className="ml-auto text-xs font-bold text-gray-500 hover:text-gray-800">
              Otomatik metne dön
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Small "SMS gönderildi #12" pill for the SMS column of receipt and transfer lists. */
export function SmsStatusPill({ sms }: { sms?: RelatedSms }) {
  if (!sms) return <span className="text-gray-300">—</span>
  return (
    <span title={sms.error || `#${sms.seq_no}${sms.count > 1 ? ` · ${sms.count} SMS` : ''}`}
      className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CLASS[sms.status]}`}>
      {STATUS_LABEL[sms.status]}
    </span>
  )
}

/** Latest SMS of each record id, for list columns. Failures leave the column empty. */
export async function loadRelatedSms(relatedType: 'donation' | 'bank_transaction', ids: string[]) {
  if (!ids.length) return {}
  try {
    return (await adminGet<Record<string, RelatedSms>>('/sms/related', { related_type: relatedType, ids: ids.slice(0, 200).join(',') })).data
  } catch {
    return {}
  }
}
