'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { Block, BuilderCatalog } from '../../lib/blocks'

export interface LibrarySection { key: string; label: string; group: string; description: string; kind: 'content' | 'header' | 'footer'; blocks: Block[] }
export interface LibraryPage { key: string; label: string; slug: string; description: string; blocks: Block[] }
export interface LibraryDemo { key: string; label: string; description: string; image: string; kit: string; pages: string[] }
export interface Library { sections: LibrarySection[]; pages: LibraryPage[]; demos: LibraryDemo[] }
export interface SavedBlock { id: string; name: string; zone: string; block: Block; created_by: string | null; created_at: string | null }
export interface DemoOptions { apply_theme: boolean; include_pages: boolean; publish: boolean }

type Tab = 'sections' | 'pages' | 'saved' | 'demos'

const subTab = (active: boolean) => `rounded-md px-2 py-1 text-[11px] font-semibold ${active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`

/** Mini schematic wireframe of a section so users see its layout shape before inserting. */
function SectionWireframe({ blocks }: { blocks: Block[] }) {
  const first = blocks[0]
  if (!first) return null
  const flatTypes = new Set<string>()
  const walk = (list: Block[]) => {
    for (const b of list) {
      flatTypes.add(b.type)
      if (b.children?.length) walk(b.children)
    }
  }
  walk(blocks)

  // Header preview (1 or 2 rows)
  if (first.type === 'header_row') {
    return (
      <div className="mt-2 space-y-1 rounded border border-gray-200 bg-gray-50 p-1.5">
        {blocks.slice(0, 3).map((row, idx) => {
          const tone = String(row.props?.tone || 'light')
          const dark = tone === 'dark' || tone === 'brand'
          const slots = row.children?.filter((c) => c.type === 'header_slot') || []
          const isThin = Number(row.props?.height || 72) <= 44
          return (
            <div
              key={idx}
              className={`flex items-center justify-between rounded px-2 ${isThin ? 'h-3' : 'h-5'} ${
                tone === 'brand' ? 'bg-blue-600/85' : dark ? 'bg-slate-800' : 'border border-gray-200 bg-white'
              }`}
            >
              <div className={`h-1.5 w-8 rounded ${dark ? 'bg-white/75' : 'bg-gray-400'}`} />
              <div className="flex gap-1">
                {Array.from({ length: Math.max(2, Math.min(slots.length + 1, 4)) }).map((_, j) => (
                  <div key={j} className={`h-1 w-4 rounded ${dark ? 'bg-white/40' : 'bg-gray-300'}`} />
                ))}
              </div>
              <div className={`h-2 w-7 rounded-full ${dark ? 'bg-amber-400/90' : 'bg-blue-500/80'}`} />
            </div>
          )
        })}
      </div>
    )
  }

  // Slider preview
  if (first.type === 'slider' || flatTypes.has('slider')) {
    return (
      <div className="mt-2 flex flex-col justify-between rounded border border-indigo-200 bg-gradient-to-br from-slate-800 via-indigo-900 to-blue-900 p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="h-3 w-3 rounded-full bg-white/20" />
          <div className="flex-1 space-y-1 text-center">
            <div className="mx-auto h-1 w-10 rounded bg-amber-300/80" />
            <div className="mx-auto h-2 w-3/4 rounded bg-white/85" />
            <div className="mx-auto h-1.5 w-12 rounded-full bg-emerald-400/85" />
          </div>
          <div className="h-3 w-3 rounded-full bg-white/20" />
        </div>
        <div className="mt-1.5 flex justify-center gap-1">
          <span className="h-1 w-3 rounded-full bg-white/90" />
          <span className="h-1 w-1 rounded-full bg-white/40" />
          <span className="h-1 w-1 rounded-full bg-white/40" />
        </div>
      </div>
    )
  }

  // Donation / Campaign cards preview
  if (flatTypes.has('donation_cards') || flatTypes.has('campaigns') || flatTypes.has('campaign_card')) {
    const dark = String(first.props?.card_theme || first.props?.tone || '') === 'dark'
    return (
      <div className={`mt-2 grid grid-cols-3 gap-1 rounded border p-1.5 ${dark ? 'border-slate-700 bg-slate-900' : 'border-emerald-100 bg-emerald-50/40'}`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`space-y-1 rounded p-1 ${dark ? 'bg-slate-800' : 'bg-white shadow-2xs'}`}>
            <div className={`h-4 rounded ${dark ? 'bg-slate-700' : 'bg-emerald-100'}`} />
            <div className={`h-1 w-3/4 rounded ${dark ? 'bg-slate-500' : 'bg-gray-300'}`} />
            <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200/50">
              <div className="h-full w-2/3 bg-emerald-500" />
            </div>
            <div className="h-1.5 w-full rounded bg-emerald-600/80" />
          </div>
        ))}
      </div>
    )
  }

  // IBAN / Bank accounts preview
  if (flatTypes.has('bank_accounts')) {
    return (
      <div className="mt-2 space-y-1 rounded border border-sky-100 bg-sky-50/50 p-1.5">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center justify-between rounded bg-white px-1.5 py-1 shadow-2xs">
            <div className="space-y-0.5">
              <div className="h-1.5 w-14 rounded bg-sky-300" />
              <div className="h-1 w-24 rounded bg-gray-200" />
            </div>
            <div className="h-2.5 w-8 rounded bg-sky-500/80" />
          </div>
        ))}
      </div>
    )
  }

  // Stats / counters preview
  if (flatTypes.has('stats')) {
    const dark = ['bento_dark', 'dark_gold_counters', 'emerald_counters', 'gradient'].includes(String(first.props?.variant || ''))
    return (
      <div className={`mt-2 grid grid-cols-4 gap-1 rounded border p-1.5 ${dark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-gray-50'}`}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`flex flex-col items-center gap-1 rounded p-1 ${dark ? 'bg-slate-800' : 'bg-white shadow-2xs'}`}>
            <div className={`h-2 w-7 rounded ${dark ? 'bg-amber-400/90' : 'bg-blue-500/75'}`} />
            <div className={`h-1 w-9 rounded ${dark ? 'bg-white/30' : 'bg-gray-200'}`} />
          </div>
        ))}
      </div>
    )
  }

  // Gallery / Video preview
  if (flatTypes.has('gallery_strip') || flatTypes.has('image_gallery') || flatTypes.has('video_gallery')) {
    const isVid = flatTypes.has('video_gallery')
    return (
      <div className="mt-2 grid grid-cols-4 gap-1 rounded border border-gray-100 bg-gray-50 p-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex h-6 items-center justify-center rounded bg-gradient-to-br from-slate-200 to-slate-300">
            {isVid && <div className="h-2.5 w-2.5 rounded-full bg-white/90" />}
          </div>
        ))}
      </div>
    )
  }

  // FAQ preview
  if (flatTypes.has('faq')) {
    return (
      <div className="mt-2 space-y-1 rounded border border-gray-100 bg-gray-50 p-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between rounded bg-white px-1.5 py-1 shadow-2xs">
            <div className="h-1 w-2/3 rounded bg-gray-300" />
            <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
          </div>
        ))}
      </div>
    )
  }

  // Newsletter / Contact form preview
  if (flatTypes.has('newsletter') || flatTypes.has('contact_form')) {
    return (
      <div className="mt-2 flex items-center gap-1.5 rounded border border-indigo-100 bg-indigo-50/50 p-1.5">
        <div className="h-3.5 flex-1 rounded border border-indigo-200 bg-white" />
        <div className="h-3.5 w-10 rounded bg-indigo-500/80" />
      </div>
    )
  }

  // Multi-column / Footer preview
  const innerCols = (first.children || []).flatMap((c) => (c.type === 'columns' ? c.children || [] : c.type === 'column' ? [c] : []))
  const cols = innerCols.filter((c) => c.type === 'column' || c.type === 'header_slot')
  if (cols.length >= 2) {
    const dark = String(first.props?.tone || '') === 'dark' || String(first.props?.tone || '') === 'brand'
    return (
      <div
        className={`mt-2 grid gap-1 rounded border p-1.5 ${dark ? 'border-slate-700 bg-slate-900' : 'border-gray-100 bg-gray-50'}`}
        style={{ gridTemplateColumns: `repeat(${Math.min(cols.length, 4)}, minmax(0, 1fr))` }}
      >
        {cols.slice(0, 4).map((_, idx) => (
          <div key={idx} className={`space-y-1 rounded p-1 ${dark ? 'bg-slate-800' : 'bg-white shadow-2xs'}`}>
            <div className={`h-1.5 w-3/4 rounded ${dark ? 'bg-amber-300/70' : 'bg-blue-200'}`} />
            <div className={`h-1 w-full rounded ${dark ? 'bg-white/25' : 'bg-gray-200'}`} />
            <div className={`h-1 w-2/3 rounded ${dark ? 'bg-white/15' : 'bg-gray-100'}`} />
          </div>
        ))}
      </div>
    )
  }

  if (first.type === 'hero' || first.type === 'banner' || first.type === 'cta_band') {
    return (
      <div className="mt-2 flex flex-col items-center justify-center gap-1 rounded border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-3 py-2">
        <div className="h-2 w-1/2 rounded bg-blue-300" />
        <div className="h-1 w-2/3 rounded bg-blue-200/80" />
        <div className="mt-0.5 h-2 w-10 rounded-full bg-blue-500/70" />
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-1 rounded border border-gray-100 bg-gray-50 p-1.5">
      <div className="h-1.5 w-1/3 rounded bg-gray-300" />
      <div className="h-1 w-full rounded bg-gray-200" />
      <div className="h-1 w-4/5 rounded bg-gray-200" />
    </div>
  )
}

/** Icons of the blocks a section is made of: a quick idea of its layout without rendering it. */
function Outline({ blocks, catalog }: { blocks: Block[]; catalog: BuilderCatalog }) {
  const flat = blocks.flatMap((b) => (b.type === 'section' || b.type === 'header_row' ? (b.children || []).flatMap((c) => (c.type === 'header_slot' || c.type === 'column' ? c.children || [] : [c])) : [b]))
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {flat.slice(0, 8).map((b, i) => (
        <span key={i} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{catalog.blocks[b.type]?.icon} {catalog.blocks[b.type]?.label || b.type}</span>
      ))}
    </div>
  )
}

export function LibraryPanel({ library, catalog, kind, saved, onInsert, onReplace, onInsertSaved, onDeleteSaved, onApplyDemo, renderPreview }: {
  library: Library | null
  catalog: BuilderCatalog
  kind: string
  saved: SavedBlock[]
  onInsert: (blocks: Block[]) => void
  onReplace: (blocks: Block[], label: string) => void
  onInsertSaved: (saved: SavedBlock) => void
  onDeleteSaved: (saved: SavedBlock) => void
  onApplyDemo: (demo: LibraryDemo, options: DemoOptions) => Promise<void>
  renderPreview?: (blocks: Block[]) => ReactNode
}) {
  const [tab, setTab] = useState<Tab>('sections')
  const [query, setQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState<string>('Tümü')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [expandedLimits, setExpandedLimits] = useState<Record<string, boolean>>({})
  const [previewSection, setPreviewSection] = useState<LibrarySection | null>(null)
  const [favorites, setFavorites] = useState<string[]>([])
  useEffect(() => {
    try {
      const raw = localStorage.getItem('einfak_fav_sections')
      if (raw) setFavorites(JSON.parse(raw))
    } catch {
      /* ignore */
    }
  }, [])
  const toggleFavorite = (key: string) => {
    setFavorites((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      try { localStorage.setItem('einfak_fav_sections', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  const [demo, setDemo] = useState<LibraryDemo | null>(null)
  const [options, setOptions] = useState<DemoOptions>({ apply_theme: true, include_pages: true, publish: false })
  const [busy, setBusy] = useState(false)
  const chrome = kind === 'header' || kind === 'footer'
  const activeTab: Tab = chrome && tab === 'pages' ? 'sections' : tab

  const allGroups = useMemo(() => {
    const set = new Set<string>()
    for (const s of library?.sections || []) {
      if (chrome ? s.kind !== kind : s.kind !== 'content') continue
      set.add(s.group)
    }
    return ['Tümü', ...(favorites.length > 0 ? ['★ Favoriler'] : []), ...Array.from(set)]
  }, [library, kind, chrome, favorites.length])

  const activeGroupFilter = allGroups.includes(groupFilter) ? groupFilter : 'Tümü'

  const groups = useMemo(() => {
    const out: Record<string, LibrarySection[]> = {}
    const q = query.trim().toLocaleLowerCase('tr')
    for (const s of library?.sections || []) {
      if (chrome ? s.kind !== kind : s.kind !== 'content') continue
      if (activeGroupFilter === '★ Favoriler') {
        if (!favorites.includes(s.key)) continue
      } else if (activeGroupFilter !== 'Tümü' && s.group !== activeGroupFilter) {
        continue
      }
      if (q && !`${s.label} ${s.description} ${s.group}`.toLocaleLowerCase('tr').includes(q)) continue
      ;(out[s.group] ||= []).push(s)
    }
    return Object.entries(out)
  }, [library, kind, chrome, query, activeGroupFilter, favorites])

  const filteredDemos = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    return (library?.demos || []).filter((d) => !q || `${d.label} ${d.description} ${d.kit}`.toLocaleLowerCase('tr').includes(q))
  }, [library, query])

  const filteredPages = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    return (library?.pages || []).filter((p) => !q || `${p.label} ${p.description}`.toLocaleLowerCase('tr').includes(q))
  }, [library, query])

  const filteredSaved = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    return saved.filter((s) => {
      const zoneOk = chrome ? s.zone === kind : !s.zone || (s.zone !== 'header' && s.zone !== 'footer')
      if (!zoneOk) return false
      if (!q) return true
      const typeLabel = catalog.blocks[s.block?.type]?.label || s.block?.type || ''
      return `${s.name} ${typeLabel} ${s.created_by || ''}`.toLocaleLowerCase('tr').includes(q)
    })
  }, [saved, query, chrome, kind, catalog])

  if (!library) return <p className="text-[12px] text-gray-400">Şablonlar yükleniyor…</p>

  const searchBox = (placeholder: string) => (
    <div className="relative">
      <input className="w-full rounded-md border px-2 py-1.5 pr-7 text-[12px]" placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      {query && (
        <button type="button" onClick={() => setQuery('')} aria-label="Aramayı temizle"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700">✕</button>
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        <button type="button" className={subTab(activeTab === 'sections')} onClick={() => setTab('sections')}>{chrome ? 'Hazır düzenler' : 'Bölümler'}</button>
        {!chrome && <button type="button" className={subTab(activeTab === 'pages')} onClick={() => setTab('pages')}>Sayfa ({library.pages.length})</button>}
        <button type="button" className={subTab(activeTab === 'saved')} onClick={() => setTab('saved')}>Kayıtlı ({filteredSaved.length})</button>
        <button type="button" className={subTab(activeTab === 'demos')} onClick={() => setTab('demos')}>Demolar ({library.demos.length})</button>
      </div>

      {activeTab === 'sections' && (
        <>
          {searchBox('Şablon ara (slider, carousel, bağış…)')}
          {!chrome && allGroups.length > 2 && (
            <div className="flex flex-wrap gap-1">
              {allGroups.map((g) => (
                <button key={g} type="button" onClick={() => setGroupFilter(g)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${activeGroupFilter === g ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {g}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-400">
            {chrome ? 'Seçtiğiniz düzen mevcut olanın yerine geçer (yayınlayana kadar taslaktır).' : 'Bölüm, seçili bloğun altına; seçim yoksa sayfanın sonuna eklenir.'}
          </p>
          {groups.length === 0 && <p className="py-4 text-center text-[12px] text-gray-400">Eşleşen şablon bulunamadı.</p>}
          {groups.map(([group, items]) => {
            const isCollapsed = !query.trim() && activeGroupFilter === 'Tümü' && !!collapsedGroups[group]
            return (
              <div key={group}>
                <button
                  type="button"
                  onClick={() => setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }))}
                  className="mb-1.5 flex w-full items-center justify-between text-left text-[11px] font-bold uppercase tracking-wide text-gray-400 hover:text-gray-600"
                >
                  <span>{group} ({items.length})</span>
                  <span>{isCollapsed ? '▸' : '▾'}</span>
                </button>
                {!isCollapsed && (() => {
                  const limit = !query.trim() && activeGroupFilter === 'Tümü' && !expandedLimits[group] ? 10 : items.length
                  const visibleItems = items.slice(0, limit)
                  const remaining = items.length - visibleItems.length
                  return (
                    <div className="space-y-1.5">
                      {visibleItems.map((s) => {
                        const isFav = favorites.includes(s.key)
                        return (
                          <div key={s.key} className="group relative">
                            <button
                              type="button"
                              draggable={!chrome}
                              onDragStart={(e) => {
                                if (chrome) return
                                e.dataTransfer.setData('application/x-new-blocks', JSON.stringify(s.blocks))
                                e.dataTransfer.effectAllowed = 'copy'
                              }}
                              onClick={() => (chrome ? onReplace(s.blocks, s.label) : onInsert(s.blocks))}
                              className="block w-full rounded-lg border bg-white p-2.5 pr-7 text-start hover:border-blue-500 hover:bg-blue-50"
                            >
                              <span className="block text-[12px] font-bold text-gray-800">{s.label}</span>
                              <span className="block text-[11px] text-gray-500">{s.description}</span>
                              <SectionWireframe blocks={s.blocks} />
                              <Outline blocks={s.blocks} catalog={catalog} />
                            </button>
                            <div className="absolute right-2 top-2 flex items-center gap-0.5">
                              {renderPreview && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setPreviewSection(s) }}
                                  title="Canlı önizle"
                                  className="rounded px-1 py-0.5 text-[11px] text-gray-400 opacity-0 transition hover:bg-blue-100 hover:text-blue-700 group-hover:opacity-100"
                                >
                                  👁
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleFavorite(s.key) }}
                                title={isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                                className={`rounded p-0.5 text-xs transition ${isFav ? 'text-amber-500' : 'text-gray-300 opacity-0 hover:text-amber-400 group-hover:opacity-100'}`}
                              >
                                {isFav ? '★' : '☆'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                      {remaining > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedLimits((prev) => ({ ...prev, [group]: true }))}
                          className="w-full rounded-md border border-dashed border-gray-200 bg-gray-50 py-1.5 text-[11px] font-semibold text-gray-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                        >
                          +{remaining} şablon daha göster
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </>
      )}

      {activeTab === 'pages' && (
        <>
          {searchBox('Sayfa şablonu ara…')}
          <p className="text-[11px] text-gray-400">Şablon bu sayfanın içeriğinin yerine geçer. Geri almak için Ctrl+Z.</p>
          {filteredPages.length === 0 && <p className="py-4 text-center text-[12px] text-gray-400">Eşleşen sayfa şablonu bulunamadı.</p>}
          {filteredPages.map((p) => (
            <button key={p.key} type="button" onClick={() => { if (window.confirm(`“${p.label}” şablonu mevcut sayfa içeriğinin yerine geçecek. Devam edilsin mi?`)) onReplace(p.blocks, p.label) }}
              className="block w-full rounded-lg border bg-white p-2.5 text-start hover:border-blue-500 hover:bg-blue-50">
              <span className="block text-[12px] font-bold text-gray-800">📄 {p.label}</span>
              <span className="block text-[11px] text-gray-500">{p.description}</span>
              <Outline blocks={p.blocks} catalog={catalog} />
            </button>
          ))}
        </>
      )}

      {activeTab === 'saved' && (
        <>
          {searchBox('Kayıtlı blok ara…')}
          <p className="text-[11px] text-gray-400">Bir bloğu kaydetmek için seçip sağ paneldeki 💾 düğmesine basın. Kayıtlı bloklar uyumlu sayfalarda kullanılabilir.</p>
          {filteredSaved.length === 0 && (
            <p className="rounded-md border border-dashed p-4 text-center text-[12px] text-gray-400">
              {saved.length === 0 ? 'Henüz kayıtlı blok yok.' : 'Bu alan için eşleşen kayıtlı blok bulunamadı.'}
            </p>
          )}
          {filteredSaved.map((s) => (
            <div
              key={s.id}
              draggable={!chrome}
              onDragStart={(e) => {
                if (chrome || !s.block) return
                e.dataTransfer.setData('application/x-new-blocks', JSON.stringify([s.block]))
                e.dataTransfer.effectAllowed = 'copy'
              }}
              className="flex items-start gap-2 rounded-lg border bg-white p-2.5"
            >
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => onInsertSaved(s)}>
                <span className="block truncate text-[12px] font-bold text-gray-800">{catalog.blocks[s.block?.type]?.icon} {s.name}</span>
                <span className="block text-[11px] text-gray-400">{catalog.blocks[s.block?.type]?.label} · {s.created_by || ''}</span>
              </button>
              <button
                type="button"
                title="Sil"
                className="text-[12px] text-red-500 hover:text-red-700"
                onClick={() => onDeleteSaved(s)}
              >✕</button>
            </div>
          ))}
        </>
      )}

      {activeTab === 'demos' && (
        <>
          {searchBox('Demo ara…')}
          <p className="text-[11px] text-gray-400">Demo; ana sayfayı, header&apos;ı, footer&apos;ı ve isterseniz renk-yazı tipi temasını tek seferde kurar. Mevcut sayfalarınız silinmez.</p>
          {filteredDemos.length === 0 && <p className="py-4 text-center text-[12px] text-gray-400">Eşleşen demo bulunamadı.</p>}
          {filteredDemos.map((d) => (
            <button key={d.key} type="button" onClick={() => setDemo(d)}
              className="block w-full overflow-hidden rounded-lg border bg-white text-start hover:border-blue-500">
              <img src={d.image} alt="" className="h-24 w-full object-cover" />
              <span className="block px-2.5 pt-2 text-[12px] font-bold text-gray-800">{d.label}</span>
              <span className="block px-2.5 pb-2.5 text-[11px] text-gray-500">{d.description}</span>
            </button>
          ))}
        </>
      )}

      {demo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setDemo(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <img src={demo.image} alt="" className="h-36 w-full object-cover" />
            <div className="space-y-3 p-5">
              <h3 className="text-lg font-bold">“{demo.label}” demosunu kur</h3>
              <p className="text-[13px] text-gray-600">{demo.description}</p>
              <ul className="list-disc ps-5 text-[12px] text-gray-600">
                <li>Ana sayfa, header ve footer bu demoyla değiştirilir (önceki yayınlar Sürümler&apos;de kalır).</li>
                {options.include_pages && <li>Eklenecek sayfalar: {demo.pages.map((key) => library.pages.find((p) => p.key === key)?.label || key).join(', ')} (adresi dolu olan atlanır).</li>}
              </ul>
              {([['apply_theme', 'Renkleri ve yazı tiplerini de uygula'], ['include_pages', 'Örnek sayfaları ekle'], ['publish', 'Hemen yayınla (işaretsizse taslak olarak kalır)']] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-[13px] font-semibold text-gray-700">
                  <input type="checkbox" checked={options[key]} onChange={(e) => setOptions({ ...options, [key]: e.target.checked })} />{label}
                </label>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={busy} className="rounded-md border px-3 py-1.5 text-[13px] font-semibold" onClick={() => setDemo(null)}>Vazgeç</button>
                <button type="button" disabled={busy} className="rounded-md bg-blue-600 px-3 py-1.5 text-[13px] font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  onClick={async () => { setBusy(true); try { await onApplyDemo(demo, options); setDemo(null) } finally { setBusy(false) } }}>
                  {busy ? 'Kuruluyor…' : 'Demoyu kur'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {previewSection && renderPreview && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs" onClick={() => setPreviewSection(null)}>
          <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{previewSection.label}</h3>
                <p className="text-[11px] text-gray-500">{previewSection.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (chrome) onReplace(previewSection.blocks, previewSection.label)
                    else onInsert(previewSection.blocks)
                    setPreviewSection(null)
                  }}
                  className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  {chrome ? 'Bu Düzeni Uygula' : '+ Sayfaya Ekle'}
                </button>
                <button type="button" onClick={() => setPreviewSection(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100 p-4">
              <div className="mx-auto max-w-[1200px] overflow-hidden rounded-xl border bg-white shadow-sm">
                <div className="pointer-events-none">{renderPreview(previewSection.blocks)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
