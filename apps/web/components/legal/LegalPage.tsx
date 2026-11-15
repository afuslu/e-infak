import type { OrgLegalInfo } from '@e-infak/api-client'
import { getPublic, getSite } from '../../lib/public-content'

export async function loadLegal(): Promise<{ legal: OrgLegalInfo | null; siteName: string }> {
  const [site, settings] = await Promise.all([getSite(), getPublic<{ legal?: OrgLegalInfo }>('org-settings', {}, 300)])
  return { legal: settings.legal ?? null, siteName: site?.name || 'Kurum' }
}

/** The organisation's legal identity (Site Ayarları → yasal bilgiler); empty fields are left out. */
export function Identity({ legal, siteName }: { legal: OrgLegalInfo | null; siteName: string }) {
  const rows: [string, string | null | undefined][] = [
    ['Unvan', legal?.legal_name || siteName],
    ['Adres', legal?.address],
    ['Telefon', legal?.phone],
    ['E-posta', legal?.email],
    ['Vergi dairesi / no', [legal?.tax_office, legal?.tax_number].filter(Boolean).join(' / ') || null],
    ['Kütük / sicil no', legal?.registry_no],
  ]
  return (
    <dl className="not-prose my-6 grid gap-x-6 gap-y-2 rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm sm:grid-cols-[160px_1fr]">
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-gray-500">{k}</dt>
          <dd className="text-gray-900">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function LegalShell({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-14 sm:py-16">
      <article className="text-[15px] leading-7 text-gray-700 [&_a]:font-semibold [&_a]:text-primary-700 [&_a]:underline [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_h1]:mb-2 [&_h1]:font-heading [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-gray-900 [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:scroll-mt-24 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:ps-6 [&_p]:mt-3 [&_strong]:text-gray-900 [&_ul]:list-disc [&_ul]:ps-6">
        <h1>{title}</h1>
        {updated && <p className="text-sm text-gray-500">Son güncelleme: {updated}</p>}
        {children}
      </article>
    </main>
  )
}
