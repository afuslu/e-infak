'use client'

import { useState } from 'react'
import { CampaignList } from '../../../components/campaign/CampaignList'

const categories = [
  ['Tümü', ''],
  ['Eğitim', 'egitim'],
  ['Sağlık', 'saglik'],
  ['Gıda', 'gida'],
  ['Su', 'su'],
  ['Yetim', 'yetim'],
  ['Kurban', 'kurban'],
]

export default function CampaignsPage() {
  const [category, setCategory] = useState('')
  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold text-gray-900">Kampanyalar</h1>
          <p className="text-lg text-gray-600">Aktif kampanyalarımıza göz atın ve destek olmak istediğiniz projeyi seçin.</p>
        </div>
        <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Kampanya kategorisi">
          {categories.map(([label, value]) => (
            <button key={value || 'all'} type="button" onClick={() => setCategory(value)}
              aria-pressed={category === value}
              className={`rounded-lg px-4 py-2 text-sm font-bold ${category === value ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
              {label}
            </button>
          ))}
        </div>
        <CampaignList category={category} />
      </div>
    </main>
  )
}
