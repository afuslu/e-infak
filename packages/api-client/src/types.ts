export interface Campaign {
  id: string
  slug: string
  title: string
  summary: string
  story?: string
  category: string
  status: string
  target_cents: number
  collected_cents: number
  target_lira: number
  collected_lira: number
  progress_percentage: number
  cover_image_url?: string
  gallery_urls: string[]
  video_url?: string
  suggested_amounts_cents: number[]
  allow_custom_amount: boolean
  min_donation_cents: number
  is_featured: boolean
  show_collected: boolean
  show_donor_list: boolean
  start_date?: string
  end_date?: string
  tags: string[]
  created_at: string
  updated_at?: string
}

export interface CampaignListResponse {
  items: Campaign[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface Donor {
  donor_type: 'individual' | 'corporate'
  first_name: string
  last_name?: string
  company_name?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  tc_no?: string
  tax_number?: string
  allow_email?: boolean
  allow_sms?: boolean
  is_anonymous?: boolean
}

export interface DonationCreate {
  campaign_id: string
  amount_cents: number
  payment_method: 'credit_card' | 'bank_transfer' | 'cash'
  donor: Donor
  donor_message?: string
  is_anonymous?: boolean
  card_number?: string
  card_expiry_month?: string
  card_expiry_year?: string
  card_cvv?: string
  card_holder_name?: string
}

export interface ThreeDSecureResponse {
  redirect_url: string
  redirect_method: string
  form_data: Record<string, string>
  donation_id: string
  receipt_number: string
}

export interface Donation {
  id: string
  receipt_number: string
  amount_cents: number
  amount_lira: number
  status: string
  payment_method: string
  campaign_id: string
  donor_id: string
  transaction_id?: string
  card_last_4?: string
  card_brand?: string
  paid_at?: string
  receipt_pdf_url?: string
  created_at: string
}

export interface UserRegister {
  email: string
  password: string
  first_name: string
  last_name: string
  phone?: string
}

export interface UserLogin {
  email: string
  password: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  full_name: string
  phone?: string
  role: string
  is_active: boolean
  organization_id: string
  created_at: string
}
