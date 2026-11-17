import type { Option } from '@/components/ui';

export type Donation = {
  id: string;
  receipt_number: string;
  official_receipt_no: string | null;
  campaign_id: string | null;
  campaign_title: string | null;
  amount_cents: number;
  currency: string;
  quantity?: number | null;
  status: 'confirmed' | 'pending' | 'failed' | 'refunded' | 'cancelled' | string;
  payment_method: string | null;
  payment_method_label: string | null;
  is_manual: boolean;
  source?: string | null;
  paid_at: string | null;
  on_behalf_of: string | null;
  donor_message?: string | null;
  issued_by_id?: string | null;
  issued_by_name: string | null;
  donor_id: string | null;
  donor_name: string | null;
  donor_phone: string | null;
  is_anonymous: boolean;
};

export type DonationTotals = { currency: string; count: number; total_cents: number };

export type Donor = {
  id: string;
  donor_type: 'individual' | 'corporate';
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  total_donations: number;
  total_donated_cents: number;
  last_donation_at: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  allow_sms: boolean;
  allow_email: boolean;
  tags: string[];
};

export type DonorCard = Donor & {
  address: string | null;
  tax_number: string | null;
  tc_no_masked: string | null;
  donations: Donation[];
  notes?: { id: string; content: string; created_at: string; author: string | null }[];
  yearly?: { year: number; count: number; totals: Record<string, number> }[];
};

export type Campaign = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  story: string | null;
  category: string | null;
  status: string;
  currency: string;
  target_cents: number | null;
  collected_cents: number;
  progress_percentage: number;
  is_featured: boolean;
  suggested_amounts_cents: number[];
  min_donation_cents: number | null;
  allow_custom_amount: boolean;
};

export type StaffUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  department_id: string | null;
  staff_role_id: string | null;
  [key: string]: any;
};

export const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'muted' }> = {
  confirmed: { label: 'Onaylı', tone: 'ok' },
  pending: { label: 'Bekliyor', tone: 'warn' },
  failed: { label: 'Başarısız', tone: 'danger' },
  refunded: { label: 'İade', tone: 'info' },
  cancelled: { label: 'İptal', tone: 'muted' },
};

export const STATUS_OPTIONS: Option[] = Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }));

export const PAYMENT_OPTIONS: Option[] = [
  { value: 'cash', label: 'Nakit' },
  { value: 'credit_card', label: 'Kredi kartı' },
  { value: 'bank_transfer', label: 'Havale / EFT' },
];

export const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'CHF'];
export const CURRENCY_OPTIONS: Option[] = CURRENCIES.map((c) => ({ value: c, label: c }));

/** Son bağıştan bu yana geçen güne göre etkinlik rozeti (web paneliyle aynı eşikler). */
export function activity(last: string | null): { label: string; tone: 'ok' | 'warn' | 'danger' | 'muted' } {
  if (!last) return { label: 'Bağış yok', tone: 'muted' };
  const days = (Date.now() - new Date(last).getTime()) / 86_400_000;
  if (days <= 90) return { label: 'Aktif', tone: 'ok' };
  if (days <= 180) return { label: 'Takipte', tone: 'warn' };
  return { label: 'Riskli', tone: 'danger' };
}

export const SMS_STATUS: Record<string, string> = {
  scheduled: 'Zamanlandı', queued: 'Kuyrukta', sent: 'Gönderildi', delivered: 'İletildi', failed: 'Başarısız', cancelled: 'İptal',
};
