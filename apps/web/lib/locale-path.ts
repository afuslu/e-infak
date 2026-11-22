/** Website languages in the address (/en/kampanyalar): STK PRO "Çoklu Dil Desteği" with search-engine friendly URLs. */
export const PATH_LOCALES = new Set([
  'en', 'ar', 'de', 'fr', 'ru', 'nl', 'es', 'it', 'pt', 'az', 'ka', 'ku', 'fa', 'ur', 'id', 'ms', 'bs', 'sq', 'uz', 'kk',
  'ky', 'tk', 'ja', 'zh', 'ko', 'sv', 'da', 'no', 'fi', 'pl', 'ro', 'bg', 'el', 'hu', 'cs', 'sk', 'sr', 'hr', 'uk', 'he',
  'hi', 'bn', 'so', 'sw', 'ha', 'am', 'ps', 'tg', 'mk', 'sl', 'lt', 'lv', 'et',
])

/** Areas that never take a language prefix. */
const NO_PREFIX = ['/admin', '/platform', '/api', '/site-yapici-cerceve', '/_next']

/** "/en/kampanyalar" → { locale: "en", rest: "/kampanyalar" }; null when the path has no language prefix. */
export function splitLocalePath(pathname: string): { locale: string; rest: string } | null {
  const match = /^\/([a-z]{2})(\/.*)?$/.exec(pathname)
  if (!match || !(PATH_LOCALES.has(match[1]) || match[1] === 'tr')) return null
  const rest = match[2] || '/'
  if (NO_PREFIX.some((p) => rest === p || rest.startsWith(`${p}/`))) return null
  return { locale: match[1], rest }
}

/** The address of `pathname` in `locale` (Turkish has no prefix). */
export function localizedPath(pathname: string, locale: string): string {
  const base = splitLocalePath(pathname)?.rest ?? pathname
  if (!locale || locale === 'tr') return base
  return base === '/' ? `/${locale}` : `/${locale}${base}`
}
