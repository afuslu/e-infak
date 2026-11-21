'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Megaphone } from 'lucide-react'
import { CampaignEditor, savedNotice } from '../../../../../components/admin/campaigns/CampaignEditor'

export default function NewCampaignPage() {
  const router = useRouter()
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/kampanyalar" aria-label="Kampanyalara dön" className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-900"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Megaphone className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Yeni Kampanya</h1>
      </div>
      <CampaignEditor onCancel={() => router.push('/admin/kampanyalar')}
        onSaved={(c) => { savedNotice(true); router.push(`/admin/kampanyalar/${c.id}`) }} />
    </div>
  )
}
