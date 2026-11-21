import { Appearance } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { getItem, setItem } from '@/lib/storage';
import {
  fetchFreshWidgetProps,
  KEY_ORG,
  KEY_THEME_MODE,
  KEY_WIDGET,
  renderAndroidWidgetByName,
} from './androidTask';
import { SIGNED_OUT, type WidgetProps } from './data';

const ALL_WIDGETS = [
  'EinfakInflow',
  'EinfakCompact',
  'EinfakQuickActions',
  'EinfakTransfers',
  'EinfakTasksGoals',
] as const;

async function resolveDark(): Promise<boolean> {
  const saved = await getItem(KEY_THEME_MODE);
  if (saved === 'dark') return true;
  if (saved === 'light') return false;
  return Appearance.getColorScheme() === 'dark';
}

/** Uygulamadaki son veriyi tüm Android widget'larına basar ve arka plan yenilemesi için saklar. */
export async function updateHomeWidgets(props: WidgetProps | null): Promise<void> {
  const dark = await resolveDark();
  let data: WidgetProps = props ? { ...props, dark } : { ...SIGNED_OUT, dark };
  try {
    if (props) {
      await setItem(KEY_ORG, props.org);
      const bundle = await fetchFreshWidgetProps(props.org);
      if (bundle) data = { ...bundle, dark };
      else await setItem(KEY_WIDGET, JSON.stringify(data));
    } else {
      await setItem(KEY_WIDGET, JSON.stringify(data));
    }
    await Promise.all(
      ALL_WIDGETS.map((widgetName) =>
        requestWidgetUpdate({
          widgetName,
          renderWidget: (info) => renderAndroidWidgetByName(widgetName, data, info.height),
          widgetNotFound: () => undefined,
        }).catch(() => undefined)
      )
    );
  } catch {
    // Widget eklenmemişse ya da yerel modül yoksa sessizce geçilir.
  }
}
