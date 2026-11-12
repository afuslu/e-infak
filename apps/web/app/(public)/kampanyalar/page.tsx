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
  ['Zekât', 'zekat'],
  ['Fitre', 'fitre'],
  ['Fidye', 'fidye'],
  ['Sadaka', 'sadaka'],
  ['Adak', 'adak'],
  ['Akika', 'akika'],
]

export default function CampaignsPage() {
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  return (
    <main className="min-h-screen bg-gray-50 py-10 sm:py-12">
      <div className="mx-auto max-w-[var(--site-container)] px-4 sm:px-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mb-1.5 font-heading text-3xl font-bold text-gray-900 sm:text-4xl">Kampanyalar</h1>
            <p className="text-base text-gray-600 sm:text-lg">Aktif kampanyalarımıza göz atın ve destek olmak istediğiniz projeyi seçin.</p>
          </div>
          <div className="w-full md:w-72">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kampanya ara…"
              aria-label="Kampanya ara"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15"
            />
          </div>
        </div>
        <div
          className="mb-8 flex flex-nowrap gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap"
          role="group"
          aria-label="Kampanya kategorisi"
        >
          {categories.map(([label, value]) => (
            <button key={value || 'all'} type="button" onClick={() => setCategory(value)}
              aria-pressed={category === value}
              className={`flex-none rounded-full px-4 py-2 text-sm font-semibold transition-colors ${category === value ? 'bg-primary-600 text-white shadow-sm' : 'border border-gray-200/80 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50'}`}>
              {label}
            </button>
          ))}
        </div>
        <CampaignList category={category} search={search} />
      </div>
    </main>
  )
}
