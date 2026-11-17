import { Platform } from 'react-native';
import { getItem, removeItem, setItem } from './storage';

// Kurum çözümlemesi: istekler platform adresine gider, backend kurumu Bearer token'daki
// kullanıcıdan bulur (services/backend/app/middleware/tenant.py). Kullanıcı girişte bir
// "kurum adresi" verdiyse istekler o adrese gider ve kurum Host üzerinden çözülür.
const PLATFORM_HOST = process.env.EXPO_PUBLIC_API_HOST || 'e-infak.org';
const FIXED_URL = process.env.EXPO_PUBLIC_API_URL || '';
const DEV_PROXY = __DEV__ && Platform.OS === 'web' && process.env.EXPO_PUBLIC_DEV_PROXY === '1';

const KEY_ACCESS = 'einfak_access_token';
const KEY_REFRESH = 'einfak_refresh_token';
const KEY_HOST = 'einfak_tenant_host';

let accessToken: string | null = null;
let refreshToken: string | null = null;
let host: string = PLATFORM_HOST;
let onSessionLost: (() => void) | null = null;

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: any;
  constructor(status: number, message: string, code?: string, data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export function setSessionLostHandler(handler: (() => void) | null) {
  onSessionLost = handler;
}

export function cleanHost(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

export function currentHost() {
  return host;
}

export function webBase(): string {
  return `https://${host}`;
}

function base(): string {
  if (DEV_PROXY) return `/__api/${host}/api/v1`;
  if (FIXED_URL) return FIXED_URL.replace(/\/$/, '');
  return `https://${host}/api/v1`;
}

export async function loadSession(): Promise<boolean> {
  accessToken = await getItem(KEY_ACCESS);
  refreshToken = await getItem(KEY_REFRESH);
  host = (await getItem(KEY_HOST)) || PLATFORM_HOST;
  return !!refreshToken;
}

async function saveTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  await setItem(KEY_ACCESS, access);
  await setItem(KEY_REFRESH, refresh);
}

export async function clearSession() {
  accessToken = null;
  refreshToken = null;
  host = PLATFORM_HOST;
  await Promise.all([removeItem(KEY_ACCESS), removeItem(KEY_REFRESH), removeItem(KEY_HOST)]);
}

/** FastAPI hata gövdesini (detail: metin | liste | nesne) tek bir Türkçe mesaja çevirir. */
export function errorMessage(body: any, status: number): { message: string; code?: string } {
  const detail = body?.detail ?? body;
  if (typeof detail === 'string' && detail) return { message: translate(detail) };
  if (Array.isArray(detail)) {
    const parts = detail.map((d) => (typeof d === 'string' ? d : d?.msg)).filter(Boolean);
    if (parts.length) return { message: parts.join('\n') };
  }
  if (detail && typeof detail === 'object') {
    const code = typeof detail.code === 'string' ? detail.code : undefined;
    if (code === 'feature_not_in_plan') return { message: detail.message || 'Bu özellik kurumunuzun paketinde yok.', code };
    const text = detail.message || detail.detail || detail.error;
    if (typeof text === 'string') return { message: text, code };
  }
  if (status === 403) return { message: 'Bu işlem için yetkiniz yok.' };
  if (status === 404) return { message: 'Kayıt bulunamadı.' };
  if (status === 429) return { message: 'Çok fazla deneme yapıldı. Lütfen biraz bekleyin.' };
  if (status >= 500) return { message: 'Sunucu hatası. Lütfen tekrar deneyin.' };
  return { message: `İşlem tamamlanamadı (${status}).` };
}

function translate(text: string): string {
  if (text === 'Organization not found' || text === 'Organization not found or inactive') return 'Kurum bulunamadı ya da etkin değil.';
  if (text === 'Not authenticated' || text === 'Could not validate credentials') return 'Oturum doğrulanamadı.';
  return text;
}

async function parse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

let refreshing: Promise<boolean> | null = null;

/** Eşzamanlı 401'lerde tek yenileme yapılır; refresh token her seferinde döner. */
function refreshOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      if (!refreshToken) return false;
      try {
        const response = await fetch(`${base()}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!response.ok) return false;
        const data = await response.json();
        if (!data?.access_token || !data?.refresh_token) return false;
        await saveTokens(data.access_token, data.refresh_token);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export function queryString(query?: Query): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

type Options = { method?: string; body?: unknown; query?: Query; auth?: boolean };

async function send(path: string, options: Options, retry: boolean): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let response: Response;
  try {
    response = await fetch(`${base()}${path}${queryString(options.query)}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }
  if (response.status === 401 && options.auth !== false && retry) {
    if (await refreshOnce()) return send(path, options, false);
    await clearSession();
    onSessionLost?.();
    throw new ApiError(401, 'Oturumunuz sona erdi. Lütfen yeniden giriş yapın.');
  }
  return response;
}

/** `/api/v1` altındaki bir yola istek atar; yol `/` ile başlar. */
export async function api<T = any>(path: string, options: Options = {}): Promise<T> {
  const response = await send(path, options, true);
  const body = await parse(response);
  if (!response.ok) {
    const { message, code } = errorMessage(body, response.status);
    throw new ApiError(response.status, message, code, body);
  }
  return body as T;
}

/** `/api/v1/admin-features` altındaki yollar için kısayol. */
export const af = <T = any>(path: string, options: Options = {}) => api<T>(`/admin-features${path}`, options);

/** Kimlik doğrulamalı dosya indirme (ör. makbuz PDF). Blob döner. */
export async function apiBlob(path: string, query?: Query): Promise<Blob> {
  const response = await send(path, { query }, true);
  if (!response.ok) {
    const { message, code } = errorMessage(await parse(response), response.status);
    throw new ApiError(response.status, message, code);
  }
  return response.blob();
}

export function authHeader(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export function absoluteApiUrl(path: string, query?: Query): string {
  return `${base()}${path}${queryString(query)}`;
}

/** Access token'ı tazeler (dosya indirmeden önce süresi dolmuş olabilir). */
export async function ensureFreshToken(): Promise<void> {
  await api('/auth/me');
}

export const MULTI_ORG_MESSAGE = 'birden fazla kurumda';

export async function login(email: string, password: string, tenantHost?: string): Promise<void> {
  host = tenantHost ? cleanHost(tenantHost) : PLATFORM_HOST;
  const data = await api<{ access_token: string; refresh_token: string }>('/auth/login', {
    method: 'POST',
    auth: false,
    body: { email: email.trim(), password },
  });
  await saveTokens(data.access_token, data.refresh_token);
  if (host !== PLATFORM_HOST) await setItem(KEY_HOST, host);
  else await removeItem(KEY_HOST);
}
