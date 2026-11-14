'use client'

import { useMemo, useState } from 'react'
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
  const cols = first.children?.filter((c) => c.type === 'column' || c.type === 'header_slot') || []
  if (cols.length >= 2) {
    return (
      <div className="mt-2 grid gap-1 rounded border border-gray-100 bg-gray-50 p-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(cols.length, 4)}, minmax(0, 1fr))` }}>
        {cols.slice(0, 4).map((c, idx) => (
          <div key={idx} className="space-y-1 rounded bg-white p-1 shadow-2xs">
            <div className="h-1.5 w-3/4 rounded bg-blue-200" />
            <div className="h-1 w-full rounded bg-gray-200" />
            <div className="h-1 w-2/3 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    )
  }
  if (first.type === 'hero' || first.type === 'cta_band') {
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

export function LibraryPanel({ library, catalog, kind, saved, onInsert, onReplace, onInsertSaved, onDeleteSaved, onApplyDemo }: {
  library: Library | null
  catalog: BuilderCatalog
  kind: string
  saved: SavedBlock[]
  onInsert: (blocks: Block[]) => void
  onReplace: (blocks: Block[], label: string) => void
  onInsertSaved: (saved: SavedBlock) => void
  onDeleteSaved: (saved: SavedBlock) => void
  onApplyDemo: (demo: LibraryDemo, options: DemoOptions) => Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('sections')
  const [query, setQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState<string>('Tümü')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
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
    return ['Tümü', ...Array.from(set)]
  }, [library, kind, chrome])

  const activeGroupFilter = allGroups.includes(groupFilter) ? groupFilter : 'Tümü'

  const groups = useMemo(() => {
    const out: Record<string, LibrarySection[]> = {}
    const q = query.trim().toLocaleLowerCase('tr')
    for (const s of library?.sections || []) {
      if (chrome ? s.kind !== kind : s.kind !== 'content') continue
      if (activeGroupFilter !== 'Tümü' && s.group !== activeGroupFilter) continue
      if (q && !`${s.label} ${s.description} ${s.group}`.toLocaleLowerCase('tr').includes(q)) continue
      ;(out[s.group] ||= []).push(s)
    }
    return Object.entries(out)
  }, [library, kind, chrome, query, activeGroupFilter])

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
        {!chrome && <button type="button" className={subTab(activeTab === 'pages')} onClick={() => setTab('pages')}>Sayfa şablonları</button>}
        <button type="button" className={subTab(activeTab === 'saved')} onClick={() => setTab('saved')}>Kayıtlılarım ({filteredSaved.length})</button>
        <button type="button" className={subTab(activeTab === 'demos')} onClick={() => setTab('demos')}>Demolar</button>
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
                {!isCollapsed && (
                  <div className="space-y-1.5">
                    {items.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        draggable={!chrome}
                        onDragStart={(e) => {
                          if (chrome) return
                          e.dataTransfer.setData('application/x-new-blocks', JSON.stringify(s.blocks))
                          e.dataTransfer.effectAllowed = 'copy'
                        }}
                        onClick={() => (chrome ? onReplace(s.blocks, s.label) : onInsert(s.blocks))}
                        className="block w-full rounded-lg border bg-white p-2.5 text-start hover:border-blue-500 hover:bg-blue-50"
                      >
                        <span className="block text-[12px] font-bold text-gray-800">{s.label}</span>
                        <span className="block text-[11px] text-gray-500">{s.description}</span>
                        <SectionWireframe blocks={s.blocks} />
                        <Outline blocks={s.blocks} catalog={catalog} />
                      </button>
                    ))}
                  </div>
                )}
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
    </div>
  )
}
