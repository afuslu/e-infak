'use client'

/**
 * Shared building blocks of the admin panel, so every screen has the same page header,
 * table, dialogs and messages. Colours use the gray / primary scales, which the panel's
 * dark theme (.admin-dark in globals.css) already flips.
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, X, XCircle, type LucideIcon } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { ghostButton, primaryButton } from './FormKit'

/** Dialogs render inside the panel wrapper so they get its theme (dark mode, brand colours). */
export const portalRoot = () => document.getElementById('admin-portal') || document.body

// --- Page header -------------------------------------------------------------------

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
        {description && <div className="mt-1 max-w-3xl text-sm text-gray-500">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// --- Numbers -----------------------------------------------------------------------

const TONES = {
  neutral: 'text-gray-900', good: 'text-green-700', warn: 'text-amber-700', bad: 'text-red-700', brand: 'text-primary-700',
} as const

export function StatCard({ label, value, hint, tone = 'neutral', icon: Icon }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: keyof typeof TONES; icon?: LucideIcon
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</div>
        {Icon && <Icon className="h-4 w-4 text-gray-400" aria-hidden="true" />}
      </div>
      <div className={`mt-1 text-2xl font-black tabular-nums ${TONES[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
    </div>
  )
}

// --- Table -------------------------------------------------------------------------

/** Later classes win (a page's own padding overrides the default). */
const join = (...parts: (string | undefined | false)[]) => twMerge(parts.filter(Boolean).join(' '))

/**
 * Table parts with the panel's one table look. Pages write <Table><THead><Tr><Th>… exactly like
 * HTML; spacing, header style and row lines live here.
 */
/** `inset`: the table touches the card edge, so its outer cells keep their padding. */
export function Table({ className, inset, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { inset?: boolean }) {
  return <table {...props} className={join('w-full text-left text-[13px] text-gray-700', inset && INSET, className)} />
}
const INSET = '[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4'
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} className={join('border-b border-gray-200 text-[11px] font-bold uppercase tracking-wide text-gray-500', className)} />
}
export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} className={join('divide-y divide-gray-100', className)} />
}
export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} className={className} />
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...props} className={join('px-3 py-2.5 font-bold first:pl-0 last:pr-0', className)} />
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className={join('px-3 py-2.5 first:pl-0 last:pr-0', className)} />
}

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}

export function EmptyState({ icon: Icon = Inbox, title, text, action }: { icon?: LucideIcon; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Icon className="h-8 w-8 text-gray-300" aria-hidden="true" />
      <div className="text-sm font-semibold text-gray-600">{title}</div>
      {text && <div className="max-w-sm text-xs text-gray-400">{text}</div>}
      {action}
    </div>
  )
}

export function DataTable<T>({ columns, rows, rowKey, loading, empty = 'Kayıt yok.', onRowClick, rowClassName }: {
  columns: Column<T>[]
  rows: T[] | null | undefined
  rowKey: (row: T) => string
  loading?: boolean
  empty?: ReactNode
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string
}) {
  if (loading || !rows) return <p className="animate-pulse py-12 text-center text-sm text-gray-400">Yükleniyor…</p>
  if (rows.length === 0) return typeof empty === 'string' ? <EmptyState title={empty} /> : <>{empty}</>
  const align = (a?: Column<T>['align']) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : '')
  return (
    <div className="overflow-x-auto">
      <Table>
        <THead>
          <Tr>{columns.map((c) => <Th key={c.key} className={join(align(c.align), c.className)}>{c.header}</Th>)}</Tr>
        </THead>
        <TBody>
          {rows.map((row) => (
            <Tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={join('align-top hover:bg-gray-50/60', onRowClick && 'cursor-pointer', rowClassName?.(row))}>
              {columns.map((c) => <Td key={c.key} className={join(align(c.align), c.className)}>{c.render(row)}</Td>)}
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  )
}

export function Pagination({ page, pages, onChange, total }: { page: number; pages: number; onChange: (page: number) => void; total?: number }) {
  if (pages <= 1) return total !== undefined ? <div className="text-xs text-gray-500">{total.toLocaleString('tr-TR')} kayıt</div> : null
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
      <span>{total !== undefined ? `${total.toLocaleString('tr-TR')} kayıt` : ''}</span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className={`${ghostButton} flex items-center gap-1 disabled:opacity-40`}>
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Önceki
        </button>
        <span className="tabular-nums">{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} className={`${ghostButton} flex items-center gap-1 disabled:opacity-40`}>
          Sonraki <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>
}

export function Tabs<K extends string>({ tabs, value, onChange }: {
  tabs: { key: K; label: string; count?: number }[]; value: K; onChange: (key: K) => void
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.key} type="button" role="tab" aria-selected={value === tab.key} onClick={() => onChange(tab.key)}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${value === tab.key ? 'bg-primary-600 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:border-primary-600'}`}>
          {tab.label}{tab.count !== undefined ? ` (${tab.count.toLocaleString('tr-TR')})` : ''}
        </button>
      ))}
    </div>
  )
}

// --- Dialogs -----------------------------------------------------------------------

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' } as const

/** A window over the page. Rendered at <body>, so it can be opened from inside a form. */
export function Modal({ title, description, onClose, children, footer, size = 'md' }: {
  title: string; description?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: keyof typeof SIZES
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="admin-overlay fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className={`mt-10 w-full ${SIZES[size]} space-y-4 rounded-2xl bg-white p-6 text-left shadow-xl`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
        {footer && <div className="flex justify-end gap-2 pt-2">{footer}</div>}
      </div>
    </div>,
    portalRoot(),
  )
}

// --- Messages and confirmation: callable from anywhere, shown by <UiHost /> ----------

interface ToastItem { id: number; type: 'ok' | 'error'; text: string }
interface ConfirmRequest { title: string; text?: string; confirmLabel: string; danger: boolean; resolve: (yes: boolean) => void }
interface UiState { toasts: ToastItem[]; confirm: ConfirmRequest | null }

let state: UiState = { toasts: [], confirm: null }
const listeners = new Set<() => void>()
const emit = (next: UiState) => { state = next; listeners.forEach((l) => l()) }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
let nextId = 1

function push(type: ToastItem['type'], text: string) {
  const id = nextId++
  emit({ ...state, toasts: [...state.toasts, { id, type, text }] })
  setTimeout(() => emit({ ...state, toasts: state.toasts.filter((t) => t.id !== id) }), type === 'ok' ? 4000 : 7000)
}

/** Short message in the corner of the panel; replaces alert(). */
export const toast = { ok: (text: string) => push('ok', text), error: (text: string) => push('error', text) }

/**
 * Asks before something that cannot be undone; replaces confirm().
 * `if (!(await confirmDialog('Silinsin mi?'))) return`
 */
export function confirmDialog(input: string | { title: string; text?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  const options = typeof input === 'string' ? { title: input } : input
  return new Promise((resolve) => {
    state.confirm?.resolve(false)
    emit({ ...state, confirm: { title: options.title, text: options.text, confirmLabel: options.confirmLabel || 'Onayla', danger: options.danger ?? true, resolve } })
  })
}

/** Mounted once in the panel layout. */
export function UiHost() {
  const current = useSyncExternalStore(subscribe, () => state, () => state)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  const answer = (yes: boolean) => { current.confirm?.resolve(yes); emit({ ...state, confirm: null }) }
  return createPortal(
    <>
      {current.confirm && (
        <div className="admin-overlay fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => answer(false)}>
          <div role="alertdialog" aria-modal="true" aria-label={current.confirm.title} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full ${current.confirm.danger ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-700'}`}>
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="whitespace-pre-line text-sm font-semibold text-gray-900">{current.confirm.title}</div>
            {current.confirm.text && <p className="whitespace-pre-line text-sm text-gray-500">{current.confirm.text}</p>}
            <div className="flex justify-center gap-2">
              <button type="button" onClick={() => answer(false)} className={`${ghostButton} px-4 py-2 text-sm`}>İptal</button>
              <button type="button" autoFocus onClick={() => answer(true)}
                className={current.confirm.danger ? 'rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700' : primaryButton}>
                {current.confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-full max-w-sm flex-col gap-2" aria-live="polite">
        {current.toasts.map((item) => (
          <div key={item.id} className={`pointer-events-auto flex items-start gap-2 rounded-xl border bg-white p-3 text-sm font-semibold shadow-lg ${item.type === 'ok' ? 'border-green-200 text-green-700' : 'border-red-200 text-red-700'}`}>
            {item.type === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <span className="whitespace-pre-line">{item.text}</span>
          </div>
        ))}
      </div>
    </>,
    portalRoot(),
  )
}
