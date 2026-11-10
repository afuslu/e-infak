import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { NewsArticle, loadPost, postMetadata } from '../../../../components/site/NewsArticle'
import { currentLocale } from '../../../../lib/public-content'
import { translator } from '../../../../lib/i18n'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = await loadPost(slug)
  if (!post) return { title: translator(await currentLocale())('notFound') }
  return postMetadata(post)
}

export default async function NewsDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await loadPost(slug)
  if (!post) notFound()
  return <NewsArticle post={post} />
}
