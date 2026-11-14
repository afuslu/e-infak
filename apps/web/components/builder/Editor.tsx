'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  ArrowLeft,
  BookmarkPlus,
  Clipboard,
  CopyPlus,
  ExternalLink,
  Eye,
  FileText,
  GripVertical,
  History,
  Layers,
  Monitor,
  Palette,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Save,
  Settings,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
} from 'lucide-react'
import type { Campaign } from '@e-infak/api-client'
import { adminApiBase, adminGet, adminSend, apiErrorMessage } from '../../lib/admin-access'
import { confirmDialog } from '../admin/ui'
import { type Block, type BuilderCatalog, type Device, FIXED_CHILD, FIXED_PARENT, cloneBlock, newBlock } from '../../lib/blocks'
import { type PlaceRule, checklist, countBlocks, duplicateBlock, findBlock, insertBlock, locate, moveBlock, placedOk, placementRule, removeBlock, shiftBlock, updateBlock } from '../../lib/builder-tree'
import type { HomeData } from '../sections/HomeSections'
import type { SiteData } from '../../lib/public-content'
import type { PublicMenu } from '../../lib/default-links'
import { Fields } from './FieldInput'
import { type DemoOptions, type Library, type LibraryDemo, LibraryPanel, type SavedBlock } from './LibraryPanel'
import { MenuPanel } from './MenuPanel'
import { PageSettingsModal } from './PageSettingsModal'
import { type ThemeLivePatch, ThemePanel } from './ThemePanel'

interface PageSummary { id: string; kind: 'home' | 'page' | 'header' | 'footer'; slug: string | null; title: string; is_published: boolean; uses_blocks: boolean; has_draft: boolean; published_at: string | null; draft_updated_at: string | null }
interface Revision { id: string; created_at: string; created_by: string | null; blocks: number }

type State = { blocks: Block[]; past: Block[][]; future: Block[][]; selectedId: string | null; dirty: boolean }
type Action =
  | { type: 'load'; blocks: Block[] }
  | { type: 'commit'; blocks: Block[]; select?: string | null }
  | { type: 'select'; id: string | null }
  | { type: 'undo' } | { type: 'redo' }
  /** `blocks`: the tree that was sent; edits made while the request was in flight stay unsaved. */
  | { type: 'saved'; blocks: Block[] }

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
      return { ...state, dirty: state.blocks !== action.blocks }
  }
}

const DEVICE_WIDTH: Record<Device, string> = { desktop: '100%', tablet: '820px', mobile: '390px' }
/** The desktop canvas is drawn at least this wide (and scaled down to fit), so desktop rules apply. */
const DESKTOP_WIDTH = 1280
const TARGET_WIDTH: Record<Device, number> = { desktop: DESKTOP_WIDTH, tablet: 820, mobile: 390 }
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
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('page')
    if (q) setPageId(q)
  }, [])
  const [page, setPage] = useState<PageSummary | null>(null)
  const [state, dispatch] = useReducer(reducer, { blocks: [], past: [], future: [], selectedId: null, dirty: false })
  /** Page version the next save must match; a ref so queued saves always send the latest one. */
  const versionRef = useRef(0)
  /** The draft save in flight, if any: saves run one at a time. */
  const savingRef = useRef<Promise<boolean> | null>(null)
  const [data, setData] = useState<HomeData | null>(null)
  const [device, setDevice] = useState<Device>('desktop')
  const [lang, setLang] = useState('tr')
  const [leftTab, setLeftTab] = useState<'add' | 'pages' | 'layers' | 'theme'>(() => {
    if (typeof window === 'undefined') return 'add'
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'theme') return 'theme'
    if (t === 'pages' || t === 'menu') return 'pages'
    if (t === 'layers') return 'layers'
    return 'add'
  })
  const [addSubTab, setAddSubTab] = useState<'blocks' | 'library'>('blocks')
  const [pagesSubTab, setPagesSubTab] = useState<'pages' | 'menu'>(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'menu') return 'menu'
    return 'pages'
  })
  const [settingsPageId, setSettingsPageId] = useState<string | null>(null)
  const [library, setLibrary] = useState<Library | null>(null)
  const [saved, setSaved] = useState<SavedBlock[]>([])
  const [rightTab, setRightTab] = useState<'content' | 'style' | 'advanced'>('content')
  const [mobilePane, setMobilePane] = useState<'left' | 'canvas' | 'right'>('canvas')
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [zoom, setZoom] = useState<'fit' | 50 | 75 | 100>('fit')
  const [search, setSearch] = useState('')
  const [pageSearch, setPageSearch] = useState('')
  const [treeSearch, setTreeSearch] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [collapsedTree, setCollapsedTree] = useState<Record<string, boolean>>({})
  const [treeDrop, setTreeDrop] = useState<{ id: string; pos: 'before' | 'inside' | 'after' } | null>(null)
  const [insertTarget, setInsertTarget] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [modal, setModal] = useState<'publish' | 'versions' | 'new-page' | null>(null)
  const [newPageTitle, setNewPageTitle] = useState('')
  const [newPageTemplate, setNewPageTemplate] = useState('')
  const [newPageAddMenu, setNewPageAddMenu] = useState(true)
  const [creatingPage, setCreatingPage] = useState(false)
  const [themeDirty, setThemeDirty] = useState(false)
  const themeSaveRef = useRef<(() => Promise<boolean>) | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionsError, setVersionsError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
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

  /** Where blocks may go on this page; same rules as the backend. */
  const fits = useMemo<PlaceRule | null>(() => (catalog ? placementRule(catalog, page?.kind || 'home') : null), [catalog, page?.kind])
  const fitsRef = useRef(fits)
  fitsRef.current = fits

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
      fetch(`${api}/public/gallery?kind=photo`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([site, campaigns, news, categories, menu, gallery]) =>
      setData({ site, locale: 'tr', campaigns, news, categories, menu, gallery: gallery.slice(0, 24) }))
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
    versionRef.current = res.data.version
    dispatch({ type: 'load', blocks: res.data.blocks })
    setConflict(null)
    setSaveState('idle')
  }, [])
  useEffect(() => { loadPage(pageId).catch((e) => setMessage({ type: 'error', text: apiErrorMessage(e, 'Sayfa yüklenemedi') })) }, [pageId, loadPage])

  // --- Saving ----------------------------------------------------------------------
  const save = useCallback(async (): Promise<boolean> => {
    if (conflict) return false
    // Wait for a save already in flight: two requests with the same version would look like a conflict.
    while (savingRef.current) await savingRef.current
    if (!stateRef.current.dirty) return true
    const sent = stateRef.current.blocks
    const run = (async () => {
      setSaveState('saving')
      try {
        const res = await adminSend<{ version: number }>('put', `/site-builder/pages/${pageId}/draft`, { blocks: sent, version: versionRef.current })
        versionRef.current = res.data.version
        dispatch({ type: 'saved', blocks: sent })
        setPage((p) => (p ? { ...p, has_draft: true } : p))
        loadPages().catch(() => undefined)
        setSaveState('saved')
        return true
      } catch (err) {
        const status = (err as { response?: { status?: number } }).response?.status
        if (status === 409) setConflict(apiErrorMessage(err, 'Sayfa başka bir oturumda değiştirildi'))
        else setMessage({ type: 'error', text: apiErrorMessage(err, 'Taslak kaydedilemedi') })
        setSaveState('error')
        return false
      }
    })()
    savingRef.current = run
    try {
      return await run
    } finally {
      savingRef.current = null
    }
  }, [pageId, conflict])

  const themeDirtyRef = useRef(themeDirty)
  themeDirtyRef.current = themeDirty

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (stateRef.current.dirty || themeDirtyRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  // --- Editing ---------------------------------------------------------------------
  const commit = (blocks: Block[], select?: string | null) => dispatch({ type: 'commit', blocks, select })

  /** Whether a block type may go on the page being edited (same rule as the backend). */
  const fitsPage = (type: string) => {
    if (!catalog) return false
    const kind = page?.kind || 'home'
    if (kind === 'header') return (catalog.header_top_level || ['header_row']).includes(type) || catalog.header_slot_children.includes(type)
    return (catalog.blocks[type]?.zones || catalog.content_zones).includes(kind)
  }

  const addBlock = (type: string) => {
    if (!catalog) return
    placeBlock(newBlock(type, catalog.blocks[type]))
    if (mobilePane === 'left') setMobilePane('canvas')
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
      if (type === 'announcement_bar') {
        blocks = insertBlock(state.blocks, null, 0, block)
      } else if (type === 'header_row') {
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
    if (fits && !placedOk(blocks, block.id, fits)) {
      setMessage({ type: 'error', text: `“${catalog.blocks[type]?.label || type}” buraya eklenemez; başka bir yer seçin.` })
      return
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
  }, [])

  /** Drag-and-drop move (canvas or tree); refused when the block may not go there. */
  const move = useCallback((id: string, targetId: string, position: 'before' | 'after' | 'inside') => {
    const blocks = stateRef.current.blocks
    const next = moveBlock(blocks, id, targetId, position, fitsRef.current ?? undefined)
    if (next === blocks) {
      if (id !== targetId) setMessage({ type: 'error', text: 'Blok buraya taşınamaz.' })
      return
    }
    commit(next)
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
    let copy: Block
    try {
      const parsed = JSON.parse(raw) as Block
      if (!parsed || typeof parsed.type !== 'string') return
      copy = cloneBlock(parsed)
    } catch {
      return
    }
    const blocks = stateRef.current.blocks
    const sel = stateRef.current.selectedId ? findBlock(blocks, stateRef.current.selectedId) : null
    const place = sel ? locate(blocks, sel.id) : null
    // A selected slot (column, header area) receives the block; otherwise it goes after the selection.
    const next = sel && FIXED_CHILD.has(sel.type)
      ? insertBlock(blocks, sel.id, sel.children?.length ?? 0, copy)
      : place ? insertBlock(blocks, place[0], place[1] + 1, copy) : [...blocks, copy]
    const rule = fitsRef.current
    if (rule && !placedOk(next, copy.id, rule)) {
      setMessage({ type: 'error', text: 'Kopyalanan blok buraya yapıştırılamaz (bu sayfa türünde ya da bu alanda kullanılamaz).' })
      return
    }
    commit(next, copy.id)
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
      if ((e.ctrlKey || e.metaKey) || e.key === 'Delete' || e.key === 'Backspace') {
        if ((e.ctrlKey || e.metaKey) && ['z', 'y', 'c', 'v', 'd', 's'].includes(e.key.toLowerCase())) e.preventDefault()
        onKey(e.key, e.ctrlKey || e.metaKey, e.shiftKey)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onKey])

  const applyThemePreview = useCallback((patch: ThemeLivePatch) => {
    setData((prev) => (prev ? { ...prev, site: { ...prev.site, ...patch } } : prev))
  }, [])
  const applyMenuPreview = useCallback((menu: PublicMenu) => {
    setData((prev) => (prev ? { ...prev, menu } : prev))
  }, [])

  const langRef = useRef(lang)
  langRef.current = lang

  // --- Canvas messaging ------------------------------------------------------------
  const sendRender = useCallback(() => {
    if (!frameReady.current || !data || !catalog) return
    const fit = area.w > 0 && area.w < TARGET_WIDTH[device] ? area.w / TARGET_WIDTH[device] : 1
    const curScale = zoom === 'fit' ? fit : zoom / 100
    frame.current?.contentWindow?.postMessage({
      source: 'einfak-builder', type: 'render', blocks: state.blocks, selectedId: state.selectedId,
      data: { ...data, locale: lang }, specs: catalog.blocks, device, scale: curScale,
    }, window.location.origin)
  }, [state.blocks, state.selectedId, data, catalog, lang, device, zoom, area.w])
  useEffect(() => { sendRender() }, [sendRender])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return
      const msg = event.data
      if (msg?.source !== 'einfak-builder-frame') return
      if (msg.type === 'ready') { frameReady.current = true; sendRender() }
      if (msg.type === 'select') { dispatch({ type: 'select', id: msg.id }); setInsertTarget(null) }
      if (msg.type === 'action') {
        if (msg.action === 'copy') copySelected()
        else if (msg.action === 'paste') paste()
        else blockAction(msg.id, msg.action)
      }
      if (msg.type === 'patch-settings' && msg.id && msg.patch) {
        const curLang = langRef.current
        const next = updateBlock(stateRef.current.blocks, msg.id, (b) => (
          curLang !== 'tr'
            ? { ...b, translations: { ...b.translations, [curLang]: { ...(b.translations?.[curLang] || {}), ...msg.patch } } }
            : { ...b, props: { ...b.props, ...msg.patch } }
        ))
        commit(next)
      }
      if (msg.type === 'toggle-hide' && msg.id && msg.device) {
        const key = msg.device === 'desktop' ? 'hide_desktop' : msg.device === 'tablet' ? 'hide_tablet' : 'hide_mobile'
        const next = updateBlock(stateRef.current.blocks, msg.id, (b) => ({
          ...b,
          advanced: { ...b.advanced, [key]: !b.advanced?.[key] },
        }))
        commit(next)
      }
      if (msg.type === 'insert-after' && msg.targetId) {
        setInsertTarget(null)
        dispatch({ type: 'select', id: msg.targetId })
        setLeftOpen(true)
        setLeftTab('add')
        setAddSubTab('blocks')
        setMobilePane('left')
      }
      if (msg.type === 'move') move(msg.id, msg.targetId, msg.position)
      if (msg.type === 'insert-new' && catalog?.blocks[msg.blockType]) {
        const block = newBlock(msg.blockType, catalog.blocks[msg.blockType])
        const targetId = msg.targetId as string
        const pos = msg.position as 'before' | 'after' | 'inside'
        let next: Block[] | null = null
        if (!targetId || !stateRef.current.blocks.length) {
          next = [...stateRef.current.blocks, block]
        } else if (pos === 'inside') {
          const target = findBlock(stateRef.current.blocks, targetId)
          if (target) next = insertBlock(stateRef.current.blocks, targetId, target.children?.length ?? 0, block)
        } else {
          const place = locate(stateRef.current.blocks, targetId)
          if (place) next = insertBlock(stateRef.current.blocks, place[0], place[1] + (pos === 'after' ? 1 : 0), block)
        }
        if (next && (!fitsRef.current || placedOk(next, block.id, fitsRef.current))) {
          dispatch({ type: 'commit', blocks: next, select: block.id })
        }
      }
      if (msg.type === 'insert-new-blocks' && Array.isArray(msg.blocks) && msg.blocks.length) {
        const clones = (msg.blocks as Block[]).map(cloneBlock)
        const targetId = msg.targetId as string
        const pos = msg.position as 'before' | 'after' | 'inside'
        let next = stateRef.current.blocks
        if (!targetId || !next.length) {
          next = [...next, ...clones]
        } else if (pos === 'inside') {
          const target = findBlock(next, targetId)
          if (target) {
            let idx = target.children?.length ?? 0
            for (const c of clones) next = insertBlock(next, targetId, idx++, c)
          }
        } else {
          const place = locate(next, targetId)
          if (place) {
            let idx = place[1] + (pos === 'after' ? 1 : 0)
            for (const c of clones) next = insertBlock(next, place[0], idx++, c)
          }
        }
        const firstId = clones[0].id
        if (!fitsRef.current || clones.every((c) => placedOk(next, c.id, fitsRef.current!))) {
          dispatch({ type: 'commit', blocks: next, select: firstId })
        } else {
          setMessage({ type: 'error', text: 'Bu bölüm buraya eklenemez.' })
        }
      }
      if (msg.type === 'add-into') { setInsertTarget(msg.parentId); dispatch({ type: 'select', id: msg.parentId }); setLeftOpen(true); setLeftTab('add'); setAddSubTab('blocks'); setMobilePane('left') }
      if (msg.type === 'key') onKey(msg.key, msg.ctrl, msg.shift)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [sendRender, blockAction, onKey, move])

  // --- Page actions ----------------------------------------------------------------
  const switchPage = async (id: string) => {
    if (id === pageId) return
    if (state.dirty && !(await save())) return
    setPageId(id)
  }

  const openCreatePage = () => {
    setNewPageTitle('')
    setNewPageTemplate('')
    setNewPageAddMenu(true)
    setModal('new-page')
  }

  const submitCreatePage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPageTitle.trim() || creatingPage) return
    if (state.dirty && !(await save())) return
    setCreatingPage(true)
    try {
      const res = await adminSend<PageSummary & { version?: number }>('post', '/site-builder/pages', { title: newPageTitle.trim() })
      const tpl = newPageTemplate ? library?.pages.find((p) => p.key === newPageTemplate) : undefined
      if (tpl?.blocks?.length) {
        await adminSend('put', `/site-builder/pages/${res.data.id}/draft`, {
          blocks: tpl.blocks.map(cloneBlock),
          version: res.data.version ?? 0,
        })
      }
      if (newPageAddMenu && res.data.slug) {
        try {
          await adminSend('post', '/menu', {
            location: 'header',
            label: newPageTitle.trim(),
            url: `/sayfa/${res.data.slug}`,
            open_in_new_tab: false,
            display_order: 99,
          })
          const m = await adminGet<{ location: 'header' | 'footer'; label: string; url: string; open_in_new_tab: boolean; display_order: number; is_active: boolean }[]>('/menu')
          const byOrder = (a: { display_order: number }, b: { display_order: number }) => a.display_order - b.display_order
          applyMenuPreview({
            header: m.data.filter((i) => i.location === 'header' && i.is_active).sort(byOrder).map((i) => ({ label: i.label, url: i.url, open_in_new_tab: i.open_in_new_tab })),
            footer: m.data.filter((i) => i.location === 'footer' && i.is_active).sort(byOrder).map((i) => ({ label: i.label, url: i.url, open_in_new_tab: i.open_in_new_tab })),
          })
        } catch { /* menu add is optional */ }
      }
      setModal(null)
      await loadPages()
      await switchPage(res.data.id)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Sayfa oluşturulamadı') })
    } finally {
      setCreatingPage(false)
    }
  }

  const duplicatePage = async (p: PageSummary) => {
    if (state.dirty && !(await save())) return
    try {
      const src = await adminGet<{ blocks?: Block[] }>(`/site-builder/pages/${p.id}`)
      const created = await adminSend<PageSummary & { version?: number }>('post', '/site-builder/pages', { title: `${p.title} (Kopya)` })
      if (src.data.blocks?.length) {
        await adminSend('put', `/site-builder/pages/${created.data.id}/draft`, {
          blocks: src.data.blocks.map(cloneBlock),
          version: created.data.version ?? 0,
        })
      }
      await loadPages()
      await switchPage(created.data.id)
      setMessage({ type: 'ok', text: `“${p.title}” kopyalandı.` })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Sayfa kopyalanamadı') })
    }
  }

  const deletePageQuick = async (p: PageSummary) => {
    if (!(await confirmDialog(`“${p.title}” sayfası kalıcı olarak silinsin mi?`))) return
    try {
      await adminSend('delete', `/site-builder/pages/${p.id}`)
      await loadPages()
      if (pageId === p.id) await switchPage('home')
      setMessage({ type: 'ok', text: `“${p.title}” silindi.` })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Sayfa silinemedi') })
    }
  }

  const publish = async () => {
    if (themeDirty && themeSaveRef.current && !(await themeSaveRef.current())) return
    if (state.dirty && !(await save())) return
    try {
      const res = await adminSend<PageSummary & { version: number }>('post', `/site-builder/pages/${pageId}/publish`)
      versionRef.current = res.data.version
      setPage(res.data)
      setModal(null)
      setMessage({ type: 'ok', text: 'Yayınlandı. Ziyaretçiler yeni hali görüyor.' })
      loadPages()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Yayınlanamadı') })
    }
  }

  const openPreview = async () => {
    if (previewing) return
    setPreviewing(true)
    setPreviewUrl(null)
    const win = window.open('', '_blank')
    try {
      if (state.dirty && !(await save())) {
        win?.close()
        return
      }
      const res = await adminSend<{ path: string }>('post', `/site-builder/pages/${pageId}/preview-link`)
      if (win && !win.closed) {
        win.opener = null
        win.location.href = res.data.path
      } else {
        setPreviewUrl(res.data.path)
        setMessage({ type: 'error', text: 'Tarayıcı yeni sekmeyi engelledi.' })
      }
    } catch (err) {
      win?.close()
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Önizleme bağlantısı oluşturulamadı') })
    } finally {
      setPreviewing(false)
    }
  }

  const showVersions = async () => {
    setModal('versions')
    setRevisions([])
    setVersionsError(null)
    setVersionsLoading(true)
    try {
      setRevisions((await adminGet<Revision[]>(`/site-builder/pages/${pageId}/revisions`)).data)
    } catch (err) {
      setVersionsError(apiErrorMessage(err, 'Sürümler yüklenemedi'))
    } finally {
      setVersionsLoading(false)
    }
  }

  const restore = async (id: string) => {
    if (!window.confirm('Bu sürüm taslak olarak geri yüklensin mi? Yayınlayana kadar ziyaretçiler etkilenmez.')) return
    try {
      const res = await adminSend<{ version: number; blocks: Block[] }>('post', `/site-builder/pages/${pageId}/revisions/${id}/restore`)
      versionRef.current = res.data.version
      dispatch({ type: 'load', blocks: res.data.blocks })
      setPage((p) => (p ? { ...p, has_draft: true } : p))
      loadPages()
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
      versionRef.current = res.data.version
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
      if (page?.has_draft) await adminSend('post', `/site-builder/pages/${pageId}/discard`)
      await loadPage(pageId)
      loadPages()
      setMessage({ type: 'ok', text: 'Taslak değişiklikleri atıldı, yayındaki haline dönüldü.' })
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
      ? (catalog.header_top_level || ['header_row']).includes(key) || catalog.header_slot_children.includes(key)
      : (spec.zones || catalog.content_zones).includes(kind)
    for (const [key, spec] of Object.entries(catalog.blocks)) {
      if (spec.hidden || !fits(key, spec)) continue
      if (search && !`${spec.label} ${spec.group} ${key} ${spec.help || ''}`.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))) continue
      ;(out[spec.group] ||= []).push([key, spec])
    }
    return Object.entries(out)
  }, [catalog, search, page?.kind])

  // --- Tree ------------------------------------------------------------------------
  const dragTree = useRef<string | null>(null)
  const treeContent = (b: Block) => {
    const tr = b.translations?.[lang]
    const raw = tr?.title ?? tr?.label ?? tr?.text ?? b.props?.title ?? b.props?.label ?? b.props?.text
    const cleaned = typeof raw === 'string' ? raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''
    return cleaned ? cleaned.slice(0, 42) : ''
  }
  const treeLabel = (b: Block, label?: string) => (b.advanced?._label as string | undefined) || treeContent(b) || label || b.type
  const typeTotals = useMemo(() => {
    const counts: Record<string, number> = {}
    const walk = (list: Block[]) => {
      for (const item of list) {
        counts[item.type] = (counts[item.type] || 0) + 1
        if (item.children?.length) walk(item.children)
      }
    }
    walk(state.blocks)
    return counts
  }, [state.blocks])
  const treeMatches = (b: Block, q: string): boolean => {
    if (!q) return true
    const spec = catalog?.blocks[b.type]
    const hay = `${treeLabel(b, spec?.label)} ${spec?.label || ''} ${b.type}`.toLocaleLowerCase('tr')
    if (hay.includes(q)) return true
    return !!(b.children && b.children.some((c) => treeMatches(c, q)))
  }
  const collectContainerIds = (blocks: Block[]): string[] =>
    blocks.flatMap((b) => (b.children?.length ? [b.id, ...collectContainerIds(b.children)] : []))
  const Tree = ({ blocks, depth }: { blocks: Block[]; depth: number }) => {
    const tq = treeSearch.trim().toLocaleLowerCase('tr')
    const visible = tq ? blocks.filter((b) => treeMatches(b, tq)) : blocks
    return (
      <ul className={depth ? 'ms-3 border-s ps-1.5' : ''}>
        {visible.map((b) => {
          const spec = catalog?.blocks[b.type]
          const hasChildren = !!(b.children && b.children.length > 0)
          const isCollapsed = !tq && !!collapsedTree[b.id]
        const hiddenDevices = [b.advanced?.hide_desktop && 'M', b.advanced?.hide_tablet && 'T', b.advanced?.hide_mobile && 'C'].filter(Boolean)
        const dropHere = treeDrop?.id === b.id ? treeDrop.pos : null
        const dropCls = dropHere === 'before'
          ? 'border-t-2 border-t-blue-500'
          : dropHere === 'after'
            ? 'border-b-2 border-b-blue-500'
            : dropHere === 'inside'
              ? 'ring-2 ring-blue-500 bg-blue-50'
              : ''
        return (
          <li key={b.id}>
            <div
              draggable={!FIXED_CHILD.has(b.type)}
              onDragStart={(e) => { dragTree.current = b.id; e.dataTransfer.setData('text/plain', b.id) }}
              onDragEnd={() => { dragTree.current = null; setTreeDrop(null) }}
              onDragOver={(e) => {
                e.preventDefault()
                if (!dragTree.current || dragTree.current === b.id) return
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const y = (e.clientY - rect.top) / rect.height
                const inside = !!(spec?.container && !FIXED_PARENT.has(b.type) && y > 0.3 && y < 0.7)
                const pos: 'before' | 'inside' | 'after' = inside ? 'inside' : y < 0.5 ? 'before' : 'after'
                setTreeDrop((prev) => (prev?.id === b.id && prev.pos === pos ? prev : { id: b.id, pos }))
              }}
              onDragLeave={() => setTreeDrop((prev) => (prev?.id === b.id ? null : prev))}
              onDrop={(e) => {
                e.preventDefault()
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const y = (e.clientY - rect.top) / rect.height
                const inside = !!(spec?.container && !FIXED_PARENT.has(b.type) && y > 0.3 && y < 0.7)
                if (dragTree.current) {
                  move(dragTree.current, b.id, inside ? 'inside' : y < 0.5 ? 'before' : 'after')
                  if (inside) setCollapsedTree((prev) => ({ ...prev, [b.id]: false }))
                }
                dragTree.current = null
                setTreeDrop(null)
              }}
              onClick={() => {
                dispatch({ type: 'select', id: b.id })
                frame.current?.contentWindow?.postMessage({ source: 'einfak-builder', type: 'scroll-to', id: b.id }, window.location.origin)
                if (mobilePane === 'left') setMobilePane('right')
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                setRenamingId(b.id)
                setRenameVal(treeLabel(b, spec?.label))
              }}
              className={`group flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[12px] ${state.selectedId === b.id ? 'bg-blue-100 font-semibold text-blue-800' : 'hover:bg-gray-100'} ${((device === 'desktop' && b.advanced?.hide_desktop) || (device === 'tablet' && b.advanced?.hide_tablet) || (device === 'mobile' && b.advanced?.hide_mobile)) ? 'opacity-50' : ''} ${dropCls}`}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setCollapsedTree((prev) => ({ ...prev, [b.id]: !prev[b.id] })) }}
                  className="w-3.5 shrink-0 text-[10px] text-gray-400 hover:text-gray-700"
                  aria-label={isCollapsed ? 'Genişlet' : 'Daralt'}
                >
                  {isCollapsed ? '▸' : '▾'}
                </button>
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <span className="text-sm leading-none">{spec?.icon}</span>
              <span className="min-w-0 flex-1">
                {renamingId === b.id ? (
                  <input
                    autoFocus
                    className="w-full rounded border border-blue-400 bg-white px-1 py-0.5 text-[11px] text-gray-900 outline-none"
                    value={renameVal}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={() => {
                      const trimmed = renameVal.trim()
                      commit(updateBlock(stateRef.current.blocks, b.id, (blk) => ({
                        ...blk,
                        advanced: { ...blk.advanced, _label: trimmed || undefined },
                      })))
                      setRenamingId(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                  />
                ) : (
                  <span className="block truncate font-medium text-gray-800" title="Yeniden adlandırmak için çift tıklayın">
                    {treeLabel(b, spec?.label)}
                  </span>
                )}
                {(b.advanced?._label || treeContent(b) || (typeTotals[b.type] || 0) > 1) && (
                  <span className="block truncate text-[10px] text-gray-400">
                    {spec?.label || b.type}{(typeTotals[b.type] || 0) > 1 ? ` · toplam ${typeTotals[b.type]}` : ''}
                  </span>
                )}
              </span>
              {hasChildren && <span className="text-[10px] text-gray-400">({b.children!.length})</span>}
              {hiddenDevices.length > 0 && <span className="rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-800" title="Bazı cihazlarda gizli">{hiddenDevices.join('')}</span>}
              <span className="hidden items-center gap-0.5 group-hover:flex">
                {!FIXED_CHILD.has(b.type) && (
                  <>
                    <button
                      type="button"
                      title="Yukarı taşı"
                      onClick={(e) => { e.stopPropagation(); blockAction(b.id, 'up') }}
                      className="rounded px-1 text-[11px] text-gray-400 hover:bg-white hover:text-gray-700"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title="Aşağı taşı"
                      onClick={(e) => { e.stopPropagation(); blockAction(b.id, 'down') }}
                      className="rounded px-1 text-[11px] text-gray-400 hover:bg-white hover:text-gray-700"
                    >
                      ↓
                    </button>
                  </>
                )}
                <button
                  type="button"
                  title="Çoğalt"
                  onClick={(e) => { e.stopPropagation(); blockAction(b.id, 'duplicate') }}
                  className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-700"
                >
                  <CopyPlus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Bu cihazda gizle / göster"
                  onClick={(e) => {
                    e.stopPropagation()
                    const key = device === 'desktop' ? 'hide_desktop' : device === 'tablet' ? 'hide_tablet' : 'hide_mobile'
                    commit(updateBlock(stateRef.current.blocks, b.id, (blk) => ({
                      ...blk,
                      advanced: { ...blk.advanced, [key]: !blk.advanced?.[key] },
                    })))
                  }}
                  className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-700"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                {!FIXED_CHILD.has(b.type) && (
                  <button
                    type="button"
                    title="Sil"
                    onClick={(e) => { e.stopPropagation(); blockAction(b.id, 'delete') }}
                    className="rounded p-1 text-gray-400 hover:bg-white hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            </div>
            {hasChildren && !isCollapsed && <Tree blocks={b.children!} depth={depth + 1} />}
          </li>
        )
      })}
      </ul>
    )
  }

  if (!catalog || !data) {
    return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-100 text-sm text-gray-500">{message?.text || 'Site Yapıcı yükleniyor…'}</div>
  }

  const translating = lang !== 'tr'
  const targetW = TARGET_WIDTH[device]
  const fitScale = area.w > 0 && area.w < targetW ? area.w / targetW : 1
  const scale = zoom === 'fit' ? fitScale : zoom / 100
  const styleValues = (selected?.style?.[device] || {}) as Record<string, any>

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gray-100 text-gray-900">
      {/* Top bar */}
      <header className="flex min-h-12 flex-none flex-wrap items-center gap-2 border-b border-gray-200/80 bg-white px-3 py-1.5 shadow-2xs lg:h-12 lg:flex-nowrap lg:py-0">
        <Link
          href="/admin"
          onClick={(e) => {
            if ((state.dirty || themeDirty) && !window.confirm('Kaydedilmemiş değişiklikleriniz var. Kaydetmeden çıkmak istediğinize emin misiniz?')) {
              e.preventDefault()
            }
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Panel</span>
        </Link>
        <span className="mx-0.5 h-5 w-px bg-gray-200" />
        <select
          aria-label="Düzenlenen sayfa"
          value={pageId}
          onChange={(e) => switchPage(e.target.value)}
          className="max-w-[180px] truncate rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-[13px] font-bold text-gray-900 outline-none transition hover:bg-white focus:border-blue-500"
        >
          <optgroup label="Genel Düzen">
            {pages.filter((p) => p.kind !== 'page').map((p) => (
              <option key={p.id} value={p.id}>{KIND_ICON[p.kind]} {p.title}</option>
            ))}
          </optgroup>
          {pages.some((p) => p.kind === 'page') && (
            <optgroup label="Özel Sayfalar">
              {pages.filter((p) => p.kind === 'page').map((p) => (
                <option key={p.id} value={p.id}>{KIND_ICON[p.kind]} {p.title}</option>
              ))}
            </optgroup>
          )}
        </select>
        <span className="hidden items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600 sm:inline-flex">
          <span className={`h-1.5 w-1.5 rounded-full ${saveState === 'saving' ? 'animate-pulse bg-blue-500' : (state.dirty || themeDirty) ? 'bg-amber-500' : page?.has_draft ? 'bg-amber-400' : 'bg-emerald-500'}`} />
          {saveState === 'saving' ? 'Kaydediliyor…' : (state.dirty || themeDirty) ? (themeDirty ? 'Tema kaydedilmedi' : 'Kaydedilmedi') : saveState === 'saved' ? 'Taslak kaydedildi' : page?.has_draft ? 'Taslak var' : 'Yayında'}
        </span>
        <div className="mx-auto hidden items-center gap-1.5 sm:flex">
          <div className="flex items-center rounded-lg border border-gray-200 bg-gray-100/80 p-0.5">
            {([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
              <button key={d} type="button" onClick={() => setDevice(d)} title={DEVICE_LABEL[d]} aria-label={DEVICE_LABEL[d]}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${device === d ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}>
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">{DEVICE_LABEL[d]}</span>
              </button>
            ))}
          </div>
          <select
            aria-label="Yakınlaştırma"
            value={zoom}
            onChange={(e) => {
              const v = e.target.value
              setZoom(v === 'fit' ? 'fit' : (Number(v) as 50 | 75 | 100))
            }}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700"
            title="Tuval yakınlaştırma"
          >
            <option value="fit">Sığdır</option>
            <option value={50}>%50</option>
            <option value={75}>%75</option>
            <option value={100}>%100</option>
          </select>
        </div>
        <button type="button" className={`hidden lg:inline-flex items-center justify-center rounded-md border border-gray-200 p-1.5 text-gray-600 transition hover:bg-gray-100 ${!leftOpen ? 'border-blue-200 bg-blue-50 text-blue-700' : ''}`}
          title={leftOpen ? 'Sol paneli gizle' : 'Sol paneli göster'} onClick={() => setLeftOpen((o) => !o)}><PanelLeft className="h-4 w-4" /></button>
        <button type="button" className={`hidden lg:inline-flex items-center justify-center rounded-md border border-gray-200 p-1.5 text-gray-600 transition hover:bg-gray-100 ${!rightOpen ? 'border-blue-200 bg-blue-50 text-blue-700' : ''}`}
          title={rightOpen ? 'Sağ paneli gizle' : 'Sağ paneli göster'} onClick={() => setRightOpen((o) => !o)}><PanelRight className="h-4 w-4" /></button>
        <button type="button" className="inline-flex items-center justify-center rounded-md border border-gray-200 p-1.5 text-gray-600 transition hover:bg-gray-100 disabled:opacity-40" title="Geri al (Ctrl+Z)" disabled={!state.past.length} onClick={() => dispatch({ type: 'undo' })}><Undo2 className="h-4 w-4" /></button>
        <button type="button" className="inline-flex items-center justify-center rounded-md border border-gray-200 p-1.5 text-gray-600 transition hover:bg-gray-100 disabled:opacity-40" title="Yinele (Ctrl+Y)" disabled={!state.future.length} onClick={() => dispatch({ type: 'redo' })}><Redo2 className="h-4 w-4" /></button>
        {languages.length > 1 && (
          <select className="rounded-md border border-gray-200 px-2 py-1 text-[12px]" value={lang} onChange={(e) => setLang(e.target.value)} title="Düzenlenen dil">
            {languages.map((l) => <option key={l} value={l}>{LANG_LABEL[l] || l}</option>)}
          </select>
        )}
        <button type="button" className={`inline-flex items-center gap-1 ${smallBtn}`} onClick={showVersions}><History className="h-3.5 w-3.5" /><span>Sürümler</span></button>
        {!CHROME.has(page?.kind || '') && <button type="button" className={`inline-flex items-center gap-1 ${smallBtn}`} disabled={previewing} onClick={openPreview}><span>{previewing ? 'Açılıyor…' : 'Önizle'}</span><ExternalLink className="h-3 w-3" /></button>}
        {CHROME.has(page?.kind || '') && page?.is_published && <button type="button" className={smallBtn} onClick={unpublish}>Yerleşik tasarıma dön</button>}
        {(page?.has_draft || state.dirty) && <button type="button" className={smallBtn} onClick={discard}>Değişiklikleri at</button>}
        <button
          type="button"
          disabled={saveState === 'saving' || (!state.dirty && !themeDirty)}
          onClick={async () => {
            if (themeDirty && themeSaveRef.current) await themeSaveRef.current()
            if (state.dirty) await save()
          }}
          title="Taslak olarak kaydet (Ctrl+S)"
          className={`inline-flex items-center gap-1 ${smallBtn} ${(state.dirty || themeDirty) ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100' : 'opacity-50'}`}
        >
          <Save className="h-3.5 w-3.5" />
          <span>{saveState === 'saving' ? 'Kaydediliyor…' : 'Taslak Kaydet'}</span>
        </button>
        <button type="button" className="rounded-md bg-blue-600 px-3.5 py-1.5 text-[12px] font-bold text-white shadow-xs transition hover:bg-blue-700" onClick={() => setModal('publish')}>Yayınla</button>
      </header>

      {conflict && (
        <div className="flex items-center gap-3 bg-red-600 px-4 py-2 text-sm font-semibold text-white">
          {conflict}
          <button type="button" className="rounded bg-white px-2 py-0.5 text-red-700" onClick={() => loadPage(pageId)}>Sayfayı yenile</button>
        </div>
      )}
      {message && (
        <div className={`flex items-center justify-between gap-2 px-4 py-1.5 text-[12px] font-semibold ${message.type === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          <span className="flex items-center gap-2">
            {message.text}
            {previewUrl && (
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="underline">
                Önizlemeyi aç ↗
              </a>
            )}
          </span>
          <button type="button" onClick={() => { setMessage(null); setPreviewUrl(null) }}>✕</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left panel: Wix/Webflow style icon rail + content pane */}
        <aside className={`${mobilePane === 'left' ? 'flex w-full' : 'hidden'} flex-none border-e bg-white lg:flex ${leftOpen ? 'lg:w-[340px]' : 'lg:w-[62px]'}`}>
          <nav className="flex w-[62px] shrink-0 flex-col items-center gap-1 border-e bg-gray-50/80 py-2" aria-label="Editör bölümleri">
            {([
              ['add', 'Ekle', Plus],
              ['pages', 'Sayfa & Menü', FileText],
              ['layers', 'Katmanlar', Layers],
              ['theme', 'Tema', Palette],
            ] as const).map(([key, label, Icon]) => {
              const active = leftTab === key && leftOpen
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (leftTab === key && leftOpen) setLeftOpen(false)
                    else { setLeftTab(key); setLeftOpen(true) }
                  }}
                  title={label}
                  className={`relative flex w-[54px] flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-semibold leading-tight transition ${
                    active ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-center">{key === 'pages' ? 'Sayfa' : label}</span>
                  {key === 'layers' && (
                    <span className={`rounded-full px-1 text-[9px] font-bold ${active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                      {countBlocks(state.blocks)}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          <div className={`min-w-0 flex-1 flex-col ${leftOpen ? 'flex' : 'flex lg:hidden'}`}>
            <div className="flex items-center justify-between border-b px-3 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-700">
                {leftTab === 'add' ? 'Ekle' : leftTab === 'pages' ? 'Sayfa & Menü' : leftTab === 'layers' ? `Katmanlar (${countBlocks(state.blocks)})` : 'Tema & Marka'}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className={leftTab === 'theme' ? 'block' : 'hidden'}>
                <ThemePanel onLivePreview={applyThemePreview} onDirtyChange={setThemeDirty} saveRef={themeSaveRef} />
              </div>
            {leftTab === 'pages' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 rounded-lg border bg-gray-50 p-0.5 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setPagesSubTab('pages')}
                    className={`rounded-md py-1.5 transition ${pagesSubTab === 'pages' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    Sayfalar
                  </button>
                  <button
                    type="button"
                    onClick={() => setPagesSubTab('menu')}
                    className={`rounded-md py-1.5 transition ${pagesSubTab === 'menu' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    Menü
                  </button>
                </div>

                {pagesSubTab === 'menu' ? (
                  <MenuPanel onMenuChanged={applyMenuPreview} />
                ) : (() => {
                  const pq = pageSearch.trim().toLocaleLowerCase('tr')
                  const filtered = pages.filter((p) => !pq || `${p.title} ${p.slug || ''} ${KIND_PATH[p.kind] || ''}`.toLocaleLowerCase('tr').includes(pq))
                  const systemPages = filtered.filter((p) => p.kind !== 'page')
                  const customPages = filtered.filter((p) => p.kind === 'page')
                  const renderPageBtn = (p: PageSummary) => {
                    const dotCls = p.has_draft ? 'bg-amber-400' : p.is_published ? 'bg-emerald-500' : 'bg-gray-300'
                    const publicPath = p.kind === 'home' ? '/' : p.kind === 'page' && p.slug ? `/sayfa/${p.slug}` : null
                    return (
                      <div key={p.id} className={`group flex items-start gap-1 rounded-md px-2 py-2 ${p.id === pageId ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50'}`}>
                        <button type="button" onClick={() => switchPage(p.id)} className="min-w-0 flex-1 text-start text-[13px]">
                          <span className={`flex items-center gap-1.5 ${p.id === pageId ? 'font-semibold' : ''}`}>
                            <span>{KIND_ICON[p.kind]}</span>
                            <span className="min-w-0 flex-1 truncate">{p.title}</span>
                            <span className={`h-2 w-2 shrink-0 rounded-full ${dotCls}`} title={p.has_draft ? 'Taslak var' : p.is_published ? 'Yayında' : 'Yayınlanmadı'} />
                          </span>
                          <span className="mt-0.5 block text-[11px] font-normal text-gray-400">
                            {KIND_PATH[p.kind] ?? `/sayfa/${p.slug}`} · {p.has_draft ? 'taslak var' : p.is_published ? 'yayında' : CHROME.has(p.kind) ? 'yerleşik tasarım' : 'yayınlanmadı'}{p.kind === 'page' && !p.uses_blocks && !p.has_draft ? ' · klasik' : ''}
                          </span>
                        </button>
                        {p.kind === 'page' && (
                          <>
                            <button
                              type="button"
                              title="Sayfa ayarları ve SEO"
                              onClick={() => setSettingsPageId(p.id)}
                              className="mt-0.5 hidden shrink-0 rounded p-1 text-gray-400 hover:bg-white hover:text-gray-800 group-hover:inline-flex"
                            >
                              <Settings className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Sayfayı çoğalt"
                              onClick={() => duplicatePage(p)}
                              className="mt-0.5 hidden shrink-0 rounded p-1 text-gray-400 hover:bg-white hover:text-gray-800 group-hover:inline-flex"
                            >
                              <CopyPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Sayfayı sil"
                              onClick={() => deletePageQuick(p)}
                              className="mt-0.5 hidden shrink-0 rounded p-1 text-red-400 hover:bg-white hover:text-red-600 group-hover:inline-flex"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {publicPath && p.is_published && (
                          <a
                            href={publicPath}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Canlı sayfayı aç"
                            className="mt-0.5 hidden shrink-0 rounded p-1 text-gray-400 hover:bg-white hover:text-blue-600 group-hover:inline-flex"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    )
                  }
                  return (
                    <div className="space-y-2">
                      <div className="relative">
                        <input className="w-full rounded-md border px-2 py-1.5 pr-7 text-[13px]" placeholder="Sayfa ara…" value={pageSearch} onChange={(e) => setPageSearch(e.target.value)} />
                        {pageSearch && (
                          <button type="button" onClick={() => setPageSearch('')} aria-label="Aramayı temizle"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700">✕</button>
                        )}
                      </div>
                      {filtered.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-xs text-gray-500">
                          Aradığınız sayfa bulunamadı.
                        </div>
                      ) : (
                        <>
                          {systemPages.length > 0 && (
                            <div className="space-y-1">
                              <div className="px-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Genel Düzen</div>
                              {systemPages.map(renderPageBtn)}
                            </div>
                          )}
                          {customPages.length > 0 && (
                            <div className="space-y-1 pt-1">
                              <div className="px-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Özel Sayfalar ({customPages.length})</div>
                              {customPages.map(renderPageBtn)}
                            </div>
                          )}
                        </>
                      )}
                      <button type="button" onClick={openCreatePage} className="mt-2 w-full rounded-md border border-dashed py-2 text-[12px] font-semibold text-blue-600 hover:bg-blue-50">+ Yeni sayfa</button>
                    </div>
                  )
                })()}
              </div>
            )}
            {leftTab === 'add' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 rounded-lg border bg-gray-50 p-0.5 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setAddSubTab('blocks')}
                    className={`rounded-md py-1.5 transition ${addSubTab === 'blocks' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    Öğeler
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddSubTab('library')}
                    className={`rounded-md py-1.5 transition ${addSubTab === 'library' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    Hazır Bölümler
                  </button>
                </div>

                {addSubTab === 'library' ? (
                  <LibraryPanel library={library} catalog={catalog} kind={page?.kind || 'home'} saved={saved}
                    onInsert={insertSection} onReplace={replacePage} onInsertSaved={insertSaved} onDeleteSaved={deleteSaved} onApplyDemo={applyDemo} />
                ) : (
                  <div className="space-y-3">
                    {insertTarget && (
                      <div className="flex items-center justify-between rounded-md bg-blue-50 px-2 py-1.5 text-[11px] font-semibold text-blue-800">
                        Seçilen bloğun içine eklenecek <button type="button" onClick={() => setInsertTarget(null)}>✕</button>
                      </div>
                    )}
                    <div className="relative">
                      <input className="w-full rounded-md border px-2 py-1.5 pr-7 text-[13px]" placeholder="Blok ara…" value={search} onChange={(e) => setSearch(e.target.value)} />
                      {search && (
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          aria-label="Aramayı temizle"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {groups.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-500">
                        Aradığınız blok bulunamadı.
                      </div>
                    ) : groups.map(([group, items]) => {
                      const isCollapsed = !search && !!collapsedGroups[group]
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
                            <div className="grid grid-cols-2 gap-1.5">
                              {items.map(([key, spec]) => (
                                <button
                                  key={key}
                                  type="button"
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData('application/x-new-block', key)
                                    e.dataTransfer.effectAllowed = 'copy'
                                  }}
                                  title={`${spec.help || spec.label} (Tıklayın veya kanvasa sürükleyin)`}
                                  onClick={() => addBlock(key)}
                                  className="group relative flex cursor-grab flex-col items-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-2 py-3 text-[11px] font-semibold text-gray-700 transition hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/40 hover:shadow-sm active:cursor-grabbing"
                                >
                                  <GripVertical className="absolute right-1.5 top-1.5 h-3 w-3 text-gray-300 opacity-0 transition group-hover:opacity-100" />
                                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-lg transition group-hover:bg-blue-100/70">{spec.icon}</span>
                                  <span className="line-clamp-1">{spec.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <p className="text-[11px] text-gray-400">Blok, seçili bloğun altına eklenir. Önizlemede blokları sürükleyerek taşıyabilirsiniz.</p>
                  </div>
                )}
              </div>
            )}
            {leftTab === 'layers' && (() => {
              const containerIds = collectContainerIds(state.blocks)
              const allCollapsed = containerIds.length > 0 && containerIds.every((id) => collapsedTree[id])
              const tq = treeSearch.trim().toLocaleLowerCase('tr')
              const hasMatches = !tq || state.blocks.some((b) => treeMatches(b, tq))
              return (
                <div className="space-y-2">
                  {state.blocks.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <input
                          className="w-full rounded-md border px-2 py-1 pr-6 text-[12px]"
                          placeholder="Ağaçta ara…"
                          value={treeSearch}
                          onChange={(e) => setTreeSearch(e.target.value)}
                        />
                        {treeSearch && (
                          <button
                            type="button"
                            onClick={() => setTreeSearch('')}
                            aria-label="Aramayı temizle"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {containerIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next: Record<string, boolean> = {}
                            if (!allCollapsed) containerIds.forEach((id) => { next[id] = true })
                            setCollapsedTree(next)
                          }}
                          className="shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
                          title={allCollapsed ? 'Tümünü genişlet' : 'Tümünü daralt'}
                        >
                          {allCollapsed ? '▾ Aç' : '▸ Daralt'}
                        </button>
                      )}
                    </div>
                  )}
                  {!state.blocks.length ? (
                    <p className="text-[12px] text-gray-400">Sayfa boş</p>
                  ) : !hasMatches ? (
                    <div className="rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-xs text-gray-500">
                      Eşleşen blok bulunamadı.
                    </div>
                  ) : (
                    <Tree blocks={state.blocks} depth={0} />
                  )}
                  <p className="mt-2 text-[11px] text-gray-400">Sürükleyip bırakarak sıralayın; bir bölümün ortasına bırakırsanız içine taşınır.</p>
                </div>
              )
            })()}
            </div>
          </div>
        </aside>

        {/* Canvas */}
        <main
          className={`${mobilePane === 'canvas' ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col overflow-hidden bg-slate-100 p-2 sm:p-5 lg:flex`}
          style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '18px 18px' }}
          onClick={() => dispatch({ type: 'select', id: null })}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2 sm:justify-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1 rounded-md border bg-white p-0.5 sm:hidden">
              {(['desktop', 'tablet', 'mobile'] as Device[]).map((d) => (
                <button key={d} type="button" onClick={() => setDevice(d)}
                  className={`rounded px-2 py-1 text-[11px] font-semibold ${device === d ? 'bg-gray-900 text-white' : 'text-gray-600'}`}>{DEVICE_LABEL[d]}</button>
              ))}
            </div>
            {(device !== 'desktop' || scale < 1) && (
              <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-gray-500 shadow-sm">
                {targetW}px{scale < 1 ? ` · %${Math.round(scale * 100)}` : ''}
              </span>
            )}
          </div>
          <div ref={canvasArea} className="min-h-0 w-full flex-1 overflow-auto">
            <div className="mx-auto h-full overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-900/10 transition-[width] duration-300"
              style={{
                width: device === 'desktop' && zoom === 'fit'
                  ? '100%'
                  : zoom === 'fit'
                    ? Math.min(targetW, area.w || targetW)
                    : Math.round(targetW * scale),
                maxWidth: zoom === 'fit' ? '100%' : undefined,
              }}>
              {/* The canvas posts "ready" whenever it (re)loads; messages sent while it loads are simply dropped. */}
              <iframe ref={frame} src="/site-yapici-cerceve" title="Sayfa önizlemesi" className="h-full w-full border-0"
                style={scale !== 1 ? { width: targetW, height: area.h > 0 ? area.h / scale : '100%', transform: `scale(${scale})`, transformOrigin: '0 0' } : undefined} />
            </div>
          </div>
        </main>

        {/* Inspector */}
        <aside className={`${mobilePane === 'right' ? 'flex w-full' : 'hidden'} flex-none flex-col border-s bg-white ${rightOpen ? 'lg:flex lg:w-80' : 'lg:hidden'}`}>
          {!selected || !selectedSpec ? (
            <div className="space-y-4 p-5 text-[13px] text-gray-500">
              {page && (
                <div className="space-y-2 rounded-lg border bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-bold text-gray-800">{page.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${page.has_draft ? 'bg-amber-100 text-amber-800' : page.is_published ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`}>
                      {page.has_draft ? 'Taslak' : page.is_published ? 'Yayında' : 'Taslak'}
                    </span>
                  </div>
                  {page.kind === 'page' && (
                    <button type="button" onClick={() => setSettingsPageId(page.id)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded border bg-white py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                      <Settings className="h-3.5 w-3.5" />
                      <span>Sayfa Ayarları &amp; SEO</span>
                    </button>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {page.kind !== 'home' && (
                      <button type="button" onClick={() => switchPage('home')} className="rounded border bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100">🏠 Ana sayfa</button>
                    )}
                    {page.kind !== 'header' && (
                      <button type="button" onClick={() => switchPage('header')} className="rounded border bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100">▤ Header</button>
                    )}
                    {page.kind !== 'footer' && (
                      <button type="button" onClick={() => switchPage('footer')} className="rounded border bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100">▥ Footer</button>
                    )}
                  </div>
                </div>
              )}
              <div>
                <p className="mb-1.5 font-semibold text-gray-700">Bir blok seçin</p>
                <p>Önizlemede bir bloğa tıklayın ya da soldaki “Katmanlar” panelinden seçin. Ayarlar burada görünür.</p>
                <ul className="mt-4 space-y-1 text-[12px]">
                  <li><b>Ctrl+Z / Ctrl+Y</b> geri al / yinele</li>
                  <li><b>Ctrl+C / Ctrl+V</b> bloğu kopyala / yapıştır</li>
                  <li><b>Ctrl+D</b> çoğalt · <b>Delete</b> sil · <b>Ctrl+S</b> kaydet</li>
                </ul>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b bg-gray-50/70 px-3 py-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-base shadow-2xs ring-1 ring-gray-200/80">{selectedSpec.icon}</span>
                <span className="flex-1 truncate text-sm font-bold text-gray-900">{selectedSpec.label}</span>
                {!FIXED_CHILD.has(selected.type) && (
                  <div className="flex items-center gap-1">
                    <button type="button" title="Çoğalt (Ctrl+D)" className="rounded-md border border-gray-200/80 bg-white p-1.5 text-gray-600 shadow-2xs transition hover:border-gray-300 hover:text-gray-900" onClick={() => blockAction(selected.id, 'duplicate')}><CopyPlus className="h-4 w-4" /></button>
                    <button type="button" title="Kopyala (Ctrl+C)" className="rounded-md border border-gray-200/80 bg-white p-1.5 text-gray-600 shadow-2xs transition hover:border-gray-300 hover:text-gray-900" onClick={copySelected}><Clipboard className="h-4 w-4" /></button>
                    <button type="button" title="Kayıtlı bloklara ekle" className="rounded-md border border-gray-200/80 bg-white p-1.5 text-gray-600 shadow-2xs transition hover:border-gray-300 hover:text-gray-900" onClick={saveSelectedBlock}><BookmarkPlus className="h-4 w-4" /></button>
                    <button type="button" title="Sil (Delete)" className="rounded-md border border-red-200 bg-white p-1.5 text-red-600 shadow-2xs transition hover:bg-red-50 hover:text-red-700" onClick={() => blockAction(selected.id, 'delete')}><Trash2 className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
              <div className="flex border-b">
                <button type="button" className={tabBtn(rightTab === 'content')} onClick={() => setRightTab('content')}>İçerik</button>
                <button type="button" className={tabBtn(rightTab === 'style')} onClick={() => setRightTab('style')}>Stil</button>
                <button type="button" className={tabBtn(rightTab === 'advanced')} onClick={() => setRightTab('advanced')}>Gelişmiş</button>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {rightTab === 'content' && (
                  <>
                    {!translating && (selected.type === 'categories' || selected.type === 'campaigns' || selected.type === 'campaign_card' || selected.type === 'featured_campaign' || Object.values(selectedSpec.fields).some((f) => f.kind === 'campaign' || f.kind === 'campaigns')) && (
                      <div className="flex items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50/70 px-2.5 py-2 text-[11px] text-blue-900">
                        <a
                          href={selected.type === 'categories' ? '/admin/bagis-kalemleri' : '/admin/kampanyalar'}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          {selected.type === 'categories' ? 'Bağış Kalemlerini Yönet ↗' : 'Kampanyaları Yönet ↗'}
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            loadData().then(() => setMessage({ type: 'ok', text: 'Site verileri yenilendi' }))
                          }}
                          className="rounded border border-blue-200 bg-white px-2 py-0.5 font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Yenile
                        </button>
                      </div>
                    )}
                    {Object.keys(selectedSpec.fields).length === 0
                      ? <p className="text-[12px] text-gray-400">Bu bloğun içerik ayarı yok; stil ve gelişmiş ayarları kullanın.{selectedSpec.container ? ' İçine blok eklemek için önizlemedeki “+ Buraya blok ekle”ye tıklayın.' : ''}</p>
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
                      )}
                  </>
                )}
                {rightTab === 'style' && (
                  <>
                    <div className="flex gap-1 rounded-md bg-gray-100 p-1">
                      {(['desktop', 'tablet', 'mobile'] as Device[]).map((d) => {
                        const hasOverride = Object.keys(selected.style?.[d] || {}).length > 0
                        return (
                          <button key={d} type="button" onClick={() => setDevice(d)}
                            className={`flex flex-1 items-center justify-center gap-1 rounded px-1 py-1 text-[11px] font-semibold ${device === d ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
                            <span>{DEVICE_LABEL[d]}</span>
                            {hasOverride && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" title="Bu cihazda özel stil var" />}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {device === 'desktop' ? 'Bilgisayar ayarları tablet ve telefonda da geçerlidir; gerekirse orada ayrıca değiştirin.' : `Yalnızca ${device === 'tablet' ? 'tablet ve telefon' : 'telefon'} görünümünü değiştirir.`}
                    </p>
                    {Object.entries(catalog.style_groups).map(([group, specs]) => {
                      const activeCount = Object.keys(specs).filter((k) => styleValues[k] !== undefined && styleValues[k] !== '').length
                      return (
                        <details key={group} className="rounded-md border" open={group === 'Boşluk & boyut' || group === 'Arka plan'}>
                          <summary className="flex cursor-pointer items-center justify-between px-2.5 py-2 text-[12px] font-bold">
                            <span>{group}</span>
                            {activeCount > 0 && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">{activeCount}</span>}
                          </summary>
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
                      )
                    })}
                    {(Object.keys(styleValues).length > 0 || Object.values(selected.style || {}).some((v) => v && Object.keys(v).length > 0)) && (
                      <div className="flex gap-1.5">
                        {Object.keys(styleValues).length > 0 && (
                          <button type="button" className="flex-1 rounded-md border py-1.5 text-[12px] text-gray-600 hover:bg-gray-50"
                            onClick={() => setSelected((b) => { const style = { ...b.style }; delete style[device]; return { ...b, style } })}>
                            Bu cihazı sıfırla
                          </button>
                        )}
                        <button type="button" className="flex-1 rounded-md border py-1.5 text-[12px] text-red-600 hover:bg-red-50"
                          onClick={() => setSelected((b) => ({ ...b, style: {} }))}>
                          Tüm stilleri sıfırla
                        </button>
                      </div>
                    )}
                  </>
                )}
                {rightTab === 'advanced' && (() => {
                  const adv = selected.advanced || {}
                  const advGroups: [string, string[], boolean][] = [
                    ['Animasyon', ['animation', 'animation_delay', 'animation_duration'], true],
                    ['Görünürlük & Zamanlama', ['hide_desktop', 'hide_tablet', 'hide_mobile', 'starts_at', 'ends_at', 'langs'], true],
                    ['Teknik & Erişilebilirlik', ['anchor', 'aria_label', 'css_class', 'z_index'], false],
                  ]
                  const badDates = !!(adv.starts_at && adv.ends_at && new Date(adv.starts_at) > new Date(adv.ends_at))
                  return (
                    <>
                      {advGroups.map(([group, keys, defaultOpen]) => {
                        const specs = Object.fromEntries(
                          keys
                            .filter((k) => catalog.advanced[k] && (adv.animation || (k !== 'animation_delay' && k !== 'animation_duration')))
                            .map((k) => [k, catalog.advanced[k]])
                        )
                        const activeCount = Object.keys(specs).filter((k) => adv[k] !== undefined && adv[k] !== '' && adv[k] !== false).length
                        return (
                          <details key={group} className="rounded-md border" open={defaultOpen || activeCount > 0}>
                            <summary className="flex cursor-pointer items-center justify-between px-2.5 py-2 text-[12px] font-bold">
                              <span>{group}</span>
                              {activeCount > 0 && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">{activeCount}</span>}
                            </summary>
                            <div className="space-y-2.5 border-t p-2.5">
                              {group === 'Görünürlük & Zamanlama' && badDates && (
                                <p className="rounded bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-700">
                                  Yayın bitiş tarihi, başlangıç tarihinden önce olamaz.
                                </p>
                              )}
                              <Fields
                                specs={specs}
                                values={adv}
                                ctx={{ campaigns: data.campaigns }}
                                onChange={(values) => setSelected((b) => {
                                  const merged = { ...adv }
                                  for (const key of Object.keys(specs)) delete merged[key]
                                  Object.assign(merged, values)
                                  if (!merged.animation) {
                                    delete merged.animation_delay
                                    delete merged.animation_duration
                                  }
                                  return { ...b, advanced: merged }
                                })}
                              />
                            </div>
                          </details>
                        )
                      })}
                      {Object.keys(adv).length > 0 && (
                        <button
                          type="button"
                          className="w-full rounded-md border py-1.5 text-[12px] text-red-600 hover:bg-red-50"
                          onClick={() => setSelected((b) => ({ ...b, advanced: {} }))}
                        >
                          Gelişmiş ayarları sıfırla
                        </button>
                      )}
                    </>
                  )
                })()}
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Narrow-screen pane switcher */}
      <nav aria-label="Düzenleyici panelleri" className="flex flex-none border-t bg-white lg:hidden">
        {([
          ['left', '🧱 Bloklar & Sayfalar'],
          ['canvas', '👁️ Önizleme'],
          ['right', selected ? `⚙️ ${selectedSpec?.label || 'Ayarlar'}` : '⚙️ Ayarlar'],
        ] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setMobilePane(key)}
            className={`flex-1 truncate px-2 py-2.5 text-center text-[12px] font-semibold ${mobilePane === key ? 'bg-blue-50 text-blue-700' : 'text-gray-600'}`}>
            {label}
          </button>
        ))}
      </nav>

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
                {versionsLoading ? (
                  <p className="text-sm text-gray-500">Sürümler yükleniyor…</p>
                ) : versionsError ? (
                  <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{versionsError}</p>
                ) : revisions.length === 0 ? <p className="text-sm text-gray-500">Henüz yayınlanmış sürüm yok.</p> : (
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
            {modal === 'new-page' && (
              <form onSubmit={submitCreatePage} className="space-y-4">
                <h2 className="text-lg font-bold">Yeni sayfa oluştur</h2>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Sayfa adı</label>
                  <input
                    autoFocus
                    required
                    value={newPageTitle}
                    onChange={(e) => setNewPageTitle(e.target.value)}
                    placeholder="ör. Kurban 2027, KVKK Politikası…"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>
                {library && library.pages.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-700">Başlangıç şablonu (opsiyonel)</label>
                    <select
                      value={newPageTemplate}
                      onChange={(e) => setNewPageTemplate(e.target.value)}
                      className="w-full rounded-md border bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Boş sayfa ile başla</option>
                      {library.pages.map((p) => (
                        <option key={p.key} value={p.key}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <input type="checkbox" checked={newPageAddMenu} onChange={(e) => setNewPageAddMenu(e.target.checked)} />
                  Üst menüye de otomatik ekle
                </label>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" disabled={creatingPage} className={smallBtn} onClick={() => setModal(null)}>Vazgeç</button>
                  <button type="submit" disabled={creatingPage || !newPageTitle.trim()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                    {creatingPage ? 'Oluşturuluyor…' : 'Sayfayı oluştur'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {settingsPageId && (
        <PageSettingsModal
          pageId={settingsPageId}
          onClose={() => setSettingsPageId(null)}
          onSaved={() => {
            loadPages().catch(() => undefined)
            if (settingsPageId === pageId) loadPage(pageId).catch(() => undefined)
          }}
          onDeleted={() => {
            loadPages().catch(() => undefined)
            if (settingsPageId === pageId) setPageId('home')
          }}
        />
      )}
    </div>
  )
}
