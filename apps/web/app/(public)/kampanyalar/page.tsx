import { Metadata } from 'next'
import { CampaignList } from '@/components/campaign/CampaignList'

export const metadata: Metadata = {
  title: 'Kampanyalar | E-İnfak',
  description: 'Aktif bağış kampanyalarımızı inceleyin ve destek olun',
}

export default function CampaignsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold text-gray-900">Kampanyalar</h1>
          <p className="text-lg text-gray-600">
            Aktif kampanyalarımıza göz atın ve destek olmak istediğiniz projeyi seçin
          </p>
        </div>

        {/* Filters - TODO: Add filter functionality */}
        <div className="mb-8 flex flex-wrap gap-2">
          <button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">
            Tümü
          </button>
          <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Eğitim
          </button>
          <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Sağlık
          </button>
          <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Gıda
          </button>
          <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Su
          </button>
        </div>

        <CampaignList />
      </div>
    </div>
  )
}
