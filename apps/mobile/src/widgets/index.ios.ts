import { Appearance } from 'react-native';
import { api, getAuthMode, loadSession } from '@/lib/api';
import { getItem, setItem } from '@/lib/storage';
import { KEY_THEME_MODE } from '@/theme';
import InflowWidget from './InflowWidget.ios';
import QuickActionsWidget from './QuickActionsWidget.ios';
import TransfersWidget from './TransfersWidget.ios';
import TasksGoalsWidget from './TasksGoalsWidget.ios';
import { bundleToWidgetProps, SIGNED_OUT, type WidgetBundleResponse, type WidgetProps } from './data';
import { isValidWidgetThemeStyle, KEY_WIDGET_THEME_STYLE, type WidgetThemeStyle } from './palette';

const KEY_IOS_CACHE = 'einfak_widget_props';

async function resolveThemeStyle(): Promise<WidgetThemeStyle> {
  const saved = await getItem(KEY_WIDGET_THEME_STYLE);
  if (isValidWidgetThemeStyle(saved)) return saved;
  const appTheme = await getItem(KEY_THEME_MODE);
  if (appTheme === 'light') return 'light';
  if (appTheme === 'dark') return 'dark';
  return 'system';
}

function resolveFallbackDark(style: WidgetThemeStyle): boolean {
  if (style === 'dark' || style === 'emerald' || style === 'amoled') return true;
  if (style === 'light' || style === 'warm') return false;
  return Appearance.getColorScheme() === 'dark';
}

function pushIosSnapshots(data: WidgetProps) {
  InflowWidget.updateSnapshot(data);
  QuickActionsWidget.updateSnapshot(data);
  TransfersWidget.updateSnapshot(data);
  TasksGoalsWidget.updateSnapshot(data);
}

/** Uygulamadaki son veriyi tüm iOS ana ekran ve kilit ekranı widget'larına gönderir. */
export async function updateHomeWidgets(props: WidgetProps | null): Promise<void> {
  const themeStyle = await resolveThemeStyle();
  const dark = resolveFallbackDark(themeStyle);
  let data: WidgetProps = props ? { ...props, dark, themeStyle } : { ...SIGNED_OUT, dark, themeStyle };
  try {
    if (props) {
      const bundle = await api<WidgetBundleResponse>('/mobile/widget-bundle').catch(() => null);
      if (bundle) {
        data = bundleToWidgetProps(bundle, props.org, dark, themeStyle);
      } else if (!props.total || props.total === SIGNED_OUT.total) {
        const raw = await getItem(KEY_IOS_CACHE);
        if (raw) {
          data = { ...(JSON.parse(raw) as WidgetProps), dark, themeStyle };
        }
      }
    }
    await setItem(KEY_IOS_CACHE, JSON.stringify(data));
    pushIosSnapshots(data);
  } catch {
    // Widget uzantısı yoksa (ör. Expo Go) sessizce geçilir.
  }
}

/** Sunucudan taze veri çekerek iOS widget'larını yeniler; ağ hatasında mevcut önbelleği korur. */
export async function refreshHomeWidgets(fallbackOrg?: string): Promise<boolean> {
  if (!(await loadSession()) || getAuthMode() !== 'tenant') return false;
  const themeStyle = await resolveThemeStyle();
  const dark = resolveFallbackDark(themeStyle);
  const bundle = await api<WidgetBundleResponse>('/mobile/widget-bundle').catch(() => null);
  if (!bundle) return false;
  let org = fallbackOrg || SIGNED_OUT.org;
  try {
    const raw = await getItem(KEY_IOS_CACHE);
    if (!fallbackOrg && raw) {
      const cached = JSON.parse(raw) as WidgetProps;
      if (cached?.org) org = cached.org;
    }
    const fresh = bundleToWidgetProps(bundle, org, dark, themeStyle);
    await setItem(KEY_IOS_CACHE, JSON.stringify(fresh));
    pushIosSnapshots(fresh);
  } catch {
    // Widget uzantısı yoksa (ör. Expo Go) sessizce geçilir.
  }
  return true;
}

export async function setWidgetThemeAndRefresh(style: WidgetThemeStyle): Promise<void> {
  await setItem(KEY_WIDGET_THEME_STYLE, style);
  const dark = resolveFallbackDark(style);
  try {
    const raw = await getItem(KEY_IOS_CACHE);
    const cached: WidgetProps = raw ? { ...(JSON.parse(raw) as WidgetProps), dark, themeStyle: style } : { ...SIGNED_OUT, dark, themeStyle: style };
    await setItem(KEY_IOS_CACHE, JSON.stringify(cached));
    pushIosSnapshots(cached);
  } catch {
    // Sessiz geçilir.
  }
}

export async function getSavedWidgetThemeStyle(): Promise<WidgetThemeStyle> {
  const saved = await getItem(KEY_WIDGET_THEME_STYLE);
  return isValidWidgetThemeStyle(saved) ? saved : 'system';
}
