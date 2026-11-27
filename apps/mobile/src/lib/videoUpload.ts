import { Directory, File, Paths } from 'expo-file-system';
import { absoluteApiUrl, af, api, authHeader, ensureFreshToken } from '@/lib/api';
import { readOfflineJson, writeOfflineJson } from '@/lib/offlineQueue';

/**
 * Kasap tableti video kuyruğu. Kesim videosu kalıcı klasöre taşınır, 5 MB'lık parçalar halinde
 * /admin-features/videos/uploads'a gider (nginx 8 MB üstünü reddeder). Durum dosyada tutulur:
 * bağlantı koparsa ya da uygulama kapanırsa kaldığı parçadan devam eder. Son parça gelince
 * backend videoyu hayvana bağlar ve (ayar açıksa) hissedarlara "kesildi" SMS'ini gönderir.
 */
const KEY = 'einfak_kesim_uploads_v1';

export type KesimUpload = {
  id: string;
  animal_id: string;
  animal_number: string;
  uri: string;
  size: number;
  video_id?: string;
  chunk_bytes?: number;
  sent_bytes: number;
  /** Hayvan sunucuda "kesildi" işaretlendi mi (çevrimdışı kesimde yüklemeden önce yapılır). */
  marked?: boolean;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  created_at: string;
};

type Listener = (items: KesimUpload[]) => void;
const listeners = new Set<Listener>();
let items: KesimUpload[] | null = null;
let pumping: Promise<void> | null = null;

async function load(): Promise<KesimUpload[]> {
  if (!items) items = await readOfflineJson<KesimUpload[]>(KEY, []);
  return items;
}

async function save(): Promise<void> {
  const list = items || [];
  // Biten yüklemeler bir gün listede kalır (ekranda "gönderildi" görünsün), sonra silinir.
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  items = list.filter((i) => i.status !== 'done' || Date.parse(i.created_at) > dayAgo);
  await writeOfflineJson(KEY, items);
  listeners.forEach((l) => l([...(items || [])]));
}

export function subscribeUploads(listener: Listener): () => void {
  listeners.add(listener);
  load().then((list) => listener([...list]));
  return () => listeners.delete(listener);
}

/** Kaydı kalıcı klasöre taşır, hayvanı SMS'siz kesildi işaretler ve kuyruğa ekler; yüklemeyi başlatır. */
export async function enqueueKesimVideo(recordedUri: string, animal: { id: string; animal_number: string }): Promise<void> {
  const dir = new Directory(Paths.document, 'kesim-videolari');
  if (!dir.exists) dir.create({ intermediates: true });
  const source = new File(recordedUri);
  const ext = (recordedUri.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  const target = new File(dir, `${animal.animal_number.replace(/[^A-Za-z0-9_-]/g, '')}-${Date.now()}.${ext}`);
  source.move(target);
  let marked = false;
  try {
    await markSlaughteredSilently(animal.id);
    marked = true;
  } catch {
    // Bağlantı yoksa işaret yüklemeden önce tekrar denenir; video yine de kaybolmaz.
  }
  const list = await load();
  list.push({
    marked,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    animal_id: animal.id,
    animal_number: animal.animal_number,
    uri: target.uri,
    size: target.size || 0,
    sent_bytes: 0,
    status: 'pending',
    created_at: new Date().toISOString(),
  });
  await save();
  pumpUploads();
}

/** Bekleyen yüklemeleri sırayla gönderir; aynı anda tek bir döngü çalışır. */
export function pumpUploads(): Promise<void> {
  if (!pumping) {
    pumping = run().finally(() => {
      pumping = null;
    });
  }
  return pumping;
}

export async function retryFailed(): Promise<void> {
  const list = await load();
  list.forEach((i) => {
    if (i.status === 'error') i.status = 'pending';
  });
  await save();
  pumpUploads();
}

async function run(): Promise<void> {
  const list = await load();
  for (const item of list) {
    if (item.status === 'done') continue;
    try {
      await uploadOne(item);
    } catch (e: any) {
      item.status = 'error';
      item.error = e?.message || 'Yükleme başarısız';
      await save();
    }
  }
}

function contentType(uri: string): string {
  if (uri.endsWith('.mov')) return 'video/quicktime';
  if (uri.endsWith('.webm')) return 'video/webm';
  return 'video/mp4';
}

async function putChunk(videoId: string, index: number, bytes: Uint8Array): Promise<Response> {
  const send = () =>
    fetch(absoluteApiUrl(`/admin-features/videos/uploads/${videoId}/chunks/${index}`), {
      method: 'PUT',
      headers: { ...authHeader(), 'Content-Type': 'application/octet-stream' },
      body: bytes as any,
    });
  let response = await send();
  if (response.status === 401) {
    await ensureFreshToken();
    response = await send();
  }
  return response;
}

async function uploadOne(item: KesimUpload): Promise<void> {
  const file = new File(item.uri);
  if (!file.exists) throw new Error('Video dosyası cihazda bulunamadı');
  const size = file.size || item.size;
  item.status = 'uploading';
  item.error = undefined;
  if (!item.marked) {
    // Video bitmeden kesim işareti gitmeli: backend SMS'i ancak kesilmiş hayvana gönderir.
    await markSlaughteredSilently(item.animal_id);
    item.marked = true;
  }
  if (!item.video_id) {
    await ensureFreshToken();
    const started = await af<{ id: string; chunk_bytes: number }>('/videos/uploads', {
      method: 'POST',
      body: {
        filename: `${item.animal_number}.${item.uri.split('.').pop() || 'mp4'}`,
        size,
        content_type: contentType(item.uri),
        title: `Kurban ${item.animal_number} kesim videosu`,
        kurban_animal_id: item.animal_id,
      },
    });
    item.video_id = started.id;
    item.chunk_bytes = started.chunk_bytes;
    item.size = size;
    item.sent_bytes = 0;
  }
  await save();
  const chunk = item.chunk_bytes || 5 * 1024 * 1024;
  const handle = file.open();
  try {
    while (item.sent_bytes < size) {
      const index = Math.floor(item.sent_bytes / chunk);
      handle.offset = index * chunk;
      const bytes = handle.readBytes(Math.min(chunk, size - index * chunk));
      const response = await putChunk(item.video_id!, index, bytes);
      const body = await response.json().catch(() => ({}));
      if (response.status === 409 && typeof body?.detail?.received_bytes === 'number' && body.detail.received_bytes !== item.sent_bytes) {
        item.sent_bytes = body.detail.received_bytes; // sunucu başka parçada: oradan devam
      } else if (!response.ok) {
        const detail = body?.detail;
        throw new Error(typeof detail === 'string' ? detail : detail?.message || `Sunucu hatası (${response.status})`);
      } else {
        item.sent_bytes = body.received_bytes ?? index * chunk + bytes.length;
        if (body.status === 'ready') item.sent_bytes = size;
      }
      await save();
    }
  } finally {
    handle.close();
  }
  item.status = 'done';
  try {
    file.delete();
  } catch {}
  await save();
}

/** Tabletin kesim işareti: SMS gönderilmez, video yüklenince backend gönderir. */
export function markSlaughteredSilently(animalId: string) {
  return api('/kurban/animals/slaughter', { method: 'POST', body: { items: [{ animal_id: animalId }], notify: false } });
}
