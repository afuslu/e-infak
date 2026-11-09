'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Campaign } from '@e-infak/api-client'
import { adminApiBase, adminGet, adminSend, apiErrorMessage } from '../../lib/admin-access'
import { type Block, type BuilderCatalog, type Device, FIXED_CHILD, FIXED_PARENT, cloneBlock, newBlock } from '../../lib/blocks'
import { checklist, countBlocks, duplicateBlock, findBlock, insertBlock, locate, moveBlock, removeBlock, shiftBlock, updateBlock } from '../../lib/builder-tree'
import type { HomeData } from '../sections/HomeSections'
import type { SiteData } from '../../lib/public-content'
import { Fields } from './FieldInput'
import { type DemoOptions, type Library, type LibraryDemo, LibraryPanel, type SavedBlock } from './LibraryPanel'

interface PageSummary { id: string; kind: 'home' | 'page' | 'header' | 'footer'; slug: string | null; title: string; is_published: boolean; uses_blocks: boolean; has_draft: boolean; published_at: string | null; draft_updated_at: string | null }
interface Revision { id: string; created_at: string; created_by: string | null; blocks: number }

type State = { blocks: Block[]; past: Block[][]; future: Block[][]; selectedId: string | null; dirty: boolean }
type Action =
  | { type: 'load'; blocks: Block[] }
  | { type: 'commit'; blocks: Block[]; select?: string | null }
  | { type: 'select'; id: string | null }
  | { type: 'undo' } | { type: 'redo' } | { type: 'saved' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'load':
      return { blocks: action.blocks, past: [], future: [], selectedId: null, dirty: false }
    case 'commit':
      return {
        blocks: action.blocks, past: [...state.past, state.blocks].slice(-100), future: [], dirty: true,
        selectedId: action.select !== undefined ? action.select : state.selectedId && findBlock(action.blocks, state.selectedId) ? state.selectedId : null,
      }
    case 'select':
      return { ...state, selectedId: action.id }
    case 'undo': {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return { ...state, blocks: previous, past: state.past.slice(0, -1), future: [state.blocks, ...state.future], dirty: true }
    }
    case 'redo': {
      const next = state.future[0]
      if (!next) return state
      return { ...state, blocks: next, past: [...state.past, state.blocks], future: state.future.slice(1), dirty: true }
    }
    case 'saved':
      return { ...state, dirty: false }
  }
}

const DEVICE_WIDTH: Record<Device, string> = { desktop: '100%', tablet: '820px', mobile: '390px' }
/** The desktop canvas is drawn at least this wide (and scaled down to fit), so desktop rules apply. */
const DESKTOP_WIDTH = 1280
const DEVICE_LABEL: Record<Device, string> = { desktop: '🖥 Bilgisayar', tablet: '📱 Tablet', mobile: '📱 Telefon' }
const LANG_LABEL: Record<string, string> = { tr: 'Türkçe', en: 'English', ar: 'العربية', de: 'Deutsch', fr: 'Français', ru: 'Русский' }
const CLIPBOARD_KEY = 'einfak-builder-clipboard'
const KIND_ICON: Record<string, string> = { home: '🏠', header: '⬆️', footer: '⬇️', page: '📄' }
const KIND_PATH: Record<string, string> = { home: '/', header: 'tüm sayfaların üstü', footer: 'tüm sayfaların altı' }
/** Header and footer: shared by every page, the built-in design until first published. */
const CHROME = new Set(['header', 'footer'])

const tabBtn = (active: boolean) => `flex-1 border-b-2 px-2 py-2 text-[12px] font-semibold ${active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`
const smallBtn = 'rounded-md border bg-white px-2.5 py-1.5 text-[12px] font-semibold text-gray-700 hover:border-gray-400 disabled:opacity-40'

export function SiteBuilderEditor() {
  const [catalog, setCatalog] = useState<BuilderCatalog | null>(null)
  const [pages, setPages] = useState<PageSummary[]>([])
  const [pageId, setPageId] = useState<string>('home')
  const [page, setPage] = useState<PageSummary | null>(null)
  const [state, dispatch] = useReducer(reducer, { blocks: [], past: [], future: [], selectedId: null, dirty: false })
  const [version, setVersion] = useState(0)
  const [data, setData] = useState<HomeData | null>(null)
  const [device, setDevice] = useState<Device>('desktop')
  const [lang, setLang] = useState('tr')
  const [leftTab, setLeftTab] = useState<'pages' | 'blocks' | 'library' | 'tree'>('blocks')
  const [library, setLibrary] = useState<Library | null>(null)
  const [saved, setSaved] = useState<SavedBlock[]>([])
  const [rightTab, setRightTab] = useState<'content' | 'style' | 'advanced'>('content')
  const [search, setSearch] = useState('')
  const [insertTarget, setInsertTarget] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [modal, setModal] = useState<'publish' | 'versions' | null>(null)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const frame = useRef<HTMLIFrameElement>(null)
  const [area, setArea] = useState({ w: 0, h: 0 })
  const observer = useRef<ResizeObserver | null>(null)
  const canvasArea = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect()
    if (!el) return
    observer.current = new ResizeObserver(([entry]) => setArea({ w: entry.contentRect.width, h: entry.contentRect.height }))
    observer.current.observe(el)
  }, [])
  const frameReady = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  const selected = state.selectedId ? findBlock(state.blocks, state.selectedId) : null
  const selectedSpec = selected && catalog ? catalog.blocks[selected.type] : null

  // --- Loading -------------------------------------------------------------------
  const loadSaved = useCallback(() => adminGet<SavedBlock[]>('/site-builder/saved-blocks').then((r) => setSaved(r.data)).catch(() => undefined), [])
  const loadData = useCallback(() => {
    const api = `${adminApiBase()}/api/v1`
    return Promise.all([
      fetch(`${api}/public/site`).then((r) => r.json()) as Promise<SiteData>,
      fetch(`${api}/campaigns?status=active`).then((r) => (r.ok ? r.json() : { items: [] })).then((d) => (d.items || []) as Campaign[]),
      fetch(`${api}/public/content-posts?limit=12`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${api}/public/donation-categories`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${api}/public/menu`).then((r) => (r.ok ? r.json() : { header: [], footer: [] })),
    ]).then(([site, campaigns, news, categories, menu]) => setData({ site, locale: 'tr', campaigns, news, categories, menu }))
      .catch(() => setMessage({ type: 'error', text: 'Site verileri yüklenemedi' }))
  }, [])
  useEffect(() => {
    adminGet<BuilderCatalog>('/site-builder/catalog').then((r) => setCatalog(r.data)).catch((e) => setMessage({ type: 'error', text: apiErrorMessage(e) }))
    adminGet<Library>('/site-builder/library').then((r) => setLibrary(r.data)).catch(() => undefined)
    loadSaved()
    loadData()
  }, [loadData, loadSaved])

  const loadPages = useCallback(() => adminGet<PageSummary[]>('/site-builder/pages').then((r) => setPages(r.data)), [])
  useEffect(() => { loadPages().catch(() => undefined) }, [loadPages])

  const loadPage = useCallback(async (id: string) => {
    const res = await adminGet<PageSummary & { blocks: Block[]; version: number }>(`/site-builder/pages/${id}`)
    setPage(res.data)
    setVersion(res.data.version)
    dispatch({ type: 'load', blocks: res.data.blocks })
    setConflict(null)
    setSaveState('idle')
  }, [])
  useEffect(() => { loadPage(pageId).catch((e) => setMessage({ type: 'error', text: apiErrorMessage(e, 'Sayfa yüklenemedi') })) }, [pageId, loadPage])

  // --- Saving ----------------------------------------------------------------------
  const save = useCallback(async () => {
    if (conflict) return false
    setSaveState('saving')
    try {
      const res = await adminSend<{ version: number }>('put', `/site-builder/pages/${pageId}/draft`, { blocks: stateRef.current.blocks, version })
      setVersion(res.data.version)
      dispatch({ type: 'saved' })
      setSaveState('saved')
      return true
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status
      if (status === 409) setConflict(apiErrorMessage(err, 'Sayfa başka bir oturumda değiştirildi'))
      else setMessage({ type: 'error', text: apiErrorMessage(err, 'Taslak kaydedilemedi') })
      setSaveState('error')
      return false
    }
  }, [pageId, version, conflict])

  useEffect(() => {
    if (!state.dirty || conflict) return
    const timer = setTimeout(() => { save() }, 2500)
    return () => clearTimeout(timer)
  }, [state.blocks, state.dirty, save, conflict])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (stateRef.current.dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  // --- Editing ---------------------------------------------------------------------
  const commit = (blocks: Block[], select?: string | null) => dispatch({ type: 'commit', blocks, select })

  /** Whether a block type may go on the page being edited (same rule as the backend). */
  const fitsPage = (type: string) => {
    if (!catalog) return false
    const kind = page?.kind || 'home'
    if (kind === 'header') return type === 'header_row' || catalog.header_slot_children.includes(type)
    return (catalog.blocks[type]?.zones || catalog.content_zones).includes(kind)
  }

  const addBlock = (type: string) => {
    if (!catalog) return
    placeBlock(newBlock(type, catalog.blocks[type]))
  }

  /** Puts a new block where the user expects it: into the chosen slot/container, after the selection, or at the end. */
  const placeBlock = (block: Block) => {
    if (!catalog) return
    const type = block.type
    let blocks: Block[]
    if (page?.kind === 'header') {
      // A header is rows of three slots: rows go to the top level, everything else into a slot.
      const sel = state.selectedId ? findBlock(state.blocks, state.selectedId) : null
      const rootIndex = state.selectedId ? state.blocks.findIndex((r) => r.id === state.selectedId || !!findBlock(r.children || [], state.selectedId!)) : -1
      if (type === 'header_row') {
        blocks = insertBlock(state.blocks, null, rootIndex >= 0 ? rootIndex + 1 : state.blocks.length, block)
      } else {
        const target = insertTarget ? findBlock(state.blocks, insertTarget) : null
        const place = sel ? locate(state.blocks, sel.id) : null
        const parent = place?.[0] ? findBlock(state.blocks, place[0]) : null
        if (target?.type === 'header_slot') blocks = insertBlock(state.blocks, target.id, target.children?.length ?? 0, block)
        else if (sel?.type === 'header_slot') blocks = insertBlock(state.blocks, sel.id, sel.children?.length ?? 0, block)
        else if (sel?.type === 'header_row' && sel.children?.[2]) blocks = insertBlock(state.blocks, sel.children[2].id, sel.children[2].children?.length ?? 0, block)
        else if (place && parent?.type === 'header_slot') blocks = insertBlock(state.blocks, parent.id, place[1] + 1, block)
        else {
          const slot = state.blocks[state.blocks.length - 1]?.children?.[2]
          if (!slot) { setMessage({ type: 'error', text: 'Önce bir “Header satırı” ekleyin; öğeler satırların alanlarına yerleşir.' }); return }
          blocks = insertBlock(state.blocks, slot.id, slot.children?.length ?? 0, block)
        }
      }
    } else if (insertTarget && findBlock(state.blocks, insertTarget)) {
      const parent = findBlock(state.blocks, insertTarget)!
      blocks = insertBlock(state.blocks, insertTarget, parent.children?.length ?? 0, block)
    } else if (state.selectedId) {
      const place = locate(state.blocks, state.selectedId)
      const sel = findBlock(state.blocks, state.selectedId)
      if (sel && FIXED_CHILD.has(sel.type) || (sel && catalog.blocks[sel.type]?.container && !FIXED_PARENT.has(sel.type) && !sel.children?.length)) {
        blocks = insertBlock(state.blocks, sel.id, sel.children?.length ?? 0, block)
      } else {
        blocks = place ? insertBlock(state.blocks, place[0], place[1] + 1, block) : [...state.blocks, block]
      }
    } else {
      blocks = [...state.blocks, block]
    }
    setInsertTarget(null)
    commit(blocks, block.id)
    setRightTab('content')
    setTimeout(() => frame.current?.contentWindow?.postMessage({ source: 'einfak-builder', type: 'scroll-to', id: block.id }, window.location.origin), 150)
  }

  const insertSection = (section: Block[]) => {
    const copies = section.map(cloneBlock)
    const sel = state.selectedId
    const rootIndex = sel ? state.blocks.findIndex((r) => r.id === sel || !!findBlock(r.children || [], sel)) : -1
    let blocks = state.blocks
    copies.forEach((b, i) => { blocks = insertBlock(blocks, null, (rootIndex >= 0 ? rootIndex + 1 : blocks.length) + (rootIndex >= 0 ? i : 0), b) })
    commit(blocks, copies[0]?.id ?? null)
    setTimeout(() => frame.current?.contentWindow?.postMessage({ source: 'einfak-builder', type: 'scroll-to', id: copies[0]?.id }, window.location.origin), 150)
  }

  const replacePage = (section: Block[], label: string) => {
    if (state.blocks.length && !window.confirm(`Bu sayfanın içeriği “${label}” ile değiştirilsin mi? Ctrl+Z ile geri alabilirsiniz.`)) return
    commit(section.map(cloneBlock), null)
  }

  const insertSaved = (item: SavedBlock) => {
    if (!item.block || !fitsPage(item.block.type)) {
      setMessage({ type: 'error', text: `“${item.name}” bu sayfa türünde kullanılamaz.` })
      return
    }
    placeBlock(cloneBlock(item.block))
  }

  const saveSelectedBlock = async () => {
    const sel = stateRef.current.selectedId && findBlock(stateRef.current.blocks, stateRef.current.selectedId)
    if (!sel || FIXED_CHILD.has(sel.type)) return
    const name = window.prompt('Kayıtlı blok adı (ör. Ramazan çağrı bandı):', catalog?.blocks[sel.type]?.label || '')
    if (!name?.trim()) return
    try {
      await adminSend('post', '/site-builder/saved-blocks', { name: name.trim(), block: sel, zone: page?.kind || 'page' })
      await loadSaved()
      setMessage({ type: 'ok', text: 'Blok kaydedildi; Şablonlar › Kayıtlılarım altından her sayfada kullanabilirsiniz.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Blok kaydedilemedi') })
    }
  }

  const deleteSaved = async (item: SavedBlock) => {
    if (!window.confirm(`“${item.name}” kayıtlı bloklardan silinsin mi? Sayfalarda kullanılan kopyalar etkilenmez.`)) return
    try {
      await adminSend('delete', `/site-builder/saved-blocks/${item.id}`)
      await loadSaved()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const applyDemo = async (demo: LibraryDemo, options: DemoOptions) => {
    if (state.dirty && !(await save())) return
    try {
      const res = await adminSend<{ created_pages: { title: string }[]; skipped_pages: string[]; published: boolean }>('post', `/site-builder/demos/${demo.key}/apply`, options)
      await Promise.all([loadPages(), loadPage(pageId), loadData()])
      const created = res.data.created_pages.map((p) => p.title).join(', ')
      setMessage({ type: 'ok', text: `“${demo.label}” kuruldu${res.data.published ? ' ve yayınlandı' : ' (taslak; kontrol edip Yayınla’ya basın)'}.${created ? ` Eklenen sayfalar: ${created}.` : ''}${res.data.skipped_pages.length ? ` Atlanan: ${res.data.skipped_pages.join(', ')}.` : ''}` })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Demo kurulamadı') })
    }
  }

  const blockAction = useCallback((id: string, action: string) => {
    const blocks = stateRef.current.blocks
    if (action === 'up') commit(shiftBlock(blocks, id, -1))
    if (action === 'down') commit(shiftBlock(blocks, id, 1))
    if (action === 'delete') {
      const target = findBlock(blocks, id)
      if (target && FIXED_CHILD.has(target.type)) return
      commit(removeBlock(blocks, id), null)
    }
    if (action === 'duplicate') {
      const [next, copyId] = duplicateBlock(blocks, id)
      if (copyId) commit(next, copyId)
    }
    if (action === 'hide') {
      commit(updateBlock(blocks, id, (b) => ({ ...b, advanced: { ...b.advanced, hide_desktop: !b.advanced?.hide_desktop, hide_tablet: !b.advanced?.hide_desktop, hide_mobile: !b.advanced?.hide_desktop } })))
    }
  }, [])

  const copySelected = () => {
    const sel = stateRef.current.selectedId && findBlock(stateRef.current.blocks, stateRef.current.selectedId)
    if (sel && !FIXED_CHILD.has(sel.type)) {
      try { localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(sel)) } catch { /* private mode */ }
      setMessage({ type: 'ok', text: 'Blok kopyalandı; başka bir sayfada da yapıştırabilirsiniz (Ctrl+V).' })
    }
  }
  const paste = () => {
    let raw: string | null = null
    try { raw = localStorage.getItem(CLIPBOARD_KEY) } catch { /* ignore */ }
    if (!raw) return
    const copy = cloneBlock(JSON.parse(raw) as Block)
    const blocks = stateRef.current.blocks
    const sel = stateRef.current.selectedId
    const place = sel ? locate(blocks, sel) : null
    commit(place ? insertBlock(blocks, place[0], place[1] + 1, copy) : [...blocks, copy], copy.id)
  }

  const onKey = useCallback((key: string, ctrl: boolean, shift: boolean) => {
    const k = key.toLowerCase()
    if (ctrl && k === 'z' && !shift) dispatch({ type: 'undo' })
    else if (ctrl && (k === 'y' || (k === 'z' && shift))) dispatch({ type: 'redo' })
    else if (ctrl && k === 'c') copySelected()
    else if (ctrl && k === 'v') paste()
    else if (ctrl && k === 'd' && stateRef.current.selectedId) blockAction(stateRef.current.selectedId, 'duplicate')
    else if (ctrl && k === 's') save()
    else if (!ctrl && (key === 'Delete' || key === 'Backspace') && stateRef.current.selectedId) blockAction(stateRef.current.selectedId, 'delete')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockAction, save])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      if ((e.ctrlKey || e.metaKey) || e.key === 'Delete') {
        if ((e.ctrlKey || e.metaKey) && ['z', 'y', 'c', 'v', 'd', 's'].includes(e.key.toLowerCase())) e.preventDefault()
        onKey(e.key, e.ctrlKey || e.metaKey, e.shiftKey)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onKey])

  // --- Canvas messaging ------------------------------------------------------------
  const sendRender = useCallback(() => {
    if (!frameReady.current || !data || !catalog) return
    frame.current?.contentWindow?.postMessage({
      source: 'einfak-builder', type: 'render', blocks: state.blocks, selectedId: state.selectedId,
      data: { ...data, locale: lang }, specs: catalog.blocks,
    }, window.location.origin)
  }, [state.blocks, state.selectedId, data, catalog, lang])
  useEffect(() => { sendRender() }, [sendRender])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return
      const msg = event.data
      if (msg?.source !== 'einfak-builder-frame') return
      if (msg.type === 'ready') { frameReady.current = true; sendRender() }
      if (msg.type === 'select') { dispatch({ type: 'select', id: msg.id }); setInsertTarget(null) }
      if (msg.type === 'action') blockAction(msg.id, msg.action)
      if (msg.type === 'move') commit(moveBlock(stateRef.current.blocks, msg.id, msg.targetId, msg.position))
      if (msg.type === 'add-into') { setInsertTarget(msg.parentId); dispatch({ type: 'select', id: msg.parentId }); setLeftTab('blocks') }
      if (msg.type === 'key') onKey(msg.key, msg.ctrl, msg.shift)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [sendRender, blockAction, onKey])

  // --- Page actions ----------------------------------------------------------------
  const switchPage = async (id: string) => {
    if (id === pageId) return
    if (state.dirty && !(await save())) return
    setPageId(id)
  }

  const createPage = async () => {
    const title = window.prompt('Yeni sayfanın adı (ör. Kurban 2027):')
    if (!title?.trim()) return
    try {
      const res = await adminSend<PageSummary>('post', '/site-builder/pages', { title: title.trim() })
      await loadPages()
      await switchPage(res.data.id)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Sayfa oluşturulamadı') })
    }
  }

  const publish = async () => {
    if (state.dirty && !(await save())) return
    try {
      const res = await adminSend<PageSummary & { version: number }>('post', `/site-builder/pages/${pageId}/publish`)
      setVersion(res.data.version)
      setPage(res.data)
      setModal(null)
      setMessage({ type: 'ok', text: 'Yayınlandı. Ziyaretçiler yeni hali görüyor.' })
      loadPages()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Yayınlanamadı') })
    }
  }

  const openPreview = async () => {
    if (state.dirty && !(await save())) return
    try {
      const res = await adminSend<{ path: string }>('post', `/site-builder/pages/${pageId}/preview-link`)
      window.open(res.data.path, '_blank', 'noopener')
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Önizleme bağlantısı oluşturulamadı') })
    }
  }

  const showVersions = async () => {
    setModal('versions')
    try { setRevisions((await adminGet<Revision[]>(`/site-builder/pages/${pageId}/revisions`)).data) } catch { setRevisions([]) }
  }

  const restore = async (id: string) => {
    if (!window.confirm('Bu sürüm taslak olarak geri yüklensin mi? Yayınlayana kadar ziyaretçiler etkilenmez.')) return
    if (state.dirty) await save()
    try {
      const res = await adminSend<{ version: number; blocks: Block[] }>('post', `/site-builder/pages/${pageId}/revisions/${id}/restore`)
      setVersion(res.data.version)
      dispatch({ type: 'load', blocks: res.data.blocks })
      setModal(null)
      setMessage({ type: 'ok', text: 'Sürüm taslak olarak geri yüklendi.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const unpublish = async () => {
    if (!window.confirm('Sitede yerleşik tasarım gösterilsin mi? Düzenlemeleriniz taslak olarak saklanır; yeniden yayınlayabilirsiniz.')) return
    if (state.dirty && !(await save())) return
    try {
      const res = await adminSend<PageSummary & { version: number }>('post', `/site-builder/pages/${pageId}/unpublish`)
      setVersion(res.data.version)
      setPage(res.data)
      setMessage({ type: 'ok', text: 'Yerleşik tasarıma dönüldü.' })
      loadPages()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const discard = async () => {
    if (!window.confirm('Yayınlanmamış değişiklikler silinsin mi? Sayfa yayındaki haline döner.')) return
    try {
      await adminSend('post', `/site-builder/pages/${pageId}/discard`)
      await loadPage(pageId)
      loadPages()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  // --- Inspector -------------------------------------------------------------------
  const setSelected = (fn: (b: Block) => Block) => {
    if (!state.selectedId) return
    commit(updateBlock(state.blocks, state.selectedId, fn))
  }

  const issues = useMemo(() => checklist(state.blocks), [state.blocks])
  const languages = useMemo(() => {
    const site = data?.site as (SiteData & { languages?: string[] }) | undefined
    return Array.from(new Set(['tr', ...((site?.languages || []).filter((l) => l !== 'tr'))]))
  }, [data])

  const groups = useMemo(() => {
    if (!catalog) return []
    const out: Record<string, [string, typeof catalog.blocks[string]][]> = {}
    const kind = page?.kind || 'home'
    const fits = (key: string, spec: (typeof catalog.blocks)[string]) => kind === 'header'
      ? key === 'header_row' || catalog.header_slot_children.includes(key)
      : (spec.zones || catalog.content_zones).includes(kind)
    for (const [key, spec] of Object.entries(catalog.blocks)) {
      if (spec.hidden || !fits(key, spec)) continue
      if (search && !`${spec.label} ${spec.group}`.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))) continue
      ;(out[spec.group] ||= []).push([key, spec])
    }
    return Object.entries(out)
  }, [catalog, search, page?.kind])

  // --- Tree ------------------------------------------------------------------------
  const dragTree = useRef<string | null>(null)
  const Tree = ({ blocks, depth }: { blocks: Block[]; depth: number }) => (
    <ul className={depth ? 'ms-3 border-s ps-1.5' : ''}>
      {blocks.map((b) => {
        const spec = catalog?.blocks[b.type]
        return (
          <li key={b.id}>
            <div draggable={!FIXED_CHILD.has(b.type)}
              onDragStart={(e) => { dragTree.current = b.id; e.dataTransfer.setData('text/plain', b.id) }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const y = (e.clientY - rect.top) / rect.height
                const inside = spec?.container && !FIXED_PARENT.has(b.type) && y > 0.3 && y < 0.7
                if (dragTree.current) commit(moveBlock(state.blocks, dragTree.current, b.id, inside ? 'inside' : y < 0.5 ? 'before' : 'after'))
                dragTree.current = null
              }}
              onClick={() => { dispatch({ type: 'select', id: b.id }); frame.current?.contentWindow?.postMessage({ source: 'einfak-builder', type: 'scroll-to', id: b.id }, window.location.origin) }}
              className={`flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-[12px] ${state.selectedId === b.id ? 'bg-blue-100 font-semibold text-blue-800' : 'hover:bg-gray-100'}`}>
              <span>{spec?.icon}</span>
              <span className="truncate">{(b.props?.title || b.props?.text || spec?.label || b.type).toString().slice(0, 40)}</span>
              {b.advanced?.hide_desktop && <span className="ms-auto text-[10px] text-amber-600">gizli</span>}
            </div>
            {b.children && b.children.length > 0 && <Tree blocks={b.children} depth={depth + 1} />}
          </li>
        )
      })}
    </ul>
  )

  if (!catalog || !data) {
    return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-100 text-sm text-gray-500">{message?.text || 'Site Yapıcı yükleniyor…'}</div>
  }

  const translating = lang !== 'tr'
  const scale = device === 'desktop' && area.w > 0 && area.w < DESKTOP_WIDTH ? area.w / DESKTOP_WIDTH : 1
  const styleValues = (selected?.style?.[device] || {}) as Record<string, any>

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gray-100 text-gray-900">
      {/* Top bar */}
      <header className="flex h-12 flex-none items-center gap-2 border-b bg-white px-3">
        <Link href="/admin" className="text-[12px] font-semibold text-gray-500 hover:text-gray-900">← Panel</Link>
        <span className="mx-1 h-5 w-px bg-gray-200" />
        <span className="truncate text-sm font-bold">{page?.title || 'Ana sayfa'}</span>
        <span className="text-[11px] text-gray-400">
          {saveState === 'saving' ? 'Kaydediliyor…' : state.dirty ? 'Kaydedilmedi' : saveState === 'saved' ? 'Taslak kaydedildi' : page?.has_draft ? 'Yayınlanmamış değişiklik var' : 'Yayındaki hali'}
        </span>
        <div className="mx-auto flex items-center gap-1">
          {(['desktop', 'tablet', 'mobile'] as Device[]).map((d) => (
            <button key={d} type="button" onClick={() => setDevice(d)}
              className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold ${device === d ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{DEVICE_LABEL[d]}</button>
          ))}
        </div>
        <button type="button" className={smallBtn} title="Geri al (Ctrl+Z)" disabled={!state.past.length} onClick={() => dispatch({ type: 'undo' })}>↶</button>
        <button type="button" className={smallBtn} title="Yinele (Ctrl+Y)" disabled={!state.future.length} onClick={() => dispatch({ type: 'redo' })}>↷</button>
        {languages.length > 1 && (
          <select className="rounded-md border px-2 py-1.5 text-[12px]" value={lang} onChange={(e) => setLang(e.target.value)} title="Düzenlenen dil">
            {languages.map((l) => <option key={l} value={l}>{LANG_LABEL[l] || l}</option>)}
          </select>
        )}
        <button type="button" className={smallBtn} onClick={showVersions}>Sürümler</button>
        {!CHROME.has(page?.kind || '') && <button type="button" className={smallBtn} onClick={openPreview}>Önizle ↗</button>}
        {CHROME.has(page?.kind || '') && page?.is_published && <button type="button" className={smallBtn} onClick={unpublish}>Yerleşik tasarıma dön</button>}
        {page?.has_draft && <button type="button" className={smallBtn} onClick={discard}>Değişiklikleri at</button>}
        <button type="button" className="rounded-md bg-blue-600 px-3.5 py-1.5 text-[12px] font-bold text-white hover:bg-blue-700" onClick={() => setModal('publish')}>Yayınla</button>
      </header>

      {conflict && (
        <div className="flex items-center gap-3 bg-red-600 px-4 py-2 text-sm font-semibold text-white">
          {conflict}
          <button type="button" className="rounded bg-white px-2 py-0.5 text-red-700" onClick={() => loadPage(pageId)}>Sayfayı yenile</button>
        </div>
      )}
      {message && (
        <div className={`flex items-center justify-between px-4 py-1.5 text-[12px] font-semibold ${message.type === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {message.text}<button type="button" onClick={() => setMessage(null)}>✕</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left panel */}
        <aside className="flex w-72 flex-none flex-col border-e bg-white">
          <div className="flex border-b">
            <button type="button" className={tabBtn(leftTab === 'pages')} onClick={() => setLeftTab('pages')}>Sayfalar</button>
            <button type="button" className={tabBtn(leftTab === 'blocks')} onClick={() => setLeftTab('blocks')}>Bloklar</button>
            <button type="button" className={tabBtn(leftTab === 'library')} onClick={() => setLeftTab('library')}>Şablonlar</button>
            <button type="button" className={tabBtn(leftTab === 'tree')} onClick={() => setLeftTab('tree')}>Yapı ({countBlocks(state.blocks)})</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {leftTab === 'pages' && (
              <div className="space-y-1">
                {pages.map((p) => (
                  <button key={p.id} type="button" onClick={() => switchPage(p.id)}
                    className={`block w-full rounded-md px-2 py-2 text-start text-[13px] ${p.id === pageId ? 'bg-blue-50 font-semibold text-blue-800' : 'hover:bg-gray-50'}`}>
                    {KIND_ICON[p.kind]} {p.title}
                    <span className="mt-0.5 block text-[11px] font-normal text-gray-400">
                      {KIND_PATH[p.kind] ?? `/sayfa/${p.slug}`} · {p.has_draft ? 'taslak var' : p.is_published ? 'yayında' : CHROME.has(p.kind) ? 'yerleşik tasarım' : 'yayınlanmadı'}{p.kind === 'page' && !p.uses_blocks && !p.has_draft ? ' · klasik' : ''}
                    </span>
                  </button>
                ))}
                <button type="button" onClick={createPage} className="mt-2 w-full rounded-md border border-dashed py-2 text-[12px] font-semibold text-blue-600 hover:bg-blue-50">+ Yeni sayfa</button>
                <p className="pt-2 text-[11px] text-gray-400">Sayfa adresi, SEO başlığı ve menü bağlantıları <Link href="/admin/sayfalar" className="underline">Sayfalar</Link> ve <Link href="/admin/menu" className="underline">Menü</Link> ekranlarından düzenlenir.</p>
              </div>
            )}
            {leftTab === 'library' && (
              <LibraryPanel library={library} catalog={catalog} kind={page?.kind || 'home'} saved={saved}
                onInsert={insertSection} onReplace={replacePage} onInsertSaved={insertSaved} onDeleteSaved={deleteSaved} onApplyDemo={applyDemo} />
            )}
            {leftTab === 'blocks' && (
              <div className="space-y-3">
                {insertTarget && (
                  <div className="flex items-center justify-between rounded-md bg-blue-50 px-2 py-1.5 text-[11px] font-semibold text-blue-800">
                    Seçilen bloğun içine eklenecek <button type="button" onClick={() => setInsertTarget(null)}>✕</button>
                  </div>
                )}
                <input className="w-full rounded-md border px-2 py-1.5 text-[13px]" placeholder="Blok ara…" value={search} onChange={(e) => setSearch(e.target.value)} />
                {groups.map(([group, items]) => (
                  <div key={group}>
                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{group}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {items.map(([key, spec]) => (
                        <button key={key} type="button" onClick={() => addBlock(key)}
                          className="flex flex-col items-center gap-1 rounded-lg border bg-white px-1 py-2.5 text-[11px] font-semibold text-gray-700 hover:border-blue-500 hover:bg-blue-50">
                          <span className="text-lg">{spec.icon}</span>{spec.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-gray-400">Blok, seçili bloğun altına eklenir. Önizlemede blokları sürükleyerek taşıyabilirsiniz.</p>
              </div>
            )}
            {leftTab === 'tree' && (
              <div>
                {state.blocks.length ? <Tree blocks={state.blocks} depth={0} /> : <p className="text-[12px] text-gray-400">Sayfa boş</p>}
                <p className="mt-3 text-[11px] text-gray-400">Sürükleyip bırakarak sıralayın; bir bölümün ortasına bırakırsanız içine taşınır.</p>
              </div>
            )}
          </div>
        </aside>

        {/* Canvas */}
        <main className="min-w-0 flex-1 overflow-auto p-4" onClick={() => dispatch({ type: 'select', id: null })}>
          <div ref={canvasArea} className="mx-auto h-full overflow-hidden rounded-lg bg-white shadow-sm transition-[width] duration-300" style={{ width: DEVICE_WIDTH[device], maxWidth: '100%' }}>
            <iframe ref={frame} src="/site-yapici-cerceve" title="Sayfa önizlemesi" className="h-full w-full border-0"
              style={scale < 1 ? { width: DESKTOP_WIDTH, height: area.h / scale, transform: `scale(${scale})`, transformOrigin: '0 0' } : undefined}
              onLoad={() => { frameReady.current = false }} />
          </div>
        </main>

        {/* Inspector */}
        <aside className="flex w-80 flex-none flex-col border-s bg-white">
          {!selected || !selectedSpec ? (
            <div className="p-5 text-[13px] text-gray-500">
              <p className="mb-2 font-semibold text-gray-700">Bir blok seçin</p>
              <p>Önizlemede bir bloğa tıklayın ya da soldaki “Yapı” sekmesinden seçin. Ayarlar burada görünür.</p>
              <ul className="mt-4 space-y-1 text-[12px]">
                <li><b>Ctrl+Z / Ctrl+Y</b> geri al / yinele</li>
                <li><b>Ctrl+C / Ctrl+V</b> bloğu kopyala / yapıştır</li>
                <li><b>Ctrl+D</b> çoğalt · <b>Delete</b> sil · <b>Ctrl+S</b> kaydet</li>
              </ul>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <span className="text-lg">{selectedSpec.icon}</span>
                <span className="flex-1 truncate text-sm font-bold">{selectedSpec.label}</span>
                {!FIXED_CHILD.has(selected.type) && (
                  <>
                    <button type="button" title="Çoğalt" className="text-gray-500 hover:text-gray-900" onClick={() => blockAction(selected.id, 'duplicate')}>⧉</button>
                    <button type="button" title="Kopyala" className="text-gray-500 hover:text-gray-900" onClick={copySelected}>📋</button>
                    <button type="button" title="Kayıtlı bloklara ekle" className="text-gray-500 hover:text-gray-900" onClick={saveSelectedBlock}>💾</button>
                    <button type="button" title="Sil" className="text-red-500 hover:text-red-700" onClick={() => blockAction(selected.id, 'delete')}>🗑</button>
                  </>
                )}
              </div>
              <div className="flex border-b">
                <button type="button" className={tabBtn(rightTab === 'content')} onClick={() => setRightTab('content')}>İçerik</button>
                <button type="button" className={tabBtn(rightTab === 'style')} onClick={() => setRightTab('style')}>Stil</button>
                <button type="button" className={tabBtn(rightTab === 'advanced')} onClick={() => setRightTab('advanced')}>Gelişmiş</button>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {rightTab === 'content' && (
                  Object.keys(selectedSpec.fields).length === 0
                    ? <p className="text-[12px] text-gray-400">Bu bloğun içerik ayarı yok; stil ve gelişmiş ayarları kullanın. İçine blok eklemek için önizlemedeki “+ Buraya blok ekle”ye tıklayın.</p>
                    : translating ? (
                      <>
                        <p className="rounded-md bg-amber-50 p-2 text-[11px] text-amber-800">{LANG_LABEL[lang] || lang} metinleri düzenleniyor. Boş bırakılan alanlarda Türkçe metin gösterilir.</p>
                        <Fields specs={selectedSpec.fields} onlyTranslatable values={selected.translations?.[lang] || {}} baseValues={selected.props}
                          ctx={{ campaigns: data.campaigns }}
                          onChange={(values) => setSelected((b) => ({ ...b, translations: { ...b.translations, [lang]: values } }))} />
                      </>
                    ) : (
                      <Fields specs={selectedSpec.fields} values={selected.props} ctx={{ campaigns: data.campaigns }}
                        onChange={(values) => setSelected((b) => {
                          const next = { ...b, props: values }
                          if (b.type === 'columns' && values.ratio !== b.props.ratio) {
                            const want = String(values.ratio || '1-1').split('-').length
                            const cols = [...(b.children || [])]
                            while (cols.length < want) cols.push(newBlock('column', catalog.blocks.column))
                            const removed = cols.splice(want)
                            if (removed.length && cols.length) cols[cols.length - 1] = { ...cols[cols.length - 1], children: [...(cols[cols.length - 1].children || []), ...removed.flatMap((c) => c.children || [])] }
                            next.children = cols
                          }
                          return next
                        })} />
                    )
                )}
                {rightTab === 'style' && (
                  <>
                    <div className="flex gap-1 rounded-md bg-gray-100 p-1">
                      {(['desktop', 'tablet', 'mobile'] as Device[]).map((d) => (
                        <button key={d} type="button" onClick={() => setDevice(d)}
                          className={`flex-1 rounded px-1 py-1 text-[11px] font-semibold ${device === d ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{DEVICE_LABEL[d]}</button>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {device === 'desktop' ? 'Bilgisayar ayarları tablet ve telefonda da geçerlidir; gerekirse orada ayrıca değiştirin.' : `Yalnızca ${device === 'tablet' ? 'tablet ve telefon' : 'telefon'} görünümünü değiştirir.`}
                    </p>
                    {Object.entries(catalog.style_groups).map(([group, specs]) => (
                      <details key={group} className="rounded-md border" open={group === 'Boşluk & boyut' || group === 'Arka plan'}>
                        <summary className="cursor-pointer px-2.5 py-2 text-[12px] font-bold">{group}</summary>
                        <div className="space-y-2.5 border-t p-2.5">
                          <Fields specs={specs} values={styleValues} ctx={{ campaigns: data.campaigns }}
                            onChange={(values) => setSelected((b) => {
                              const merged = { ...styleValues }
                              for (const key of Object.keys(specs)) delete merged[key]
                              Object.assign(merged, values)
                              return { ...b, style: { ...b.style, [device]: merged } }
                            })} />
                        </div>
                      </details>
                    ))}
                    {Object.keys(styleValues).length > 0 && (
                      <button type="button" className="w-full rounded-md border py-1.5 text-[12px] text-gray-600 hover:bg-gray-50"
                        onClick={() => setSelected((b) => { const style = { ...b.style }; delete style[device]; return { ...b, style } })}>
                        Bu cihazın stillerini sıfırla
                      </button>
                    )}
                  </>
                )}
                {rightTab === 'advanced' && (
                  <Fields specs={catalog.advanced} values={selected.advanced || {}} ctx={{ campaigns: data.campaigns }}
                    onChange={(values) => setSelected((b) => ({ ...b, advanced: values }))} />
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setModal(null)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {modal === 'publish' && (
              <>
                <h2 className="mb-2 text-lg font-bold">“{page?.title || 'Ana sayfa'}” yayınlansın mı?</h2>
                <p className="mb-3 text-sm text-gray-600">Yayınlandığında ziyaretçiler bu hali görür. Önceki hal “Sürümler”de saklanır ve geri yüklenebilir.</p>
                {issues.length > 0 ? (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="mb-1 text-sm font-bold text-amber-900">Kontrol listesi</p>
                    <ul className="list-disc space-y-1 ps-5 text-[13px] text-amber-900">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
                  </div>
                ) : <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-800">✓ Kontrol listesinde sorun bulunmadı.</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" className={smallBtn} onClick={() => setModal(null)}>Vazgeç</button>
                  <button type="button" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white" onClick={publish}>Yayınla</button>
                </div>
              </>
            )}
            {modal === 'versions' && (
              <>
                <h2 className="mb-3 text-lg font-bold">Yayınlanmış sürümler</h2>
                {revisions.length === 0 ? <p className="text-sm text-gray-500">Henüz yayınlanmış sürüm yok.</p> : (
                  <ul className="divide-y rounded-lg border">
                    {revisions.map((r, i) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                        <span>
                          <b>{new Date(r.created_at).toLocaleString('tr-TR')}</b>{i === 0 && <span className="ms-2 rounded bg-green-100 px-1.5 text-[11px] text-green-700">yayında</span>}
                          <span className="block text-[12px] text-gray-500">{r.created_by || '—'} · {r.blocks} blok</span>
                        </span>
                        <button type="button" className={smallBtn} onClick={() => restore(r.id)}>Geri yükle</button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 text-end"><button type="button" className={smallBtn} onClick={() => setModal(null)}>Kapat</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
