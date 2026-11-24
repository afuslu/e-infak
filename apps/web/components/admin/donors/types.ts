export interface DonorRow {
  id: string
  donor_type: 'individual' | 'corporate'
  first_name: string
  last_name: string | null
  company_name: string | null
  full_name: string
  email: string | null
  phone: string | null
  city: string | null
  country: string | null
  total_donations: number
  total_donated_cents: number
  last_donation_at: string | null
  assigned_user_id: string | null
  assigned_user_name: string | null
  sms_opt_out: boolean
  email_opt_out: boolean
  tags: string[]
  created_at: string
  external_ref: string | null
  membership_type: string | null
  referral_source: string | null
  rating: string | null
  district: string | null
  staff_user_id: string | null
  staff_user_name: string | null
  has_tc: boolean
}

export interface DonorDonation {
  id: string; receipt_number: string; campaign_title: string | null; amount_cents: number; currency: string
  status: string; payment_method_label: string; paid_at: string; on_behalf_of: string | null; is_manual: boolean
  issued_by_name?: string | null; intent?: string | null
  removable?: boolean; movable?: boolean; bank_matched?: boolean
}

export interface DonorPledge {
  id: string; kind: string; title: string | null; installment_amount_cents?: number; currency?: string
  installment_count?: number; paid_count?: number; status?: string; start_date?: string
  share_count?: number; on_behalf_of?: string | null; created_at?: string
}

export interface DonorCard extends DonorRow {
  address: string | null
  tax_number: string | null
  tc_no_masked: string | null
  occupation: string | null
  blood_group: string | null
  gender: string | null
  birth_date: string | null
  neighbourhood: string | null
  phone_code: string | null
  phone2: string | null
  phone2_code: string | null
  donations: DonorDonation[]
  notes: { id: string; content: string; created_at: string; author: string | null }[]
  yearly: { year: number; count: number; totals: Record<string, number> }[]
  kurban_shares: {
    id: string; campaign: string | null; animal_number: string | null; share_number: number | null; kurban_type: string
    status: string; on_behalf_of: string | null; receipt_number: string | null; created_at: string
  }[]
  sponsorships: DonorPledge[]
  water_wells: DonorPledge[]
  history: { id: string; action: string; fields: string[]; user: string | null; created_at: string }[]
}

export interface Staff { id: string; first_name: string; last_name: string; is_active: boolean }

export interface DonorOptions { membership_type: string[]; referral_source: string[]; rating: string[]; occupation: string[] }

export interface DonorPerms { create: boolean; update: boolean; remove: boolean; imports: boolean; sms: boolean; notes: boolean; exports: boolean }

export const staffName = (s: Staff) => `${s.first_name} ${s.last_name}`.trim()

export const BLOOD_GROUPS = ['0+', '0-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']

export const PHONE_CODES = [
  { code: '90', label: '🇹🇷 +90' }, { code: '49', label: '🇩🇪 +49' }, { code: '31', label: '🇳🇱 +31' },
  { code: '32', label: '🇧🇪 +32' }, { code: '33', label: '🇫🇷 +33' }, { code: '43', label: '🇦🇹 +43' },
  { code: '41', label: '🇨🇭 +41' }, { code: '44', label: '🇬🇧 +44' }, { code: '1', label: '🇺🇸 +1' },
  { code: '46', label: '🇸🇪 +46' }, { code: '45', label: '🇩🇰 +45' }, { code: '966', label: '🇸🇦 +966' },
  { code: '971', label: '🇦🇪 +971' }, { code: '994', label: '🇦🇿 +994' }, { code: '7', label: '🇷🇺 +7' },
]

export const KURBAN_TYPE_LABEL: Record<string, string> = {
  vacip: 'Vacip', adak: 'Adak', akika: 'Akika', sukur: 'Şükür', nafile: 'Nafile', sadaka: 'Sadaka', sifa: 'Şifa',
}

/** Turkish phone as STK PRO shows it: "(536) 364 31 70". */
export function formatPhone(phone: string | null | undefined) {
  if (!phone) return ''
  if (phone.includes('*')) return phone
  const d = phone.replace(/\D/g, '')
  const local = d.length === 12 && d.startsWith('90') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d
  if (local.length !== 10) return phone
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)} ${local.slice(6, 8)} ${local.slice(8)}`
}
