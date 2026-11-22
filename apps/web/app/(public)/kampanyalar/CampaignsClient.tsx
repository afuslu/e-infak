'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { CampaignList } from '../../../components/campaign/CampaignList'
import { SmsDonationBanner } from '../../../components/site/SmsDonationBanner'

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

interface Tab { id: string; name: string; parent_id: string | null; show_on_open: boolean }

export default function CampaignsClient({ initialCategory = '', initialSearch = '' }: { initialCategory?: string; initialSearch?: string }) {
  const [category, setCategory] = useState(initialCategory)
  const [search, setSearch] = useState(initialSearch)
  // "Kampanya Sekmeler" set in the panel replace the fixed categories once there are any.
  const [tabs, setTabs] = useState<Tab[]>([])
  const [tab, setTab] = useState('')
  useEffect(() => {
    axios.get<Tab[]>('/api/v1/public/campaign-tabs').then((r) => {
      setTabs(r.data)
      const opening = r.data.find((t) => t.show_on_open)
      if (opening && !initialCategory) setTab(opening.id)
    }).catch(() => setTabs([]))
  }, [initialCategory])
  const roots = tabs.filter((t) => !t.parent_id)
  const tabIds = tab ? [tab, ...tabs.filter((t) => t.parent_id === tab).map((t) => t.id)] : undefined
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
          {roots.length > 0 && [['Tümü', ''] as const, ...roots.map((t) => [t.name, t.id] as const)].map(([label, value]) => (
            <button key={value || 'all-tabs'} type="button" onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={`flex-none rounded-full px-4 py-2 text-sm font-semibold transition-colors ${tab === value ? 'bg-primary-600 text-white shadow-sm' : 'border border-gray-200/80 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50'}`}>
              {label}
            </button>
          ))}
          {!roots.length && categories.map(([label, value]) => (
            <button key={value || 'all'} type="button" onClick={() => setCategory(value)}
              aria-pressed={category === value}
              className={`flex-none rounded-full px-4 py-2 text-sm font-semibold transition-colors ${category === value ? 'bg-primary-600 text-white shadow-sm' : 'border border-gray-200/80 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50'}`}>
              {label}
            </button>
          ))}
        </div>
        <CampaignList category={roots.length ? undefined : category} search={search} tabIds={roots.length ? tabIds : undefined} />
        <SmsDonationBanner className="mt-10" />
      </div>
    </main>
  )
}
