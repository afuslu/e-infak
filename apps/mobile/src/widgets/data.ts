import { money } from '@/lib/format';
import type { Inflow } from '@/api/inflow';

/** Ana ekran widget'ına giden veri: yalnızca hazır metinler (widget tarafında hesap yapılmaz). */
export type WidgetProps = {
  org: string;
  total: string;
  monthTotal?: string;
  count: string;
  change: string;
  up: boolean;
  lines: string[];
  waiting: string;
  waitingCount?: number;
  waitingTotal?: string;
  transfers?: Array<{ sender: string; amount: string }>;
  tasksOpen?: number;
  tasksOverdue?: number;
  tasks?: Array<{ title: string; overdue: boolean }>;
  campaign?: { title: string; percent: number; summary: string } | null;
  dark?: boolean;
  updated: string;
  signedOut: boolean;
};

export type WidgetBundleResponse = {
  today: {
    total_cents: number;
    count: number;
    channels: Array<{ key: string; label: string; total_cents: number; count: number }>;
    previous_total_cents: number;
    previous_count: number;
  };
  month: { total_cents: number; count: number };
  pending_transfers: {
    count: number;
    total_cents: number;
    items: Array<{ id: string; sender: string; amount_cents: number; booked_at: string }>;
  };
  tasks: {
    open_count: number;
    overdue_count: number;
    items: Array<{ id: string; title: string; due_date: string | null; overdue: boolean }>;
  };
  campaign: {
    id: string;
    title: string;
    target_cents: number;
    collected_cents: number;
    percent: number;
  } | null;
  unread_notifications: number;
  updated_at: string;
};

const SHORT: Record<string, string> = {
  online: 'Online',
  online_transfer: 'Online havale',
  transfer: 'Havale',
  cash: 'Nakit',
  pos: 'POS',
  money_box: 'Kumbara',
  dues: 'Aidat',
  sms: 'SMS',
};

export function widgetProps(inflow: Inflow, org: string, dark = false): WidgetProps {
  const before = inflow.previous_total_cents;
  const pct = before ? Math.round(((inflow.total_cents - before) / before) * 100) : null;
  const time = new Date(inflow.updated_at).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
  return {
    org,
    total: money(inflow.total_cents),
    count: `${inflow.count} bağış`,
    change: pct === null ? '' : `${pct >= 0 ? '▲' : '▼'} %${Math.abs(pct)} dün`,
    up: pct === null || pct >= 0,
    lines: inflow.channels.slice(0, 3).map((c) => `${SHORT[c.key] || c.label} ${money(c.total_cents)}`),
    waiting: inflow.waiting_transfers.count ? `${inflow.waiting_transfers.count} havale bekliyor` : '',
    waitingCount: inflow.waiting_transfers.count,
    waitingTotal: money(inflow.waiting_transfers.total_cents),
    dark,
    updated: time,
    signedOut: false,
  };
}

export function bundleToWidgetProps(bundle: WidgetBundleResponse, org: string, dark = false): WidgetProps {
  const before = bundle.today.previous_total_cents;
  const pct = before ? Math.round(((bundle.today.total_cents - before) / before) * 100) : null;
  const time = new Date(bundle.updated_at).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
  return {
    org,
    total: money(bundle.today.total_cents),
    monthTotal: money(bundle.month.total_cents),
    count: `${bundle.today.count} bağış`,
    change: pct === null ? '' : `${pct >= 0 ? '▲' : '▼'} %${Math.abs(pct)} dün`,
    up: pct === null || pct >= 0,
    lines: bundle.today.channels.slice(0, 3).map((c) => `${SHORT[c.key] || c.label} ${money(c.total_cents)}`),
    waiting: bundle.pending_transfers.count ? `${bundle.pending_transfers.count} havale bekliyor` : '',
    waitingCount: bundle.pending_transfers.count,
    waitingTotal: money(bundle.pending_transfers.total_cents),
    transfers: bundle.pending_transfers.items.slice(0, 3).map((t) => ({
      sender: t.sender,
      amount: money(t.amount_cents),
    })),
    tasksOpen: bundle.tasks.open_count,
    tasksOverdue: bundle.tasks.overdue_count,
    tasks: bundle.tasks.items.slice(0, 3).map((t) => ({
      title: t.title,
      overdue: t.overdue,
    })),
    campaign: bundle.campaign
      ? {
          title: bundle.campaign.title,
          percent: bundle.campaign.percent,
          summary: `${money(bundle.campaign.collected_cents)} / ${money(bundle.campaign.target_cents)}`,
        }
      : null,
    dark,
    updated: time,
    signedOut: false,
  };
}

export const SIGNED_OUT: WidgetProps = {
  org: 'e-İnfak',
  total: '—',
  monthTotal: '—',
  count: 'Giriş yapın',
  change: '',
  up: true,
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
