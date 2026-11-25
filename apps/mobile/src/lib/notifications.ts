import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api, ApiError, df, pf } from './api';
import { getItem, removeItem, setItem } from './storage';

export type PushScope = 'tenant' | 'donor' | 'platform';

const KEY_PUSH = 'einfak_push_token';
const KEY_PUSH_SCOPE = 'einfak_push_scope';
const supported = Platform.OS !== 'web';

function callPushApi<T = any>(scope: PushScope, action: 'register' | 'unregister' | 'test', body?: Record<string, any>): Promise<T> {
  if (scope === 'donor') {
    if (action === 'test') return df<T>('/me/test-push', { method: 'POST' });
    return df<T>('/me/device-token', { method: action === 'register' ? 'POST' : 'DELETE', body });
  }
  if (scope === 'platform') {
    if (action === 'test') return pf<T>('/me/test-push', { method: 'POST' });
    return pf<T>('/me/device-token', { method: action === 'register' ? 'POST' : 'DELETE', body });
  }
  if (action === 'test') return api<T>('/mobile/test-push', { method: 'POST' });
  return api<T>('/mobile/device-token', { method: action === 'register' ? 'POST' : 'DELETE', body });
}

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
  void ensureAndroidChannels();
  void setupInteractiveCategories();
}

export function syncBadgeCount(count: number): void {
  if (!supported) return;
  Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count || 0))).catch(() => {});
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
  try {
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
  } catch {
    // Kanal oluşturma hatası uygulamayı durdurmamalı.
  }
}

/** İzin ister, Expo push token'ı alır ve aktif oturum kapsamına (personel / bağışçı / platform) kaydeder. */
export async function registerPush(ask = true, scope: PushScope = 'tenant'): Promise<{ ok: boolean; message: string }> {
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
  await callPushApi(scope, 'register', { token, platform: Platform.OS });
  await setItem(KEY_PUSH, token);
  await setItem(KEY_PUSH_SCOPE, scope);
  return { ok: true, message: 'Bildirimler açık.' };
}

/** İşletim sistemi push token yenilerse sunucudaki kaydı sessizce günceller. */
export function watchPushTokenRefresh(scope: PushScope = 'tenant'): () => void {
  if (!supported) return () => {};
  const sub = Notifications.addPushTokenListener(async () => {
    const existing = await getItem(KEY_PUSH);
    if (!existing) return;
    await registerPush(false, scope).catch(() => {});
  });
  return () => sub.remove();
}

export async function clearLocalPushState(): Promise<void> {
  if (!supported) return;
  syncBadgeCount(0);
  await Promise.all([removeItem(KEY_PUSH), removeItem(KEY_PUSH_SCOPE)]);
}

export async function unregisterPush(explicitScope?: PushScope): Promise<void> {
  if (!supported) return;
  const token = await getItem(KEY_PUSH);
  const storedScope = (await getItem(KEY_PUSH_SCOPE)) as PushScope | null;
  const scope: PushScope = explicitScope || storedScope || 'tenant';
  syncBadgeCount(0);
  if (token) {
    await callPushApi(scope, 'unregister', { token, platform: Platform.OS }).catch(() => {});
  }
  await Promise.all([removeItem(KEY_PUSH), removeItem(KEY_PUSH_SCOPE)]);
}

export async function pushEnabled(scope?: PushScope): Promise<boolean> {
  if (!supported) return false;
  const token = await getItem(KEY_PUSH);
  if (!token) return false;
  if (!scope) return true;
  const storedScope = (await getItem(KEY_PUSH_SCOPE)) || 'tenant';
  return storedScope === scope;
}

/** Sunucuda bu telefonun kaydı yoksa (404) telefonu yeniden kaydedip bir kez daha dener. */
export async function sendTestPush(scope: PushScope = 'tenant'): Promise<void> {
  const send = () => callPushApi(scope, 'test');
  try {
    await send();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    const result = await registerPush(true, scope);
    if (!result.ok) {
      await clearLocalPushState();
      throw new Error(result.message);
    }
    await send();
  }
}
