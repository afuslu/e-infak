import 'server-only'
import type { Metadata } from 'next'
import Link from 'next/link'
import { RichText } from './RichText'
import { currentLocale, getPublic, type PublicPost } from '../../lib/public-content'
import { translator, type MessageKey } from '../../lib/i18n'

/** A news post; shared by /haberler/[slug] and the short /[slug] addresses kept from an old site. */
export async function loadPost(slug: string) {
  return getPublic<PublicPost | null>(`content-posts/${encodeURIComponent(slug)}`, null)
}

export function postMetadata(post: PublicPost, canonical?: string): Metadata {
  const description = post.seo_description || post.summary || undefined
  return {
    title: post.seo_title || post.title,
    description,
    alternates: { canonical: canonical || `/haberler/${post.slug || post.id}` },
    openGraph: {
      type: 'article',
      title: post.seo_title || post.title,
      description,
      images: post.image_url ? [post.image_url] : undefined,
      publishedTime: post.published_at || undefined,
    },
  }
}

export async function NewsArticle({ post }: { post: PublicPost }) {
  const locale = await currentLocale()
  const t = translator(locale)

  return (
    <>
      <article className="mx-auto max-w-[820px] px-4 py-12 sm:px-6">
        <Link href={`/haberler?tur=${post.kind}`} className="text-sm font-bold text-primary-600">← {t(`news.kind.${post.kind}` as MessageKey)}</Link>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight">{post.title}</h1>
        {post.published_at && (
          <time className="mt-2 block text-sm text-[#6B7A70]" dateTime={post.published_at}>
            {new Date(post.published_at).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
          </time>
        )}
        {post.image_url && <img src={post.image_url} alt="" className="mt-8 w-full rounded-2xl object-cover" />}
        {post.summary && <p className="mt-8 text-xl font-medium text-[#1C2420]">{post.summary}</p>}
        <RichText text={post.body} className="mt-6" />

        {post.video_embed_url && (
          <div className="mt-10 aspect-video overflow-hidden rounded-2xl bg-black">
            <iframe
              src={post.video_embed_url}
              title={post.title}
              className="h-full w-full"
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}

        {post.gallery_urls.length > 0 && (
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {post.gallery_urls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-xl bg-[#E4E9E2]">
                <img src={url} alt="" loading="lazy" className="h-full w-full object-cover transition hover:scale-105" />
              </a>
            ))}
          </div>
        )}

        <div className="mt-12 rounded-2xl bg-primary-50 p-6 text-center">
          <p className="font-semibold">{t('news.supportCta')}</p>
          <Link href="/kampanyalar" className="mt-3 inline-block rounded-lg bg-primary-600 px-6 py-3 font-bold text-white">{t('nav.donate')}</Link>
        </div>
      </article>
    </>
  )
}
