import InflowWidget from './InflowWidget.ios';
import { SIGNED_OUT, type WidgetProps } from './data';

/** Uygulamadaki son veriyi iOS widget'ına gönderir (widget kendisi internete çıkamaz). */
export async function updateHomeWidgets(props: WidgetProps | null): Promise<void> {
  try {
    InflowWidget.updateSnapshot(props || SIGNED_OUT);
  } catch {
    // Widget uzantısı yoksa (ör. Expo Go) sessizce geçilir.
  }
}
