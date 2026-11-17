import { Linking, Platform } from 'react-native';

/** Tam tutarlar kuruşsuz, diğerleri kuruşlu (1.250 ₺ / 1.250,50 ₺). */
export function money(cents: number | null | undefined, currency = 'TRY'): string {
  const value = (cents || 0) / 100;
  try {
    return value.toLocaleString('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** "1.250,50" ya da "1250.5" → kuruş. Geçersizse null. */
export function toCents(text: string): number | null {
  let t = (text || '').trim().replace(/\s|₺/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const value = Number(t);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  const value = cents / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}

export function date(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Istanbul' });
}

export function dateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul',
  });
}

/** "GG.AA.YYYY" → "YYYY-MM-DD"; geçersizse null. */
export function trDateToIso(text: string): string | null {
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec((text || '').trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isoToTrDate(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

export function todayIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
  return parts.slice(0, 10);
}

export function initials(name?: string | null): string {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toLocaleUpperCase('tr-TR') || '?';
}

/** Maskeli numara (0532 *** ** 12) aranamaz. */
export function isDialable(phone?: string | null): boolean {
  return !!phone && !phone.includes('*') && phone.replace(/\D/g, '').length >= 10;
}

function intl(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `90${digits.slice(1)}`;
  if (digits.length === 10) digits = `90${digits}`;
  return digits;
}

export function call(phone: string) {
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => {});
}

export function whatsapp(phone: string, text?: string) {
  const url = `https://wa.me/${intl(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  Linking.openURL(url).catch(() => {});
}

export function mail(email: string) {
  Linking.openURL(`mailto:${email}`).catch(() => {});
}

export function openUrl(url: string) {
  if (Platform.OS === 'web') {
    globalThis.open?.(url, '_blank');
    return;
  }
  Linking.openURL(url).catch(() => {});
}

/** İstemci tarafı tekrar denemelerinde aynı kalan anahtar (en az 16 karakter). */
export function idempotencyKey(prefix = 'mob'): string {
  const random = () => Math.random().toString(36).slice(2, 12);
  return `${prefix}-${Date.now().toString(36)}-${random()}${random()}`;
}

const TR_IBAN = /^TR\d{24}$/;

export function validTrIban(value: string): boolean {
  const iban = value.replace(/\s/g, '').toUpperCase();
  if (!TR_IBAN.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of moved) {
    const digits = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}
