import type { Metadata } from 'next'
import { HelpRequestForm } from '../../../components/site/HelpRequestForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Yardım Başvurusu',
  description: 'İhtiyaç sahibi aileler için yardım başvuru formu.',
  alternates: { canonical: '/yardim-basvurusu' },
}

export default function HelpRequestPage() {
  return (
    <section className="mx-auto max-w-[760px] px-4 py-12 sm:px-6">
      <h1 className="text-4xl font-extrabold">Yardım Başvurusu</h1>
      <p className="mt-3 text-lg text-[#6B7A70]">
        Formu doldurun; ekibimiz başvurunuzu inceleyip sizinle iletişime geçsin. Bilgileriniz yalnızca yardım değerlendirmesi için kullanılır.
      </p>
      <HelpRequestForm />
    </section>
  )
}
