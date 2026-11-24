/**
 * White-label / kuruma özel mobil uygulama yapılandırması.
 *
 * Varsayılan (EXPO_PUBLIC_TENANT boş): genel "e-İnfak" yönetim uygulaması (org.einfak.app).
 * Kuruma özel (ör. EXPO_PUBLIC_TENANT=hakder): doğrudan o derneğin vitrini + bağışçı/yetkili
 * paneli ile açılan özel uygulama (org.hakder.mobile).
 */

import tenants from './tenants.json';

export type TenantBrandConfig = {
  slug: string;
  name: string;
  fullName: string;
  tagline: string;
  host: string;
  primaryColor: string;
  accentColor: string;
  packageAndroid: string;
  bundleIos: string;
  scheme: string;
};

export const TENANTS: Record<string, TenantBrandConfig> = tenants;

const rawTenant = (process.env.EXPO_PUBLIC_TENANT || '').trim().toLowerCase();

export const ACTIVE_TENANT: TenantBrandConfig | null = rawTenant ? TENANTS[rawTenant] ?? null : null;

export function isWhiteLabel(): boolean {
  return ACTIVE_TENANT !== null;
}

export function tenantBaseUrl(): string {
  if (!ACTIVE_TENANT) return 'https://e-infak.org';
  return `https://${ACTIVE_TENANT.host}`;
}
