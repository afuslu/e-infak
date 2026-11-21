import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { api, loadSession } from '@/lib/api';
import { getItem, setItem } from '@/lib/storage';
import type { Inflow } from '@/api/inflow';
import { AndroidInflowWidget } from './AndroidInflowWidget';
import { SIGNED_OUT, widgetProps, type WidgetProps } from './data';

export const KEY_WIDGET = 'einfak_widget_props';
export const KEY_ORG = 'einfak_widget_org';

export async function cachedProps(): Promise<WidgetProps> {
  try {
    const raw = await getItem(KEY_WIDGET);
    return raw ? (JSON.parse(raw) as WidgetProps) : SIGNED_OUT;
  } catch {
    return SIGNED_OUT;
  }
}

/** Uygulama kapalıyken: önce son bilinen veri, sonra API'den taze veri (30 dk'da bir ve widget eklenince). */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetInfo.widgetName !== 'EinfakInflow') return;
  const compact = props.widgetInfo.height < 140;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const cached = await cachedProps();
      props.renderWidget(<AndroidInflowWidget data={cached} compact={compact} />);
      if (!(await loadSession())) return;
      try {
        const inflow = await api<Inflow>('/mobile/inflow', { query: { period: 'today' } });
        const fresh = widgetProps(inflow, (await getItem(KEY_ORG)) || cached.org);
        await setItem(KEY_WIDGET, JSON.stringify(fresh));
        props.renderWidget(<AndroidInflowWidget data={fresh} compact={compact} />);
      } catch {
        // Ağ yoksa son bilinen veri kalır.
      }
      break;
    }
    default:
      break;
  }
}
