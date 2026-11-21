import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { api, af } from '@/lib/api';

const KEY_OFFLINE_QUEUE = 'einfak_offline_queue_v1';

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

let activeSync: Promise<{ synced: number; failed: number }> | null = null;

export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  if (activeSync) return activeSync;
  activeSync = (async () => {
    const list = await listOfflineQueue();
    if (!list.length) return { synced: 0, failed: 0 };

    let synced = 0;
    const remaining: OfflineItem[] = [];

    for (const item of list) {
      try {
        if (item.useAf) {
          await af(item.endpoint, { method: 'POST', body: item.body });
        } else {
          await api(item.endpoint, { method: 'POST', body: item.body });
        }
        synced += 1;
      } catch (e: any) {
        remaining.push({ ...item, last_error: e?.message || 'Bağlantı hatası' });
      }
    }

    await writeOfflineJson(KEY_OFFLINE_QUEUE, remaining);
    return { synced, failed: remaining.length };
  })();
  try {
    return await activeSync;
  } finally {
    activeSync = null;
  }
}
