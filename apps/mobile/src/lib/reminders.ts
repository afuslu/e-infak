import { useQuery } from '@tanstack/react-query';
import { af } from '@/lib/api';

/** apps/web/lib/reminders.ts ile aynı Hatırlatıcı tipleri (services/backend/app/api/v1/reminders.py). */
export type RepeatKind = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export type Reminder = {
  id: string;
  content: string;
  remind_at: string;
  repeat: RepeatKind;
  source: string;
  notified_at: string | null;
  completed_at: string | null;
  phone: string | null;
  donor: { id: string; name: string; phone: string | null } | null;
  author?: string | null;
  mine?: boolean;
};

export type ReminderSummary = { geciken: number; bugun: number; vadesi_gelen: number };

export const REPEAT_LABEL: Record<RepeatKind, string> = {
  none: 'Tekrar yok', daily: 'Her gün', weekly: 'Her hafta', monthly: 'Her ay', yearly: 'Her yıl',
};
export const REPEAT_OPTIONS = (Object.keys(REPEAT_LABEL) as RepeatKind[]).map((value) => ({ value, label: REPEAT_LABEL[value] }));

export const REMINDERS_KEY = ['reminders'] as const;

/** Menü rozeti: vakti gelmiş açık hatırlatmalar. Dakikada bir yenilenir. */
export function useReminderSummary(enabled = true) {
  return useQuery({
    queryKey: [...REMINDERS_KEY, 'summary'],
    queryFn: () => af<ReminderSummary>('/reminders/summary'),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export const inMinutes = (m: number) => new Date(Date.now() + m * 60_000);
export const tomorrowAt = (hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
};
export const nextHour = () => {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
};

export const SNOOZE_OPTIONS: { label: string; at: () => Date }[] = [
  { label: '10 dakika', at: () => inMinutes(10) },
  { label: '1 saat', at: () => inMinutes(60) },
  { label: 'Yarın 10:00', at: () => tomorrowAt(10) },
  { label: '1 hafta sonra', at: () => { const d = tomorrowAt(10); d.setDate(d.getDate() + 6); return d; } },
];

const pad = (n: number) => String(n).padStart(2, '0');
/** Telefonun kendi saatinde ISO tarih (YYYY-MM-DD) ve SS:DD. */
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "2026-11-26" + "14:30" → Date (telefonun saatinde); geçersizse null. */
export function combine(dateIso: string | null, time: string): Date | null {
  if (!dateIso) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const [h, mi] = [Number(m[1]), Number(m[2])];
  if (h > 23 || mi > 59) return null;
  const [y, mo, d] = dateIso.split('-').map(Number);
  const out = new Date(y, mo - 1, d, h, mi, 0, 0);
  return Number.isNaN(out.getTime()) ? null : out;
}

/** "Bugün 14:30", "Yarın 09:00", "3 Ara 10:00", geçmiş yıl için yıl da. */
export function formatWhen(iso: string): string {
  const at = new Date(iso);
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = Math.floor((new Date(at).setHours(0, 0, 0, 0) - start.getTime()) / 86_400_000);
  const time = localTime(at);
  if (day === 0) return `Bugün ${time}`;
  if (day === 1) return `Yarın ${time}`;
  if (day === -1) return `Dün ${time}`;
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (at.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return `${at.toLocaleDateString('tr-TR', opts)} ${time}`;
}

export const isDue = (r: Reminder) => !r.completed_at && new Date(r.remind_at) <= new Date();
