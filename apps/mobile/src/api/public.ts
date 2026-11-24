import type { DonationOptions } from '@/lib/donationOptions';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ACTIVE_TENANT, tenantBaseUrl } from '@/config/tenant';
import { absoluteApiUrl, ApiError, donorAuthHeader, errorMessage, pub, webBase } from '@/lib/api';

export type SupportedCurrency = 'TRY' | 'USD' | 'EUR';

export type PublicSite = {
  slug: string;
  name: string;
  tagline?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  logo_url?: string | null;
  url?: string | null;
  card_payments?: boolean;
  hero?: {
    badge?: string | null;
    title?: string | null;
    subtitle?: string | null;
    image_url?: string | null;
    cta_label?: string | null;
  };
  contact?: {
    phone?: string | null;
    email?: string | null;
    whatsapp?: string | null;
    address?: string | null;
  };
  legal?: {
    legal_name?: string | null;
    kvkk_url?: string | null;
    terms_url?: string | null;
    preinfo_url?: string | null;
  };
};

export type PublicOrgSettings = {
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_address?: string | null;
  bank1_name?: string | null;
  bank1_iban?: string | null;
  bank2_name?: string | null;
  bank2_iban?: string | null;
  about_text?: string | null;
  mission_text?: string | null;
  vision_text?: string | null;
  whatsapp_number?: string | null;
  whatsapp_message?: string | null;
  instagram_url?: string | null;
  card_payments?: boolean;
  iban_page_url?: string | null;
  enabled_payment_currencies?: string[];
  legal?: {
    legal_name?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  };
};

export type PublicDonationCategory = {
  id: string;
  icon?: string | null;
  image_url?: string | null;
  title: string;
  description?: string | null;
  campaign_id?: string | null;
  donation_type?: string | null;
  target_url?: string | null;
  suggested_amounts_cents?: number[];
};

export type CheckoutFieldSchema = {
  key: string;
  label?: string;
  type?: 'text' | 'textarea' | 'select' | 'number' | 'phone' | 'list' | string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
};

export type PublicCampaign = {
  id: string;
  slug: string;
  title: string;
  display_name?: string | null;
  summary?: string | null;
  story?: string | null;
  category?: string | null;
  campaign_type?: string | null;
  country?: string | null;
  cover_image_url?: string | null;
  gallery_urls?: string[];
  suggested_amounts_cents?: number[];
  reference_amounts?: Record<string, number>;
  fixed_amount?: boolean;
  donation_options?: DonationOptions | null;
  allow_custom_amount?: boolean;
  min_donation_cents?: number;
  target_cents?: number;
  collected_cents?: number;
  currency?: string;
  is_featured?: boolean;
  is_zakat?: boolean;
  show_collected?: boolean;
  tags?: string[];
  checkout_fields_schema?: CheckoutFieldSchema[];
};

export type CampaignListPayload = {
  items: PublicCampaign[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type PublicContentPost = {
  id: string;
  kind: 'haber' | 'blog' | 'faaliyet' | string;
  slug: string;
  title: string;
  summary?: string | null;
  body?: string | null;
  image_url?: string | null;
  gallery_urls?: string[];
  video_url?: string | null;
  published_at?: string | null;
};

export type PublicSitePage = {
  slug: string;
  title: string;
  body?: string | null;
  blocks?: any[] | null;
};

export type ZakatInfo = {
  gold_price_per_gram?: number | null;
  nisap_amount_lira?: number | null;
  usd_rate?: number | null;
  eur_rate?: number | null;
  updated_at?: string | null;
  stale?: boolean;
};

export type ReceiptVerifyResult = {
  status: 'valid' | 'refunded' | 'cancelled' | string;
  receipt_number: string;
  code_verified: boolean;
  donor_name?: string | null;
  campaign_title?: string | null;
  currency: string;
  amount_lira: number;
  created_at?: string | null;
  payment_method?: string | null;
  video_url?: string | null;
  pdf_url?: string | null;
  certificate_url?: string | null;
};

export type CheckoutSessionPayload = {
  items: {
    campaign_id: string;
    quantity: number;
    unit_amount_cents: number;
    donor_message?: string | null;
    on_behalf_of?: string | null;
    on_behalf_of_phone?: string | null;
    metadata?: Record<string, any>;
  }[];
  donor: {
    first_name: string;
    last_name: string;
    email?: string | null;
    phone: string;
    is_anonymous?: boolean;
    allow_email?: boolean;
    allow_sms?: boolean;
  };
  payment_method: 'credit_card' | 'bank_transfer';
  currency: SupportedCurrency;
  locale?: 'tr' | 'en' | 'ar';
  idempotency_key: string;
  consent_version?: string;
  kvkk_accepted: boolean;
  terms_accepted: boolean;
};

export type CheckoutSessionResponse = {
  checkout_id: string;
  status: string;
  redirect_url?: string | null;
  expires_at?: string | null;
  transfer_reference?: string | null;
  bank_name?: string | null;
  iban?: string | null;
  account_holder?: string | null;
};

export type CheckoutStatusItem = {
  campaign_id: string;
  campaign_title: string;
  quantity: number;
  total_amount_cents: number;
  receipt_number?: string | null;
  verify_code?: string | null;
};

export type CheckoutStatusResponse = {
  checkout_id: string;
  status: string;
  total_cents: number;
  currency: string;
  transfer_reference?: string | null;
  failure_message?: string | null;
  refunded_cents?: number;
  items: CheckoutStatusItem[];
};

export const CATEGORY_LABELS: Record<string, string> = {
  all: 'Tümü',
  kurban: 'Kurban',
  su: 'Su Kuyusu',
  gida: 'Gıda / Gazze',
  egitim: 'Eğitim',
  zekat: 'Zekat',
  sadaka: 'Sadaka',
  insaat: 'İnşaat',
  yetim: 'Yetim',
  acil: 'Acil Yardım',
  ramazan: 'Ramazan',
  genel: 'Genel',
};

export function resolveMediaUrl(url?: string | null, siteUrl?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = (siteUrl || (ACTIVE_TENANT ? tenantBaseUrl() : webBase())).replace(/\/$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function fetchPublicSite(): Promise<PublicSite> {
  return pub<PublicSite>('/public/site');
}

/** Yayındaki uygulama tasarımı; yoksa null (gömülü tasarım gösterilir). */
export async function fetchAppDesign(): Promise<unknown> {
  return (await pub<{ design: unknown }>('/public/app-design'))?.design ?? null;
}

export function fetchOrgSettings(): Promise<PublicOrgSettings> {
  return pub<PublicOrgSettings>('/public/org-settings');
}

export async function fetchDonationCategories(): Promise<PublicDonationCategory[]> {
  try {
    const res = await pub<any>('/public/donation-categories');
    return Array.isArray(res) ? res : [];
  } catch {
    return [];
  }
}

export async function fetchCampaigns(params?: {
  category?: string;
  search?: string;
  featured?: boolean;
  is_zakat?: boolean;
  page_size?: number;
}): Promise<PublicCampaign[]> {
  const res = await pub<CampaignListPayload | PublicCampaign[]>('/campaigns', {
    query: {
      status: 'active',
      page_size: params?.page_size ?? 100,
      category: params?.category && params.category !== 'all' ? params.category : undefined,
      search: params?.search?.trim() || undefined,
      featured: params?.featured,
      is_zakat: params?.is_zakat,
    },
  });
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.items)) return res.items;
  return [];
}

export function fetchCampaignBySlug(slug: string): Promise<PublicCampaign> {
  return pub<PublicCampaign>(`/campaigns/${encodeURIComponent(slug)}`);
}

export async function fetchContentPosts(kind?: string): Promise<PublicContentPost[]> {
  const res = await pub<PublicContentPost[]>('/public/content-posts', {
    query: { kind: kind && kind !== 'all' ? kind : undefined, limit: 60 },
  });
  return Array.isArray(res) ? res : [];
}

export function fetchContentPost(slug: string): Promise<PublicContentPost> {
  return pub<PublicContentPost>(`/public/content-posts/${encodeURIComponent(slug)}`);
}

export function fetchPublicPage(slug: string): Promise<PublicSitePage> {
  return pub<PublicSitePage>(`/public/pages/${encodeURIComponent(slug)}`);
}

export type FxRatesResponse = {
  base: string;
  source?: string;
  rates: Record<string, { rate_try: number; fetched_at?: string }>;
};

export function fetchZakatInfo(): Promise<ZakatInfo> {
  return pub<ZakatInfo>('/public/zakat-info');
}

export async function fetchFxRates(): Promise<FxRatesResponse> {
  try {
    return await pub<FxRatesResponse>('/public/fx-rates');
  } catch {
    return { base: 'TRY', rates: {} };
  }
}

export function verifyPublicReceipt(receiptNumber: string, code?: string): Promise<ReceiptVerifyResult> {
  return pub<ReceiptVerifyResult>(`/public/receipts/${encodeURIComponent(receiptNumber.trim())}`, {
    query: code?.trim() ? { k: code.trim() } : undefined,
  });
}

/**
 * Bağış ödeme oturumu başlatır. Bağışçı oturumu açıksa Bearer donor token'ı otomatik
 * eklenir; böylece bağış doğrudan bağışçının hesabına (Bağışlarım / Kurban / Kuyu) işlenir.
 */
export async function createCheckoutSession(payload: CheckoutSessionPayload): Promise<CheckoutSessionResponse> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...donorAuthHeader(),
  };
  let response: Response;
  try {
    response = await fetch(absoluteApiUrl('/checkout/sessions'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }
  const text = await response.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const { message, code } = errorMessage(body, response.status);
    throw new ApiError(response.status, message, code, body);
  }
  return body as CheckoutSessionResponse;
}

export function fetchCheckoutStatus(checkoutId: string): Promise<CheckoutStatusResponse> {
  return pub<CheckoutStatusResponse>(`/checkout/${encodeURIComponent(checkoutId)}/status`);
}

/** Doğrulanmış bağış makbuzu PDF'ini indirip cihazda açar/paylaşır. */
export async function openPublicReceiptPdf(receiptNumber: string, verifyCode?: string | null): Promise<void> {
  const path = `/public/receipts/${encodeURIComponent(receiptNumber)}/pdf`;
  const url = absoluteApiUrl(path, verifyCode ? { k: verifyCode } : undefined);
  const filename = `makbuz-${receiptNumber.replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`;
  if (Platform.OS === 'web') {
    globalThis.open?.(url, '_blank');
    return;
  }
  const target = new File(Paths.cache, filename);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(url, target);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: filename });
  }
}
