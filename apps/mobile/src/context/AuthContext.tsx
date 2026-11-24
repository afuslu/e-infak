import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  af, api, clearSession, df, exitOrgSimulation, getAuthMode, getSimulatingOrg, loadSession, login, loginDonorPassword,
  MULTI_ORG_MESSAGE, pf, platformLogin, setSessionLostHandler, startOrgSimulation, verifyDonorOtp, type SimOrg,
} from '@/lib/api';
import type { AdminAccess } from '@/lib/access';
import { unregisterPush } from '@/lib/notifications';
import { clearOfflineData } from '@/lib/offlineQueue';
import { updateHomeWidgets } from '@/widgets';

export type Me = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
  role: string;
  organization_id: string;
  /** Geçici şifreyle girildi: şifre değişene dek diğer tüm istekler 403 döner. */
  must_change_password?: boolean;
};

export type PlatformMe = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  totp_enabled: boolean;
  must_change_password?: boolean;
};

export type DonorMe = {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string;
  tc_no: string;
  tax_number: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  email_opt_out: boolean;
  sms_opt_out: boolean;
  is_anonymous: boolean;
  has_password?: boolean;
  total_donations: number;
  total_donated_cents: number;
};

export type Site = { slug: string; name: string; logo_url: string | null; url?: string };

type State = {
  /** offline: kayıtlı oturum var ama sunucuya ulaşılamadı. */
  status: 'loading' | 'signedOut' | 'signedIn' | 'offline';
  mode: 'platform' | 'tenant' | 'donor' | null;
  me: Me | null;
  platformMe: PlatformMe | null;
  donorMe: DonorMe | null;
  access: AdminAccess | null;
  site: Site | null;
  simulatingOrg: SimOrg | null;
};

type Auth = State & {
  signIn: (emailOrPhone: string, password: string, tenantHost?: string, totpCode?: string) => Promise<void>;
  signInPlatform: (email: string, password: string, totpCode?: string) => Promise<void>;
  signInUnified: (identifier: string, password: string, options?: { tenantHost?: string; totpCode?: string; preferPlatform?: boolean }) => Promise<'tenant' | 'platform'>;
  signInDonor: (contact: string, otpCode: string, tenantHost?: string) => Promise<void>;
  signInDonorPassword: (identifier: string, password: string, tenantHost?: string) => Promise<void>;
  enterOrgSimulation: (orgId: string) => Promise<void>;
  exitSimulation: () => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);
const EMPTY: State = { status: 'signedOut', mode: null, me: null, platformMe: null, donorMe: null, access: null, site: null, simulatingOrg: null };

async function fetchTenantProfile(): Promise<Omit<State, 'status'>> {
  const me = await api<Me>('/auth/me');
  const simulatingOrg = getSimulatingOrg();
  // Geçici şifrede yalnızca /auth/me ve şifre değiştirme açık; gerisi şifre değişince yüklenir.
  if (me.must_change_password) return { mode: 'tenant', me, platformMe: null, donorMe: null, access: null, site: null, simulatingOrg };
  // /access yalnızca yönetim paneline girebilen personelde 200 döner.
  const access = await af<AdminAccess>('/access');
  const site = await api<Site>('/public/site').catch(() => null);
  return { mode: 'tenant', me, platformMe: null, donorMe: null, access, site, simulatingOrg };
}

async function fetchPlatformProfile(): Promise<Omit<State, 'status'>> {
  const platformMe = await pf<PlatformMe>('/me');
  return { mode: 'platform', me: null, platformMe, donorMe: null, access: null, site: null, simulatingOrg: null };
}

async function fetchDonorProfile(): Promise<Omit<State, 'status'>> {
  const [donorMe, site] = await Promise.all([
    df<DonorMe>('/me/profile'),
    api<Site>('/public/site').catch(() => null),
  ]);
  return { mode: 'donor', me: null, platformMe: null, donorMe, access: null, site, simulatingOrg: null };
}

async function fetchActiveProfile(): Promise<Omit<State, 'status'>> {
  const mode = getAuthMode();
  if (mode === 'platform') return fetchPlatformProfile();
  if (mode === 'donor') return fetchDonorProfile();
  return fetchTenantProfile();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ ...EMPTY, status: 'loading' });
  const queryClient = useQueryClient();

  const drop = useCallback(() => {
    updateHomeWidgets(null).catch(() => {});
    clearOfflineData().catch(() => {});
    queryClient.clear();
    setState(EMPTY);
  }, [queryClient]);

  useEffect(() => {
    setSessionLostHandler(drop);
    (async () => {
      if (!(await loadSession())) return setState(EMPTY);
      try {
        setState({ status: 'signedIn', ...(await fetchActiveProfile()) });
      } catch (error: any) {
        // Ağ ve sunucu hatasında oturum durur; reddedilen oturum api katmanında temizlenir.
        const temporary = !error?.status || error.status >= 500 || error.status === 429;
        setState(temporary ? { ...EMPTY, status: 'offline' } : EMPTY);
      }
    })();
    return () => setSessionLostHandler(null);
  }, [drop]);

  const signIn = useCallback(async (emailOrPhone: string, password: string, tenantHost?: string, totpCode?: string) => {
    await login(emailOrPhone, password, tenantHost, totpCode);
    try {
      const profile = await fetchTenantProfile();
      queryClient.clear();
      setState({ status: 'signedIn', ...profile });
    } catch (error: any) {
      await clearSession();
      if (error?.status === 403) throw new Error('Bu hesabın yönetim paneline erişim yetkisi yok.');
      throw error;
    }
  }, [queryClient]);

  const signInPlatform = useCallback(async (email: string, password: string, totpCode?: string) => {
    await platformLogin(email, password, totpCode);
    try {
      const profile = await fetchPlatformProfile();
      queryClient.clear();
      setState({ status: 'signedIn', ...profile });
    } catch (error: any) {
      await clearSession();
      throw error;
    }
  }, [queryClient]);

  const signInUnified = useCallback(async (
    identifier: string,
    password: string,
    options?: { tenantHost?: string; totpCode?: string; preferPlatform?: boolean }
  ): Promise<'tenant' | 'platform'> => {
    const tenantHost = options?.tenantHost?.trim() || undefined;
    const totpCode = options?.totpCode?.trim() || undefined;

    if (options?.preferPlatform && !tenantHost) {
      await signInPlatform(identifier, password, totpCode);
      return 'platform';
    }

    try {
      await signIn(identifier, password, tenantHost, totpCode);
      return 'tenant';
    } catch (tenantErr: any) {
      const msg: string = tenantErr?.message || '';
      if (
        tenantHost ||
        msg.includes(MULTI_ORG_MESSAGE) ||
        msg.includes('2FA') ||
        msg === 'totp_required' ||
        tenantErr?.status === 403
      ) {
        throw tenantErr;
      }
      // E-posta ise platform yöneticisi hesabını da dene
      if (tenantErr?.status === 401 && identifier.includes('@')) {
        await signInPlatform(identifier, password, totpCode);
        return 'platform';
      }
      throw tenantErr;
    }
  }, [signIn, signInPlatform]);

  const signInDonor = useCallback(async (contact: string, otpCode: string, tenantHost?: string) => {
    await verifyDonorOtp(contact, otpCode, tenantHost);
    try {
      const profile = await fetchDonorProfile();
      queryClient.clear();
      setState({ status: 'signedIn', ...profile });
    } catch (error: any) {
      await clearSession();
      throw error;
    }
  }, [queryClient]);

  const signInDonorPassword = useCallback(async (identifier: string, password: string, tenantHost?: string) => {
    await loginDonorPassword(identifier, password, tenantHost);
    try {
      const profile = await fetchDonorProfile();
      queryClient.clear();
      setState({ status: 'signedIn', ...profile });
    } catch (error: any) {
      await clearSession();
      throw error;
    }
  }, [queryClient]);

  const enterOrgSimulation = useCallback(async (orgId: string) => {
    await startOrgSimulation(orgId);
    const profile = await fetchTenantProfile();
    queryClient.clear();
    setState({ status: 'signedIn', ...profile });
  }, [queryClient]);

  const exitSimulation = useCallback(async () => {
    await exitOrgSimulation();
    const profile = await fetchPlatformProfile();
    queryClient.clear();
    setState({ status: 'signedIn', ...profile });
  }, [queryClient]);

  const signOut = useCallback(async () => {
    // /auth/logout web paneli dahil tüm oturumları kapattığı için çağrılmaz;
    // yalnızca bu cihazın bildirim kaydı ve yerel oturum silinir.
    await unregisterPush().catch(() => {});
    await updateHomeWidgets(null).catch(() => {});
    await clearSession();
    drop();
  }, [drop]);

  const reload = useCallback(async () => {
    const profile = await fetchActiveProfile();
    setState({ status: 'signedIn', ...profile });
  }, []);

  const value = useMemo(
    () => ({ ...state, signIn, signInPlatform, signInUnified, signInDonor, signInDonorPassword, enterOrgSimulation, exitSimulation, signOut, reload }),
    [state, signIn, signInPlatform, signInUnified, signInDonor, signInDonorPassword, enterOrgSimulation, exitSimulation, signOut, reload],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return value;
}
