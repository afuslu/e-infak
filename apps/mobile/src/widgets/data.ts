import { money } from '@/lib/format';
import type { Inflow } from '@/api/inflow';

/** Ana ekran widget'ına giden veri: yalnızca hazır metinler (widget tarafında hesap yapılmaz). */
export type WidgetProps = {
  org: string;
  total: string;
  count: string;
  change: string;
  up: boolean;
  lines: string[];
  waiting: string;
  updated: string;
  signedOut: boolean;
};

const SHORT: Record<string, string> = {
  online: 'Online', online_transfer: 'Online havale', transfer: 'Havale', cash: 'Nakit', pos: 'POS', money_box: 'Kumbara',
  dues: 'Aidat', sms: 'SMS',
};

export function widgetProps(inflow: Inflow, org: string): WidgetProps {
  const before = inflow.previous_total_cents;
  const pct = before ? Math.round(((inflow.total_cents - before) / before) * 100) : null;
  const time = new Date(inflow.updated_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
  return {
    org,
    total: money(inflow.total_cents),
    count: `${inflow.count} bağış`,
    change: pct === null ? '' : `${pct >= 0 ? '▲' : '▼'} %${Math.abs(pct)} dün`,
    up: pct === null || pct >= 0,
    lines: inflow.channels.slice(0, 3).map((c) => `${SHORT[c.key] || c.label} ${money(c.total_cents)}`),
    waiting: inflow.waiting_transfers.count ? `${inflow.waiting_transfers.count} havale bekliyor` : '',
    updated: time,
    signedOut: false,
  };
}

export const SIGNED_OUT: WidgetProps = {
  org: 'e-İnfak', total: '—', count: 'Giriş yapın', change: '', up: true, lines: [], waiting: '', updated: '', signedOut: true,
};
