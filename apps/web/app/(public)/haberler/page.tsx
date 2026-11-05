import type { Metadata } from 'next'
import Link from 'next/link'
import { currentLocale, getPublic, type PublicPost } from '../../../lib/public-content'
import { translator, type MessageKey } from '../../../lib/i18n'

export const dynamic = 'force-dynamic'

const KINDS = ['haber', 'blog', 'faaliyet'] as const

const kindKey = (kind: string) => `news.kind.${kind}` as MessageKey

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ tur?: string }> }): Promise<Metadata> {
  const { tur } = await searchParams
  const t = translator(await currentLocale())
  const known = KINDS.includes(tur as (typeof KINDS)[number])
  return { title: known ? t(kindKey(tur!)) : t('news.title'), alternates: { canonical: tur ? `/haberler?tur=${tur}` : '/haberler' } }
}

export default async function NewsListPage({ searchParams }: { searchParams: Promise<{ tur?: string }> }) {
  const { tur } = await searchParams
  const kind = KINDS.includes(tur as (typeof KINDS)[number]) ? tur : undefined
  const locale = await currentLocale()
  const t = translator(locale)
  const posts = await getPublic<PublicPost[]>(`content-posts?limit=100${kind ? `&kind=${kind}` : ''}`, [])

  return (
    <>
      <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
        <h1 className="text-4xl font-extrabold">{kind ? t(kindKey(kind)) : t('news.title')}</h1>
        <nav className="mt-6 flex flex-wrap gap-2">
          {[['', t('news.all')], ...KINDS.map((k) => [k, t(kindKey(k))])].map(([k, l]) => (
            <Link key={k} href={k ? `/haberler?tur=${k}` : '/haberler'}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${(kind || '') === k ? 'border-primary-600 bg-primary-600 text-white' : 'bg-white text-[#3A4540]'}`}>
              {l}
            </Link>
          ))}
        </nav>

        {posts.length === 0 ? (
          <p className="mt-16 text-center text-[#6B7A70]">{t('news.empty')}</p>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link key={post.id} href={`/haberler/${post.slug || post.id}`} className="group overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition hover:shadow-md">
                <div className="aspect-[16/10] bg-[#E4E9E2]">
                  {post.image_url && <img src={post.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
                </div>
                <div className="space-y-2 p-5">
                  <div className="text-xs font-bold uppercase tracking-wide text-primary-600">
                    {t(kindKey(post.kind))}
                    {post.published_at && ` · ${new Date(post.published_at).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}`}
                  </div>
                  <h2 className="text-lg font-bold leading-snug group-hover:text-primary-600">{post.title}</h2>
                  {post.summary && <p className="line-clamp-3 text-sm text-[#6B7A70]">{post.summary}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
