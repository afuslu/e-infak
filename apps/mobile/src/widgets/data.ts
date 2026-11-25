import { ACTIVE_TENANT } from '@/config/tenant';
import { money } from '@/lib/format';
import type { Inflow } from '@/api/inflow';
import type { WidgetThemeStyle } from './palette';

export type ChannelColorKey = 'emerald' | 'blue' | 'amber' | 'violet' | 'teal';

export type WidgetChannelItem = {
  key: string;
  label: string;
  amount: string;
  count: number;
  percent: number;
  colorKey: ChannelColorKey;
};

export type WidgetSparkPoint = {
  label: string;
  amount: string;
  ratio: number;
  isToday: boolean;
};

export type WidgetTransferItem = {
  id: string;
  sender: string;
  initials: string;
  amount: string;
  time: string;
  ambiguous: boolean;
};

export type WidgetTaskItem = {
  id: string;
  title: string;
  dueLabel: string;
  overdue: boolean;
  inProgress: boolean;
};

export type WidgetCampaignInfo = {
  title: string;
  percent: number;
  collected: string;
  target: string;
  remaining: string;
  summary: string;
};

/** Ana ekran widget'ına giden veri: tüm metinler ve oranlar önceden hesaplanmıştır. */
export type WidgetProps = {
  org: string;
  scheme: string;
  themeStyle: WidgetThemeStyle;
  brandPrimary?: string;
  total: string;
  monthTotal?: string;
  monthCount?: string;
  weekTotal?: string;
  count: string;
  change: string;
  changeLabel?: string;
  up: boolean;
  unreadCount?: number;
  channels?: WidgetChannelItem[];
  otherCurrencies?: string;
  sparkline?: WidgetSparkPoint[];
  lines: string[];
  waiting: string;
  waitingCount?: number;
  waitingTotal?: string;
  transfers?: WidgetTransferItem[];
  tasksOpen?: number;
  tasksOverdue?: number;
  tasks?: WidgetTaskItem[];
  campaign?: WidgetCampaignInfo | null;
  dark?: boolean;
  updated: string;
  signedOut: boolean;
};

export type WidgetBundleResponse = {
  today: {
    total_cents: number;
    count: number;
    channels: Array<{ key: string; label: string; total_cents: number; count: number }>;
    other_currencies?: Array<{ currency: string; count: number; total_cents: number }>;
    previous_total_cents: number;
    previous_count: number;
  };
  month: { total_cents: number; count: number };
  last_7_days?: Array<{
    date: string;
    label: string;
    total_cents: number;
    count: number;
    is_today: boolean;
  }>;
  pending_transfers: {
    count: number;
    total_cents: number;
    items: Array<{ id: string; sender: string; amount_cents: number; booked_at: string; status?: string }>;
  };
  tasks: {
    open_count: number;
    overdue_count: number;
    items: Array<{ id: string; title: string; status?: string; due_date: string | null; overdue: boolean }>;
  };
  campaign: {
    id: string;
    title: string;
    target_cents: number;
    collected_cents: number;
    remaining_cents?: number;
    percent: number;
  } | null;
  unread_notifications: number;
  updated_at: string;
};

const SHORT: Record<string, string> = {
  online: 'Online POS',
  online_transfer: 'Online Havale',
  transfer: 'Havale/EFT',
  cash: 'Nakit',
  pos: 'Fiziki POS',
  money_box: 'Kumbara',
  dues: 'Aidat',
  sms: 'SMS',
};

const CHANNEL_COLOR: Record<string, ChannelColorKey> = {
  online: 'emerald',
  online_transfer: 'teal',
  transfer: 'blue',
  cash: 'amber',
  pos: 'violet',
  money_box: 'teal',
  dues: 'blue',
  sms: 'amber',
};

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function defaultScheme(): string {
  return ACTIVE_TENANT?.scheme || 'einfak';
}

function defaultBrandName(): string {
  return ACTIVE_TENANT?.name || 'e-İnfak';
}

function formatIstanbulTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
}

function makeInitials(name: string): string {
  const parts = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'HV';
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr-TR');
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toLocaleUpperCase('tr-TR');
}

function formatDueLabel(dueDate: string | null | undefined, overdue: boolean): string {
  if (!dueDate) return 'Tarihsiz';
  const parts = dueDate.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dueDate.slice(0, 10);
  const dueUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  const nowParts = nowStr.split('-').map(Number);
  const todayUtc = Date.UTC(nowParts[0], nowParts[1] - 1, nowParts[2]);
  const diffDays = Math.round((dueUtc - todayUtc) / 86_400_000);
  if (diffDays === 0) return 'Bugün';
  if (diffDays === 1) return 'Yarın';
  if (diffDays === -1) return 'Dün gecikti';
  if (diffDays < -1) return `${Math.abs(diffDays)}g gecikti`;
  if (diffDays <= 7) return `${diffDays} gün kaldı`;
  return `${parts[2]} ${MONTHS_TR[parts[1] - 1] || ''}`.trim();
}

function mapChannels(
  rawChannels: Array<{ key: string; label: string; total_cents: number; count: number }>,
  totalCents: number
): WidgetChannelItem[] {
  const denom = Math.max(1, totalCents);
  return rawChannels.slice(0, 4).map((c, idx) => {
    const fallbackOrder: ChannelColorKey[] = ['emerald', 'blue', 'amber', 'violet'];
    return {
      key: c.key,
      label: SHORT[c.key] || c.label,
      amount: money(c.total_cents),
      count: c.count,
      percent: Math.max(2, Math.min(100, Math.round((c.total_cents * 100) / denom))),
      colorKey: CHANNEL_COLOR[c.key] || fallbackOrder[idx % fallbackOrder.length],
    };
  });
}

function mapOtherCurrencies(
  others?: Array<{ currency: string; count: number; total_cents: number }>
): string {
  if (!others || others.length === 0) return '';
  return others
    .slice(0, 3)
    .map((o) => money(o.total_cents, o.currency))
    .join(' · ');
}

function fallbackSparkline(todayCents: number, yesterdayCents: number): WidgetSparkPoint[] {
  const labels = ['G-6', 'G-5', 'G-4', 'G-3', 'Önceki', 'Dün', 'Bugün'];
  const vals = [0, 0, 0, 0, 0, yesterdayCents, todayCents];
  const peak = Math.max(1, ...vals);
  return vals.map((v, idx) => ({
    label: labels[idx],
    amount: money(v),
    ratio: v > 0 ? Math.max(12, Math.round((v * 100) / peak)) : 6,
    isToday: idx === vals.length - 1,
  }));
}

export function widgetProps(
  inflow: Inflow,
  org: string,
  dark = false,
  themeStyle: WidgetThemeStyle = 'system'
): WidgetProps {
  const before = inflow.previous_total_cents;
  const pct = before ? Math.round(((inflow.total_cents - before) / before) * 100) : null;
  const time = formatIstanbulTime(inflow.updated_at);
  const channels = mapChannels(inflow.channels || [], inflow.total_cents);
  return {
    org: org || defaultBrandName(),
    scheme: defaultScheme(),
    themeStyle,
    brandPrimary: ACTIVE_TENANT?.primaryColor,
    total: money(inflow.total_cents),
    count: `${inflow.count} bağış`,
    change: pct === null ? '' : `${pct >= 0 ? '▲' : '▼'} %${Math.abs(pct)}`,
    changeLabel: pct === null ? '' : 'düne göre',
    up: pct === null || pct >= 0,
    unreadCount: 0,
    channels,
    otherCurrencies: mapOtherCurrencies(inflow.other_currencies),
    sparkline: fallbackSparkline(inflow.total_cents, before),
    lines: channels.slice(0, 3).map((c) => `${c.label} ${c.amount}`),
    waiting: inflow.waiting_transfers.count ? `${inflow.waiting_transfers.count} havale bekliyor` : '',
    waitingCount: inflow.waiting_transfers.count,
    waitingTotal: money(inflow.waiting_transfers.total_cents),
    dark,
    updated: time,
    signedOut: false,
  };
}

export function bundleToWidgetProps(
  bundle: WidgetBundleResponse,
  org: string,
  dark = false,
  themeStyle: WidgetThemeStyle = 'system'
): WidgetProps {
  const before = bundle.today.previous_total_cents;
  const pct = before ? Math.round(((bundle.today.total_cents - before) / before) * 100) : null;
  const time = formatIstanbulTime(bundle.updated_at);
  const channels = mapChannels(bundle.today.channels || [], bundle.today.total_cents);

  let sparkline: WidgetSparkPoint[];
  let weekTotalCents = 0;
  if (bundle.last_7_days && bundle.last_7_days.length > 0) {
    const peak = Math.max(1, ...bundle.last_7_days.map((d) => d.total_cents));
    weekTotalCents = bundle.last_7_days.reduce((acc, d) => acc + (d.total_cents || 0), 0);
    sparkline = bundle.last_7_days.map((d) => ({
      label: d.label,
      amount: money(d.total_cents),
      ratio: d.total_cents > 0 ? Math.max(12, Math.round((d.total_cents * 100) / peak)) : 6,
      isToday: d.is_today,
    }));
  } else {
    sparkline = fallbackSparkline(bundle.today.total_cents, before);
    weekTotalCents = bundle.today.total_cents + before;
  }

  const remainingCents = bundle.campaign
    ? bundle.campaign.remaining_cents ?? Math.max(0, bundle.campaign.target_cents - bundle.campaign.collected_cents)
    : 0;

  return {
    org: org || defaultBrandName(),
    scheme: defaultScheme(),
    themeStyle,
    brandPrimary: ACTIVE_TENANT?.primaryColor,
    total: money(bundle.today.total_cents),
    monthTotal: money(bundle.month.total_cents),
    monthCount: `${bundle.month.count} bağış`,
    weekTotal: money(weekTotalCents),
    count: `${bundle.today.count} bağış`,
    change: pct === null ? '' : `${pct >= 0 ? '▲' : '▼'} %${Math.abs(pct)}`,
    changeLabel: pct === null ? '' : 'düne göre',
    up: pct === null || pct >= 0,
    unreadCount: bundle.unread_notifications || 0,
    channels,
    otherCurrencies: mapOtherCurrencies(bundle.today.other_currencies),
    sparkline,
    lines: channels.slice(0, 3).map((c) => `${c.label} ${c.amount}`),
    waiting: bundle.pending_transfers.count ? `${bundle.pending_transfers.count} havale bekliyor` : '',
    waitingCount: bundle.pending_transfers.count,
    waitingTotal: money(bundle.pending_transfers.total_cents),
    transfers: (bundle.pending_transfers.items || []).slice(0, 4).map((t) => ({
      id: t.id,
      sender: t.sender,
      initials: makeInitials(t.sender),
      amount: money(t.amount_cents),
      time: formatIstanbulTime(t.booked_at),
      ambiguous: String(t.status || '').toLowerCase() === 'ambiguous',
    })),
    tasksOpen: bundle.tasks.open_count,
    tasksOverdue: bundle.tasks.overdue_count,
    tasks: (bundle.tasks.items || []).slice(0, 4).map((t) => ({
      id: t.id,
      title: t.title,
      dueLabel: formatDueLabel(t.due_date, t.overdue),
      overdue: t.overdue,
      inProgress: t.status === 'in_progress',
    })),
    campaign: bundle.campaign
      ? {
          title: bundle.campaign.title,
          percent: bundle.campaign.percent,
          collected: money(bundle.campaign.collected_cents),
          target: money(bundle.campaign.target_cents),
          remaining: money(remainingCents),
          summary: `${money(bundle.campaign.collected_cents)} / ${money(bundle.campaign.target_cents)}`,
        }
      : null,
    dark,
    updated: time,
    signedOut: false,
  };
}

export const SIGNED_OUT: WidgetProps = {
  org: defaultBrandName(),
  scheme: defaultScheme(),
  themeStyle: 'system',
  brandPrimary: ACTIVE_TENANT?.primaryColor,
  total: '—',
  monthTotal: '—',
  monthCount: '0 bağış',
  weekTotal: '—',
  count: 'Giriş yapın',
  change: '',
  changeLabel: '',
  up: true,
  unreadCount: 0,
  channels: [],
  otherCurrencies: '',
  sparkline: [],
  lines: [],
  waiting: '',
  waitingCount: 0,
  waitingTotal: '—',
  transfers: [],
  tasksOpen: 0,
  tasksOverdue: 0,
  tasks: [],
  campaign: null,
  dark: false,
  updated: '',
  signedOut: true,
};
