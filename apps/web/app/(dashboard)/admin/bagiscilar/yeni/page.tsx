'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Users } from 'lucide-react'
import { DonorForm } from '../../../../../components/admin/donors/DonorForm'
import { useDonorContext } from '../../../../../components/admin/donors/useDonorContext'
import { toast } from '../../../../../components/admin/ui'

export default function NewDonorPage() {
  const router = useRouter()
  const ctx = useDonorContext()
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/bagiscilar" aria-label="Bağışçılara dön" className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Users className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Yeni Bağışçı</h1>
      </div>
      <section className="rounded-2xl border border-slate-200/80 bg-white">
        <h2 className="border-b border-gray-100 px-5 py-3.5 text-[15px] font-bold text-gray-900">Bağışçı Bilgisi</h2>
        <div className="p-5">
          <DonorForm staff={ctx.staff} options={ctx.options} onCancel={() => router.push('/admin/bagiscilar')}
            onSaved={(d) => { toast.ok('Bağışçı eklendi'); router.push(`/admin/bagiscilar/${d.id}`) }} />
        </div>
      </section>
    </div>
  )
}
