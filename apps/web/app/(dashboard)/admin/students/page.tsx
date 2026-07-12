'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

interface Student {
  id: string
  first_name: string
  last_name: string
  parent_name: string
  parent_phone: string
  parent_email?: string
}

interface ProgressLog {
  id: string
  check_date: string
  memorized_pages: number
  current_surah: string
  instructor_notes?: string
}

interface Sponsor {
  id: string
  donor_name: string
  donor_phone: string
  amount_cents: number
  is_active: boolean
}

interface Donor {
  id: string
  first_name: string
  last_name: string
  email: string
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  
  // Data for selected student
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([])
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  
  // Dropdown list of all donors to select sponsor
  const [allDonors, setAllDonors] = useState<Donor[]>([])
  
  // Add Student Form State
  const [showAddForm, setShowAddForm] = useState(false)
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newParentName, setNewParentName] = useState('')
  const [newParentPhone, setNewParentPhone] = useState('')
  const [newParentEmail, setNewParentEmail] = useState('')
  
  // Lesson Log Form State
  const [newSurah, setNewSurah] = useState('')
  const [newPages, setNewPages] = useState('1')
  const [instructorNotes, setInstructorNotes] = useState('')
  
  // Add Sponsor State
  const [selectedDonorId, setSelectedDonorId] = useState('')
  const [sponsorshipAmount, setSponsorshipAmount] = useState('500')

  const [loading, setLoading] = useState(false)
  const [savingProgress, setSavingProgress] = useState(false)
  const [savingSponsorship, setSavingSponsorship] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
      'x-organization-slug': 'hicret-dernegi'
    }
  }

  const loadStudents = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/students`, { headers })
      setStudents(res.data)
      
      // Fetch donors list for sponsor selection dropdown
      const donorsRes = await axios.get(`${API_BASE}/api/v1/admin-features/donors`, { headers })
      setAllDonors(donorsRes.data)
    } catch (err) {
      console.error('Failed to load students data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStudents()
  }, [])

  const handleSelectStudent = async (st: Student) => {
    setSelectedStudent(st)
    setProgressLogs([])
    setSponsors([])
    setSuccessMsg('')
    
    try {
      const headers = getAuthHeaders()
      // 1. Fetch lessons progress
      const progRes = await axios.get(`${API_BASE}/api/v1/admin-features/students/${st.id}/progress`, { headers })
      setProgressLogs(progRes.data)
      
      // 2. Fetch sponsors
      const spRes = await axios.get(`${API_BASE}/api/v1/admin-features/students/${st.id}/sponsorships`, { headers })
      setSponsors(spRes.data)
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const headers = getAuthHeaders()
      const res = await axios.post(`${API_BASE}/api/v1/admin-features/students`, {
        first_name: newFirstName,
        last_name: newLastName,
        parent_name: newParentName,
        parent_phone: newParentPhone,
        parent_email: newParentEmail
      }, { headers })
      
      setStudents(prev => [...prev, res.data])
      setShowAddForm(false)
      setNewFirstName('')
      setNewLastName('')
      setNewParentName('')
      setNewParentPhone('')
      setNewParentEmail('')
      alert('Öğrenci kaydı oluşturuldu!')
    } catch (err) {
      console.error(err)
      alert('Öğrenci eklenemedi.')
    }
  }

  const handleSaveProgress = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStudent || !newSurah.trim()) return

    setSavingProgress(true)
    setSuccessMsg('')
    try {
      const headers = getAuthHeaders()
      const res = await axios.post(`${API_BASE}/api/v1/admin-features/students/${selectedStudent.id}/progress`, {
        memorized_pages: Number(newPages),
        current_surah: newSurah,
        instructor_notes: instructorNotes
      }, { headers })
      
      setProgressLogs(prev => [res.data, ...prev])
      setNewSurah('')
      setNewPages('1')
      setInstructorNotes('')
      setSuccessMsg('Öğrenci gelişim kaydı eklendi!')
    } catch (err) {
      console.error(err)
    } finally {
      setSavingProgress(false)
    }
  }

  const handleLinkSponsor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStudent || !selectedDonorId) return

    setSavingSponsorship(true)
    setSuccessMsg('')
    try {
      const headers = getAuthHeaders()
      await axios.post(`${API_BASE}/api/v1/admin-features/students/${selectedStudent.id}/sponsorships`, {
        donor_id: selectedDonorId,
        amount_cents: Math.round(Number(sponsorshipAmount) * 100)
      }, { headers })
      
      // Reload sponsors
      const spRes = await axios.get(`${API_BASE}/api/v1/admin-features/students/${selectedStudent.id}/sponsorships`, { headers })
      setSponsors(spRes.data)
      setSuccessMsg('Sponsorluk eşleşmesi başarıyla sağlandı!')
      setSelectedDonorId('')
    } catch (err) {
      console.error(err)
      alert('Sponsor eklenemedi.')
    } finally {
      setSavingSponsorship(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Medrese Öğrenci & Sponsorluk Paneli</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 px-5 rounded-lg text-xs uppercase"
        >
          {showAddForm ? '✕ İptal Et' : '➕ Yeni Öğrenci Ekle'}
        </button>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100 animate-fade-in">
          ✨ {successMsg}
        </div>
      )}

      {/* Add Student Collapse Form */}
      {showAddForm && (
        <Card className="p-6 border border-gray-100 shadow-sm space-y-4 max-w-2xl animate-fade-in">
          <h2 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wider text-gray-400">Yeni Öğrenci Bilgileri</h2>
          <form onSubmit={handleAddStudent} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ad *</label>
                <input
                  type="text"
                  placeholder="Örn: Ömer"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Soyad *</label>
                <input
                  type="text"
                  placeholder="Örn: Yılmaz"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Veli Adı Soyadı *</label>
                <input
                  type="text"
                  placeholder="Örn: Ahmet Yılmaz"
                  value={newParentName}
                  onChange={(e) => setNewParentName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Veli Telefonu *</label>
                <input
                  type="text"
                  placeholder="Örn: +90 555..."
                  value={newParentPhone}
                  onChange={(e) => setNewParentPhone(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Veli E-Postası</label>
                <input
                  type="email"
                  placeholder="Örn: veli@gmail.com"
                  value={newParentEmail}
                  onChange={(e) => setNewParentEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" className="bg-primary-600 text-white font-bold py-2 px-5 text-xs rounded-lg uppercase">
                Öğrenci Kaydet
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Öğrenci kayıtları yükleniyor...</p>
      ) : (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left: Students List */}
          <div className={`${selectedStudent ? 'lg:col-span-5' : 'lg:col-span-12'} space-y-4 transition-all duration-300`}>
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Kayıtlı Medrese Talebeleri</h2>
              <div className="space-y-3">
                {students.map(st => (
                  <div
                    key={st.id}
                    onClick={() => handleSelectStudent(st)}
                    className={`flex justify-between items-center p-4 bg-gray-50 rounded-2xl border transition-all cursor-pointer ${selectedStudent?.id === st.id ? 'border-primary-600 bg-primary-50/20' : 'border-gray-100 hover:bg-gray-100/50'}`}
                  >
                    <div>
                      <div className="font-bold text-gray-900 text-sm">🎓 {st.first_name} {st.last_name}</div>
                      <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">Veli: {st.parent_name} | {st.parent_phone}</div>
                    </div>
                    <Button size="sm" variant="ghost" className="text-primary-600 font-bold text-[11px]">
                      Yönet ➔
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right: Selected Student details (Lessons progress & Sponsorship links) */}
          {selectedStudent && (
            <div className="lg:col-span-7 space-y-6 animate-fade-in">
              <Card className="p-6 border border-gray-100 shadow-md space-y-6 relative">
                <button 
                  onClick={() => setSelectedStudent(null)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-sm font-bold"
                >
                  ✕ Kapat
                </button>

                {/* Header */}
                <div>
                  <span className="text-[10px] bg-primary-100 text-primary-800 font-bold px-2 py-0.5 rounded uppercase tracking-wider">Talebe Eğitim & Sponsor Profili</span>
                  <h2 className="text-xl font-bold text-gray-900 mt-2">🎓 {selectedStudent.first_name} {selectedStudent.last_name}</h2>
                </div>

                {/* Sponsors Match Panel */}
                <div className="space-y-4 border-t pt-4">
                  <h3 className="text-sm font-bold text-gray-900 border-b pb-1.5">Sponsor Eşleştirme</h3>
                  
                  {/* Current Active Sponsors */}
                  <div className="space-y-2">
                    {sponsors.length === 0 ? (
                      <p className="text-xs text-gray-400">Bu öğrenciye atanmış aktif sponsor bulunmamaktadır.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {sponsors.map(sp => (
                          <div key={sp.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center text-xs">
                            <div>
                              <span className="font-bold text-gray-900">👤 {sp.donor_name}</span>
                              <span className="text-[9px] text-gray-400 block font-mono">{sp.donor_phone}</span>
                            </div>
                            <span className="font-bold text-emerald-700">{(sp.amount_cents / 100)} ₺/Ay</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add Sponsor Form */}
                  <form onSubmit={handleLinkSponsor} className="flex gap-2 items-end pt-2">
                    <div className="flex-1">
                      <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Sponsor Bağışçı Seçin</label>
                      <select
                        value={selectedDonorId}
                        onChange={(e) => setSelectedDonorId(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 p-2 text-xs bg-white outline-none focus:border-primary-500"
                        required
                      >
                        <option value="">Seçiniz...</option>
                        {allDonors.map(d => (
                          <option key={d.id} value={d.id}>{d.first_name} {d.last_name || ''} ({d.email})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Sponsorluk Tutarı</label>
                      <input
                        type="number"
                        value={sponsorshipAmount}
                        onChange={(e) => setSponsorshipAmount(e.target.value)}
                        className="w-20 rounded-lg border border-gray-300 p-2 text-xs outline-none focus:border-primary-500"
                        required
                      />
                    </div>
                    <Button 
                      type="submit" 
                      disabled={savingSponsorship}
                      className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-lg text-xs"
                    >
                      {savingSponsorship ? 'Atanıyor...' : 'Sponsor Eşle'}
                    </Button>
                  </form>
                </div>

                {/* Lesson logs & checklist */}
                <div className="space-y-4 border-t pt-4">
                  <h3 className="text-sm font-bold text-gray-900 border-b pb-1.5">Hafızlık / Ders Takip Günlüğü</h3>
                  
                  {/* Log new check */}
                  <form onSubmit={handleSaveProgress} className="space-y-3 p-4 bg-amber-50/20 border border-amber-100 rounded-2xl">
                    <span className="text-[10px] font-bold text-amber-800 uppercase block tracking-wider">Hoca Ders Girişi</span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Ezberlenen Sure *</label>
                        <input
                          type="text"
                          placeholder="Örn: Yasin Suresi"
                          value={newSurah}
                          onChange={(e) => setNewSurah(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 p-2 text-xs outline-none bg-white focus:border-primary-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Sayfa Sayısı *</label>
                        <input
                          type="number"
                          value={newPages}
                          onChange={(e) => setNewPages(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 p-2 text-xs outline-none bg-white focus:border-primary-500"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Eğitmen Notları</label>
                      <textarea
                        placeholder="Örn: Tecvid kurallarına dikkat etmesi gerekiyor, ezberi zayıf..."
                        value={instructorNotes}
                        onChange={(e) => setInstructorNotes(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 p-2 text-xs outline-none bg-white focus:border-primary-500 min-h-[50px]"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button 
                        type="submit" 
                        disabled={savingProgress}
                        className="bg-primary-600 text-white font-bold py-1.5 px-4 rounded-lg text-xs"
                      >
                        {savingProgress ? 'Kaydediliyor...' : 'Ders Kaydet'}
                      </Button>
                    </div>
                  </form>

                  {/* Progress Logs Feed */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Ders Geçmişi ({progressLogs.length})</label>
                    {progressLogs.length === 0 ? (
                      <p className="text-xs text-gray-400">Henüz ders kaydı girilmemiştir.</p>
                    ) : (
                      <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                        {progressLogs.map(log => (
                          <div key={log.id} className="p-3 bg-white border border-gray-200 rounded-xl space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-gray-900">📖 {log.current_surah} ({log.memorized_pages} Sayfa)</span>
                              <span className="text-[10px] text-gray-400">{new Date(log.check_date).toLocaleDateString('tr-TR')}</span>
                            </div>
                            {log.instructor_notes && (
                              <p className="text-[11px] text-gray-500 italic bg-gray-50 p-2 rounded-lg leading-relaxed">
                                Not: {log.instructor_notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
