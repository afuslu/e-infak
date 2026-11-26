'use client'

/**
 * Blocks that take the donation on the page: Kurban Planlayıcı, Çoklu Ürün Paketi and
 * Hisseli Proje. They put their lines in the donation cart and open /bagis/sepetim,
 * where the donor pays; the server checks every line against its campaign again.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type ReactNode } from 'react'
import {
  bundleTotal, cartLine, parsePresets, quantityLimits, splitName, storyIndex, validPhone,
  type CartLine, type PricedCampaign,
} from '../../lib/inline-checkout'

const SCRIPT = { fontFamily: 'var(--ff-script), "Segoe Script", cursive' }
const DONOR_PROFILE_KEY = 'einfak_donor_profile'

type Look = 'card' | 'soft' | 'dark'

const L10N = {
  tr: {
    name: 'Ad Soyad', phone: 'Telefon', total: 'Toplam', pickOne: 'Lütfen bir seçim yapın.', pickIntent: 'Lütfen niyet seçin.',
    needName: 'Lütfen ad soyad yazın.', needPhone: 'Lütfen geçerli bir cep telefonu yazın (5xx xxx xx xx).', needConsent: 'Lütfen onay kutusunu işaretleyin.',
    noPrice: 'Bu kampanyada sabit tutar tanımlı değil.', min: 'en az', share: 'hisse', shareOne: '1 hisse', whole: 'Tamamı',
    remaining: 'hisse kaldı', full: 'Tamamlandı', next: 'Sonraki', project: 'Hisse eklenecek proje', whose: 'Hisseler kimin adına?',
    addPerson: '+ Kişi ekle', plaque: 'Tabela ismi', perShare: 'hisse', preview: 'Önizlemede ödeme yapılmaz.', remove: 'Kaldır',
    less: 'Azalt', more: 'Artır', soldOut: 'Bu projedeki tüm hisseler alındı.', startHint: 'Hisse ekleyin, hikâyeyi başlatın',
  },
  en: {
    name: 'Full name', phone: 'Phone', total: 'Total', pickOne: 'Please make a choice.', pickIntent: 'Please choose an intention.',
    needName: 'Please enter your name.', needPhone: 'Please enter a valid mobile number.', needConsent: 'Please tick the consent box.',
    noPrice: 'This campaign has no fixed amount.', min: 'min.', share: 'shares', shareOne: '1 share', whole: 'All',
    remaining: 'shares left', full: 'Completed', next: 'Next', project: 'Project', whose: 'In whose name?',
    addPerson: '+ Add person', plaque: 'Plaque name', perShare: 'share', preview: 'No payment in preview.', remove: 'Remove',
    less: 'Less', more: 'More', soldOut: 'All shares of this project are taken.', startHint: 'Add shares to start the story',
  },
  ar: {
    name: 'الاسم الكامل', phone: 'الهاتف', total: 'المجموع', pickOne: 'يرجى الاختيار.', pickIntent: 'يرجى اختيار النية.',
    needName: 'يرجى كتابة الاسم.', needPhone: 'يرجى كتابة رقم جوال صحيح.', needConsent: 'يرجى تأكيد الموافقة.',
    noPrice: 'لا يوجد مبلغ ثابت لهذه الحملة.', min: 'الحد الأدنى', share: 'سهم', shareOne: 'سهم واحد', whole: 'الكل',
    remaining: 'سهم متبقٍ', full: 'اكتمل', next: 'التالي', project: 'المشروع', whose: 'باسم من؟',
    addPerson: '+ إضافة شخص', plaque: 'اسم اللوحة', perShare: 'سهم', preview: 'لا دفع في المعاينة.', remove: 'حذف',
    less: 'إنقاص', more: 'زيادة', soldOut: 'تم أخذ جميع الأسهم.', startHint: 'أضف أسهمًا لتبدأ القصة',
  },
}
type Words = typeof L10N.tr
const words = (locale: string): Words => L10N[locale as keyof typeof L10N] || L10N.tr

const money = (n: number, locale: string) =>
  `${n.toLocaleString(locale === 'tr' ? 'tr-TR' : locale, { maximumFractionDigits: n % 1 ? 2 : 0 })} ₺`

/** Puts the lines in the cart (without opening the drawer) and opens the checkout page. */
function useInlineCheckout(editing?: boolean) {
  const router = useRouter()
  return (lines: CartLine[], donor?: { name: string; phone: string }) => {
    if (editing || !lines.length) return
    if (donor && (donor.name.trim() || donor.phone.trim())) {
      try {
        const saved = JSON.parse(localStorage.getItem(DONOR_PROFILE_KEY) || 'null') || {}
        const { firstName, lastName } = splitName(donor.name)
        localStorage.setItem(DONOR_PROFILE_KEY, JSON.stringify({
          ...saved,
          ...(firstName ? { firstName, lastName } : {}),
          ...(donor.phone.trim() ? { phone: donor.phone.trim() } : {}),
        }))
      } catch { /* private mode: the checkout asks again */ }
    }
    for (const line of lines) {
      window.dispatchEvent(new CustomEvent('add-to-donation-cart', { detail: { ...line, silent: true } }))
    }
    router.push('/bagis/sepetim')
  }
}

const SHELL: Record<Look, { wrap: string; card: string; muted: string; box: string; chip: string; chipOn: string; input: string }> = {
  card: {
    wrap: '', card: 'bg-white text-gray-900 shadow-[0_20px_60px_-30px_rgba(15,23,42,.35)] ring-1 ring-gray-100',
    muted: 'text-gray-500', box: 'border border-gray-200 bg-white', chip: 'border border-gray-200 bg-white text-gray-700 hover:border-primary-300',
    chipOn: 'border border-primary-600 bg-primary-600 text-white', input: 'border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400',
  },
  soft: {
    wrap: '', card: 'bg-primary-50/70 text-gray-900 ring-1 ring-primary-100',
    muted: 'text-gray-600', box: 'border border-primary-100 bg-white', chip: 'border border-primary-100 bg-white text-gray-700 hover:border-primary-300',
    chipOn: 'border border-primary-700 bg-primary-700 text-white', input: 'border border-primary-100 bg-white text-gray-900 placeholder:text-gray-400',
  },
  dark: {
    wrap: '', card: 'bg-primary-950 text-white ring-1 ring-white/10',
    muted: 'text-white/65', box: 'border border-white/10 bg-white/5', chip: 'border border-white/15 bg-white/5 text-white/85 hover:border-white/40',
    chipOn: 'border border-accent-400 bg-accent-500 text-white', input: 'border border-white/15 bg-white/10 text-white placeholder:text-white/40',
  },
}

function Shell({ look, container, badge, pill, kicker, title, text, scriptNote, children }: {
  look: Look; container: string; badge?: string; pill?: string; kicker?: string; title?: string; text?: string; scriptNote?: string; children: ReactNode
}) {
  const s = SHELL[look] || SHELL.card
  return (
    <div className={container}>
      <div className={`relative rounded-[28px] p-5 sm:p-8 lg:p-10 ${s.card}`}>
        {(badge || pill) && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            {badge ? <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold ${s.box}`}>{badge}</span> : <span />}
            {pill && <span className={`rounded-full px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wider ${s.box}`}>{pill}</span>}
          </div>
        )}
        {scriptNote && (
          <div className="pointer-events-none absolute end-6 top-6 hidden max-w-[11rem] rotate-[-4deg] text-end text-xl leading-tight text-primary-600 sm:block" style={SCRIPT}>
            {scriptNote}
          </div>
        )}
        {(kicker || title || text) && (
          <div className={`mb-7 ${badge || pill ? 'mx-auto max-w-2xl text-center' : 'max-w-xl pe-0 sm:pe-44'}`}>
            {kicker && <div className="mb-2 text-xs font-extrabold uppercase tracking-[2px] text-primary-600">{kicker}</div>}
            {title && <h2 className="font-heading text-2xl font-bold leading-tight sm:text-[32px]">{title}</h2>}
            {text && <p className={`mt-2 text-[15px] leading-relaxed ${s.muted}`}>{text}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

function Stepper({ value, onChange, min, max, look, w }: { value: number; onChange: (n: number) => void; min: number; max: number; look: Look; w: Words }) {
  const s = SHELL[look] || SHELL.card
  // From 0 the first press jumps to the minimum; below the minimum it goes back to 0.
  const dec = () => onChange(value <= min ? 0 : value - 1)
  const inc = () => onChange(value === 0 ? min : Math.min(max, value + 1))
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={w.less} onClick={dec} disabled={value === 0}
        className={`flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold transition disabled:opacity-40 ${s.chip}`}>−</button>
      <span className="min-w-[2rem] text-center text-base font-extrabold tabular-nums">{value}</span>
      <button type="button" aria-label={w.more} onClick={inc} disabled={value >= max}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-600 text-lg font-bold text-white transition hover:bg-primary-700 disabled:opacity-40">+</button>
    </div>
  )
}

function DonorFields({ name, phone, setName, setPhone, look, w }: {
  name: string; phone: string; setName: (v: string) => void; setPhone: (v: string) => void; look: Look; w: Words
}) {
  const s = SHELL[look] || SHELL.card
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={w.name} autoComplete="name" aria-label={w.name}
        className={`h-12 rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-primary-400 ${s.input}`} />
      <div className={`flex h-12 items-center overflow-hidden rounded-xl focus-within:ring-2 focus-within:ring-primary-400 ${s.input}`}>
        <span className="border-e border-current/10 px-3 text-sm font-semibold opacity-70">+90</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={w.phone} inputMode="tel" autoComplete="tel-national" aria-label={w.phone}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" />
      </div>
    </div>
  )
}

function Terms({ label, url, look }: { label?: string; url?: string; look: Look }) {
  if (!url || !label) return null
  const s = SHELL[look] || SHELL.card
  const cls = `inline-flex items-center gap-1.5 text-xs underline-offset-2 hover:underline ${s.muted}`
  return url.startsWith('/') ? <Link href={url} className={cls}>ⓘ {label}</Link> : <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>ⓘ {label}</a>
}

function checkDonor(ask: boolean, name: string, phone: string, w: Words): string {
  if (!ask) return ''
  if (name.trim().length < 3) return w.needName
  if (!validPhone(phone)) return w.needPhone
  return ''
}

// --- Kurban Planlayıcı ---------------------------------------------------------------

export interface PlannerOption {
  campaignId: string
  title: string
  image?: string
  note?: string
  unit: number | null
  intents: string[]
  campaign?: PricedCampaign
}

export function KurbanPlanner({ o, options, container, locale, editing }: {
  o: Record<string, any>; options: PlannerOption[]; container: string; locale: string; editing?: boolean
}) {
  const w = words(locale)
  const look: Look = o.look || 'card'
  const s = SHELL[look] || SHELL.card
  const go = useInlineCheckout(editing)
  const [picked, setPicked] = useState(0)
  const [intent, setIntent] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const askIntent = o.ask_intent !== false
  const askDonor = o.ask_donor !== false
  const current = options[Math.min(picked, options.length - 1)]
  const intents = current?.intents || []

  if (!options.length) {
    return editing ? <div className={container}><p className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-400">Kurbanlık ekleyin (her biri bir kampanya)</p></div> : null
  }

  const pay = () => {
    if (!current) return setError(w.pickOne)
    if (current.unit == null) return setError(w.noPrice)
    if (askIntent && intents.length && !intent) return setError(w.pickIntent)
    const donorProblem = checkDonor(askDonor, name, phone, w)
    if (donorProblem) return setError(donorProblem)
    if (o.consent_text && !consent) return setError(w.needConsent)
    setError(editing ? w.preview : '')
    const metadata: Record<string, unknown> = {}
    if (askIntent && intent) metadata.niyet = intent
    if (o.consent_text) metadata.vekalet = 'onaylandi'
    go([cartLine(current.campaign, current.campaignId, current.title, current.unit, 1, metadata, [intent])], askDonor ? { name, phone } : undefined)
  }

  return (
    <Shell look={look} container={container} kicker={o.kicker} title={o.title} text={o.text} scriptNote={o.script_note}>
      <div className="mb-2 text-sm font-bold">{o.options_label || 'Kurban Türü'}</div>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 sm:grid sm:overflow-visible" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 5)}, minmax(0, 1fr))` }}>
        {options.map((opt, i) => {
          const on = i === picked
          return (
            <button key={opt.campaignId + i} type="button" onClick={() => { setPicked(i); setIntent(''); setError('') }} aria-pressed={on}
              className={`relative w-36 shrink-0 snap-start overflow-hidden rounded-2xl p-2 text-center transition sm:w-auto ${on ? 'ring-2 ring-primary-600' : ''} ${s.box} hover:-translate-y-0.5`}>
              {on && <span className="absolute end-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">✓</span>}
              <div className="aspect-[4/3] overflow-hidden rounded-xl bg-gray-50">
                {opt.image ? <img src={opt.image} alt={opt.title} className="h-full w-full object-contain" loading="lazy" /> : <div className="flex h-full items-center justify-center text-4xl">🐑</div>}
              </div>
              <div className="mt-2 text-sm font-bold">{opt.title}</div>
              {opt.note && <div className={`text-[11px] ${s.muted}`}>{opt.note}</div>}
            </button>
          )
        })}
      </div>

      <div className="mt-6 grid items-end gap-6 lg:grid-cols-[1fr_minmax(0,360px)]">
        <div className="space-y-4">
          {askIntent && intents.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-bold">{o.intent_label || 'Niyet'}</div>
              <div className="flex flex-wrap gap-2">
                {intents.map((it) => (
                  <button key={it} type="button" onClick={() => { setIntent(it); setError('') }} aria-pressed={intent === it}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${intent === it ? s.chipOn : s.chip}`}>{it}</button>
                ))}
              </div>
            </div>
          )}
          {askDonor && <DonorFields name={name} phone={phone} setName={setName} setPhone={setPhone} look={look} w={w} />}
          {o.consent_text && (
            <label className={`flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed ${s.muted}`}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600" />
              <span>{o.consent_text}</span>
            </label>
          )}
          <Terms label={o.terms_label || 'Sipariş koşulları'} url={o.terms_url} look={look} />
        </div>
        <div className="text-center">
          <div className="mb-3 font-heading text-3xl font-extrabold tabular-nums">
            {current?.unit != null ? money(current.unit, locale) : '—'}
          </div>
          <button type="button" onClick={pay}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 text-base font-bold text-white shadow-lg shadow-primary-600/25 transition hover:bg-primary-700">
            {o.button_label || 'Ödeme Yap'} <span aria-hidden>→</span>
          </button>
          {o.footnote && <p className={`mt-2 text-xs ${s.muted}`}>{o.footnote}</p>}
          {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
        </div>
      </div>
    </Shell>
  )
}

// --- Çoklu Ürün Paketi -----------------------------------------------------------------

export interface BundleItem {
  campaignId: string
  title: string
  icon?: string
  image?: string
  unitText?: string
  unit: number | null
  min: number
  max: number
  campaign?: PricedCampaign
}

export function ProductBundle({ o, items, container, locale, editing }: {
  o: Record<string, any>; items: BundleItem[]; container: string; locale: string; editing?: boolean
}) {
  const w = words(locale)
  const look: Look = o.look || 'card'
  const s = SHELL[look] || SHELL.card
  const go = useInlineCheckout(editing)
  const [qty, setQty] = useState<number[]>(() => items.map(() => 0))
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const askDonor = o.ask_donor !== false
  const priced = items.map((it, i) => ({ unit: it.unit, qty: qty[i] || 0 }))
  const total = bundleTotal(priced)
  const goal = Number(o.goal_amount) || 0
  const pct = goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : null
  const chosen = items.map((it, i) => ({ it, n: qty[i] || 0 })).filter((x) => x.n > 0)

  if (!items.length) {
    return editing ? <div className={container}><p className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-400">Ürün ekleyin (her biri bir kampanya)</p></div> : null
  }

  const set = (i: number, n: number) => { setQty((q) => q.map((v, k) => (k === i ? n : v))); setError('') }
  const pay = () => {
    if (!chosen.length) return setError(w.pickOne)
    const missing = chosen.find((x) => x.it.unit == null)
    if (missing) return setError(`${missing.it.title}: ${w.noPrice}`)
    const donorProblem = checkDonor(askDonor, name, phone, w)
    if (donorProblem) return setError(donorProblem)
    setError(editing ? w.preview : '')
    go(chosen.map(({ it, n }) => {
      const line = cartLine(it.campaign, it.campaignId, it.title, it.unit as number, n, { birim: 'adet' })
      // The block's own minimum ("en az 10") holds in the cart too.
      return { ...line, minQuantity: Math.max(line.minQuantity, it.min) }
    }), askDonor ? { name, phone } : undefined)
  }

  const card = (it: BundleItem, i: number) => (
    <div key={it.campaignId + i} className={`flex flex-col gap-3 rounded-2xl p-4 ${s.box}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-50 text-2xl">
          {it.image ? <img src={it.image} alt="" className="h-full w-full object-cover" loading="lazy" /> : it.icon || '🎁'}
        </span>
        <div className="min-w-0">
          <div className="truncate font-bold">{it.title}</div>
          <div className={`text-xs ${s.muted}`}>
            {it.unitText || (it.unit != null ? money(it.unit, locale) : '')}
            {it.min > 1 && <span className="ms-1 font-semibold text-primary-600">· {w.min} {it.min}</span>}
          </div>
        </div>
      </div>
      <div className="flex justify-center"><Stepper value={qty[i] || 0} onChange={(n) => set(i, n)} min={it.min} max={it.max} look={look} w={w} /></div>
    </div>
  )
  const left = items.map((it, i) => ({ it, i })).filter(({ i }) => i % 2 === 0)
  const right = items.map((it, i) => ({ it, i })).filter(({ i }) => i % 2 === 1)

  return (
    <Shell look={look} container={container} badge={o.badge_label} pill={o.pill_label} kicker={o.kicker} title={o.title} text={o.text}>
      <div className="grid items-center gap-5 lg:grid-cols-[1fr_minmax(0,1.1fr)_1fr]">
        <div className="order-2 grid gap-4 sm:grid-cols-2 lg:order-1 lg:grid-cols-1">{left.map(({ it, i }) => card(it, i))}</div>
        <div className="relative order-1 flex flex-col items-center lg:order-2">
          {o.image_url && <img src={o.image_url} alt={o.image_title || ''} className="max-h-[420px] w-auto object-contain" loading="lazy" />}
          {(o.image_title || pct != null) && (
            <div className={`-mt-6 flex items-center gap-4 rounded-2xl px-4 py-3 shadow-lg ${look === 'dark' ? 'bg-primary-900' : 'bg-white text-gray-900'}`}>
              <div>
                {o.image_title && <div className="text-sm font-bold">♥ {o.image_title}</div>}
                {o.image_text && <div className="text-[11px] opacity-60">{o.image_text}</div>}
              </div>
              {pct != null && <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-extrabold text-primary-800">%{pct} {o.goal_label || 'MUTLULUK'}</span>}
            </div>
          )}
        </div>
        <div className="order-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">{right.map(({ it, i }) => card(it, i))}</div>
      </div>

      <div className={`mt-8 grid items-center gap-5 rounded-2xl p-4 sm:p-5 lg:grid-cols-[auto_1fr_minmax(0,420px)] ${s.box}`}>
        <div>
          <div className={`text-[11px] font-bold uppercase tracking-wider ${s.muted}`}>{o.total_label || 'Toplam destek'}</div>
          <div className="font-heading text-3xl font-extrabold tabular-nums">{money(total, locale)}</div>
        </div>
        <div className={`text-sm ${s.muted}`}>
          {chosen.length ? chosen.map(({ it, n }) => `${n} × ${it.title}`).join(' · ') : (o.empty_hint || 'Bir ürün seçerek başlayın')}
        </div>
        {askDonor ? <DonorFields name={name} phone={phone} setName={setName} setPhone={setPhone} look={look} w={w} /> : <span />}
      </div>
      <div className="mt-5 flex flex-col items-center gap-2">
        <button type="button" onClick={pay}
          className="flex h-12 items-center gap-2 rounded-full bg-primary-700 px-8 text-sm font-bold text-white shadow-lg transition hover:bg-primary-800">
          {o.button_label || 'Ödemeye Geç'} <span aria-hidden>→</span>
        </button>
        {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
        <Terms label={o.terms_label || 'Sipariş koşulları'} url={o.terms_url} look={look} />
      </div>
    </Shell>
  )
}

// --- Hisseli Proje -------------------------------------------------------------------

export interface ShareProjectView {
  campaignId: string
  title: string
  total: number
  taken: number
  unit: number | null
  campaign?: PricedCampaign
}
export interface StorySlide { image?: string; title?: string; text?: string }

export function ShareProject({ o, projects, slides, container, locale, editing }: {
  o: Record<string, any>; projects: ShareProjectView[]; slides: StorySlide[]; container: string; locale: string; editing?: boolean
}) {
  const w = words(locale)
  const look: Look = o.look || 'card'
  const s = SHELL[look] || SHELL.card
  const go = useInlineCheckout(editing)
  const firstOpen = Math.max(0, projects.findIndex((p) => p.total - p.taken > 0))
  const [pIdx, setPIdx] = useState(firstOpen)
  const [qty, setQty] = useState(0)
  const [manualSlide, setManualSlide] = useState<number | null>(null)
  const [names, setNames] = useState<string[]>([''])
  const [plaque, setPlaque] = useState('')
  const [error, setError] = useState('')
  const presets = useMemo(() => parsePresets(o.presets), [o.presets])
  const project = projects[Math.min(pIdx, projects.length - 1)]

  if (!project) {
    return editing ? <div className={container}><p className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-400">Proje ekleyin (her biri bir kampanya)</p></div> : null
  }
  const remaining = Math.max(0, project.total - project.taken)
  const limit = Math.min(remaining, quantityLimits(project.campaign).max)
  const min = Math.min(quantityLimits(project.campaign).min, Math.max(1, limit))
  const whole = remaining > 0 && qty === remaining
  const slide = manualSlide ?? storyIndex(qty, remaining, slides.length)
  const shown = slides[slide]
  const nextSlide = slides[slide + 1]
  const total = project.unit != null ? Math.round(project.unit * qty * 100) / 100 : 0
  const allowNames = o.allow_names !== false

  const setQuantity = (n: number) => { setQty(Math.max(0, Math.min(limit, n))); setManualSlide(null); setError('') }
  const pay = () => {
    if (project.unit == null) return setError(w.noPrice)
    if (qty < min) return setError(w.pickOne)
    setError(editing ? w.preview : '')
    const people = names.map((n) => n.trim()).filter(Boolean)
    const metadata: Record<string, unknown> = { birim: 'hisse', proje: project.title }
    if (allowNames && people.length) { metadata.hissedarlar = people.join(', '); metadata.ad_soyad_adina = people.join(', ') }
    if (whole && o.plaque_label && plaque.trim()) metadata.tabela = plaque.trim()
    const line = cartLine(project.campaign, project.campaignId, project.title, project.unit, qty, metadata, whole ? [w.whole] : [])
    // The cart must not grow past the shares that are left.
    go([{ ...line, maxQuantity: Math.min(line.maxQuantity, limit) }])
  }

  return (
    <Shell look={look} container={container} badge={o.badge_label} pill={o.pill_label} kicker={o.kicker} title={o.title} text={o.text}>
      <div className="grid gap-6 lg:grid-cols-2">
        {slides.length > 0 && (
          <div className="flex flex-col">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gray-100">
              {shown?.image && <img key={slide} src={shown.image} alt={shown.title || ''} className="h-full w-full object-cover" loading="lazy" />}
              <span className="absolute start-3 top-3 rounded-lg bg-white/90 px-2 py-1 text-xs font-bold text-gray-900">{slide + 1} / {slides.length}</span>
            </div>
            <div className="mt-4 text-center">
              {shown?.title && <div className="font-heading text-lg font-bold">{shown.title}</div>}
              {shown?.text && <p className={`mx-auto mt-1 max-w-md text-sm ${s.muted}`}>{shown.text}</p>}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {slides.map((_, i) => (
                <button key={i} type="button" aria-label={`${i + 1}`} onClick={() => setManualSlide(i)}
                  className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-6 bg-primary-600' : 'w-1.5 bg-gray-300'}`} />
              ))}
            </div>
          </div>
        )}

        <div className={`space-y-4 ${slides.length ? '' : 'lg:col-span-2'}`}>
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-xl p-3 ${s.box}`}>
              <div className={`text-[11px] font-bold uppercase ${s.muted}`}>{w.shareOne}</div>
              <div className="text-xl font-extrabold">{project.unit != null ? money(project.unit, locale) : '—'}</div>
            </div>
            <div className={`rounded-xl p-3 ${s.box}`}>
              <div className={`text-[11px] font-bold uppercase ${s.muted}`}>{project.title}</div>
              <div className="text-xl font-extrabold">{project.total} {w.share}</div>
            </div>
          </div>

          {remaining > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {presets.filter((n) => n <= limit).map((n) => (
                  <button key={n} type="button" onClick={() => setQuantity(n)} aria-pressed={qty === n}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${qty === n ? s.chipOn : s.chip}`}>{n} {w.share}</button>
                ))}
                {o.allow_full !== false && limit === remaining && (
                  <button type="button" onClick={() => setQuantity(remaining)} aria-pressed={whole}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${whole ? s.chipOn : s.chip}`}>{w.whole}</button>
                )}
              </div>
              <Stepper value={qty} onChange={setQuantity} min={min} max={limit} look={look} w={w} />
            </div>
          ) : (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{w.soldOut}</p>
          )}

          {slides.length > 0 && (
            <div className={`flex items-center justify-between gap-3 text-xs ${s.muted}`}>
              <span><b className="text-primary-600">{slide + 1}/{slides.length}</b> {qty ? shown?.title : w.startHint}</span>
              {nextSlide?.title && <span>{w.next}: {nextSlide.title}</span>}
            </div>
          )}

          {projects.length > 1 && (
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider">{w.project}</span>
              <select value={pIdx} onChange={(e) => { setPIdx(Number(e.target.value)); setQty(0); setManualSlide(null) }}
                className={`h-11 w-full rounded-xl px-3 text-sm font-semibold ${s.input}`}>
                {projects.map((p, i) => {
                  const left = Math.max(0, p.total - p.taken)
                  return <option key={p.campaignId + i} value={i} disabled={!left}>{p.title} — {left ? `${left} ${w.remaining}` : w.full}</option>
                })}
              </select>
            </label>
          )}

          {whole && o.plaque_label && (
            <label className="block">
              <span className={`mb-1.5 block text-xs ${s.muted}`}>{o.plaque_label}</span>
              <input value={plaque} onChange={(e) => setPlaque(e.target.value)} placeholder={w.plaque} maxLength={60}
                className={`h-11 w-full rounded-xl px-3 text-sm ${s.input}`} />
            </label>
          )}

          {allowNames && (
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider">{w.whose}</div>
              <div className="space-y-2">
                {names.map((n, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={n} onChange={(e) => setNames((l) => l.map((v, k) => (k === i ? e.target.value : v)))} placeholder={w.name} maxLength={60}
                      className={`h-11 min-w-0 flex-1 rounded-xl px-3 text-sm ${s.input}`} />
                    {names.length > 1 && (
                      <button type="button" aria-label={w.remove} onClick={() => setNames((l) => l.filter((_, k) => k !== i))}
                        className={`h-11 w-11 shrink-0 rounded-xl text-sm ${s.chip}`}>✕</button>
                    )}
                  </div>
                ))}
              </div>
              {names.length < Math.max(1, Math.min(qty, 20)) && (
                <button type="button" onClick={() => setNames((l) => [...l, ''])} className={`mt-2 rounded-full px-3 py-1 text-xs font-bold ${s.chip}`}>{w.addPerson}</button>
              )}
            </div>
          )}

          <div className={`flex items-center justify-between gap-4 border-t pt-4 ${look === 'dark' ? 'border-white/10' : 'border-gray-100'}`}>
            <div>
              <div className={`text-[11px] font-bold uppercase ${s.muted}`}>{w.total}</div>
              <div className="font-heading text-2xl font-extrabold tabular-nums">{money(total, locale)}</div>
            </div>
            <button type="button" onClick={pay} disabled={!remaining}
              className="flex h-12 items-center gap-2 rounded-full bg-primary-600 px-7 text-sm font-bold text-white shadow-lg transition hover:bg-primary-700 disabled:opacity-50">
              {o.button_label || 'Hisse Al'} <span aria-hidden>→</span>
            </button>
          </div>
          {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
          {o.list_url && o.list_label && (
            <div className="text-center">
              {String(o.list_url).startsWith('/')
                ? <Link href={o.list_url} className="text-sm font-semibold text-primary-600 hover:underline">💧 {o.list_label} →</Link>
                : <a href={o.list_url} className="text-sm font-semibold text-primary-600 hover:underline" target="_blank" rel="noopener noreferrer">💧 {o.list_label} →</a>}
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}
