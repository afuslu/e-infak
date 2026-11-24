'use client'

/** The donor's choices of a campaign with donation options: cards, campaign page and donation form share it. */
import { useEffect, useState } from 'react'
import {
  donationOptions, initialChoice, resolveChoice, unitPrice, type Convert, type DonationCampaign, type DonationChoice, type DonationOptions, type DonationResult,
} from '../lib/donation-options'

type Words = Record<'amount' | 'piece' | 'share' | 'month' | 'prepaid' | 'monthly' | 'once' | 'everyMonth' | 'total' | 'perMonth' | 'intent' | 'onBehalf' | 'note'
  | 'noPrice' | 'invalid' | 'min' | 'pickIntent' | 'monthlyHint', string>

const WORDS: Record<string, Words> = {
  tr: {
    amount: 'Tutar', piece: 'Adet', share: 'Hisse', month: 'Ay', prepaid: 'Peşin', monthly: 'Aylık öde', once: 'Tek seferlik', everyMonth: 'Her ay düzenli',
    total: 'Toplam', perMonth: 'ay', intent: 'Niyet seçin', onBehalf: 'Kimin adına? (isteğe bağlı)', note: 'Notunuz (isteğe bağlı)',
    noPrice: 'Bu kampanya seçili para birimiyle bağışlanamıyor.', invalid: 'Geçerli bir tutar girin.', min: 'En az', pickIntent: 'Lütfen niyet seçin.',
    monthlyHint: 'İlk ay şimdi alınır; kalan aylar kayıtlı kartınızdan çekilir ya da SMS ile ödeme bağlantısı gönderilir.',
  },
  en: {
    amount: 'Amount', piece: 'Quantity', share: 'Shares', month: 'Months', prepaid: 'Pay in full', monthly: 'Pay monthly', once: 'One-time', everyMonth: 'Every month',
    total: 'Total', perMonth: 'month', intent: 'Choose intention', onBehalf: 'On behalf of (optional)', note: 'Your note (optional)',
    noPrice: 'This campaign is not available in the selected currency.', invalid: 'Enter a valid amount.', min: 'Minimum', pickIntent: 'Please choose an intention.',
    monthlyHint: 'The first month is paid now; the rest is charged to your saved card or sent to you as a payment link by SMS.',
  },
  ar: {
    amount: 'المبلغ', piece: 'العدد', share: 'الأسهم', month: 'أشهر', prepaid: 'دفعة واحدة', monthly: 'دفع شهري', once: 'مرة واحدة', everyMonth: 'كل شهر',
    total: 'المجموع', perMonth: 'شهر', intent: 'اختر النية', onBehalf: 'نيابة عن (اختياري)', note: 'ملاحظتك (اختياري)',
    noPrice: 'هذه الحملة غير متاحة بالعملة المختارة.', invalid: 'أدخل مبلغًا صحيحًا.', min: 'الحد الأدنى', pickIntent: 'يرجى اختيار النية.',
    monthlyHint: 'يُدفع الشهر الأول الآن، وتُخصم الأشهر الباقية من بطاقتك المحفوظة أو يُرسل رابط الدفع برسالة.',
  },
}
const SYMBOLS: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' }

export interface DonationChoiceState {
  options: DonationOptions | null
  choice: DonationChoice
  set: (patch: Partial<DonationChoice>) => void
  result: DonationResult | null
  minimum: number
  words: Words
  /** '' when the choice can be donated. */
  validate: () => string
}

export function useDonationChoice(campaign: DonationCampaign | null | undefined, currency: string, convert: Convert, locale = 'tr'): DonationChoiceState {
  const options = donationOptions(campaign)
  const key = options ? JSON.stringify(options) : ''
  const [choice, setChoice] = useState<DonationChoice>(() => initialChoice(options || { mode: 'free' }))
  useEffect(() => {
    if (key) setChoice(initialChoice(JSON.parse(key)))
  }, [key])
  const words = WORDS[locale] || WORDS.tr
  const result = campaign && options ? resolveChoice(campaign, options, choice, currency, convert, words.month, words.monthly.toLocaleLowerCase(locale)) : null
  const minimumTry = (campaign?.min_donation_cents || 100) / 100
  const minimum = convert(minimumTry, 'TRY') ?? minimumTry
  return {
    options, choice, result, minimum, words,
    set: (patch) => setChoice((c) => ({ ...c, ...patch })),
    validate: () => {
      if (!options || !result) return ''
      if (result.unit == null) return options.mode === 'free' ? words.invalid : words.noPrice
      if (options.mode === 'free' && result.unit < minimum) return `${words.min} ${minimum.toLocaleString(locale)} ${SYMBOLS[currency] || currency}`
      if (options.intents?.length && !choice.intent) return words.pickIntent
      return ''
    },
  }
}

const field = 'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-800 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15'

export function DonationChoiceFields({ state, campaign, currency, convert, locale = 'tr', dark = false, hidePersonal = false }: {
  state: DonationChoiceState
  campaign: DonationCampaign
  currency: string
  convert: Convert
  locale?: string
  dark?: boolean
  /** The form around it already asks for "on behalf of" and a note. */
  hidePersonal?: boolean
}) {
  const { options, choice, set, result, words } = state
  if (!options || !result) return null
  const fmt = (n: number) => `${n.toLocaleString(locale === 'tr' ? 'tr-TR' : locale, { maximumFractionDigits: 2 })} ${SYMBOLS[currency] || currency}`
  const tab = (on: boolean) => `rounded-lg px-2 py-2 text-xs font-bold transition ${on ? 'bg-white text-primary-800 shadow-sm' : dark ? 'text-white/80 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`
  const pick = (on: boolean) => `rounded-xl border px-2 py-2 text-center text-xs font-bold transition ${
    on ? 'border-primary-600 bg-primary-600 text-white' : dark ? 'border-white/25 bg-white/10 text-white hover:bg-white/20' : 'border-gray-200 bg-gray-50 text-gray-800 hover:border-primary-400 hover:bg-primary-50'}`
  const pair = (left: string, right: string) => (
    <div className={`grid grid-cols-2 rounded-xl p-1 ${dark ? 'bg-white/10' : 'bg-gray-100'}`} role="group">
      <button type="button" aria-pressed={!choice.monthly} onClick={() => set({ monthly: false })} className={tab(!choice.monthly)}>{left}</button>
      <button type="button" aria-pressed={choice.monthly} onClick={() => set({ monthly: true })} className={tab(choice.monthly)}>{right}</button>
    </div>
  )
  const unit = unitPrice(campaign, currency, convert)
  const low = options.min_qty || 1
  const high = options.max_qty || 100
  const quantityWord = options.unit_label || (options.mode === 'share' ? words.share : words.piece)
  const suggestions = options.mode === 'free'
    ? (campaign.suggested_amounts_cents || []).map((c) => convert(c / 100, 'TRY')).filter((n): n is number => n != null && n >= state.minimum).map((n) => Math.round(n)).slice(0, 6)
    : []

  return (
    <div className="flex flex-col gap-2.5 text-start">
      {options.mode === 'free' && (
        <>
          {suggestions.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {suggestions.map((n) => <button key={n} type="button" onClick={() => set({ amount: String(n) })} className={pick(choice.amount === String(n))}>{fmt(n)}</button>)}
            </div>
          )}
          <div className="flex items-center rounded-xl border border-gray-200 bg-white pe-3 focus-within:border-primary-600">
            <input inputMode="decimal" aria-label={words.amount} placeholder={words.amount} value={choice.amount}
              onChange={(e) => set({ amount: e.target.value.replace(/[^\d.,]/g, '') })}
              className="min-w-0 flex-1 rounded-xl bg-transparent px-3.5 py-2.5 text-base font-bold text-gray-900 outline-none" />
            <span className="text-xs font-extrabold text-gray-600">{SYMBOLS[currency] || currency}</span>
          </div>
        </>
      )}
      {options.mode === 'packages' && (
        <div className="grid gap-2">
          {(options.packages || []).map((p) => {
            const price = convert(p.amount_cents / 100, 'TRY')
            const on = choice.packageId === p.id
            return (
              <button key={p.id} type="button" aria-pressed={on} onClick={() => set({ packageId: p.id })} className={`flex items-center justify-between gap-3 !px-3.5 !py-2.5 ${pick(on)}`}>
                <span className="min-w-0 text-start">{p.label}</span>
                <span className="shrink-0">{price == null ? '—' : fmt(price)}</span>
              </button>
            )
          })}
        </div>
      )}
      {options.mode === 'duration' && (
        <>
          {(options.durations || []).length <= 4 ? (
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, (options.durations || []).length)}, minmax(0, 1fr))` }}>
              {(options.durations || []).map((m) => <button key={m} type="button" aria-pressed={choice.months === m} onClick={() => set({ months: m })} className={pick(choice.months === m)}>{m} {words.month}</button>)}
            </div>
          ) : (
            <select aria-label={words.month} value={choice.months} onChange={(e) => set({ months: Number(e.target.value) })} className={field}>
              {(options.durations || []).map((m) => <option key={m} value={m}>{m} {words.month}</option>)}
            </select>
          )}
          {options.duration_payment === 'donor_choice' && choice.months > 1 && pair(words.prepaid, words.monthly)}
        </>
      )}
      {options.mode !== 'duration' && options.allow_recurring && pair(words.once, words.everyMonth)}
      {(options.mode === 'quantity' || options.mode === 'share') && (
        <div className="flex items-center justify-between gap-3">
          <span className={`text-xs font-semibold ${dark ? 'text-white/80' : 'text-gray-600'}`}>{quantityWord}{unit != null && ` · ${fmt(unit)}`}</span>
          <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button type="button" aria-label="−" disabled={choice.quantity <= low} onClick={() => set({ quantity: Math.max(low, choice.quantity - 1) })}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-gray-700 hover:bg-white disabled:opacity-30">−</button>
            <span className="min-w-[2.2rem] px-1 text-center text-sm font-bold text-gray-900" aria-live="polite">{choice.quantity}</span>
            <button type="button" aria-label="+" disabled={choice.quantity >= high} onClick={() => set({ quantity: Math.min(high, choice.quantity + 1) })}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-gray-700 hover:bg-white disabled:opacity-30">+</button>
          </div>
        </div>
      )}
      {!!options.intents?.length && (
        <select aria-label={words.intent} value={choice.intent} onChange={(e) => set({ intent: e.target.value })} className={field}>
          <option value="">{words.intent}</option>
          {options.intents.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      )}
      {!hidePersonal && options.allow_on_behalf && <input aria-label={words.onBehalf} placeholder={words.onBehalf} maxLength={120} value={choice.onBehalf} onChange={(e) => set({ onBehalf: e.target.value })} className={field} />}
      {!hidePersonal && options.allow_note && <input aria-label={words.note} placeholder={words.note} maxLength={300} value={choice.note} onChange={(e) => set({ note: e.target.value })} className={field} />}
      {options.mode !== 'free' && (
        <div className={`flex items-baseline justify-between gap-3 rounded-xl px-3.5 py-2.5 ${dark ? 'bg-white/10 text-white' : 'bg-primary-50 text-primary-950'}`}>
          <span className="text-xs font-semibold">{words.total}</span>
          <span className="text-base font-extrabold tabular-nums">
            {result.total == null ? '—' : fmt(result.total)}
            {result.monthly && <span className="text-xs font-semibold"> / {words.perMonth}{options.mode === 'duration' ? ` × ${choice.months}` : ''}</span>}
          </span>
        </div>
      )}
      {result.monthly && <p className={`text-[11px] leading-snug ${dark ? 'text-white/70' : 'text-gray-500'}`}>{words.monthlyHint}</p>}
      {result.total == null && options.mode !== 'free' && <p className="text-xs font-semibold text-red-600">{words.noPrice}</p>}
    </div>
  )
}
