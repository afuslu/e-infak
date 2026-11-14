'use client'

import { useMemo, useState, type ReactNode } from 'react'

export interface FilterableCampaignItem {
  key: string
  category: string
  categoryLabel: string
  node: ReactNode
}

export function CampaignsFilterClient({
  items,
  allLabel,
  containerClass,
  isBento = false,
}: {
  items: FilterableCampaignItem[]
  allLabel: string
  containerClass: string
  isBento?: boolean
}) {
  const [selected, setSelected] = useState<string>('all')

  const categories = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      if (item.category && !map.has(item.category)) {
        map.set(item.category, item.categoryLabel || item.category)
      }
    }
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }))
  }, [items])

  const filtered = useMemo(
    () => (selected === 'all' ? items : items.filter((item) => item.category === selected)),
    [items, selected],
  )

  return (
    <div>
      {categories.length > 1 && (
        <div className="mb-7 flex flex-wrap items-center gap-2" role="tablist" aria-label={allLabel}>
          <button
            type="button"
            role="tab"
            aria-selected={selected === 'all'}
            onClick={() => setSelected('all')}
            className={`rounded-full px-4 py-2 text-xs font-bold transition sm:text-sm ${
              selected === 'all'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'border border-gray-200 bg-white text-gray-600 hover:border-primary-400 hover:text-primary-700'
            }`}
          >
            {allLabel} ({items.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              role="tab"
              aria-selected={selected === cat.key}
              onClick={() => setSelected(cat.key)}
              className={`rounded-full px-4 py-2 text-xs font-bold transition sm:text-sm ${
                selected === cat.key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-primary-400 hover:text-primary-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}
      <div className={containerClass}>
        {filtered.map((item, idx) => (
          <div key={item.key} className={isBento && idx === 0 ? 'sm:col-span-2' : ''}>
            {item.node}
          </div>
        ))}
      </div>
    </div>
  )
}
