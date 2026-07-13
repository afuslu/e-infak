import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardFooter } from '@e-infak/ui'
import type { Campaign } from '@e-infak/api-client'

interface CampaignCardProps {
  campaign: Campaign
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  return (
    <Link href={`/kampanyalar/${campaign.slug}`}>
      <Card className="overflow-hidden transition-all hover:shadow-lg">
        <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
          {campaign.cover_image_url ? (
            <Image
              src={campaign.cover_image_url}
              alt={campaign.title}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-primary-50">
              <span className="text-primary-300">Görsel Yok</span>
            </div>
          )}
          {campaign.is_featured && (
            <div className="absolute right-2 top-2 rounded-full bg-accent-500 px-3 py-1 text-xs font-semibold text-white">
              Öne Çıkan
            </div>
          )}
        </div>
        
        <CardContent className="p-4">
          <h3 className="mb-2 line-clamp-2 font-heading text-lg font-bold text-gray-900">
            {campaign.title}
          </h3>
          <p className="mb-4 line-clamp-2 text-sm text-gray-600">
            {campaign.summary}
          </p>

          {campaign.show_collected && (
            <>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-primary-600">
                  {campaign.collected_lira.toLocaleString('tr-TR')} ₺
                </span>
                <span className="text-gray-500">
                  Hedef: {campaign.target_lira.toLocaleString('tr-TR')} ₺
                </span>
              </div>
              
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full bg-primary-500 transition-all duration-500"
                  style={{ width: `${Math.min(campaign.progress_percentage, 100)}%` }}
                />
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="p-4 pt-0">
          <button className="w-full rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700">
            Bağış Yap
          </button>
        </CardFooter>
      </Card>
    </Link>
  )
}
