import { getItem, setItem } from '@/lib/storage';
import type { WidgetProps } from './data';
import { isValidWidgetThemeStyle, KEY_WIDGET_THEME_STYLE, type WidgetThemeStyle } from './palette';

/** Web'de ana ekran widget'ı yok; iOS ve Android kendi dosyalarını yükler. */
export async function updateHomeWidgets(_props: WidgetProps | null): Promise<void> {}

export async function refreshHomeWidgets(_fallbackOrg?: string): Promise<boolean> {
  return false;
}

export async function setWidgetThemeAndRefresh(style: WidgetThemeStyle): Promise<void> {
  await setItem(KEY_WIDGET_THEME_STYLE, style);
}

export async function getSavedWidgetThemeStyle(): Promise<WidgetThemeStyle> {
  const saved = await getItem(KEY_WIDGET_THEME_STYLE);
  return isValidWidgetThemeStyle(saved) ? saved : 'system';
}
