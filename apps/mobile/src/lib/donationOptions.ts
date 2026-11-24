/** Campaign donation options (same rules as apps/web/lib/donation-options.ts and the server). */
import type { SupportedCurrency } from '@/api/public';

export type DonationMode = 'free' | 'fixed' | 'quantity' | 'share' | 'duration' | 'packages';
export type DonationOptions = {
  mode?: DonationMode;
  min_qty?: number;
  max_qty?: number;
  unit_label?: string;
  durations?: number[];
  duration_payment?: 'prepaid' | 'monthly' | 'donor_choice';
  packages?: { id: string; label: string; amount_cents: number }[];
  intents?: string[];
  allow_recurring?: boolean;
  allow_on_behalf?: boolean;
  allow_note?: boolean;
};
export type OptionCampaign = { donation_options?: DonationOptions | null; reference_amounts?: Record<string, number> };

export const MODE_OPTIONS: { value: DonationMode; label: string }[] = [
  { value: 'free', label: 'Serbest tutar' }, { value: 'fixed', label: 'Sabit tutar' }, { value: 'quantity', label: 'Adetli' },
  { value: 'share', label: 'Hisseli' }, { value: 'duration', label: 'Süreli' }, { value: 'packages', label: 'Paketli' },
];
export const isPriced = (mode?: string) => mode === 'fixed' || mode === 'quantity' || mode === 'share' || mode === 'duration';

export function optionsOf(c?: OptionCampaign | null): (DonationOptions & { mode: DonationMode }) | null {
  const o = c?.donation_options;
  return o?.mode ? (o as DonationOptions & { mode: DonationMode }) : null;
}

/** The donor has to choose something on the campaign's own page. */
export const needsChoice = (c: OptionCampaign) => {
  const o = optionsOf(c);
  return !!o && (o.mode !== 'free' || !!o.intents?.length);
};

/** TL cents → cents of `currency`; null without a rate. */
function convert(cents: number, currency: SupportedCurrency, rates: Record<string, number>): number | null {
  if (currency === 'TRY') return cents;
  return rates[currency] ? Math.round(cents / rates[currency]) : null;
}

export function unitCentsOf(c: OptionCampaign, currency: SupportedCurrency, rates: Record<string, number>): number | null {
  const own = c.reference_amounts?.[currency];
  if (own) return own;
  return c.reference_amounts?.TRY ? convert(c.reference_amounts.TRY, currency, rates) : null;
}

export const packageCents = (cents: number, currency: SupportedCurrency, rates: Record<string, number>) => convert(cents, currency, rates);

export type Choice = { months: number; monthly: boolean; packageId: string; intent: string };
export const initialChoice = (o: DonationOptions | null): Choice => ({
  months: o?.durations?.[0] || 1, monthly: false, packageId: o?.packages?.[0]?.id || '', intent: '',
});

/** Unit price to charge now, plus what the server needs to check it. `typed` is the amount of the free mode. */
export function resolve(c: OptionCampaign, choice: Choice, currency: SupportedCurrency, rates: Record<string, number>, typed: number) {
  const o = optionsOf(c);
  const metadata: Record<string, any> = {};
  if (!o) return { unit: typed as number | null, monthly: false, metadata, suffix: '' };
  const suffix: string[] = [];
  let monthly = o.mode !== 'duration' && !!o.allow_recurring && choice.monthly;
  let unit: number | null = typed;
  if (o.mode === 'packages') {
    const p = o.packages?.find((x) => x.id === choice.packageId);
    unit = p ? convert(p.amount_cents, currency, rates) : null;
    if (p) { metadata.paket_id = p.id; suffix.push(p.label); }
  } else if (o.mode !== 'free') {
    unit = unitCentsOf(c, currency, rates);
  }
  if (o.mode === 'duration') {
    monthly = choice.months > 1 && (o.duration_payment === 'monthly' || (o.duration_payment === 'donor_choice' && choice.monthly));
    metadata.sure_ay = choice.months;
    suffix.push(`${choice.months} Ay`);
    if (unit !== null && !monthly) unit *= choice.months;
  }
  if (monthly) { metadata.periyot = 'aylik'; suffix.push('aylık'); }
  if (choice.intent) { metadata.niyet = choice.intent; suffix.push(choice.intent); }
  return { unit, monthly, metadata, suffix: suffix.length ? ` · ${suffix.join(' · ')}` : '' };
}

export function limits(o: DonationOptions | null) {
  if (!o?.mode) return { locked: false, min: 1, max: 100 };
  if (o.mode === 'quantity' || o.mode === 'share') return { locked: true, min: o.min_qty || 1, max: o.max_qty || 100 };
  return { locked: o.mode !== 'free', min: 1, max: 1 };
}
