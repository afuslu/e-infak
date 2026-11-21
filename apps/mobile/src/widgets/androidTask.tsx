import React from 'react';
import { Appearance } from 'react-native';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { api, loadSession } from '@/lib/api';
import { getItem, setItem } from '@/lib/storage';
import type { Inflow } from '@/api/inflow';
import {
  AndroidCompactWidget,
  AndroidInflowWidget,
  AndroidQuickActionsWidget,
  AndroidTasksGoalsWidget,
  AndroidTransfersWidget,
} from './AndroidInflowWidget';
import { bundleToWidgetProps, SIGNED_OUT, widgetProps, type WidgetBundleResponse, type WidgetProps } from './data';

export const KEY_WIDGET = 'einfak_widget_props';
export const KEY_ORG = 'einfak_widget_org';
export const KEY_THEME_MODE = 'einfak_theme_mode';

async function isWidgetDark(): Promise<boolean> {
  const saved = await getItem(KEY_THEME_MODE);
  if (saved === 'dark') return true;
  if (saved === 'light') return false;
  return Appearance.getColorScheme() === 'dark';
}

export async function cachedProps(): Promise<WidgetProps> {
  const dark = await isWidgetDark();
  try {
    const raw = await getItem(KEY_WIDGET);
    return raw ? { ...(JSON.parse(raw) as WidgetProps), dark } : { ...SIGNED_OUT, dark };
  } catch {
    return { ...SIGNED_OUT, dark };
  }
}

export function renderAndroidWidgetByName(name: string, data: WidgetProps, height: number) {
  switch (name) {
    case 'EinfakCompact':
      return <AndroidCompactWidget data={data} />;
    case 'EinfakQuickActions':
      return <AndroidQuickActionsWidget data={data} />;
    case 'EinfakTransfers':
      return <AndroidTransfersWidget data={data} />;
    case 'EinfakTasksGoals':
      return <AndroidTasksGoalsWidget data={data} />;
    case 'EinfakInflow':
    default:
      return <AndroidInflowWidget data={data} compact={height < 140} />;
  }
}

export async function fetchFreshWidgetProps(fallbackOrg: string): Promise<WidgetProps | null> {
  if (!(await loadSession())) return null;
  const dark = await isWidgetDark();
  const org = (await getItem(KEY_ORG)) || fallbackOrg || 'e-İnfak';
  try {
    const bundle = await api<WidgetBundleResponse>('/mobile/widget-bundle');
    const fresh = bundleToWidgetProps(bundle, org, dark);
    await setItem(KEY_WIDGET, JSON.stringify(fresh));
    return fresh;
  } catch {
    try {
      const inflow = await api<Inflow>('/mobile/inflow', { query: { period: 'today' } });
      const fresh = widgetProps(inflow, org, dark);
      await setItem(KEY_WIDGET, JSON.stringify(fresh));
      return fresh;
    } catch {
      return null;
    }
  }
}

const KNOWN_WIDGETS = new Set([
  'EinfakInflow',
  'EinfakCompact',
  'EinfakQuickActions',
  'EinfakTransfers',
  'EinfakTasksGoals',
]);

/** Uygulama kapalıyken: önce son bilinen veri, sonra API'den taze veri (30 dk'da bir, eklenince veya ↻ dokununca). */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const name = props.widgetInfo.widgetName;
  if (!KNOWN_WIDGETS.has(name)) return;

  const shouldRefresh =
    props.widgetAction === 'WIDGET_ADDED' ||
    props.widgetAction === 'WIDGET_UPDATE' ||
    props.widgetAction === 'WIDGET_RESIZED' ||
    (props.widgetAction === 'WIDGET_CLICK' && props.clickAction === 'REFRESH');

  if (!shouldRefresh) return;

  const cached = await cachedProps();
  props.renderWidget(renderAndroidWidgetByName(name, cached, props.widgetInfo.height));

  if (name === 'EinfakQuickActions') return;

  const fresh = await fetchFreshWidgetProps(cached.org);
  if (fresh) {
    props.renderWidget(renderAndroidWidgetByName(name, fresh, props.widgetInfo.height));
  }
}
