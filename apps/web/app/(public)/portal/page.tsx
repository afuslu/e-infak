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
  share_number: number
  status: 'waiting' | 'slaughtered'
  animal_number: string
  animal_type: string
  video_url?: string
}

interface Subscription {
  id: string
  amount_lira: number
  currency: string
  status: string
  next_charge_date: string
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
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [studentProgress, setStudentProgress] = useState<StudentProgress[]>([])
  
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

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
        headers: { 'x-organization-slug': 'hicret-dernegi' } // Default tenant context
      })
      setStep('otp')
      setSuccessMsg('Telefonunuza 6 haneli doğrulama kodu gönderildi (Test için: 123456)')
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
        headers: { 'x-organization-slug': 'hicret-dernegi' }
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
    const authHeaders = { Authorization: `Bearer ${authToken}`, 'x-organization-slug': 'hicret-dernegi' }
    try {
      const [donationsRes, sharesRes, subsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/v1/portal/me/donations`, { headers: authHeaders }),
        axios.get(`${API_BASE}/api/v1/portal/me/kurban-shares`, { headers: authHeaders }),
        axios.get(`${API_BASE}/api/v1/portal/me/subscriptions`, { headers: authHeaders }),
      ])
      setDonations(donationsRes.data)
      setShares(sharesRes.data)
      setSubscriptions(subsRes.data)
    } catch (err) {
      console.error('Failed to load donor dashboard data:', err)
    }
  }

  // Load Parent Dashboard details
  const loadParentDashboard = async (authToken: string) => {
    const authHeaders = { Authorization: `Bearer ${authToken}`, 'x-organization-slug': 'hicret-dernegi' }
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
    const authHeaders = { Authorization: `Bearer ${authToken}`, 'x-organization-slug': 'hicret-dernegi' }
    try {
      const res = await axios.get(`${API_BASE}/api/v1/parent/students/${student.id}/progress`, { headers: authHeaders })
      setStudentProgress(res.data)
    } catch (err) {
      console.error('Failed to load student progress:', err)
    }
  }

  const handleCancelSub = async (subId: string) => {
    if (!confirm('Aylık düzenli bağış talimatınızı iptal etmek istediğinize emin misiniz?')) return
    const authHeaders = { Authorization: `Bearer ${token}`, 'x-organization-slug': 'hicret-dernegi' }
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
                          <h4 className="font-bold text-sm text-slate-800">{s.animal_type === 'cow' ? 'Büyükbaş' : 'Küçükbaş'} Kurban Hissesi</h4>
                          <span className="text-[10px] text-slate-400">Künye No: {s.animal_number} (Hisse No: {s.share_number})</span>
                        </div>
                        <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${s.status === 'slaughtered' ? 'bg-green-600 text-white animate-pulse' : 'bg-amber-100 text-amber-800'}`}>
                          {s.status === 'slaughtered' ? 'Kesildi 🎬' : 'Bekliyor'}
                        </span>
                      </div>

                      {s.status === 'slaughtered' && s.video_url ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-600">Kesim Videosu:</p>
                          <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border">
                            <video src={s.video_url} controls className="h-full w-full object-cover" />
                          </div>
                        </div>
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
                                "{p.instructor_notes}"
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
