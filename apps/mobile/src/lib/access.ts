// apps/web/lib/admin-access.ts içindeki yetki yardımcılarının mobil karşılığı.
export type Capability = { key: string; label: string; description?: string };
export type CapabilityGroup = { key: string; label: string; permission: string; capabilities: Capability[] };

export type AdminAccess = {
  plan: string;
  plan_label?: string;
  features: string[];
  addons: string[];
  limits?: { users?: number; bank_accounts?: number };
  usage?: { users?: number };
  me: {
    id: string;
    role: string;
    is_platform_admin: boolean;
    permissions: string[];
    capabilities?: string[];
    modules?: string[];
  };
  permission_catalog?: { key: string; label: string }[];
  capability_catalog?: CapabilityGroup[];
  builtin_roles?: { key: string; label: string; permissions: string[] }[];
};

export function hasFeature(access: AdminAccess | null | undefined, feature?: string): boolean {
  if (!feature) return true;
  return !!access?.features?.includes(feature);
}

/** Tekil yetki (ör. `receipts.cancel`). */
export function can(access: AdminAccess | null | undefined, capability: string): boolean {
  if (!access) return false;
  if (!access.me.capabilities) return true;
  return access.me.capabilities.includes(capability);
}

/** Kullanıcının verilen modüllerden en az birinde yetkisi var mı? */
export function hasModule(access: AdminAccess | null | undefined, modules?: string | string[]): boolean {
  if (!modules) return true;
  if (!access) return false;
  const list = Array.isArray(modules) ? modules : [modules];
  if (!access.me.modules) return true;
  return list.some((m) => access.me.modules!.includes(m));
}

export function allowed(access: AdminAccess | null | undefined, feature?: string, modules?: string | string[]): boolean {
  return hasFeature(access, feature) && hasModule(access, modules);
}

export const ROLE_LABELS: Record<string, string> = {
  platform_admin: 'Platform Yöneticisi',
  stk_admin: 'Dernek Yöneticisi',
  muhasebe: 'Muhasebe',
  crm: 'Bağışçı İlişkileri',
  editor: 'İçerik Editörü',
  operasyon: 'Operasyon',
  readonly: 'Yalnızca Görüntüleme',
};
