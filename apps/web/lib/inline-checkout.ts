/**
 * Pure rules of the blocks that take a donation on the page (Kurban Planlayıcı,
 * Çoklu Ürün Paketi, Hisseli Proje). Each choice is a campaign; the server checks
 * price, quantity and intention again at checkout (services/donation_options.py).
 */

export interface PricedCampaign {
  id: string
  title?: string
  allow_custom_amount?: boolean
  suggested_amounts_cents?: number[] | null
  reference_amounts?: Record<string, number> | null
  collected_lira?: number
  donation_options?: { mode?: string; min_qty?: number; max_qty?: number; intents?: string[] } | null
  checkout_fields_schema?: { key?: string; options?: string[] }[] | null
}

/** Price of one unit in TL: the campaign's own price first, else the block's, else none. */
export function campaignUnit(campaign: PricedCampaign | undefined, fallback?: number): number | null {
  const mode = campaign?.donation_options?.mode
  if (mode && mode !== 'free') {
    if (mode === 'packages') return null
    const ref = campaign?.reference_amounts?.TRY
    return ref ? ref / 100 : null
  }
  if (campaign && !campaign.allow_custom_amount && campaign.suggested_amounts_cents?.length) {
    return campaign.suggested_amounts_cents[0] / 100
  }
  return fallback && fallback > 0 ? fallback : null
}

/** Quantity limits the campaign allows (only counted modes set them). */
export function quantityLimits(campaign: PricedCampaign | undefined, blockMin = 1): { min: number; max: number } {
  const o = campaign?.donation_options
  const counted = o?.mode === 'quantity' || o?.mode === 'share'
  const min = Math.max(1, counted ? o?.min_qty || 1 : 1, blockMin || 1)
  const max = counted ? o?.max_qty || 100 : 100
  return { min: Math.min(min, max), max }
}

export const STANDARD_INTENTS = ['Adak', 'Şükür', 'Şifa', 'Akika', 'Nafile', 'Sadaka', 'Vacip']

/** The campaign's intentions win (the server only accepts those); else the block's list; else the standard ones. */
export function intentsFor(campaign: PricedCampaign | undefined, blockList?: string): string[] {
  const own = campaign?.donation_options?.intents
  if (own?.length) return own
  const field = campaign?.checkout_fields_schema?.find((f) => f.key === 'niyet')?.options
  if (field?.length) return field
  const typed = (blockList || '').split(',').map((s) => s.trim()).filter(Boolean)
  return typed.length ? typed : STANDARD_INTENTS
}

export function parsePresets(text: string | undefined, fallback = [1, 5, 10]): number[] {
  const nums = (text || '').split(',').map((s) => Math.floor(Number(s.trim()))).filter((n) => Number.isFinite(n) && n > 0)
  return nums.length ? [...new Set(nums)].slice(0, 6) : fallback
}

/** Shares already taken: the larger of what staff typed and what donations paid for. */
export function sharesTaken(total: number, typed: number, collectedLira: number, unit: number | null): number {
  const paid = unit && unit > 0 ? Math.floor((collectedLira || 0) / unit) : 0
  return Math.min(total, Math.max(typed || 0, paid))
}

/** Story slide shown for a share count: moves forward as shares are added. */
export function storyIndex(quantity: number, remaining: number, slides: number): number {
  if (slides <= 1 || quantity <= 0 || remaining <= 0) return 0
  return Math.min(slides - 1, Math.max(1, Math.round((Math.min(quantity, remaining) / remaining) * (slides - 1))))
}

export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return { firstName: parts[0] || '', lastName: '' }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

/** Turkish mobile numbers: 10 digits starting with 5 after the country code / leading 0. */
export function validPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '')
  return /^5\d{9}$/.test(digits)
}

export interface CartLine {
  campaignId: string
  campaignTitle: string
  amount: number
  quantity: number
  metadata: Record<string, unknown>
  currency: 'TRY'
  locked: boolean
  minQuantity: number
  maxQuantity: number
}

export function cartLine(campaign: PricedCampaign | undefined, campaignId: string, title: string, unit: number, quantity: number,
  metadata: Record<string, unknown> = {}, suffix: string[] = []): CartLine {
  const limits = quantityLimits(campaign)
  const counted = campaign?.donation_options?.mode === 'quantity' || campaign?.donation_options?.mode === 'share'
  return {
    campaignId, campaignTitle: [title, ...suffix.filter(Boolean)].join(' · '), amount: unit,
    quantity, metadata, currency: 'TRY', locked: Boolean(campaign?.donation_options?.mode && campaign.donation_options.mode !== 'free'),
    minQuantity: counted ? limits.min : 1, maxQuantity: limits.max,
  }
}

/** Total of selected quantities against their unit prices. */
export function bundleTotal(items: { unit: number | null; qty: number }[]): number {
  return Math.round(items.reduce((sum, i) => sum + (i.unit || 0) * i.qty, 0) * 100) / 100
}
