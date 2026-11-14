'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { Printer } from 'lucide-react'
import { exportCsv } from '../../lib/admin-access'
import { ExcelIcon, PdfIcon } from '../admin/ui'

interface Donation {
  id: string
  receipt_number: string
  amount_lira: number
  currency: string
  status: string
  payment_method: string
  donor_message: string | null
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
}

interface Subscription { id: string; amount_lira: number; currency: string; status: string; next_charge_date: string }

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

interface TransferInfo { bank_name?: string; iban?: string; transfer_reference?: string }

type PayMethod = 'credit_card' | 'bank_transfer'
type TabKey = 'ozet' | 'bagislar' | 'kurban' | 'destek' | 'uyelik' | 'duzenli' | 'odemeler'

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

const errorText = (err: unknown, fallback: string) => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

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

export function PortalClient({ siteName }: { siteName: string }) {
  const [step, setStep] = useState<'login' | 'otp' | 'dashboard'>('login')
  const [phone, setPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [resendIn, setResendIn] = useState(0)

  const [token, setToken] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [tab, setTab] = useState<TabKey>('ozet')

  const [donations, setDonations] = useState<Donation[]>([])
  const [shares, setShares] = useState<KurbanShare[]>([])
  const [pledges, setPledges] = useState<MyPledge[]>([])
  const [memberships, setMemberships] = useState<MyMembership[]>([])
  const [myWells, setMyWells] = useState<MyWell[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([])
  const [projects, setProjects] = useState<DonorProjects>(EMPTY_PROJECTS)

  const [payingId, setPayingId] = useState<string | null>(null)
  const [transferInfo, setTransferInfo] = useState<TransferInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)

  const logout = useCallback((message = '') => {
    try { sessionStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
    setToken(null)
    setStep('login')
    setOtpCode('')
    setTab('ozet')
    setDonations([]); setShares([]); setPledges([]); setMemberships([]); setMyWells([])
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

  const loadDashboard = useCallback(async (authToken: string) => {
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
      const [pledgesRes, wellsRes, duesRes] = await Promise.allSettled([get('pledges'), get('water-wells'), get('member-dues')])
      if (pledgesRes.status === 'fulfilled') setPledges(pledgesRes.value.data)
      if (wellsRes.status === 'fulfilled') setMyWells(wellsRes.value.data)
      if (duesRes.status === 'fulfilled') setMemberships(duesRes.value.data)
    } catch (err) {
      if (!expired(err)) setErrorMsg('Bilgileriniz yüklenemedi. Lütfen sayfayı yenileyin.')
    } finally {
      setDataLoading(false)
    }
  }, [expired])

  // A reload keeps the visitor signed in for this browser tab.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
      if (saved?.token && (!saved.role || saved.role === 'donor')) {
        setToken(saved.token)
        setDisplayName(typeof saved.name === 'string' ? saved.name : '')
        setStep('dashboard')
        loadDashboard(saved.token)
      }
    } catch {
      // storage unavailable: sign in again
    }
  }, [loadDashboard])

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  const authPath = (name: string) => `${apiBase()}/api/v1/portal/${name}`

  const sendOtp = async () => {
    if (!phone.trim()) return
    setErrorMsg('')
    setSuccessMsg('')
    setLoading(true)
    try {
      await axios.post(authPath('send-otp'), { phone })
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
      const res = await axios.post(authPath('verify-otp'), { phone, code: otpCode })
      const accessToken: string = res.data.access_token
      const person = res.data.donor || res.data.user
      const name = [person?.first_name, person?.last_name].filter(Boolean).join(' ')
      setToken(accessToken)
      setDisplayName(name)
      setStep('dashboard')
      setSuccessMsg('')
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: accessToken, role: 'donor', name })) } catch { /* ignore */ }
      loadDashboard(accessToken)
    } catch (err) {
      setErrorMsg(errorText(err, 'Kod geçersiz veya süresi dolmuş.'))
    } finally {
      setLoading(false)
    }
  }

  const pay = async (path: string, body: Record<string, unknown>, busyId: string, method: PayMethod) => {
    if (!token) return
    if (!window.confirm('Ödeme sayfasına yönlendirileceksiniz. KVKK aydınlatma metnini okuduğunuzu onaylıyor musunuz?')) return
    setPayingId(busyId)
    setErrorMsg('')
    setTransferInfo(null)
    try {
      const res = await axios.post(`${apiBase()}/api/v1/portal/me/${path}`,
        { ...body, payment_method: method, kvkk_accepted: true }, { headers: authHeaders(token) })
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

  const cancelSubscription = async (id: string) => {
    if (!window.confirm('Düzenli bağış talimatınızı iptal etmek istediğinize emin misiniz?')) return
    setErrorMsg('')
    try {
      await axios.delete(`${apiBase()}/api/v1/portal/subscriptions/${id}`, { headers: authHeaders(token) })
      setSubscriptions((current) => current.filter((s) => s.id !== id))
      setSuccessMsg('Düzenli bağış talimatınız iptal edildi.')
    } catch (err) {
      if (!expired(err)) setErrorMsg(errorText(err, 'Talimat iptal edilemedi.'))
    }
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
  const projectCount = projects.water_wells.length + projects.orphan_sponsorships.length + projects.student_sponsorships.length
  const dueInstallments = pledges.filter((p) => p.status === 'active' && p.next_installment)
  const openDues = memberships.map((m) => ({ membership: m, open: m.dues.filter((d) => d.status === 'open') })).filter((m) => m.open.length)
  const openDuesCount = openDues.reduce((sum, m) => sum + m.open.length, 0)
  const myWellIds = new Set(myWells.map((w) => w.id))
  const extraWells = projects.water_wells.filter((w) => !myWellIds.has(w.id))
  const extraProjectCount = extraWells.length + projects.orphan_sponsorships.length + projects.student_sponsorships.length
  const awaitingTransfers = paymentOrders.filter((o) => o.status === 'awaiting_transfer')
  const pendingCount = dueInstallments.length + openDues.length + awaitingTransfers.length

  const tabs = ([
    { key: 'ozet', label: 'Özet', count: pendingCount },
    { key: 'bagislar', label: 'Bağışlarım', count: donations.length },
    shares.length ? { key: 'kurban', label: 'Kurban', count: shares.length } : null,
    pledges.length + myWells.length + extraProjectCount ? { key: 'destek', label: 'Sponsorluk & Projeler', count: pledges.length + myWells.length + extraProjectCount } : null,
    memberships.length ? { key: 'uyelik', label: 'Üyelik & Aidat', count: openDuesCount } : null,
    { key: 'duzenli', label: 'Düzenli Bağış', count: subscriptions.length },
    paymentOrders.length ? { key: 'odemeler', label: 'Ödemeler', count: paymentOrders.length } : null,
  ].filter(Boolean)) as { key: TabKey; label: string; count: number }[]

  /* ---------- sections ---------- */

  const donationRow = (d: Donation) => {
    const [label, tone] = DONATION_STATUS[d.status] || [d.status, 'bg-slate-100 text-slate-600']
    return (
      <div key={d.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-900">#{d.receipt_number}</span>
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
                href={`${apiBase()}/api/v1/public/receipts/${encodeURIComponent(d.receipt_number)}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
              >
                PDF
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${siteName} üzerinden ${money(d.amount_lira, d.currency)} bağış makbuzum (#${d.receipt_number}): ${typeof window !== 'undefined' ? window.location.origin : ''}/verify/receipt/${encodeURIComponent(d.receipt_number)}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-100"
              >
                WhatsApp
              </a>
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

  const kurban = (
    <Panel title="Kurban kesim bilgisi ve video">
      <div className="grid gap-4 md:grid-cols-2">
        {shares.map((s) => (
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
            {s.status === 'slaughtered' && s.video_url ? (
              <a href={s.video_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 p-3 text-sm font-bold text-white hover:bg-slate-800">
                ▶ Kesim videosunu izle
              </a>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                {s.status === 'slaughtered' ? 'Kesim videosu hazırlanıyor.' : 'Kurbanınız kesildiğinde adınıza özel video buraya eklenecek.'}
              </p>
            )}
          </div>
        ))}
      </div>
    </Panel>
  )

  const support = (
    <div className="space-y-6">
      {pledges.length > 0 && (
        <Panel title="Sponsorluklarım ve taksitlerim">
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
        </Panel>
      )}

      {myWells.length > 0 && (
        <Panel title="Su kuyularım">
          <div className="grid gap-4 md:grid-cols-2">
            {myWells.map((w) => {
              const pct = w.target_cents > 0 ? Math.min(100, Math.round((w.collected_cents / w.target_cents) * 100)) : null
              return (
                <div key={w.id} className="overflow-hidden rounded-xl border border-slate-200">
                  {w.gallery_urls[0] && <img src={w.gallery_urls[0]} alt="" className="h-40 w-full object-cover" />}
                  <div className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{w.name}</h4>
                      <Badge tone={w.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-sky-100 text-sky-800'}>{WELL_STATUS[w.status] || w.status}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">{[w.location_name, w.country].filter(Boolean).join(', ')}</p>
                    <p className="text-xs font-semibold text-slate-700">{w.is_owner ? 'Kuyu sahibi' : w.my_shares ? `${w.my_shares} hisse` : 'Taksitli katkı'}</p>
                    {pct !== null && (
                      <div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-primary-600" style={{ width: `${pct}%` }} /></div>
                        <p className="mt-1 text-[11px] text-slate-500">%{pct} tamamlandı</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {extraProjectCount > 0 && (
        <Panel title="Proje ve sponsorluk takibi">
          <div className="space-y-2.5">
            {[
              ...extraWells.map((item) => ({ id: item.id, title: item.name, detail: item.location, status: WELL_STATUS[item.status] || item.status })),
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
        </Panel>
      )}
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
    <Panel title="Düzenli bağış talimatlarım">
      {subscriptions.length === 0 ? (
        <Empty icon="🔁" cta={donateLink}>Aktif bir düzenli bağış talimatınız yok.</Empty>
      ) : (
        <div className="divide-y divide-slate-100">
          {subscriptions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-4">
              <div>
                <p className="text-sm font-bold text-slate-900">{money(s.amount_lira, s.currency)} / ay</p>
                <p className="mt-0.5 text-xs text-slate-500">Sonraki çekim: {date(s.next_charge_date)}</p>
              </div>
              <button type="button" onClick={() => cancelSubscription(s.id)}
                className="rounded-lg bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100">
                İptal et
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
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
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Yazdır
          </button>
        </div>
      )}
    >
      {donations.length === 0
        ? <Empty icon="🤲" cta={donateLink}>Henüz bağış kaydınız bulunmuyor.</Empty>
        : <div className="divide-y divide-slate-100">{donations.map(donationRow)}</div>}
    </Panel>
  )

  const tabContent: Record<TabKey, React.ReactNode> = {
    ozet: overview, bagislar: donationList, kurban, destek: support, uyelik: membership, duzenli: recurring, odemeler: orders,
  }
  const activeTab = tabs.some((t) => t.key === tab) ? tab : 'ozet'

  /* ---------- render ---------- */

  const messages = (
    <>
      {errorMsg && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-700">{errorMsg}</div>}
      {successMsg && <div role="status" className="mb-5 rounded-xl border border-green-200 bg-green-50 p-3.5 text-sm font-semibold text-green-700">{successMsg}</div>}
    </>
  )

  if (step !== 'dashboard') {
    return (
      <div className="bg-slate-50 px-4 py-12 text-slate-800 antialiased sm:py-16">
        <div className="mx-auto max-w-md">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-2xl text-white shadow-lg" aria-hidden="true">
              🤲
            </div>
            <h1 className="font-heading text-2xl font-bold text-slate-900 sm:text-3xl">Bağışçı Paneli</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
              Bağışlarınızı, makbuzlarınızı, kurban videolarınızı ve sponsorluklarınızı tek yerden takip edin.
            </p>
          </div>

          {messages}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">

            <div className="p-6">
              {step === 'login' ? (
                <form onSubmit={(event) => { event.preventDefault(); sendOtp() }} className="space-y-4">
                  <div>
                    <label htmlFor="portal-phone" className="mb-1.5 block text-sm font-semibold text-slate-700">Telefon numaranız</label>
                    <input id="portal-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0555 444 33 22" value={phone}
                      onChange={(event) => setPhone(event.target.value)} required
                      className="w-full rounded-xl border border-slate-300 p-3.5 text-base outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20" />
                    <p className="mt-1.5 text-xs text-slate-500">
                      Bağış yaparken kullandığınız numarayı girin. Size SMS ile tek kullanımlık kod göndereceğiz.
                    </p>
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full rounded-xl bg-primary-600 py-3.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary-700 disabled:opacity-60">
                    {loading ? 'Gönderiliyor…' : 'Giriş kodu gönder'}
                  </button>
                </form>
              ) : (
                <form onSubmit={verifyOtp} className="space-y-4">
                  <div>
                    <label htmlFor="portal-otp" className="mb-1.5 block text-sm font-semibold text-slate-700">SMS doğrulama kodu</label>
                    <input id="portal-otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} autoFocus
                      placeholder="••••••" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ''))} required
                      className="w-full rounded-xl border border-slate-300 p-3.5 text-center text-2xl font-bold tracking-[0.5em] outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20" />
                    <p className="mt-1.5 text-xs text-slate-500"><b>{phone}</b> numarasına 6 haneli kod gönderildi.</p>
                  </div>
                  <button type="submit" disabled={loading || otpCode.length < 6}
                    className="w-full rounded-xl bg-primary-600 py-3.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary-700 disabled:opacity-60">
                    {loading ? 'Doğrulanıyor…' : 'Giriş yap'}
                  </button>
                  <div className="flex items-center justify-between text-sm">
                    <button type="button" onClick={() => { setStep('login'); setErrorMsg('') }} className="font-semibold text-slate-500 hover:text-slate-800">
                      ← Numarayı değiştir
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

  const initials = (displayName || 'B').split(' ').map((part) => part[0]).slice(0, 2).join('').toLocaleUpperCase('tr')

  return (
    <div className="bg-slate-50 px-4 py-8 text-slate-800 antialiased sm:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-base font-bold text-white">{initials}</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Bağışçı Paneli</p>
              <h1 className="truncate font-heading text-xl font-bold text-slate-900 sm:text-2xl">{displayName ? `Merhaba, ${displayName.split(' ')[0]}` : 'Hoş geldiniz'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/kampanyalar" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700">Bağış yap</Link>
            <button type="button" onClick={() => logout()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Çıkış
            </button>
          </div>
        </div>

        {messages}

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

        {dataLoading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Yükleniyor">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />)}
            </div>
            <div className="h-64 animate-pulse rounded-2xl bg-slate-200/70" />
          </div>
        ) : (
          <div className="animate-fade-in space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Toplam destek" value={totalText} hint={`${confirmed.length} onaylı bağış`} accent />
              <Stat label="Kurban hissesi" value={String(shares.length)} hint={shares.length ? `${shares.filter((s) => s.status === 'slaughtered').length} kesildi` : undefined} />
              <Stat label="Sponsorluk & proje" value={String(pledges.length + myWells.length + projectCount)} />
              <Stat label="Düzenli bağış" value={String(subscriptions.length)} hint={subscriptions.length ? 'aktif talimat' : undefined} />
            </div>

            <div className="-mx-4 overflow-x-auto px-4" role="tablist" aria-label="Panel bölümleri">
              <div className="flex w-max gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                {tabs.map((t) => (
                  <button key={t.key} type="button" role="tab" aria-selected={activeTab === t.key} onClick={() => setTab(t.key)}
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-bold transition-colors ${activeTab === t.key ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                    {t.label}
                    {t.count > 0 && (
                      <span className={`rounded-full px-1.5 text-[11px] ${activeTab === t.key ? 'bg-white/25' : t.key === 'ozet' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>{t.count}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div role="tabpanel">{tabContent[activeTab]}</div>
          </div>
        )}
      </div>
    </div>
  )
}
