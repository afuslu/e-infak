import type { WidgetProps } from './data';

/** Web önizlemesi: ana ekran widget'ı yoktur. iOS ve Android için index.ios.ts / index.android.ts. */
export async function updateHomeWidgets(_props: WidgetProps | null): Promise<void> {}
