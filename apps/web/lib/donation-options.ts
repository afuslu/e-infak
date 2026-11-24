/** Campaign donation options: what a donor may choose. The server checks the same rules (services/donation_options.py). */

export type DonationMode = 'free' | 'fixed' | 'quantity' | 'share' | 'duration' | 'packages'
export type DurationPayment = 'prepaid' | 'monthly' | 'donor_choice'

export interface DonationPackage { id: string; label: string; amount_cents: number }

export interface DonationOptions {
  mode: DonationMode
  min_qty?: number
  max_qty?: number
  unit_label?: string
  durations?: number[]
  duration_payment?: DurationPayment
  packages?: DonationPackage[]
  intents?: string[]
  allow_recurring?: boolean
  allow_on_behalf?: boolean
  allow_note?: boolean
}

export const DONATION_MODES: ReadonlyArray<readonly [DonationMode, string, string]> = [
  ['free', 'Serbest tutar', 'Bağışçı tutarı kendi yazar; hazır tutarlar öneri olarak çıkar.'],
  ['fixed', 'Sabit tutar', 'Tek tutar vardır, değiştirilemez.'],
  ['quantity', 'Adetli', 'Birim tutar sabittir, bağışçı adet seçer (koli, Kur’an-ı Kerim, fidan).'],
  ['share', 'Hisseli', 'Birim tutar bir hissedir, bağışçı hisse sayısı seçer.'],
  ['duration', 'Süreli', 'Aylık tutar ve 1 / 6 / 12 ay gibi süre seçenekleri (sponsorluk, burs).'],
  ['packages', 'Paketli', 'Her biri kendi tutarı olan isimli paketler.'],
]
export const DONATION_MODE_LABEL: Record<string, string> = Object.fromEntries(DONATION_MODES.map(([k, l]) => [k, l]))
export const PRICED_MODES: readonly DonationMode[] = ['fixed', 'quantity', 'share', 'duration']

export interface DonationCampaign {
  donation_options?: Partial<DonationOptions> | null
  reference_amounts?: Record<string, number> | null
  suggested_amounts_cents?: number[] | null
  min_donation_cents?: number | null
  currency?: string | null
}

/** The campaign's options, or null for campaigns set up before they existed. */
export function donationOptions(campaign?: DonationCampaign | null): DonationOptions | null {
  const options = campaign?.donation_options
  return options?.mode ? (options as DonationOptions) : null
}

/** TL → the shown currency, or null without a rate. */
export type Convert = (amount: number, from: 'TRY') => number | null

export interface DonationChoice {
  amount: string
  quantity: number
  months: number
  monthly: boolean
  packageId: string
  intent: string
  onBehalf: string
  note: string
}

export function initialChoice(options: DonationOptions): DonationChoice {
  return {
    amount: '', quantity: options.min_qty || 1, months: options.durations?.[0] || 1,
    monthly: options.duration_payment === 'monthly' && options.mode === 'duration',
    packageId: options.packages?.[0]?.id || '', intent: '', onBehalf: '', note: '',
  }
}

export interface DonationResult {
  /** Price of one unit as it is charged now; null when there is no price or rate. */
  unit: number | null
  quantity: number
  total: number | null
  monthly: boolean
  metadata: Record<string, unknown>
  suffix: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function unitPrice(campaign: DonationCampaign, currency: string, convert: Convert): number | null {
  const refs = campaign.reference_amounts || {}
  if (refs[currency]) return refs[currency] / 100
  return refs.TRY ? convert(refs.TRY / 100, 'TRY') : null
}

export function resolveChoice(
  campaign: DonationCampaign, options: DonationOptions, choice: DonationChoice, currency: string, convert: Convert, monthWord = 'Ay', monthlyWord = 'aylık',
): DonationResult {
  const metadata: Record<string, unknown> = {}
  const suffix: string[] = []
  let unit: number | null
  let quantity = 1
  let monthly = false
  if (options.mode === 'free') {
    const typed = Number(choice.amount.replace(',', '.'))
    unit = Number.isFinite(typed) && typed > 0 ? round2(typed) : null
  } else if (options.mode === 'packages') {
    const chosen = options.packages?.find((p) => p.id === choice.packageId)
    unit = chosen ? convert(chosen.amount_cents / 100, 'TRY') : null
    if (chosen) { metadata.paket_id = chosen.id; suffix.push(chosen.label) }
  } else {
    unit = unitPrice(campaign, currency, convert)
  }
  if (options.mode === 'quantity' || options.mode === 'share') {
    quantity = choice.quantity
    metadata.birim = options.mode === 'share' ? 'hisse' : 'adet'
  }
  if (options.mode === 'duration') {
    const payment = options.duration_payment || 'prepaid'
    monthly = choice.months > 1 && (payment === 'monthly' || (payment === 'donor_choice' && choice.monthly))
    metadata.sure_ay = choice.months
    suffix.push(`${choice.months} ${monthWord}`)
    if (unit != null && !monthly) unit = round2(unit * choice.months)
  } else {
    monthly = Boolean(options.allow_recurring && choice.monthly)
  }
  if (monthly) { metadata.periyot = 'aylik'; suffix.push(monthlyWord) }
  if (choice.intent) { metadata.niyet = choice.intent; suffix.push(choice.intent) }
  if (options.allow_on_behalf && choice.onBehalf.trim()) metadata.ad_soyad_adina = choice.onBehalf.trim()
  if (options.allow_note && choice.note.trim()) metadata.bagisci_notu = choice.note.trim()
  return { unit, quantity, total: unit == null ? null : round2(unit * quantity), monthly, metadata, suffix: suffix.length ? ` · ${suffix.join(' · ')}` : '' }
}

/** Limits a cart line keeps, so the cart cannot change it into something the server refuses. */
export function cartLimits(options: DonationOptions): { locked: boolean; minQuantity: number; maxQuantity: number } {
  const counted = options.mode === 'quantity' || options.mode === 'share'
  return {
    locked: options.mode !== 'free',
    minQuantity: counted ? options.min_qty || 1 : 1,
    maxQuantity: counted ? options.max_qty || 100 : options.mode === 'duration' ? 1 : 100,
  }
}
