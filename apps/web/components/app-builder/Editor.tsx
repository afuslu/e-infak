'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, History, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'
import { adminApiBase, adminGet, adminSend, apiErrorMessage } from '../../lib/admin-access'
import { Fields } from '../builder/FieldInput'
import { BLOCK_DRAG, PhonePreview } from './PhonePreview'
import { StorePanel } from './StorePanel'
import { type AppBlock, type AppCatalog, type AppDesign, type AppLink, type DesignState, newId, type PreviewData } from './types'

type LeftTab = 'blocks' | 'pages' | 'tabs' | 'drawer' | 'theme' | 'templates'
const LEFT: [LeftTab, string][] = [['blocks', 'Bloklar'], ['pages', 'Sayfalar'], ['tabs', 'Sekmeler'], ['drawer', 'Menü'], ['theme', 'Tema'], ['templates', 'Şablonlar']]
const btn = 'rounded-md border bg-white px-2.5 py-1.5 text-[12px] font-semibold text-gray-700 hover:border-gray-400 disabled:opacity-40'
const HISTORY = 80

const freshBlocks = (blocks: AppBlock[]): AppBlock[] => blocks.map((b) => ({ ...structuredClone(b), id: newId('blk') }))

function LinkList({ items, specs, onChange, ctx, max, min, prefix }: {
  items: AppLink[]; specs: any; onChange: (v: AppLink[]) => void; ctx: any; max: number; min: number; prefix: string
}) {
  const [open, setOpen] = useState<string | null>(null)
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={item.id} className="rounded-md border bg-gray-50">
          <div className="flex items-center gap-1 px-2 py-1.5 text-[12px]">
            <button type="button" className="flex-1 truncate text-start font-semibold" onClick={() => setOpen(open === item.id ? null : item.id)}>{open === item.id ? '▾' : '▸'} {item.label || 'Adsız'}</button>
            <button type="button" aria-label="Yukarı" className="px-1" onClick={() => move(i, -1)}>↑</button>
            <button type="button" aria-label="Aşağı" className="px-1" onClick={() => move(i, 1)}>↓</button>
            <button type="button" aria-label="Sil" className="px-1 text-red-600 disabled:opacity-30" disabled={items.length <= min} onClick={() => onChange(items.filter((x) => x.id !== item.id))}>✕</button>
          </div>
          {open === item.id && (
            <div className="space-y-2.5 border-t bg-white p-2.5">
              <Fields specs={specs} values={item} ctx={ctx} onChange={(v) => onChange(items.map((x) => {
                if (x.id === item.id) return { ...(v as AppLink), id: item.id }
                return v.highlight && x.highlight ? { ...x, highlight: undefined } : x // one highlighted tab
              }))} />
            </div>
          )}
        </div>
      ))}
      {items.length < max && (
        <button type="button" className="w-full rounded-md border border-dashed py-1.5 text-[12px] font-semibold text-blue-600 hover:bg-blue-50"
          onClick={() => { const id = newId(prefix); onChange([...items, { id, label: 'Yeni', icon: 'star', action: { type: 'screen', target: 'bagis-yap' } }]); setOpen(id) }}>+ Ekle</button>
      )}
    </div>
  )
}

export function AppBuilderEditor() {
  const [catalog, setCatalog] = useState<AppCatalog | null>(null)
  const [state, setState] = useState<DesignState | null>(null)
  const [design, setDesign] = useState<AppDesign | null>(null)
  const [data, setData] = useState<PreviewData | null>(null)
  const [past, setPast] = useState<AppDesign[]>([])
  const [future, setFuture] = useState<AppDesign[]>([])
  const [left, setLeft] = useState<LeftTab>('blocks')
  const [view, setView] = useState<'design' | 'store'>('design')
  const [pageId, setPageId] = useState('home')
  const [selected, setSelected] = useState<string | null>(null)
  const [device, setDevice] = useState<'ios' | 'android'>('ios')
  const [save, setSave] = useState<{ kind: 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'; text?: string }>({ kind: 'idle' })
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [revisions, setRevisions] = useState<{ id: string; created_at: string; created_by: string }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const version = useRef(0)
  const latest = useRef<AppDesign | null>(null)
  const savedRef = useRef<AppDesign | null>(null)
  const saving = useRef<Promise<boolean> | null>(null)
  const conflict = useRef(false)
  const lastEdit = useRef(0)

  const load = useCallback((s: DesignState) => {
    setState(s); setDesign(s.design); setPast([]); setFuture([]); setSelected(null)
    latest.current = savedRef.current = s.design
    version.current = s.version
    conflict.current = false
    setSave({ kind: 'idle' })
  }, [])

  useEffect(() => {
    adminGet<AppCatalog>('/app-builder/catalog').then((r) => setCatalog(r.data)).catch((e) => setMessage({ ok: false, text: apiErrorMessage(e) }))
    adminGet<DesignState>('/app-builder/design').then((r) => load(r.data)).catch((e) => setMessage({ ok: false, text: apiErrorMessage(e) }))
    const api = `${adminApiBase()}/api/v1`
    const get = (path: string, empty: any) => fetch(`${api}${path}`).then((r) => (r.ok ? r.json() : empty)).catch(() => empty)
    Promise.all([
      get('/public/site', {}), get('/campaigns?status=active&page_size=100', []), get('/public/content-posts?limit=60', []),
      get('/public/donation-categories', []),
    ]).then(([site, campaigns, news, categories]) => {
      const list = (v: any) => (Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : [])
      setData({ site, campaigns: list(campaigns), news: list(news), categories: list(categories) })
    })
  }, [load])

  // --- Saving: one request at a time, always with the version the server last gave.
  const flush = useCallback(async (): Promise<boolean> => {
    while (saving.current) await saving.current
    if (conflict.current) return false
    const sent = latest.current
    if (!sent || sent === savedRef.current) return true
    const run = (async () => {
      setSave({ kind: 'saving' })
      try {
        const r = await adminSend<{ version: number }>('put', '/app-builder/design/draft', { design: sent, version: version.current })
        version.current = r.data.version
        savedRef.current = sent
        setState((s) => (s ? { ...s, has_draft: true } : s))
        setSave({ kind: latest.current === sent ? 'saved' : 'dirty' })
        return true
      } catch (e) {
        conflict.current = (e as { response?: { status?: number } }).response?.status === 409
        setSave({ kind: conflict.current ? 'conflict' : 'error', text: apiErrorMessage(e, 'Taslak kaydedilemedi') })
        return false
      }
    })()
    saving.current = run
    try { return await run } finally { saving.current = null }
  }, [])

  useEffect(() => {
    if (!design || design === savedRef.current) return
    const timer = setTimeout(() => { flush() }, 1200)
    return () => clearTimeout(timer)
  }, [design, flush])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (latest.current !== savedRef.current) e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const put = (next: AppDesign) => { latest.current = next; setDesign(next); if (!conflict.current) setSave({ kind: 'dirty' }) }
  const commit = (next: AppDesign) => {
    if (!design) return
    // Typing in one field is one undo step.
    const now = Date.now()
    if (now - lastEdit.current > 700) setPast((p) => [...p.slice(-HISTORY), design])
    lastEdit.current = now
    setFuture([])
    put(next)
  }
  const undo = () => { if (!past.length || !design) return; setFuture((f) => [design, ...f]); put(past[past.length - 1]); setPast(past.slice(0, -1)); lastEdit.current = 0 }
  const redo = () => { if (!future.length || !design) return; setPast((p) => [...p, design]); put(future[0]); setFuture(future.slice(1)); lastEdit.current = 0 }

  const page = design?.pages.find((p) => p.id === pageId) || design?.pages[0]
  const setBlocks = (blocks: AppBlock[]) => design && page && commit({ ...design, pages: design.pages.map((p) => (p.id === page.id ? { ...p, blocks } : p)) })
  const step = () => { lastEdit.current = 0 } // structural edits are always their own undo step

  const addBlock = (type: string, index?: number) => {
    if (!catalog || !page) return
    if (page.blocks.length >= catalog.limits.blocks) return setMessage({ ok: false, text: `Bir sayfada en fazla ${catalog.limits.blocks} blok olabilir.` })
    const props = Object.fromEntries(Object.entries(catalog.blocks[type].fields).filter(([, f]) => f.default !== undefined && f.default !== '').map(([k, f]) => [k, f.default]))
    const block = { id: newId('blk'), type, props }
    const at = index ?? (selected ? page.blocks.findIndex((b) => b.id === selected) + 1 || page.blocks.length : page.blocks.length)
    step(); setBlocks([...page.blocks.slice(0, at), block, ...page.blocks.slice(at)]); setSelected(block.id)
  }
  const onDrop = (payload: string, index: number) => {
    if (!page) return
    const [kind, value] = payload.split(':')
    if (kind === 'new' && catalog?.blocks[value]) return addBlock(value, index)
    const from = page.blocks.findIndex((b) => b.id === value)
    if (kind !== 'move' || from < 0) return
    const next = [...page.blocks]
    const [moved] = next.splice(from, 1)
    next.splice(from < index ? index - 1 : index, 0, moved)
    step(); setBlocks(next)
  }
  const onMove = (id: string, delta: -1 | 1) => {
    if (!page) return
    const i = page.blocks.findIndex((b) => b.id === id)
    const j = i + delta
    if (j < 0 || j >= page.blocks.length) return
    const next = [...page.blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    step(); setBlocks(next)
  }
  const onCopy = (id: string) => {
    if (!page || !catalog || page.blocks.length >= catalog.limits.blocks) return
    const i = page.blocks.findIndex((b) => b.id === id)
    step(); setBlocks([...page.blocks.slice(0, i + 1), ...freshBlocks([page.blocks[i]]), ...page.blocks.slice(i + 1)])
  }
  const onDelete = (id: string) => { if (page) { step(); setBlocks(page.blocks.filter((b) => b.id !== id)); setSelected(null) } }

  /** Server action on the saved version; the result replaces the editor's copy. */
  const act = async (path: string, done: string, saveFirst = true) => {
    setBusy(true); setMessage(null)
    try {
      if (saveFirst && !(await flush())) return
      while (saving.current) await saving.current
      const r = await adminSend<DesignState>('post', `/app-builder/design/${path}`, { version: version.current })
      load(r.data); setRevisions(null); setMessage({ ok: true, text: done })
    } catch (e) { setMessage({ ok: false, text: apiErrorMessage(e) }) } finally { setBusy(false) }
  }

  const app = useMemo(() => catalog && design && data ? {
    actions: catalog.actions, screens: catalog.screens, icons: catalog.icons, pages: design.pages.map((p) => ({ id: p.id, title: p.title })),
    campaigns: data.campaigns.filter((c) => c.slug), news: data.news.filter((n) => n.slug),
  } : undefined, [catalog, design, data])

  if (!catalog || !design || !data || !page || !state) return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-100 text-sm text-gray-500">{message?.text || 'Uygulama Yapıcı yükleniyor…'}</div>
  const ctx = { campaigns: data.campaigns, app }
  const block = page.blocks.find((b) => b.id === selected)
  const groups = Object.entries(catalog.blocks).reduce<Record<string, [string, AppCatalog['blocks'][string]][]>>((acc, e) => { (acc[e[1].group] ||= []).push(e); return acc }, {})
  const saveText = { idle: state.has_draft ? 'Taslak' : 'Yayındaki sürüm', dirty: 'Kaydediliyor…', saving: 'Kaydediliyor…', saved: 'Taslak kaydedildi', error: 'Kaydedilemedi', conflict: 'Çakışma' }[save.kind]

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gray-100 text-gray-900">
      <div className="flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2">
        <Link href="/admin" onClick={() => { flush() }} className={btn} aria-label="Panele dön"><ArrowLeft size={14} /></Link>
        <h1 className="text-sm font-extrabold">Uygulama Yapıcı</h1>
        <div className="flex rounded-md border p-0.5 text-[12px] font-semibold">
          {(['design', 'store'] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={`rounded px-2.5 py-1 ${view === v ? 'bg-slate-900 text-white' : ''}`}>{v === 'design' ? 'Tasarım' : 'Mağazaya gönder'}</button>)}
        </div>
        {view === 'design' && <>
          <button type="button" className={btn} disabled={!past.length} onClick={undo} title="Geri al" aria-label="Geri al"><Undo2 size={14} /></button>
          <button type="button" className={btn} disabled={!future.length} onClick={redo} title="Yinele" aria-label="Yinele"><Redo2 size={14} /></button>
          <button type="button" className={btn} onClick={() => setDevice(device === 'ios' ? 'android' : 'ios')}>{device === 'ios' ? 'iPhone' : 'Android'}</button>
          <span className={`text-[12px] font-semibold ${save.kind === 'error' || save.kind === 'conflict' ? 'text-red-600' : 'text-gray-500'}`}>{saveText}</span>
          <span className="flex-1" />
          <button type="button" className={btn} onClick={() => adminGet<any[]>('/app-builder/design/revisions').then((r) => setRevisions(r.data)).catch((e) => setMessage({ ok: false, text: apiErrorMessage(e) }))}><History size={14} className="inline" /> Sürümler</button>
          {state.has_draft && <button type="button" className={btn} disabled={busy} onClick={() => { if (window.confirm('Taslaktaki değişiklikler silinsin mi?')) act('discard', 'Taslak silindi.', false) }}>Taslağı sil</button>}
          {state.is_published && <button type="button" className={btn} disabled={busy} onClick={() => { if (window.confirm('Uygulama hazır tasarıma dönsün mü? Tasarımınız taslak olarak kalır.')) act('unpublish', 'Yayından kaldırıldı.') }}>Yayından kaldır</button>}
          <button type="button" disabled={busy || save.kind === 'conflict'} className="rounded-md bg-emerald-600 px-4 py-1.5 text-[13px] font-bold text-white disabled:opacity-40"
            onClick={() => { if (window.confirm('Tasarım bağışçıların uygulamasında yayınlansın mı?')) act('publish', 'Yayınlandı. Uygulama sonraki açılışta yeni tasarımı gösterir.') }}>Yayınla</button>
        </>}
      </div>
      {(message || save.text) && (
        <div role="status" className={`flex items-center gap-2 px-4 py-2 text-[13px] font-semibold ${message?.ok && !save.text ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          <span className="flex-1">{save.text || message?.text}</span>
          {save.kind === 'conflict' && <button type="button" className={btn} onClick={() => adminGet<DesignState>('/app-builder/design').then((r) => load(r.data))}>Son sürümü yükle</button>}
          {!save.text && <button type="button" aria-label="Kapat" onClick={() => setMessage(null)}>✕</button>}
        </div>
      )}
      {view === 'store' ? <StorePanel /> : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <aside className="w-full flex-none overflow-y-auto border-r bg-white lg:w-72">
            <div className="grid grid-cols-3 border-b">{LEFT.map(([k, label]) => <button key={k} type="button" onClick={() => setLeft(k)} className={`border-b-2 px-1 py-2 text-[12px] font-semibold ${left === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'}`}>{label}</button>)}</div>
            <div className="space-y-4 p-3">
              {left === 'blocks' && Object.entries(groups).map(([group, items]) => (
                <div key={group}>
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{group}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {items.map(([key, spec]) => (
                      <button key={key} type="button" draggable onDragStart={(e) => e.dataTransfer.setData(BLOCK_DRAG, `new:${key}`)} onClick={() => addBlock(key)}
                        className="flex cursor-grab flex-col items-center gap-1 rounded-xl border bg-white px-2 py-2.5 text-center text-[11px] font-semibold text-gray-700 hover:border-blue-400 hover:bg-blue-50/40">
                        <span className="text-lg">{spec.icon}</span>{spec.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {left === 'pages' && <div className="space-y-1.5">
                {design.pages.map((p) => (
                  <div key={p.id} className={`flex items-center gap-1 rounded-md border px-2 py-1.5 ${p.id === page.id ? 'border-blue-500 bg-blue-50' : ''}`}>
                    <button type="button" aria-label={`${p.title} sayfasını aç`} className="text-[12px]" onClick={() => { setPageId(p.id); setSelected(null) }}>📱</button>
                    <input aria-label="Sayfa adı" maxLength={60} className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none" value={p.title} onFocus={() => { setPageId(p.id); setSelected(null) }}
                      onChange={(e) => commit({ ...design, pages: design.pages.map((x) => (x.id === p.id ? { ...x, title: e.target.value } : x)) })} />
                    {p.id !== 'home' && <button type="button" aria-label="Sayfayı sil" className="text-red-600" onClick={() => { if (window.confirm(`"${p.title}" silinsin mi?`)) { step(); commit({ ...design, pages: design.pages.filter((x) => x.id !== p.id) }); setPageId('home'); setSelected(null) } }}><Trash2 size={14} /></button>}
                  </div>
                ))}
                {design.pages.length < catalog.limits.pages && <button type="button" className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-[12px] font-semibold text-blue-600"
                  onClick={() => { const id = newId('page'); step(); commit({ ...design, pages: [...design.pages, { id, title: 'Yeni sayfa', blocks: [] }] }); setPageId(id); setSelected(null) }}><Plus size={14} /> Sayfa ekle</button>}
                <p className="text-[11px] text-gray-400">Sayfayı bağışçıya göstermek için bir sekmeye, menüye veya düğmeye bağlayın.</p>
              </div>}
              {left === 'tabs' && <>
                <LinkList items={design.tabs} specs={catalog.tab} ctx={ctx} max={catalog.limits.tabs_max} min={catalog.limits.tabs_min} prefix="tab" onChange={(tabs) => commit({ ...design, tabs })} />
                <p className="text-[11px] text-gray-400">{catalog.limits.tabs_min}–{catalog.limits.tabs_max} sekme. {catalog.required_screens.map((s) => catalog.screens[s]).join(', ')} sekmelerde veya yan menüde bulunmalı.</p>
              </>}
              {left === 'drawer' && <LinkList items={design.drawer} specs={catalog.drawer} ctx={ctx} max={catalog.limits.drawer} min={0} prefix="menu" onChange={(drawer) => commit({ ...design, drawer })} />}
              {left === 'theme' && <>
                <div className="grid grid-cols-2 gap-1.5">{catalog.themes.map((t) => (
                  <button key={t.key} type="button" className="rounded-lg border p-2 text-[11px] font-semibold hover:border-blue-400" onClick={() => { step(); commit({ ...design, theme: { ...t.theme } }) }}>
                    <span className="mb-1 flex h-6 overflow-hidden rounded"><span className="flex-1" style={{ background: t.theme.primary }} /><span className="flex-1" style={{ background: t.theme.accent }} /></span>{t.label}
                  </button>
                ))}</div>
                <div className="space-y-3"><Fields specs={catalog.theme} values={design.theme} ctx={ctx} onChange={(theme) => commit({ ...design, theme })} /></div>
                <div className="space-y-3 border-t pt-3"><div className="text-[12px] font-extrabold">Üst bar ve sekmeler</div><Fields specs={catalog.header} values={design.header} ctx={ctx} onChange={(header) => commit({ ...design, header })} /></div>
              </>}
              {left === 'templates' && <>
                <p className="text-[12px] text-gray-500">Şablon, açık olan “{page.title}” sayfasının bloklarının yerine geçer. Geri alabilirsiniz.</p>
                {catalog.templates.map((t) => <button key={t.key} type="button" className="block w-full rounded-lg border p-3 text-left text-[13px] font-semibold hover:border-blue-400"
                  onClick={() => { if (window.confirm(`"${page.title}" sayfasının blokları "${t.label}" şablonuyla değişsin mi?`)) { step(); setBlocks(freshBlocks(t.blocks)); setSelected(null) } }}>{t.label}</button>)}
              </>}
            </div>
          </aside>
          <main className="flex min-h-[820px] flex-1 items-start justify-center overflow-auto p-5">
            <PhonePreview design={design} data={data} pageId={page.id} setPageId={(id) => { setPageId(id); setSelected(null) }} selected={selected} onSelect={setSelected}
              onMove={onMove} onDrop={onDrop} onCopy={onCopy} onDelete={onDelete} screens={catalog.screens} device={device} />
          </main>
          <aside className="w-full flex-none overflow-y-auto border-l bg-white p-4 lg:w-80">
            {block ? (
              <div key={block.id} className="space-y-3">
                <div className="text-sm font-extrabold">{catalog.blocks[block.type]?.icon} {catalog.blocks[block.type]?.label}</div>
                <Fields specs={catalog.blocks[block.type]?.fields || {}} values={block.props} ctx={ctx} onChange={(props) => setBlocks(page.blocks.map((x) => (x.id === block.id ? { ...x, props } : x)))} />
              </div>
            ) : <p className="text-[13px] text-gray-500">Düzenlemek için telefonda bir bloğa tıklayın. Soldan yeni blok ekleyebilir veya telefona sürükleyebilirsiniz.</p>}
          </aside>
        </div>
      )}
      {revisions && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setRevisions(null)}>
          <div role="dialog" aria-label="Sürümler" className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-base font-extrabold">Yayınlanan sürümler</h2>
            {revisions.length === 0 && <p className="text-sm text-gray-500">Henüz yayın yok.</p>}
            {revisions.map((r) => (
              <div key={r.id} className="flex items-center gap-2 border-t py-2 text-[13px]">
                <span className="flex-1">{new Date(r.created_at).toLocaleString('tr-TR')}<span className="block text-[11px] text-gray-500">{r.created_by}</span></span>
                <button type="button" className={btn} disabled={busy} onClick={() => act(`revisions/${r.id}/restore`, 'Sürüm taslağa alındı. Yayınlamadan bağışçılara görünmez.')}>Taslağa al</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
