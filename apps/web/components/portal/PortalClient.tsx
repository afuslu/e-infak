'use client'

import { errorMessage } from '../../lib/api-error'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import {
  BadgeCheck,
  Bell,
  BookOpen,
  Building2,
  Repeat,
  ChevronLeft,
  CreditCard,
  Droplets,
  Heart,
  HeartHandshake,
  Home,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  MoonStar,
  Printer,
  Receipt,
  Settings,
  ShoppingBag,
  User,
  UserPlus,
  X,
} from 'lucide-react'
import { exportCsv } from '../../lib/admin-access'
import { ExcelIcon, PdfIcon } from '../admin/ui'
import { PORTAL_LANGS, PORTAL_STRINGS, type PortalLang } from './portal-i18n'
import {
  BillingProfilesCard,
  DonorRequestsSection,
  NotificationModal,
  PwaAndPushCard,
  ZekatAndCalendarSection,
  type PortalNotificationItem,
  type SupportRequestItem,
} from './DonorPortalExtras'

interface Donation {
  id: string
  receipt_number: string
  verify_code?: string | null
  amount_lira: number
  currency: string
  status: string
  payment_method: string
  donor_message: string | null
  campaign_slug?: string | null
  campaign_title?: string | null
  created_at: string
  water_well_images?: string[]
}

interface KurbanShare {
  id: string
  donor_name: string
  on_behalf_of?: string | null
  kurban_type?: string
  campaign_title?: string | null
  country?: string | null
  share_number: number | null
  status: 'waiting' | 'slaughtered'
  animal_number: string
  animal_type: string | null
  video_url?: string
}

interface PledgeInstallment { id: string; seq: number; due_date: string; amount_cents: number; status: 'pending' | 'overdue' | 'paid' }

interface MyPledge {
  id: string
  kind_label: string
  title: string | null
  status: string
  beneficiary: { first_name: string; kind: string; country: string | null; city: string | null; photo_url: string | null; school: string | null } | null
  installment_amount_cents: number
  currency: string
  paid_count: number
  installment_count: number
  next_installment: PledgeInstallment | null
  installments: PledgeInstallment[]
}

interface MemberDue { id: string; period: string; due_date: string; amount_cents: number; status: string; status_label: string; overdue: boolean; days_overdue: number; paid_at: string | null }

interface MyMembership {
  member_no: string
  member_type_label: string
  status_label: string
  joined_on: string | null
  dues: MemberDue[]
}

interface MyWell {
  id: string
  name: string
  location_name: string
  country: string | null
  status: string
  funding_model: string
  target_cents: number
  collected_cents: number
  my_shares: number
  is_owner: boolean
  has_pledge: boolean
  gallery_urls: string[]
  latitude?: number | null
  longitude?: number | null
}

interface Subscription {
  id: string
  campaign_title?: string
  amount_lira: number
  currency: string
  frequency?: string
  day_of_month?: number | null
  mode?: 'card' | 'reminder' | string
  card_brand?: string | null
  card_last4?: string | null
  status: string
  next_charge_date: string
}

interface PaymentOrder {
  id: string
  status: string
  total_cents: number
  refunded_cents: number
  currency: string
  payment_method: string
  transfer_reference?: string
  created_at: string
}

interface DonorProjects {
  water_wells: Array<{ id: string; name: string; location?: string; status: string; gallery_urls?: string[] }>
  orphan_sponsorships: Array<{ id: string; person_name: string; active: boolean; start_date?: string; end_date?: string }>
  student_sponsorships: Array<{ id: string; person_name: string; active: boolean; amount_cents: number }>
}

interface SavedCard {
  id: string
  subscription_id: string
  card_brand: string
  card_last4: string
  provider?: string | null
  campaign_title: string
  amount_lira: number
  currency: string
  status: string
  next_charge_date?: string | null
}

interface DonorProfile {
  id: string
  first_name: string
  last_name: string
  company_name?: string
  tc_no?: string
  tax_number?: string
  email: string
  phone: string
  address: string
  city: string
  country: string
  allow_email: boolean
  allow_sms: boolean
  is_anonymous: boolean
}

interface DonorVideo {
  id: string
  title: string
  url: string
  created_at?: string | null
}

interface TransferInfo { bank_name?: string; iban?: string; transfer_reference?: string }

type PayMethod = 'credit_card' | 'bank_transfer'
type TabKey =
  | 'ozet'
  | 'bagislar'
  | 'ustlendiklerim'
  | 'su-kuyularim'
  | 'projelerim'
  | 'talimatlarim'
  | 'kartlarim'
  | 'zekat'
  | 'taleplerim'
  | 'ayarlar'
  | 'uyelik'
  | 'odemeler'

const SESSION_KEY = 'einfak-portal'
const EMPTY_PROJECTS: DonorProjects = { water_wells: [], orphan_sponsorships: [], student_sponsorships: [] }

const DONATION_STATUS: Record<string, [string, string]> = {
  confirmed: ['Onaylandı', 'bg-green-100 text-green-800'],
  pending: ['Bekliyor', 'bg-amber-100 text-amber-800'],
  failed: ['Başarısız', 'bg-red-100 text-red-700'],
  refunded: ['İade edildi', 'bg-slate-100 text-slate-600'],
  cancelled: ['İptal', 'bg-slate-100 text-slate-600'],
}

const ORDER_STATUS: Record<string, [string, string]> = {
  pending: ['Bekliyor', 'bg-amber-100 text-amber-800'],
  awaiting_transfer: ['Havale bekleniyor', 'bg-amber-100 text-amber-800'],
  processing: ['İşleniyor', 'bg-sky-100 text-sky-800'],
  paid: ['Ödendi', 'bg-green-100 text-green-800'],
  failed: ['Başarısız', 'bg-red-100 text-red-700'],
  cancelled: ['İptal', 'bg-slate-100 text-slate-600'],
  partially_refunded: ['Kısmi iade', 'bg-slate-100 text-slate-600'],
  refunded: ['İade edildi', 'bg-slate-100 text-slate-600'],
  chargeback: ['Ters ibraz', 'bg-red-100 text-red-700'],
  review: ['İncelemede', 'bg-sky-100 text-sky-800'],
}

const METHOD_LABELS: Record<string, string> = { credit_card: 'Kredi kartı', bank_transfer: 'Havale / EFT', cash: 'Nakit' }
const WELL_STATUS: Record<string, string> = { planned: 'Planlandı', funding: 'Fon toplanıyor', drilling: 'Yapımda', completed: 'Tamamlandı' }

const date = (value: string) => new Date(value).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })

function money(amount: number, currency = 'TRY') {
  try {
    return amount.toLocaleString('tr-TR', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 })
  } catch {
    return `${amount.toLocaleString('tr-TR')} ${currency}`
  }
}
const cents = (value: number, currency = 'TRY') => money(value / 100, currency)

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string))

/** Every call goes through the same-origin gateway, which derives the organisation from the host. */
const apiBase = () => `${window.location.origin}/api/backend`

const errorText = errorMessage

/* ---------- small building blocks ---------- */

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tone}`}>{children}</span>
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-heading text-lg font-bold text-slate-900">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Empty({ icon, children, cta }: { icon: string; children: React.ReactNode; cta?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
      <div className="mb-2 text-3xl" aria-hidden="true">{icon}</div>
      <p className="text-sm text-slate-500">{children}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  )
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1.5 text-2xl font-black tracking-tight ${accent ? 'text-primary-700' : 'text-slate-900'}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

function PayButtons({ busy, onPay }: { busy: boolean; onPay: (method: PayMethod) => void }) {
  return (
    <span className="flex flex-shrink-0 gap-2">
      <button type="button" disabled={busy} onClick={() => onPay('credit_card')}
        className="rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
        {busy ? 'Bekleyin…' : 'Kartla öde'}
      </button>
      <button type="button" disabled={busy} onClick={() => onPay('bank_transfer')}
        className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        Havale
      </button>
    </span>
  )
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked: the value stays selectable on screen
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="flex items-center gap-2">
        <span className="select-all break-all font-mono text-sm font-bold text-slate-900">{value}</span>
        <button type="button" onClick={copy} className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50">
          {copied ? 'Kopyalandı' : 'Kopyala'}
        </button>
      </span>
    </div>
  )
}

const donateLink = (
  <Link href="/kampanyalar" className="inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700">
    Kampanyaları incele
  </Link>
)

/* ---------- page ---------- */

export function PortalClient({
  siteName,
  siteLogo,
  siteTagline,
}: {
  siteName: string
  siteLogo?: string | null
  siteTagline?: string | null
}) {
  const [step, setStep] = useState<'login' | 'otp' | 'dashboard'>('login')
  const [loginChannel, setLoginChannel] = useState<'sms' | 'email'>('sms')
  const [phone, setPhone] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [otpCode, setOtpCode] = useState('')
  const [resendIn, setResendIn] = useState(0)

  const [token, setToken] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [tab, setTab] = useState<TabKey>('ozet')
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)

  // Personalized certificate modal state
  const [certDonation, setCertDonation] = useState<Donation | null>(null)
  const [certHonoree, setCertHonoree] = useState('')
  const [certDedication, setCertDedication] = useState<'adina' | 'ruhuna' | 'hediye'>('adina')
  const [certDownloading, setCertDownloading] = useState(false)

  // Saved card update / attach modal state
  const [cardModalSub, setCardModalSub] = useState<{ id: string; title: string } | null>(null)
  const [cardForm, setCardForm] = useState({ holder_name: '', card_number: '', expire_month: '', expire_year: '', cvv: '' })
  const [savingCard, setSavingCard] = useState(false)

  const [donations, setDonations] = useState<Donation[]>([])
  const [shares, setShares] = useState<KurbanShare[]>([])
  const [myVideos, setMyVideos] = useState<DonorVideo[]>([])
  const [pledges, setPledges] = useState<MyPledge[]>([])
  const [memberships, setMemberships] = useState<MyMembership[]>([])
  const [myWells, setMyWells] = useState<MyWell[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([])
  const [projects, setProjects] = useState<DonorProjects>(EMPTY_PROJECTS)
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [profile, setProfile] = useState<DonorProfile | null>(null)
  const [profileForm, setProfileForm] = useState({
    first_name: '',
    last_name: '',
    company_name: '',
    tc_no: '',
    tax_number: '',
    email: '',
    city: '',
    address: '',
    allow_sms: false,
    allow_email: false,
    is_anonymous: false,
  })
  const [requests, setRequests] = useState<SupportRequestItem[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [readNotifIds, setReadNotifIds] = useState<string[]>([])
  const [lang, setLang] = useState<PortalLang>('tr')

  useEffect(() => {
    try {
      const savedLang = localStorage.getItem('einfak-portal-lang')
      if (savedLang === 'tr' || savedLang === 'en' || savedLang === 'ar' || savedLang === 'de') setLang(savedLang)
      const savedRead = JSON.parse(localStorage.getItem('einfak-portal-read-notifs') || '[]')
      if (Array.isArray(savedRead)) setReadNotifIds(savedRead)
    } catch { /* ignore */ }
  }, [])

  const changeLang = (next: PortalLang) => {
    setLang(next)
    try { localStorage.setItem('einfak-portal-lang', next) } catch { /* ignore */ }
  }
  const L = PORTAL_STRINGS[lang]
  const isRtl = lang === 'ar'
  const [savingProfile, setSavingProfile] = useState(false)
  const [removingCardId, setRemovingCardId] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(true)
  const [siteNavOpen, setSiteNavOpen] = useState(false)
  const [cartItemCount, setCartItemCount] = useState(0)

  useEffect(() => {
    const readCart = () => {
      try {
        const items = JSON.parse(localStorage.getItem('einfak_cart') || '[]')
        setCartItemCount(Array.isArray(items) ? items.reduce((sum: number, i: { quantity?: number }) => sum + (Number(i?.quantity) || 1), 0) : 0)
      } catch {
        setCartItemCount(0)
      }
    }
    readCart()
    window.addEventListener('donation-cart-changed', readCart)
    window.addEventListener('storage', readCart)
    return () => {
      window.removeEventListener('donation-cart-changed', readCart)
      window.removeEventListener('storage', readCart)
    }
  }, [])

  const [payingId, setPayingId] = useState<string | null>(null)
  const [transferInfo, setTransferInfo] = useState<TransferInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)

  const persistSession = useCallback((access: string, refresh: string | null, name: string, persist: boolean) => {
    const data = JSON.stringify({ token: access, refreshToken: refresh, role: 'donor', name, persist })
    try {
      if (persist) {
        localStorage.setItem(SESSION_KEY, data)
        sessionStorage.removeItem(SESSION_KEY)
      } else {
        sessionStorage.setItem(SESSION_KEY, data)
        localStorage.removeItem(SESSION_KEY)
      }
    } catch { /* ignore */ }
  }, [])

  const logout = useCallback((message = '') => {
    try {
      sessionStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(SESSION_KEY)
    } catch { /* ignore */ }
    setToken(null)
    setRefreshToken(null)
    setStep('login')
    setOtpCode('')
    setTab('ozet')
    setDonations([]); setShares([]); setMyVideos([]); setPledges([]); setMemberships([]); setMyWells([])
    setSubscriptions([]); setPaymentOrders([]); setProjects(EMPTY_PROJECTS)
    setTransferInfo(null)
    setSuccessMsg('')
    setErrorMsg(message)
  }, [])

  const authHeaders = (authToken: string | null) => ({ Authorization: `Bearer ${authToken}` })

  /** An expired session sends the visitor back to the sign-in step. */
  const expired = useCallback((err: unknown) => {
    if ((err as { response?: { status?: number } })?.response?.status !== 401) return false
    logout('Oturumunuzun süresi doldu. Lütfen yeniden giriş yapın.')
    return true
  }, [logout])

  const loadDashboard = useCallback(async (authToken: string, storedRefresh?: string | null, persist?: boolean) => {
    const base = apiBase()
    const headers = authHeaders(authToken)
    setDataLoading(true)
    try {
      const get = (path: string) => axios.get(`${base}/api/v1/portal/me/${path}`, { headers })
      const [donationsRes, sharesRes, subsRes, ordersRes, projectsRes] = await Promise.all([
        get('donations'), get('kurban-shares'), get('subscriptions'), get('payment-orders'), get('projects'),
      ])
      setDonations(donationsRes.data)
      setShares(sharesRes.data)
      setSubscriptions(subsRes.data)
      setPaymentOrders(ordersRes.data)
      setProjects(projectsRes.data)
      // Package-dependent modules: a failure here must not hide the rest of the dashboard.
      const [pledgesRes, wellsRes, duesRes, cardsRes, profileRes, reqsRes, videosRes] = await Promise.allSettled([
        get('pledges'),
        get('water-wells'),
        get('member-dues'),
        get('cards'),
        get('profile'),
        get('requests'),
        get('videos'),
      ])
      if (pledgesRes.status === 'fulfilled') setPledges(pledgesRes.value.data)
      if (wellsRes.status === 'fulfilled') setMyWells(wellsRes.value.data)
      if (duesRes.status === 'fulfilled') setMemberships(duesRes.value.data)
      if (cardsRes.status === 'fulfilled') setSavedCards(cardsRes.value.data)
      if (reqsRes.status === 'fulfilled' && Array.isArray(reqsRes.value.data)) setRequests(reqsRes.value.data)
      if (videosRes.status === 'fulfilled' && Array.isArray(videosRes.value.data)) setMyVideos(videosRes.value.data)
      if (profileRes.status === 'fulfilled') {
        const p: DonorProfile = profileRes.value.data
        setProfile(p)
        setProfileForm({
          first_name: p.first_name || '',
          last_name: p.last_name || '',
          company_name: p.company_name || '',
          tc_no: p.tc_no || '',
          tax_number: p.tax_number || '',
          email: p.email || '',
          city: p.city || '',
          address: p.address || '',
          allow_sms: Boolean(p.allow_sms),
          allow_email: Boolean(p.allow_email),
          is_anonymous: Boolean(p.is_anonymous),
        })
        const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ')
        if (fullName) setDisplayName(fullName)
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      const rt = storedRefresh ?? refreshToken
      if (status === 401 && rt) {
        try {
          const r = await axios.post(`${base}/api/v1/portal/refresh`, { refresh_token: rt })
          const nextAccess: string = r.data.access_token
          const nextRefresh: string = r.data.refresh_token || rt
          const person = r.data.donor
          const nextName = [person?.first_name, person?.last_name].filter(Boolean).join(' ')
          setToken(nextAccess)
          setRefreshToken(nextRefresh)
          if (nextName) setDisplayName(nextName)
          persistSession(nextAccess, nextRefresh, nextName, persist ?? rememberMe)
          await loadDashboard(nextAccess, null, persist ?? rememberMe)
          return
        } catch {
          logout('Oturumunuzun süresi doldu. Lütfen yeniden giriş yapın.')
          return
        }
      }
      if (!expired(err)) setErrorMsg('Bilgileriniz yüklenemedi. Lütfen sayfayı yenileyin.')
    } finally {
      setDataLoading(false)
    }
  }, [expired, logout, persistSession, refreshToken, rememberMe])

  // Restore saved session (persistent localStorage first, then tab-only sessionStorage).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY)
      const saved = JSON.parse(raw || 'null')
      if (saved?.token && (!saved.role || saved.role === 'donor')) {
        const isPersistent = Boolean(localStorage.getItem(SESSION_KEY))
        setRememberMe(isPersistent)
        setToken(saved.token)
        setRefreshToken(typeof saved.refreshToken === 'string' ? saved.refreshToken : null)
        setDisplayName(typeof saved.name === 'string' ? saved.name : '')
        setStep('dashboard')
        loadDashboard(saved.token, typeof saved.refreshToken === 'string' ? saved.refreshToken : null, isPersistent)
      }
    } catch {
      // storage unavailable: sign in again
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  const authPath = (name: string) => `${apiBase()}/api/v1/portal/${name}`

  const sendOtp = async () => {
    const target = loginChannel === 'email' ? loginEmail.trim() : phone.trim()
    if (!target) return
    setErrorMsg('')
    setSuccessMsg('')
    setLoading(true)
    try {
      const body = loginChannel === 'email' ? { email: loginEmail.trim() } : { phone: phone.trim() }
      await axios.post(authPath('send-otp'), body)
      setStep('otp')
      setOtpCode('')
      setResendIn(60)
    } catch (err) {
      setErrorMsg(errorText(err, 'Doğrulama kodu gönderilemedi.'))
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!otpCode) return
    setErrorMsg('')
    setLoading(true)
    try {
      const body = loginChannel === 'email'
        ? { email: loginEmail.trim(), code: otpCode }
        : { phone: phone.trim(), code: otpCode }
      const res = await axios.post(authPath('verify-otp'), body)
      const accessToken: string = res.data.access_token
      const nextRefresh: string | null = res.data.refresh_token || null
      const person = res.data.donor || res.data.user
      const name = [person?.first_name, person?.last_name].filter(Boolean).join(' ')
      setToken(accessToken)
      setRefreshToken(nextRefresh)
      setDisplayName(name)
      setStep('dashboard')
      setSuccessMsg('')
      persistSession(accessToken, nextRefresh, name, rememberMe)
      loadDashboard(accessToken, nextRefresh, rememberMe)
    } catch (err) {
      setErrorMsg(errorText(err, 'Kod geçersiz veya süresi dolmuş.'))
    } finally {
      setLoading(false)
    }
  }

  const pay = async (path: string, body: Record<string, unknown>, busyId: string, method: PayMethod) => {
    if (!token) return
    const question = method === 'credit_card'
      ? 'Ödeme sayfasına yönlendirileceksiniz. KVKK aydınlatma metnini, ön bilgilendirme formunu ve mesafeli bağış sözleşmesini (bagis-kosullari sayfası) okuyup kabul ediyor musunuz?'
      : 'KVKK aydınlatma metnini okuduğunuzu onaylıyor musunuz?'
    if (!window.confirm(question)) return
    setPayingId(busyId)
    setErrorMsg('')
    setTransferInfo(null)
    try {
      const res = await axios.post(`${apiBase()}/api/v1/portal/me/${path}`,
        { ...body, payment_method: method, kvkk_accepted: true, terms_accepted: method === 'credit_card' }, { headers: authHeaders(token) })
      if (res.data.redirect_url) {
        window.location.assign(res.data.redirect_url)
        return
      }
      setTransferInfo(res.data)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      if (!expired(err)) setErrorMsg(errorText(err, 'Ödeme başlatılamadı.'))
    } finally {
      setPayingId(null)
    }
  }
  const payInstallment = (id: string, method: PayMethod) => pay(`installments/${id}/pay`, {}, id, method)
  const payDues = (ids: string[], method: PayMethod) => pay('member-dues/pay', { due_ids: ids }, ids[0], method)

  const [newReminderAmount, setNewReminderAmount] = useState('500')
  const [newReminderDay, setNewReminderDay] = useState('15')
  const [creatingReminder, setCreatingReminder] = useState(false)

  const createReminderSubscription = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountNum = Number(newReminderAmount)
    if (!Number.isFinite(amountNum) || amountNum < 10) {
      setErrorMsg('Lütfen en az 10 TL tutar girin.')
      return
    }
    setCreatingReminder(true)
    setErrorMsg('')
    try {
      const res = await axios.post(
        `${apiBase()}/api/v1/portal/subscriptions`,
        {
          amount_cents: Math.round(amountNum * 100),
          currency: 'TRY',
          frequency: 'monthly',
          day_of_month: Number(newReminderDay) || 15,
        },
        { headers: authHeaders(token) },
      )
      setSubscriptions((current) => [res.data, ...current])
      setSuccessMsg('Aylık bağış hatırlatma talimatınız oluşturuldu.')
    } catch (err) {
      if (!expired(err)) setErrorMsg(errorText(err, 'Talimat oluşturulamadı.'))
    } finally {
      setCreatingReminder(false)
    }
  }

  const updateSubscriptionAction = async (id: string, action: 'pause' | 'resume' | 'cancel') => {
    if (action === 'cancel' && !window.confirm('Düzenli bağış talimatınızı iptal etmek istediğinize emin misiniz?')) return
    setErrorMsg('')
    try {
      const res = await axios.post(
        `${apiBase()}/api/v1/portal/subscriptions/${id}/action`,
        { action },
        { headers: authHeaders(token) },
      )
      setSubscriptions((current) =>
        current.map((s) => (s.id === id ? { ...s, ...res.data } : s)),
      )
      setSuccessMsg(
        action === 'pause'
          ? 'Talimatınız duraklatıldı.'
          : action === 'resume'
            ? 'Talimatınız yeniden etkinleştirildi.'
            : 'Düzenli bağış talimatınız iptal edildi.',
      )
    } catch (err) {
      if (!expired(err)) setErrorMsg(errorText(err, 'Talimat güncellenemedi.'))
    }
  }

  const cancelSubscription = async (id: string) => {
    await updateSubscriptionAction(id, 'cancel')
  }

  const printReceipt = (donation: Donation) => {
    const win = window.open('', '_blank')
    if (!win) {
      setErrorMsg('Makbuz penceresi açılamadı. Lütfen tarayıcınızda açılır pencerelere izin verin.')
      return
    }
    const status = DONATION_STATUS[donation.status]?.[0] || donation.status
    win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Bağış Makbuzu - ${escapeHtml(donation.receipt_number)}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #334155; }
        .card { max-width: 600px; margin: 0 auto; border: 2px solid #e2e8f0; border-radius: 16px; padding: 30px; }
        .header { text-align: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 20px; }
        .logo { font-size: 26px; font-weight: bold; color: #0f172a; }
        .title { font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-top: 6px; }
        .amount { font-size: 36px; font-weight: 900; text-align: center; color: #1e293b; margin: 20px 0; }
        .details { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font-size: 14px; }
        .label { font-weight: bold; color: #64748b; }
        .val { text-align: right; color: #0f172a; }
        .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 15px; }
      </style></head><body>
      <div class="card">
        <div class="header"><div class="logo">${escapeHtml(siteName)}</div><div class="title">Bağış Makbuzu</div></div>
        <div class="amount">${escapeHtml(money(donation.amount_lira, donation.currency))}</div>
        <div class="details">
          <div class="label">Makbuz numarası</div><div class="val">#${escapeHtml(donation.receipt_number)}</div>
          <div class="label">Bağış tarihi</div><div class="val">${escapeHtml(date(donation.created_at))}</div>
          <div class="label">Ödeme yöntemi</div><div class="val">${escapeHtml(METHOD_LABELS[donation.payment_method] || donation.payment_method)}</div>
          <div class="label">Durum</div><div class="val">${escapeHtml(status)}</div>
        </div>
        <div class="footer">Bu belge bağışçı panelinden üretilmiştir.<br>Katkılarınız için teşekkür ederiz.</div>
      </div></body></html>`)
    win.document.close()
    win.focus()
    // Printing is started from here: the site's content policy blocks inline scripts in the new window.
    win.print()
  }

  /* ---------- derived ---------- */

  const confirmed = donations.filter((d) => d.status === 'confirmed')
  const totals = confirmed.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.currency]: (acc[d.currency] || 0) + d.amount_lira }), {})
  const totalText = Object.entries(totals).map(([currency, amount]) => money(amount, currency)).join(' + ') || money(0)
  const currentYear = new Date().getFullYear()
  const sumYear = (yr: number) => {
    const byCur = confirmed
      .filter((d) => new Date(d.created_at).getFullYear() === yr)
      .reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.currency]: (acc[d.currency] || 0) + d.amount_lira }), {})
    return Object.entries(byCur).map(([currency, amount]) => money(amount, currency)).join(' + ') || money(0)
  }
  const thisYearCount = confirmed.filter((d) => new Date(d.created_at).getFullYear() === currentYear).length
  const lastYearCount = confirmed.filter((d) => new Date(d.created_at).getFullYear() === currentYear - 1).length
  const thisYearText = sumYear(currentYear)
  const lastYearText = sumYear(currentYear - 1)
  const needsProfileCompletion = Boolean(
    profile && !onboardingDismissed && (
      (!profile.first_name?.trim()) ||
      (profile.first_name.trim() === 'Değerli' && (profile.last_name || '').trim() === 'Bağışçı')
    ),
  )
  const projectCount = projects.water_wells.length + projects.orphan_sponsorships.length + projects.student_sponsorships.length
  const dueInstallments = pledges.filter((p) => p.status === 'active' && p.next_installment)
  const openDues = memberships.map((m) => ({ membership: m, open: m.dues.filter((d) => d.status === 'open') })).filter((m) => m.open.length)
  const openDuesCount = openDues.reduce((sum, m) => sum + m.open.length, 0)
  const myWellIds = new Set(myWells.map((w) => w.id))
  const extraWells = projects.water_wells.filter((w) => !myWellIds.has(w.id))
  const extraProjectCount = extraWells.length + projects.orphan_sponsorships.length + projects.student_sponsorships.length
  const awaitingTransfers = paymentOrders.filter((o) => o.status === 'awaiting_transfer')
  const pendingCount = dueInstallments.length + openDues.length + awaitingTransfers.length

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    if (!profileForm.first_name.trim()) {
      setErrorMsg('Ad alanı boş bırakılamaz.')
      return
    }
    setSavingProfile(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const res = await axios.patch(`${apiBase()}/api/v1/portal/me/profile`, profileForm, { headers: authHeaders(token) })
      const p: DonorProfile = res.data
      setProfile(p)
      const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ')
      if (fullName) {
        setDisplayName(fullName)
        persistSession(token, refreshToken, fullName, rememberMe)
      }
      setOnboardingDismissed(true)
      setSuccessMsg('Hesap bilgileriniz ve tercihleriniz kaydedildi.')
    } catch (err) {
      if (!expired(err)) setErrorMsg(errorText(err, 'Bilgiler güncellenemedi.'))
    } finally {
      setSavingProfile(false)
    }
  }

  const removeSavedCard = async (cardId: string) => {
    if (!token) return
    if (!window.confirm('Bu kartı kaldırmak istediğinize emin misiniz? İlgili düzenli bağış talimatınız SMS hatırlatma moduna geçecektir.')) return
    setRemovingCardId(cardId)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      await axios.delete(`${apiBase()}/api/v1/portal/me/cards/${encodeURIComponent(cardId)}`, { headers: authHeaders(token) })
      setSavedCards((prev) => prev.filter((c) => c.id !== cardId))
      setSuccessMsg('Kayıtlı kart kaldırıldı.')
      loadDashboard(token)
    } catch (err) {
      if (!expired(err)) setErrorMsg(errorText(err, 'Kart kaldırılamadı.'))
    } finally {
      setRemovingCardId(null)
    }
  }

  const downloadPersonalizedCertificate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !certDonation) return
    setCertDownloading(true)
    setErrorMsg('')
    try {
      const params = new URLSearchParams()
      if (certHonoree.trim()) {
        params.set('honoree', certHonoree.trim())
        params.set('dedication', certDedication)
      }
      const qs = params.toString()
      const res = await axios.get(
        `${apiBase()}/api/v1/portal/donations/${certDonation.id}/certificate.pdf${qs ? `?${qs}` : ''}`,
        { headers: authHeaders(token), responseType: 'blob' },
      )
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `sertifika-${certDonation.receipt_number}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setCertDonation(null)
      setCertHonoree('')
      setSuccessMsg('Hayır sertifikanız indirildi.')
    } catch (err) {
      if (!expired(err)) setErrorMsg(errorText(err, 'Sertifika oluşturulamadı.'))
    } finally {
      setCertDownloading(false)
    }
  }

  const saveUpdatedCard = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !cardModalSub) return
    setSavingCard(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      await axios.post(
        `${apiBase()}/api/v1/portal/me/cards/${encodeURIComponent(cardModalSub.id)}`,
        {
          holder_name: cardForm.holder_name.trim(),
          card_number: cardForm.card_number.replace(/\s+/g, ''),
          expire_month: cardForm.expire_month.trim(),
          expire_year: cardForm.expire_year.trim(),
          cvv: cardForm.cvv.trim(),
        },
        { headers: authHeaders(token) },
      )
      setCardModalSub(null)
      setCardForm({ holder_name: '', card_number: '', expire_month: '', expire_year: '', cvv: '' })
      setSuccessMsg('Kartınız başarıyla kaydedildi.')
      loadDashboard(token)
    } catch (err) {
      if (!expired(err)) setErrorMsg(errorText(err, 'Kart kaydedilemedi.'))
    } finally {
      setSavingCard(false)
    }
  }

  const sponsorshipCount = pledges.length + projects.orphan_sponsorships.length + projects.student_sponsorships.length
  const wellsCount = myWells.length + extraWells.length
  const projectsCount = shares.length

  const tabs = ([
    { key: 'ozet', label: L.tabs.ozet, icon: LayoutDashboard, count: pendingCount },
    { key: 'bagislar', label: L.tabs.bagislar, icon: HeartHandshake, count: donations.length },
    { key: 'ustlendiklerim', label: L.tabs.ustlendiklerim, icon: UserPlus, count: sponsorshipCount },
    { key: 'su-kuyularim', label: L.tabs['su-kuyularim'], icon: Droplets, count: wellsCount },
    { key: 'projelerim', label: L.tabs.projelerim, icon: Building2, count: projectsCount },
    { key: 'talimatlarim', label: L.tabs.talimatlarim, icon: Repeat, count: subscriptions.length },
    { key: 'kartlarim', label: L.tabs.kartlarim, icon: CreditCard, count: savedCards.length },
    { key: 'zekat', label: L.tabs.zekat, icon: MoonStar, count: 0 },
    { key: 'taleplerim', label: L.tabs.taleplerim, icon: MessageSquare, count: requests.length },
    memberships.length ? { key: 'uyelik', label: L.tabs.uyelik, icon: BadgeCheck, count: openDuesCount } : null,
    paymentOrders.length ? { key: 'odemeler', label: L.tabs.odemeler, icon: Receipt, count: paymentOrders.length } : null,
    { key: 'ayarlar', label: L.tabs.ayarlar, icon: Settings, count: 0 },
  ].filter(Boolean)) as { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }>; count: number }[]

  const notifications: PortalNotificationItem[] = [
    ...shares
      .filter((s) => s.status === 'slaughtered' && s.video_url)
      .map((s) => ({
        id: `kurban-video-${s.id}`,
        title: 'Kurban kesim videonuz hazır',
        body: `${s.on_behalf_of || s.donor_name} adına kesim videonuz izlemeye açıldı.`,
        tone: 'emerald' as const,
        tab: 'projelerim',
      })),
    ...myWells
      .filter((w) => w.status === 'completed' || w.status === 'drilling')
      .map((w) => ({
        id: `well-${w.id}-${w.status}`,
        title: w.status === 'completed' ? 'Su kuyunuz tamamlandı' : 'Su kuyusunda kazı sürüyor',
        body: `${w.name} (${WELL_STATUS[w.status] || w.status})`,
        tone: 'sky' as const,
        tab: 'su-kuyularim',
      })),
    ...dueInstallments.map((p) => ({
      id: `pledge-${p.next_installment?.id}`,
      title: p.next_installment?.status === 'overdue' ? 'Gecikmiş sponsorluk taksiti' : 'Yaklaşan sponsorluk taksiti',
      body: `${p.beneficiary?.first_name || p.title || p.kind_label} · ${cents(p.next_installment!.amount_cents, p.currency)}`,
      tone: 'amber' as const,
      tab: 'ustlendiklerim',
    })),
    ...openDues.map((m) => ({
      id: `dues-${m.membership.member_no}-${m.open.length}`,
      title: 'Açık üyelik aidatı',
      body: `Üye no ${m.membership.member_no} · ${m.open.length} dönem`,
      tone: 'amber' as const,
      tab: 'uyelik',
    })),
    ...awaitingTransfers.map((o) => ({
      id: `transfer-${o.id}`,
      title: 'Havale / EFT bekleniyor',
      body: `${cents(o.total_cents, o.currency)}${o.transfer_reference ? ` · Kod: ${o.transfer_reference}` : ''}`,
      tone: 'amber' as const,
      tab: 'odemeler',
    })),
    ...requests
      .filter((r) => r.is_read)
      .slice(0, 3)
      .map((r) => ({
        id: `req-${r.id}`,
        title: 'Destek talebiniz incelendi',
        body: r.message.slice(0, 90),
        tone: 'emerald' as const,
        tab: 'taleplerim',
      })),
  ]
  const unreadNotifCount = notifications.filter((n) => !readNotifIds.includes(n.id)).length
  const markAllNotificationsRead = () => {
    const allIds = Array.from(new Set([...readNotifIds, ...notifications.map((n) => n.id)]))
    setReadNotifIds(allIds)
    try { localStorage.setItem('einfak-portal-read-notifs', JSON.stringify(allIds)) } catch { /* ignore */ }
  }

  /* ---------- sections ---------- */

  const donationRow = (d: Donation) => {
    const [label, tone] = DONATION_STATUS[d.status] || [d.status, 'bg-slate-100 text-slate-600']
    const repeatHref = d.campaign_slug
      ? `/bagis/${encodeURIComponent(d.campaign_slug)}?tutar=${Math.max(1, Math.round(d.amount_lira))}`
      : '/kampanyalar'
    return (
      <div key={d.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-900">#{d.receipt_number}</span>
            {d.campaign_title && <span className="text-xs font-semibold text-primary-700">{d.campaign_title}</span>}
            <Badge tone={tone}>{label}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {date(d.created_at)} · {METHOD_LABELS[d.payment_method] || d.payment_method}{d.donor_message ? ` · ${d.donor_message}` : ''}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <span className="text-lg font-black text-slate-900">{money(d.amount_lira, d.currency)}</span>
          {d.status === 'confirmed' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => printReceipt(d)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                Makbuz
              </button>
              <a
                href={`${apiBase()}/api/v1/public/receipts/${encodeURIComponent(d.receipt_number)}/pdf${d.verify_code ? `?k=${encodeURIComponent(d.verify_code)}` : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
              >
                PDF
              </a>
              <button
                type="button"
                onClick={() => {
                  setCertDonation(d)
                  setCertHonoree('')
                  setCertDedication('adina')
                }}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
              >
                Sertifika
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${siteName} üzerinden ${money(d.amount_lira, d.currency)} bağış makbuzum (#${d.receipt_number}): ${typeof window !== 'undefined' ? window.location.origin : ''}/verify/receipt/${encodeURIComponent(d.receipt_number)}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-100"
              >
                WhatsApp
              </a>
              <Link
                href={repeatHref}
                className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-100"
              >
                Tekrar Bağış
              </Link>
            </div>
          )}
        </div>
      </div>
    )
  }

  const installmentAction = (p: MyPledge) => p.status === 'active' && p.next_installment && (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl p-3 text-sm ${p.next_installment.status === 'overdue' ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700'}`}>
      <span>
        <b>{p.beneficiary?.first_name || p.title || p.kind_label}</b> · {p.next_installment.status === 'overdue' ? 'gecikmiş taksit' : 'sıradaki taksit'}:{' '}
        <b>{cents(p.next_installment.amount_cents, p.currency)}</b> · {date(p.next_installment.due_date)}
      </span>
      <PayButtons busy={payingId === p.next_installment.id} onPay={(method) => payInstallment(p.next_installment!.id, method)} />
    </div>
  )

  const duesAction = ({ membership, open }: { membership: MyMembership; open: MemberDue[] }) => (
    <div key={membership.member_no} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl p-3 text-sm ${open.some((d) => d.overdue) ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700'}`}>
      <span>
        Üyelik aidatı (üye no {membership.member_no}): <b>{cents(open.reduce((sum, d) => sum + d.amount_cents, 0))}</b> · {open.length} dönem
      </span>
      <PayButtons busy={payingId === open[0].id} onPay={(method) => payDues(open.map((d) => d.id), method)} />
    </div>
  )

  const overview = (
    <div className="space-y-6">
      <Panel title="Bekleyen işlemleriniz">
        {pendingCount === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-800">
            <span aria-hidden="true">✓</span> Bekleyen ödemeniz veya işleminiz yok.
          </div>
        ) : (
          <div className="space-y-2.5">
            {dueInstallments.map((p) => <div key={p.id}>{installmentAction(p)}</div>)}
            {openDues.map(duesAction)}
            {awaitingTransfers.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                <span>Havalesi beklenen ödeme: <b>{cents(o.total_cents, o.currency)}</b></span>
                {o.transfer_reference && <span>Açıklama kodu: <b className="select-all font-mono">{o.transfer_reference}</b></span>}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Son bağışlarım" action={donations.length > 3 && (
        <button type="button" onClick={() => setTab('bagislar')} className="text-sm font-bold text-primary-700 hover:underline">Tümünü gör →</button>
      )}>
        {donations.length === 0
          ? <Empty icon="🤲" cta={donateLink}>Henüz bağış kaydınız bulunmuyor.</Empty>
          : <div className="divide-y divide-slate-100">{donations.slice(0, 3).map(donationRow)}</div>}
      </Panel>
    </div>
  )

  const projelerim = (
    <div className="space-y-6">
      <Panel title="Projelerim ve kurban hisselerim">
        {shares.length === 0 ? (
          <Empty icon="🕌" cta={donateLink}>Henüz proje veya kurban hissesi kaydınız bulunmuyor.</Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {shares.map((s) => {
              const stage = s.status === 'slaughtered' ? (s.video_url ? 2 : 1) : 0
              const kurbanSteps = ['Sırada', 'Kesildi', 'Video Hazır']
              const shareVideoUrl = s.video_url
                ? (s.video_url.startsWith('http') ? s.video_url : `${typeof window !== 'undefined' ? window.location.origin : ''}${s.video_url}`)
                : ''
              return (
                <div key={s.id} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900">{s.campaign_title || (s.animal_type === 'cow' ? 'Büyükbaş kurban hissesi' : 'Kurban hissesi')}</h4>
                      <p className="mt-0.5 text-xs text-slate-600">{s.on_behalf_of || s.donor_name} adına · {s.kurban_type || 'Kurban'}{s.country ? ` · ${s.country}` : ''}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">Küpe no: {s.animal_number}{s.share_number ? ` · Hisse ${s.share_number}` : ''}</p>
                    </div>
                    <Badge tone={s.status === 'slaughtered' ? 'bg-green-600 text-white' : 'bg-amber-100 text-amber-800'}>
                      {s.status === 'slaughtered' ? 'Kesildi' : 'Bekliyor'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 pt-1" aria-label="Kurban aşama takibi">
                    {kurbanSteps.map((stepLabel, idx) => (
                      <div key={stepLabel} className="space-y-1">
                        <div className={`h-1.5 rounded-full ${idx <= stage ? 'bg-primary-600' : 'bg-slate-200'}`} />
                        <p className={`text-[10px] font-bold ${idx <= stage ? 'text-primary-700' : 'text-slate-400'}`}>{stepLabel}</p>
                      </div>
                    ))}
                  </div>
                  {s.status === 'slaughtered' && s.video_url ? (
                    <div className="flex flex-wrap gap-2">
                      <a href={s.video_url} target="_blank" rel="noopener noreferrer"
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 p-3 text-sm font-bold text-white hover:bg-slate-800">
                        ▶ Kesim videosunu izle
                      </a>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`${siteName} — ${s.on_behalf_of || s.donor_name} adına kurban kesim videomuz: ${shareVideoUrl}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center rounded-lg border border-green-200 bg-green-50 px-3.5 py-2 text-xs font-bold text-green-700 hover:bg-green-100"
                      >
                        WhatsApp
                      </a>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                      {s.status === 'slaughtered' ? 'Kesim videosu hazırlanıyor.' : 'Kurbanınız kesildiğinde adınıza özel video buraya eklenecek.'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      <Panel title="Bağış ve kampanya videolarım">
        {myVideos.length === 0 ? (
          <Empty icon="🎬">Bağışlarınıza veya desteklediğiniz kampanyalara eklenmiş video henüz bulunmuyor.</Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {myVideos.map((v) => {
              const fullUrl = v.url.startsWith('http')
                ? v.url
                : `${typeof window !== 'undefined' ? window.location.origin : ''}${v.url}`
              return (
                <div key={v.id} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{v.title}</h4>
                    {v.created_at && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {new Date(v.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
                    >
                      ▶ Videoyu izle
                    </a>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`${siteName} — ${v.title}: ${fullUrl}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center rounded-lg border border-green-200 bg-green-50 px-3.5 py-2 text-xs font-bold text-green-700 hover:bg-green-100"
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )

  const ustlendiklerim = (
    <div className="space-y-6">
      <Panel title="Üstlendiklerim ve sponsorluklarım">
        {pledges.length === 0 && projects.orphan_sponsorships.length === 0 && projects.student_sponsorships.length === 0 ? (
          <Empty icon="🤝" cta={donateLink}>Henüz aktif bir yetim, öğrenci veya aile sponsorluğunuz bulunmuyor.</Empty>
        ) : (
          <div className="space-y-4">
            {pledges.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                {pledges.map((p) => (
                  <div key={p.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
                    <div className="flex gap-3">
                      {p.beneficiary?.photo_url && <img src={p.beneficiary.photo_url} alt="" className="h-14 w-14 flex-shrink-0 rounded-xl object-cover" />}
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-900">{p.beneficiary?.first_name || p.title}</h4>
                        <p className="text-xs text-slate-500">
                          {p.kind_label}{p.beneficiary?.school ? ` · ${p.beneficiary.school}` : ''}{p.beneficiary?.country ? ` · ${p.beneficiary.country}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-slate-700">
                          {cents(p.installment_amount_cents, p.currency)} × {p.installment_count} · <b>{p.paid_count}/{p.installment_count}</b> taksit ödendi
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1" aria-label={`${p.paid_count} / ${p.installment_count} taksit ödendi`}>
                      {p.installments.map((i) => (
                        <span key={i.id} title={`${i.seq}. taksit · ${date(i.due_date)}`}
                          className={`h-2 min-w-4 flex-1 rounded-full ${i.status === 'paid' ? 'bg-green-500' : i.status === 'overdue' ? 'bg-red-500' : 'bg-slate-200'}`} />
                      ))}
                    </div>
                    {installmentAction(p)}
                  </div>
                ))}
              </div>
            )}

            {(projects.orphan_sponsorships.length > 0 || projects.student_sponsorships.length > 0) && (
              <div className="space-y-2.5">
                {[
                  ...projects.orphan_sponsorships.map((item) => ({ id: item.id, title: `Yetim desteği: ${item.person_name}`, detail: undefined, status: item.active ? 'Aktif' : 'Tamamlandı' })),
                  ...projects.student_sponsorships.map((item) => ({ id: item.id, title: `Öğrenci desteği: ${item.person_name}`, detail: cents(item.amount_cents), status: item.active ? 'Aktif' : 'Tamamlandı' })),
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{item.title}</p>
                      {item.detail && <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>}
                    </div>
                    <Badge tone="bg-emerald-50 text-emerald-700">{item.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  )

  const suKuyularim = (
    <Panel title="Su kuyularım">
      {myWells.length === 0 && extraWells.length === 0 ? (
        <Empty icon="💧" cta={donateLink}>Henüz su kuyusu katkınız bulunmuyor.</Empty>
      ) : (
        <div className="space-y-4">
          {myWells.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {myWells.map((w) => {
                const pct = w.target_cents > 0 ? Math.min(100, Math.round((w.collected_cents / w.target_cents) * 100)) : null
                const wellOrder = ['planned', 'funding', 'drilling', 'completed']
                const wellIdx = Math.max(0, wellOrder.indexOf(w.status))
                const wellLabels = ['Planlandı', 'Fon', 'Yapımda', 'Tamamlandı']
                return (
                  <div key={w.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {w.gallery_urls[0] && (
                      <a href={w.gallery_urls[0]} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={w.gallery_urls[0]} alt={w.name} className="h-44 w-full object-cover" />
                      </a>
                    )}
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-bold text-slate-900">{w.name}</h4>
                        <Badge tone={w.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-sky-100 text-sky-800'}>{WELL_STATUS[w.status] || w.status}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">{[w.location_name, w.country].filter(Boolean).join(', ')}</p>
                      <p className="text-xs font-semibold text-slate-700">{w.is_owner ? 'Kuyu sahibi' : w.my_shares ? `${w.my_shares} hisse` : 'Taksitli katkı'}</p>
                      <div className="grid grid-cols-4 gap-1.5" aria-label="Su kuyusu aşama takibi">
                        {wellLabels.map((lbl, idx) => (
                          <div key={lbl} className="space-y-1">
                            <div className={`h-1.5 rounded-full ${idx <= wellIdx ? 'bg-primary-600' : 'bg-slate-200'}`} />
                            <p className={`text-[10px] font-bold ${idx <= wellIdx ? 'text-primary-700' : 'text-slate-400'}`}>{lbl}</p>
                          </div>
                        ))}
                      </div>
                      {pct !== null && (
                        <div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-primary-600" style={{ width: `${pct}%` }} /></div>
                          <p className="mt-1 text-[11px] text-slate-500">Fonlama: %{pct}</p>
                        </div>
                      )}
                      {w.gallery_urls.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pt-1">
                          {w.gallery_urls.slice(1, 5).map((u, idx) => (
                            <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                              <img src={u} alt={`${w.name} fotoğraf ${idx + 2}`} className="h-14 w-14 rounded-lg border border-slate-200 object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {w.latitude != null && w.longitude != null && (
                          <a
                            href={`https://www.google.com/maps?q=${w.latitude},${w.longitude}&t=k`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-100"
                          >
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                            {L.mapSatellite}
                          </a>
                        )}
                        {w.gallery_urls[0] && (
                          <a href={w.gallery_urls[0]} target="_blank" rel="noopener noreferrer"
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                            Görselleri Aç ({w.gallery_urls.length})
                          </a>
                        )}
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(`${siteName} — "${w.name}" su kuyusu durumu: ${WELL_STATUS[w.status] || w.status}${w.gallery_urls[0] ? ` ${w.gallery_urls[0]}` : ''}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-100"
                        >
                          WhatsApp Paylaş
                        </a>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {extraWells.length > 0 && (
            <div className="space-y-2.5">
              {extraWells.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{item.name}</p>
                    {item.location && <p className="mt-0.5 text-xs text-slate-500">{item.location}</p>}
                  </div>
                  <Badge tone="bg-sky-50 text-sky-700">{WELL_STATUS[item.status] || item.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  )

  const kartlarim = (
    <Panel title="Kayıtlı kartlarım">
      {savedCards.length === 0 ? (
        <Empty icon="💳" cta={donateLink}>
          Kayıtlı kartınız bulunmuyor. Düzenli bağış talimatı sırasında kartınızı kaydettiğinizde burada görüntülenir.
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {savedCards.map((c) => (
            <div key={c.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">{c.card_brand || 'Kart'}</p>
                  <p className="mt-1 font-mono text-lg font-bold tracking-widest">•••• •••• •••• {c.card_last4}</p>
                </div>
                <Badge tone={c.status === 'active' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'}>
                  {c.status === 'active' ? 'Aktif' : 'Duraklatıldı'}
                </Badge>
              </div>
              <div className="flex items-end justify-between gap-2 border-t border-white/10 pt-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">{c.campaign_title}</p>
                  <p className="text-[11px] text-slate-300">{money(c.amount_lira, c.currency)} / dönem</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCardModalSub({ id: c.subscription_id, title: c.campaign_title })
                      setCardForm({ holder_name: displayName || '', card_number: '', expire_month: '', expire_year: '', cvv: '' })
                    }}
                    className="rounded-lg border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/25"
                  >
                    Kartı Güncelle
                  </button>
                  <button
                    type="button"
                    disabled={removingCardId === c.id}
                    onClick={() => removeSavedCard(c.id)}
                    className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-600/80 disabled:opacity-50"
                  >
                    {removingCardId === c.id ? 'Kaldırılıyor…' : 'Kaldır'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )

  const ayarlar = (
    <div className="space-y-6">
    <Panel title="Hesap ve iletişim ayarlarım">
      <form onSubmit={saveProfile} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="donor-first-name" className="mb-1 block text-xs font-bold text-slate-600">Ad</label>
            <input
              id="donor-first-name"
              type="text"
              required
              value={profileForm.first_name}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, first_name: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20"
            />
          </div>
          <div>
            <label htmlFor="donor-last-name" className="mb-1 block text-xs font-bold text-slate-600">Soyad</label>
            <input
              id="donor-last-name"
              type="text"
              value={profileForm.last_name}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, last_name: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20"
            />
          </div>
          <div>
            <label htmlFor="donor-tc-no" className="mb-1 block text-xs font-bold text-slate-600">TC Kimlik No (Makbuz için)</label>
            <input
              id="donor-tc-no"
              type="text"
              inputMode="numeric"
              maxLength={11}
              value={profileForm.tc_no}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, tc_no: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
              placeholder="11 haneli TCKN (isteğe bağlı)"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20"
            />
          </div>
          <div>
            <label htmlFor="donor-company" className="mb-1 block text-xs font-bold text-slate-600">Kurum / Firma Adı (Kurumsal bağış için)</label>
            <input
              id="donor-company"
              type="text"
              value={profileForm.company_name}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, company_name: e.target.value }))}
              placeholder="İsteğe bağlı"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20"
            />
          </div>
          <div>
            <label htmlFor="donor-tax-no" className="mb-1 block text-xs font-bold text-slate-600">Vergi Numarası</label>
            <input
              id="donor-tax-no"
              type="text"
              inputMode="numeric"
              maxLength={20}
              value={profileForm.tax_number}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, tax_number: e.target.value.replace(/\D/g, '').slice(0, 20) }))}
              placeholder="İsteğe bağlı"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20"
            />
          </div>
          <div>
            <label htmlFor="donor-phone" className="mb-1 block text-xs font-bold text-slate-600">Telefon (Giriş Numarası)</label>
            <input
              id="donor-phone"
              type="text"
              readOnly
              disabled
              value={profile?.phone || phone}
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500"
            />
          </div>
          <div>
            <label htmlFor="donor-email" className="mb-1 block text-xs font-bold text-slate-600">E-posta</label>
            <input
              id="donor-email"
              type="email"
              value={profileForm.email}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="ornek@eposta.com"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20"
            />
          </div>
          <div>
            <label htmlFor="donor-city" className="mb-1 block text-xs font-bold text-slate-600">Şehir</label>
            <input
              id="donor-city"
              type="text"
              value={profileForm.city}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, city: e.target.value }))}
              placeholder="İstanbul"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20"
            />
          </div>
          <div>
            <label htmlFor="donor-address" className="mb-1 block text-xs font-bold text-slate-600">Adres</label>
            <input
              id="donor-address"
              type="text"
              value={profileForm.address}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, address: e.target.value }))}
              placeholder="Açık adresiniz"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20"
            />
          </div>
        </div>

        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">İletişim ve Gizlilik Tercihleri</p>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={profileForm.allow_sms}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, allow_sms: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
            />
            Kampanya ve bilgilendirme SMS&apos;leri almak istiyorum
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={profileForm.allow_email}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, allow_email: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
            />
            Faaliyet raporu ve e-posta bültenlerini almak istiyorum
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={profileForm.is_anonymous}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, is_anonymous: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
            />
            Varsayılan olarak bağışlarımda ismim gizli (Anonim) kalsın
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingProfile}
            className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
          >
            {savingProfile ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}
          </button>
        </div>
      </form>
    </Panel>
    <BillingProfilesCard donorId={profile?.id || ''} />
    <PwaAndPushCard />
    </div>
  )

  const membership = (
    <Panel title="Üyeliğim ve aidatlarım">
      <div className="space-y-4">
        {memberships.map((m) => {
          const open = m.dues.filter((d) => d.status === 'open')
          return (
            <div key={m.member_no} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">Üye no {m.member_no} · {m.member_type_label}</span>
                <span className="text-xs text-slate-500">{m.status_label}{m.joined_on ? ` · ${new Date(m.joined_on).getFullYear()} yılından beri` : ''}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.dues.map((d) => (
                  <Badge key={d.id} tone={d.status === 'paid' ? 'bg-green-100 text-green-700' : d.overdue ? 'bg-red-100 text-red-700' : d.status === 'open' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}>
                    {d.period} · {cents(d.amount_cents)} · {d.overdue ? 'gecikmiş' : d.status_label}
                  </Badge>
                ))}
              </div>
              {open.length > 0 && duesAction({ membership: m, open })}
            </div>
          )
        })}
      </div>
    </Panel>
  )

  const recurring = (
    <div className="space-y-6">
      <Panel title="Düzenli bağış talimatlarım">
        {subscriptions.length === 0 ? (
          <Empty icon="🔁" cta={donateLink}>Aktif bir düzenli bağış talimatınız yok.</Empty>
        ) : (
          <div className="divide-y divide-slate-100">
            {subscriptions.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-900">
                      {s.campaign_title || 'Genel Bağış'} · {money(s.amount_lira, s.currency)} / {s.frequency === 'weekly' ? 'hafta' : 'ay'}
                    </p>
                    <Badge
                      tone={
                        s.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : s.status === 'paused'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-600'
                      }
                    >
                      {s.status === 'active' ? 'Aktif' : s.status === 'paused' ? 'Duraklatıldı' : 'İptal'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {s.mode === 'card'
                      ? `Otomatik kart çekimi${s.card_last4 ? ` (•••• ${s.card_last4})` : ''}`
                      : `Aylık SMS hatırlatma${s.day_of_month ? ` (Ayın ${s.day_of_month}. günü)` : ''}`}
                    {s.next_charge_date && s.status === 'active' ? ` · Sonraki tarih: ${date(s.next_charge_date)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {s.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => {
                        setCardModalSub({ id: s.id, title: s.campaign_title || 'Düzenli Bağış' })
                        setCardForm({ holder_name: displayName || '', card_number: '', expire_month: '', expire_year: '', cvv: '' })
                      }}
                      className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-100"
                    >
                      {s.card_last4 ? 'Kartı Güncelle' : 'Kart Ekle'}
                    </button>
                  )}
                  {s.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => updateSubscriptionAction(s.id, 'pause')}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                    >
                      Duraklat
                    </button>
                  )}
                  {s.status === 'paused' && (
                    <button
                      type="button"
                      onClick={() => updateSubscriptionAction(s.id, 'resume')}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                    >
                      Devam ettir
                    </button>
                  )}
                  {s.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => cancelSubscription(s.id)}
                      className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100"
                    >
                      İptal et
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Yeni aylık bağış hatırlatması oluştur">
        <form onSubmit={createReminderSubscription} className="grid gap-3 sm:grid-cols-3 items-end">
          <label className="block space-y-1 text-xs font-semibold text-slate-700">
            <span>Aylık Tutar (TL)</span>
            <input
              type="number"
              min={10}
              step={10}
              value={newReminderAmount}
              onChange={(e) => setNewReminderAmount(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="block space-y-1 text-xs font-semibold text-slate-700">
            <span>Hatırlatma Günü (1–28)</span>
            <select
              value={newReminderDay}
              onChange={(e) => setNewReminderDay(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Her ayın {d}. günü
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={creatingReminder}
            className="rounded-xl bg-primary-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {creatingReminder ? 'Kaydediliyor…' : 'Hatırlatma Talimatı Ekle'}
          </button>
        </form>
      </Panel>
    </div>
  )

  const orders = (
    <Panel title="Ödeme ve havale durumu">
      <div className="divide-y divide-slate-100">
        {paymentOrders.map((o) => {
          const [label, tone] = ORDER_STATUS[o.status] || [o.status.replaceAll('_', ' '), 'bg-slate-100 text-slate-600']
          return (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">{cents(o.total_cents, o.currency)}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {date(o.created_at)} · {METHOD_LABELS[o.payment_method] || o.payment_method}
                  {o.transfer_reference ? <> · Açıklama kodu: <b className="select-all font-mono">{o.transfer_reference}</b></> : null}
                </p>
                {o.refunded_cents > 0 && <p className="mt-0.5 text-xs text-red-600">İade: {cents(o.refunded_cents, o.currency)}</p>}
              </div>
              <Badge tone={tone}>{label}</Badge>
            </div>
          )
        })}
      </div>
    </Panel>
  )

  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null)
  const downloadPortalExport = async (fmt: 'xlsx' | 'pdf') => {
    const headers = ['Makbuz No', 'Tarih', 'Tutar', 'Para Birimi', 'Ödeme Yöntemi', 'Durum', 'Not']
    const rows = donations.map((d) => [
      d.receipt_number,
      date(d.created_at),
      d.amount_lira,
      d.currency,
      METHOD_LABELS[d.payment_method] || d.payment_method,
      (DONATION_STATUS[d.status] || [d.status])[0],
      d.donor_message || '',
    ])
    setExporting(fmt)
    try {
      const res = await axios.post(
        `${apiBase()}/api/v1/portal/me/export/${fmt}`,
        {
          filename: 'bagislarim',
          title: 'Bağış Geçmişim',
          subtitle: displayName ? `${displayName} · ${donations.length} bağış` : `${donations.length} bağış`,
          headers,
          rows,
          currency_cols: [2],
        },
        { headers: authHeaders(token || ''), responseType: 'blob' },
      )
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `bagislarim.${fmt}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      exportCsv('bagislarim.csv', headers, rows)
    } finally {
      setExporting(null)
    }
  }

  const donationList = (
    <Panel
      title="Bağış geçmişim"
      action={donations.length > 0 && (
        <div className="inline-flex flex-wrap items-center gap-1.5 print:hidden">
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => downloadPortalExport('xlsx')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#1D6F42]/30 bg-[#1D6F42]/10 px-3 py-1.5 text-xs font-bold text-[#1D6F42] transition-colors hover:bg-[#1D6F42]/15 disabled:opacity-50"
          >
            <ExcelIcon className="h-3.5 w-3.5" />
            {exporting === 'xlsx' ? 'Hazırlanıyor…' : 'Excel'}
          </button>
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => downloadPortalExport('pdf')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D32F2F]/30 bg-[#D32F2F]/10 px-3 py-1.5 text-xs font-bold text-[#D32F2F] transition-colors hover:bg-[#D32F2F]/15 disabled:opacity-50"
          >
            <PdfIcon className="h-3.5 w-3.5" />
            {exporting === 'pdf' ? 'Hazırlanıyor…' : 'PDF'}
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await axios.get(`${apiBase()}/api/v1/portal/impact-report.pdf`, {
                  headers: authHeaders(token || ''),
                  responseType: 'blob',
                })
                const url = URL.createObjectURL(new Blob([res.data]))
                const a = document.createElement('a')
                a.href = url
                a.download = 'iyilik-karnem.pdf'
                a.click()
                URL.revokeObjectURL(url)
              } catch { /* ignore */ }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-600/15"
          >
            İyilik Karnesi
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Yazdır
          </button>
        </div>
      )}
    >
      {confirmed.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200/80 bg-slate-50 p-3.5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{currentYear} Yılı Toplam</p>
            <p className="mt-0.5 text-lg font-black text-primary-700">{thisYearText}</p>
            <p className="text-[11px] text-slate-500">{thisYearCount} onaylı bağış</p>
          </div>
          <div className="border-s border-slate-200 ps-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{currentYear - 1} Yılı Toplam</p>
            <p className="mt-0.5 text-lg font-black text-slate-800">{lastYearText}</p>
            <p className="text-[11px] text-slate-500">{lastYearCount} onaylı bağış</p>
          </div>
        </div>
      )}
      {donations.length === 0
        ? <Empty icon="🤲" cta={donateLink}>Henüz bağış kaydınız bulunmuyor.</Empty>
        : <div className="divide-y divide-slate-100">{donations.map(donationRow)}</div>}
    </Panel>
  )

  const zekatSection = (
    <ZekatAndCalendarSection
      donorId={profile?.id || ''}
      confirmedDonations={confirmed}
      onCreateWeeklyReminder={async (amount, frequency, label) => {
        if (!token) return
        setErrorMsg('')
        try {
          const res = await axios.post(
            `${apiBase()}/api/v1/portal/subscriptions`,
            { amount_cents: Math.round(amount * 100), currency: 'TRY', frequency, day_of_month: 1 },
            { headers: authHeaders(token) },
          )
          setSubscriptions((current) => [res.data, ...current])
          setSuccessMsg(`${label} için SMS hatırlatma talimatınız oluşturuldu.`)
        } catch (err) {
          if (!expired(err)) setErrorMsg(errorText(err, 'Talimat oluşturulamadı.'))
        }
      }}
    />
  )

  const taleplerimSection = (
    <DonorRequestsSection
      apiBaseUrl={apiBase()}
      authHeader={authHeaders(token)}
      requests={requests}
      onCreated={(item) => setRequests((prev) => [item, ...prev])}
    />
  )

  const tabContent: Record<TabKey, React.ReactNode> = {
    ozet: overview,
    bagislar: donationList,
    ustlendiklerim,
    'su-kuyularim': suKuyularim,
    projelerim,
    talimatlarim: recurring,
    kartlarim,
    zekat: zekatSection,
    taleplerim: taleplerimSection,
    ayarlar,
    uyelik: membership,
    odemeler: orders,
  }
  const activeTab = tabs.some((t) => t.key === tab) ? tab : 'ozet'
  const activeTabMeta = tabs.find((t) => t.key === activeTab) || tabs[0]

  /* ---------- render ---------- */

  const messages = (
    <>
      {errorMsg && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-700">{errorMsg}</div>}
      {successMsg && <div role="status" className="mb-5 rounded-xl border border-green-200 bg-green-50 p-3.5 text-sm font-semibold text-green-700">{successMsg}</div>}
    </>
  )

  const langSwitcher = (dark = false) => (
    <div className={`inline-flex items-center rounded-lg p-0.5 text-[11px] font-bold ${dark ? 'bg-white/10 text-white' : 'border border-slate-200 bg-white text-slate-600'}`} role="group" aria-label="Dil seçimi">
      {PORTAL_LANGS.map((opt) => (
        <button
          key={opt.code}
          type="button"
          onClick={() => changeLang(opt.code)}
          className={`rounded-md px-2 py-1 transition ${
            lang === opt.code
              ? dark
                ? 'bg-white text-primary-800'
                : 'bg-primary-700 text-white'
              : dark
                ? 'text-white/80 hover:text-white'
                : 'hover:text-primary-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )

  if (step !== 'dashboard') {
    return (
      <div dir={isRtl ? 'rtl' : 'ltr'} className="bg-slate-50 px-4 py-12 text-slate-800 antialiased sm:py-16">
        <div className="mx-auto max-w-md">
          <div className="mb-4 flex justify-end">{langSwitcher(false)}</div>
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-2xl text-white shadow-lg" aria-hidden="true">
              🤲
            </div>
            <h1 className="font-heading text-2xl font-bold text-slate-900 sm:text-3xl">{L.panelTitle}</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
              {L.login.subtitle}
            </p>
          </div>

          {messages}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">

            <div className="p-6">
              {step === 'login' ? (
                <form onSubmit={(event) => { event.preventDefault(); sendOtp() }} className="space-y-4">
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => { setLoginChannel('sms'); setErrorMsg('') }}
                      className={`rounded-lg py-2 transition ${loginChannel === 'sms' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      SMS ile Giriş
                    </button>
                    <button
                      type="button"
                      onClick={() => { setLoginChannel('email'); setErrorMsg('') }}
                      className={`rounded-lg py-2 transition ${loginChannel === 'email' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      E-posta ile Giriş
                    </button>
                  </div>

                  {loginChannel === 'sms' ? (
                    <div>
                      <label htmlFor="portal-phone" className="mb-1.5 block text-sm font-semibold text-slate-700">Telefon numaranız</label>
                      <input id="portal-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0555 444 33 22" value={phone}
                        onChange={(event) => setPhone(event.target.value)} required
                        className="w-full rounded-xl border border-slate-300 p-3.5 text-base outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20" />
                      <p className="mt-1.5 text-xs text-slate-500">
                        Bağış yaparken kullandığınız numarayı girin. Size SMS ile tek kullanımlık kod göndereceğiz.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="portal-email" className="mb-1.5 block text-sm font-semibold text-slate-700">E-posta adresiniz</label>
                      <input id="portal-email" type="email" autoComplete="email" placeholder="ornek@eposta.com" value={loginEmail}
                        onChange={(event) => setLoginEmail(event.target.value)} required
                        className="w-full rounded-xl border border-slate-300 p-3.5 text-base outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20" />
                      <p className="mt-1.5 text-xs text-slate-500">
                        Yurt dışındaysanız veya SMS alamıyorsanız e-posta adresinize 6 haneli doğrulama kodu gönderebiliriz.
                      </p>
                    </div>
                  )}

                  <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                    />
                    Bu cihazda oturumumu açık tut
                  </label>

                  <button type="submit" disabled={loading}
                    className="w-full rounded-xl bg-primary-600 py-3.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary-700 disabled:opacity-60">
                    {loading ? 'Gönderiliyor…' : 'Giriş kodu gönder'}
                  </button>
                </form>
              ) : (
                <form onSubmit={verifyOtp} className="space-y-4">
                  <div>
                    <label htmlFor="portal-otp" className="mb-1.5 block text-sm font-semibold text-slate-700">
                      {loginChannel === 'email' ? 'E-posta doğrulama kodu' : 'SMS doğrulama kodu'}
                    </label>
                    <input id="portal-otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} autoFocus
                      placeholder="••••••" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ''))} required
                      className="w-full rounded-xl border border-slate-300 p-3.5 text-center text-2xl font-bold tracking-[0.5em] outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20" />
                    <p className="mt-1.5 text-xs text-slate-500">
                      <b>{loginChannel === 'email' ? loginEmail : phone}</b> adresine 6 haneli kod gönderildi.
                    </p>
                  </div>
                  <button type="submit" disabled={loading || otpCode.length < 6}
                    className="w-full rounded-xl bg-primary-600 py-3.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary-700 disabled:opacity-60">
                    {loading ? 'Doğrulanıyor…' : 'Giriş yap'}
                  </button>
                  <div className="flex items-center justify-between text-sm">
                    <button type="button" onClick={() => { setStep('login'); setErrorMsg('') }} className="font-semibold text-slate-500 hover:text-slate-800">
                      ← {loginChannel === 'email' ? 'E-postayı değiştir' : 'Numarayı değiştir'}
                    </button>
                    <button type="button" disabled={resendIn > 0 || loading} onClick={sendOtp}
                      className="font-semibold text-primary-700 hover:underline disabled:text-slate-400 disabled:no-underline">
                      {resendIn > 0 ? `Tekrar gönder (${resendIn} sn)` : 'Kodu tekrar gönder'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const selectTab = (key: TabKey) => {
    setTab(key)
    setMobileMenuOpen(false)
    setSiteNavOpen(false)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const mobileBottomBar = (
    <nav
      aria-label="Hızlı gezinme"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.12)] lg:hidden"
    >
      <div className="grid grid-cols-5 items-end px-1 pt-2 pb-1.5 text-center">
        <Link href="/" className="flex flex-col items-center gap-1 py-1 text-[11px] font-medium text-primary-700">
          <Home className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
          <span>{L.nav.home}</span>
          <span className="h-1 w-1 rounded-full bg-primary-700" aria-hidden="true" />
        </Link>
        <Link href="/haberler" className="flex flex-col items-center gap-1 py-1 text-[11px] font-medium text-slate-500 hover:text-primary-700">
          <BookOpen className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
          <span>{L.nav.news}</span>
          <span className="h-1 w-1" aria-hidden="true" />
        </Link>
        <Link href="/kampanyalar" className="flex flex-col items-center gap-1 pb-1 text-[11px] font-semibold text-slate-600">
          <span className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-primary-700 text-white shadow-lg ring-[6px] ring-white transition active:scale-95">
            <Heart className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
          </span>
          <span>{L.nav.donate}</span>
        </Link>
        <Link href="/bagis/sepetim" className="relative flex flex-col items-center gap-1 py-1 text-[11px] font-medium text-slate-500 hover:text-primary-700">
          <ShoppingBag className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
          {cartItemCount > 0 && (
            <span className="absolute end-3 top-0 min-w-[16px] rounded-full bg-primary-700 px-1 text-center text-[10px] font-bold leading-4 text-white">
              {cartItemCount}
            </span>
          )}
          <span>{L.nav.cart}</span>
          <span className="h-1 w-1" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={() => {
            if (!mobileMenuOpen) {
              setMobileMenuOpen(true)
              setSiteNavOpen(false)
            } else {
              setSiteNavOpen((v) => !v)
            }
          }}
          className="flex flex-col items-center gap-1 py-1 text-[11px] font-medium text-slate-500 hover:text-primary-700"
        >
          <LayoutGrid className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
          <span>{L.nav.more}</span>
          <span className="h-1 w-1" aria-hidden="true" />
        </button>
      </div>
    </nav>
  )

  const brandedMenu = (
    <aside className="fixed inset-0 z-40 flex flex-col bg-primary-700 text-white lg:static lg:z-auto lg:block lg:overflow-hidden lg:rounded-3xl lg:shadow-xl">
      {/* Mobile seamless top bar */}
      <div className="flex flex-shrink-0 items-center justify-between px-5 pb-3 pt-4 lg:hidden">
        <button
          type="button"
          onClick={() => setSiteNavOpen((v) => !v)}
          aria-label="Site menüsü"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-white transition hover:bg-white/10"
        >
          {siteNavOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-7 w-7" strokeWidth={2.2} aria-hidden="true" />}
        </button>

        <Link href="/" className="flex min-w-0 items-center gap-2.5 px-2">
          {siteLogo && (
            <img src={siteLogo} alt="" className="h-10 w-10 flex-shrink-0 rounded-full object-contain" />
          )}
          <span className="flex min-w-0 flex-col leading-none">
            <span className="truncate font-heading text-xl font-black tracking-wide text-white">{siteName}</span>
            {siteTagline && (
              <span className="mt-0.5 truncate text-[8.5px] font-medium uppercase tracking-wider text-white/75">
                {siteTagline}
              </span>
            )}
          </span>
        </Link>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            aria-label={L.notifications}
            className="relative flex h-11 w-11 items-center justify-center rounded-xl text-white transition hover:bg-white/10"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {unreadNotifCount > 0 && (
              <span className="absolute end-2 top-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-extrabold text-slate-950">
                {unreadNotifCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSiteNavOpen(false)}
            aria-label="Bağışçı menüsü"
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-black/15 text-[#D8CA7A]"
          >
            <User className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Optional mobile quick site navigation drawer */}
      {siteNavOpen && (
        <div className="mx-5 mb-3 rounded-2xl border border-white/15 bg-black/20 p-2 lg:hidden">
          {[
            { href: '/', label: 'Anasayfa' },
            { href: '/kampanyalar', label: 'Kampanyalar' },
            { href: '/haberler', label: 'Haberler' },
            { href: '/hakkimizda', label: 'Hakkımızda' },
            { href: '/iletisim', label: 'İletişim' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSiteNavOpen(false)}
              className="block rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white/95 hover:bg-white/10"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}

      {/* Main scrollable body of branded menu */}
      <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-24 lg:block lg:overflow-visible lg:p-0">
        <div className="border-y border-white/15 py-5 lg:border-t-0 lg:px-6 lg:pb-5 lg:pt-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/75">{L.hello}</p>
            <div className="lg:hidden">{langSwitcher(true)}</div>
          </div>
          <h1 className="mt-1.5 truncate font-heading text-[28px] font-extrabold uppercase leading-tight tracking-wide text-white lg:text-2xl">
            {displayName || L.defaultDonor}
          </h1>
        </div>

        <nav className="flex flex-col gap-1.5 py-6 lg:gap-0.5 lg:px-3 lg:py-3" aria-label="Bağışçı paneli menüsü">
          {tabs.map((t) => {
            const Icon = t.icon
            const desktopSelected = activeTab === t.key
            const hideOnMobile = t.key === 'ozet' && pendingCount === 0
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => selectTab(t.key)}
                className={`${hideOnMobile ? 'hidden lg:flex' : 'flex'} w-full items-center justify-between gap-3 rounded-xl px-2 py-3 text-left text-[15px] font-semibold uppercase tracking-[0.05em] transition lg:px-3.5 lg:py-3 lg:text-sm ${
                  desktopSelected
                    ? 'text-white lg:bg-white/15'
                    : 'text-white/95 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex min-w-0 items-center gap-4 lg:gap-3.5">
                  <Icon className="h-6 w-6 flex-shrink-0 text-[#D8CA7A] lg:h-5 lg:w-5" aria-hidden="true" />
                  <span className="truncate">{t.label}</span>
                </span>
                {t.count > 0 && (
                  <span className="hidden rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold text-white lg:inline-flex">
                    {t.count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto pt-4 lg:mt-0 lg:border-t lg:border-white/15 lg:p-4">
          <button
            type="button"
            onClick={() => logout()}
            className="relative flex w-full items-center justify-center rounded-2xl bg-white/15 px-5 py-3.5 text-[15px] font-bold uppercase tracking-[0.08em] text-white transition hover:bg-white/25 lg:text-sm"
          >
            <LogOut className="absolute start-5 h-5 w-5" aria-hidden="true" />
            <span>{L.logout}</span>
          </button>
        </div>
      </div>
    </aside>
  )

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className={`bg-slate-50 text-slate-800 antialiased ${mobileMenuOpen ? 'lg:px-4 lg:py-10' : 'px-4 pb-24 pt-5 lg:py-10'}`}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 hidden flex-wrap items-center justify-between gap-3 lg:flex">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
            {L.panelTitle}
          </span>
          <div className="flex items-center gap-2.5">
            {langSwitcher(false)}
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              aria-label={L.notifications}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-primary-500 hover:text-primary-700"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {unreadNotifCount > 0 && (
                <span className="absolute -end-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-extrabold text-white">
                  {unreadNotifCount}
                </span>
              )}
            </button>
            <Link href="/kampanyalar" className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700">
              ♥ {L.donateNow}
            </Link>
          </div>
        </div>

        <div className={mobileMenuOpen ? 'hidden lg:block' : 'block'}>
          {messages}

          {needsProfileCompletion && (
            <form onSubmit={saveProfile} className="mb-6 rounded-2xl border border-primary-200 bg-primary-50/70 p-4 sm:p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-primary-900">Hoş geldiniz! Profilinizi tamamlayın</h3>
                  <p className="mt-0.5 text-xs text-primary-800">Makbuz ve hayır sertifikalarınızda adınızın doğru görünmesi için bilgilerinizi girin.</p>
                </div>
                <button type="button" onClick={() => setOnboardingDismissed(true)} aria-label="Kapat" className="text-lg leading-none text-primary-700 hover:text-primary-900">×</button>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-4">
                <input
                  type="text"
                  required
                  placeholder="Adınız"
                  value={profileForm.first_name === 'Değerli' ? '' : profileForm.first_name}
                  onChange={(e) => setProfileForm((p) => ({ ...p, first_name: e.target.value }))}
                  className="rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-600"
                />
                <input
                  type="text"
                  placeholder="Soyadınız"
                  value={profileForm.last_name === 'Bağışçı' ? '' : profileForm.last_name}
                  onChange={(e) => setProfileForm((p) => ({ ...p, last_name: e.target.value }))}
                  className="rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-600"
                />
                <input
                  type="email"
                  placeholder="E-posta (isteğe bağlı)"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                  className="rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-600"
                />
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-primary-800 disabled:opacity-60"
                >
                  {savingProfile ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </form>
          )}

          {transferInfo && (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-amber-900">Havale / EFT bilgileri</h3>
                  <p className="mt-0.5 text-xs text-amber-800">Ödemenizin eşleşmesi için açıklama kodunu havale açıklamasına mutlaka yazın.</p>
                </div>
                <button type="button" onClick={() => setTransferInfo(null)} aria-label="Kapat" className="text-lg leading-none text-amber-700 hover:text-amber-900">×</button>
              </div>
              <div className="space-y-2">
                {transferInfo.bank_name && <CopyRow label="Banka" value={transferInfo.bank_name} />}
                {transferInfo.iban && <CopyRow label="IBAN" value={transferInfo.iban} />}
                {transferInfo.transfer_reference && <CopyRow label="Açıklama kodu" value={transferInfo.transfer_reference} />}
              </div>
            </div>
          )}
        </div>

        {dataLoading ? (
          <div className="space-y-4 px-4 py-6 lg:p-0" aria-busy="true" aria-label="Yükleniyor">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />)}
            </div>
            <div className="h-64 animate-pulse rounded-2xl bg-slate-200/70" />
          </div>
        ) : (
          <div className="animate-fade-in lg:grid lg:grid-cols-[300px_1fr] lg:items-start lg:gap-6">
            <div className={mobileMenuOpen ? 'block' : 'hidden lg:block'}>
              {brandedMenu}
            </div>

            <div className={`space-y-5 lg:space-y-6 ${mobileMenuOpen ? 'hidden lg:block' : 'block'}`}>
              {!mobileMenuOpen && activeTabMeta && (
                <div className="flex items-center justify-between rounded-2xl bg-primary-700 px-4 py-3 text-white shadow-sm lg:hidden">
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(true)}
                    className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-bold text-white"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Menü
                  </button>
                  <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
                    <activeTabMeta.icon className="h-4 w-4 text-[#D8CA7A]" aria-hidden="true" />
                    {activeTabMeta.label}
                  </span>
                  <span className="w-12" aria-hidden="true" />
                </div>
              )}

              {activeTab === 'ozet' && (
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                  <Stat label="Toplam destek" value={totalText} hint={`${confirmed.length} onaylı bağış`} accent />
                  <Stat label="Kurban & proje" value={String(shares.length)} hint={shares.length ? `${shares.filter((s) => s.status === 'slaughtered').length} kesildi` : undefined} />
                  <Stat label="Üstlendiklerim" value={String(sponsorshipCount + wellsCount)} />
                  <Stat label="Talimatlarım" value={String(subscriptions.length)} hint={subscriptions.length ? 'aktif talimat' : undefined} />
                </div>
              )}

              <div role="tabpanel">{tabContent[activeTab]}</div>
            </div>
          </div>
        )}
      </div>

      {mobileBottomBar}

      <NotificationModal
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        items={notifications}
        readIds={readNotifIds}
        onMarkAllRead={markAllNotificationsRead}
        onOpenTab={(t) => selectTab(t as TabKey)}
        labels={{ title: L.notifications, markAllRead: L.markAllRead, empty: L.noNotifications }}
      />

      {/* Personalized Charity Certificate Modal */}
      {certDonation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-lg font-bold text-slate-900">Hayır / Hediye Sertifikası</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  #{certDonation.receipt_number} · {money(certDonation.amount_lira, certDonation.currency)}
                </p>
              </div>
              <button type="button" onClick={() => setCertDonation(null)} aria-label="Kapat" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={downloadPersonalizedCertificate} className="space-y-4">
              <div>
                <label htmlFor="cert-honoree" className="mb-1 block text-xs font-bold text-slate-700">Kimin adına / hatırasına? (İsteğe bağlı)</label>
                <input
                  id="cert-honoree"
                  type="text"
                  maxLength={55}
                  placeholder="Örn. Merhum Babam Ahmet Bey"
                  value={certHonoree}
                  onChange={(e) => setCertHonoree(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20"
                />
              </div>
              {certHonoree.trim() && (
                <div className="grid grid-cols-3 gap-2 text-xs font-bold">
                  {([
                    ['adina', 'Adına'],
                    ['ruhuna', 'Ruhuna'],
                    ['hediye', 'Hediye'],
                  ] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setCertDedication(val)}
                      className={`rounded-xl border py-2 transition ${
                        certDedication === val
                          ? 'border-primary-600 bg-primary-50 text-primary-800'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCertDonation(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
                  Vazgeç
                </button>
                <button type="submit" disabled={certDownloading} className="rounded-xl bg-primary-700 px-5 py-2 text-sm font-bold text-white hover:bg-primary-800 disabled:opacity-60">
                  {certDownloading ? 'Hazırlanıyor…' : 'PDF Sertifika İndir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Save / Update Card Modal */}
      {cardModalSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-lg font-bold text-slate-900">Kart Bilgilerini Güncelle</h3>
                <p className="mt-0.5 text-xs text-slate-500">{cardModalSub.title} talimatı için güvenli kart kaydı</p>
              </div>
              <button type="button" onClick={() => setCardModalSub(null)} aria-label="Kapat" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={saveUpdatedCard} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Kart Üzerindeki İsim</label>
                <input
                  type="text"
                  required
                  value={cardForm.holder_name}
                  onChange={(e) => setCardForm((f) => ({ ...f, holder_name: e.target.value }))}
                  placeholder="AD SOYAD"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Kart Numarası</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={19}
                  value={cardForm.card_number}
                  onChange={(e) => setCardForm((f) => ({ ...f, card_number: e.target.value.replace(/[^\d\s]/g, '') }))}
                  placeholder="0000 0000 0000 0000"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-sm outline-none focus:border-primary-600"
                />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Ay (AA)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={2}
                    placeholder="08"
                    value={cardForm.expire_month}
                    onChange={(e) => setCardForm((f) => ({ ...f, expire_month: e.target.value.replace(/\D/g, '') }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-center text-sm outline-none focus:border-primary-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Yıl (YY)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={4}
                    placeholder="28"
                    value={cardForm.expire_year}
                    onChange={(e) => setCardForm((f) => ({ ...f, expire_year: e.target.value.replace(/\D/g, '') }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-center text-sm outline-none focus:border-primary-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">CVV</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    required
                    maxLength={4}
                    placeholder="•••"
                    value={cardForm.cvv}
                    onChange={(e) => setCardForm((f) => ({ ...f, cvv: e.target.value.replace(/\D/g, '') }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-center text-sm outline-none focus:border-primary-600"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">Kart bilgileriniz doğrudan bankanın güvenli saklama altyapısında tutulur.</p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCardModalSub(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
                  Vazgeç
                </button>
                <button type="submit" disabled={savingCard} className="rounded-xl bg-primary-700 px-5 py-2 text-sm font-bold text-white hover:bg-primary-800 disabled:opacity-60">
                  {savingCard ? 'Kaydediliyor…' : 'Kartı Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
