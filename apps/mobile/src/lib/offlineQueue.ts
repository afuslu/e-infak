import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { api, af } from '@/lib/api';

const KEY_OFFLINE_QUEUE = 'einfak_offline_queue_v1';
export const KEY_CACHED_CAMPAIGNS = 'einfak_offline_campaigns_v1';

export type OfflineItem = {
  id: string;
  kind: 'receipt' | 'money_box_collection';
  label: string;
  endpoint: string;
  useAf: boolean;
  body: Record<string, any>;
  created_at: string;
  last_error?: string;
};

/** SecureStore 2048-byte limitine takılmadan yerel dosya (veya web localStorage) depolaması. */
export async function readOfflineJson<T>(key: string, fallback: T): Promise<T> {
  try {
    if (Platform.OS === 'web') {
      const raw = globalThis.localStorage?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    }
    const file = new File(Paths.document, `${key}.json`);
    if (!file.exists) return fallback;
    const raw = await file.text();
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeOfflineJson(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value);
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, raw);
    return;
  }
  const file = new File(Paths.document, `${key}.json`);
  file.write(raw);
}

export async function listOfflineQueue(): Promise<OfflineItem[]> {
  return readOfflineJson<OfflineItem[]>(KEY_OFFLINE_QUEUE, []);
}

export async function enqueueOffline(
  item: Omit<OfflineItem, 'id' | 'created_at'>
): Promise<OfflineItem> {
  const list = await listOfflineQueue();
  const next: OfflineItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  };
  await writeOfflineJson(KEY_OFFLINE_QUEUE, [next, ...list]);
  return next;
}

export async function removeOfflineItem(id: string): Promise<void> {
  const list = await listOfflineQueue();
  await writeOfflineJson(KEY_OFFLINE_QUEUE, list.filter((i) => i.id !== id));
}

/** Oturum kapanınca bekleyen kuyruk ve önbellekteki kampanyaları temizler. */
export async function clearOfflineData(): Promise<void> {
  try {
    await writeOfflineJson(KEY_OFFLINE_QUEUE, []);
    await writeOfflineJson(KEY_CACHED_CAMPAIGNS, []);
  } catch {
    // Sessizce geçilir.
  }
}

let activeSync: Promise<{ synced: number; failed: number }> | null = null;

export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  if (activeSync) return activeSync;
  activeSync = (async () => {
    const snapshot = await listOfflineQueue();
    if (!snapshot.length) return { synced: 0, failed: 0 };

    const syncedIds = new Set<string>();
    const errors = new Map<string, string>();

    for (const item of snapshot) {
      try {
        if (item.useAf) {
          await af(item.endpoint, { method: 'POST', body: item.body });
        } else {
          await api(item.endpoint, { method: 'POST', body: item.body });
        }
        syncedIds.add(item.id);
      } catch (e: any) {
        errors.set(item.id, e?.message || 'Bağlantı hatası');
      }
    }

    // Senkronizasyon sürerken eklenen yeni kayıtları kaybetmemek için güncel listeyi yeniden oku.
    const latest = await listOfflineQueue();
    const remaining = latest
      .filter((item) => !syncedIds.has(item.id))
      .map((item) => (errors.has(item.id) ? { ...item, last_error: errors.get(item.id) } : item));

    await writeOfflineJson(KEY_OFFLINE_QUEUE, remaining);
    return { synced: syncedIds.size, failed: errors.size };
  })();
  try {
    return await activeSync;
  } finally {
    activeSync = null;
  }
}
