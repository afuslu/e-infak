import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  af, api, clearSession, exitOrgSimulation, getAuthMode, getSimulatingOrg, loadSession, login, pf, platformLogin,
  setSessionLostHandler, startOrgSimulation, type SimOrg,
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

export type Site = { slug: string; name: string; logo_url: string | null; url?: string };

type State = {
  status: 'loading' | 'signedOut' | 'signedIn';
  mode: 'platform' | 'tenant' | null;
  me: Me | null;
  platformMe: PlatformMe | null;
  access: AdminAccess | null;
  site: Site | null;
  simulatingOrg: SimOrg | null;
};

type Auth = State & {
  signIn: (email: string, password: string, tenantHost?: string) => Promise<void>;
  signInPlatform: (email: string, password: string, totpCode?: string) => Promise<void>;
  enterOrgSimulation: (orgId: string) => Promise<void>;
  exitSimulation: () => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);
const EMPTY: State = { status: 'signedOut', mode: null, me: null, platformMe: null, access: null, site: null, simulatingOrg: null };

async function fetchTenantProfile(): Promise<Omit<State, 'status'>> {
  const me = await api<Me>('/auth/me');
  const simulatingOrg = getSimulatingOrg();
  // Geçici şifrede yalnızca /auth/me ve şifre değiştirme açık; gerisi şifre değişince yüklenir.
  if (me.must_change_password) return { mode: 'tenant', me, platformMe: null, access: null, site: null, simulatingOrg };
  // /access yalnızca yönetim paneline girebilen personelde 200 döner.
  const access = await af<AdminAccess>('/access');
  const site = await api<Site>('/public/site').catch(() => null);
  return { mode: 'tenant', me, platformMe: null, access, site, simulatingOrg };
}

async function fetchPlatformProfile(): Promise<Omit<State, 'status'>> {
  const platformMe = await pf<PlatformMe>('/me');
  return { mode: 'platform', me: null, platformMe, access: null, site: null, simulatingOrg: null };
}

async function fetchActiveProfile(): Promise<Omit<State, 'status'>> {
  return getAuthMode() === 'platform' ? fetchPlatformProfile() : fetchTenantProfile();
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
      } catch {
        // Ağ hatasında oturumu silmeyiz; yalnızca reddedilen oturum api katmanında temizlenir.
        setState(EMPTY);
      }
    })();
    return () => setSessionLostHandler(null);
  }, [drop]);

  const signIn = useCallback(async (email: string, password: string, tenantHost?: string) => {
    await login(email, password, tenantHost);
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
    () => ({ ...state, signIn, signInPlatform, enterOrgSimulation, exitSimulation, signOut, reload }),
    [state, signIn, signInPlatform, enterOrgSimulation, exitSimulation, signOut, reload],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return value;
}
