export type HexColor = `#${string}`;

export type WidgetThemeStyle = 'system' | 'light' | 'warm' | 'dark' | 'emerald' | 'amoled';

export const KEY_WIDGET_THEME_STYLE = 'einfak_widget_theme_style';

export type WidgetPalette = {
  mode: 'light' | 'dark';
  bg: HexColor;
  bgEnd: HexColor;
  card: HexColor;
  cardAlt: HexColor;
  border: HexColor;
  primary: HexColor;
  primarySoft: HexColor;
  primaryTextOnSolid: HexColor;
  accent: HexColor;
  text: HexColor;
  subtext: HexColor;
  muted: HexColor;
  warn: HexColor;
  warnSoft: HexColor;
  danger: HexColor;
  dangerSoft: HexColor;
  info: HexColor;
  infoSoft: HexColor;
  violet: HexColor;
  track: HexColor;
};

export const WIDGET_THEME_OPTIONS: Array<{
  value: WidgetThemeStyle;
  label: string;
  hint: string;
  swatchBg: HexColor;
  swatchAccent: HexColor;
}> = [
  {
    value: 'system',
    label: 'Sistem Otomatik',
    hint: 'Gündüz ferah beyaz, akşam otomatik koyu tema.',
    swatchBg: '#0F172A',
    swatchAccent: '#10B981',
  },
  {
    value: 'light',
    label: 'Gündüz (Ferah)',
    hint: 'Aydınlık kırık beyaz yüzey ve zümrüt kartlar.',
    swatchBg: '#FFFFFF',
    swatchAccent: '#059669',
  },
  {
    value: 'warm',
    label: 'Gündüz (Sıcak)',
    hint: 'Göz yormayan fildişi krem zemin ve koyu zümrüt.',
    swatchBg: '#FAF7F0',
    swatchAccent: '#047857',
  },
  {
    value: 'dark',
    label: 'Gece (Koyu Slate)',
    hint: 'Modern koyu lacivert-slate degrade ve nane vurgular.',
    swatchBg: '#0F172A',
    swatchAccent: '#34D399',
  },
  {
    value: 'emerald',
    label: 'Zümrüt Prestij',
    hint: 'Zengin koyu zümrüt-teal marka degradesi ve altın rozetler.',
    swatchBg: '#064E3B',
    swatchAccent: '#6EE7B7',
  },
  {
    value: 'amoled',
    label: 'AMOLED Siyah',
    hint: 'Tam siyah (#000000) zemin ve yüksek kontrast neon zümrüt.',
    swatchBg: '#000000',
    swatchAccent: '#10B981',
  },
];

export const PALETTES: Record<Exclude<WidgetThemeStyle, 'system'>, WidgetPalette> = {
  light: {
    mode: 'light',
    bg: '#FFFFFF',
    bgEnd: '#F2F8F5',
    card: '#F1F6F4',
    cardAlt: '#E7F1ED',
    border: '#DCE7E2',
    primary: '#059669',
    primarySoft: '#DCFCE7',
    primaryTextOnSolid: '#FFFFFF',
    accent: '#0D9488',
    text: '#0B1915',
    subtext: '#334842',
    muted: '#647A73',
    warn: '#B45309',
    warnSoft: '#FEF3C7',
    danger: '#DC2626',
    dangerSoft: '#FEE2E2',
    info: '#2563EB',
    infoSoft: '#DBEAFE',
    violet: '#7C3AED',
    track: '#DCE7E2',
  },
  warm: {
    mode: 'light',
    bg: '#FCF9F2',
    bgEnd: '#F4EFE3',
    card: '#F2ECE0',
    cardAlt: '#EAE2D2',
    border: '#E0D7C5',
    primary: '#047857',
    primarySoft: '#D8F3E5',
    primaryTextOnSolid: '#FFFFFF',
    accent: '#0F766E',
    text: '#1C1917',
    subtext: '#44403C',
    muted: '#78716C',
    warn: '#9A3412',
    warnSoft: '#FFEDD5',
    danger: '#B91C1C',
    dangerSoft: '#FEE2E2',
    info: '#1D4ED8',
    infoSoft: '#E0E7FF',
    violet: '#6D28D9',
    track: '#E2DAC9',
  },
  dark: {
    mode: 'dark',
    bg: '#0F172A',
    bgEnd: '#090F1D',
    card: '#182438',
    cardAlt: '#1F2E47',
    border: '#293B56',
    primary: '#34D399',
    primarySoft: '#0D332B',
    primaryTextOnSolid: '#FFFFFF',
    accent: '#2DD4BF',
    text: '#F8FAFC',
    subtext: '#CBD5E1',
    muted: '#8DA0B8',
    warn: '#FBBF24',
    warnSoft: '#3B2A0E',
    danger: '#F87171',
    dangerSoft: '#3B181E',
    info: '#60A5FA',
    infoSoft: '#17294A',
    violet: '#A78BFA',
    track: '#23324A',
  },
  emerald: {
    mode: 'dark',
    bg: '#064E3B',
    bgEnd: '#032B22',
    card: '#095E48',
    cardAlt: '#0D6E55',
    border: '#13795E',
    primary: '#6EE7B7',
    primarySoft: '#053F31',
    primaryTextOnSolid: '#FFFFFF',
    accent: '#5EEAD4',
    text: '#F0FDF4',
    subtext: '#CCFBF1',
    muted: '#99E6D4',
    warn: '#FDE68A',
    warnSoft: '#3D3511',
    danger: '#FCA5A5',
    dangerSoft: '#4C1D24',
    info: '#93C5FD',
    infoSoft: '#0F3D4C',
    violet: '#C4B5FD',
    track: '#0A4738',
  },
  amoled: {
    mode: 'dark',
    bg: '#000000',
    bgEnd: '#050807',
    card: '#111615',
    cardAlt: '#19211F',
    border: '#24302D',
    primary: '#10B981',
    primarySoft: '#07291E',
    primaryTextOnSolid: '#FFFFFF',
    accent: '#14B8A6',
    text: '#FFFFFF',
    subtext: '#D1FAE5',
    muted: '#869690',
    warn: '#F59E0B',
    warnSoft: '#291B05',
    danger: '#EF4444',
    dangerSoft: '#2B0B0E',
    info: '#3B82F6',
    infoSoft: '#0B1D3A',
    violet: '#8B5CF6',
    track: '#1C2623',
  },
};

export function isValidWidgetThemeStyle(val: string | null | undefined): val is WidgetThemeStyle {
  return (
    val === 'system' ||
    val === 'light' ||
    val === 'warm' ||
    val === 'dark' ||
    val === 'emerald' ||
    val === 'amoled'
  );
}

/**
 * Resolves the concrete palette for a widget given user style preference,
 * whether the OS is currently in dark mode, and optional white-label brand primary color.
 */
export function resolveWidgetPalette(
  style: WidgetThemeStyle | undefined,
  systemDark: boolean,
  brandPrimary?: string | null
): WidgetPalette {
  const effective: Exclude<WidgetThemeStyle, 'system'> =
    !style || style === 'system' ? (systemDark ? 'dark' : 'light') : style;
  const base = PALETTES[effective] || (systemDark ? PALETTES.dark : PALETTES.light);
  if (brandPrimary && /^#[0-9a-fA-F]{6}$/.test(brandPrimary) && (effective === 'light' || effective === 'warm')) {
    return {
      ...base,
      primary: brandPrimary as HexColor,
    };
  }
  return base;
}

export function channelColor(
  p: WidgetPalette,
  colorKey: 'emerald' | 'blue' | 'amber' | 'violet' | 'teal'
): HexColor {
  switch (colorKey) {
    case 'blue':
      return p.info;
    case 'amber':
      return p.warn;
    case 'violet':
      return p.violet;
    case 'teal':
      return p.accent;
    case 'emerald':
    default:
      return p.primary;
  }
}
