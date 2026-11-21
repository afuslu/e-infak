'use client'

import { useEffect, useMemo, useState } from 'react'
import type { BuilderCatalog } from '../../lib/blocks'

export interface CommandItem {
  id: string
  group: string
  icon: string
  label: string
  hint?: string
  run: () => void
}

export function CommandPaletteModal({
  catalog,
  pages,
  actions,
  onSelectPage,
  onAddBlock,
  onClose,
}: {
  catalog: BuilderCatalog | null
  pages: Array<{ id: string; title: string; kind: string; slug: string | null }>
  actions: CommandItem[]
  onSelectPage: (id: string) => void
  onAddBlock: (type: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [idx, setIdx] = useState(0)

  const items = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [...actions]
    for (const p of pages) {
      list.push({
        id: `page-${p.id}`,
        group: 'Sayfalar',
        icon: p.kind === 'home' ? '🏠' : p.kind === 'header' ? '▤' : p.kind === 'footer' ? '▥' : '📄',
        label: p.title,
        hint: p.slug ? `/sayfa/${p.slug}` : p.kind,
        run: () => onSelectPage(p.id),
      })
    }
    if (catalog) {
      for (const [key, spec] of Object.entries(catalog.blocks)) {
        if (spec.hidden) continue
        list.push({
          id: `block-${key}`,
          group: 'Öğe Ekle',
          icon: spec.icon || '＋',
          label: `${spec.label} ekle`,
          hint: spec.group,
          run: () => onAddBlock(key),
        })
      }
    }
    const q = query.trim().toLocaleLowerCase('tr')
    if (!q) return list.slice(0, 24)
    return list.filter((it) => `${it.label} ${it.group} ${it.hint || ''}`.toLocaleLowerCase('tr').includes(q)).slice(0, 30)
  }, [actions, pages, catalog, query, onSelectPage, onAddBlock])

  useEffect(() => { setIdx(0) }, [query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, Math.max(0, items.length - 1))) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)) }
      else if (e.key === 'Enter' && items[idx]) { e.preventDefault(); items[idx].run(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, idx, onClose])

  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center bg-black/45 px-4 pt-[12vh] backdrop-blur-xs" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <span className="text-sm text-gray-400">⌘</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sayfa değiştir, öğe ekle veya işlem ara… (ör. IBAN, Slider, Yayınla)"
            className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
          />
          <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-400">Eşleşen komut, sayfa veya öğe bulunamadı.</p>
          ) : items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => setIdx(i)}
              onClick={() => { item.run(); onClose() }}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${
                i === idx ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-5 text-center text-sm">{item.icon}</span>
                <span className="truncate font-semibold">{item.label}</span>
              </span>
              <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                {item.hint || item.group}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-2 text-[10px] text-gray-500">
          <span>↑↓ gezin · Enter çalıştır</span>
          <span>Ctrl+K / ⌘K</span>
        </div>
      </div>
    </div>
  )
}
