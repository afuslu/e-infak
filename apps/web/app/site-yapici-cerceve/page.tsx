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
  device?: 'desktop' | 'tablet' | 'mobile'
}

type Drop = { targetId: string; position: 'before' | 'after' | 'inside' } | null
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

export default function BuilderCanvas() {
  const [state, setState] = useState<RenderMessage | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [drop, setDrop] = useState<Drop>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null)
  const [inlineEdit, setInlineEdit] = useState<InlineEdit>(null)
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
        return
      }
      const typing = (e.target as HTMLElement).closest('input, textarea, select')
      if (typing) return
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
    const isNew = e.dataTransfer.types.includes('application/x-new-block') || e.dataTransfer.types.includes('application/x-new-blocks')
    if ((!dragId.current && !isNew) || dragId.current === block.id) return
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

  const device = state.device || 'desktop'
  const locale = state.data?.locale || 'tr'

  const getTextFields = (block: Block, spec?: BlockSpec) => {
    if (!spec?.fields) return []
    const vals = locale !== 'tr'
      ? { ...(block.props || {}), ...(block.translations?.[locale] || {}) }
      : (block.props || {})
    return Object.entries(spec.fields)
      .filter(([, f]) => TEXT_FIELD_TYPES.has(f.kind))
      .slice(0, 4)
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

  const wrap = (block: Block, node: ReactNode, depth: number) => {
    const spec = state.specs[block.type]
    const selected = state.selectedId === block.id
    const isHover = hovered === block.id && !selected
    const isColumn = FIXED_CHILD.has(block.type)
    const dropHere = drop?.targetId === block.id ? drop.position : null
    const hasTextFields = getTextFields(block, spec).length > 0
    return (
      <div key={block.id} data-block-id={block.id}
        className={`group/blk relative ${block.type === 'column' ? 'min-h-[60px]' : block.type === 'header_slot' ? 'min-h-[40px] min-w-[48px]' : ''}`}
        style={{ outline: selected ? '2px solid #2563eb' : isHover ? '1px dashed #60a5fa' : undefined, outlineOffset: -2 }}
        draggable={!isColumn && !inlineEdit}
        onDragStart={(e) => { e.stopPropagation(); dragId.current = block.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', block.id) }}
        onDragEnd={() => { dragId.current = null; setDrop(null) }}
        onDragOver={(e) => onDragOver(e, block, !!spec?.container)}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation()
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
        onMouseOver={(e) => { e.stopPropagation(); setHovered(block.id) }}
        onClick={(e) => { e.stopPropagation(); setCtxMenu(null); post({ type: 'select', id: block.id }) }}
        onDoubleClick={(e) => {
          if (!hasTextFields) return
          e.stopPropagation()
          post({ type: 'select', id: block.id })
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
        {dropHere === 'inside' && <div className="pointer-events-none absolute inset-0 z-30 bg-blue-500/10 ring-2 ring-inset ring-blue-500" />}
        {(selected || isHover) && (
          <div className={`absolute z-40 flex items-center gap-0.5 rounded-b-md text-[11px] font-semibold text-white shadow ${depth ? 'end-0 top-0' : 'start-0 top-0'} ${selected ? 'bg-blue-600' : 'bg-blue-400'}`}>
            <span className="cursor-grab px-2 py-1">{spec?.icon} {spec?.label || block.type}</span>
            {selected && hasTextFields && (
              <button type="button" title="Metni tuvalde düzenle (Çift tık)" className="px-1.5 py-1 hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); openInlineEdit(block, (e.currentTarget as HTMLElement).closest('[data-block-id]') as HTMLElement) }}>
                ✏️
              </button>
            )}
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
        {depth === 0 && !isColumn && (isHover || selected) && (
          <div className="pointer-events-none absolute inset-x-0 -bottom-3 z-40 flex items-center justify-center">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); post({ type: 'insert-after', targetId: block.id }) }}
              className="pointer-events-auto rounded-full bg-blue-600 px-3 py-0.5 text-[11px] font-bold text-white shadow-md transition hover:scale-105 hover:bg-blue-700"
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
        <div
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-new-block') || e.dataTransfer.types.includes('application/x-new-blocks')) e.preventDefault()
          }}
          onDrop={(e) => {
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
          Sayfa boş. Soldaki “Ekle” panelinden blok ekleyin veya buraya sürükleyin.
        </div>
      )}
      <BlockStyles blocks={state.blocks} editing />
      {state.blocks.map((b) => renderBlock(b, options))}

      {ctxMenu && (() => {
        const b = ctxMenu.block
        const isCol = FIXED_CHILD.has(b.type)
        const hasText = getTextFields(b, state.specs[b.type]).length > 0
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
    </div>
  )
}
