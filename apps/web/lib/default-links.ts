import type { MessageKey } from './i18n'

/** A menu link as served by /public/menu. */
export interface MenuLink { label: string; url: string; open_in_new_tab: boolean }
export interface PublicMenu { header: MenuLink[]; footer: MenuLink[] }

/** Links shown while an organisation has not set up its menus (Menü screen). */
export function defaultHeaderLinks(t: (key: MessageKey) => string): MenuLink[] {
  return ([
    ['nav.home', '/'], ['nav.projects', '/kampanyalar'], ['nav.news', '/haberler'],
    ['nav.gallery', '/galeri'], ['nav.about', '/hakkimizda'], ['nav.contact', '/iletisim'],
  ] as [MessageKey, string][]).map(([key, url]) => ({ label: t(key), url, open_in_new_tab: false }))
}

export function defaultFooterLinks(t: (key: MessageKey) => string): MenuLink[] {
  return ([
    ['nav.volunteer', '/gonullu'], ['nav.zakat', '/zekat-hesapla'], ['nav.kvkk', '/kvkk'],
    ['nav.privacy', '/gizlilik'], ['nav.terms', '/bagis-kosullari'],
  ] as [MessageKey, string][]).map(([key, url]) => ({ label: t(key), url, open_in_new_tab: false }))
}
