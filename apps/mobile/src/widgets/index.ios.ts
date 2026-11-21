import { Appearance } from 'react-native';
import { api } from '@/lib/api';
import { getItem } from '@/lib/storage';
import { KEY_THEME_MODE } from '@/theme';
import InflowWidget from './InflowWidget.ios';
import QuickActionsWidget from './QuickActionsWidget.ios';
import TransfersWidget from './TransfersWidget.ios';
import TasksGoalsWidget from './TasksGoalsWidget.ios';
import { bundleToWidgetProps, SIGNED_OUT, type WidgetBundleResponse, type WidgetProps } from './data';

async function resolveDark(): Promise<boolean> {
  const saved = await getItem(KEY_THEME_MODE);
  if (saved === 'dark') return true;
  if (saved === 'light') return false;
  return Appearance.getColorScheme() === 'dark';
}

/** Uygulamadaki son veriyi tüm iOS widget'larına gönderir. */
export async function updateHomeWidgets(props: WidgetProps | null): Promise<void> {
  const dark = await resolveDark();
  let data: WidgetProps = props ? { ...props, dark } : { ...SIGNED_OUT, dark };
  try {
    if (props) {
      const bundle = await api<WidgetBundleResponse>('/mobile/widget-bundle').catch(() => null);
      if (bundle) data = bundleToWidgetProps(bundle, props.org, dark);
    }
    InflowWidget.updateSnapshot(data);
    QuickActionsWidget.updateSnapshot(data);
    TransfersWidget.updateSnapshot(data);
    TasksGoalsWidget.updateSnapshot(data);
  } catch {
    // Widget uzantısı yoksa (ör. Expo Go) sessizce geçilir.
  }
}
