'use client'

/**
 * Interactive builder blocks: donation cards (amount, currency, niyet, adet/hisse, months,
 * share progress → donation cart), currency switcher, cart button, closable announcement
 * bar and the message form. Everything talks through window events and localStorage, so
 * the blocks work anywhere on a page and with the site-wide DonationCart.
 */
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
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
  return { currency: active, available, convert, choose }
}

export function CurrencySwitcher({ variant = 'buttons', light }: { variant?: string; light?: boolean }) {
  const { currency, available, choose } = useSiteCurrency()
  const names: Record<CurrencyCode, string> = { TRY: '₺ Türk Lirası', USD: '$ Dolar', EUR: '€ Euro' }
  const list = available.length ? available : (['TRY'] as CurrencyCode[])
  if (variant === 'select') {
    return (
      <select aria-label="Para birimi" value={currency} onChange={(e) => choose(e.target.value as CurrencyCode)}
        className="rounded-full border border-current/20 bg-transparent px-4 py-2 text-sm font-semibold">
        {list.map((c) => <option key={c} value={c} className="text-gray-900">{names[c]}</option>)}
      </select>
    )
  }
  return (
    <div role="group" aria-label="Para birimi" className={`inline-flex rounded-full p-1 text-sm font-semibold ${light ? 'bg-white/15' : 'bg-black/5'}`}>
      {list.map((c) => (
        <button key={c} type="button" onClick={() => choose(c)} aria-pressed={currency === c}
          className={`whitespace-nowrap rounded-full px-3 py-1.5 transition-colors sm:px-4 ${currency === c ? 'bg-primary-700 text-white' : 'hover:bg-black/5'}`}>
          <span className="sm:hidden">{SYMBOL[c]} {c === 'TRY' ? 'TL' : c}</span><span className="hidden sm:inline">{names[c]}</span>
        </button>
      ))}
    </div>
  )
}

function cartCount(): number {
  try {
    const items = JSON.parse(localStorage.getItem(CART_KEY) || '[]')
    return Array.isArray(items) ? items.reduce((n: number, i: any) => n + (Number(i?.quantity) || 1), 0) : 0
  } catch { return 0 }
}

export function CartButton({ label = 'Sepetim', showLabel, url = '/bagis/sepetim' }: { label?: string; showLabel?: boolean; url?: string }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const update = () => setCount(cartCount())
    update()
    window.addEventListener('donation-cart-changed', update)
    window.addEventListener('storage', update)
    return () => { window.removeEventListener('donation-cart-changed', update); window.removeEventListener('storage', update) }
  }, [])
  return (
    <Link href={url} aria-label={`${label}${count ? ` (${count})` : ''}`} className="relative inline-flex items-center gap-2 hover:opacity-80">
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></svg>
      {showLabel && <span className="text-sm font-semibold">{label}</span>}
      {count > 0 && <span className="absolute -end-2.5 -top-2 min-w-[18px] rounded-full bg-accent-500 px-1 text-center text-[11px] font-bold leading-[18px] text-white">{count}</span>}
    </Link>
  )
}

const ANNOUNCE_TONE: Record<string, string> = {
  danger: 'bg-[#FF0000] text-white', rose: 'bg-[#DC3545] text-white', brand: 'bg-primary-700 text-white', accent: 'bg-accent-500 text-white',
  dark: 'bg-gray-900 text-white', warning: 'bg-amber-400 text-amber-950',
}

export function AnnouncementBar({ id, text, url, tone, icon, closable = true, hideDays = 1, editing }: {
  id: string; text: string; url?: string; tone?: string; icon?: string; closable?: boolean; hideDays?: number; editing?: boolean
}) {
  const key = `announce_closed_${id}`
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (editing) return
    try {
      const until = Number(localStorage.getItem(key) || 0)
      if (until && until > Date.now()) setHidden(true)
    } catch { /* private mode */ }
  }, [key, editing])
  if (hidden) return null
  const close = () => {
    setHidden(true)
    try { localStorage.setItem(key, String(Date.now() + Math.max(hideDays, 0) * 86_400_000 || Date.now() + 3_600_000)) } catch { /* ignore */ }
  }
  const body = <span className="font-semibold">{icon && <span aria-hidden className="me-2">{icon}</span>}{text}</span>
  return (
    <div className={`relative px-10 py-2.5 text-center text-[15px] ${ANNOUNCE_TONE[tone || 'danger'] || ANNOUNCE_TONE.danger}`} data-tone={tone}>
      {url ? (url.startsWith('/') ? <Link href={url} className="hover:underline">{body}</Link> : <a href={url} className="hover:underline" target="_blank" rel="noopener noreferrer">{body}</a>) : body}
      {closable && (
        <button type="button" onClick={close} aria-label="Duyuruyu kapat" className="absolute end-3 top-1/2 -translate-y-1/2 px-2 text-lg leading-none opacity-80 hover:opacity-100">×</button>
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
  image?: string
  currency: CurrencyCode
  unit: number | null
  minAmount: number
  quantity: '' | 'adet' | 'hisse'
  maxQuantity: number
  niyet: string[]
  durations: number[]
  shares: { taken: number; total: number } | null
  note?: string
  button: string
  tags: string[]
}

function fmt(n: number, c: CurrencyCode) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: c === 'TRY' || Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
}

function DonationCard({ card, editing }: { card: DonationCardView; editing?: boolean }) {
  const { currency, convert } = useSiteCurrency()
  const unit = card.unit != null ? convert(card.unit, card.currency) : null
  const [amount, setAmount] = useState('')
  const [qty, setQty] = useState(1)
  const [niyet, setNiyet] = useState('')
  const [months, setMonths] = useState(card.durations[0] || 0)
  const [error, setError] = useState('')
  const [added, setAdded] = useState(false)
  const perUnit = unit ?? Number(amount.replace(',', '.'))
  const total = perUnit * (card.durations.length ? months || 1 : 1)
  const minimum = convert(card.minAmount, card.currency) ?? card.minAmount

  const add = () => {
    if (editing) return
    if (!perUnit || perUnit <= 0) { setError('Lütfen geçerli bir tutar giriniz.'); return }
    if (perUnit < minimum) { setError(`En az ${fmt(minimum, currency)} ${SYMBOL[currency]} bağış yapılabilir.`); return }
    if (card.niyet.length && !niyet) { setError('Lütfen niyet seçiniz.'); return }
    setError('')
    const metadata: Record<string, unknown> = {}
    if (niyet) metadata.niyet = niyet
    if (months) metadata.sure_ay = months
    if (card.quantity) metadata.birim = card.quantity
    if (card.note) metadata.not = card.note
    window.dispatchEvent(new CustomEvent('add-to-donation-cart', {
      detail: { campaignId: card.campaignId, campaignTitle: `${card.title}${niyet ? ` · ${niyet}` : ''}${months ? ` · ${months} ay` : ''}`, amount: total, quantity: card.quantity ? qty : 1, metadata, currency },
    }))
    setAdded(true)
    setTimeout(() => setAdded(false), 2500)
  }
  const sharePct = card.shares && card.shares.total ? Math.min(100, Math.round((card.shares.taken / card.shares.total) * 100)) : 0

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_-12px_rgba(0,0,0,.18)]">
      <Link href={`/kampanyalar/${card.slug}`} className="block aspect-[16/9] overflow-hidden bg-primary-50">
        {card.image && <img src={card.image} alt={card.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="text-center font-heading text-[20px] font-bold leading-snug text-gray-900">
          <Link href={`/kampanyalar/${card.slug}`} className="hover:text-primary-700">{card.title}</Link>
        </h3>
        {card.note && <p className="text-center text-sm text-gray-500">{card.note}</p>}
        {card.shares && (
          <div className="text-sm">
            <div className="mb-1 flex justify-between font-semibold text-gray-700">
              <span><b className="text-primary-700">{card.shares.taken}</b> Alınan Hisse</span>
              <span><b>{card.shares.total}</b> Toplam Hisse</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={sharePct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary-600" style={{ width: `${sharePct}%` }} />
            </div>
            <div className="mt-1 text-end text-xs font-bold text-primary-700">%{sharePct}</div>
          </div>
        )}
        {(card.niyet.length > 0 || card.durations.length > 0) && (
          <div className="flex gap-2">
            {card.niyet.length > 0 && (
              <select aria-label="Niyet" value={niyet} onChange={(e) => setNiyet(e.target.value)} className="min-w-0 flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm">
                <option value="">Niyet Seçiniz</option>
                {card.niyet.map((n) => <option key={n} value={n}>{n}{card.quantity === 'hisse' || /kurban/i.test(card.title) ? ' Kurban' : ''}</option>)}
              </select>
            )}
            {card.durations.length > 0 && (
              <select aria-label="Süre" value={months} onChange={(e) => setMonths(Number(e.target.value))} className="min-w-0 flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm">
                {card.durations.map((m) => <option key={m} value={m}>{m} Ay</option>)}
              </select>
            )}
          </div>
        )}
        <div className="mt-auto flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center rounded-full border border-gray-200 bg-gray-50 pe-3">
            <input inputMode="decimal" aria-label="Tutar" placeholder="0" readOnly={unit != null}
              value={unit != null ? fmt(unit * (months || 1), currency) : amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
              className={`min-w-0 flex-1 rounded-full bg-transparent px-4 py-2 text-center font-semibold outline-none ${unit != null ? 'text-gray-600' : ''}`} />
            <span className="font-bold text-gray-500">{SYMBOL[currency]}</span>
          </div>
          {card.quantity && (
            <label className="flex items-center gap-1 text-xs font-semibold text-gray-500">
              <input type="number" min={1} max={card.maxQuantity} value={qty} aria-label={card.quantity === 'hisse' ? 'Hisse' : 'Adet'}
                onChange={(e) => setQty(Math.max(1, Math.min(card.maxQuantity, Number(e.target.value) || 1)))}
                className="w-14 rounded-full border border-gray-200 bg-gray-50 px-2 py-2 text-center text-sm text-gray-900" />
              {card.quantity === 'hisse' ? 'Hisse' : 'Adet'}
            </label>
          )}
        </div>
        {error && <p role="alert" className="text-center text-xs font-semibold text-red-600">{error}</p>}
        <button type="button" onClick={add}
          className="flex items-center justify-center gap-2 rounded-full border-2 border-primary-700 px-4 py-2.5 font-semibold uppercase text-gray-900 transition-colors hover:bg-primary-700 hover:text-white">
          <span aria-hidden>♥</span>{added ? 'Sepete eklendi ✓' : card.button}
        </button>
      </div>
    </article>
  )
}

export function DonationCards({ cards, tabs, layout = 'grid', columns = 3, switcher, editing, title }: {
  cards: DonationCardView[]; tabs?: { label: string; tag: string }[]; layout?: string; columns?: number; switcher?: boolean; editing?: boolean; title?: string
}) {
  const [tab, setTab] = useState(tabs?.[0]?.tag || '')
  useEffect(() => {
    // Old links like /bagis?tab=kurban open that tab.
    const wanted = new URLSearchParams(window.location.search).get('tab')
    if (wanted && tabs?.some((t) => t.tag === wanted)) setTab(wanted)
  }, [tabs])
  const shown = useMemo(() => (tabs?.length ? cards.filter((c) => c.tags.includes(tab)) : cards), [cards, tabs, tab])
  const cols = ({ 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' } as Record<number, string>)[columns] || 'sm:grid-cols-2 lg:grid-cols-3'
  if (!cards.length) return editing ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-400">Gösterilecek aktif kampanya yok</p> : null
  return (
    <div>
      {(switcher || !!tabs?.length) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          {!!tabs?.length && (
            <div role="tablist" aria-label="Bağış türleri" className="flex flex-wrap gap-2">
              {tabs.map((t) => (
                <button key={t.tag} role="tab" type="button" aria-selected={tab === t.tag} onClick={() => setTab(t.tag)}
                  className={`rounded-full px-5 py-2 text-[15px] font-semibold transition-colors ${tab === t.tag ? 'bg-primary-700 text-white' : 'bg-white text-gray-700 shadow-sm hover:bg-primary-50'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {switcher && <CurrencySwitcher />}
        </div>
      )}
      {layout === 'carousel' && shown.length > columns
        ? <Carousel label={title || 'Bağış kartları'} items={columns >= 4 ? 'w-[85%] sm:w-[46%] lg:w-[23.5%]' : 'w-[85%] sm:w-[46%] lg:w-[31.5%]'}>{shown.map((c) => <DonationCard key={c.key} card={c} editing={editing} />)}</Carousel>
        : <div className={`grid gap-6 ${cols}`}>{shown.map((c) => <DonationCard key={c.key} card={c} editing={editing} />)}</div>}
      {!shown.length && <p className="py-10 text-center text-gray-500">Bu sekmede şu an aktif bağış yok.</p>}
    </div>
  )
}

// --- Message form ------------------------------------------------------------------------

export function ContactFormBlock({ kicker, title, text, image, badgeValue, badgeText, button = 'Gönder', askEmail = true, editing }: {
  kicker?: string; title?: string; text?: string; image?: string; badgeValue?: string; badgeText?: string; button?: string; askEmail?: boolean; editing?: boolean
}) {
  const [form, setForm] = useState({ name: '', surname: '', email: '', phone: '', message: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editing) return
    if (!form.name.trim() || !form.phone.trim() || !form.message.trim()) { setError('Ad, telefon ve mesaj zorunludur.'); return }
    setState('sending'); setError('')
    try {
      await axios.post('/api/v1/public/contact-messages', {
        name: `${form.name} ${form.surname}`.trim().slice(0, 200),
        phone: form.phone.slice(0, 20),
        message: form.email ? `${form.message}\n\nE-posta: ${form.email}` : form.message,
      })
      setState('sent')
    } catch (err: any) {
      setState('error'); setError(err?.response?.status === 429 ? 'Çok fazla deneme; lütfen birkaç dakika sonra tekrar deneyin.' : 'Mesajınız gönderilemedi, lütfen tekrar deneyin.')
    }
  }
  const field = 'w-full rounded-md border-0 bg-gray-100 px-5 py-4 text-[15px] outline-none focus:ring-2 focus:ring-primary-500'
  return (
    <div className="mx-auto grid w-full max-w-[var(--site-container)] items-center gap-10 px-6 lg:grid-cols-[5fr_7fr]">
      <div className="relative hidden lg:block">
        {image && <img src={image} alt="" loading="lazy" className="w-[78%] border-e-[14px] border-primary-700 object-cover grayscale" />}
        {badgeValue && (
          <div className="absolute end-0 top-1/2 flex h-44 w-44 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-[#5BC2CF] p-4 text-center text-white shadow-lg">
            <div className="font-heading text-5xl font-bold">{badgeValue}</div>
            {badgeText && <div className="mt-1 text-sm leading-tight">{badgeText}</div>}
          </div>
        )}
      </div>
      <div>
        {kicker && <div className="mb-2 text-lg font-medium text-primary-700">{kicker}</div>}
        {title && <h2 className="mb-4 font-heading text-3xl font-bold leading-tight md:text-[44px]">{title}</h2>}
        {text && <p className="mb-6 opacity-75">{text}</p>}
        {state === 'sent' ? (
          <p role="status" className="rounded-xl bg-primary-50 p-6 font-semibold text-primary-800">Teşekkürler, mesajınız bize ulaştı. En kısa sürede dönüş yapacağız.</p>
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <input className={field} placeholder="Adınız *" value={form.name} onChange={set('name')} autoComplete="given-name" aria-label="Adınız" />
            <input className={field} placeholder="Soyadınız" value={form.surname} onChange={set('surname')} autoComplete="family-name" aria-label="Soyadınız" />
            {askEmail && <input className={field} type="email" placeholder="E-Posta" value={form.email} onChange={set('email')} autoComplete="email" aria-label="E-posta" />}
            <input className={`${field} ${askEmail ? '' : 'sm:col-span-2'}`} type="tel" placeholder="Telefon *" value={form.phone} onChange={set('phone')} autoComplete="tel" aria-label="Telefon" />
            <textarea className={`${field} min-h-[150px] sm:col-span-2`} placeholder="Mesajınız *" value={form.message} onChange={set('message')} aria-label="Mesajınız" />
            {error && <p role="alert" className="text-sm font-semibold text-red-600 sm:col-span-2">{error}</p>}
            <div><button type="submit" disabled={state === 'sending'} className="rounded-full bg-[#060315] px-11 py-4 font-semibold uppercase text-white transition-opacity hover:opacity-85 disabled:opacity-60">{state === 'sending' ? 'Gönderiliyor…' : button}</button></div>
          </form>
        )}
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
