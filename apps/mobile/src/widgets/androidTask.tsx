import React from 'react';
import { Appearance } from 'react-native';
import type { WidgetRepresentation, WidgetTaskHandlerProps } from 'react-native-android-widget';
import { api, getAuthMode, loadSession } from '@/lib/api';
import { getItem, setItem } from '@/lib/storage';
import type { Inflow } from '@/api/inflow';
import {
  AndroidCockpitWidget,
  AndroidCompactWidget,
  AndroidInflowWidget,
  AndroidQuickActionsWidget,
  AndroidTasksGoalsWidget,
  AndroidTransfersWidget,
} from './AndroidInflowWidget';
import { bundleToWidgetProps, SIGNED_OUT, widgetProps, type WidgetBundleResponse, type WidgetProps } from './data';
import {
  isValidWidgetThemeStyle,
  KEY_WIDGET_THEME_STYLE,
  resolveWidgetPalette,
  type WidgetPalette,
  type WidgetThemeStyle,
} from './palette';

export const KEY_WIDGET = 'einfak_widget_props';
export const KEY_ORG = 'einfak_widget_org';
export const KEY_THEME_MODE = 'einfak_theme_mode';

export async function resolveWidgetThemeStyle(): Promise<WidgetThemeStyle> {
  const widgetPref = await getItem(KEY_WIDGET_THEME_STYLE);
  if (isValidWidgetThemeStyle(widgetPref)) return widgetPref;
  const appTheme = await getItem(KEY_THEME_MODE);
  if (appTheme === 'light') return 'light';
  if (appTheme === 'dark') return 'dark';
  return 'system';
}

async function isWidgetDark(style: WidgetThemeStyle): Promise<boolean> {
  if (style === 'dark' || style === 'emerald' || style === 'amoled') return true;
  if (style === 'light' || style === 'warm') return false;
  return Appearance.getColorScheme() === 'dark';
}

export async function cachedProps(): Promise<WidgetProps> {
  const themeStyle = await resolveWidgetThemeStyle();
  const dark = await isWidgetDark(themeStyle);
  try {
    const raw = await getItem(KEY_WIDGET);
    return raw ? { ...(JSON.parse(raw) as WidgetProps), dark, themeStyle } : { ...SIGNED_OUT, dark, themeStyle };
  } catch {
    return { ...SIGNED_OUT, dark, themeStyle };
  }
}

function renderSingleWithPalette(name: string, data: WidgetProps, palette: WidgetPalette, height: number) {
  switch (name) {
    case 'EinfakCompact':
      return <AndroidCompactWidget data={data} palette={palette} />;
    case 'EinfakQuickActions':
      return <AndroidQuickActionsWidget data={data} palette={palette} tall={height >= 108} />;
    case 'EinfakTransfers':
      return <AndroidTransfersWidget data={data} palette={palette} />;
    case 'EinfakTasksGoals':
      return <AndroidTasksGoalsWidget data={data} palette={palette} />;
    case 'EinfakCockpit':
      return <AndroidCockpitWidget data={data} palette={palette} />;
    case 'EinfakInflow':
    default:
      return <AndroidInflowWidget data={data} palette={palette} compact={height < 140} />;
  }
}

/**
 * Android 12+ yerel Gündüz/Gece (`{ light, dark }`) desteğini kullanır:
 * - Kullanıcı `Sistem Otomatik` seçtiyse gündüz `light`, gece `dark` paleti aynı anda teslim edilir;
 *   telefon gündüz/gece moduna geçtiği saniye widget anında renk değiştirir.
 * - Kullanıcı özel bir tema (`Zümrüt Prestij`, `AMOLED Siyah`, `Gündüz Sıcak` vb.) seçtiyse her iki
 *   slota da seçtiği palet verilir.
 */
export function renderAndroidWidgetByName(name: string, data: WidgetProps, height: number): WidgetRepresentation {
  const style = data.themeStyle || 'system';
  const lightPalette = resolveWidgetPalette(style === 'system' ? 'light' : style, false, data.brandPrimary);
  const darkPalette = resolveWidgetPalette(style === 'system' ? 'dark' : style, true, data.brandPrimary);
  return {
    light: renderSingleWithPalette(name, data, lightPalette, height),
    dark: renderSingleWithPalette(name, data, darkPalette, height),
  };
}

export async function fetchFreshWidgetProps(fallbackOrg: string): Promise<WidgetProps | null> {
  if (!(await loadSession()) || getAuthMode() !== 'tenant') return null;
  const themeStyle = await resolveWidgetThemeStyle();
  const dark = await isWidgetDark(themeStyle);
  const org = (await getItem(KEY_ORG)) || fallbackOrg || SIGNED_OUT.org;
  try {
    const bundle = await api<WidgetBundleResponse>('/mobile/widget-bundle');
    const fresh = bundleToWidgetProps(bundle, org, dark, themeStyle);
    await setItem(KEY_WIDGET, JSON.stringify(fresh));
    return fresh;
  } catch {
    try {
      const inflow = await api<Inflow>('/mobile/inflow', { query: { period: 'today' } });
      const fresh = widgetProps(inflow, org, dark, themeStyle);
      await setItem(KEY_WIDGET, JSON.stringify(fresh));
      return fresh;
    } catch {
      return null;
    }
  }
}

export const KNOWN_ANDROID_WIDGETS = [
  'EinfakInflow',
  'EinfakCompact',
  'EinfakQuickActions',
  'EinfakTransfers',
  'EinfakTasksGoals',
  'EinfakCockpit',
] as const;

const KNOWN_SET = new Set<string>(KNOWN_ANDROID_WIDGETS);

/** Uygulama kapalıyken: önce son bilinen veri, sonra API'den taze veri (30 dk'da bir, eklenince veya ↻ dokununca). */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const name = props.widgetInfo.widgetName;
  if (!KNOWN_SET.has(name)) return;

  const shouldRefresh =
    props.widgetAction === 'WIDGET_ADDED' ||
    props.widgetAction === 'WIDGET_UPDATE' ||
    props.widgetAction === 'WIDGET_RESIZED' ||
    (props.widgetAction === 'WIDGET_CLICK' && props.clickAction === 'REFRESH');

  if (!shouldRefresh) return;

  const cached = await cachedProps();
  props.renderWidget(renderAndroidWidgetByName(name, cached, props.widgetInfo.height));

  const fresh = await fetchFreshWidgetProps(cached.org);
  if (fresh) {
    props.renderWidget(renderAndroidWidgetByName(name, fresh, props.widgetInfo.height));
  }
}
