// Organisation colours are rendered on the server (see app/layout.tsx); this file
// only keeps the local-development tenant cookie helper.

export function getOrgSlugFromCookie(): string | null {
  if (typeof document === 'undefined') return null

  const cookies = document.cookie.split(';')
  const orgCookie = cookies.find((c) => c.trim().startsWith('org-slug='))

  if (!orgCookie) return null

  return orgCookie.split('=')[1]
}
