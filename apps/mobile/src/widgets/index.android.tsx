import { requestWidgetUpdate } from 'react-native-android-widget';
import { getItem, setItem } from '@/lib/storage';
import {
  cachedProps,
  fetchFreshWidgetProps,
  KEY_ORG,
  KEY_WIDGET,
  KNOWN_ANDROID_WIDGETS,
  renderAndroidWidgetByName,
  resolveWidgetThemeStyle,
} from './androidTask';
import { SIGNED_OUT, type WidgetProps } from './data';
import { KEY_WIDGET_THEME_STYLE, type WidgetThemeStyle } from './palette';

/** Uygulamadaki son veriyi tüm Android widget'larına basar ve arka plan yenilemesi için saklar. */
export async function updateHomeWidgets(props: WidgetProps | null): Promise<void> {
  const themeStyle = await resolveWidgetThemeStyle();
  let data: WidgetProps;
  if (props === null) {
    data = { ...SIGNED_OUT, themeStyle };
  } else {
    data = { ...props, themeStyle };
  }

  try {
    if (props) {
      await setItem(KEY_ORG, props.org);
      const bundle = await fetchFreshWidgetProps(props.org);
      if (bundle) {
        data = { ...bundle, themeStyle };
      } else if (props.total && props.total !== SIGNED_OUT.total) {
        await setItem(KEY_WIDGET, JSON.stringify(data));
      } else {
        data = await cachedProps();
      }
    } else {
      await setItem(KEY_WIDGET, JSON.stringify(data));
    }
    await pushAndroidWidgets(data);
  } catch {
    // Widget eklenmemişse ya da yerel modül yoksa sessizce geçilir.
  }
}

/** Sunucudan taze veri çekerek Android widget'larını yeniler; ağ hatasında mevcut önbelleği korur. */
export async function refreshHomeWidgets(fallbackOrg?: string): Promise<boolean> {
  if (fallbackOrg) {
    await setItem(KEY_ORG, fallbackOrg).catch(() => {});
  }
  const fresh = await fetchFreshWidgetProps(fallbackOrg || SIGNED_OUT.org);
  if (!fresh) return false;
  try {
    await pushAndroidWidgets(fresh);
  } catch {
    // Sessiz geçilir.
  }
  return true;
}

/** Sadece tema stili değiştiğinde veya elle yenilemede anında tüm widget'ları yeniden boyar. */
export async function setWidgetThemeAndRefresh(style: WidgetThemeStyle): Promise<void> {
  await setItem(KEY_WIDGET_THEME_STYLE, style);
  const current = await cachedProps();
  const next: WidgetProps = { ...current, themeStyle: style };
  await setItem(KEY_WIDGET, JSON.stringify(next));
  try {
    await pushAndroidWidgets(next);
  } catch {
    // Sessiz geçilir.
  }
}

export async function getSavedWidgetThemeStyle(): Promise<WidgetThemeStyle> {
  const saved = await getItem(KEY_WIDGET_THEME_STYLE);
  if (
    saved === 'system' ||
    saved === 'light' ||
    saved === 'warm' ||
    saved === 'dark' ||
    saved === 'emerald' ||
    saved === 'amoled'
  ) {
    return saved;
  }
  return 'system';
}

async function pushAndroidWidgets(data: WidgetProps): Promise<void> {
  await Promise.all(
    KNOWN_ANDROID_WIDGETS.map((widgetName) =>
      requestWidgetUpdate({
        widgetName,
        renderWidget: (info) => renderAndroidWidgetByName(widgetName, data, info.height),
        widgetNotFound: () => undefined,
      }).catch(() => undefined)
    )
  );
}
