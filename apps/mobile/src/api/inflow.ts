import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { colors } from '@/theme';

export type InflowChannel = { key: string; label: string; count: number; total_cents: number };
export type InflowItem = {
  id: string; receipt_number: string; amount_cents: number; currency: string; channel: string; channel_label: string;
  donor_id: string; donor_name: string | null; is_anonymous: boolean; campaign_title: string | null; paid_at: string;
};
export type Inflow = {
  period: 'today' | 'week' | 'month'; sees_all: boolean; currency: string; total_cents: number; count: number;
  channels: InflowChannel[]; other_currencies: { currency: string; count: number; total_cents: number }[];
  previous_total_cents: number; previous_count: number; series: number[]; series_unit: 'hour' | 'day';
  recent: InflowItem[]; waiting_transfers: { count: number; total_cents: number }; failed_payments_today: number;
  unread_notifications: number; updated_at: string;
};

export const CHANNEL_COLORS: Record<string, string> = {
  online: '#2563EB', online_transfer: '#0891B2', transfer: '#7C3AED', cash: colors.primary, pos: '#DB2777',
  money_box: '#D97706', dues: '#0D9488', sms: '#4F46E5',
};

/** Canlı para girişi özeti: ekran açıkken 30 sn'de bir yenilenir. */
export function useInflow(period: Inflow['period'], enabled = true) {
  return useQuery({
    queryKey: ['inflow', period],
    enabled,
    queryFn: () => api<Inflow>('/mobile/inflow', { query: { period } }),
    refetchInterval: 30_000,
  });
}

export function changeText(now: number, before: number): string | null {
  if (!before) return now ? 'Önceki dönemde giriş yok' : null;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? '▲' : '▼'} %${Math.abs(pct)} önceki döneme göre`;
}

export type StaffNotification = {
  id: string; kind: string; channel: string | null; title: string; body: string; amount_cents: number | null;
  currency: string | null; data: Record<string, any>; read: boolean; pushed: boolean; created_at: string;
};
