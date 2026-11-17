import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { af, api, clearSession, loadSession, login, setSessionLostHandler } from '@/lib/api';
import type { AdminAccess } from '@/lib/access';
import { unregisterPush } from '@/lib/notifications';

export type Me = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
  role: string;
  organization_id: string;
};

export type Site = { slug: string; name: string; logo_url: string | null; url?: string };

type State = {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: Me | null;
  access: AdminAccess | null;
  site: Site | null;
};

type Auth = State & {
  signIn: (email: string, password: string, tenantHost?: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);
const EMPTY: State = { status: 'signedOut', me: null, access: null, site: null };

async function fetchProfile(): Promise<Omit<State, 'status'>> {
  // /access yalnızca yönetim paneline girebilen personelde 200 döner.
  const [me, access] = await Promise.all([api<Me>('/auth/me'), af<AdminAccess>('/access')]);
  const site = await api<Site>('/public/site').catch(() => null);
  return { me, access, site };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ ...EMPTY, status: 'loading' });
  const queryClient = useQueryClient();

  const drop = useCallback(() => {
    queryClient.clear();
    setState(EMPTY);
  }, [queryClient]);

  useEffect(() => {
    setSessionLostHandler(drop);
    (async () => {
      if (!(await loadSession())) return setState(EMPTY);
      try {
        setState({ status: 'signedIn', ...(await fetchProfile()) });
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
      const profile = await fetchProfile();
      queryClient.clear();
      setState({ status: 'signedIn', ...profile });
    } catch (error: any) {
      await clearSession();
      if (error?.status === 403) throw new Error('Bu hesabın yönetim paneline erişim yetkisi yok.');
      throw error;
    }
  }, [queryClient]);

  const signOut = useCallback(async () => {
    // /auth/logout web paneli dahil tüm oturumları kapattığı için çağrılmaz;
    // yalnızca bu cihazın bildirim kaydı ve yerel oturum silinir.
    await unregisterPush().catch(() => {});
    await clearSession();
    drop();
  }, [drop]);

  const reload = useCallback(async () => {
    const profile = await fetchProfile();
    setState({ status: 'signedIn', ...profile });
  }, []);

  const value = useMemo(() => ({ ...state, signIn, signOut, reload }), [state, signIn, signOut, reload]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return value;
}
