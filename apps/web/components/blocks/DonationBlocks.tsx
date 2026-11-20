'use client'

/**
 * Interactive builder blocks: donation cards (amount, currency, niyet, adet/hisse, months,
 * share progress → donation cart), currency switcher, cart button, closable announcement
 * bar and the message form. Everything talks through window events and localStorage, so
 * the blocks work anywhere on a page and with the site-wide DonationCart.
 */
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { Carousel } from '../site/Carousel'

export type CurrencyCode = 'TRY' | 'USD' | 'EUR'
export const SYMBOL: Record<CurrencyCode, string> = { TRY: '₺', USD: '$', EUR: '€' }
const CURRENCY_KEY = 'site_currency'
const CART_KEY = 'einfak_cart'

type Rates = Partial<Record<CurrencyCode, number>>
let ratesPromise: Promise<Rates> | null = null
function loadRates(): Promise<Rates> {
  ratesPromise ??= axios.get('/api/v1/public/fx-rates')
    .then((r) => Object.fromEntries(Object.entries(r.data?.rates || {}).map(([k, v]: [string, any]) => [k, Number(v?.rate_try)]).filter(([, v]) => v)) as Rates)
    .catch(() => ({}))
  return ratesPromise
}

let orgIbanPromise: Promise<{ iban: string; holder: string }> | null = null
function loadOrgIban(): Promise<{ iban: string; holder: string }> {
  orgIbanPromise ??= axios.get('/api/v1/public/org-settings')
    .then((r) => ({
      iban: String(r.data?.bank1_iban || r.data?.bank2_iban || '').trim(),
      holder: String(r.data?.legal?.name || '').trim(),
    }))
    .catch(() => ({ iban: '', holder: '' }))
  return orgIbanPromise
}

function readCurrency(): CurrencyCode {
  try {
    const v = localStorage.getItem(CURRENCY_KEY)
    return v === 'USD' || v === 'EUR' ? v : 'TRY'
  } catch { return 'TRY' }
}

/** Selected site currency + TCMB rates (TRY per unit). USD/EUR are offered only with a fresh rate. */
export function useSiteCurrency() {
  const [currency, setCurrency] = useState<CurrencyCode>('TRY')
  const [rates, setRates] = useState<Rates>({})
  useEffect(() => {
    setCurrency(readCurrency())
    loadRates().then(setRates)
    const on = (e: Event) => setCurrency((e as CustomEvent<CurrencyCode>).detail)
    window.addEventListener('site-currency-change', on)
    return () => window.removeEventListener('site-currency-change', on)
  }, [])
  const toTry = (c: CurrencyCode) => (c === 'TRY' ? 1 : rates[c])
  const available = (['TRY', 'USD', 'EUR'] as CurrencyCode[]).filter((c) => toTry(c))
  const active: CurrencyCode = available.includes(currency) ? currency : 'TRY'
  /** amount in `from` → active currency (2 decimals); null without a rate */
  const convert = (amount: number, from: CurrencyCode = 'TRY') => {
    const a = toTry(from), b = toTry(active)
    return a && b ? Math.round((amount * a / b) * 100) / 100 : null
  }
  const choose = (c: CurrencyCode) => {
    try { localStorage.setItem(CURRENCY_KEY, c) } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent('site-currency-change', { detail: c }))
  }
  return { currency: active, available, rates, convert, choose }
}

interface CurrencySwitcherProps {
  variant?: string
  light?: boolean
  labelMode?: string
  size?: string
  align?: string
  showRate?: boolean
}

export function CurrencySwitcher({
  variant = 'buttons',
  light,
  labelMode = 'auto',
  size = 'md',
  align = 'left',
  showRate = false,
}: CurrencySwitcherProps) {
  const { currency, available, rates, choose } = useSiteCurrency()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const names: Record<CurrencyCode, string> = { TRY: '₺ Türk Lirası', USD: '$ Dolar', EUR: '€ Euro' }
  const shortLabel = (c: CurrencyCode) => `${SYMBOL[c]} ${c === 'TRY' ? 'TL' : c}`
  const renderLabel = (c: CurrencyCode) => {
    if (labelMode === 'symbol') return SYMBOL[c]
    if (labelMode === 'short') return shortLabel(c)
    if (labelMode === 'full') return names[c]
    return <><span className="sm:hidden">{shortLabel(c)}</span><span className="hidden sm:inline">{names[c]}</span></>
  }
  const textLabel = (c: CurrencyCode) => {
    if (labelMode === 'symbol') return SYMBOL[c]
    if (labelMode === 'short') return shortLabel(c)
    return names[c]
  }

  const list = available.length ? available : (['TRY'] as CurrencyCode[])
  const sm = size === 'sm'
  const justifyCls = align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'
  const rateNote = showRate && currency !== 'TRY' && rates[currency] ? (
    <span className={`text-xs font-medium ${light ? 'text-white/75' : 'opacity-70'}`}>
      1 {currency} = {rates[currency]!.toFixed(2)} ₺
    </span>
  ) : null

  let control: React.ReactNode
  if (variant === 'select') {
    control = (
      <select
        aria-label="Para birimi"
        value={currency}
        onChange={(e) => choose(e.target.value as CurrencyCode)}
        className={`rounded-full border border-current/20 bg-transparent font-semibold ${sm ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm'} ${light ? 'text-white' : ''}`}
      >
        {list.map((c) => <option key={c} value={c} className="text-gray-900">{textLabel(c)}</option>)}
      </select>
    )
  } else if (variant === 'dropdown') {
    control = (
      <div ref={ref} className="relative inline-block text-start">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={`inline-flex items-center gap-1.5 rounded-full border border-current/20 bg-transparent font-semibold transition-colors ${sm ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'} ${light ? 'text-white hover:bg-white/10' : 'hover:bg-black/5'}`}
        >
          <span>{textLabel(currency)}</span>
          <span aria-hidden className={`text-[10px] opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {open && (
          <ul
            role="listbox"
            className={`absolute top-full z-50 mt-1.5 min-w-[150px] rounded-xl border border-black/10 bg-white p-1.5 text-gray-900 shadow-xl ${align === 'right' ? 'end-0' : 'start-0'}`}
          >
            {list.map((c) => {
              const active = c === currency
              return (
                <li key={c}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => { choose(c); setOpen(false) }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-start text-sm transition-colors ${active ? 'bg-primary-50 font-bold text-primary-700' : 'hover:bg-gray-100'}`}
                  >
                    <span>{names[c]}</span>
                    {c !== 'TRY' && rates[c] && <span className="text-[11px] text-gray-400">{rates[c]!.toFixed(2)}₺</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  } else if (variant === 'list') {
    control = (
      <div role="group" aria-label="Para birimi" className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 ${sm ? 'text-xs' : 'text-sm'} ${light ? 'text-white' : ''}`}>
        {list.map((c, i) => (
          <span key={c} className="inline-flex items-center gap-2">
            {i > 0 && <span aria-hidden className="opacity-40">·</span>}
            <button
              type="button"
              onClick={() => choose(c)}
              aria-pressed={currency === c}
              className={`transition-opacity ${currency === c ? 'font-bold underline underline-offset-4' : 'opacity-75 hover:opacity-100'}`}
            >
              {textLabel(c)}
            </button>
          </span>
        ))}
      </div>
    )
  } else {
    control = (
      <div role="group" aria-label="Para birimi" className={`inline-flex rounded-full p-1 font-semibold ${sm ? 'text-xs' : 'text-sm'} ${light ? 'bg-white/15 text-white' : 'bg-black/5'}`}>
        {list.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => choose(c)}
            aria-pressed={currency === c}
            className={`whitespace-nowrap rounded-full transition-colors ${sm ? 'px-2.5 py-1' : 'px-3 py-1.5 sm:px-4'} ${
              currency === c
                ? 'bg-primary-700 text-white shadow-sm'
                : light ? 'hover:bg-white/15' : 'hover:bg-black/5'
            }`}
          >
            {renderLabel(c)}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className={`inline-flex flex-wrap items-center gap-2.5 ${justifyCls}`}>
      {control}
      {rateNote}
    </div>
  )
}

interface CartItemRaw {
  quantity?: number
  amount?: number
  currency?: CurrencyCode
}

function readCartItems(): CartItemRaw[] {
  try {
    const items = JSON.parse(localStorage.getItem(CART_KEY) || '[]')
    return Array.isArray(items) ? items : []
  } catch { return [] }
}

function cartCount(): number {
  return readCartItems().reduce((n, i) => n + (Number(i?.quantity) || 1), 0)
}

interface CartButtonProps {
  label?: string
  showLabel?: boolean
  url?: string
  look?: string
  icon?: string
  showTotal?: boolean
  showZero?: boolean
  hideEmpty?: boolean
  size?: string
  editing?: boolean
}

const CART_SVG: Record<string, React.ReactNode> = {
  cart: (
    <>
      <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2" />
      <circle cx="9.5" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </>
  ),
  bag: (
    <>
      <path d="M6 7h12l1 13H5L6 7z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </>
  ),
  heart: (
    <path d="M12 20.5s-7.5-4.7-9.5-9.2A5.2 5.2 0 0 1 12 6.2a5.2 5.2 0 0 1 9.5 5.1c-2 4.5-9.5 9.2-9.5 9.2z" />
  ),
  gift: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12h14v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8z" />
      <path d="M12 8v13" />
      <path d="M12 8H8.5a2 2 0 1 1 0-4C11 4 12 8 12 8zM12 8h3.5a2 2 0 1 0 0-4C13 4 12 8 12 8z" />
    </>
  ),
}

export function CartButton({
  label = 'Sepetim',
  showLabel,
  url = '/bagis/sepetim',
  look = 'icon',
  icon = 'cart',
  showTotal = false,
  showZero = false,
  hideEmpty = false,
  size = 'md',
  editing = false,
}: CartButtonProps) {
  const [items, setItems] = useState<CartItemRaw[]>([])
  const { currency, convert } = useSiteCurrency()

  useEffect(() => {
    const update = () => setItems(readCartItems())
    update()
    window.addEventListener('donation-cart-changed', update)
    window.addEventListener('storage', update)
    return () => { window.removeEventListener('donation-cart-changed', update); window.removeEventListener('storage', update) }
  }, [])

  const count = items.reduce((n, i) => n + (Number(i?.quantity) || 1), 0)
  if (!editing && hideEmpty && count === 0) return null

  const totalAmount = showTotal
    ? items.reduce((sum, i) => {
        const amt = Number(i?.amount) || 0
        const converted = convert(amt, i?.currency || 'TRY')
        return sum + (converted ?? amt)
      }, 0)
    : 0

  const showBadge = count > 0 || showZero
  const inlineBadge = look !== 'icon' || Boolean(showLabel) || (showTotal && count > 0)
  const iconSizeCls = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'
  const textSizeCls = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'
  const padCls = size === 'sm' ? 'px-3 py-1.5' : size === 'lg' ? 'px-5 py-2.5' : 'px-3.5 py-2'

  const lookCls = look === 'pill'
    ? `rounded-full border border-current/20 hover:bg-current/10 ${padCls}`
    : look === 'boxed'
      ? `rounded-lg border border-current/20 bg-current/[0.04] hover:bg-current/10 ${padCls}`
      : look === 'solid'
        ? `rounded-full bg-primary-600 text-white shadow-sm hover:bg-primary-700 ${padCls}`
        : 'hover:opacity-80'

  return (
    <Link
      href={url}
      aria-label={`${label}${count ? ` (${count})` : ''}`}
      className={`relative inline-flex items-center gap-2 font-semibold transition-colors ${textSizeCls} ${lookCls}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className={iconSizeCls} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {CART_SVG[icon] || CART_SVG.cart}
      </svg>
      {showLabel && <span>{label}</span>}
      {showTotal && count > 0 && (
        <span className="tabular-nums opacity-90">
          {SYMBOL[currency]}{Math.round(totalAmount).toLocaleString('tr-TR')}
        </span>
      )}
      {showBadge && (
        <span
          className={
            inlineBadge
              ? `min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-bold leading-[20px] ${
                  look === 'solid' ? 'bg-white/25 text-white' : 'bg-accent-500 text-white'
                }`
              : 'absolute -end-2.5 -top-2 min-w-[18px] rounded-full bg-accent-500 px-1 text-center text-[11px] font-bold leading-[18px] text-white'
          }
        >
          {count}
        </span>
      )}
    </Link>
  )
}

const ANNOUNCE_TONE: Record<string, string> = {
  danger: 'bg-[#FF0000] text-white', rose: 'bg-[#DC3545] text-white', brand: 'bg-primary-700 text-white', accent: 'bg-accent-500 text-white',
  dark: 'bg-gray-900 text-white', warning: 'bg-amber-400 text-amber-950',
}

export interface AnnouncementItem {
  badge?: string
  text?: string
  url?: string
}

export function AnnouncementBar({
  id,
  text,
  url,
  tone,
  icon,
  iconUrl,
  look = 'solid',
  badge,
  buttonLabel,
  endDate,
  items,
  sticky = false,
  locale = 'tr',
  closable = true,
  hideDays = 1,
  editing,
}: {
  id: string
  text: string
  url?: string
  tone?: string
  icon?: string
  iconUrl?: string
  look?: string
  badge?: string
  buttonLabel?: string
  endDate?: string
  items?: AnnouncementItem[]
  sticky?: boolean
  locale?: string
  closable?: boolean
  hideDays?: number
  editing?: boolean
}) {
  const key = `announce_closed_${id}`
  const [hidden, setHidden] = useState(false)
  const [idx, setIdx] = useState(0)
  const [left, setLeft] = useState<{ d: number; h: number; m: number; s: number } | null>(null)

  const list = (items || []).filter((i) => i?.text)
  const isRotator = look === 'rotator' && list.length > 0

  useEffect(() => {
    if (editing) return
    try {
      if (hideDays === 0) {
        if (sessionStorage.getItem(key) === '1') setHidden(true)
      } else {
        const until = Number(localStorage.getItem(key) || 0)
        if (until && until > Date.now()) setHidden(true)
      }
    } catch { /* private mode */ }
  }, [key, hideDays, editing])

  useEffect(() => {
    if (!isRotator || list.length <= 1) return
    const timer = setInterval(() => setIdx((i) => (i + 1) % list.length), 4500)
    return () => clearInterval(timer)
  }, [isRotator, list.length])

  useEffect(() => {
    if (look !== 'countdown' || !endDate) { setLeft(null); return }
    const target = new Date(endDate).getTime()
    if (!Number.isFinite(target)) { setLeft(null); return }
    const tick = () => {
      const diff = Math.max(0, target - Date.now())
      setLeft({
        d: Math.floor(diff / 86_400_000),
        h: Math.floor((diff % 86_400_000) / 3_600_000),
        m: Math.floor((diff % 3_600_000) / 60_000),
        s: Math.floor((diff % 60_000) / 1000),
      })
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [look, endDate])

  if (hidden) return null

  const close = () => {
    if (editing) return
    setHidden(true)
    try {
      if (hideDays === 0) sessionStorage.setItem(key, '1')
      else localStorage.setItem(key, String(Date.now() + Math.max(hideDays, 1) * 86_400_000))
    } catch { /* ignore */ }
  }

  const activeItem = isRotator ? list[idx % list.length] : null
  const activeBadge = activeItem?.badge || badge
  const activeText = activeItem?.text || text
  const activeUrl = activeItem?.url || url
  const bgCls =
    look === 'gradient' || look === 'gradient_shimmer'
      ? 'bg-gradient-to-r from-primary-700 via-primary-600 to-accent-500 text-white'
      : look === 'countdown_urgent' || look === 'urgent_pulse_bar'
        ? 'bg-red-700 text-white'
        : look === 'dark_gold_marquee'
          ? 'border-b border-amber-500/30 bg-slate-950 text-amber-300'
          : look === 'minimal_border_top'
            ? 'border-b border-gray-200 bg-white text-gray-900'
            : look === 'split_two_links'
              ? 'bg-slate-900 text-white'
              : ANNOUNCE_TONE[tone || 'danger'] || ANNOUNCE_TONE.danger
  const isWarning = (tone === 'warning' || look === 'minimal_border_top') && look !== 'gradient' && look !== 'gradient_shimmer' && look !== 'countdown_urgent' && look !== 'urgent_pulse_bar' && look !== 'split_two_links' && look !== 'dark_gold_marquee'
  const closeLabel = locale === 'en' ? 'Close announcement' : locale === 'ar' ? 'إغلاق الإعلان' : 'Duyuruyu kapat'
  const units = locale === 'en' ? ['d', 'h', 'm', 's'] : locale === 'ar' ? ['ي', 'س', 'د', 'ث'] : ['g', 's', 'd', 'sn']

  const resolvedIconUrl =
    (iconUrl === '/images/edevlet-logo.svg' ? '/images/edevlet-logo.png' : iconUrl) ||
    (activeUrl?.includes('turkiye.gov.tr') && (!icon || icon === '🏛') ? '/images/edevlet-logo.png' : undefined)

  const textNode = (
    <span className="inline-flex items-center justify-center gap-2 font-semibold">
      {resolvedIconUrl ? (
        <img src={resolvedIconUrl} alt="" aria-hidden className="h-6 w-6 shrink-0 object-contain" />
      ) : (
        icon && <span aria-hidden>{icon}</span>
      )}
      <span>{activeText}</span>
    </span>
  )
  const linkedText = activeUrl && !buttonLabel
    ? (activeUrl.startsWith('/') ? <Link href={activeUrl} className="hover:underline">{textNode}</Link> : <a href={activeUrl} className="hover:underline" target="_blank" rel="noopener noreferrer">{textNode}</a>)
    : textNode

  return (
    <div
      className={`relative px-10 py-2.5 text-center text-[14px] sm:text-[15px] ${sticky ? 'sticky top-0 z-40 shadow-sm' : ''} ${bgCls}`}
      data-tone={tone}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
        {isRotator && list.length > 1 && (
          <button type="button" aria-label="Önceki" onClick={() => setIdx((i) => (i - 1 + list.length) % list.length)} className="px-1 text-xs opacity-75 hover:opacity-100">
            ‹
          </button>
        )}
        {(look === 'pulse_urgent' || look === 'urgent_pulse_bar') && (
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
        )}
        {activeBadge && (
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider ${
            isWarning ? 'bg-amber-950 text-amber-100' : 'bg-white/20 text-white'
          }`}>
            {activeBadge}
          </span>
        )}
        {linkedText}
        {look === 'countdown' && left && (
          <span dir="ltr" className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 font-mono text-xs font-extrabold ${
            isWarning ? 'bg-amber-950/15 text-amber-950' : 'bg-black/20 text-white'
          }`}>
            {String(left.d).padStart(2, '0')}{units[0]} : {String(left.h).padStart(2, '0')}{units[1]} : {String(left.m).padStart(2, '0')}{units[2]} : {String(left.s).padStart(2, '0')}{units[3]}
          </span>
        )}
        {buttonLabel && activeUrl && (
          activeUrl.startsWith('/') ? (
            <Link href={activeUrl} className={`rounded-full px-3.5 py-1 text-xs font-extrabold transition ${
              isWarning ? 'bg-amber-950 text-white hover:bg-amber-900' : 'bg-white text-gray-900 hover:bg-gray-100'
            }`}>
              {buttonLabel} →
            </Link>
          ) : (
            <a href={activeUrl} target="_blank" rel="noopener noreferrer" className={`rounded-full px-3.5 py-1 text-xs font-extrabold transition ${
              isWarning ? 'bg-amber-950 text-white hover:bg-amber-900' : 'bg-white text-gray-900 hover:bg-gray-100'
            }`}>
              {buttonLabel} →
            </a>
          )
        )}
        {isRotator && list.length > 1 && (
          <button type="button" aria-label="Sonraki" onClick={() => setIdx((i) => (i + 1) % list.length)} className="px-1 text-xs opacity-75 hover:opacity-100">
            ›
          </button>
        )}
      </div>
      {closable && (
        <button type="button" onClick={close} aria-label={closeLabel} className="absolute end-3 top-1/2 -translate-y-1/2 px-2 text-lg leading-none opacity-80 hover:opacity-100">×</button>
      )}
    </div>
  )
}

// --- Donation cards ----------------------------------------------------------------------

export interface DonationCardView {
  key: string
  campaignId: string
  slug: string
  title: string
  summary?: string
  category?: string
  image?: string
  currency: CurrencyCode
  unit: number | null
  minAmount: number
  quantity: '' | 'adet' | 'hisse'
  maxQuantity: number
  niyet: string[]
  durations: number[]
  shares: { taken: number; total: number } | null
  progress?: { collected: number; target: number; pct: number } | null
  suggestedAmounts?: number[]
  badge?: string
  note?: string
  impactLabel?: string
  tierLabels?: string[]
  region?: string
  icon?: string
  isPopular?: boolean
  features?: string[]
  accentColor?: string
  ribbon?: string
  endDate?: string
  videoUrl?: string
  button: string
  tags: string[]
}

const CARD_L10N: Record<string, {
  invalidAmount: string; minAmount: string; pickNiyet: string; pickNiyetOpt: string
  amountPh: string; added: string; share: string; unitShare: string; unitPiece: string
  month: string; once: string; monthly: string; emptyTab: string; emptyEdit: string
  collected: string; goal: string; payNow: string; onBehalfToggle: string; onBehalfPh: string
  remainingGoal: string; remainingShare: string; inCart: string; shareWa: string
  detailBtn: string; searchPh: string; sortDefault: string; sortProgress: string; close: string
  popular: string; trustZakat: string; trustReceipt: string; bundleAction: string; bundleSelect: string
  stepAmount: string; stepDetail: string; next: string; back: string; daysLeft: string; hoursLeft: string
  tabDonate: string; tabInfo: string; noteToggle: string; notePh: string; peopleLabel: string; watchVideo: string
  ibanCopy: string; ibanCopied: string; anonymousLabel: string
}> = {
  tr: {
    invalidAmount: 'Lütfen geçerli bir tutar giriniz.',
    minAmount: 'En az',
    pickNiyet: 'Lütfen niyet seçiniz.',
    pickNiyetOpt: 'Niyet Seçiniz',
    amountPh: 'Tutar giriniz',
    added: 'Sepete Eklendi',
    share: 'Hisse',
    unitShare: 'Hisse',
    unitPiece: 'Adet',
    month: 'Ay',
    once: 'Tek Seferlik',
    monthly: 'Aylık',
    emptyTab: 'Bu sekmede şu an aktif bağış yok.',
    emptyEdit: 'Gösterilecek aktif kampanya yok',
    collected: 'Toplanan',
    goal: 'Hedef',
    payNow: 'Hemen Öde',
    onBehalfToggle: 'Birinin adına / Hediye',
    onBehalfPh: 'Kimin adına? (isteğe bağlı)',
    remainingGoal: 'Hedefe kalan',
    remainingShare: 'Kalan hisse',
    inCart: 'Sepette',
    shareWa: 'Paylaş',
    detailBtn: 'Detay',
    searchPh: 'Kampanya ara…',
    sortDefault: 'Varsayılan sıra',
    sortProgress: 'Hedefe en yakın',
    close: 'Kapat',
    popular: 'En Çok Tercih Edilen',
    trustZakat: 'Zekâta Uygun',
    trustReceipt: 'Anında Makbuz',
    bundleAction: 'Seçilenleri Sepete Ekle',
    bundleSelect: 'Pakete ekle',
    stepAmount: '1. Tutar',
    stepDetail: '2. Detay & Onay',
    next: 'Devam Et',
    back: 'Geri',
    daysLeft: 'gün kaldı',
    hoursLeft: 'saat kaldı',
    tabDonate: 'Bağış Yap',
    tabInfo: 'Açıklama',
    noteToggle: 'Not / Dua ekle',
    notePh: 'Bağış notunuz veya duanız…',
    peopleLabel: 'Kişi',
    watchVideo: 'Video',
    ibanCopy: 'IBAN ile gönder',
    ibanCopied: 'IBAN kopyalandı ✓',
    anonymousLabel: 'İsmim gizli kalsın',
  },
  en: {
    invalidAmount: 'Please enter a valid amount.',
    minAmount: 'Minimum donation is',
    pickNiyet: 'Please select an intention.',
    pickNiyetOpt: 'Select Intention',
    amountPh: 'Enter amount',
    added: 'Added to Cart',
    share: 'Shares',
    unitShare: 'Share',
    unitPiece: 'Qty',
    month: 'Months',
    once: 'One-Time',
    monthly: 'Monthly',
    emptyTab: 'No active donations in this tab right now.',
    emptyEdit: 'No active campaigns to display',
    collected: 'Raised',
    goal: 'Goal',
    payNow: 'Donate Now',
    onBehalfToggle: 'On behalf of / Gift',
    onBehalfPh: 'Recipient name (optional)',
    remainingGoal: 'Remaining',
    remainingShare: 'Shares left',
    inCart: 'In cart',
    shareWa: 'Share',
    detailBtn: 'Details',
    searchPh: 'Search campaigns…',
    sortDefault: 'Default order',
    sortProgress: 'Closest to goal',
    close: 'Close',
    popular: 'Most Popular',
    trustZakat: 'Zakat Eligible',
    trustReceipt: 'Instant Receipt',
    bundleAction: 'Add Selected to Cart',
    bundleSelect: 'Select',
    stepAmount: '1. Amount',
    stepDetail: '2. Details',
    next: 'Continue',
    back: 'Back',
    daysLeft: 'days left',
    hoursLeft: 'hours left',
    tabDonate: 'Donate',
    tabInfo: 'Details',
    noteToggle: 'Add note',
    notePh: 'Optional note or prayer…',
    peopleLabel: 'People',
    watchVideo: 'Video',
    ibanCopy: 'Send via IBAN',
    ibanCopied: 'IBAN copied ✓',
    anonymousLabel: 'Keep my name anonymous',
  },
  ar: {
    invalidAmount: 'يرجى إدخال مبلغ صحيح.',
    minAmount: 'الحد الأدنى للتبرع هو',
    pickNiyet: 'يرجى اختيار النية.',
    pickNiyetOpt: 'اختر النية',
    amountPh: 'أدخل المبلغ',
    added: 'تمت الإضافة إلى السلة',
    share: 'أسهم',
    unitShare: 'سهم',
    unitPiece: 'العدد',
    month: 'أشهر',
    once: 'مرة واحدة',
    monthly: 'شهريًا',
    emptyTab: 'لا توجد تبرعات نشطة في هذا القسم حالياً.',
    emptyEdit: 'لا توجد حملات نشطة للعرض',
    collected: 'تم جمع',
    goal: 'الهدف',
    payNow: 'تبرع الآن',
    onBehalfToggle: 'نيابةً عن / هدية',
    onBehalfPh: 'اسم المهدى إليه (اختياري)',
    remainingGoal: 'المتبقي',
    remainingShare: 'الأسهم المتبقية',
    inCart: 'في السلة',
    shareWa: 'مشاركة',
    detailBtn: 'التفاصيل',
    searchPh: 'ابحث عن حملة…',
    sortDefault: 'الترتيب الافتراضي',
    sortProgress: 'الأقرب للهدف',
    close: 'إغلاق',
    popular: 'الأكثر اختياراً',
    trustZakat: 'تجوز فيه الزكاة',
    trustReceipt: 'إيصال فوري',
    bundleAction: 'إضافة المحدد للسلة',
    bundleSelect: 'تحديد',
    stepAmount: '1. المبلغ',
    stepDetail: '2. التفاصيل',
    next: 'متابعة',
    back: 'رجوع',
    daysLeft: 'أيام متبقية',
    hoursLeft: 'ساعات متبقية',
    tabDonate: 'تبرع',
    tabInfo: 'التفاصيل',
    noteToggle: 'إضافة ملاحظة',
    notePh: 'ملاحظة أو دعاء (اختياري)…',
    peopleLabel: 'أشخاص',
    watchVideo: 'فيديو',
    ibanCopy: 'التبرع عبر IBAN',
    ibanCopied: 'تم نسخ IBAN ✓',
    anonymousLabel: 'إخفاء اسمي (تبرع مجهول)',
  },
}

function fmt(n: number, c: CurrencyCode, locale = 'tr') {
  const loc = locale === 'tr' ? 'tr-TR' : locale === 'ar' ? 'ar' : 'en'
  return n.toLocaleString(loc, { minimumFractionDigits: c === 'TRY' || Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
}

type CardMode = 'card' | 'list' | 'compact' | 'overlay' | 'split_horizontal' | 'quick_bar' | 'progress_ring' | 'avatar_card' | 'editorial' | 'comparison_table' | 'accordion' | 'wizard' | 'table_rows' | 'tabbed_card'

function ProgressRing({ pct, size = 54 }: { pct: number; size?: number }) {
  const stroke = 5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={stroke} fill="none" className="text-gray-200" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="text-primary-600 transition-all duration-500"
        />
      </svg>
      <span className="absolute text-[11px] font-extrabold text-primary-800">%{pct}</span>
    </div>
  )
}

function DonationCard({
  card,
  editing,
  cardStyle = 'classic',
  cardTheme = 'white',
  amountInputMode = 'standard',
  mode = 'card',
  imageShape = '16/10',
  hoverEffect = 'lift',
  showProgress = false,
  showRemaining = false,
  showSummary = false,
  allowRecurring = false,
  dualCta = false,
  allowOnBehalf = false,
  showCartBadge = true,
  showShare = false,
  showDetailModal = false,
  enableBundleSelect = false,
  bundleSelected = false,
  onToggleBundle,
  showTrustTags = false,
  showApproxFx = false,
  showCountdown = false,
  allowNote = false,
  peopleMultiplier = false,
  showIbanCopy = false,
  iban = '',
  ibanHolder = '',
  allowAnonymous = false,
  onOpenDetail,
  onOpenVideo,
  locale = 'tr',
}: {
  card: DonationCardView
  editing?: boolean
  cardStyle?: string
  cardTheme?: string
  amountInputMode?: string
  mode?: CardMode
  imageShape?: string
  hoverEffect?: string
  showProgress?: boolean
  showRemaining?: boolean
  showSummary?: boolean
  allowRecurring?: boolean
  dualCta?: boolean
  allowOnBehalf?: boolean
  showCartBadge?: boolean
  showShare?: boolean
  showDetailModal?: boolean
  enableBundleSelect?: boolean
  bundleSelected?: boolean
  onToggleBundle?: (id: string) => void
  showTrustTags?: boolean
  showApproxFx?: boolean
  showCountdown?: boolean
  allowNote?: boolean
  peopleMultiplier?: boolean
  showIbanCopy?: boolean
  iban?: string
  ibanHolder?: string
  allowAnonymous?: boolean
  onOpenDetail?: (c: DonationCardView) => void
  onOpenVideo?: (c: DonationCardView) => void
  locale?: string
}) {
  const router = useRouter()
  const { currency, rates, convert } = useSiteCurrency()
  const l = CARD_L10N[locale] || CARD_L10N.tr
  const unit = card.unit != null ? convert(card.unit, card.currency) : null
  const [amount, setAmount] = useState('')
  const [qty, setQty] = useState(1)
  const [people, setPeople] = useState(1)
  const [niyet, setNiyet] = useState('')
  const [months, setMonths] = useState(card.durations[0] || 0)
  const [recurring, setRecurring] = useState<'once' | 'monthly'>('once')
  const [onBehalfOpen, setOnBehalfOpen] = useState(false)
  const [onBehalfName, setOnBehalfName] = useState('')
  const [donorNoteOpen, setDonorNoteOpen] = useState(false)
  const [donorNote, setDonorNote] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [ibanCopied, setIbanCopied] = useState(false)
  const [innerTab, setInnerTab] = useState<'donate' | 'info'>('donate')
  const [accordionOpen, setAccordionOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2>(1)
  const [cartQty, setCartQty] = useState(0)
  const [error, setError] = useState('')
  const [added, setAdded] = useState(false)
  const perUnit = unit ?? Number(amount.replace(',', '.'))
  const total = perUnit * (card.durations.length ? months || 1 : 1) * (peopleMultiplier ? people : 1)
  const minimum = convert(card.minAmount, card.currency) ?? card.minAmount

  useEffect(() => {
    if (!showCartBadge) { setCartQty(0); return }
    const syncCart = () => {
      try {
        const raw = localStorage.getItem(CART_KEY)
        const items: any[] = raw ? JSON.parse(raw) : []
        const count = items.filter((i) => i.campaignId === card.campaignId).reduce((acc, i) => acc + (Number(i.quantity) || 1), 0)
        setCartQty(count)
      } catch { setCartQty(0) }
    }
    syncCart()
    const onAdd = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.campaignId === card.campaignId) {
        setCartQty((prev) => prev + (Number(detail.quantity) || 1))
      }
    }
    window.addEventListener('add-to-donation-cart', onAdd)
    window.addEventListener('storage', syncCart)
    return () => {
      window.removeEventListener('add-to-donation-cart', onAdd)
      window.removeEventListener('storage', syncCart)
    }
  }, [card.campaignId, showCartBadge])

  const add = (goToCheckout = false) => {
    if (editing) return
    if (!perUnit || perUnit <= 0) { setError(l.invalidAmount); return }
    if (perUnit < minimum) { setError(`${l.minAmount} ${fmt(minimum, currency, locale)} ${SYMBOL[currency]}`); return }
    if (card.niyet.length && !niyet) { setError(l.pickNiyet); return }
    setError('')
    const metadata: Record<string, unknown> = {}
    if (niyet) metadata.niyet = niyet
    if (months) metadata.sure_ay = months
    if (card.quantity) metadata.birim = card.quantity
    if (card.note) metadata.not = card.note
    if (allowRecurring) metadata.periyot = recurring === 'monthly' ? 'aylik' : 'tek_sefer'
    if (allowOnBehalf && onBehalfName.trim()) metadata.ad_soyad_adina = onBehalfName.trim()
    if (allowNote && donorNote.trim()) metadata.bagisci_notu = donorNote.trim()
    if (allowAnonymous && anonymous) metadata.anonim = true
    if (peopleMultiplier && people > 1) metadata.kisi_sayisi = people
    const behalfSuffix = allowOnBehalf && onBehalfName.trim() ? ` (${onBehalfName.trim()})` : ''
    const peopleSuffix = peopleMultiplier && people > 1 ? ` · ${people} ${l.peopleLabel}` : ''
    window.dispatchEvent(new CustomEvent('add-to-donation-cart', {
      detail: {
        campaignId: card.campaignId,
        campaignTitle: `${card.title}${niyet ? ` · ${niyet}` : ''}${months ? ` · ${months} ${l.month}` : ''}${peopleSuffix}${allowRecurring && recurring === 'monthly' ? ` · ${l.monthly}` : ''}${behalfSuffix}`,
        amount: total,
        quantity: card.quantity ? qty : 1,
        metadata,
        currency,
      },
    }))
    setAdded(true)
    setTimeout(() => setAdded(false), 2500)
    if (goToCheckout) router.push('/bagis/sepetim')
  }

  const sharePct = card.shares && card.shares.total ? Math.min(100, Math.round((card.shares.taken / card.shares.total) * 100)) : 0
  const rawSuggested = card.suggestedAmounts && card.suggestedAmounts.length > 0
    ? card.suggestedAmounts.map((v) => Math.round(convert(v, card.currency) ?? v))
    : [250, 500, 1000]
  const quickAmounts = unit == null ? rawSuggested.filter((v) => v >= minimum).slice(0, 3) : []

  const hoverCls =
    hoverEffect === 'lift'
      ? 'hover:-translate-y-1 hover:shadow-[0_16px_36px_-8px_rgba(0,0,0,0.12)]'
      : hoverEffect === 'glow'
        ? 'hover:border-primary-400 hover:ring-2 hover:ring-primary-400/35'
        : ''
  const imgHoverCls = hoverEffect === 'zoom' || hoverEffect === 'lift' ? 'transition-transform duration-500 group-hover:scale-105' : ''
  const aspectCls = imageShape === '4/3' ? 'aspect-[4/3]' : imageShape === '1/1' ? 'aspect-square' : 'aspect-[16/10]'

  const isDarkTheme = cardTheme === 'emerald' || cardTheme === 'navy'
  const themeBgCls =
    cardTheme === 'cream'
      ? 'bg-amber-50/70 border-amber-200/80 text-gray-900'
      : cardTheme === 'emerald'
        ? 'bg-emerald-950 border-emerald-800 text-white'
        : cardTheme === 'navy'
          ? 'bg-slate-900 border-slate-700 text-white'
          : 'bg-white'

  const shellCls =
    cardStyle === 'highlight'
      ? `border-2 border-primary-500/80 shadow-lg ring-1 ring-primary-200/60 ${themeBgCls} ${hoverCls}`
      : cardStyle === 'minimal'
        ? `border border-gray-200/70 shadow-none hover:border-gray-300 ${themeBgCls} ${hoverEffect === 'glow' ? 'hover:ring-2 hover:ring-primary-400/30' : ''}`
        : cardStyle === 'bordered'
          ? `border border-gray-200 border-t-4 border-t-primary-600 shadow-sm hover:shadow-md ${themeBgCls} ${hoverCls}`
          : cardStyle === 'glass'
            ? `border border-white/40 ${isDarkTheme ? themeBgCls : 'bg-white/80'} backdrop-blur-md shadow-lg ${hoverCls}`
            : `border border-gray-200/90 ${themeBgCls} shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] hover:border-primary-200 ${hoverCls}`

  const titleCls = isDarkTheme ? 'text-white hover:text-accent-300' : 'text-gray-900 hover:text-primary-700'
  const summaryCls = isDarkTheme ? 'text-white/75' : 'text-gray-600'

  const ctaBtnCls =
    card.accentColor === 'emerald'
      ? 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700'
      : card.accentColor === 'sky'
        ? 'bg-sky-600 shadow-sky-600/20 hover:bg-sky-700'
        : card.accentColor === 'rose'
          ? 'bg-rose-600 shadow-rose-600/20 hover:bg-rose-700'
          : card.accentColor === 'amber'
            ? 'bg-amber-600 shadow-amber-600/20 hover:bg-amber-700'
            : 'bg-primary-600 shadow-primary-600/20 hover:bg-primary-700'

  const countdownText = (() => {
    if (!showCountdown || !card.endDate) return ''
    const ms = new Date(card.endDate).getTime() - Date.now()
    if (!Number.isFinite(ms) || ms <= 0) return ''
    const hours = Math.floor(ms / 3_600_000)
    if (hours >= 24) return `${Math.floor(hours / 24)} ${l.daysLeft}`
    return `${Math.max(1, hours)} ${l.hoursLeft}`
  })()

  const approxFxText = (() => {
    if (!showApproxFx || !total || total <= 0) return ''
    const tryVal = currency === 'TRY' ? total : total * (rates[currency] || 0)
    if (!tryVal) return ''
    const parts: string[] = []
    if (currency !== 'USD' && rates.USD) parts.push(`$${fmt(tryVal / rates.USD, 'USD', locale)}`)
    if (currency !== 'EUR' && rates.EUR) parts.push(`€${fmt(tryVal / rates.EUR, 'EUR', locale)}`)
    if (currency !== 'TRY') parts.push(`${fmt(tryVal, 'TRY', locale)} ₺`)
    return parts.length ? `≈ ${parts.join(' / ')}` : ''
  })()

  const impactText = card.impactLabel
    ? (card.quantity && qty > 1 ? `${qty}× ${card.impactLabel}` : card.impactLabel)
    : ''

  const remainingText = (() => {
    if (!showRemaining) return ''
    if (card.shares && card.shares.total > card.shares.taken) {
      return `${l.remainingShare}: ${card.shares.total - card.shares.taken}`
    }
    if (card.progress && card.progress.target > card.progress.collected) {
      const rem = card.progress.target - card.progress.collected
      return `${l.remainingGoal}: ${fmt(convert(rem, card.currency) ?? rem, currency, locale)} ${SYMBOL[currency]}`
    }
    return ''
  })()

  const controls = (dark = false) => (
    <>
      {allowRecurring && (
        <div className={`grid grid-cols-2 rounded-xl p-1 ${dark ? 'bg-white/10' : 'bg-gray-100'}`}>
          <button
            type="button"
            onClick={() => setRecurring('once')}
            className={`rounded-lg py-1.5 text-xs font-bold transition ${
              recurring === 'once'
                ? 'bg-white text-primary-800 shadow-sm'
                : dark ? 'text-white/80 hover:text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {l.once}
          </button>
          <button
            type="button"
            onClick={() => setRecurring('monthly')}
            className={`rounded-lg py-1.5 text-xs font-bold transition ${
              recurring === 'monthly'
                ? 'bg-white text-primary-800 shadow-sm'
                : dark ? 'text-white/80 hover:text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {l.monthly}
          </button>
        </div>
      )}
      {(card.niyet.length > 0 || card.durations.length > 0) && (
        <div className="flex gap-2">
          {card.niyet.length > 0 && (
            <select aria-label="Niyet" value={niyet} onChange={(e) => setNiyet(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-800 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15">
              <option value="">{l.pickNiyetOpt}</option>
              {card.niyet.map((n) => <option key={n} value={n}>{n}{card.quantity === 'hisse' || /kurban/i.test(card.title) ? ' Kurban' : ''}</option>)}
            </select>
          )}
          {card.durations.length > 0 && (
            <select aria-label="Süre" value={months} onChange={(e) => setMonths(Number(e.target.value))}
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-800 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15">
              {card.durations.map((m) => <option key={m} value={m}>{m} {l.month}</option>)}
            </select>
          )}
        </div>
      )}
      {quickAmounts.length > 0 && amountInputMode === 'tiers' && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {quickAmounts.map((val, idx) => {
            const active = amount === String(val)
            const tierLabel = card.tierLabels?.[idx]
            return (
              <button
                key={val}
                type="button"
                onClick={() => { setAmount(String(val)); setError('') }}
                className={`flex flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center transition-all ${
                  active
                    ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                    : dark
                      ? 'border-white/25 bg-white/10 text-white hover:bg-white/20'
                      : 'border-gray-200 bg-gray-50/70 text-gray-800 hover:border-primary-400 hover:bg-primary-50'
                }`}
              >
                <span className="text-xs font-extrabold">{fmt(val, currency, locale)} {SYMBOL[currency]}</span>
                {tierLabel && <span className={`mt-0.5 text-[10px] font-medium ${active ? 'text-white/90' : dark ? 'text-white/70' : 'text-gray-500'}`}>{tierLabel}</span>}
              </button>
            )
          })}
        </div>
      )}
      {quickAmounts.length > 0 && amountInputMode === 'standard' && (
        <div className="grid grid-cols-3 gap-2">
          {quickAmounts.map((val) => {
            const active = amount === String(val)
            return (
              <button
                key={val}
                type="button"
                onClick={() => { setAmount(String(val)); setError('') }}
                className={`rounded-xl border py-2 text-xs font-bold transition-all ${
                  active
                    ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                    : dark
                      ? 'border-white/25 bg-white/10 text-white hover:bg-white/20'
                      : 'border-gray-200 bg-gray-50/70 text-gray-700 hover:border-primary-400 hover:bg-primary-50 hover:text-primary-800'
                }`}
              >
                {fmt(val, currency, locale)} {SYMBOL[currency]}
              </button>
            )
          })}
        </div>
      )}
      {unit == null && amountInputMode === 'slider' && (() => {
        const sliderMax = Math.max(minimum * 20, (quickAmounts[quickAmounts.length - 1] || 1000) * 3)
        const sliderStep = Math.max(10, Math.round(sliderMax / 40))
        const currentVal = Math.min(sliderMax, Math.max(minimum, Number(amount.replace(',', '.')) || quickAmounts[0] || minimum))
        return (
          <div className={`space-y-1.5 rounded-xl border p-3 ${dark ? 'border-white/20 bg-white/10' : 'border-gray-200 bg-gray-50/70'}`}>
            <div className="flex items-center justify-between text-xs font-bold">
              <span className={dark ? 'text-white/80' : 'text-gray-600'}>{l.amountPh}</span>
              <span className={dark ? 'text-accent-300' : 'text-primary-700'}>{fmt(currentVal, currency, locale)} {SYMBOL[currency]}</span>
            </div>
            <input
              type="range"
              min={minimum}
              max={sliderMax}
              step={sliderStep}
              value={currentVal}
              onChange={(e) => { setAmount(e.target.value); setError('') }}
              className="w-full accent-primary-600"
            />
          </div>
        )
      })()}
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-xl border border-gray-200 bg-white pe-2.5 shadow-inner/5 transition focus-within:border-primary-600 focus-within:ring-2 focus-within:ring-primary-500/15">
          <input inputMode="decimal" aria-label="Tutar" placeholder={l.amountPh} readOnly={unit != null}
            value={unit != null ? fmt(unit * (months || 1), currency, locale) : amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
            className={`min-w-0 flex-1 rounded-xl bg-transparent px-3.5 py-2.5 text-base font-bold outline-none ${unit != null ? 'text-gray-800' : 'text-gray-900 placeholder:text-sm placeholder:font-normal placeholder:text-gray-400'}`} />
          <span className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-extrabold text-gray-600">{SYMBOL[currency]}</span>
        </div>
        {card.quantity && (
          <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button type="button" aria-label="Azalt" onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-gray-600 transition hover:bg-white hover:text-gray-900 hover:shadow-sm">−</button>
            <span className="min-w-[2.2rem] px-1 text-center text-xs font-bold text-gray-900" aria-label={card.quantity === 'hisse' ? l.unitShare : l.unitPiece}>
              {qty}
            </span>
            <button type="button" aria-label="Artır" onClick={() => setQty((q) => Math.min(card.maxQuantity, q + 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-gray-600 transition hover:bg-white hover:text-gray-900 hover:shadow-sm">+</button>
          </div>
        )}
      </div>
      {peopleMultiplier && (
        <div className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${dark ? 'border-white/20 bg-white/10 text-white' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
          <span className="font-semibold">{l.peopleLabel}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPeople((p) => Math.max(1, p - 1))} className="h-6 w-6 rounded-md border border-gray-300 bg-white font-bold text-gray-700">−</button>
            <span className="min-w-[1.5rem] text-center font-extrabold">{people}</span>
            <button type="button" onClick={() => setPeople((p) => Math.min(50, p + 1))} className="h-6 w-6 rounded-md border border-gray-300 bg-white font-bold text-gray-700">+</button>
          </div>
        </div>
      )}
      {allowNote && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setDonorNoteOpen((v) => !v)}
            className={`text-xs font-semibold underline-offset-2 hover:underline ${dark ? 'text-white/85' : 'text-primary-700'}`}
          >
            {donorNoteOpen ? '− ' : '+ '}
            {l.noteToggle}
          </button>
          {donorNoteOpen && (
            <input
              type="text"
              maxLength={140}
              value={donorNote}
              onChange={(e) => setDonorNote(e.target.value)}
              placeholder={l.notePh}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-800 outline-none focus:border-primary-500"
            />
          )}
        </div>
      )}
      {allowOnBehalf && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setOnBehalfOpen((v) => !v)}
            className={`text-xs font-semibold underline-offset-2 hover:underline ${dark ? 'text-white/85' : 'text-primary-700'}`}
          >
            {onBehalfOpen ? '− ' : '+ '}
            {l.onBehalfToggle}
          </button>
          {onBehalfOpen && (
            <input
              type="text"
              maxLength={80}
              value={onBehalfName}
              onChange={(e) => setOnBehalfName(e.target.value)}
              placeholder={l.onBehalfPh}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-800 outline-none focus:border-primary-500"
            />
          )}
        </div>
      )}
      {allowAnonymous && (
        <label className={`flex cursor-pointer items-center gap-2 text-xs font-medium ${dark ? 'text-white/85' : 'text-gray-600'}`}>
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            className="rounded border-gray-300 text-primary-600"
          />
          {l.anonymousLabel}
        </label>
      )}
      {impactText && (
        <p className={`text-xs font-semibold ${dark ? 'text-accent-300' : 'text-emerald-700'}`}>
          ✦ {impactText}
        </p>
      )}
      {approxFxText && (
        <p className={`text-[11px] font-medium ${dark ? 'text-white/70' : 'text-gray-500'}`}>
          {approxFxText}
        </p>
      )}
      {error && <p role="alert" className={`text-xs font-semibold ${dark ? 'text-red-300' : 'text-red-600'}`}>{error}</p>}
      <div className={dualCta ? 'grid grid-cols-2 gap-2' : ''}>
        <button type="button" onClick={() => add(false)}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold uppercase tracking-wider text-white shadow-md transition-all active:scale-[0.99] ${
            added
              ? 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700'
              : `${ctaBtnCls} hover:shadow-lg`
          }`}>
          <span aria-hidden>{added ? '✓' : '♥'}</span>{added ? l.added : card.button}
        </button>
        {dualCta && (
          <button
            type="button"
            onClick={() => add(true)}
            className={`flex w-full items-center justify-center rounded-xl border px-3 py-3.5 text-sm font-bold transition-all active:scale-[0.99] ${
              dark
                ? 'border-white/30 bg-white/15 text-white hover:bg-white/25'
                : 'border-primary-600 bg-primary-50 text-primary-800 hover:bg-primary-100'
            }`}
          >
            {l.payNow} →
          </button>
        )}
      </div>
    </>
  )

  const progressBars = (dark = false) => (
    <>
      {card.shares && (
        <div className={`rounded-xl border p-3 text-xs ${dark ? 'border-white/20 bg-white/10 text-white' : 'border-primary-100 bg-primary-50/60 text-gray-700'}`}>
          <div className="mb-1.5 flex items-center justify-between font-semibold">
            <span><b className={dark ? 'text-white' : 'text-primary-800'}>{card.shares.taken}</b> / {card.shares.total} {l.share}</span>
            <span className="rounded-full bg-primary-700 px-2 py-0.5 text-[11px] font-bold text-white">%{sharePct}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-primary-200/70" role="progressbar" aria-valuenow={sharePct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-gradient-to-r from-primary-600 to-emerald-500 transition-all" style={{ width: `${sharePct}%` }} />
          </div>
        </div>
      )}
      {showProgress && card.progress && (
        <div className="text-xs">
          <div className={`mb-1 flex items-center justify-between font-semibold ${dark ? 'text-white/90' : 'text-gray-700'}`}>
            <span>{l.collected}: <b>{fmt(convert(card.progress.collected, card.currency) ?? card.progress.collected, currency, locale)} {SYMBOL[currency]}</b></span>
            <span className={dark ? 'text-accent-300 font-bold' : 'text-primary-700 font-bold'}>%{card.progress.pct}</span>
          </div>
          <div className={`h-2 overflow-hidden rounded-full ${dark ? 'bg-white/20' : 'bg-gray-200'}`}>
            <div className="h-full rounded-full bg-gradient-to-r from-primary-600 to-accent-500 transition-all" style={{ width: `${card.progress.pct}%` }} />
          </div>
        </div>
      )}
      {remainingText && (
        <div className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${dark ? 'bg-amber-400/20 text-amber-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200/70'}`}>
          {remainingText}
        </div>
      )}
    </>
  )

  const cornerBadge = card.badge || card.note
  const shareHref = typeof window !== 'undefined'
    ? `https://wa.me/?text=${encodeURIComponent(`${card.title} — ${window.location.origin}/kampanyalar/${card.slug}`)}`
    : `https://wa.me/?text=${encodeURIComponent(card.title)}`

  const zakatEligible = card.tags.some((t) => /zekat|zakat/i.test(t)) || /zekat|zakat/i.test(card.category || '')

  const copyIban = () => {
    if (!iban || typeof navigator === 'undefined' || !navigator.clipboard) return
    const text = `${ibanHolder ? `${ibanHolder}\n` : ''}IBAN: ${iban}\nAçıklama: ${card.title}`
    navigator.clipboard.writeText(text).then(() => {
      setIbanCopied(true)
      setTimeout(() => setIbanCopied(false), 2500)
    }).catch(() => {})
  }

  const cardExtras = (dark = false) => ((showCartBadge && cartQty > 0) || showShare || showDetailModal || enableBundleSelect || showTrustTags || (showIbanCopy && Boolean(iban))) ? (
    <div className="space-y-1.5 pt-0.5 text-[11px]">
      {showTrustTags && (
        <div className="flex flex-wrap gap-1.5">
          {zakatEligible && (
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-semibold ${dark ? 'bg-white/10 text-emerald-200' : 'bg-emerald-50 text-emerald-800'}`}>
              ✓ {l.trustZakat}
            </span>
          )}
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-semibold ${dark ? 'bg-white/10 text-white/85' : 'bg-gray-100 text-gray-700'}`}>
            ✓ {l.trustReceipt}
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {enableBundleSelect && onToggleBundle && (
            <label className={`inline-flex cursor-pointer items-center gap-1.5 font-semibold ${dark ? 'text-white/90' : 'text-gray-700'}`}>
              <input
                type="checkbox"
                checked={bundleSelected}
                onChange={() => onToggleBundle(card.campaignId)}
                className="rounded border-gray-300 text-primary-600"
              />
              {l.bundleSelect}
            </label>
          )}
          {showCartBadge && cartQty > 0 && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-bold ${dark ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'}`}>
              ✓ {l.inCart}: {cartQty}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showDetailModal && onOpenDetail && (
            <button
              type="button"
              onClick={() => onOpenDetail(card)}
              className={`font-semibold underline-offset-2 hover:underline ${dark ? 'text-white/80' : 'text-gray-600 hover:text-primary-700'}`}
            >
              {l.detailBtn}
            </button>
          )}
          {showShare && (
            <a
              href={shareHref}
              target="_blank"
              rel="noreferrer"
              className={`font-semibold underline-offset-2 hover:underline ${dark ? 'text-emerald-300' : 'text-emerald-700'}`}
            >
              {l.shareWa} ↗
            </a>
          )}
          {showIbanCopy && iban && (
            <button
              type="button"
              onClick={copyIban}
              className={`font-semibold underline-offset-2 hover:underline ${ibanCopied ? 'text-emerald-600' : dark ? 'text-accent-300' : 'text-primary-700'}`}
            >
              {ibanCopied ? l.ibanCopied : l.ibanCopy}
            </button>
          )}
        </div>
      </div>
    </div>
  ) : null

  if (mode === 'table_rows') {
    return (
      <article className={`grid items-center gap-3 rounded-xl px-4 py-3 transition-all md:grid-cols-[1fr_auto_140px_auto] ${shellCls}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {card.icon && <span className="text-lg">{card.icon}</span>}
            <h3 className={`truncate font-heading text-sm font-bold ${titleCls}`}>
              <Link href={`/kampanyalar/${card.slug}`}>{card.title}</Link>
            </h3>
            {card.region && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-700">{card.region}</span>}
          </div>
          {card.impactLabel && <p className="mt-0.5 truncate text-[11px] text-emerald-700">✦ {card.impactLabel}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {quickAmounts.slice(0, 3).map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => { setAmount(String(val)); setError('') }}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${amount === String(val) ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-gray-50 text-gray-700'}`}
            >
              {fmt(val, currency, locale)} {SYMBOL[currency]}
            </button>
          ))}
        </div>
        <div className="flex items-center rounded-lg border border-gray-200 bg-white pe-2">
          <input
            inputMode="decimal"
            placeholder={l.amountPh}
            readOnly={unit != null}
            value={unit != null ? fmt(unit * (months || 1), currency, locale) : amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
            className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-xs font-bold text-gray-900 outline-none"
          />
          <span className="text-[11px] font-bold text-gray-500">{SYMBOL[currency]}</span>
        </div>
        <button
          type="button"
          onClick={() => add(false)}
          className={`rounded-lg px-4 py-2 text-xs font-bold text-white transition ${added ? 'bg-emerald-600' : ctaBtnCls}`}
        >
          {added ? `✓ ${l.added}` : card.button}
        </button>
        {error && <p className="text-xs font-semibold text-red-600 md:col-span-4">{error}</p>}
      </article>
    )
  }

  if (mode === 'tabbed_card') {
    return (
      <article className={`group relative flex h-full flex-col overflow-hidden rounded-2xl transition-all duration-300 ${shellCls}`}>
        {imageShape !== 'none' && card.image && (
          <Link href={`/kampanyalar/${card.slug}`} className={`relative block ${aspectCls} overflow-hidden bg-primary-950/5`}>
            <img src={card.image} alt={card.title} loading="lazy" className={`h-full w-full object-cover ${imgHoverCls}`} />
          </Link>
        )}
        <div className="flex flex-1 flex-col gap-3 p-5">
          <h3 className={`font-heading text-lg font-bold leading-snug ${titleCls}`}>
            <Link href={`/kampanyalar/${card.slug}`}>{card.title}</Link>
          </h3>
          <div className="grid grid-cols-2 rounded-xl bg-gray-100 p-1 text-xs font-bold">
            <button type="button" onClick={() => setInnerTab('donate')} className={`rounded-lg py-1.5 transition ${innerTab === 'donate' ? 'bg-white text-primary-800 shadow-sm' : 'text-gray-600'}`}>
              {l.tabDonate}
            </button>
            <button type="button" onClick={() => setInnerTab('info')} className={`rounded-lg py-1.5 transition ${innerTab === 'info' ? 'bg-white text-primary-800 shadow-sm' : 'text-gray-600'}`}>
              {l.tabInfo}
            </button>
          </div>
          {innerTab === 'info' ? (
            <div className="flex flex-1 flex-col justify-between gap-3 text-xs leading-relaxed text-gray-600">
              <p>{card.summary || card.impactLabel || card.note || card.title}</p>
              {progressBars(isDarkTheme)}
            </div>
          ) : (
            <div className="mt-auto flex flex-col gap-3">
              {controls(isDarkTheme)}
              {cardExtras(isDarkTheme)}
            </div>
          )}
        </div>
      </article>
    )
  }

  if (mode === 'accordion') {
    return (
      <article className={`overflow-hidden rounded-2xl transition-all duration-200 ${shellCls}`}>
        <button
          type="button"
          onClick={() => setAccordionOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <div className="flex min-w-0 items-center gap-3">
            {card.icon && <span className="text-2xl">{card.icon}</span>}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={`truncate font-heading text-base font-bold ${titleCls}`}>{card.title}</h3>
                {(card.badge || card.note) && (
                  <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-800">{card.badge || card.note}</span>
                )}
                {countdownText && (
                  <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">⏱ {countdownText}</span>
                )}
              </div>
              {unit != null && <p className={`text-xs font-semibold ${summaryCls}`}>{fmt(unit, currency, locale)} {SYMBOL[currency]}</p>}
            </div>
          </div>
          <span className={`shrink-0 text-sm font-bold transition-transform ${accordionOpen ? 'rotate-180' : ''} ${isDarkTheme ? 'text-white/80' : 'text-gray-500'}`}>
            ▾
          </span>
        </button>
        {accordionOpen && (
          <div className={`space-y-3 border-t px-5 pb-5 pt-4 ${isDarkTheme ? 'border-white/10' : 'border-gray-100'}`}>
            {showSummary && card.summary && <p className={`text-xs ${summaryCls}`}>{card.summary}</p>}
            {progressBars(isDarkTheme)}
            {controls(isDarkTheme)}
            {cardExtras(isDarkTheme)}
          </div>
        )}
      </article>
    )
  }

  if (mode === 'wizard') {
    return (
      <article className={`relative flex h-full flex-col overflow-hidden rounded-2xl p-5 transition-all duration-300 sm:p-6 ${shellCls}`}>
        <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-bold">
          <span className={`rounded-full px-2.5 py-0.5 ${wizardStep === 1 ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{l.stepAmount}</span>
          <span className={`rounded-full px-2.5 py-0.5 ${wizardStep === 2 ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{l.stepDetail}</span>
        </div>
        <h3 className="font-heading text-lg font-bold leading-snug">
          <Link href={`/kampanyalar/${card.slug}`} className={`transition-colors ${titleCls}`}>{card.title}</Link>
        </h3>
        {countdownText && <span className="mt-1 inline-flex w-fit rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">⏱ {countdownText}</span>}
        {wizardStep === 1 ? (
          <div className="mt-4 flex flex-1 flex-col gap-3">
            {quickAmounts.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {quickAmounts.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => { setAmount(String(val)); setError('') }}
                    className={`rounded-xl border py-2 text-xs font-bold transition ${amount === String(val) ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-gray-50 text-gray-700'}`}
                  >
                    {fmt(val, currency, locale)} {SYMBOL[currency]}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center rounded-xl border border-gray-200 bg-white pe-2.5">
              <input
                inputMode="decimal"
                placeholder={l.amountPh}
                readOnly={unit != null}
                value={unit != null ? fmt(unit * (months || 1), currency, locale) : amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-base font-bold text-gray-900 outline-none"
              />
              <span className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-extrabold text-gray-600">{SYMBOL[currency]}</span>
            </div>
            {approxFxText && <p className="text-[11px] font-medium text-gray-500">{approxFxText}</p>}
            <button
              type="button"
              onClick={() => {
                if (!perUnit || perUnit <= 0) { setError(l.invalidAmount); return }
                setError('')
                setWizardStep(2)
              }}
              className={`mt-auto w-full rounded-xl py-3 text-sm font-bold text-white shadow-sm ${ctaBtnCls}`}
            >
              {l.next} →
            </button>
            {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          </div>
        ) : (
          <div className="mt-4 flex flex-1 flex-col gap-3">
            {controls(isDarkTheme)}
            <button type="button" onClick={() => setWizardStep(1)} className="text-xs font-semibold text-gray-500 hover:text-gray-800">
              ← {l.back}
            </button>
            {cardExtras(isDarkTheme)}
          </div>
        )}
      </article>
    )
  }

  if (mode === 'comparison_table') {
    const popularRing = card.isPopular ? 'ring-2 ring-primary-500 shadow-xl md:-translate-y-1' : ''
    return (
      <article className={`relative flex h-full flex-col overflow-hidden rounded-3xl p-6 transition-all duration-300 ${shellCls} ${popularRing}`}>
        {card.isPopular && (
          <div className="mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-primary-600 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
            ★ {l.popular}
          </div>
        )}
        <div className="flex items-start justify-between gap-2">
          <div>
            {card.region && <div className={`mb-1 text-xs font-bold ${isDarkTheme ? 'text-accent-300' : 'text-primary-700'}`}>{card.region}</div>}
            <h3 className="font-heading text-xl font-bold leading-snug">
              <Link href={`/kampanyalar/${card.slug}`} className={`transition-colors ${titleCls}`}>{card.title}</Link>
            </h3>
          </div>
          {card.icon && <span className="text-3xl" aria-hidden>{card.icon}</span>}
        </div>
        {unit != null && (
          <div className={`mt-3 text-2xl font-black ${isDarkTheme ? 'text-accent-300' : 'text-primary-700'}`}>
            {fmt(unit, currency, locale)} {SYMBOL[currency]}
          </div>
        )}
        {showSummary && card.summary && <p className={`mt-2 text-xs leading-relaxed ${summaryCls}`}>{card.summary}</p>}
        {card.features && card.features.length > 0 && (
          <ul className={`my-4 space-y-2 border-y py-3.5 text-xs ${isDarkTheme ? 'border-white/15 text-white/90' : 'border-gray-100 text-gray-700'}`}>
            {card.features.map((feat, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-bold text-emerald-500">✓</span>
                <span>{feat}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-col gap-3 pt-2">
          {progressBars(isDarkTheme)}
          {controls(isDarkTheme)}
          {cardExtras(isDarkTheme)}
        </div>
      </article>
    )
  }

  if (mode === 'avatar_card') {
    return (
      <article className={`group flex h-full flex-col items-center rounded-2xl p-6 text-center transition-all duration-300 ${shellCls}`}>
        {imageShape !== 'none' && card.image && (
          <Link href={`/kampanyalar/${card.slug}`} className="mb-4 block h-24 w-24 overflow-hidden rounded-full ring-4 ring-primary-100">
            <img src={card.image} alt={card.title} loading="lazy" className={`h-full w-full object-cover ${imgHoverCls}`} />
          </Link>
        )}
        {cornerBadge && (
          <span className={`mb-2 inline-flex items-center rounded-full px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider ${isDarkTheme ? 'bg-white/15 text-accent-300' : 'bg-primary-50 text-primary-800'}`}>
            {cornerBadge}
          </span>
        )}
        <h3 className="font-heading text-lg font-bold leading-snug">
          <Link href={`/kampanyalar/${card.slug}`} className={`transition-colors ${titleCls}`}>{card.title}</Link>
        </h3>
        {showSummary && card.summary && <p className={`mt-1.5 line-clamp-2 text-xs ${summaryCls}`}>{card.summary}</p>}
        <div className="mt-4 w-full space-y-3 text-left">
          {progressBars(isDarkTheme)}
          {controls(isDarkTheme)}
          {cardExtras(isDarkTheme)}
        </div>
      </article>
    )
  }

  if (mode === 'editorial') {
    return (
      <article className={`group grid overflow-hidden rounded-3xl transition-all duration-300 md:grid-cols-[1.2fr_1fr] ${shellCls}`}>
        <div className="flex flex-col justify-between gap-4 p-6 sm:p-8">
          <div className="space-y-3">
            {cornerBadge && (
              <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${isDarkTheme ? 'bg-white/15 text-accent-300' : 'bg-primary-50 text-primary-800'}`}>
                {cornerBadge}
              </span>
            )}
            <h3 className="font-heading text-2xl font-bold leading-tight">
              <Link href={`/kampanyalar/${card.slug}`} className={`transition-colors ${titleCls}`}>{card.title}</Link>
            </h3>
            {card.summary && <p className={`border-s-2 border-primary-500/40 ps-3.5 text-sm italic leading-relaxed ${summaryCls}`}>{card.summary}</p>}
          </div>
          {imageShape !== 'none' && card.image && (
            <Link href={`/kampanyalar/${card.slug}`} className="block aspect-[16/9] overflow-hidden rounded-2xl bg-primary-950/5">
              <img src={card.image} alt={card.title} loading="lazy" className={`h-full w-full object-cover ${imgHoverCls}`} />
            </Link>
          )}
        </div>
        <div className={`flex flex-col justify-center gap-3 border-t p-6 md:border-s md:border-t-0 ${isDarkTheme ? 'border-white/10 bg-black/20' : 'border-gray-100 bg-gray-50/50'}`}>
          {progressBars(isDarkTheme)}
          {controls(isDarkTheme)}
          {cardExtras(isDarkTheme)}
        </div>
      </article>
    )
  }

  if (mode === 'quick_bar') {
    return (
      <article className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3.5 transition-all duration-200 sm:px-5 ${shellCls}`}>
        <div className="min-w-[180px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-base font-bold text-gray-900">
              <Link href={`/kampanyalar/${card.slug}`} className="hover:text-primary-700">{card.title}</Link>
            </h3>
            {cornerBadge && (
              <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-800">{cornerBadge}</span>
            )}
            {remainingText && (
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">{remainingText}</span>
            )}
          </div>
          {impactText && <p className="mt-0.5 text-xs font-medium text-emerald-700">✦ {impactText}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {quickAmounts.map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => { setAmount(String(val)); setError('') }}
              className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                amount === String(val)
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-primary-400 hover:bg-primary-50'
              }`}
            >
              {fmt(val, currency, locale)} {SYMBOL[currency]}
            </button>
          ))}
          <div className="flex w-28 items-center rounded-xl border border-gray-200 bg-white pe-2">
            <input
              inputMode="decimal"
              aria-label="Tutar"
              placeholder={l.amountPh}
              readOnly={unit != null}
              value={unit != null ? fmt(unit * (months || 1), currency, locale) : amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
              className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-sm font-bold text-gray-900 outline-none placeholder:text-xs placeholder:font-normal"
            />
            <span className="text-xs font-bold text-gray-500">{SYMBOL[currency]}</span>
          </div>
          <button
            type="button"
            onClick={() => add(false)}
            className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition ${
              added ? 'bg-emerald-600' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {added ? `✓ ${l.added}` : card.button}
          </button>
        </div>
        {error && <p role="alert" className="w-full text-xs font-semibold text-red-600">{error}</p>}
      </article>
    )
  }

  if (mode === 'split_horizontal') {
    return (
      <article className={`group grid overflow-hidden rounded-2xl transition-all duration-300 sm:grid-cols-[40%_1fr] ${shellCls}`}>
        {imageShape !== 'none' && (
          <Link href={`/kampanyalar/${card.slug}`} className="relative block min-h-[200px] overflow-hidden bg-primary-950/5">
            {card.image && (
              <img src={card.image} alt={card.title} loading="lazy" className={`h-full w-full object-cover ${imgHoverCls}`} />
            )}
            {cornerBadge && (
              <span className="absolute start-3 top-3 inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-800 shadow-sm">
                {cornerBadge}
              </span>
            )}
          </Link>
        )}
        <div className="flex flex-1 flex-col gap-3 p-5 sm:col-span-1">
          <h3 className="font-heading text-lg font-bold leading-snug text-gray-900">
            <Link href={`/kampanyalar/${card.slug}`} className="transition-colors hover:text-primary-700">{card.title}</Link>
          </h3>
          {showSummary && card.summary && <p className="line-clamp-2 text-xs text-gray-600">{card.summary}</p>}
          {progressBars(false)}
          <div className="mt-auto flex flex-col gap-2.5 pt-1">{controls(false)}</div>
        </div>
      </article>
    )
  }

  if (mode === 'progress_ring') {
    const pct = card.shares?.total ? sharePct : (card.progress?.pct ?? 0)
    return (
      <article className={`group flex h-full flex-col overflow-hidden rounded-2xl transition-all duration-300 ${shellCls}`}>
        {imageShape !== 'none' && (
          <Link href={`/kampanyalar/${card.slug}`} className={`relative block ${aspectCls} overflow-hidden bg-primary-950/5`}>
            {card.image && <img src={card.image} alt={card.title} loading="lazy" className={`h-full w-full object-cover ${imgHoverCls}`} />}
            {cornerBadge && (
              <span className="absolute start-3 top-3 inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-800 shadow-sm">
                {cornerBadge}
              </span>
            )}
          </Link>
        )}
        <div className="flex flex-1 flex-col gap-3.5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-heading text-[19px] font-bold leading-snug text-gray-900">
                <Link href={`/kampanyalar/${card.slug}`} className="transition-colors hover:text-primary-700">{card.title}</Link>
              </h3>
              {showSummary && card.summary && <p className="mt-1 line-clamp-2 text-xs text-gray-600">{card.summary}</p>}
            </div>
            {(card.progress || card.shares) && <ProgressRing pct={pct} />}
          </div>
          {remainingText && (
            <div className="inline-flex w-fit items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200/70">
              {remainingText}
            </div>
          )}
          <div className="mt-auto flex flex-col gap-3 pt-1">{controls(false)}</div>
        </div>
      </article>
    )
  }

  if (mode === 'overlay') {
    return (
      <article className="group relative flex min-h-[420px] flex-col justify-end overflow-hidden rounded-2xl bg-primary-950 text-white shadow-lg">
        {card.image && (
          <img src={card.image} alt={card.title} loading="lazy" className={`absolute inset-0 h-full w-full object-cover ${imgHoverCls}`} />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/70 to-gray-950/20" />
        <div className="relative flex flex-col gap-3 p-5 sm:p-6">
          {cornerBadge && (
            <span className="inline-flex w-fit items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-accent-300 backdrop-blur">
              {cornerBadge}
            </span>
          )}
          <h3 className="font-heading text-xl font-bold leading-snug text-white">
            <Link href={`/kampanyalar/${card.slug}`} className="hover:underline">{card.title}</Link>
          </h3>
          {showSummary && card.summary && <p className="line-clamp-2 text-xs text-white/80">{card.summary}</p>}
          {progressBars(true)}
          {controls(true)}
        </div>
      </article>
    )
  }

  if (mode === 'compact') {
    return (
      <article className={`flex h-full flex-col gap-3 rounded-2xl p-5 transition-all duration-200 ${shellCls}`}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-heading text-lg font-bold leading-snug text-gray-900">
            <Link href={`/kampanyalar/${card.slug}`} className="transition-colors hover:text-primary-700">{card.title}</Link>
          </h3>
          {cornerBadge && (
            <span className="shrink-0 rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-800">{cornerBadge}</span>
          )}
        </div>
        {showSummary && card.summary && <p className="line-clamp-2 text-xs text-gray-600">{card.summary}</p>}
        {progressBars(false)}
        <div className="mt-auto flex flex-col gap-2.5 pt-1">{controls(false)}</div>
      </article>
    )
  }

  if (mode === 'list') {
    return (
      <article className={`group grid overflow-hidden rounded-2xl transition-all duration-300 md:grid-cols-[260px_1fr_320px] ${shellCls}`}>
        {imageShape !== 'none' && (
          <Link href={`/kampanyalar/${card.slug}`} className="relative block min-h-[190px] overflow-hidden bg-primary-950/5">
            {card.image && (
              <img src={card.image} alt={card.title} loading="lazy" className={`h-full w-full object-cover ${imgHoverCls}`} />
            )}
            {cornerBadge && (
              <span className="absolute start-3 top-3 inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-800 shadow-sm">
                {cornerBadge}
              </span>
            )}
          </Link>
        )}
        <div className="flex flex-col justify-center gap-2.5 p-5 sm:p-6">
          <h3 className="font-heading text-xl font-bold leading-snug text-gray-900">
            <Link href={`/kampanyalar/${card.slug}`} className="transition-colors hover:text-primary-700">{card.title}</Link>
          </h3>
          {showSummary && card.summary && <p className="line-clamp-2 text-sm text-gray-600">{card.summary}</p>}
          {progressBars(false)}
        </div>
        <div className="flex flex-col justify-center gap-2.5 border-t border-gray-100 bg-gray-50/50 p-5 md:border-s md:border-t-0">
          {controls(false)}
        </div>
      </article>
    )
  }

  return (
    <article className={`group relative flex h-full flex-col overflow-hidden rounded-2xl transition-all duration-300 ${shellCls} ${card.isPopular ? 'ring-2 ring-primary-500 shadow-xl' : ''}`}>
      {card.ribbon && (
        <span className="pointer-events-none absolute -end-8 top-4 z-10 rotate-45 bg-rose-600 px-9 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-md">
          {card.ribbon}
        </span>
      )}
      {card.isPopular && (
        <div className="bg-primary-600 px-3 py-1 text-center text-[11px] font-extrabold uppercase tracking-wider text-white">
          ★ {l.popular}
        </div>
      )}
      {card.icon ? (
        <div className={`flex items-center justify-between px-5 pt-5 ${isDarkTheme ? 'text-white' : 'text-gray-900'}`}>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-3xl shadow-sm">{card.icon}</span>
          {(card.region || cornerBadge) && (
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${isDarkTheme ? 'bg-white/15 text-accent-300' : 'bg-primary-50 text-primary-800'}`}>
              {card.region || cornerBadge}
            </span>
          )}
        </div>
      ) : imageShape !== 'none' ? (
        <Link href={`/kampanyalar/${card.slug}`} className={`relative block ${aspectCls} overflow-hidden bg-primary-950/5`}>
          {card.image && (
            <img
              src={card.image}
              alt={card.title}
              loading="lazy"
              className={`h-full w-full object-cover ${imgHoverCls}`}
            />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" aria-hidden />
          {cornerBadge && (
            <span className="absolute start-3 top-3 inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-800 shadow-sm backdrop-blur">
              {cornerBadge}
            </span>
          )}
          {card.region && (
            <span className="absolute end-3 top-3 inline-flex items-center rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
              {card.region}
            </span>
          )}
          {card.videoUrl && onOpenVideo && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenVideo(card) }}
              className="absolute bottom-3 end-3 inline-flex items-center gap-1 rounded-full bg-black/75 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur transition hover:bg-primary-600"
            >
              ▶ {l.watchVideo}
            </button>
          )}
        </Link>
      ) : null}
      <div className="flex flex-1 flex-col gap-3.5 p-5 sm:p-6">
        {!card.icon && imageShape === 'none' && (cornerBadge || card.region) && (
          <div className="flex flex-wrap gap-1.5">
            {cornerBadge && (
              <span className={`inline-flex w-fit items-center rounded-full px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider ${isDarkTheme ? 'bg-white/15 text-accent-300' : 'bg-primary-50 text-primary-800'}`}>
                {cornerBadge}
              </span>
            )}
            {card.region && (
              <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${isDarkTheme ? 'bg-white/10 text-white/85' : 'bg-gray-100 text-gray-700'}`}>
                {card.region}
              </span>
            )}
          </div>
        )}
        <h3 className="font-heading text-[19px] font-bold leading-snug">
          <Link href={`/kampanyalar/${card.slug}`} className={`transition-colors ${titleCls}`}>{card.title}</Link>
        </h3>
        {countdownText && (
          <span className="inline-flex w-fit items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200/70">
            ⏱ {countdownText}
          </span>
        )}
        {showSummary && card.summary && <p className={`line-clamp-2 text-sm ${summaryCls}`}>{card.summary}</p>}
        {progressBars(isDarkTheme)}
        <div className="mt-auto flex flex-col gap-3 pt-1">
          {controls(isDarkTheme)}
          {cardExtras(isDarkTheme)}
        </div>
      </div>
    </article>
  )
}

export function DonationCards({
  cards,
  tabs,
  layout = 'grid',
  columns = 3,
  cardStyle = 'classic',
  cardTheme = 'white',
  amountInputMode = 'standard',
  imageShape = '16/10',
  hoverEffect = 'lift',
  autoplay = true,
  switcher,
  showProgress = false,
  showRemaining = false,
  showSummary = false,
  allowRecurring = false,
  dualCta = false,
  allowOnBehalf = false,
  showCartBadge = true,
  showShare = false,
  showSearchSort = false,
  showDetailModal = false,
  enableBundleSelect = false,
  showTrustTags = false,
  showApproxFx = false,
  showCountdown = false,
  allowNote = false,
  peopleMultiplier = false,
  showIbanCopy = false,
  iban = '',
  ibanHolder = '',
  allowAnonymous = false,
  ctaLabel,
  ctaUrl = '/kampanyalar',
  locale = 'tr',
  editing,
  title,
}: {
  cards: DonationCardView[]
  tabs?: { label: string; tag: string }[]
  layout?: string
  columns?: number
  cardStyle?: string
  cardTheme?: string
  amountInputMode?: string
  imageShape?: string
  hoverEffect?: string
  autoplay?: boolean
  switcher?: boolean
  showProgress?: boolean
  showRemaining?: boolean
  showSummary?: boolean
  allowRecurring?: boolean
  dualCta?: boolean
  allowOnBehalf?: boolean
  showCartBadge?: boolean
  showShare?: boolean
  showSearchSort?: boolean
  showDetailModal?: boolean
  enableBundleSelect?: boolean
  showTrustTags?: boolean
  showApproxFx?: boolean
  showCountdown?: boolean
  allowNote?: boolean
  peopleMultiplier?: boolean
  showIbanCopy?: boolean
  iban?: string
  ibanHolder?: string
  allowAnonymous?: boolean
  ctaLabel?: string
  ctaUrl?: string
  locale?: string
  editing?: boolean
  title?: string
}) {
  const l = CARD_L10N[locale] || CARD_L10N.tr
  const pathname = usePathname()
  const isBagisRoute = pathname === '/bagis' || Boolean(pathname?.startsWith('/bagis/'))
  const pathTag = useMemo(() => {
    const m = pathname?.match(/^\/bagis\/([^/]+)$/)
    return m ? decodeURIComponent(m[1]) : null
  }, [pathname])
  const [tab, setTab] = useState(() => (pathTag && tabs?.some((t) => t.tag === pathTag) ? pathTag : tabs?.[0]?.tag || ''))
  useEffect(() => {
    if (pathTag && tabs?.some((t) => t.tag === pathTag)) {
      setTab(pathTag)
      return
    }
    // Old links like /bagis?tab=kurban open that tab (and normalize URL on /bagis).
    const wanted = new URLSearchParams(window.location.search).get('tab')
    if (wanted && tabs?.some((t) => t.tag === wanted)) {
      setTab(wanted)
      if (isBagisRoute && !editing) {
        window.history.replaceState(null, '', `/bagis/${encodeURIComponent(wanted)}`)
      }
    }
  }, [tabs, pathTag, isBagisRoute, editing])
  const selectTab = (nextTag: string) => {
    setTab(nextTag)
    if (isBagisRoute && !editing) {
      window.history.replaceState(null, '', `/bagis/${encodeURIComponent(nextTag)}`)
    }
  }
  const [searchQ, setSearchQ] = useState('')
  const [sortBy, setSortBy] = useState<'default' | 'progress'>('default')
  const [detailCard, setDetailCard] = useState<DonationCardView | null>(null)
  const [videoCard, setVideoCard] = useState<DonationCardView | null>(null)
  const [bundleIds, setBundleIds] = useState<string[]>([])
  const [resolvedIban, setResolvedIban] = useState({ iban, holder: ibanHolder })
  const { currency, convert } = useSiteCurrency()

  useEffect(() => {
    if (!showIbanCopy || iban) return
    loadOrgIban().then((res) => {
      if (res.iban) setResolvedIban({ iban: res.iban, holder: res.holder || ibanHolder })
    })
  }, [showIbanCopy, iban, ibanHolder])

  const toggleBundle = (id: string) => {
    setBundleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const addBundleToCart = () => {
    if (editing || !bundleIds.length) return
    for (const id of bundleIds) {
      const c = shown.find((x) => x.campaignId === id)
      if (!c) continue
      const unitAmt = c.unit != null ? (convert(c.unit, c.currency) ?? c.unit) : null
      const fallbackAmt = c.suggestedAmounts?.[0] ? (convert(c.suggestedAmounts[0], c.currency) ?? c.suggestedAmounts[0]) : (convert(c.minAmount, c.currency) ?? c.minAmount)
      const amt = unitAmt ?? fallbackAmt
      window.dispatchEvent(new CustomEvent('add-to-donation-cart', {
        detail: { campaignId: c.campaignId, campaignTitle: c.title, amount: amt, quantity: 1, metadata: {}, currency },
      }))
    }
    setBundleIds([])
  }

  const shown = useMemo(() => {
    let list = tabs?.length ? cards.filter((c) => c.tags.includes(tab)) : cards
    if (showSearchSort && searchQ.trim()) {
      const q = searchQ.trim().toLocaleLowerCase('tr-TR')
      list = list.filter((c) => c.title.toLocaleLowerCase('tr-TR').includes(q) || (c.summary || '').toLocaleLowerCase('tr-TR').includes(q))
    }
    if (showSearchSort && sortBy === 'progress') {
      list = [...list].sort((a, b) => (b.progress?.pct ?? 0) - (a.progress?.pct ?? 0))
    }
    return list
  }, [cards, tabs, tab, showSearchSort, searchQ, sortBy])
  const cols =
    shown.length === 1
      ? 'mx-auto max-w-md grid-cols-1'
      : shown.length === 2
        ? 'mx-auto max-w-4xl sm:grid-cols-2'
        : ({ 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' } as Record<number, string>)[columns] || 'sm:grid-cols-2 lg:grid-cols-3'
  if (!cards.length) return editing ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-400">{l.emptyEdit}</p> : null
  const cardMode: CardMode =
    layout === 'list' || layout === 'compact_row_cards'
      ? 'list'
      : layout === 'compact' || layout === 'impact_badge_grid'
        ? 'compact'
        : layout === 'overlay'
          ? 'overlay'
          : layout === 'split_horizontal'
            ? 'split_horizontal'
            : layout === 'quick_bar'
              ? 'quick_bar'
              : layout === 'progress_ring'
                ? 'progress_ring'
                : layout === 'avatar_card'
                  ? 'avatar_card'
                  : layout === 'editorial'
                    ? 'editorial'
                    : layout === 'comparison_table'
                      ? 'comparison_table'
                      : layout === 'accordion'
                        ? 'accordion'
                        : layout === 'wizard'
                          ? 'wizard'
                          : layout === 'table_rows'
                            ? 'table_rows'
                            : layout === 'tabbed_card'
                              ? 'tabbed_card'
                              : 'card'

  const sharedProps = {
    editing,
    cardStyle,
    cardTheme,
    amountInputMode,
    imageShape,
    hoverEffect,
    showProgress,
    showRemaining,
    showSummary,
    allowRecurring,
    dualCta,
    allowOnBehalf,
    showCartBadge,
    showShare,
    showDetailModal,
    enableBundleSelect,
    showTrustTags,
    showApproxFx,
    showCountdown,
    allowNote,
    peopleMultiplier,
    showIbanCopy,
    iban: resolvedIban.iban,
    ibanHolder: resolvedIban.holder,
    allowAnonymous,
    onToggleBundle: toggleBundle,
    onOpenDetail: showDetailModal ? setDetailCard : undefined,
    onOpenVideo: setVideoCard,
    locale,
  }

  const wrapLayoutCls =
    layout === 'dark_gold' || layout === 'dark_gold_cards' || layout === 'gold_accent_cards'
      ? 'rounded-3xl bg-gradient-to-br from-gray-950 via-gray-900 to-amber-950/60 p-6 ring-1 ring-amber-500/20 sm:p-8'
      : layout === 'emerald_highlight_cards'
        ? 'rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-primary-950 p-6 ring-1 ring-emerald-400/20 sm:p-8'
      : layout === 'minimal_border_cards'
        ? 'rounded-3xl border border-gray-200 bg-gray-50/50 p-6 sm:p-8'
        : layout === 'badge_ribbon_cards'
          ? 'rounded-3xl border border-primary-100 bg-primary-50/30 p-6 sm:p-8'
          : ''

  return (
    <div className={wrapLayoutCls}>
      {(switcher || !!tabs?.length) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          {!!tabs?.length && (
            <div role="tablist" aria-label="Bağış türleri" className="flex flex-wrap gap-2">
              {tabs.map((t) => (
                <button key={t.tag} role="tab" type="button" aria-selected={tab === t.tag} onClick={() => selectTab(t.tag)}
                  className={`rounded-full px-5 py-2 text-[15px] font-semibold transition-colors ${tab === t.tag ? 'bg-primary-700 text-white' : 'bg-white text-gray-700 shadow-sm hover:bg-primary-50'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {switcher && <CurrencySwitcher />}
        </div>
      )}
      {showSearchSort && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <input
            type="search"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder={l.searchPh}
            className="min-w-[220px] flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-primary-500 sm:max-w-xs"
          />
          <select
            aria-label="Sıralama"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'default' | 'progress')}
            className="rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-700 outline-none focus:border-primary-500"
          >
            <option value="default">{l.sortDefault}</option>
            <option value="progress">{l.sortProgress}</option>
          </select>
        </div>
      )}
      {layout === 'carousel' && shown.length > columns ? (
        <Carousel label={title || 'Bağış kartları'} autoplay={autoplay} editing={editing} items={columns >= 4 ? 'w-[85%] sm:w-[46%] lg:w-[23.5%]' : 'w-[85%] sm:w-[46%] lg:w-[31.5%]'}>
          {shown.map((c) => (
            <DonationCard key={c.key} card={c} {...sharedProps} />
          ))}
        </Carousel>
      ) : layout === 'editorial' ? (
        <div className="flex flex-col gap-6">
          {shown.map((c) => (
            <DonationCard key={c.key} card={c} mode="editorial" {...sharedProps} />
          ))}
        </div>
      ) : layout === 'list' || layout === 'compact_row_cards' ? (
        <div className="flex flex-col gap-5">
          {shown.map((c) => (
            <DonationCard key={c.key} card={c} mode="list" {...sharedProps} />
          ))}
        </div>
      ) : layout === 'quick_bar' ? (
        <div className="flex flex-col gap-3">
          {shown.map((c) => (
            <DonationCard key={c.key} card={c} mode="quick_bar" {...sharedProps} />
          ))}
        </div>
      ) : layout === 'split_horizontal' ? (
        <div className={`grid gap-6 ${shown.length === 1 ? 'mx-auto max-w-2xl grid-cols-1' : 'lg:grid-cols-2'}`}>
          {shown.map((c) => (
            <DonationCard key={c.key} card={c} mode="split_horizontal" {...sharedProps} />
          ))}
        </div>
      ) : layout === 'bento' && shown.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className={shown.length > 1 ? 'lg:col-span-2 lg:row-span-2' : 'lg:col-span-3'}>
            <DonationCard key={shown[0].key} card={shown[0]} mode="overlay" {...sharedProps} />
          </div>
          {shown.slice(1).map((c) => (
            <DonationCard key={c.key} card={c} mode="card" {...sharedProps} />
          ))}
        </div>
      ) : layout === 'mobile_snap' ? (
        <div className={`flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 sm:grid sm:gap-6 sm:overflow-visible sm:pb-0 ${cols}`}>
          {shown.map((c) => (
            <div key={c.key} className="min-w-[82%] snap-start sm:min-w-0">
              <DonationCard card={c} mode="card" {...sharedProps} />
            </div>
          ))}
        </div>
      ) : layout === 'featured_first' && shown.length > 0 ? (
        <div className="flex flex-col gap-6">
          <DonationCard key={shown[0].key} card={shown[0]} mode="list" {...sharedProps} />
          {shown.length > 1 && (
            <div className={`grid gap-6 ${cols}`}>
              {shown.slice(1).map((c) => (
                <DonationCard key={c.key} card={c} mode="card" {...sharedProps} />
              ))}
            </div>
          )}
        </div>
      ) : layout === 'accordion' ? (
        <div className="flex flex-col gap-3">
          {shown.map((c) => (
            <DonationCard key={c.key} card={c} mode="accordion" bundleSelected={bundleIds.includes(c.campaignId)} {...sharedProps} />
          ))}
        </div>
      ) : layout === 'table_rows' ? (
        <div className="flex flex-col gap-2">
          {shown.map((c) => (
            <DonationCard key={c.key} card={c} mode="table_rows" bundleSelected={bundleIds.includes(c.campaignId)} {...sharedProps} />
          ))}
        </div>
      ) : layout === 'masonry' ? (
        <div className="columns-1 gap-6 space-y-6 sm:columns-2 lg:columns-3">
          {shown.map((c) => (
            <div key={c.key} className="break-inside-avoid">
              <DonationCard card={c} mode="card" bundleSelected={bundleIds.includes(c.campaignId)} {...sharedProps} />
            </div>
          ))}
        </div>
      ) : (
        <div className={`grid gap-6 ${cols}`}>
          {shown.map((c) => (
            <DonationCard key={c.key} card={c} mode={cardMode} bundleSelected={bundleIds.includes(c.campaignId)} {...sharedProps} />
          ))}
        </div>
      )}
      {enableBundleSelect && bundleIds.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50 px-5 py-3.5 shadow-sm">
          <span className="text-sm font-bold text-primary-900">
            {bundleIds.length} kampanya seçildi
          </span>
          <button
            type="button"
            onClick={addBundleToCart}
            className="rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-primary-700"
          >
            {l.bundleAction} ({bundleIds.length})
          </button>
        </div>
      )}
      {!shown.length && <p className="py-10 text-center text-gray-500">{l.emptyTab}</p>}
      {ctaLabel && (
        <div className="mt-10 text-center">
          <Link href={ctaUrl} className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-7 py-3.5 text-sm font-extrabold text-primary-800 shadow-sm transition hover:bg-primary-50">
            {ctaLabel} →
          </Link>
        </div>
      )}
      {videoCard?.videoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setVideoCard(null)}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-black shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 text-white">
              <span className="text-sm font-bold">{videoCard.title}</span>
              <button type="button" onClick={() => setVideoCard(null)} className="text-lg font-bold text-white/70 hover:text-white">×</button>
            </div>
            {(() => {
              const yt = videoCard.videoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1]
              if (yt) {
                return (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0`}
                    title={videoCard.title}
                    allow="autoplay; encrypted-media"
                    className="aspect-video w-full border-0"
                  />
                )
              }
              return <video src={videoCard.videoUrl} controls autoPlay playsInline className="aspect-video w-full" />
            })()}
          </div>
        </div>
      )}
      {detailCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setDetailCard(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailCard.image && (
              <div className="aspect-[16/9] w-full overflow-hidden bg-gray-100">
                <img src={detailCard.image} alt={detailCard.title} className="h-full w-full object-cover" />
              </div>
            )}
            <div className="space-y-3 p-6">
              {(detailCard.badge || detailCard.note) && (
                <span className="inline-flex rounded-full bg-primary-50 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary-800">
                  {detailCard.badge || detailCard.note}
                </span>
              )}
              <h3 className="font-heading text-2xl font-bold text-gray-900">{detailCard.title}</h3>
              {detailCard.summary && <p className="text-sm leading-relaxed text-gray-600">{detailCard.summary}</p>}
              {detailCard.impactLabel && <p className="text-xs font-semibold text-emerald-700">✦ {detailCard.impactLabel}</p>}
              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setDetailCard(null)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
                >
                  {l.close}
                </button>
                <Link
                  href={`/kampanyalar/${detailCard.slug}`}
                  className="rounded-xl bg-primary-600 px-5 py-2 text-xs font-bold text-white hover:bg-primary-700"
                >
                  {detailCard.button} →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Message form ------------------------------------------------------------------------

export function ContactFormBlock({
  kicker, title, text, look = 'split_dark', image, badgeValue, badgeText,
  subjects, kvkkText, successText, contactPhone, contactEmail, contactAddress, workingHours,
  button = 'Gönder', askEmail = true, editing,
}: {
  kicker?: string; title?: string; text?: string; look?: string; image?: string; badgeValue?: string; badgeText?: string
  subjects?: string; kvkkText?: string; successText?: string
  contactPhone?: string; contactEmail?: string; contactAddress?: string; workingHours?: string
  button?: string; askEmail?: boolean; editing?: boolean
}) {
  const subjectList = (subjects || '').split(',').map((s) => s.trim()).filter(Boolean)
  const [form, setForm] = useState({ name: '', surname: '', email: '', phone: '', subject: subjectList[0] || '', message: '', kvkk: false })
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')
  const isCallback = look === 'callback'
  const set = (k: 'name' | 'surname' | 'email' | 'phone' | 'subject' | 'message') =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editing) return
    if (!form.name.trim() || !form.phone.trim() || (!isCallback && !form.message.trim())) {
      setError(isCallback ? 'Ad ve telefon zorunludur.' : 'Ad, telefon ve mesaj zorunludur.')
      return
    }
    if (kvkkText && !form.kvkk) {
      setError('Lütfen onay kutusunu işaretleyin.')
      return
    }
    setState('sending'); setError('')
    const msgParts = [
      form.subject ? `Konu: ${form.subject}` : '',
      isCallback && !form.message.trim() ? 'Geri arama talebi' : form.message.trim(),
      form.email ? `E-posta: ${form.email}` : '',
    ].filter(Boolean)
    try {
      await axios.post('/api/v1/public/contact-messages', {
        name: `${form.name} ${form.surname}`.trim().slice(0, 200),
        phone: form.phone.slice(0, 20),
        message: msgParts.join('\n\n'),
      })
      setState('sent')
    } catch (err: any) {
      setState('error'); setError(err?.response?.status === 429 ? 'Çok fazla deneme; lütfen birkaç dakika sonra tekrar deneyin.' : 'Mesajınız gönderilemedi, lütfen tekrar deneyin.')
    }
  }

  const field = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-primary-600 focus:ring-4 focus:ring-primary-500/10'

  const formBody = state === 'sent' ? (
    <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center text-emerald-900">
      <div className="font-semibold">{successText || 'Teşekkürler, mesajınız bize ulaştı. En kısa sürede dönüş yapacağız.'}</div>
      <button
        type="button"
        onClick={() => {
          setForm({ name: '', surname: '', email: '', phone: '', subject: subjectList[0] || '', message: '', kvkk: false })
          setState('idle')
        }}
        className="mt-4 inline-flex rounded-lg border border-emerald-300 bg-white px-4 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
      >
        Yeni mesaj gönder
      </button>
    </div>
  ) : (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <input className={field} placeholder="Adınız *" value={form.name} onChange={set('name')} autoComplete="given-name" aria-label="Adınız" />
      <input className={field} placeholder="Soyadınız" value={form.surname} onChange={set('surname')} autoComplete="family-name" aria-label="Soyadınız" />
      {askEmail && !isCallback && <input className={field} type="email" placeholder="E-Posta" value={form.email} onChange={set('email')} autoComplete="email" aria-label="E-posta" />}
      <input className={`${field} ${askEmail && !isCallback ? '' : 'sm:col-span-2'}`} type="tel" placeholder="Telefon *" value={form.phone} onChange={set('phone')} autoComplete="tel" aria-label="Telefon" />
      {subjectList.length > 0 && (
        <select className={`${field} sm:col-span-2`} value={form.subject} onChange={set('subject')} aria-label="Konu">
          {subjectList.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {!isCallback && (
        <textarea className={`${field} min-h-[140px] sm:col-span-2`} placeholder="Mesajınız *" value={form.message} onChange={set('message')} aria-label="Mesajınız" />
      )}
      {kvkkText && (
        <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-gray-600 sm:col-span-2">
          <input type="checkbox" checked={form.kvkk} onChange={(e) => setForm({ ...form, kvkk: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600" />
          <span>{kvkkText}</span>
        </label>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-red-600 sm:col-span-2">{error}</p>}
      <div className="pt-1 sm:col-span-2">
        <button type="submit" disabled={state === 'sending'}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-8 py-3.5 text-sm font-bold tracking-wide text-white shadow-md shadow-primary-600/20 transition hover:bg-primary-700 hover:shadow-lg disabled:opacity-60 sm:w-auto">
          {state === 'sending' ? 'Gönderiliyor…' : button}
          <span aria-hidden>→</span>
        </button>
      </div>
    </form>
  )

  if (look === 'centered' || look === 'minimal' || look === 'callback' || look === 'compact_inline_card') {
    const cardCls = look === 'minimal'
      ? ''
      : look === 'compact_inline_card'
        ? 'rounded-2xl border border-primary-200 bg-primary-50/40 p-5 text-gray-900 shadow-sm sm:p-6'
        : 'rounded-3xl border border-gray-200/90 bg-white p-6 text-gray-900 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.08)] sm:p-8 lg:p-10'
    return (
      <div className={`mx-auto w-full px-4 sm:px-6 ${look === 'compact_inline_card' ? 'max-w-4xl' : 'max-w-2xl'}`}>
        {(kicker || title || text) && (
          <div className="mb-8 text-center">
            {kicker && <div className="mb-2 text-xs font-bold tracking-[2px] text-primary-600">{kicker}</div>}
            {title && <h2 className="font-heading text-2xl font-bold sm:text-3xl">{title}</h2>}
            {text && <p className="mt-2.5 text-sm leading-relaxed opacity-75 sm:text-base">{text}</p>}
          </div>
        )}
        <div className={cardCls}>{formBody}</div>
      </div>
    )
  }

  if (look === 'dark_sleek_form') {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        <div className="rounded-3xl bg-gray-950 p-6 text-white shadow-2xl ring-1 ring-white/10 sm:p-10">
          {(kicker || title || text) && (
            <div className="mb-8 text-center">
              {kicker && <div className="mb-2 text-xs font-extrabold uppercase tracking-[2px] text-accent-400">{kicker}</div>}
              {title && <h2 className="font-heading text-2xl font-bold text-white sm:text-3xl">{title}</h2>}
              {text && <p className="mt-2.5 text-sm leading-relaxed text-gray-300 sm:text-base">{text}</p>}
            </div>
          )}
          <div className="rounded-2xl bg-white p-6 text-gray-900 sm:p-8">{formBody}</div>
        </div>
      </div>
    )
  }

  if (look === 'split_info' || look === 'split_info_left') {
    const infoItems = [
      contactPhone ? { icon: '📞', label: 'Telefon', value: contactPhone, href: `tel:${contactPhone.replace(/\s+/g, '')}` } : null,
      contactEmail ? { icon: '✉️', label: 'E-posta', value: contactEmail, href: `mailto:${contactEmail}` } : null,
      contactAddress ? { icon: '📍', label: 'Adres', value: contactAddress } : null,
      workingHours ? { icon: '🕒', label: 'Çalışma Saatleri', value: workingHours } : null,
    ].filter(Boolean) as Array<{ icon: string; label: string; value: string; href?: string }>

    return (
      <div className="mx-auto grid w-full max-w-[var(--site-container)] items-start gap-8 px-4 sm:px-6 lg:grid-cols-[5fr_7fr] lg:gap-10">
        <div className="space-y-6">
          <div>
            {kicker && <div className="mb-2 text-xs font-bold tracking-[2px] text-primary-600">{kicker}</div>}
            {title && <h2 className="font-heading text-2xl font-bold sm:text-3xl">{title}</h2>}
            {text && <p className="mt-2.5 text-sm leading-relaxed opacity-75 sm:text-base">{text}</p>}
          </div>
          {infoItems.length > 0 && (
            <div className="space-y-3">
              {infoItems.map((inf) => (
                <div key={inf.label} className="flex items-start gap-3.5 rounded-2xl border border-gray-200/80 bg-white p-4 text-gray-900 shadow-sm">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-primary-50 text-lg">{inf.icon}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-gray-500">{inf.label}</div>
                    {inf.href ? (
                      <a href={inf.href} className="mt-0.5 block font-semibold text-gray-900 hover:text-primary-700 hover:underline">{inf.value}</a>
                    ) : (
                      <div className="mt-0.5 text-sm font-medium text-gray-800">{inf.value}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-3xl border border-gray-200/90 bg-white p-6 text-gray-900 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.08)] sm:p-8 lg:p-10">
          {formBody}
        </div>
      </div>
    )
  }

  const hasLeft = Boolean(kicker || title || text || image || badgeValue)
  return (
    <div className={`mx-auto w-full px-4 sm:px-6 ${hasLeft ? 'grid max-w-[var(--site-container)] items-stretch gap-6 lg:grid-cols-[5fr_7fr] lg:gap-8' : 'max-w-2xl'}`}>
      {hasLeft && (
        <div className="relative flex flex-col justify-between gap-6 overflow-hidden rounded-3xl bg-gradient-to-br from-primary-950 via-primary-900 to-primary-950 p-6 text-white shadow-xl sm:p-8">
          <div className="pointer-events-none absolute -end-16 -top-16 h-56 w-56 rounded-full bg-accent-500/15 blur-3xl" aria-hidden />
          <div className="relative">
            {kicker && (
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-[11px] font-bold tracking-[1.6px] text-accent-300">
                {kicker}
              </span>
            )}
            {title && <h2 className="mb-3 font-heading text-2xl font-bold leading-tight text-white sm:text-3xl">{title}</h2>}
            {text && <p className="text-sm leading-relaxed text-white/80 sm:text-base">{text}</p>}
          </div>
          {(image || badgeValue) && (
            <div className="relative mt-auto">
              {image && (
                <div className="relative overflow-hidden rounded-2xl ring-1 ring-white/20">
                  <img src={image} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" aria-hidden />
                  {badgeValue && (
                    <div className="absolute bottom-3 start-3 end-3 flex items-center gap-3 rounded-xl border border-white/20 bg-black/55 px-4 py-2.5 backdrop-blur-md">
                      <span className="font-heading text-2xl font-extrabold text-accent-400 sm:text-3xl">{badgeValue}</span>
                      {badgeText && <span className="text-xs font-semibold leading-snug text-white/95 sm:text-sm">{badgeText}</span>}
                    </div>
                  )}
                </div>
              )}
              {!image && badgeValue && (
                <div className="inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-5 py-3 backdrop-blur-sm">
                  <span className="font-heading text-2xl font-extrabold text-accent-400">{badgeValue}</span>
                  {badgeText && <span className="text-xs font-medium text-white/90">{badgeText}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col justify-center rounded-3xl border border-gray-200/90 bg-white p-6 text-gray-900 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.08)] sm:p-8 lg:p-10">
        {formBody}
      </div>
    </div>
  )
}

// --- Phone bottom bar ---------------------------------------------------------------------

const TAB_ICON: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0',
  bank: 'M3 10l9-6 9 6M5 10v8m4-8v8m6-8v8m4-8v8M3 21h18',
  heart: 'M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z',
  cart: 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2M9.5 19.5h.01M17 19.5h.01',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  menu: 'M4 6h16M4 12h16M4 18h16',
}

export function MobileTabBar({ items, editing }: { items: { label?: string; url?: string; icon?: string; highlight?: boolean }[]; editing?: boolean }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const update = () => setCount(cartCount())
    update()
    if (!editing) document.documentElement.classList.add('has-tabbar')
    window.addEventListener('donation-cart-changed', update)
    return () => { window.removeEventListener('donation-cart-changed', update); document.documentElement.classList.remove('has-tabbar') }
  }, [editing])
  const bar = (
    <nav aria-label="Kısayollar" className={`${editing ? 'relative' : 'fixed inset-x-0 bottom-0 z-40 md:hidden'} grid bg-primary-800 pb-[env(safe-area-inset-bottom)] text-white shadow-[0_-6px_20px_-8px_rgba(0,0,0,.35)]`}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.filter((i) => i.label && i.url).map((item, i) => (
        <Link key={i} href={item.url!} className={`relative m-1.5 flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium ${item.highlight ? 'bg-white text-gray-900' : ''}`}>
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={TAB_ICON[item.icon || 'home'] || TAB_ICON.home} /></svg>
          {item.label}
          {item.icon === 'cart' && count > 0 && <span className="absolute end-3 top-0.5 min-w-[16px] rounded-full bg-accent-500 px-1 text-center text-[10px] font-bold leading-4 text-white">{count}</span>}
        </Link>
      ))}
    </nav>
  )
  return editing ? bar : <><div className="h-16 md:hidden" aria-hidden />{bar}</>
}
