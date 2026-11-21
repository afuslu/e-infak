'use client'

/**
 * The panel's one list layout, modelled on STK PRO so staff moving over work the same way on every page:
 * a search box under each column header, "Filtreyi Uygula", a column chooser, rows-per-page, "Tümünü Seç" with
 * "Tüm N kaydı seç", a "Toplu İşlemler" menu and icon actions at the end of each row.
 * The page owns the data; this component owns layout, column visibility and the filter drafts.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, Columns3, Filter, MoreVertical, X } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { EmptyState, portalRoot } from './ui'

export type FilterSpec =
  | { type: 'text'; param: string; placeholder?: string }
  | { type: 'select'; param: string; options: { value: string; label: string }[] }
  | { type: 'daterange'; from: string; to: string }
  | { type: 'numberrange'; min: string; max: string }

export interface ListColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  filter?: FilterSpec
  /** Sort key sent to the API; the header becomes clickable. */
  sort?: string
  /** Hidden until the user turns it on in the column chooser. */
  hidden?: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
}

export interface ListSelection {
  ids: string[]
  /** Every row matching the filters, not only the picked ones. */
  all: boolean
}

export const EMPTY_SELECTION: ListSelection = { ids: [], all: false }

export interface BulkAction {
  key: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  tone?: 'default' | 'danger' | 'success' | 'warning' | 'info'
  onClick: () => void
}

const PAGE_SIZES = [10, 25, 30, 50, 100]
const join = (...parts: (string | undefined | false)[]) => twMerge(parts.filter(Boolean).join(' '))

const filterParams = (f: FilterSpec) =>
  f.type === 'daterange' ? [f.from, f.to] : f.type === 'numberrange' ? [f.min, f.max] : [f.param]

function useHiddenColumns<T>(storageKey: string, columns: ListColumn<T>[]) {
  const defaults = useMemo(() => columns.filter((c) => c.hidden).map((c) => c.key), [columns])
  const [hidden, setHidden] = useState<string[]>(defaults)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`einfak-list-cols:${storageKey}`) || 'null')
      if (Array.isArray(saved)) setHidden(saved.filter((k) => typeof k === 'string'))
    } catch {
      // storage unavailable: defaults
    }
  }, [storageKey])
  const save = (next: string[]) => {
    setHidden(next)
    try { localStorage.setItem(`einfak-list-cols:${storageKey}`, JSON.stringify(next)) } catch { /* ignore */ }
  }
  return { hidden, toggle: (key: string) => save(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]), reset: () => save(defaults) }
}

/** Remembered rows-per-page for a list (STK PRO keeps it per table). */
export function usePageSize(storageKey: string, fallback = 25) {
  const [size, setSize] = useState(fallback)
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(`einfak-list-size:${storageKey}`))
      if (PAGE_SIZES.includes(saved)) setSize(saved)
    } catch {
      // ignore
    }
  }, [storageKey])
  const change = (next: number) => {
    setSize(next)
    try { localStorage.setItem(`einfak-list-size:${storageKey}`, String(next)) } catch { /* ignore */ }
  }
  return [size, change] as const
}

function Menu({ anchor, onClose, children }: { anchor: HTMLElement | null; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useEffect(() => {
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 280) })
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [anchor, onClose])
  if (!pos) return null
  return createPortal(
    <div ref={ref} style={{ top: pos.top, left: Math.max(8, pos.left) }}
      className="fixed z-[70] min-w-[240px] max-w-[280px] rounded-xl border border-gray-200 bg-white p-1.5 text-[13px] shadow-lg">
      {children}
    </div>,
    portalRoot(),
  )
}

const TONES: Record<NonNullable<BulkAction['tone']>, string> = {
  default: 'text-gray-700',
  danger: 'text-rose-600',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  info: 'text-sky-600',
}

export function ListView<T>({
  storageKey, columns, rows, total, loading, rowKey,
  page, pageSize, onPage, onPageSize,
  filters, onApplyFilters,
  sort, direction, onSort,
  selection, onSelection, bulkActions,
  rowActions, onRowClick, rowClassName, toolbar, empty = 'Kayıt yok',
}: {
  storageKey: string
  columns: ListColumn<T>[]
  rows: T[]
  total: number
  loading?: boolean
  rowKey: (row: T) => string
  page: number
  pageSize: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
  filters: Record<string, string>
  onApplyFilters: (next: Record<string, string>) => void
  sort?: string
  direction?: 'asc' | 'desc'
  onSort?: (sort: string, direction: 'asc' | 'desc') => void
  /** Leave out to hide the checkboxes. */
  selection?: ListSelection
  onSelection?: (next: ListSelection) => void
  bulkActions?: BulkAction[]
  rowActions?: (row: T) => ReactNode
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string
  toolbar?: ReactNode
  empty?: string
}) {
  const cols = useHiddenColumns(storageKey, columns)
  const visible = columns.filter((c) => !cols.hidden.includes(c.key))
  const [draft, setDraft] = useState(filters)
  useEffect(() => { setDraft(filters) }, [filters])
  const [menu, setMenu] = useState<'cols' | 'bulk' | null>(null)
  const colsBtn = useRef<HTMLButtonElement>(null)
  const bulkBtn = useRef<HTMLButtonElement>(null)

  const columnParams = new Set(columns.flatMap((c) => (c.filter ? filterParams(c.filter) : [])))
  const dirty = [...columnParams].some((p) => (draft[p] || '') !== (filters[p] || ''))
  const activeCount = [...columnParams].filter((p) => filters[p]).length
  const apply = () => onApplyFilters({ ...filters, ...draft })
  const clear = () => {
    const next = { ...filters }
    columnParams.forEach((p) => { next[p] = '' })
    setDraft(next)
    onApplyFilters(next)
  }
  const setValue = (param: string, value: string, immediate = false) => {
    const next = { ...draft, [param]: value }
    setDraft(next)
    if (immediate) onApplyFilters({ ...filters, ...next })
  }

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const pageIds = rows.map(rowKey)
  const picked = selection ? (selection.all ? total : selection.ids.length) : 0
  const allOnPage = !!selection && pageIds.length > 0 && (selection.all || pageIds.every((id) => selection.ids.includes(id)))
  const togglePage = () => {
    if (!selection || !onSelection) return
    if (allOnPage) onSelection(EMPTY_SELECTION)
    else onSelection({ all: false, ids: Array.from(new Set([...selection.ids, ...pageIds])) })
  }
  const toggleRow = (id: string) => {
    if (!selection || !onSelection) return
    if (selection.all) {
      onSelection({ all: false, ids: pageIds.filter((x) => x !== id) })
      return
    }
    onSelection({ all: false, ids: selection.ids.includes(id) ? selection.ids.filter((x) => x !== id) : [...selection.ids, id] })
  }
  const isPicked = (id: string) => !!selection && (selection.all || selection.ids.includes(id))
  const align = (a?: ListColumn<T>['align']) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left')
  const field = 'h-8 w-full min-w-[84px] rounded-md border border-gray-200 bg-white px-2 text-[12px] font-normal normal-case tracking-normal text-gray-700 outline-none placeholder:text-gray-400 focus:border-primary-500'

  const filterCell = (f: FilterSpec) => {
    const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') apply() }
    if (f.type === 'text') {
      return <input className={field} placeholder={f.placeholder || 'Ara'} value={draft[f.param] || ''} onKeyDown={onKey}
        onChange={(e) => setValue(f.param, e.target.value)} aria-label="Sütunda ara" />
    }
    if (f.type === 'select') {
      return (
        <select className={field} value={draft[f.param] || ''} onChange={(e) => setValue(f.param, e.target.value, true)} aria-label="Sütun filtresi">
          <option value="">Tümü</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    }
    const [a, b] = filterParams(f)
    const type = f.type === 'daterange' ? 'date' : 'text'
    return (
      <div className="flex min-w-[150px] gap-1">
        <input type={type} inputMode={type === 'text' ? 'decimal' : undefined} className={field} value={draft[a] || ''} onKeyDown={onKey}
          placeholder={f.type === 'numberrange' ? 'Min' : undefined} title={f.type === 'daterange' ? 'Başlangıç' : 'En az'}
          onChange={(e) => setValue(a, e.target.value, f.type === 'daterange')} aria-label="Başlangıç" />
        <input type={type} inputMode={type === 'text' ? 'decimal' : undefined} className={field} value={draft[b] || ''} onKeyDown={onKey}
          placeholder={f.type === 'numberrange' ? 'Maks' : undefined} title={f.type === 'daterange' ? 'Bitiş' : 'En çok'}
          onChange={(e) => setValue(b, e.target.value, f.type === 'daterange')} aria-label="Bitiş" />
      </div>
    )
  }

  const pageButtons = () => {
    const out: (number | '…')[] = []
    const add = (n: number) => { if (!out.includes(n)) out.push(n) }
    for (let n = 1; n <= pages; n++) {
      if (n <= 2 || n > pages - 2 || Math.abs(n - page) <= 2) add(n)
      else if (out[out.length - 1] !== '…') out.push('…')
    }
    return out
  }

  const hasFilters = visible.some((c) => c.filter)
  const from = total ? (page - 1) * pageSize + 1 : 0
  const to = Math.min(total, page * pageSize)

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2.5">
        {selection && onSelection && (
          <button type="button" onClick={togglePage} disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {allOnPage ? 'Seçimi Kaldır' : 'Tümünü Seç'}
          </button>
        )}
        {picked > 0 && bulkActions && bulkActions.length > 0 && (
          <>
            <button ref={bulkBtn} type="button" onClick={() => setMenu(menu === 'bulk' ? null : 'bulk')} aria-expanded={menu === 'bulk'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
              <MoreVertical className="h-4 w-4" aria-hidden="true" /> Toplu İşlemler
            </button>
            {menu === 'bulk' && (
              <Menu anchor={bulkBtn.current} onClose={() => setMenu(null)}>
                {bulkActions.map((a) => (
                  <button key={a.key} type="button" onClick={() => { setMenu(null); a.onClick() }}
                    className={join('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-medium hover:bg-gray-50', TONES[a.tone || 'default'])}>
                    {a.icon && <a.icon className="h-4 w-4" />}{a.label}
                  </button>
                ))}
              </Menu>
            )}
          </>
        )}
        {toolbar}
        <div className="ms-auto flex items-center gap-2">
          {activeCount > 0 && (
            <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose-600 hover:underline">
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Filtreleri temizle ({activeCount})
            </button>
          )}
          {hasFilters && (
            <button type="button" onClick={apply}
              className={join('inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-bold text-white shadow-xs',
                dirty ? 'bg-primary-600 hover:bg-primary-700 ring-2 ring-primary-200' : 'bg-primary-600 hover:bg-primary-700')}>
              <Filter className="h-4 w-4" aria-hidden="true" /> Filtreyi Uygula
            </button>
          )}
          <button ref={colsBtn} type="button" onClick={() => setMenu(menu === 'cols' ? null : 'cols')} title="Sütunları seç" aria-label="Sütunları seç"
            aria-expanded={menu === 'cols'} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            <Columns3 className="h-4 w-4" aria-hidden="true" />
          </button>
          {menu === 'cols' && (
            <Menu anchor={colsBtn.current} onClose={() => setMenu(null)}>
              <div className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Görünen sütunlar</div>
              <div className="max-h-[320px] overflow-y-auto">
                {columns.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                    <input type="checkbox" checked={!cols.hidden.includes(c.key)} onChange={() => cols.toggle(c.key)} />
                    <span>{c.header}</span>
                  </label>
                ))}
              </div>
              <button type="button" onClick={cols.reset} className="mt-1 w-full rounded-lg px-3 py-1.5 text-left text-[12px] font-semibold text-primary-700 hover:bg-gray-50">
                Varsayılana dön
              </button>
            </Menu>
          )}
        </div>
      </div>

      {/* Selection bar */}
      {selection && onSelection && picked > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-100 bg-primary-50/60 px-4 py-2 text-[13px]">
          <span className="font-semibold text-rose-600">{picked.toLocaleString('tr-TR')} kayıt seçildi</span>
          <span className="ms-auto flex gap-4">
            {!selection.all && total > selection.ids.length && (
              <button type="button" onClick={() => onSelection({ ids: [], all: true })} className="font-semibold text-primary-700 hover:underline">
                Tüm {total.toLocaleString('tr-TR')} kaydı seç
              </button>
            )}
            <button type="button" onClick={() => onSelection(EMPTY_SELECTION)} className="font-semibold text-rose-600 hover:underline">
              Tüm seçimleri kaldır
            </button>
          </span>
        </div>
      )}

      {/* Table */}
      <div className="max-w-full overflow-x-auto">
        <table className="w-full text-left text-[13px] text-gray-700">
          <thead className="text-[12px] font-bold text-gray-600">
            <tr className="border-b border-gray-200 bg-gray-50/70">
              {selection && <th className="w-10 px-3 py-2.5" />}
              {visible.map((c) => {
                const active = sort && c.sort === sort
                const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
                return (
                  <th key={c.key} className={join('whitespace-nowrap px-3 py-2.5', align(c.align), c.className)}>
                    {c.sort && onSort ? (
                      <button type="button" onClick={() => onSort(c.sort!, active && direction === 'desc' ? 'asc' : 'desc')}
                        className="inline-flex items-center gap-1 hover:text-gray-900">
                        {c.header}<Icon className={join('h-3.5 w-3.5', active ? 'text-primary-600' : 'text-gray-300')} aria-hidden="true" />
                      </button>
                    ) : c.header}
                  </th>
                )
              })}
              {rowActions && <th className="whitespace-nowrap px-3 py-2.5 text-right">İşlemler</th>}
            </tr>
            {hasFilters && (
              <tr className="border-b border-gray-200">
                {selection && <th className="px-3 py-2" />}
                {visible.map((c) => <th key={c.key} className="px-1.5 py-2">{c.filter ? filterCell(c.filter) : null}</th>)}
                {rowActions && <th className="px-3 py-2" />}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && !rows.length ? (
              [0, 1, 2, 3, 4].map((i) => (
                <tr key={i}><td colSpan={visible.length + 2} className="px-3 py-3"><div className="h-6 animate-pulse rounded bg-slate-100" /></td></tr>
              ))
            ) : !rows.length ? (
              <tr><td colSpan={visible.length + 2}><EmptyState title={empty} text={activeCount ? 'Filtreleri değiştirip tekrar deneyin.' : undefined} /></td></tr>
            ) : rows.map((row) => {
              const id = rowKey(row)
              const on = isPicked(id)
              return (
                <tr key={id} onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={join('align-middle transition-colors hover:bg-gray-50/70', on && 'bg-primary-50/50', onRowClick && 'cursor-pointer', rowClassName?.(row))}>
                  {selection && (
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={on} onChange={() => toggleRow(id)} aria-label="Satırı seç" className="cursor-pointer" />
                    </td>
                  )}
                  {visible.map((c) => <td key={c.key} className={join('px-3 py-2.5', align(c.align), c.className)}>{c.render(row)}</td>)}
                  {rowActions && (
                    <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">{rowActions(row)}</div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-4 py-3 text-[13px] text-gray-600">
        <span>
          Toplam <b className="tabular-nums">{total.toLocaleString('tr-TR')}</b> sonuçtan {from.toLocaleString('tr-TR')} ile {to.toLocaleString('tr-TR')} arası görüntüleniyor
        </span>
        <label className="flex items-center overflow-hidden rounded-lg border border-gray-200">
          <span className="px-2.5 text-gray-500">sayfa başına</span>
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-8 border-s border-gray-200 bg-white px-2 font-semibold outline-none">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {pages > 1 && (
          <nav aria-label="Sayfalar" className="ms-auto flex items-center gap-1">
            <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Önceki sayfa"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            {pageButtons().map((n, i) => n === '…' ? (
              <span key={`e${i}`} className="px-1 text-gray-400">…</span>
            ) : (
              <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}
                className={join('h-8 min-w-8 rounded-lg border px-2 tabular-nums', n === page ? 'border-primary-500 bg-primary-50 font-bold text-primary-700' : 'border-gray-200 hover:bg-gray-50')}>
                {n}
              </button>
            ))}
            <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Sonraki sayfa"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        )}
      </div>
    </div>
  )
}

/** Small square icon button for the "İşlemler" column. */
export function RowAction({ label, onClick, href, icon: Icon, tone = 'default' }: {
  label: string; icon: React.ComponentType<{ className?: string }>; onClick?: () => void; href?: string
  tone?: 'default' | 'danger' | 'success' | 'sms'
}) {
  const cls = join('flex h-7 w-7 items-center justify-center rounded-md transition-colors', {
    default: 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
    danger: 'text-gray-400 hover:bg-rose-50 hover:text-rose-600',
    success: 'text-gray-500 hover:bg-emerald-50 hover:text-emerald-600',
    sms: 'text-gray-500 hover:bg-violet-50 hover:text-violet-600',
  }[tone])
  if (href) {
    return <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" title={label} aria-label={label} className={cls}><Icon className="h-4 w-4" /></a>
  }
  return <button type="button" onClick={onClick} title={label} aria-label={label} className={cls}><Icon className="h-4 w-4" /></button>
}
