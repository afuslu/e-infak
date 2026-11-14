'use client'

/**
 * Shared building blocks of the admin panel, so every screen has the same page header,
 * table, dialogs and messages. Colours use the gray / primary scales, which the panel's
 * dark theme (.admin-dark in globals.css) already flips.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, Inbox, Printer, X, XCircle, type LucideIcon } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { exportPdf, exportXlsx } from '../../lib/admin-access'
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

export interface StatCardDetail {
  title: string
  description?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  content: () => ReactNode
}

export function StatCard({ label, value, hint, tone = 'neutral', icon: Icon, detail, className }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: keyof typeof TONES; icon?: LucideIcon
  detail?: StatCardDetail; className?: string
}) {
  const [open, setOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const clickable = !!detail

  const exportModalTable = (fmt: 'xlsx' | 'pdf') => {
    const table = contentRef.current?.querySelector('table')
    if (!table || !detail) return
    const headCells = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent?.trim() || '')
    const bodyRows = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() || ''),
    )
    const headers = headCells.length ? headCells : ['Bilgi', 'Değer']
    const slug = detail.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'detay'
    const subtitle = typeof detail.description === 'string' ? detail.description : undefined
    if (fmt === 'xlsx') {
      void exportXlsx(`${slug}.xlsx`, detail.title, headers, bodyRows, { subtitle })
    } else {
      void exportPdf(`${slug}.pdf`, detail.title, headers, bodyRows, { subtitle })
    }
  }

  const printModalContent = () => {
    if (!contentRef.current || !detail) return
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return
    win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${detail.title}</title>
      <style>body{font-family:system-ui,-apple-system,sans-serif;padding:24px;color:#111827}h1{font-size:18px;margin:0 0 4px}p{font-size:12px;color:#6b7280;margin:0 0 16px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #e5e7eb;padding:8px 6px;text-align:left}th{font-size:11px;text-transform:uppercase;color:#6b7280}@media print{body{padding:0}}</style>
      </head><body><h1>${detail.title}</h1>${typeof detail.description === 'string' ? `<p>${detail.description}</p>` : ''}${contentRef.current.innerHTML}</body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <>
      <div
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => setOpen(true) : undefined}
        onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) } } : undefined}
        className={join(
          'rounded-xl border border-gray-100 bg-white p-4 shadow-sm',
          clickable && 'group cursor-pointer transition hover:border-primary-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-500/40',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</div>
          <div className="flex items-center gap-1.5">
            {clickable && (
              <span className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 transition group-hover:bg-primary-50 group-hover:text-primary-700">
                <Eye className="h-3 w-3" aria-hidden="true" /> Detay
              </span>
            )}
            {Icon && <Icon className="h-4 w-4 text-gray-400" aria-hidden="true" />}
          </div>
        </div>
        <div className={`mt-1 text-2xl font-black tabular-nums ${TONES[tone]}`}>{value}</div>
        {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
      </div>
      {open && detail && (
        <Modal
          title={detail.title}
          description={detail.description}
          size={detail.size ?? 'lg'}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => exportModalTable('xlsx')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#1D6F42]/30 bg-[#1D6F42]/10 px-3 py-1.5 text-xs font-bold text-[#1D6F42] transition-colors hover:bg-[#1D6F42]/15"
              >
                <ExcelIcon className="h-3.5 w-3.5" /> Excel İndir
              </button>
              <button
                type="button"
                onClick={() => exportModalTable('pdf')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D32F2F]/30 bg-[#D32F2F]/10 px-3 py-1.5 text-xs font-bold text-[#D32F2F] transition-colors hover:bg-[#D32F2F]/15"
              >
                <PdfIcon className="h-3.5 w-3.5" /> PDF İndir
              </button>
              <button
                type="button"
                onClick={printModalContent}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 transition-colors hover:bg-primary-100"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Yazdır
              </button>
            </>
          }
        >
          <div ref={contentRef} className="max-h-[65vh] overflow-y-auto pr-1">{detail.content()}</div>
        </Modal>
      )}
    </>
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

export function ExcelIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <rect x="7" y="3" width="14" height="18" rx="2" fill="#21A366" />
      <path d="M14 3v18M7 9h14M7 15h14" stroke="#E6F4EA" strokeWidth="1.2" opacity="0.7" />
      <rect x="2" y="6" width="12" height="12" rx="2" fill="#185C37" />
      <path d="M5.6 9.5L8 12l2.4-2.5M5.6 14.5L8 12l2.4 2.5" stroke="#FFFFFF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PdfIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <path d="M6 2h8l5 5v15a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="#FDECEC" stroke="#D32F2F" strokeWidth="1.5" />
      <path d="M14 2v5h5" stroke="#D32F2F" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="4" y="12.5" width="16" height="7" rx="1.5" fill="#D32F2F" />
      <text x="12" y="17.8" textAnchor="middle" fill="#FFFFFF" fontSize="5.4" fontWeight="800" fontFamily="sans-serif">PDF</text>
    </svg>
  )
}

export function WhatsAppIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <path
        d="M12 2.25c-5.38 0-9.75 4.37-9.75 9.75 0 1.88.53 3.63 1.46 5.12L2.5 21.75l4.78-1.25A9.71 9.71 0 0 0 12 21.75c5.38 0 9.75-4.37 9.75-9.75S17.38 2.25 12 2.25Z"
        fill="#25D366"
      />
      <path
        d="M16.43 14.48c-.24-.12-1.4-.69-1.62-.77-.22-.08-.38-.12-.54.12-.16.24-.62.77-.76.93-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.19-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.46-.39-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.51.58.18 1.1.15 1.52.09.46-.07 1.4-.57 1.6-1.12.2-.55.2-1.02.14-1.12-.06-.1-.22-.16-.46-.28Z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

export function SmsIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <path
        d="M4 4.5h16a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H8.5L4 21.5V18a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z"
        fill="#0284C7"
      />
      <circle cx="8" cy="11.25" r="1.35" fill="#FFFFFF" />
      <circle cx="12" cy="11.25" r="1.35" fill="#FFFFFF" />
      <circle cx="16" cy="11.25" r="1.35" fill="#FFFFFF" />
    </svg>
  )
}

/** Kurum logolu ve marka renkli kurumsal Excel (.xlsx) + PDF dışa aktarım + Yazdır butonları. */
export function ExportButtons({
  filename,
  title,
  subtitle,
  getData,
  summary,
  currencyCols,
  printable = true,
}: {
  filename: string
  title: string
  subtitle?: string
  getData: () => { headers: string[]; rows: (string | number | null | undefined)[][] }
  summary?: [string, string][]
  currencyCols?: number[]
  printable?: boolean
}) {
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null)

  const run = async (type: 'xlsx' | 'pdf') => {
    setBusy(type)
    try {
      const { headers, rows } = getData()
      if (type === 'xlsx') {
        await exportXlsx(filename, title, headers, rows, { subtitle, currencyCols })
      } else {
        await exportPdf(filename, title, headers, rows, { subtitle, summary })
      }
    } catch {
      toast.error(`${type.toUpperCase()} oluşturulamadı.`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5 print:hidden">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run('xlsx')}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#1D6F42]/30 bg-[#1D6F42]/10 px-3 py-1.5 text-xs font-bold text-[#1D6F42] transition-colors hover:bg-[#1D6F42]/15 disabled:opacity-50"
      >
        <ExcelIcon className="h-3.5 w-3.5" />
        {busy === 'xlsx' ? 'Hazırlanıyor…' : 'Excel'}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run('pdf')}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D32F2F]/30 bg-[#D32F2F]/10 px-3 py-1.5 text-xs font-bold text-[#D32F2F] transition-colors hover:bg-[#D32F2F]/15 disabled:opacity-50"
      >
        <PdfIcon className="h-3.5 w-3.5" />
        {busy === 'pdf' ? 'Hazırlanıyor…' : 'PDF'}
      </button>
      {printable && (
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 transition-colors hover:bg-primary-100"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
          Yazdır
        </button>
      )}
    </div>
  )
}
