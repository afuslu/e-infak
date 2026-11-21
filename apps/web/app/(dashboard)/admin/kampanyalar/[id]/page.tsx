'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink, Megaphone } from 'lucide-react'
import { apiErrorMessage, formatMoney, v1Get } from '../../../../../lib/admin-access'
import { CampaignEditor, type CampaignData, savedNotice } from '../../../../../components/admin/campaigns/CampaignEditor'
import { toast } from '../../../../../components/admin/ui'

export default function EditCampaignPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [campaign, setCampaign] = useState<CampaignData | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    v1Get<CampaignData>(`/campaigns/id/${id}`).then((r) => setCampaign(r.data)).catch((err) => {
      setMissing(true)
      toast.error(apiErrorMessage(err, 'Kampanya bulunamadı'))
    })
  }, [id])
  if (missing) return <p className="py-16 text-center text-sm text-gray-500">Kampanya bulunamadı. <Link href="/admin/kampanyalar" className="font-semibold text-primary-700">Kampanyalara dön</Link></p>
  if (!campaign) return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/kampanyalar" aria-label="Kampanyalara dön" className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-900"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Megaphone className="h-5 w-5" /></div>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-gray-900">{campaign.title}</h1>
          <div className="text-[12px] text-gray-500">Toplanan {formatMoney(campaign.collected_cents, campaign.currency)}{campaign.target_cents ? ` / ${formatMoney(campaign.target_cents, campaign.currency)}` : ''}</div>
        </div>
        <a href={`/kampanyalar/${campaign.slug}`} target="_blank" rel="noopener noreferrer" className="ms-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
          Sitede gör <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <CampaignEditor campaign={campaign} onCancel={() => router.push('/admin/kampanyalar')}
        onSaved={(c) => { savedNotice(false); setCampaign(c) }} />
    </div>
  )
}
