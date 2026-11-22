import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublic } from '../../../../lib/public-content'
import { SiteFormClient, type SiteFormField } from '../../../../components/site/SiteFormClient'

export const dynamic = 'force-dynamic'

interface PublicForm { title: string; slug: string; description: string | null; fields: SiteFormField[]; submit_label: string }

async function load(slug: string) {
  return getPublic<PublicForm | null>(`forms/${encodeURIComponent(slug)}`, null, 30)
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const form = await load((await params).slug)
  return form ? { title: form.title, description: form.description || undefined, alternates: { canonical: `/form/${form.slug}` } } : { title: 'Form' }
}

export default async function SiteFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const form = await load((await params).slug)
  if (!form) notFound()
  return (
    <section className="mx-auto max-w-[760px] px-4 py-12 sm:px-6">
      <h1 className="font-heading text-3xl font-bold text-gray-900 sm:text-4xl">{form.title}</h1>
      {form.description && <p className="mt-3 whitespace-pre-line text-base text-gray-600 sm:text-lg">{form.description}</p>}
      <div className="mt-6 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm sm:p-8">
        <SiteFormClient slug={form.slug} fields={form.fields} submitLabel={form.submit_label} />
      </div>
    </section>
  )
}
