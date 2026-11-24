import { Linking } from 'react-native';
import { call, openUrl, whatsapp } from '@/lib/format';
import type { AppAction } from './types';

const SCREENS: Record<string, string> = {
  home: '/(vitrin)',
  'bagis-yap': '/(vitrin)/bagis-yap',
  sepet: '/(vitrin)/sepet',
  hesabim: '/(vitrin)/hesabim',
  haberler: '/(vitrin)/haberler',
  zekat: '/(vitrin)/zekat',
  iban: '/(vitrin)/iban',
  'makbuz-dogrula': '/(vitrin)/makbuz-dogrula',
  iletisim: '/(vitrin)/iletisim',
};

/** Eylemin uygulama içi yolu; uygulama dışı veya bilinmeyense null. */
export function routeOf(action?: AppAction | null): string | null {
  if (!action?.target) return null;
  switch (action.type) {
    case 'screen':
      return SCREENS[action.target] ?? null;
    case 'page':
      return action.target === 'home' ? SCREENS.home : `/(vitrin)/sayfa/${encodeURIComponent(action.target)}`;
    case 'campaign':
      return `/(vitrin)/kampanya/${encodeURIComponent(action.target)}`;
    case 'news':
      return `/(vitrin)/haber/${encodeURIComponent(action.target)}`;
    default:
      return null;
  }
}

/** Bu sürümün tanıdığı bir eylem mi? Tanınmayan düğmeler hiç çizilmez. */
export function isKnown(action?: AppAction | null): action is AppAction {
  if (!action?.target) return false;
  return routeOf(action) !== null || ['url', 'tel', 'whatsapp', 'email'].includes(action.type);
}

export function openExternal(action: AppAction) {
  if (action.type === 'url' && /^https:\/\//i.test(action.target)) openUrl(action.target);
  else if (action.type === 'tel') call(action.target);
  else if (action.type === 'whatsapp') whatsapp(action.target);
  else if (action.type === 'email') Linking.openURL(`mailto:${action.target}`).catch(() => {});
}
