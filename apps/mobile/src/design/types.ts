/** Uygulama Yapıcı belgesi. Kaynak ve doğrulama: services/backend/app/services/app_design.py */
export const DESIGN_SCHEMA = 1;

export type AppAction = {
  type: 'screen' | 'page' | 'campaign' | 'news' | 'url' | 'tel' | 'whatsapp' | 'email';
  target: string;
};
export type AppBlock = { id: string; type: string; props: Record<string, any> };
export type AppPage = { id: string; title: string; blocks: AppBlock[] };
export type AppTab = { id: string; label: string; icon: string; action: AppAction; highlight?: boolean };
export type AppMenuItem = { id: string; label: string; icon: string; action: AppAction };
export type AppDesign = {
  schema: number;
  theme: {
    primary?: string;
    accent?: string;
    background?: string;
    surface?: string;
    text?: string;
    radius?: 'none' | 'small' | 'medium' | 'large';
    text_size?: 'small' | 'normal' | 'large';
  };
  header: {
    style?: 'brand' | 'light';
    logo_url?: string;
    title?: string;
    show_menu?: boolean;
    show_profile?: boolean;
    tab_style?: 'raised' | 'flat' | 'pill';
  };
  tabs: AppTab[];
  drawer: AppMenuItem[];
  pages: AppPage[];
};

/** Bu sürümün çizebileceği bir belge mi? Daha yeni şema gelirse gömülü tasarım kullanılır. */
export function usableDesign(raw: any): raw is AppDesign {
  return (
    !!raw &&
    typeof raw.schema === 'number' &&
    raw.schema <= DESIGN_SCHEMA &&
    Array.isArray(raw.tabs) &&
    raw.tabs.length > 0 &&
    Array.isArray(raw.drawer) &&
    Array.isArray(raw.pages) &&
    raw.pages.some((p: any) => p?.id === 'home' && Array.isArray(p.blocks))
  );
}

/** Koyu zeminde beyaz, açık zeminde koyu yazı. */
export function onColor(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16);
  if (Number.isNaN(n)) return '#FFFFFF';
  const luminance = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.62 ? '#0F172A' : '#FFFFFF';
}
