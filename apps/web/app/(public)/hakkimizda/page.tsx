import { headers } from 'next/headers'
import Link from 'next/link'
import { tenantHeaders } from '../../../lib/server-api'
import { getSite } from '../../../lib/public-content'
import { CmsPageView, loadPage } from '../../../components/site/CmsPageView'

export const dynamic = 'force-dynamic'

interface PublicOrgSettings {
  about_text?: string | null
  mission_text?: string | null
  vision_text?: string | null
  bylaws_url?: string | null
  board_url?: string | null
  audit_report_url?: string | null
  activity_report_url?: string | null
  fundraising_permit_url?: string | null
}

async function getOrgSettings(orgSlug: string): Promise<PublicOrgSettings> {
  const apiUrl = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020').replace(/\/$/, '')
  try {
    const response = await fetch(`${apiUrl}/api/v1/public/org-settings`, {
      headers: tenantHeaders(orgSlug),
      next: { revalidate: 60 },
    })
    return response.ok ? await response.json() : {}
  } catch {
    return {}
  }
}

export default async function AboutPage() {
  // A published "hakkimizda" page (site builder / CMS) replaces the built-in one.
  const custom = await loadPage('hakkimizda')
  if (custom) return <CmsPageView page={custom} />
  const headersList = await headers()
  const orgSlug = headersList.get('x-organization-slug') || ''
  const site = await getSite()
  const orgName = site?.name || ''
  // Theme colours come from the organisation (CSS variables set by the root layout).
  const c = {
    primary: 'var(--brand-primary-600)',
    border: '#E5E7EB',
    text: '#6B7280',
    heading: '#111827',
    hero: site?.hero.image_url || null,
    intro: `${orgName} kurumsal tanıtım bilgileri, yetkili kurum yöneticisi tarafından doğrulandıktan sonra bu alanda yayınlanacaktır.`,
    mission: 'Doğrulanmış kurum misyonu henüz yayınlanmadı.',
    vision: 'Doğrulanmış kurum vizyonu henüz yayınlanmadı.',
  }
  const orgSettings = await getOrgSettings(orgSlug)
  const documents = [
    ['Tüzük', orgSettings.bylaws_url],
    ['Yönetim ve denetim bilgileri', orgSettings.board_url],
    ['Faaliyet raporu', orgSettings.activity_report_url],
    ['Denetim raporu', orgSettings.audit_report_url],
    ['Yardım toplama izni', orgSettings.fundraising_permit_url],
  ].filter((document): document is [string, string] => Boolean(document[1]))

  return (
    <div className="font-sans" style={{ color: c.heading }}>
      <div className="max-w-[900px] mx-auto px-6 pt-14 pb-20">
        <Link href="/" className="font-bold text-sm mb-6 inline-block" style={{ color: c.primary }}>
          ← Ana sayfaya dön
        </Link>
        <h1 className="font-heading text-[38px] font-bold mb-2">Hakkımızda</h1>
        <p className="text-[17px] leading-relaxed mb-8" style={{ color: c.text }}>
          {orgSettings.about_text || c.intro}
        </p>

        {c.hero && (
          <div className="relative h-[280px] rounded-2xl overflow-hidden mb-8">
            <img src={c.hero} alt={orgName} className="h-full w-full object-cover" />
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6" style={{ border: `1px solid ${c.border}` }}>
            <div className="font-heading text-xl font-bold mb-2.5">Misyonumuz</div>
            <p className="text-sm leading-relaxed" style={{ color: c.text }}>{orgSettings.mission_text || c.mission}</p>
          </div>
          <div className="bg-white rounded-2xl p-6" style={{ border: `1px solid ${c.border}` }}>
            <div className="font-heading text-xl font-bold mb-2.5">Vizyonumuz</div>
            <p className="text-sm leading-relaxed" style={{ color: c.text }}>{orgSettings.vision_text || c.vision}</p>
          </div>
        </div>

        <div id="seffaflik" className="bg-white rounded-2xl p-6" style={{ border: `1px solid ${c.border}` }}>
          <div className="font-heading text-xl font-bold mb-3.5">Şeffaflık ve Belgeler</div>
          <div className="flex flex-col gap-2.5">
            <Link href="/kvkk" className="font-semibold text-[14.5px]" style={{ color: c.primary }}>→ KVKK Aydınlatma Metni</Link>
            {documents.map(([label, url]) => (
              <a key={label} href={url} target="_blank" rel="noreferrer" className="font-semibold text-[14.5px]" style={{ color: c.primary }}>
                → {label}
              </a>
            ))}
            {documents.length === 0 && (
              <p className="text-sm" style={{ color: c.text }}>Yeni kurumsal belgeler, yetkili yönetici doğrulamasından sonra bu alanda yayınlanacaktır.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
