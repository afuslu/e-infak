'use client'

/**
 * Site builder canvas, loaded in a same-origin iframe by /admin/site-yapici so
 * tablet/phone widths trigger the real responsive rules. The editor sends the
 * block tree; this page draws it with the public renderer and reports clicks,
 * toolbar actions and drag-and-drop moves back. Messages from other origins are ignored.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { brandCssVariables } from '@e-infak/theme'
import { BlockStyles, renderBlock, type RenderOptions } from '../../components/blocks/BlockRenderer'
import type { HomeData } from '../../components/sections/HomeSections'
import { type Block, type BlockSpec, FIXED_CHILD, FIXED_PARENT } from '../../lib/blocks'
import { findBlock } from '../../lib/builder-tree'
import { siteDesignStyle } from '../../lib/site-design'

interface RenderMessage {
  source: 'einfak-builder'
  type: 'render'
  blocks: Block[]
  data: HomeData
  selectedId: string | null
  specs: Record<string, BlockSpec>
  device?: 'desktop' | 'tablet' | 'mobile'
  scale?: number
}

type Drop = { targetId: string; position: 'before' | 'after' | 'inside' | 'left' | 'right'; isFile?: boolean } | null
type CtxMenu = { x: number; y: number; block: Block } | null
type InlineEdit = {
  blockId: string
  label: string
  top: number
  left: number
  fields: { key: string; label: string; type: 'text' | 'textarea' | 'richtext'; value: string }[]
} | null

const TEXT_FIELD_TYPES = new Set(['text', 'textarea', 'richtext'])

function post(message: Record<string, unknown>) {
  window.parent.postMessage({ source: 'einfak-builder-frame', ...message }, window.location.origin)
}

function BlockToolbar({
  depth,
  selected,
  invScale,
  className,
  children,
}: {
  depth: number
  selected: boolean
  invScale: number
  className: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [alignEnd, setAlignEnd] = useState(false)
  const [placeBelow, setPlaceBelow] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const parent = el.offsetParent as HTMLElement | null
    const pRect = parent?.getBoundingClientRect()
    if (!pRect) return
    const w = el.offsetWidth * invScale
    const h = el.offsetHeight * invScale
    setAlignEnd(pRect.left + w > window.innerWidth - 8 && pRect.right - w >= 8)
    setPlaceBelow(depth > 0 ? pRect.top - h < 4 : pRect.top < 4)
  }, [depth, selected, invScale, children])

  const posClass = depth === 0
    ? `${alignEnd ? 'end-0' : 'start-0'} top-0 rounded-b-md`
    : placeBelow
      ? `${alignEnd ? 'end-0' : 'start-0'} top-full rounded-b-md`
      : `${alignEnd ? 'end-0' : 'start-0'} bottom-full rounded-t-md`

  const origin = `${depth > 0 && !placeBelow ? 'bottom' : 'top'} ${alignEnd ? 'right' : 'left'}`

  return (
    <div
      ref={ref}
      style={{
        transform: invScale > 1 ? `scale(${invScale})` : undefined,
        transformOrigin: origin,
      }}
      className={`${className} ${posClass}`}
    >
      {children}
    </div>
  )
}

export default function BuilderCanvas() {
  const [state, setState] = useState<RenderMessage | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [drop, setDrop] = useState<Drop>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null)
  const [inlineEdit, setInlineEdit] = useState<InlineEdit>(null)
  const [focalMode, setFocalMode] = useState<string | null>(null)
  const [liveResize, setLiveResize] = useState<{ id: string; label: string } | null>(null)
  const [snapGuide, setSnapGuide] = useState<{ id: string; x?: number; y?: number } | null>(null)
  const [slashMenu, setSlashMenu] = useState<{ afterId: string | null; query: string } | null>(null)
  const [overlayEdit, setOverlayEdit] = useState<{ blockId: string; index: number; top: number; left: number; item: Record<string, any> } | null>(null)
  const [activeOverlay, setActiveOverlay] = useState<{ blockId: string; index: number } | null>(null)
  const activeOverlayRef = useRef<{ blockId: string; index: number } | null>(null)
  activeOverlayRef.current = activeOverlay
  const blocksRef = useRef<Block[]>([])
  blocksRef.current = state?.blocks || []
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = state?.selectedId ?? null
  const dragId = useRef<string | null>(null)

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return
      const msg = event.data as RenderMessage
      if (msg?.source === 'einfak-builder' && msg.type === 'render') setState(msg)
      if (msg?.source === 'einfak-builder' && (msg as any).type === 'scroll-to') {
        document.querySelector(`[data-block-id="${(msg as any).id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
    window.addEventListener('message', onMessage)
    post({ type: 'ready' })
    // Links and forms inside the canvas must not navigate away from the editor.
    const stop = (e: Event) => {
      const el = (e.target as HTMLElement).closest('a, form button[type=submit]')
      if (el) e.preventDefault()
    }
    const stopSubmit = (e: Event) => e.preventDefault()
    document.addEventListener('click', stop, true)
    document.addEventListener('submit', stopSubmit, true)
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCtxMenu(null)
        setInlineEdit(null)
        setSlashMenu(null)
        setOverlayEdit(null)
        return
      }
      const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')
      if (typing) return
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setSlashMenu({ afterId: selectedIdRef.current, query: '' })
        return
      }
      if (!e.altKey && !e.ctrlKey && !e.metaKey && activeOverlayRef.current && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const ao = activeOverlayRef.current
        const blk = findBlock(blocksRef.current, ao.blockId)
        const item = blk?.props?.overlay_items?.[ao.index]
        if (item) {
          e.preventDefault()
          const step = e.shiftKey ? 5 : 1
          const curX = typeof item.x === 'number' ? item.x : 50
          const curY = typeof item.y === 'number' ? item.y : 50
          const nx = e.key === 'ArrowLeft' ? curX - step : e.key === 'ArrowRight' ? curX + step : curX
          const ny = e.key === 'ArrowUp' ? curY - step : e.key === 'ArrowDown' ? curY + step : curY
          post({
            type: 'move-overlay-item',
            id: ao.blockId,
            index: ao.index,
            x: Math.max(2, Math.min(98, nx)),
            y: Math.max(2, Math.min(98, ny)),
          })
          return
        }
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        post({ type: 'key', key: e.key, alt: true, ctrl: false, shift: e.shiftKey })
        return
      }
      if ((e.ctrlKey || e.metaKey) || e.key === 'Delete' || e.key === 'Backspace') {
        post({ type: 'key', key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })
        if ((e.ctrlKey || e.metaKey) && ['z', 'y', 'c', 'v', 'd', 's'].includes(e.key.toLowerCase())) e.preventDefault()
      }
    }
    const closeCtx = () => setCtxMenu(null)
    window.addEventListener('keydown', keys)
    window.addEventListener('click', closeCtx)
    return () => {
      window.removeEventListener('message', onMessage)
      document.removeEventListener('click', stop, true)
      document.removeEventListener('submit', stopSubmit, true)
      window.removeEventListener('keydown', keys)
      window.removeEventListener('click', closeCtx)
    }
  }, [])

  const onDragOver = useCallback((e: React.DragEvent, block: Block, container: boolean) => {
    const isFile = e.dataTransfer.types.includes('Files')
    const isMedia = e.dataTransfer.types.includes('application/x-media-url')
    const isNew = e.dataTransfer.types.includes('application/x-new-block') || e.dataTransfer.types.includes('application/x-new-blocks')
    if ((!dragId.current && !isNew && !isFile && !isMedia) || dragId.current === block.id) return
    e.preventDefault()
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = (e.clientX - rect.left) / Math.max(1, rect.width)
    const y = (e.clientY - rect.top) / Math.max(1, rect.height)
    if (isFile || isMedia) {
      const position = y < 0.2 ? 'before' : y > 0.8 ? 'after' : 'inside'
      setDrop((d) => (d?.targetId === block.id && d.position === position && d.isFile ? d : { targetId: block.id, position, isFile: true }))
      return
    }
    const allowSide = !FIXED_CHILD.has(block.type) && !FIXED_PARENT.has(block.type) && block.type !== 'header_row' && block.type !== 'announcement_bar'
    let position: 'before' | 'after' | 'inside' | 'left' | 'right'
    if (allowSide && x < 0.16) position = 'left'
    else if (allowSide && x > 0.84) position = 'right'
    else if (FIXED_CHILD.has(block.type) || (container && !FIXED_PARENT.has(block.type) && y > 0.25 && y < 0.75)) position = 'inside'
    else position = y < 0.5 ? 'before' : 'after'
    setDrop((d) => (d?.targetId === block.id && d.position === position && !d.isFile ? d : { targetId: block.id, position }))
  }, [])

  if (!state) return <div className="p-10 text-center text-sm text-gray-400">Önizleme yükleniyor…</div>

  const device = state.device || 'desktop'
  const locale = state.data?.locale || 'tr'
  const invScale = state.scale && state.scale < 1 ? Math.min(2.2, 1 / state.scale) : 1

  const getTextFields = (block: Block, spec?: BlockSpec) => {
    if (!spec?.fields) return []
    const vals = locale !== 'tr'
      ? { ...(block.props || {}), ...(block.translations?.[locale] || {}) }
      : (block.props || {})
    return Object.entries(spec.fields)
      .filter(([, f]) => TEXT_FIELD_TYPES.has(f.kind))
      .slice(0, 6)
      .map(([key, f]) => ({
        key,
        label: f.label,
        type: f.kind as 'text' | 'textarea' | 'richtext',
        value: String(vals[key] ?? ''),
      }))
  }

  const openInlineEdit = (block: Block, el: HTMLElement | null) => {
    const spec = state.specs[block.type]
    const fields = getTextFields(block, spec)
    if (!fields.length) return
    const rect = el?.getBoundingClientRect()
    const top = Math.max(12, Math.min(window.innerHeight - 260, (rect?.top ?? 80) + 28))
    const left = Math.max(12, Math.min(window.innerWidth - 360, rect?.left ?? 40))
    setInlineEdit({ blockId: block.id, label: spec?.label || block.type, top, left, fields })
  }

  const startOverlayDrag = (e: React.PointerEvent, block: Block, idx: number) => {
    e.preventDefault()
    e.stopPropagation()
    const itemEl = e.currentTarget as HTMLElement
    const container = itemEl.closest('[data-block-id]') as HTMLElement | null
    if (!container) return
    const rect = container.getBoundingClientRect()
    const snapVal = (v: number) => {
      for (const target of [10, 50, 90]) if (Math.abs(v - target) <= 2.5) return { v: target, snapped: target }
      return { v, snapped: undefined }
    }
    const calc = (ev: PointerEvent) => {
      const rx = Math.round(Math.max(2, Math.min(98, ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 100)))
      const ry = Math.round(Math.max(2, Math.min(98, ((ev.clientY - rect.top) / Math.max(1, rect.height)) * 100)))
      const sx = snapVal(rx)
      const sy = snapVal(ry)
      return { x: sx.v, y: sy.v, gx: sx.snapped, gy: sy.snapped }
    }
    let latest = calc(e.nativeEvent)
    const onMove = (ev: PointerEvent) => {
      latest = calc(ev)
      itemEl.style.left = `${latest.x}%`
      itemEl.style.top = `${latest.y}%`
      setSnapGuide(latest.gx !== undefined || latest.gy !== undefined ? { id: block.id, x: latest.gx, y: latest.gy } : null)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setSnapGuide(null)
      post({ type: 'move-overlay-item', id: block.id, index: idx, x: latest.x, y: latest.y })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startOverlayResize = (e: React.PointerEvent, block: Block, idx: number) => {
    e.preventDefault()
    e.stopPropagation()
    const itemEl = (e.currentTarget as HTMLElement).closest('[data-overlay-idx]') as HTMLElement | null
    const imgEl = itemEl?.querySelector('img') as HTMLImageElement | null
    const startX = e.clientX
    const baseW = Number(block.props?.overlay_items?.[idx]?.width || imgEl?.getBoundingClientRect().width || 120)
    let latest = Math.max(24, Math.min(400, Math.round(baseW)))
    const onMove = (ev: PointerEvent) => {
      latest = Math.max(24, Math.min(400, Math.round(baseW + (ev.clientX - startX))))
      if (imgEl) imgEl.style.width = `${latest}px`
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      post({ type: 'resize-overlay-item', id: block.id, index: idx, width: latest })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startTopResize = (e: React.PointerEvent, block: Block) => {
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const baseVal = Number(block.style?.[device]?.padding_top ?? 0)
    const clamp = (v: number) => Math.max(0, Math.min(400, Math.round(v)))
    let latest = clamp(baseVal)
    setLiveResize({ id: block.id, label: `Üst boşluk: ${latest}px` })
    const onMove = (ev: PointerEvent) => {
      latest = clamp(baseVal + (ev.clientY - startY))
      setLiveResize({ id: block.id, label: `Üst boşluk: ${latest}px` })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setLiveResize(null)
      post({ type: 'resize-block', id: block.id, device, styleProp: 'padding_top', value: latest })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startFocalDrag = (e: React.PointerEvent, block: Block) => {
    e.preventDefault()
    e.stopPropagation()
    const container = e.currentTarget as HTMLElement
    const rect = container.getBoundingClientRect()
    const calc = (ev: PointerEvent) => ({
      x: Math.round(Math.max(0, Math.min(100, ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 100))),
      y: Math.round(Math.max(0, Math.min(100, ((ev.clientY - rect.top) / Math.max(1, rect.height)) * 100))),
    })
    let latest = calc(e.nativeEvent)
    post({ type: 'set-focal-point', id: block.id, x: latest.x, y: latest.y })
    const onMove = (ev: PointerEvent) => {
      latest = calc(ev)
      post({ type: 'set-focal-point', id: block.id, x: latest.x, y: latest.y })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setFocalMode(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startResize = (e: React.PointerEvent, block: Block) => {
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const isImage = block.type === 'image'
    const baseVal = isImage
      ? Number(block.props?.height_px || (e.currentTarget.closest('[data-block-id]')?.getBoundingClientRect().height ?? 320))
      : Number(block.style?.[device]?.padding_bottom ?? 0)
    const clamp = (v: number) => (isImage ? Math.max(80, Math.min(1200, Math.round(v))) : Math.max(0, Math.min(400, Math.round(v))))
    let latest = clamp(baseVal)
    setLiveResize({ id: block.id, label: `${isImage ? 'Yükseklik' : 'Alt boşluk'}: ${latest}px` })
    const onMove = (ev: PointerEvent) => {
      latest = clamp(baseVal + (ev.clientY - startY))
      setLiveResize({ id: block.id, label: `${isImage ? 'Yükseklik' : 'Alt boşluk'}: ${latest}px` })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setLiveResize(null)
      post({
        type: 'resize-block',
        id: block.id,
        device,
        ...(isImage ? { prop: 'height_px', value: latest } : { styleProp: 'padding_bottom', value: latest }),
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startColumnRatioDrag = (e: React.PointerEvent, block: Block) => {
    e.preventDefault()
    e.stopPropagation()
    const container = (e.currentTarget as HTMLElement).closest('[data-block-id]') as HTMLElement | null
    if (!container) return
    const rect = container.getBoundingClientRect()
    const snaps: [number, string][] = [
      [0.25, '1-3'],
      [0.333, '1-2'],
      [0.4, '2-3'],
      [0.5, '1-1'],
      [0.6, '3-2'],
      [0.667, '2-1'],
      [0.75, '3-1'],
    ]
    const pick = (clientX: number) => {
      const pct = Math.max(0.2, Math.min(0.8, (clientX - rect.left) / Math.max(1, rect.width)))
      let best = snaps[3]
      for (const s of snaps) if (Math.abs(s[0] - pct) < Math.abs(best[0] - pct)) best = s
      return best
    }
    let latest = pick(e.clientX)
    setLiveResize({ id: block.id, label: `Sütun oranı: ${latest[1].replace('-', ' : ')}` })
    const onMove = (ev: PointerEvent) => {
      latest = pick(ev.clientX)
      setLiveResize({ id: block.id, label: `Sütun oranı: ${latest[1].replace('-', ' : ')}` })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setLiveResize(null)
      post({ type: 'set-columns-ratio', id: block.id, ratio: latest[1] })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const wrap = (block: Block, node: ReactNode, depth: number) => {
    const spec = state.specs[block.type]
    const selected = state.selectedId === block.id
    const isHover = hovered === block.id && !selected
    const isColumn = FIXED_CHILD.has(block.type)
    const dropHere = drop?.targetId === block.id ? drop.position : null
    const hasTextFields = getTextFields(block, spec).length > 0
    const hasImageField = Object.values(spec?.fields || {}).some((f) => f.kind === 'image')
    const supportsOverlay = block.type === 'hero' || block.type === 'image'
    const isFocalActive = focalMode === block.id
    const variantFieldKey = spec?.fields?.variant?.choices ? 'variant' : spec?.fields?.look?.choices ? 'look' : null
    const variantKeys = variantFieldKey ? Object.keys(spec!.fields[variantFieldKey].choices || {}) : []
    return (
      <div key={block.id} data-block-id={block.id}
        className={`group/blk relative ${block.type === 'column' ? 'min-h-[60px]' : block.type === 'header_slot' ? 'min-h-[40px] min-w-[48px]' : ''}`}
        style={{ outline: selected ? '2px solid #2563eb' : isHover ? '1px dashed #60a5fa' : undefined, outlineOffset: -2 }}
        draggable={!isColumn && !inlineEdit && !isFocalActive}
        onDragStart={(e) => {
          if ((e.target as HTMLElement).closest('[data-overlay-idx], [data-overlay-resize], [data-overlay-remove]')) {
            e.preventDefault(); e.stopPropagation(); return
          }
          e.stopPropagation(); dragId.current = block.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', block.id)
        }}
        onDragEnd={() => { dragId.current = null; setDrop(null) }}
        onDragOver={(e) => onDragOver(e, block, !!spec?.container)}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation()
          const file = e.dataTransfer.files?.[0]
          if (file && file.type.startsWith('image/')) {
            post({ type: 'drop-image-file', file, targetId: block.id, position: drop?.position || 'inside' })
            dragId.current = null; setDrop(null)
            return
          }
          const mediaUrl = e.dataTransfer.getData('application/x-media-url')
          if (mediaUrl) {
            const mediaAlt = e.dataTransfer.getData('application/x-media-alt') || ''
            post({ type: 'drop-media-url', url: mediaUrl, alt: mediaAlt, targetId: block.id, position: drop?.position || 'inside' })
            dragId.current = null; setDrop(null)
            return
          }
          const newType = e.dataTransfer.getData('application/x-new-block')
          const newBlocksRaw = e.dataTransfer.getData('application/x-new-blocks')
          if (newBlocksRaw && drop) {
            try {
              const blocks = JSON.parse(newBlocksRaw)
              if (Array.isArray(blocks) && blocks.length) post({ type: 'insert-new-blocks', blocks, targetId: drop.targetId, position: drop.position })
            } catch { /* ignore invalid drag payload */ }
          } else if (newType && drop) post({ type: 'insert-new', blockType: newType, targetId: drop.targetId, position: drop.position })
          else if (dragId.current && drop) post({ type: 'move', id: dragId.current, targetId: drop.targetId, position: drop.position })
          dragId.current = null; setDrop(null)
        }}
        onPointerDownCapture={(e) => {
          const removeBtn = (e.target as HTMLElement).closest('[data-overlay-remove]') as HTMLElement | null
          if (removeBtn) {
            e.preventDefault(); e.stopPropagation()
            const idx = Number(removeBtn.dataset.overlayRemove)
            if (Number.isFinite(idx)) post({ type: 'remove-overlay-item', id: block.id, index: idx })
            return
          }
          const resizeEl = (e.target as HTMLElement).closest('[data-overlay-resize]') as HTMLElement | null
          if (resizeEl) {
            const idx = Number(resizeEl.dataset.overlayResize)
            if (Number.isFinite(idx)) startOverlayResize({ ...e, currentTarget: resizeEl } as unknown as React.PointerEvent, block, idx)
            return
          }
          const target = (e.target as HTMLElement).closest('[data-overlay-idx]') as HTMLElement | null
          if (!target) {
            setActiveOverlay(null)
            return
          }
          const idx = Number(target.dataset.overlayIdx)
          if (Number.isFinite(idx)) {
            setActiveOverlay({ blockId: block.id, index: idx })
            startOverlayDrag({ ...e, currentTarget: target } as unknown as React.PointerEvent, block, idx)
          }
        }}
        onMouseOver={(e) => { e.stopPropagation(); setHovered(block.id) }}
        onClick={(e) => { e.stopPropagation(); setCtxMenu(null); post({ type: 'select', id: block.id }) }}
        onDoubleClick={(e) => {
          const ov = (e.target as HTMLElement).closest('[data-overlay-idx]') as HTMLElement | null
          if (ov) {
            e.stopPropagation()
            const idx = Number(ov.dataset.overlayIdx)
            const item = Array.isArray(block.props?.overlay_items) ? block.props.overlay_items[idx] : null
            if (Number.isFinite(idx) && item) {
              const rect = ov.getBoundingClientRect()
              setOverlayEdit({
                blockId: block.id,
                index: idx,
                top: Math.max(12, Math.min(window.innerHeight - 280, rect.bottom + 8)),
                left: Math.max(12, Math.min(window.innerWidth - 300, rect.left)),
                item: { ...item },
              })
              post({ type: 'select', id: block.id })
              return
            }
          }
          if (!hasTextFields) return
          e.stopPropagation()
          post({ type: 'select', id: block.id })
          // Direct inline contentEditable if double-clicked element matches a text/textarea field
          const fields = getTextFields(block, spec).filter((f) => f.type === 'text' || f.type === 'textarea')
          const clickedEl = (e.target as HTMLElement).closest('h1, h2, h3, h4, h5, h6, p, span, figcaption, blockquote, a, button') as HTMLElement | null
          const clickedText = clickedEl?.innerText?.trim()
          const matched = clickedEl && clickedText
            ? fields.find((f) => f.value.trim() === clickedText)
            : fields.length === 1 && clickedEl
              ? fields[0]
              : undefined
          if (clickedEl && matched) {
            const origOutline = clickedEl.style.outline
            clickedEl.contentEditable = 'true'
            clickedEl.style.outline = '2px dashed #2563eb'
            clickedEl.style.outlineOffset = '2px'
            clickedEl.focus()
            const commitInline = () => {
              const nextVal = clickedEl.innerText.replace(/\n$/, '')
              if (nextVal !== matched.value) post({ type: 'patch-settings', id: block.id, patch: { [matched.key]: nextVal } })
            }
            const onKeyDown = (ev: KeyboardEvent) => {
              if (ev.key === 'Escape' || (matched.type === 'text' && ev.key === 'Enter')) {
                ev.preventDefault()
                clickedEl.blur()
              }
            }
            const onBlur = () => {
              clickedEl.contentEditable = 'false'
              clickedEl.style.outline = origOutline
              clickedEl.removeEventListener('keydown', onKeyDown)
              clickedEl.removeEventListener('blur', onBlur)
              commitInline()
            }
            clickedEl.addEventListener('keydown', onKeyDown)
            clickedEl.addEventListener('blur', onBlur)
            return
          }
          openInlineEdit(block, e.currentTarget)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          post({ type: 'select', id: block.id })
          setCtxMenu({
            x: Math.max(8, Math.min(window.innerWidth - 220, e.clientX)),
            y: Math.max(8, Math.min(window.innerHeight - 280, e.clientY)),
            block,
          })
        }}>
        {dropHere === 'before' && <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-1 bg-blue-500" />}
        {dropHere === 'after' && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-1 bg-blue-500" />}
        {dropHere === 'left' && (
          <div className="pointer-events-none absolute inset-y-0 start-0 z-30 flex w-1.5 items-center bg-blue-500">
            <span className="ms-2 whitespace-nowrap rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">Soluna ekle</span>
          </div>
        )}
        {dropHere === 'right' && (
          <div className="pointer-events-none absolute inset-y-0 end-0 z-30 flex w-1.5 items-center justify-end bg-blue-500">
            <span className="me-2 whitespace-nowrap rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">Sağına ekle</span>
          </div>
        )}
        {dropHere === 'inside' && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-blue-500/10 ring-2 ring-inset ring-blue-500">
            {drop?.isFile && <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow">Görseli buraya bırakın</span>}
          </div>
        )}
        {(selected || isHover) && (
          <BlockToolbar
            depth={depth}
            selected={selected}
            invScale={invScale}
            className={`absolute z-40 flex w-max items-center gap-0.5 whitespace-nowrap text-[12px] font-semibold text-white shadow-md ${selected ? 'bg-blue-600' : 'bg-blue-500'}`}
          >
            <span className="cursor-grab px-2.5 py-1">{spec?.icon} {spec?.label || block.type}</span>
            {selected && hasTextFields && (
              <button type="button" title="Metni tuvalde düzenle (Çift tık)" className="px-2 py-1 hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); openInlineEdit(block, (e.currentTarget as HTMLElement).closest('[data-block-id]') as HTMLElement) }}>
                ✏️
              </button>
            )}
            {selected && hasImageField && (
              <button type="button" title="Görseli değiştir" className="px-2 py-1 hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); post({ type: 'focus-image', id: block.id }) }}>
                🖼️
              </button>
            )}
            {selected && supportsOverlay && (
              <>
                <button type="button" title="Görsel odak noktasını sürükleyerek seç"
                  className={`px-2 py-1 hover:bg-white/20 ${isFocalActive ? 'bg-amber-400 text-amber-950' : ''}`}
                  onClick={(e) => { e.stopPropagation(); setFocalMode(isFocalActive ? null : block.id) }}>
                  🎯 Odak
                </button>
                <button type="button" title="Üzerine sürüklenebilir serbest buton ekle"
                  className="px-2 py-1 hover:bg-white/20"
                  onClick={(e) => { e.stopPropagation(); post({ type: 'add-overlay-item', id: block.id, kind: 'button' }) }}>
                  + Buton
                </button>
              </>
            )}
            {selected && (block.type === 'columns' || block.type === 'image_text') && (
              <button type="button" title="Sütunların / görselin yerini değiştir (Sol ↔ Sağ)"
                className="px-2 py-1 hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); post({ type: 'swap-columns', id: block.id }) }}>
                ⇄
              </button>
            )}
            {selected && variantFieldKey && variantKeys.length >= 2 && (
              <button
                type="button"
                title="Sonraki görünüme geç"
                className="px-2 py-1 hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation()
                  const cur = String(block.props?.[variantFieldKey] ?? spec?.fields?.[variantFieldKey]?.default ?? variantKeys[0])
                  const idx = variantKeys.indexOf(cur)
                  const nextKey = variantKeys[(idx + 1) % variantKeys.length]
                  post({ type: 'patch-settings', id: block.id, patch: { [variantFieldKey]: nextKey } })
                }}
              >
                ✨
              </button>
            )}
        {selected && !isColumn && (
              <>
                <span className="mx-0.5 flex items-center gap-1 border-s border-white/25 ps-1.5" title="Hızlı arka plan">
                  {[
                    { bg: '', tc: '', cls: 'bg-white', title: 'Varsayılan / Beyaz' },
                    { bg: '#F8FAFC', tc: '#0F172A', cls: 'bg-slate-200', title: 'Yumuşak gri' },
                    { bg: '#0F172A', tc: '#FFFFFF', cls: 'bg-slate-900', title: 'Koyu zemin' },
                    { bg: state.data.site?.primary_color || '#0F766E', tc: '#FFFFFF', cls: 'bg-emerald-600', title: 'Marka rengi' },
                  ].map((sw, idx) => (
                    <button
                      key={idx}
                      type="button"
                      title={sw.title}
                      style={idx === 3 && state.data.site?.primary_color ? { backgroundColor: state.data.site.primary_color } : undefined}
                      onClick={(e) => { e.stopPropagation(); post({ type: 'quick-bg', id: block.id, device, bg: sw.bg, textColor: sw.tc }) }}
                      className={`h-3 w-3 rounded-full ring-1 ring-white/80 transition hover:scale-125 ${sw.cls}`}
                    />
                  ))}
                </span>
                {[['↑', 'up', 'Yukarı'], ['↓', 'down', 'Aşağı'], ['⧉', 'duplicate', 'Çoğalt'], ['🗑', 'delete', 'Sil']].map(([glyph, action, title]) => (
                  <button key={action} type="button" title={title} className={`px-2 py-1 hover:bg-white/20 ${action === 'delete' ? 'hover:bg-red-500' : ''}`}
                    onClick={(e) => { e.stopPropagation(); post({ type: 'action', id: block.id, action }) }}>{glyph}</button>
                ))}
              </>
            )}
          </BlockToolbar>
        )}
        {isFocalActive && (
          <div
            onPointerDown={(e) => startFocalDrag(e, block)}
            className="absolute inset-0 z-30 cursor-crosshair bg-black/25 backdrop-blur-[1px]"
          >
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
              <span className="rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold text-amber-950 shadow">
                Odak noktasını seçmek için tıklayın veya sürükleyin
              </span>
            </div>
            <div
              className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-400 shadow-lg"
              style={{ left: `${block.props?.focal_x ?? 50}%`, top: `${block.props?.focal_y ?? 50}%` }}
            />
          </div>
        )}
        {selected && block.type === 'columns' && (block.children?.length || 0) === 2 && (() => {
          const parts = String(block.props?.ratio || '1-1').split('-').map(Number)
          const leftPct = parts.length === 2 && parts[0] > 0 && parts[1] > 0 ? (parts[0] / (parts[0] + parts[1])) * 100 : 50
          return (
            <div
              onPointerDown={(e) => startColumnRatioDrag(e, block)}
              style={{ left: `${leftPct}%` }}
              title="Sütun oranını sürükleyerek ayarla"
              className="absolute inset-y-2 z-40 flex -translate-x-1/2 cursor-ew-resize items-center justify-center px-1 opacity-75 hover:opacity-100"
            >
              <span className="flex h-8 w-3 items-center justify-center rounded-full border border-blue-600 bg-white text-[9px] font-bold text-blue-600 shadow">
                ⋮
              </span>
            </div>
          )
        })()}
        {snapGuide?.id === block.id && (
          <>
            {snapGuide.x !== undefined && (
              <div className="pointer-events-none absolute inset-y-0 z-30 border-l border-dashed border-amber-400" style={{ left: `${snapGuide.x}%` }} />
            )}
            {snapGuide.y !== undefined && (
              <div className="pointer-events-none absolute inset-x-0 z-30 border-t border-dashed border-amber-400" style={{ top: `${snapGuide.y}%` }} />
            )}
          </>
        )}
        {!selected && isHover && !isColumn && (
          <div className="pointer-events-none absolute inset-x-0 -bottom-2.5 z-40 flex items-center justify-center">
            <button
              type="button"
              title="Buraya blok ekle"
              onClick={(e) => { e.stopPropagation(); setSlashMenu({ afterId: block.id, query: '' }) }}
              className="pointer-events-auto flex h-5 w-5 items-center justify-center rounded-full border border-blue-500 bg-white text-xs font-bold text-blue-600 shadow transition hover:scale-110 hover:bg-blue-600 hover:text-white"
            >
              +
            </button>
          </div>
        )}
        {selected && !isColumn && (
          <>
            <div
              onPointerDown={(e) => startTopResize(e, block)}
              title="Üst boşluğu sürükleyerek ayarla"
              className="absolute inset-x-0 -top-1.5 z-40 flex cursor-ns-resize items-center justify-center opacity-70 hover:opacity-100"
            >
              <span className="rounded-full border border-blue-600 bg-white px-2 py-0 text-[9px] font-bold text-blue-600 shadow">
                ⋯
              </span>
            </div>
            <div
              onPointerDown={(e) => startResize(e, block)}
              title={block.type === 'image' ? 'Görsel yüksekliğini sürükleyerek ayarla' : 'Alt boşluğu sürükleyerek ayarla'}
              className="absolute inset-x-0 -bottom-1.5 z-40 flex cursor-ns-resize items-center justify-center opacity-80 hover:opacity-100"
            >
              <span className="rounded-full border border-blue-600 bg-white px-2.5 py-0.5 text-[10px] font-bold text-blue-600 shadow">
                {liveResize?.id === block.id ? liveResize.label : '⋯ ↕'}
              </span>
            </div>
          </>
        )}
        {(block.advanced?.hide_desktop || block.advanced?.hide_tablet || block.advanced?.hide_mobile || block.advanced?.starts_at || block.advanced?.ends_at || block.advanced?.langs) && (
          <div
            style={{
              transform: invScale > 1 ? `scale(${invScale})` : undefined,
              transformOrigin: 'top right',
            }}
            className="pointer-events-none absolute end-1 top-1 z-30 rounded bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950 shadow-xs"
          >
            {[
              block.advanced?.hide_desktop && 'bilgisayarda gizli',
              block.advanced?.hide_tablet && 'tablette gizli',
              block.advanced?.hide_mobile && 'telefonda gizli',
              (block.advanced?.starts_at || block.advanced?.ends_at) && 'tarihli',
              block.advanced?.langs && `yalnız ${block.advanced.langs}`,
            ].filter(Boolean).join(' · ')}
          </div>
        )}
        {node}
        {depth === 0 && !isColumn && (isHover || selected) && (
          <div
            style={{ transform: invScale > 1 ? `scale(${invScale})` : undefined }}
            className="pointer-events-none absolute inset-x-0 -bottom-3 z-40 flex items-center justify-center"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); post({ type: 'insert-after', targetId: block.id }) }}
              className="pointer-events-auto rounded-full bg-blue-600 px-4 py-1 text-[12px] font-bold text-white shadow-md transition hover:scale-110 hover:bg-blue-700"
            >
              + Bölüm Ekle
            </button>
          </div>
        )}
      </div>
    )
  }

  const options: RenderOptions = {
    data: state.data,
    editing: true,
    wrap,
    // Children go through the same renderer, so nested blocks get the selection frame too.
    renderChildren: (parent, children, depth) => (
      <>
        {children.map((child) => renderBlock(child, options, depth))}
        {parent.type === 'header_slot' && (
          <button type="button" title="Bu alana öğe ekle" onClick={(e) => { e.stopPropagation(); post({ type: 'add-into', parentId: parent.id }) }}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-md border-2 border-dashed border-blue-400 text-base font-bold text-blue-600 transition hover:scale-110 hover:bg-blue-50">
            +
          </button>
        )}
        {!FIXED_PARENT.has(parent.type) && parent.type !== 'header_slot' && (
          <button type="button" onClick={(e) => { e.stopPropagation(); post({ type: 'add-into', parentId: parent.id }) }}
            className="my-2 flex w-full items-center justify-center rounded-lg border-2 border-dashed border-blue-400 py-4 text-base font-bold text-blue-600 transition hover:bg-blue-50">
            + Buraya blok ekle
          </button>
        )}
      </>
    ),
  }

  const rootStyle = {
    ...(state.data.site?.primary_color
      ? (brandCssVariables(state.data.site.primary_color, state.data.site.accent_color || '#C9A227') as React.CSSProperties)
      : {}),
    ...siteDesignStyle(state.data.site?.design),
  }

  return (
    <div onMouseLeave={() => setHovered(null)} className="site-design min-h-screen pb-24 font-sans" style={rootStyle}>
      {state.blocks.length === 0 && (
        <div
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-new-block') || e.dataTransfer.types.includes('application/x-new-blocks') || e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-media-url')) e.preventDefault()
          }}
          onDrop={(e) => {
            const file = e.dataTransfer.files?.[0]
            if (file && file.type.startsWith('image/')) {
              e.preventDefault()
              post({ type: 'drop-image-file', file, targetId: '', position: 'after' })
              return
            }
            const mediaUrl = e.dataTransfer.getData('application/x-media-url')
            if (mediaUrl) {
              e.preventDefault()
              post({ type: 'drop-media-url', url: mediaUrl, alt: e.dataTransfer.getData('application/x-media-alt') || '', targetId: '', position: 'after' })
              return
            }
            const newType = e.dataTransfer.getData('application/x-new-block')
            const newBlocksRaw = e.dataTransfer.getData('application/x-new-blocks')
            if (newBlocksRaw) {
              try {
                const blocks = JSON.parse(newBlocksRaw)
                if (Array.isArray(blocks) && blocks.length) {
                  e.preventDefault()
                  post({ type: 'insert-new-blocks', blocks, targetId: '', position: 'after' })
                }
              } catch { /* ignore */ }
              return
            }
            if (!newType) return
            e.preventDefault()
            post({ type: 'insert-new', blockType: newType, targetId: '', position: 'after' })
          }}
          className="m-10 rounded-2xl border-2 border-dashed p-16 text-center text-gray-400"
        >
          Sayfa boş. Soldaki “Ekle” panelinden blok ekleyin veya buraya görsel / blok sürükleyin.
        </div>
      )}
      <BlockStyles blocks={state.blocks} editing />
      {state.blocks.map((b) => renderBlock(b, options))}

      {ctxMenu && (() => {
        const b = ctxMenu.block
        const isCol = FIXED_CHILD.has(b.type)
        const hasText = getTextFields(b, state.specs[b.type]).length > 0
        const hasImage = Object.values(state.specs[b.type]?.fields || {}).some((f) => f.kind === 'image')
        const hideKey = device === 'desktop' ? 'hide_desktop' : device === 'tablet' ? 'hide_tablet' : 'hide_mobile'
        const isHiddenOnDevice = Boolean(b.advanced?.[hideKey])
        const deviceName = device === 'desktop' ? 'Bilgisayarda' : device === 'tablet' ? 'Tablette' : 'Telefonda'
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
            className="fixed z-50 w-56 rounded-xl border border-gray-200/80 bg-white/95 py-1.5 text-[12px] font-medium text-gray-800 shadow-2xl ring-1 ring-black/5 backdrop-blur-md"
          >
            {hasText && (
              <button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-blue-50 hover:text-blue-700"
                onClick={() => {
                  const el = document.querySelector(`[data-block-id="${b.id}"]`) as HTMLElement | null
                  openInlineEdit(b, el)
                  setCtxMenu(null)
                }}>
                <span className="flex items-center gap-2"><span>✏️</span><span>Metni Düzenle</span></span>
                <span className="text-[10px] text-gray-400">Çift tık</span>
              </button>
            )}
            {hasImage && (
              <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-blue-50 hover:text-blue-700"
                onClick={() => {
                  post({ type: 'focus-image', id: b.id })
                  setCtxMenu(null)
                }}>
                <span>🖼️</span><span>Görseli Değiştir</span>
              </button>
            )}
            {!isCol && (
              <>
                <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100"
                  onClick={() => { post({ type: 'action', id: b.id, action: 'up' }); setCtxMenu(null) }}>
                  <span>↑</span><span>Yukarı Taşı</span>
                </button>
                <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100"
                  onClick={() => { post({ type: 'action', id: b.id, action: 'down' }); setCtxMenu(null) }}>
                  <span>↓</span><span>Aşağı Taşı</span>
                </button>
                <button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-gray-100"
                  onClick={() => { post({ type: 'action', id: b.id, action: 'duplicate' }); setCtxMenu(null) }}>
                  <span className="flex items-center gap-2"><span>⧉</span><span>Çoğalt</span></span>
                  <span className="text-[10px] text-gray-400">Ctrl+D</span>
                </button>
                <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100"
                  onClick={() => { post({ type: 'copy-style', id: b.id }); setCtxMenu(null) }}>
                  <span>🎨</span><span>Stili Kopyala</span>
                </button>
                <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100"
                  onClick={() => { post({ type: 'paste-style', id: b.id }); setCtxMenu(null) }}>
                  <span>🖌️</span><span>Stili Yapıştır</span>
                </button>
                <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100"
                  onClick={() => { post({ type: 'save-block', id: b.id }); setCtxMenu(null) }}>
                  <span>⭐</span><span>Bölüm Olarak Kaydet</span>
                </button>
                <button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-gray-100"
                  onClick={() => { post({ type: 'action', id: b.id, action: 'copy' }); setCtxMenu(null) }}>
                  <span className="flex items-center gap-2"><span>📋</span><span>Kopyala</span></span>
                  <span className="text-[10px] text-gray-400">Ctrl+C</span>
                </button>
              </>
            )}
            <button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-gray-100"
              onClick={() => { post({ type: 'action', id: b.id, action: 'paste' }); setCtxMenu(null) }}>
              <span className="flex items-center gap-2"><span>📥</span><span>Yapıştır</span></span>
              <span className="text-[10px] text-gray-400">Ctrl+V</span>
            </button>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100"
              onClick={() => { post({ type: 'toggle-hide', id: b.id, device }); setCtxMenu(null) }}>
              <span>👁️</span><span>{isHiddenOnDevice ? `${deviceName} Göster` : `${deviceName} Gizle`}</span>
            </button>
            {!isCol && (
              <>
                <div className="my-1 border-t border-gray-100" />
                <button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
                  onClick={() => { post({ type: 'action', id: b.id, action: 'delete' }); setCtxMenu(null) }}>
                  <span className="flex items-center gap-2"><span>🗑</span><span>Sil</span></span>
                  <span className="text-[10px] text-red-400">Del</span>
                </button>
              </>
            )}
          </div>
        )
      })()}

      {inlineEdit && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ top: inlineEdit.top, left: inlineEdit.left }}
          className="fixed z-50 w-80 max-w-[calc(100vw-24px)] rounded-xl border border-blue-200 bg-white p-3 text-xs shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between border-b pb-1.5">
            <span className="font-bold text-gray-800">✏️ {inlineEdit.label}</span>
            <button type="button" onClick={() => setInlineEdit(null)} className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50">
              Tamam
            </button>
          </div>
          <div className="space-y-2">
            {inlineEdit.fields.map((f, idx) => (
              <label key={f.key} className="block space-y-1">
                <span className="block text-[11px] font-semibold text-gray-500">{f.label}</span>
                {f.type === 'text' ? (
                  <input
                    autoFocus={idx === 0}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-blue-500"
                    value={f.value}
                    onChange={(e) => {
                      const val = e.target.value
                      setInlineEdit((prev) => prev ? {
                        ...prev,
                        fields: prev.fields.map((item) => item.key === f.key ? { ...item, value: val } : item),
                      } : null)
                      post({ type: 'patch-settings', id: inlineEdit.blockId, patch: { [f.key]: val } })
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') setInlineEdit(null) }}
                  />
                ) : (
                  <textarea
                    autoFocus={idx === 0}
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-blue-500"
                    value={f.value}
                    onChange={(e) => {
                      const val = e.target.value
                      setInlineEdit((prev) => prev ? {
                        ...prev,
                        fields: prev.fields.map((item) => item.key === f.key ? { ...item, value: val } : item),
                      } : null)
                      post({ type: 'patch-settings', id: inlineEdit.blockId, patch: { [f.key]: val } })
                    }}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      )}
      {overlayEdit && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ top: overlayEdit.top, left: overlayEdit.left }}
          className="fixed z-50 w-72 max-w-[calc(100vw-24px)] rounded-xl border border-blue-200 bg-white p-3 text-xs shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between border-b pb-1.5">
            <span className="font-bold text-gray-800">✨ Serbest Öğe</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  post({ type: 'remove-overlay-item', id: overlayEdit.blockId, index: overlayEdit.index })
                  setOverlayEdit(null)
                }}
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-50"
              >
                Sil
              </button>
              <button type="button" onClick={() => setOverlayEdit(null)} className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50">
                Tamam
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="block text-[11px] font-semibold text-gray-500">Yazı</span>
              <input
                autoFocus
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-blue-500"
                value={String(overlayEdit.item.label ?? '')}
                onChange={(e) => {
                  const val = e.target.value
                  setOverlayEdit((prev) => (prev ? { ...prev, item: { ...prev.item, label: val } } : null))
                  post({ type: 'patch-overlay-item', id: overlayEdit.blockId, index: overlayEdit.index, patch: { label: val } })
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') setOverlayEdit(null) }}
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-[11px] font-semibold text-gray-500">Bağlantı (URL)</span>
              <input
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-blue-500"
                placeholder="/bagis veya https://…"
                value={String(overlayEdit.item.url ?? '')}
                onChange={(e) => {
                  const val = e.target.value
                  setOverlayEdit((prev) => (prev ? { ...prev, item: { ...prev.item, url: val } } : null))
                  post({ type: 'patch-overlay-item', id: overlayEdit.blockId, index: overlayEdit.index, patch: { url: val } })
                }}
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-[11px] font-semibold text-gray-500">Stil</span>
              <select
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-blue-500"
                value={String(overlayEdit.item.style || 'primary')}
                onChange={(e) => {
                  const val = e.target.value
                  setOverlayEdit((prev) => (prev ? { ...prev, item: { ...prev.item, style: val } } : null))
                  post({ type: 'patch-overlay-item', id: overlayEdit.blockId, index: overlayEdit.index, patch: { style: val } })
                }}
              >
                <option value="primary">Ana renk</option>
                <option value="secondary">İkinci renk</option>
                <option value="glass">Cam</option>
                <option value="dark">Koyu</option>
              </select>
            </label>
          </div>
        </div>
      )}
      {slashMenu && (() => {
        const q = slashMenu.query.trim().toLocaleLowerCase('tr')
        const matches = Object.entries(state.specs)
          .filter(([key, sp]) => !sp.hidden && (!q || `${sp.label} ${sp.group} ${key}`.toLocaleLowerCase('tr').includes(q)))
          .slice(0, 12)
        const insertMatch = (blockType: string) => {
          post({ type: 'insert-new', blockType, targetId: slashMenu.afterId || '', position: 'after' })
          setSlashMenu(null)
        }
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-x-0 top-16 z-50 mx-auto w-80 max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <span className="text-xs font-bold text-blue-600">/</span>
              <input
                autoFocus
                value={slashMenu.query}
                onChange={(e) => setSlashMenu((s) => (s ? { ...s, query: e.target.value } : null))}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setSlashMenu(null); return }
                  if (e.key === 'Enter' && matches[0]) { e.preventDefault(); insertMatch(matches[0][0]) }
                }}
                placeholder="Blok ara (ör. görsel, bağış, sss)…"
                className="w-full text-xs text-gray-900 outline-none"
              />
              <button type="button" onClick={() => setSlashMenu(null)} className="text-xs text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {matches.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-gray-400">Eşleşen blok yok</div>
              ) : (
                matches.map(([key, sp]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => insertMatch(key)}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-blue-50 hover:text-blue-700"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <span>{sp.icon}</span>
                      <span>{sp.label}</span>
                    </span>
                    <span className="text-[10px] text-gray-400">{sp.group}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
