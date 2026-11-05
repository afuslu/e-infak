import { SiteShell } from '../../components/site/SiteShell'
import { getSite } from '../../lib/public-content'

/** Every organisation page shares one header and footer; the platform domain has none. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite()
  if (!site) return <>{children}</>
  return <SiteShell site={site}>{children}</SiteShell>
}
