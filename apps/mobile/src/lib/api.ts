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
const KEY_PLATFORM_TOKEN = 'einfak_platform_token';
const KEY_SIM_ORG = 'einfak_simulating_org';
const KEY_DONOR_ACCESS = 'einfak_donor_access_token';
const KEY_DONOR_REFRESH = 'einfak_donor_refresh_token';
const KEY_REMEMBER = 'einfak_remembered_login';

export type SimOrg = { id: string; name: string; slug: string };
export type RememberedLogin = {
  remember: boolean;
  identifier?: string;
  host?: string;
  donorContact?: string;
};

let accessToken: string | null = null;
let refreshToken: string | null = null;
let platformToken: string | null = null;
let donorAccessToken: string | null = null;
let donorRefreshToken: string | null = null;
let simulatingOrg: SimOrg | null = null;
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
  const cleaned = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (cleaned && !cleaned.includes('.') && cleaned !== 'localhost') {
    return `${cleaned}.${PLATFORM_HOST}`;
  }
  return cleaned;
}

export async function loadRememberedLogin(): Promise<RememberedLogin> {
  const raw = await getItem(KEY_REMEMBER);
  if (!raw) return { remember: true };
  try {
    const parsed = JSON.parse(raw);
    return {
      remember: parsed?.remember !== false,
      identifier: typeof parsed?.identifier === 'string' ? parsed.identifier : undefined,
      host: typeof parsed?.host === 'string' ? parsed.host : undefined,
      donorContact: typeof parsed?.donorContact === 'string' ? parsed.donorContact : undefined,
    };
  } catch {
    return { remember: true };
  }
}

export async function saveRememberedLogin(data: RememberedLogin): Promise<void> {
  if (!data.remember) {
    await setItem(KEY_REMEMBER, JSON.stringify({ remember: false }));
    return;
  }
  const current = await loadRememberedLogin();
  const next: RememberedLogin = {
    remember: true,
    identifier: data.identifier !== undefined ? data.identifier : current.identifier,
    host: data.host !== undefined ? data.host : current.host,
    donorContact: data.donorContact !== undefined ? data.donorContact : current.donorContact,
  };
  await setItem(KEY_REMEMBER, JSON.stringify(next));
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
  platformToken = await getItem(KEY_PLATFORM_TOKEN);
  donorAccessToken = await getItem(KEY_DONOR_ACCESS);
  donorRefreshToken = await getItem(KEY_DONOR_REFRESH);
  const simRaw = await getItem(KEY_SIM_ORG);
  if (simRaw) {
    try { simulatingOrg = JSON.parse(simRaw); } catch { simulatingOrg = null; }
  } else {
    simulatingOrg = null;
  }
  host = (await getItem(KEY_HOST)) || PLATFORM_HOST;
  return !!(refreshToken || platformToken || donorRefreshToken);
}

export function getAuthMode(): 'platform' | 'tenant' | 'donor' | null {
  if (accessToken && (refreshToken || simulatingOrg)) return 'tenant';
  if (platformToken) return 'platform';
  if (donorAccessToken || donorRefreshToken) return 'donor';
  if (refreshToken) return 'tenant';
  return null;
}

export function getSimulatingOrg(): SimOrg | null {
  return simulatingOrg;
}

async function saveTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  await setItem(KEY_ACCESS, access);
  await setItem(KEY_REFRESH, refresh);
}

async function saveDonorTokens(access: string, refresh: string) {
  donorAccessToken = access;
  donorRefreshToken = refresh;
  await setItem(KEY_DONOR_ACCESS, access);
  await setItem(KEY_DONOR_REFRESH, refresh);
}

export async function clearSession() {
  accessToken = null;
  refreshToken = null;
  platformToken = null;
  donorAccessToken = null;
  donorRefreshToken = null;
  simulatingOrg = null;
  host = PLATFORM_HOST;
  await Promise.all([
    removeItem(KEY_ACCESS),
    removeItem(KEY_REFRESH),
    removeItem(KEY_HOST),
    removeItem(KEY_PLATFORM_TOKEN),
    removeItem(KEY_SIM_ORG),
    removeItem(KEY_DONOR_ACCESS),
    removeItem(KEY_DONOR_REFRESH),
  ]);
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

export function platformAuthHeader(): Record<string, string> {
  return platformToken ? { Authorization: `Bearer ${platformToken}` } : {};
}

export function donorAuthHeader(): Record<string, string> {
  return donorAccessToken ? { Authorization: `Bearer ${donorAccessToken}` } : {};
}

export async function updatePlatformToken(token: string): Promise<void> {
  platformToken = token;
  await setItem(KEY_PLATFORM_TOKEN, token);
}

export async function pfBlob(path: string, query?: Query): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (platformToken) headers.Authorization = `Bearer ${platformToken}`;
  let response: Response;
  try {
    response = await fetch(`${base()}/platform${path}${queryString(query)}`, { headers });
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }
  if (!response.ok) {
    const { message, code } = errorMessage(await parse(response), response.status);
    throw new ApiError(response.status, message, code);
  }
  return response.blob();
}

export async function dfBlob(path: string, query?: Query): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (donorAccessToken) headers.Authorization = `Bearer ${donorAccessToken}`;
  let response: Response;
  try {
    response = await fetch(`${base()}/portal${path}${queryString(query)}`, { headers });
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }
  if (!response.ok) {
    const { message, code } = errorMessage(await parse(response), response.status);
    throw new ApiError(response.status, message, code);
  }
  return response.blob();
}

export function absoluteApiUrl(path: string, query?: Query): string {
  return `${base()}${path}${queryString(query)}`;
}

/** Access token'ı tazeler (dosya indirmeden önce süresi dolmuş olabilir). */
export async function ensureFreshToken(): Promise<void> {
  await api('/auth/me');
}

export const MULTI_ORG_MESSAGE = 'birden fazla kurumda';

export async function login(emailOrPhone: string, password: string, tenantHost?: string, totpCode?: string): Promise<void> {
  host = tenantHost ? cleanHost(tenantHost) : PLATFORM_HOST;
  const data = await api<{ access_token: string; refresh_token: string }>('/auth/login', {
    method: 'POST',
    auth: false,
    body: {
      email: emailOrPhone.trim(),
      password,
      ...(totpCode?.trim() ? { totp_code: totpCode.trim() } : {}),
    },
  });
  platformToken = null;
  donorAccessToken = null;
  donorRefreshToken = null;
  simulatingOrg = null;
  await Promise.all([
    removeItem(KEY_PLATFORM_TOKEN),
    removeItem(KEY_SIM_ORG),
    removeItem(KEY_DONOR_ACCESS),
    removeItem(KEY_DONOR_REFRESH),
  ]);
  await saveTokens(data.access_token, data.refresh_token);
  if (host !== PLATFORM_HOST) await setItem(KEY_HOST, host);
  else await removeItem(KEY_HOST);
}

/** Platform operatörü (/api/v1/platform/auth/login) girişi. */
export async function platformLogin(email: string, password: string, totpCode?: string): Promise<void> {
  host = PLATFORM_HOST;
  let response: Response;
  try {
    response = await fetch(`${base()}/platform/auth/login`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password,
        ...(totpCode?.trim() ? { totp_code: totpCode.trim() } : {}),
      }),
    });
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }
  const body = await parse(response);
  if (!response.ok) {
    const { message, code } = errorMessage(body, response.status);
    throw new ApiError(response.status, message, code, body);
  }
  accessToken = null;
  refreshToken = null;
  donorAccessToken = null;
  donorRefreshToken = null;
  simulatingOrg = null;
  platformToken = body.access_token;
  await Promise.all([
    removeItem(KEY_ACCESS),
    removeItem(KEY_REFRESH),
    removeItem(KEY_HOST),
    removeItem(KEY_SIM_ORG),
    removeItem(KEY_DONOR_ACCESS),
    removeItem(KEY_DONOR_REFRESH),
    setItem(KEY_PLATFORM_TOKEN, body.access_token),
  ]);
}

let donorRefreshing: Promise<boolean> | null = null;

function refreshDonorOnce(): Promise<boolean> {
  if (!donorRefreshing) {
    donorRefreshing = (async () => {
      if (!donorRefreshToken) return false;
      try {
        const response = await fetch(`${base()}/portal/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: donorRefreshToken }),
        });
        if (!response.ok) return false;
        const data = await response.json();
        if (!data?.access_token || !data?.refresh_token) return false;
        await saveDonorTokens(data.access_token, data.refresh_token);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      donorRefreshing = null;
    });
  }
  return donorRefreshing;
}

/** Bağışçı doğrulama kodu gönderimi (/api/v1/portal/send-otp). Kurum adı zorunlu değildir; backend otomatik bulur. */
export async function sendDonorOtp(contact: string, tenantHost?: string): Promise<{ channel: 'sms' | 'email'; message: string }> {
  host = tenantHost?.trim() ? cleanHost(tenantHost) : PLATFORM_HOST;
  const trimmed = contact.trim();
  const isEmail = trimmed.includes('@');
  let response: Response;
  try {
    response = await fetch(`${base()}/portal/send-otp`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(isEmail ? { email: trimmed } : { phone: trimmed }),
    });
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }
  const body = await parse(response);
  if (!response.ok) {
    const { message, code } = errorMessage(body, response.status);
    throw new ApiError(response.status, message, code, body);
  }
  return {
    channel: body?.channel === 'email' ? 'email' : 'sms',
    message: body?.message || 'Doğrulama kodu gönderildi.',
  };
}

/** Bağışçı doğrulama kodu onayı (/api/v1/portal/verify-otp). */
export async function verifyDonorOtp(contact: string, otpCode: string, tenantHost?: string): Promise<void> {
  host = tenantHost?.trim() ? cleanHost(tenantHost) : PLATFORM_HOST;
  const trimmed = contact.trim();
  const isEmail = trimmed.includes('@');
  let response: Response;
  try {
    response = await fetch(`${base()}/portal/verify-otp`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(isEmail ? { email: trimmed } : { phone: trimmed }),
        code: otpCode.trim(),
      }),
    });
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }
  const body = await parse(response);
  if (!response.ok) {
    const { message, code } = errorMessage(body, response.status);
    throw new ApiError(response.status, message, code, body);
  }
  accessToken = null;
  refreshToken = null;
  platformToken = null;
  simulatingOrg = null;
  await Promise.all([
    removeItem(KEY_ACCESS),
    removeItem(KEY_REFRESH),
    removeItem(KEY_PLATFORM_TOKEN),
    removeItem(KEY_SIM_ORG),
  ]);
  if (host !== PLATFORM_HOST) await setItem(KEY_HOST, host);
  else await removeItem(KEY_HOST);
  await saveDonorTokens(body.access_token, body.refresh_token);
}

/** Bağışçı Portalı API (/api/v1/portal/...) istekleri. */
export async function df<T = any>(path: string, options: Options = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.auth !== false && donorAccessToken) headers.Authorization = `Bearer ${donorAccessToken}`;
  let response: Response;
  try {
    response = await fetch(`${base()}/portal${path}${queryString(options.query)}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }
  if (response.status === 401 && options.auth !== false && retry) {
    if (await refreshDonorOnce()) return df<T>(path, options, false);
    await clearSession();
    onSessionLost?.();
    throw new ApiError(401, 'Bağışçı oturumunuz sona erdi. Lütfen yeniden giriş yapın.');
  }
  const body = await parse(response);
  if (!response.ok) {
    const { message, code } = errorMessage(body, response.status);
    throw new ApiError(response.status, message, code, body);
  }
  return body as T;
}

/** Platform API (/api/v1/platform/...) istekleri. */
export async function pf<T = any>(path: string, options: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.auth !== false && platformToken) headers.Authorization = `Bearer ${platformToken}`;
  let response: Response;
  try {
    response = await fetch(`${base()}/platform${path}${queryString(options.query)}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }
  const body = await parse(response);
  if (response.status === 401 && options.auth !== false) {
    await clearSession();
    onSessionLost?.();
    throw new ApiError(401, 'Platform oturumunuz sona erdi. Lütfen yeniden giriş yapın.');
  }
  if (!response.ok) {
    const { message, code } = errorMessage(body, response.status);
    throw new ApiError(response.status, message, code, body);
  }
  return body as T;
}

/** Platform operatörü seçili kurumun yönetici paneline simülasyon oturumu ile geçer. */
export async function startOrgSimulation(orgId: string): Promise<SimOrg> {
  const data = await pf<{ token: string; organization: SimOrg }>(`/organizations/${orgId}/support-session`, {
    method: 'POST',
    body: { inline: true },
  });
  accessToken = data.token;
  refreshToken = null;
  simulatingOrg = data.organization;
  host = PLATFORM_HOST;
  await Promise.all([
    setItem(KEY_ACCESS, data.token),
    removeItem(KEY_REFRESH),
    removeItem(KEY_HOST),
    setItem(KEY_SIM_ORG, JSON.stringify(data.organization)),
  ]);
  return data.organization;
}

export async function exitOrgSimulation(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  simulatingOrg = null;
  host = PLATFORM_HOST;
  await Promise.all([removeItem(KEY_ACCESS), removeItem(KEY_REFRESH), removeItem(KEY_HOST), removeItem(KEY_SIM_ORG)]);
}
