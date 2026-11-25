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
  sms_opt_out: boolean;
  email_opt_out: boolean;
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
  campaign_type?: string;
  donation_options?: import('@/lib/donationOptions').DonationOptions | null;
  checkout_fields_schema?: { key?: string; options?: string[] }[] | null;
  type_details?: Record<string, unknown> | null;
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

export type MoneyBox = {
  id: string; code: string; region_id: string | null; region_name: string | null; location_name: string; address: string | null;
  city: string | null; district: string | null; contact_name: string | null; contact_phone: string | null; responsible_user_id: string | null;
  campaign_id: string | null; status: string; placed_at: string | null; last_collected_at: string | null; days_since_collection: number | null;
  notes: string | null; collection_count: number; total_collected_cents: number;
};

export type Task = {
  id: string; title: string; description: string | null; priority: 'low' | 'normal' | 'high' | 'urgent'; category: string | null;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled'; start_date: string | null; due_date: string | null; overdue: boolean;
  assigned_to_id: string | null; assigned_to_name: string | null; donor_id: string | null; donor_name: string | null;
  comments: { id: string; user_id: string; user_name: string; text: string; created_at: string }[];
  created_by_name: string | null; created_at: string; recurrence: string; subtasks_total: number; subtasks_done: number;
};

export const TASK_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'muted' | 'info' | 'danger' }> = {
  todo: { label: 'Yapılacak', tone: 'info' },
  in_progress: { label: 'Sürüyor', tone: 'warn' },
  done: { label: 'Tamamlandı', tone: 'ok' },
  cancelled: { label: 'İptal', tone: 'muted' },
};

export const PRIORITY: Record<string, string> = { low: 'Düşük', normal: 'Normal', high: 'Yüksek', urgent: 'Acil' };

export type Member = {
  id: string; member_no: string | null; member_type: string; member_type_label: string; status: string; status_label: string;
  joined_on: string | null; left_on: string | null; dues_cents: number | null; dues_period: 'monthly' | 'yearly' | null; notes: string | null;
  donor_id: string; full_name: string | null; phone: string | null; email: string | null; city: string | null;
  open_dues_cents: number; overdue_count: number; last_paid_at: string | null;
};

export type MemberDue = {
  id: string; member_id: string; period: string; due_date: string; amount_cents: number; status: 'open' | 'paid' | 'waived' | string;
  status_label: string; overdue: boolean; days_overdue: number; donation_id: string | null; paid_at: string | null; waived_reason: string | null;
};

export const MEMBER_TYPES = [
  { value: 'asil', label: 'Asil' }, { value: 'onursal', label: 'Onursal' }, { value: 'fahri', label: 'Fahri' }, { value: 'genc', label: 'Genç' },
];
export const MEMBER_STATUSES = [
  { value: 'active', label: 'Aktif' }, { value: 'passive', label: 'Pasif' }, { value: 'resigned', label: 'İstifa' },
  { value: 'expelled', label: 'İhraç' }, { value: 'deceased', label: 'Vefat' },
];

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'muted' | 'info' | 'danger' }> = {
  draft: { label: 'Taslak', tone: 'muted' },
  active: { label: 'Yayında', tone: 'ok' },
  paused: { label: 'Durduruldu', tone: 'warn' },
  completed: { label: 'Tamamlandı', tone: 'info' },
  cancelled: { label: 'İptal', tone: 'danger' },
};

export type DonationCategory = {
  id: string; icon: string; image_url: string | null; title: string; description: string; campaign_id: string | null; campaign_title: string | null;
  donation_type: string | null; target_url: string | null; suggested_amounts_cents: number[]; translations: Record<string, Record<string, string>>;
  display_order: number; is_active: boolean;
};

/** PUT tüm alanları ister; satırı gövdeye çevirir. */
export function categoryBody(c: DonationCategory, patch: Partial<DonationCategory> = {}) {
  const x = { ...c, ...patch };
  return {
    icon: x.icon, image_url: x.image_url, title: x.title, description: x.description, campaign_id: x.campaign_id,
    donation_type: x.donation_type, target_url: x.target_url, suggested_amounts_cents: x.suggested_amounts_cents,
    translations: x.translations, display_order: x.display_order, is_active: x.is_active,
  };
}
