import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api, ApiError } from './api';
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
      shouldSetBadge: true,
    }),
  });
  void setupInteractiveCategories();
}

async function setupInteractiveCategories() {
  if (!supported) return;
  try {
    await Notifications.setNotificationCategoryAsync('transfer_waiting', [
      { identifier: 'open_transfers', buttonTitle: 'İncele', options: { opensAppToForeground: true } },
      { identifier: 'open_receipt', buttonTitle: 'Makbuz Kes', options: { opensAppToForeground: true } },
    ]);
    await Notifications.setNotificationCategoryAsync('task_assigned', [
      { identifier: 'open_tasks', buttonTitle: 'Göreve Git', options: { opensAppToForeground: true } },
    ]);
    await Notifications.setNotificationCategoryAsync('donation', [
      { identifier: 'open_donation', buttonTitle: 'Makbuzu Gör', options: { opensAppToForeground: true } },
    ]);
  } catch {
    // Kategori kaydı desteklenmeyen ortamlarda sessizce geçilir.
  }
}

async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Genel',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync('money_in', {
    name: 'Para Girişleri & Bağışlar',
    description: 'Online bağış, havale ve makbuz bildirimleri',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#059669',
  });
  await Notifications.setNotificationChannelAsync('urgent', {
    name: 'Acil Uyarılar & Büyük Bağışlar',
    description: 'Yüksek tutarlı bağışlar, başarısız ödemeler ve sistem uyarıları',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#DC2626',
  });
  await Notifications.setNotificationChannelAsync('tasks', {
    name: 'Görevler & Hatırlatmalar',
    description: 'Personel görevleri, bağışçı takibi ve kumbara hatırlatmaları',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#0D9488',
  });
  await Notifications.setNotificationChannelAsync('summary', {
    name: 'Günlük & Haftalık Özetler',
    description: 'Gün sonu ve haftalık yönetici özet raporları',
    importance: Notifications.AndroidImportance.LOW,
  });
}

/** İzin ister, Expo push token'ı alır ve backend'e kaydeder. Sonuç mesajı döner. */
export async function registerPush(ask = true): Promise<{ ok: boolean; message: string }> {
  if (!supported) return { ok: false, message: 'Bildirimler tarayıcı önizlemesinde desteklenmez.' };
  if (!Device.isDevice) return { ok: false, message: 'Bildirimler yalnızca gerçek cihazda çalışır.' };
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { ok: false, message: 'Bildirim izni verilmedi.' };
  await ensureAndroidChannels();
  await setupInteractiveCategories();
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (error) {
    console.warn('Expo push token alınamadı', error);
    return { ok: false, message: 'Telefon bildirim servisine kaydedilemedi. İnternetinizi ve uygulama sürümünü kontrol edin.' };
  }
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

/** Sunucuda bu telefonun kaydı yoksa (404) telefonu yeniden kaydedip bir kez daha dener. */
export async function sendTestPush(): Promise<void> {
  const send = () => api('/mobile/test-push', { method: 'POST' });
  try {
    await send();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    const result = await registerPush();
    if (!result.ok) {
      await removeItem(KEY_PUSH);
      throw new Error(result.message);
    }
    await send();
  }
}
