import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { getItem, removeItem, setItem } from './storage';

const KEY_PUSH = 'einfak_push_token';
const supported = Platform.OS !== 'web';

export function setupNotificationHandler() {
  if (!supported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** İzin ister, Expo push token'ı alır ve backend'e kaydeder. Sonuç mesajı döner. */
export async function registerPush(ask = true): Promise<{ ok: boolean; message: string }> {
  if (!supported) return { ok: false, message: 'Bildirimler tarayıcı önizlemesinde desteklenmez.' };
  if (!Device.isDevice) return { ok: false, message: 'Bildirimler yalnızca gerçek cihazda çalışır.' };
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { ok: false, message: 'Bildirim izni verilmedi.' };
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Genel',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api('/mobile/device-token', { method: 'POST', body: { token, platform: Platform.OS } });
  await setItem(KEY_PUSH, token);
  return { ok: true, message: 'Bildirimler açık.' };
}

export async function unregisterPush(): Promise<void> {
  if (!supported) return;
  const token = await getItem(KEY_PUSH);
  if (!token) return;
  await api('/mobile/device-token', { method: 'DELETE', body: { token } }).catch(() => {});
  await removeItem(KEY_PUSH);
}

export async function pushEnabled(): Promise<boolean> {
  if (!supported) return false;
  return !!(await getItem(KEY_PUSH));
}

export const sendTestPush = () => api('/mobile/test-push', { method: 'POST' });
