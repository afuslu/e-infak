'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import axios from 'axios'

interface Donation {
  id: string
  receipt_number: string
  amount_lira: number
  currency: string
  status: string
  payment_method: string
  donor_message: string
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

interface MyMembership {
  member_no: string
  member_type_label: string
  status_label: string
  joined_on: string | null
  dues: { id: string; period: string; due_date: string; amount_cents: number; status: string; status_label: string; overdue: boolean; days_overdue: number; paid_at: string | null }[]
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

interface Subscription {
  id: string
  amount_lira: number
  currency: string
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

interface Student {
  id: string
  full_name: string
  parent_name: string
}

interface StudentProgress {
  id: string
  check_date: string
  memorized_pages: number
  current_surah: string
  instructor_notes?: string
}

export default function PortalPage() {
  const tenantHeaders = () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    if (!isLocal) return {}
    const slug = document.cookie.split(';').map((value) => value.trim())
      .find((value) => value.startsWith('org-slug='))?.split('=')[1]
    return { 'x-organization-slug': slug || '' }
  }
  const [activeTab, setActiveTab] = useState<'donor' | 'parent'>('donor')
  const [step, setStep] = useState<'login' | 'otp' | 'dashboard'>('login')
  const [phone, setPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  
  // Auth state
  const [token, setToken] = useState<string | null>(null)
  const [role, setRole] = useState<'donor' | 'parent' | null>(null)
  
  // Loaded dashboard data
  const [donations, setDonations] = useState<Donation[]>([])
  const [shares, setShares] = useState<KurbanShare[]>([])
  const [pledges, setPledges] = useState<MyPledge[]>([])
  const [memberships, setMemberships] = useState<MyMembership[]>([])
  const [myWells, setMyWells] = useState<MyWell[]>([])
  const [payingId, setPayingId] = useState<string | null>(null)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([])
  const [projects, setProjects] = useState<DonorProjects>({ water_wells: [], orphan_sponsorships: [], student_sponsorships: [] })
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [studentProgress, setStudentProgress] = useState<StudentProgress[]>([])
  
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const isLocal = typeof window !== 'undefined'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const API_BASE = isLocal
    ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020')
    : `${browserOrigin}/api/backend`

  // Clear states on tab change
  const handleTabChange = (tab: 'donor' | 'parent') => {
    setActiveTab(tab)
    setStep('login')
    setPhone('')
    setOtpCode('')
    setErrorMsg('')
    setSuccessMsg('')
  }

  // OTP Sending request
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone) return
    setErrorMsg('')
    setLoading(true)
    
    const endpoint = activeTab === 'donor' 
      ? `${API_BASE}/api/v1/portal/send-otp` 
      : `${API_BASE}/api/v1/parent/send-otp`

    try {
      await axios.post(endpoint, { phone }, {
        headers: tenantHeaders()
      })
      setStep('otp')
      setSuccessMsg('Telefonunuza 6 haneli doğrulama kodu gönderildi.')
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.response?.data?.detail || 'OTP gönderimi başarısız oldu.')
    } finally {
      setLoading(false)
    }
  }

  // OTP Verification request
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otpCode) return
    setErrorMsg('')
    setLoading(true)

    const endpoint = activeTab === 'donor' 
      ? `${API_BASE}/api/v1/portal/verify-otp` 
      : `${API_BASE}/api/v1/parent/verify-otp`

    try {
      const res = await axios.post(endpoint, { phone, code: otpCode }, {
        headers: tenantHeaders()
      })
      const { access_token } = res.data
      setToken(access_token)
      setRole(activeTab)
      setStep('dashboard')
      setSuccessMsg('Giriş başarılı!')
      
      // Load respective dashboard details
      if (activeTab === 'donor') {
        loadDonorDashboard(access_token)
      } else {
        loadParentDashboard(access_token)
      }
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.response?.data?.detail || 'Tek kullanımlık şifre geçersiz veya süresi dolmuş.')
    } finally {
      setLoading(false)
    }
  }

  // Load Donor Dashboard details
  const loadDonorDashboard = async (authToken: string) => {
    const authHeaders = { Authorization: `Bearer ${authToken}`, ...tenantHeaders() }
    try {
      const [donationsRes, sharesRes, subsRes, ordersRes, projectsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/v1/portal/me/donations`, { headers: authHeaders }),
        axios.get(`${API_BASE}/api/v1/portal/me/kurban-shares`, { headers: authHeaders }),
        axios.get(`${API_BASE}/api/v1/portal/me/subscriptions`, { headers: authHeaders }),
        axios.get(`${API_BASE}/api/v1/portal/me/payment-orders`, { headers: authHeaders }),
        axios.get(`${API_BASE}/api/v1/portal/me/projects`, { headers: authHeaders }),
      ])
      setDonations(donationsRes.data)
      setShares(sharesRes.data)
      setSubscriptions(subsRes.data)
      setPaymentOrders(ordersRes.data)
      setProjects(projectsRes.data)
      // Newer modules: a failure here must not hide the rest of the dashboard.
      const [pledgesRes, wellsRes, duesRes] = await Promise.allSettled([
        axios.get(`${API_BASE}/api/v1/portal/me/pledges`, { headers: authHeaders }),
        axios.get(`${API_BASE}/api/v1/portal/me/water-wells`, { headers: authHeaders }),
        axios.get(`${API_BASE}/api/v1/portal/me/member-dues`, { headers: authHeaders }),
      ])
      if (pledgesRes.status === 'fulfilled') setPledges(pledgesRes.value.data)
      if (wellsRes.status === 'fulfilled') setMyWells(wellsRes.value.data)
      if (duesRes.status === 'fulfilled') setMemberships(duesRes.value.data)
    } catch (err) {
      console.error('Failed to load donor dashboard data:', err)
    }
  }

  const payInstallment = async (installmentId: string, method: 'credit_card' | 'bank_transfer') => {
    if (!token) return
    if (!window.confirm('Ödeme sayfasına yönlendirileceksiniz. KVKK aydınlatma metnini okuduğunuzu onaylıyor musunuz?')) return
    setPayingId(installmentId)
    setErrorMsg('')
    try {
      const res = await axios.post(`${API_BASE}/api/v1/portal/me/installments/${installmentId}/pay`,
        { payment_method: method, kvkk_accepted: true },
        { headers: { Authorization: `Bearer ${token}`, ...tenantHeaders() } })
      if (res.data.redirect_url) {
        window.location.assign(res.data.redirect_url)
        return
      }
      setSuccessMsg(`Havale bilgileri: ${res.data.bank_name || ''} ${res.data.iban || ''} — Açıklamaya mutlaka "${res.data.transfer_reference}" yazınız.`)
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || 'Ödeme başlatılamadı.')
    } finally {
      setPayingId(null)
    }
  }

  const payDues = async (dueIds: string[], method: 'credit_card' | 'bank_transfer') => {
    if (!token || !dueIds.length) return
    if (!window.confirm('Ödeme sayfasına yönlendirileceksiniz. KVKK aydınlatma metnini okuduğunuzu onaylıyor musunuz?')) return
    setPayingId(dueIds[0])
    setErrorMsg('')
    try {
      const res = await axios.post(`${API_BASE}/api/v1/portal/me/member-dues/pay`,
        { due_ids: dueIds, payment_method: method, kvkk_accepted: true },
        { headers: { Authorization: `Bearer ${token}`, ...tenantHeaders() } })
      if (res.data.redirect_url) {
        window.location.assign(res.data.redirect_url)
        return
      }
      setSuccessMsg(`Havale bilgileri: ${res.data.bank_name || ''} ${res.data.iban || ''} — Açıklamaya mutlaka "${res.data.transfer_reference}" yazınız.`)
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || 'Ödeme başlatılamadı.')
    } finally {
      setPayingId(null)
    }
  }

  // Load Parent Dashboard details
  const loadParentDashboard = async (authToken: string) => {
    const authHeaders = { Authorization: `Bearer ${authToken}`, ...tenantHeaders() }
    try {
      const res = await axios.get(`${API_BASE}/api/v1/parent/students`, { headers: authHeaders })
      setStudents(res.data)
      if (res.data.length > 0) {
        handleSelectStudent(res.data[0], authToken)
      }
    } catch (err) {
      console.error('Failed to load parent dashboard data:', err)
    }
  }

  const handleSelectStudent = async (student: Student, authToken = token) => {
    setSelectedStudent(student)
    const authHeaders = { Authorization: `Bearer ${authToken}`, ...tenantHeaders() }
    try {
      const res = await axios.get(`${API_BASE}/api/v1/parent/students/${student.id}/progress`, { headers: authHeaders })
      setStudentProgress(res.data)
    } catch (err) {
      console.error('Failed to load student progress:', err)
    }
  }

  const handleCancelSub = async (subId: string) => {
    if (!confirm('Aylık düzenli bağış talimatınızı iptal etmek istediğinize emin misiniz?')) return
    const authHeaders = { Authorization: `Bearer ${token}`, ...tenantHeaders() }
    try {
      await axios.delete(`${API_BASE}/api/v1/portal/subscriptions/${subId}`, { headers: authHeaders })
      setSubscriptions(prev => prev.filter(s => s.id !== subId))
      alert('Aboneliğiniz iptal edilmiştir.')
    } catch (err) {
      console.error(err)
      alert('İşlem gerçekleştirilemedi.')
    }
  }

  const handlePrintReceipt = (donation: Donation) => {
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Bağış Makbuzu - ${donation.receipt_number}</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #334155; }
              .card { max-width: 600px; margin: 0 auto; border: 2px solid #e2e8f0; border-radius: 16px; padding: 30px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
              .header { text-align: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 20px; }
              .logo { font-size: 32px; font-weight: bold; color: #16a34a; }
              .title { font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-top: 5px; }
              .amount { font-size: 36px; font-weight: 900; text-align: center; color: #1e293b; margin: 20px 0; }
              .details { display: grid; grid-template-cols: 1fr 1fr; gap: 15px; font-size: 14px; }
              .label { font-weight: bold; color: #64748b; }
              .val { text-align: right; color: #0f172a; }
              .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #94a3b8; border-t: 1px solid #f1f5f9; padding-top: 15px; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div class="logo">E-İnfak Otomasyonu</div>
                <div class="title">Resmi Bağış Makbuzu</div>
              </div>
              <div class="amount">${donation.amount_lira} ${donation.currency}</div>
              <div class="details">
                <div class="label">Makbuz Numarası:</div>
                <div class="val">#${donation.receipt_number}</div>
                <div class="label">Bağış Tarihi:</div>
                <div class="val">${new Date(donation.created_at).toLocaleDateString('tr-TR')}</div>
                <div class="label">Ödeme Yöntemi:</div>
                <div class="val">${donation.payment_method === 'credit_card' ? 'Kredi Kartı' : 'Havale / EFT'}</div>
                <div class="label">Bağış Durumu:</div>
                <div class="val" style="color: #16a34a; font-weight: bold;">${donation.status.toUpperCase()}</div>
              </div>
              <div class="footer">
                Bu dijital makbuz dernek otomasyon altyapısı tarafından üretilmiştir.<br />
                Katkılarınız için teşekkür ederiz.
              </div>
            </div>
            <script>window.print();</script>
          </body>
        </html>
      `)
      printWindow.document.close()
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased py-12 px-4">
      <div className="max-w-4xl mx-auto">
        
        {/* Portal Header */}
        <div className="text-center mb-8 space-y-2">
          <Link href="/" className="inline-block text-xs font-bold text-red-600 uppercase tracking-widest hover:underline">
            ← Ana Sayfaya Dön
          </Link>
          <h2 className="font-heading text-3xl font-black text-slate-900 tracking-tight">E-İnfak Portalı</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">Bağışçı işlemlerinizi yapın, kurban videolarınızı izleyin veya medrese talebenizin ilerlemesini izleyin.</p>
        </div>

        {errorMsg && (
          <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-600 font-semibold border border-red-100 max-w-md mx-auto">
            ⚠️ {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-6 rounded-xl bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100 max-w-md mx-auto">
            ✨ {successMsg}
          </div>
        )}

        {/* STEP 1 & 2: LOGIN FLOW */}
        {step !== 'dashboard' && (
          <div className="max-w-md mx-auto rounded-3xl bg-white border border-slate-100 shadow-xl overflow-hidden">
            
            {/* Tabs Selector */}
            {step === 'login' && (
              <div className="flex border-b border-slate-100">
                <button
                  onClick={() => handleTabChange('donor')}
                  className={`flex-1 py-4 text-center font-bold text-xs uppercase tracking-wider transition-colors ${activeTab === 'donor' ? 'border-b-2 border-red-600 text-red-600 bg-slate-50/50' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  👤 Bağışçı Girişi
                </button>
                <button
                  onClick={() => handleTabChange('parent')}
                  className={`flex-1 py-4 text-center font-bold text-xs uppercase tracking-wider transition-colors ${activeTab === 'parent' ? 'border-b-2 border-red-600 text-red-600 bg-slate-50/50' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  🏫 Veli Takip Sistemi
                </button>
              </div>
            )}

            <div className="p-6">
              {step === 'login' && (
                <form onSubmit={handleSendOTP} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Telefon Numaranız</label>
                    <input
                      type="tel"
                      placeholder="Örn: 0555 444 33 22"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 p-3.5 text-sm outline-none focus:border-red-500"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 shadow-md transition-colors text-xs uppercase tracking-widest disabled:bg-red-400"
                  >
                    {loading ? 'Lütfen bekleyin...' : 'Giriş Kodu Gönder'}
                  </button>
                </form>
              )}

              {step === 'otp' && (
                <form onSubmit={handleVerifyOTP} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">SMS Doğrulama Kodu</label>
                    <input
                      type="text"
                      placeholder="6 Haneli Kod"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 p-3.5 text-sm text-center font-bold tracking-widest outline-none focus:border-red-500"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 shadow-md transition-colors text-xs uppercase tracking-widest disabled:bg-red-400"
                  >
                    {loading ? 'Doğrulanıyor...' : 'Girişi Tamamla'}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setStep('login')}
                    className="w-full text-center text-xs text-slate-500 hover:text-slate-700 font-semibold"
                  >
                    Numarayı Değiştir
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: DASHBOARD VIEW */}
        {step === 'dashboard' && role === 'donor' && (
          <div className="space-y-8 animate-fade-in">
            {/* Donor Portal Dashboard stats */}
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white border rounded-3xl p-6 shadow-sm space-y-2">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Toplam Bağış Adedi</span>
                <h4 className="text-3xl font-black text-slate-900">{donations.length} Adet</h4>
              </div>
              <div className="bg-white border rounded-3xl p-6 shadow-sm space-y-2">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Toplam Destek Tutarı</span>
                <h4 className="text-3xl font-black text-red-600">
                  {donations.reduce((sum, d) => sum + d.amount_lira, 0).toLocaleString('tr-TR')} ₺
                </h4>
              </div>
              <div className="bg-white border rounded-3xl p-6 shadow-sm space-y-2">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Kurban Hisseleriniz</span>
                <h4 className="text-3xl font-black text-slate-900">{shares.length} Hisse</h4>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-3xl border bg-white p-6 shadow-sm">
                <h3 className="font-heading text-lg font-black text-slate-800">Ödeme ve Havale Durumu</h3>
                <div className="mt-4 space-y-3">
                  {paymentOrders.length === 0 ? (
                    <p className="py-5 text-center text-xs text-slate-400">Henüz ödeme siparişi bulunmamaktadır.</p>
                  ) : paymentOrders.map((order) => (
                    <div key={order.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-black text-slate-800">{(order.total_cents / 100).toLocaleString('tr-TR')} {order.currency}</span>
                        <span className="rounded-full bg-white px-2 py-1 font-bold uppercase text-slate-600">{order.status.replaceAll('_', ' ')}</span>
                      </div>
                      {order.transfer_reference && <p className="mt-2 text-slate-600">Havale açıklaması: <b>{order.transfer_reference}</b></p>}
                      {order.refunded_cents > 0 && <p className="mt-1 text-red-600">İade: {(order.refunded_cents / 100).toLocaleString('tr-TR')} {order.currency}</p>}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border bg-white p-6 shadow-sm">
                <h3 className="font-heading text-lg font-black text-slate-800">Proje ve Sponsorluk Takibi</h3>
                <div className="mt-4 space-y-3 text-xs">
                  {[...projects.water_wells.map((item) => ({ id: item.id, title: item.name, detail: item.location, status: item.status })),
                    ...projects.orphan_sponsorships.map((item) => ({ id: item.id, title: `Yetim desteği: ${item.person_name}`, detail: undefined, status: item.active ? 'Aktif' : 'Tamamlandı' })),
                    ...projects.student_sponsorships.map((item) => ({ id: item.id, title: `Öğrenci desteği: ${item.person_name}`, detail: `${(item.amount_cents / 100).toLocaleString('tr-TR')} ₺`, status: item.active ? 'Aktif' : 'Tamamlandı' })),
                  ].map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-100 p-4">
                      <div><p className="font-bold text-slate-800">{item.title}</p>{item.detail && <p className="mt-1 text-slate-500">{item.detail}</p>}</div>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-700">{item.status}</span>
                    </div>
                  ))}
                  {projects.water_wells.length + projects.orphan_sponsorships.length + projects.student_sponsorships.length === 0 && (
                    <p className="py-5 text-center text-slate-400">Takip edilen proje veya sponsorluk bulunmamaktadır.</p>
                  )}
                </div>
              </section>
            </div>

            {/* List of Donations */}
            <div className="bg-white border rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="font-heading text-lg font-black text-slate-800">Bağış Geçmişim</h3>
              {donations.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">Henüz bağış kaydınız bulunmamaktadır.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {donations.map((d) => (
                    <div key={d.id} className="py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-800">#{d.receipt_number}</span>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${d.status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                            {d.status === 'confirmed' ? 'Başarılı' : d.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{new Date(d.created_at).toLocaleDateString('tr-TR')} - {d.donor_message || 'Açıklama yok'}</p>
                        
                        {/* Display Water Well images link if present */}
                        {d.water_well_images && d.water_well_images.length > 0 && (
                          <div className="mt-2 flex gap-2">
                            {d.water_well_images.map((img, i) => (
                              <a href={img} target="_blank" rel="noopener noreferrer" key={i} className="relative block h-10 w-16 border rounded overflow-hidden">
                                <Image src={img} alt="Su kuyusu fotoğrafı" fill className="object-cover" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="font-black text-lg text-slate-950">{d.amount_lira} {d.currency}</span>
                        <button
                          onClick={() => handlePrintReceipt(d)}
                          className="border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold py-1.5 px-3 rounded-lg"
                        >
                          🖨️ Makbuz İndir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Qurban Shares Video Status */}
            <div className="bg-white border rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="font-heading text-lg font-black text-slate-800">Kurban Kesim Bilgisi & Video Takibi</h3>
              {shares.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">Hesabınıza kayıtlı kurban hissesi bulunmamaktadır.</p>
              ) : (
                <div className="grid md:grid-cols-2 gap-6">
                  {shares.map((s) => (
                    <div key={s.id} className="border border-slate-100 rounded-2xl p-4 bg-slate-50 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-sm text-slate-800">{s.campaign_title || (s.animal_type === 'cow' ? 'Büyükbaş Kurban Hissesi' : 'Kurban Hissesi')}</h4>
                          <span className="block text-xs text-slate-600">{s.on_behalf_of || s.donor_name} adına · {s.kurban_type || 'Kurban'}{s.country ? ` · ${s.country}` : ''}</span>
                          <span className="text-[10px] text-slate-400">Künye No: {s.animal_number}{s.share_number ? ` (Hisse No: ${s.share_number})` : ''}</span>
                        </div>
                        <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${s.status === 'slaughtered' ? 'bg-green-600 text-white animate-pulse' : 'bg-amber-100 text-amber-800'}`}>
                          {s.status === 'slaughtered' ? 'Kesildi 🎬' : 'Bekliyor'}
                        </span>
                      </div>

                      {s.status === 'slaughtered' && s.video_url ? (
                        <a href={s.video_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 p-4 text-sm font-bold text-white hover:bg-slate-800">
                          🎬 Kesim videosunu izle
                        </a>
                      ) : (
                        <div className="border border-dashed rounded-xl p-6 text-center text-xs text-slate-400">
                          ℹ️ Kurbanınız kesildiğinde adınıza özel kesim videosu buraya eklenecektir.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Association membership dues */}
            {memberships.length > 0 && (
              <div className="bg-white border rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="font-heading text-lg font-black text-slate-800">Üyeliğim & Aidatlarım</h3>
                {memberships.map((m) => {
                  const open = m.dues.filter((d) => d.status === 'open')
                  const openTotal = open.reduce((sum, d) => sum + d.amount_cents, 0)
                  return (
                    <div key={m.member_no} className="border border-slate-100 rounded-2xl p-4 bg-slate-50 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-bold text-slate-800">Üye no {m.member_no} · {m.member_type_label}</span>
                        <span className="text-xs text-slate-500">{m.status_label}{m.joined_on ? ` · ${new Date(m.joined_on).getFullYear()} yılından beri` : ''}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {m.dues.map((d) => (
                          <span key={d.id} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${d.status === 'paid' ? 'bg-green-100 text-green-700' : d.overdue ? 'bg-red-100 text-red-700' : d.status === 'open' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                            {d.period} · {(d.amount_cents / 100).toLocaleString('tr-TR')} ₺ · {d.overdue ? 'gecikmiş' : d.status_label}
                          </span>
                        ))}
                      </div>
                      {open.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-xs">
                          <span>Açık aidat: <b>{(openTotal / 100).toLocaleString('tr-TR')} ₺</b> ({open.length} dönem)</span>
                          <span className="flex gap-2">
                            <button disabled={payingId === open[0].id} onClick={() => payDues(open.map((d) => d.id), 'credit_card')}
                              className="rounded-lg bg-slate-900 px-3 py-1.5 font-bold text-white disabled:opacity-50">Kartla öde</button>
                            <button disabled={payingId === open[0].id} onClick={() => payDues(open.map((d) => d.id), 'bank_transfer')}
                              className="rounded-lg border px-3 py-1.5 font-bold">Havale</button>
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Sponsorships / pledges with installments */}
            {pledges.length > 0 && (
              <div className="bg-white border rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="font-heading text-lg font-black text-slate-800">Sponsorluklarım & Taksitlerim</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {pledges.map((p) => (
                    <div key={p.id} className="border border-slate-100 rounded-2xl p-4 bg-slate-50 space-y-3">
                      <div className="flex gap-3">
                        {p.beneficiary?.photo_url && <img src={p.beneficiary.photo_url} alt="" className="h-14 w-14 rounded-xl object-cover" />}
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-slate-800">{p.beneficiary?.first_name || p.title}</h4>
                          <span className="text-[11px] text-slate-500">
                            {p.kind_label}{p.beneficiary?.school ? ` · ${p.beneficiary.school}` : ''}{p.beneficiary?.country ? ` · ${p.beneficiary.country}` : ''}
                          </span>
                          <div className="text-xs text-slate-600 mt-1">
                            {(p.installment_amount_cents / 100).toLocaleString('tr-TR')} {p.currency} × {p.installment_count} · {p.paid_count} taksit ödendi
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {p.installments.map((i) => (
                          <span key={i.id} title={new Date(i.due_date).toLocaleDateString('tr-TR')}
                            className={`h-2.5 w-5 rounded-full ${i.status === 'paid' ? 'bg-green-500' : i.status === 'overdue' ? 'bg-red-500' : 'bg-slate-200'}`} />
                        ))}
                      </div>
                      {p.status === 'active' && p.next_installment && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-xs">
                          <span>
                            {p.next_installment.status === 'overdue' ? '⚠️ Gecikmiş taksit' : 'Sıradaki taksit'}: <b>{new Date(p.next_installment.due_date).toLocaleDateString('tr-TR')}</b>
                          </span>
                          <span className="flex gap-2">
                            <button disabled={payingId === p.next_installment.id} onClick={() => payInstallment(p.next_installment!.id, 'credit_card')}
                              className="rounded-lg bg-slate-900 px-3 py-1.5 font-bold text-white disabled:opacity-50">Kartla öde</button>
                            <button disabled={payingId === p.next_installment.id} onClick={() => payInstallment(p.next_installment!.id, 'bank_transfer')}
                              className="rounded-lg border px-3 py-1.5 font-bold">Havale</button>
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Water wells the donor funded */}
            {myWells.length > 0 && (
              <div className="bg-white border rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="font-heading text-lg font-black text-slate-800">Su Kuyularım</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {myWells.map((w) => (
                    <div key={w.id} className="border border-slate-100 rounded-2xl p-4 bg-slate-50 space-y-2">
                      {w.gallery_urls[0] && <img src={w.gallery_urls[0]} alt="" className="h-36 w-full rounded-xl object-cover" />}
                      <h4 className="font-bold text-sm text-slate-800">{w.name}</h4>
                      <div className="text-xs text-slate-500">{[w.location_name, w.country].filter(Boolean).join(', ')}</div>
                      <div className="text-xs font-semibold text-slate-700">
                        {w.is_owner ? 'Kuyu sahibi' : w.my_shares ? `${w.my_shares} hisse` : 'Taksitli katkı'} ·{' '}
                        {{ planned: 'Planlandı', funding: 'Fon toplanıyor', drilling: 'Yapımda', completed: 'Tamamlandı ✓' }[w.status] || w.status}
                      </div>
                      {w.target_cents > 0 && (
                        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full bg-sky-600" style={{ width: `${Math.min(100, (w.collected_cents / w.target_cents) * 100)}%` }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly Subscriptions list */}
            <div className="bg-white border rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="font-heading text-lg font-black text-slate-800">Düzenli Bağış Talimatlarım (Aylık)</h3>
              {subscriptions.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">Aktif bir düzenli bağış talimatınız bulunmamaktadır.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {subscriptions.map((s) => (
                    <div key={s.id} className="py-4 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm text-slate-800">{s.amount_lira} ₺ / Ay</p>
                        <p className="text-xs text-slate-400 mt-0.5">Bir sonraki çekim: {new Date(s.next_charge_date).toLocaleDateString('tr-TR')}</p>
                      </div>
                      <button
                        onClick={() => handleCancelSub(s.id)}
                        className="bg-red-50 text-red-600 hover:bg-red-100 font-bold text-xs py-2 px-4 rounded-xl transition-all"
                      >
                        İptal Et
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* STEP 3: PARENT DASHBOARD VIEW */}
        {step === 'dashboard' && role === 'parent' && (
          <div className="grid md:grid-cols-12 gap-8 items-start animate-fade-in">
            
            {/* Student List Sidebar (Left) */}
            <div className="md:col-span-4 bg-white border rounded-3xl p-5 shadow-sm space-y-4">
              <h3 className="font-heading text-base font-black text-slate-800">Öğrencilerim</h3>
              {students.length === 0 ? (
                <p className="text-xs text-slate-400">Kayıtlı öğrenciniz bulunmamaktadır.</p>
              ) : (
                <div className="space-y-2">
                  {students.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectStudent(s)}
                      className={`w-full text-left p-3 rounded-2xl border transition-all text-xs font-bold ${
                        selectedStudent?.id === s.id
                          ? 'border-red-600 bg-red-50 text-red-950'
                          : 'border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      🎓 {s.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Student Progress Charts (Right) */}
            <div className="md:col-span-8 bg-white border rounded-3xl p-6 shadow-sm space-y-6">
              {selectedStudent ? (
                <>
                  <div className="border-b pb-4">
                    <h3 className="font-heading text-lg font-black text-slate-800">{selectedStudent.full_name}</h3>
                    <p className="text-xs text-slate-400">Hafızlık / Ezber İlerleme Raporu</p>
                  </div>

                  {studentProgress.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs border border-dashed rounded-2xl">
                      Öğrenciye ait henüz ders kaydı girilmemiştir.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Simple CSS bar chart visualizing progress */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ezber İlerleme Grafiği (Sayfa)</h4>
                        
                        <div className="space-y-2">
                          {studentProgress.map((p) => {
                            const pct = Math.min((p.memorized_pages / 600) * 100, 100) // Assuming 600 pages total in Quran
                            return (
                              <div key={p.id} className="space-y-1">
                                <div className="flex justify-between items-center text-xs font-semibold text-slate-700">
                                  <span>📅 {new Date(p.check_date).toLocaleDateString('tr-TR')}</span>
                                  <span>{p.current_surah} (<b>{p.memorized_pages} Sayfa</b>)</span>
                                </div>
                                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-red-500 to-rose-500 rounded-full transition-all duration-550"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Instructor notes list */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-t pt-4">Hoca Notları & Görüşleri</h4>
                        <div className="space-y-3">
                          {studentProgress.map((p) => (
                            p.instructor_notes && (
                              <div key={p.id} className="p-4 rounded-2xl bg-amber-50 border border-amber-100 text-xs leading-relaxed text-amber-950">
                                <span className="font-bold block text-amber-800 mb-1">Hoca Değerlendirmesi ({new Date(p.check_date).toLocaleDateString('tr-TR')}):</span>
                                &ldquo;{p.instructor_notes}&rdquo;
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-slate-400 text-xs">
                  Öğrencinin detaylarını görmek için sol taraftan öğrenci seçiniz.
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
