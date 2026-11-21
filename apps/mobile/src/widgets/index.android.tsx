import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { setItem } from '@/lib/storage';
import { AndroidInflowWidget } from './AndroidInflowWidget';
import { KEY_ORG, KEY_WIDGET } from './androidTask';
import { SIGNED_OUT, type WidgetProps } from './data';

/** Uygulamadaki son veriyi Android widget'ına basar ve arka plan yenilemesi için saklar. */
export async function updateHomeWidgets(props: WidgetProps | null): Promise<void> {
  const data = props || SIGNED_OUT;
  try {
    await setItem(KEY_WIDGET, JSON.stringify(data));
    if (props) await setItem(KEY_ORG, props.org);
    await requestWidgetUpdate({
      widgetName: 'EinfakInflow',
      renderWidget: (info) => <AndroidInflowWidget data={data} compact={info.height < 140} />,
      widgetNotFound: () => undefined,
    });
  } catch {
    // Widget eklenmemişse ya da yerel modül yoksa sessizce geçilir.
  }
}
