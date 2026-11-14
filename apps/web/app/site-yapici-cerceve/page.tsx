'use client'

/**
 * Site builder canvas, loaded in a same-origin iframe by /admin/site-yapici so
 * tablet/phone widths trigger the real responsive rules. The editor sends the
 * block tree; this page draws it with the public renderer and reports clicks,
 * toolbar actions and drag-and-drop moves back. Messages from other origins are ignored.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { brandCssVariables } from '@e-infak/theme'
import { BlockStyles, renderBlock, type RenderOptions } from '../../components/blocks/BlockRenderer'
import type { HomeData } from '../../components/sections/HomeSections'
import { type Block, type BlockSpec, FIXED_CHILD, FIXED_PARENT } from '../../lib/blocks'
import { siteDesignStyle } from '../../lib/site-design'

interface RenderMessage {
  source: 'einfak-builder'
  type: 'render'
  blocks: Block[]
  data: HomeData
  selectedId: string | null
  specs: Record<string, BlockSpec>
}

type Drop = { targetId: string; position: 'before' | 'after' | 'inside' } | null

function post(message: Record<string, unknown>) {
  window.parent.postMessage({ source: 'einfak-builder-frame', ...message }, window.location.origin)
}

export default function BuilderCanvas() {
  const [state, setState] = useState<RenderMessage | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [drop, setDrop] = useState<Drop>(null)
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
      const typing = (e.target as HTMLElement).closest('input, textarea, select')
      if (typing) return
      if ((e.ctrlKey || e.metaKey) || e.key === 'Delete' || e.key === 'Backspace') {
        post({ type: 'key', key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })
        if ((e.ctrlKey || e.metaKey) && ['z', 'y', 'c', 'v', 'd', 's'].includes(e.key.toLowerCase())) e.preventDefault()
      }
    }
    window.addEventListener('keydown', keys)
    return () => {
      window.removeEventListener('message', onMessage)
      document.removeEventListener('click', stop, true)
      document.removeEventListener('submit', stopSubmit, true)
      window.removeEventListener('keydown', keys)
    }
  }, [])

  const onDragOver = useCallback((e: React.DragEvent, block: Block, container: boolean) => {
    if (!dragId.current || dragId.current === block.id) return
    e.preventDefault()
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = (e.clientY - rect.top) / rect.height
    // A fixed slot (column, header area) only takes blocks inside; dropping on its edge would leave the layout.
    const position = FIXED_CHILD.has(block.type) || (container && !FIXED_PARENT.has(block.type) && y > 0.25 && y < 0.75)
      ? 'inside' : y < 0.5 ? 'before' : 'after'
    setDrop((d) => (d?.targetId === block.id && d.position === position ? d : { targetId: block.id, position }))
  }, [])

  if (!state) return <div className="p-10 text-center text-sm text-gray-400">Önizleme yükleniyor…</div>

  const wrap = (block: Block, node: ReactNode, depth: number) => {
    const spec = state.specs[block.type]
    const selected = state.selectedId === block.id
    const isHover = hovered === block.id && !selected
    const isColumn = FIXED_CHILD.has(block.type)
    const dropHere = drop?.targetId === block.id ? drop.position : null
    return (
      <div key={block.id} data-block-id={block.id}
        className={`relative ${block.type === 'column' ? 'min-h-[60px]' : block.type === 'header_slot' ? 'min-h-[40px] min-w-[48px]' : ''}`}
        style={{ outline: selected ? '2px solid #2563eb' : isHover ? '1px dashed #60a5fa' : undefined, outlineOffset: -2 }}
        draggable={!isColumn}
        onDragStart={(e) => { e.stopPropagation(); dragId.current = block.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', block.id) }}
        onDragEnd={() => { dragId.current = null; setDrop(null) }}
        onDragOver={(e) => onDragOver(e, block, !!spec?.container)}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation()
          if (dragId.current && drop) post({ type: 'move', id: dragId.current, targetId: drop.targetId, position: drop.position })
          dragId.current = null; setDrop(null)
        }}
        onMouseOver={(e) => { e.stopPropagation(); setHovered(block.id) }}
        onClick={(e) => { e.stopPropagation(); post({ type: 'select', id: block.id }) }}>
        {dropHere === 'before' && <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-1 bg-blue-500" />}
        {dropHere === 'after' && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-1 bg-blue-500" />}
        {dropHere === 'inside' && <div className="pointer-events-none absolute inset-0 z-30 bg-blue-500/10 ring-2 ring-inset ring-blue-500" />}
        {(selected || isHover) && (
          <div className={`absolute z-40 flex items-center gap-0.5 rounded-b-md text-[11px] font-semibold text-white shadow ${depth ? 'end-0 top-0' : 'start-0 top-0'} ${selected ? 'bg-blue-600' : 'bg-blue-400'}`}>
            <span className="cursor-grab px-2 py-1">{spec?.icon} {spec?.label || block.type}</span>
            {selected && !isColumn && (
              <>
                {[['↑', 'up', 'Yukarı'], ['↓', 'down', 'Aşağı'], ['⧉', 'duplicate', 'Kopyala'], ['🗑', 'delete', 'Sil']].map(([glyph, action, title]) => (
                  <button key={action} type="button" title={title} className="px-1.5 py-1 hover:bg-white/20"
                    onClick={(e) => { e.stopPropagation(); post({ type: 'action', id: block.id, action }) }}>{glyph}</button>
                ))}
              </>
            )}
          </div>
        )}
        {(block.advanced?.hide_desktop || block.advanced?.hide_tablet || block.advanced?.hide_mobile || block.advanced?.starts_at || block.advanced?.ends_at || block.advanced?.langs) && (
          <div className="pointer-events-none absolute end-1 top-1 z-30 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
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
            className="flex h-8 w-8 flex-none items-center justify-center rounded-md border-2 border-dashed border-blue-300 text-sm font-bold text-blue-600 hover:bg-blue-50">
            +
          </button>
        )}
        {!FIXED_PARENT.has(parent.type) && parent.type !== 'header_slot' && (
          <button type="button" onClick={(e) => { e.stopPropagation(); post({ type: 'add-into', parentId: parent.id }) }}
            className="my-2 flex w-full items-center justify-center rounded-lg border-2 border-dashed border-blue-300 py-4 text-sm font-semibold text-blue-600 hover:bg-blue-50">
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
        <div className="m-10 rounded-2xl border-2 border-dashed p-16 text-center text-gray-400">Sayfa boş. Soldaki “Bloklar” sekmesinden blok ekleyin.</div>
      )}
      <BlockStyles blocks={state.blocks} editing />
      {state.blocks.map((b) => renderBlock(b, options))}
    </div>
  )
}
