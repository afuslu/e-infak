'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Copy, GripVertical, Menu, Trash2, User, X } from 'lucide-react'
import { AppBlockView, brandOf, onColor, PreviewProvider } from './blocks'
import { iconOf } from './icons'
import type { AppAction, AppDesign, PreviewData } from './types'

export const BLOCK_DRAG = 'application/x-app-block'

/** The donor app at 375×760 points. Fixed screens (cart, account…) are named, not drawn. */
export function PhonePreview({ design, data, pageId, setPageId, selected, onSelect, onMove, onDrop, onCopy, onDelete, screens, device }: {
  design: AppDesign; data: PreviewData; pageId: string; setPageId: (id: string) => void
  selected: string | null; onSelect: (id: string | null) => void
  onMove: (id: string, delta: -1 | 1) => void; onDrop: (payload: string, index: number) => void
  onCopy: (id: string) => void; onDelete: (id: string) => void
  screens: Record<string, string>; device: 'ios' | 'android'
}) {
  const [drawer, setDrawer] = useState(false)
  const [fixed, setFixed] = useState<string | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const b = brandOf(design, data)
  const page = design.pages.find((p) => p.id === pageId) || design.pages[0]
  const light = design.header.style === 'light'
  const ink = light ? '#0F172A' : onColor(b.primary)
  const logo = design.header.logo_url || data.site?.logo_url
  const tabStyle = design.header.tab_style || 'raised'
  const current = fixed ? `screen:${fixed}` : page.id === 'home' ? 'screen:home' : `page:${page.id}`
  const keyOf = (a?: AppAction) => (a?.type === 'page' && a.target === 'home' ? 'screen:home' : `${a?.type}:${a?.target}`)

  const open = (a?: AppAction) => {
    setDrawer(false)
    if (!a) return
    if (a.type === 'page' || (a.type === 'screen' && a.target === 'home')) { setFixed(null); setPageId(a.target) }
    else if (a.type === 'screen') setFixed(a.target)
  }
  const drop = (e: React.DragEvent, index: number) => {
    e.preventDefault(); e.stopPropagation(); setOver(null)
    const payload = e.dataTransfer.getData(BLOCK_DRAG)
    if (payload) onDrop(payload, index)
  }
  const line = (index: number) => over === index && <div className="h-1 rounded bg-blue-500" />

  return (
    <div className={`relative mx-auto flex-none overflow-hidden border-[9px] border-slate-900 shadow-2xl ${device === 'ios' ? 'rounded-[46px]' : 'rounded-[26px]'}`} style={{ width: 393, height: 780 }}>
      <div className="flex h-full flex-col" style={{ background: b.bg, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ background: light ? '#FFFFFF' : b.primary, color: ink }}>
          <div className="flex justify-between px-6 pt-2 text-[11px] font-bold"><span>09:41</span><span>{device === 'ios' ? '5G ▮' : '▲ ▮'}</span></div>
          <div className="flex items-center px-2 pb-2 pt-1">
            <span className="flex h-11 w-11 items-center justify-center">{design.header.show_menu !== false && <button type="button" aria-label="Menüyü aç" onClick={() => setDrawer(true)}><Menu size={26} /></button>}</span>
            <div className="flex min-w-0 flex-1 justify-center">
              {!fixed && page.id !== 'home' ? <span className="truncate text-[18px] font-extrabold">{page.title}</span>
                // eslint-disable-next-line @next/next/no-img-element
                : logo && !design.header.title ? <img src={logo} alt="" className="h-10 w-[148px] rounded-[10px] bg-white object-contain" />
                : <span className="truncate text-[21px] font-black">{design.header.title || b.name}</span>}
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: design.header.show_profile === false ? undefined : 'rgba(0,0,0,.22)' }}>{design.header.show_profile !== false && <User size={22} color="#E8D8A0" />}</span>
          </div>
        </div>
        <PreviewProvider brand={b} data={data} open={open}>
          <div className="flex-1 overflow-y-auto pb-6" style={{ scrollbarWidth: 'none' }} onClick={() => onSelect(null)}
            onDragOver={(e) => { e.preventDefault(); if (!fixed) setOver(page.blocks.length) }} onDragLeave={() => setOver(null)} onDrop={(e) => !fixed && drop(e, page.blocks.length)}>
            {fixed ? (
              <div className="p-8 text-center text-sm" style={{ color: b.muted }}>
                <p className="text-base font-bold" style={{ color: b.text }}>{screens[fixed]}</p>
                <p className="mt-2">Bu ekranın işleyişi sabittir; yalnızca renklerinizi alır.</p>
                <button type="button" className="mt-4 underline" onClick={() => { setFixed(null); setPageId('home') }}>Ana sayfaya dön</button>
              </div>
            ) : page.blocks.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">Sayfa boş. Soldan blok ekleyin veya buraya sürükleyin.</p>
              : page.blocks.map((block, i) => (
                <div key={block.id}>
                  {line(i)}
                  <div
                    onClick={(e) => { e.stopPropagation(); onSelect(block.id) }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setOver(e.clientY < r.top + r.height / 2 ? i : i + 1) }}
                    onDrop={(e) => { const r = e.currentTarget.getBoundingClientRect(); drop(e, e.clientY < r.top + r.height / 2 ? i : i + 1) }}
                    className={`relative cursor-pointer outline-offset-[-2px] ${selected === block.id ? 'outline outline-2 outline-blue-600' : 'hover:outline hover:outline-2 hover:outline-blue-300'}`}
                  >
                    {selected === block.id && (
                      <div className="absolute right-1 top-1 z-10 flex gap-0.5 rounded-md bg-blue-600 p-0.5 text-white shadow" onClick={(e) => e.stopPropagation()}>
                        <span draggable title="Sürükle" className="cursor-grab p-1" onDragStart={(e) => e.dataTransfer.setData(BLOCK_DRAG, `move:${block.id}`)}><GripVertical size={14} /></span>
                        <button type="button" title="Yukarı" className="p-1" onClick={() => onMove(block.id, -1)}><ArrowUp size={14} /></button>
                        <button type="button" title="Aşağı" className="p-1" onClick={() => onMove(block.id, 1)}><ArrowDown size={14} /></button>
                        <button type="button" title="Kopyala" className="p-1" onClick={() => onCopy(block.id)}><Copy size={14} /></button>
                        <button type="button" title="Sil" className="p-1" onClick={() => onDelete(block.id)}><Trash2 size={14} /></button>
                      </div>
                    )}
                    <AppBlockView block={block} />
                  </div>
                </div>
              ))}
            {!fixed && line(page.blocks.length)}
          </div>
        </PreviewProvider>
        <div className="relative z-20 flex items-end rounded-t-[22px] bg-white px-1 pb-3 pt-2.5 shadow-[0_-3px_10px_rgba(0,0,0,.12)]">
          {design.tabs.filter((t) => t.action?.target).map((tab) => {
            const Icon = iconOf(tab.icon)
            const on = keyOf(tab.action) === current
            const raised = tabStyle === 'raised' && !!tab.highlight
            const filled = tabStyle === 'pill' && on
            const color = filled ? b.onPrimary : on || (tab.highlight && tabStyle !== 'raised') ? b.primary : '#64748B'
            return (
              <button key={tab.id} type="button" onClick={() => open(tab.action)} className="flex min-w-0 flex-1 flex-col items-center gap-1 py-1 text-[11px]"
                style={{ color, fontWeight: on ? 700 : 500, background: filled ? b.primary : undefined, borderRadius: 14 }}>
                {raised ? <span className="-mt-9 flex h-[60px] w-[60px] items-center justify-center rounded-full border-4 border-white shadow-md" style={{ background: b.primary }}><Icon size={28} color={b.onPrimary} /></span> : <Icon size={22} />}
                <span className="w-full truncate text-center">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>
      {drawer && (
        <div className="absolute inset-0 z-30 flex bg-slate-900/50" onClick={() => setDrawer(false)}>
          <div className="h-full w-[82%] overflow-y-auto bg-white p-3 pt-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex rounded-2xl p-3" style={{ background: b.primary, color: b.onPrimary }}>
              <div className="flex-1"><div className="text-[11px] font-extrabold">{b.name.toLocaleUpperCase('tr-TR')}</div><div className="text-sm font-bold">{data.site?.tagline}</div></div>
              <button type="button" aria-label="Kapat" onClick={() => setDrawer(false)}><X size={22} /></button>
            </div>
            {design.drawer.filter((i) => i.action?.target).map((item) => {
              const Icon = iconOf(item.icon)
              return <button key={item.id} type="button" onClick={() => open(item.action)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-semibold text-slate-900 hover:bg-slate-100"><Icon size={20} color={b.primary} />{item.label}</button>
            })}
          </div>
        </div>
      )}
    </div>
  )
}
