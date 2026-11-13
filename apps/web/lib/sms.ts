/** SMS length counting (mirrors services/backend/app/services/sms_service.py) and shared SMS types. */

const GSM_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
)
const GSM_EXTENDED = new Set('^{}\\[~]|€')
const TURKISH_SHIFT = new Set('çğışĞİŞ')
const LIMITS = { gsm: [160, 153], tr: [155, 149], unicode: [70, 67] } as const

export type SmsEncoding = keyof typeof LIMITS
export interface SegmentInfo { encoding: SmsEncoding; length: number; units: number; parts: number; single_limit: number; multi_limit: number }

export function segmentInfo(message: string): SegmentInfo {
  let units = 0
  let encoding: SmsEncoding = 'gsm'
  for (const ch of message) {
    if (GSM_BASIC.has(ch)) units += 1
    else if (GSM_EXTENDED.has(ch)) units += 2
    else if (TURKISH_SHIFT.has(ch)) { units += 2; encoding = 'tr' }
    else { encoding = 'unicode'; break }
  }
  if (encoding === 'unicode') units = message.length // UTF-16 units, as operators count them
  const [single, multi] = LIMITS[encoding]
  const parts = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi)
  return { encoding, length: message.length, units, parts, single_limit: single, multi_limit: multi }
}

export const ENCODING_LABEL: Record<SmsEncoding, string> = {
  gsm: 'standart karakter',
  tr: 'Türkçe karakter (ş ğ ı ç 2 sayılır)',
  unicode: 'emoji / özel karakter — SMS boyu 70 karaktere düşer',
}

/** "142 karakter · 1 SMS · Türkçe karakter" */
export function segmentSummary(message: string) {
  const info = segmentInfo(message)
  const room = info.parts <= 1 ? info.single_limit - info.units : info.parts * info.multi_limit - info.units
  return { info, text: `${info.units} karakter · ${info.parts} SMS · ${ENCODING_LABEL[info.encoding]}`, room }
}

export interface SmsTemplate {
  id: string; name: string; body: string; event_key: string | null; event_label: string | null
  auto_mode: 'auto' | 'manual' | 'off'; is_active: boolean; segments: SegmentInfo; updated_at: string | null
}

export interface SmsMeta {
  variables: { key: string; label: string }[]
  events: { key: string; label: string; default_mode: string }[]
  max_parts: number
}

export type SmsStatus = 'scheduled' | 'queued' | 'sent' | 'delivered' | 'failed' | 'cancelled'

export interface SmsMessage {
  id: string; seq_no: number; phone: string; donor_id: string | null; donor_name: string | null; body: string
  status: SmsStatus; source: string; related_type: string | null; related_id: string | null
  template_name: string | null; encoding: SmsEncoding; parts: number; provider: string | null; error: string | null
  attempts: number; send_after: string; sent_at: string | null; delivered_at: string | null; created_at: string
  created_by: string | null
}

export interface RelatedSms { status: SmsStatus; seq_no: number; at: string; error: string | null; count: number }

export const STATUS_LABEL: Record<SmsStatus, string> = {
  scheduled: 'Zamanlandı', queued: 'Kuyrukta', sent: 'Gönderildi', delivered: 'İletildi', failed: 'Başarısız', cancelled: 'İptal',
}
export const STATUS_CLASS: Record<SmsStatus, string> = {
  scheduled: 'border-sky-200 bg-sky-50 text-sky-700',
  queued: 'border-amber-200 bg-amber-50 text-amber-700',
  sent: 'border-green-200 bg-green-50 text-green-700',
  delivered: 'border-emerald-300 bg-emerald-100 text-emerald-800',
  failed: 'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-gray-200 bg-gray-100 text-gray-500',
}
export const SOURCE_LABEL: Record<string, string> = {
  manual: 'Elle', receipt: 'Makbuz', transfer: 'Havale', kurban: 'Kurban', bulk: 'Toplu', auto: 'Otomatik', otp: 'Giriş kodu', test: 'Deneme',
}
export const MODE_LABEL: Record<SmsTemplate['auto_mode'], string> = {
  auto: 'Otomatik gönder', manual: 'Yalnızca elle', off: 'Kapalı',
}

/** 1.000,00 — the way amounts are written in SMS texts. */
export const smsAmount = (cents: number) =>
  (cents / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
