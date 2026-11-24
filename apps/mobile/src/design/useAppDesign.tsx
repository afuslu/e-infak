import React, { createContext, useContext, useMemo } from 'react';
import { Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Href, useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import { fetchAppDesign, fetchPublicSite } from '@/api/public';
import { ACTIVE_TENANT } from '@/config/tenant';
import { useAuth } from '@/context/AuthContext';
import { openExternal, routeOf } from './actions';
import defaultDesign from './defaultDesign.json';
import { AppAction, AppDesign, onColor, usableDesign } from './types';

export const DEFAULT_DESIGN = defaultDesign as unknown as AppDesign;

type Override = { design: AppDesign; openPage: (id: string) => void; blocked: (text: string) => void };
const OverrideContext = createContext<Override | null>(null);

/** Yetkilinin taslak önizlemesi: tasarım dışarıdan verilir, bağış ve dış bağlantılar çalışmaz. */
export function DesignPreview({ value, children }: { value: Override; children: React.ReactNode }) {
  return <OverrideContext.Provider value={value}>{children}</OverrideContext.Provider>;
}

export const usePreview = () => useContext(OverrideContext);

// Belge SecureStore sınırını (2 KB) aşar; dosyada tutulur.
const fileName = (key: string) => `einfak_design_${key.replace(/[^a-z0-9_-]/gi, '')}.json`;

async function readCached(key: string): Promise<AppDesign | null> {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') raw = globalThis.localStorage?.getItem(fileName(key)) ?? null;
    else {
      const file = new File(Paths.document, fileName(key));
      raw = file.exists ? await file.text() : null;
    }
    const parsed = raw ? JSON.parse(raw) : null;
    return usableDesign(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCached(key: string, design: AppDesign | null) {
  try {
    const raw = JSON.stringify(design);
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(fileName(key), raw);
    else new File(Paths.document, fileName(key)).write(raw);
  } catch {}
}

/** Yayındaki tasarım; önce cihazdaki kopya, sonra sunucu. Hiçbiri yoksa gömülü tasarım. */
export function useAppDesign(): { design: AppDesign; ready: boolean; refetch: () => void } {
  const override = usePreview();
  const { site } = useAuth();
  const key = ACTIVE_TENANT?.slug || site?.slug || '';
  const cached = useQuery({
    queryKey: ['app-design', key, 'cached'],
    queryFn: () => readCached(key),
    enabled: !override && !!key,
    staleTime: Infinity,
  });
  const live = useQuery({
    queryKey: ['app-design', key, 'live'],
    queryFn: async () => {
      const design = await fetchAppDesign();
      const usable = usableDesign(design) ? design : null;
      if (key) writeCached(key, usable);
      return usable;
    },
    enabled: !override,
    staleTime: 60_000,
  });
  if (override) return { design: override.design, ready: true, refetch: () => {} };
  const design = live.isSuccess ? live.data : cached.data;
  return {
    design: design || DEFAULT_DESIGN,
    // Kopya varsa beklenmez; yoksa sunucu yanıtı (veya hatası) beklenir ki tasarım sonradan değişip sıçramasın.
    ready: !!design || live.isSuccess || live.isError,
    refetch: () => void live.refetch(),
  };
}

const RADIUS = { none: 0, small: 8, medium: 18, large: 26 };
const SCALE = { small: 0.92, normal: 1, large: 1.14 };

/** Tema: tasarım > kuruma özel uygulama ayarı > site renkleri. */
export function useBrand() {
  const { design, ready, refetch } = useAppDesign();
  const siteQuery = useQuery({
    queryKey: ['public', 'site', ACTIVE_TENANT?.slug || 'default'],
    queryFn: fetchPublicSite,
    staleTime: 5 * 60_000,
  });
  const site = siteQuery.data;
  const t = design.theme;
  const primary = t.primary || ACTIVE_TENANT?.primaryColor || site?.primary_color || '#00533C';
  const accent = t.accent || ACTIVE_TENANT?.accentColor || site?.accent_color || '#C8922B';
  const text = t.text || '#0F172A';
  const scale = SCALE[t.text_size || 'normal'] ?? 1;
  const r = RADIUS[t.radius || 'medium'] ?? 18;
  return {
    design, ready, refetch, site, siteQuery, primary, accent, text,
    onPrimary: onColor(primary),
    onAccent: onColor(accent),
    bg: t.background || '#F6F8F7',
    surface: t.surface || '#FFFFFF',
    muted: t.text ? `${text}A6` : '#64748B',
    line: t.text ? `${text}1F` : '#E2E8F0',
    radius: r,
    buttonRadius: Math.min(r, 12),
    fs: (size: number) => Math.round(size * scale),
    name: ACTIVE_TENANT?.fullName || site?.name || ACTIVE_TENANT?.name || '',
  };
}
export type Brand = ReturnType<typeof useBrand>;

/** Bir eylemi çalıştırır. */
export function useAction() {
  const router = useRouter();
  const preview = usePreview();
  return useMemo(
    () => (action: AppAction | null | undefined, replace = false) => {
      if (!action) return;
      if (preview) {
        if (action.type === 'page') return preview.openPage(action.target);
        if (action.type === 'screen' && action.target === 'home') return preview.openPage('home');
        return preview.blocked('Önizlemede bu ekran açılmaz.');
      }
      const route = routeOf(action);
      if (!route) return openExternal(action);
      if (replace) router.replace(route as Href);
      else router.push(route as Href);
    },
    [router, preview],
  );
}
