'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

interface Donor {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  created_at: string
}

interface Note {
  id: string
  content: string
  created_at: string
  author_email: string
}

interface Donation {
  id: string
  amount_cents: number
  payment_method: string
  created_at: string
  campaign_title?: string
}

export default function AdminDonorsPage() {
  const [donors, setDonors] = useState<Donor[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDonor, setSelectedDonor] = useState<Donor | null>(null)
  
  // Drawer details
  const [notes, setNotes] = useState<Note[]>([])
  const [donorDonations, setDonorDonations] = useState<Donation[]>([])
  const [newNoteContent, setNewNoteContent] = useState('')
  
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [submittingNote, setSubmittingNote] = useState(false)

  const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
    }
  }

  const loadDonors = async () => {
    try {
      const headers = getAuthHeaders()
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/donors`, { headers })
      setDonors(res.data)
    } catch (err) {
      console.error('Failed to load donors:', err)
    }
  }

  useEffect(() => {
    loadDonors()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSelectDonor = async (donor: Donor) => {
    setSelectedDonor(donor)
    setNotes([])
    setDonorDonations([])
    setNewNoteContent('')
    setLoadingNotes(true)
    
    try {
      const headers = getAuthHeaders()
      // Fetch notes
      const notesRes = await axios.get(`${API_BASE}/api/v1/admin-features/donors/${donor.id}/notes`, { headers })
      setNotes(notesRes.data)
      
      // Fetch and scope the tenant donation list to this donor.
      const donationsRes = await axios.get(`${API_BASE}/api/v1/donations`, { headers })
      const filtered = donationsRes.data.filter((d: any) => d.donor_id === donor.id || d.donor?.email === donor.email)
      setDonorDonations(filtered)
    } catch (err) {
      console.error('Failed to load donor details:', err)
    } finally {
      setLoadingNotes(false)
    }
  }

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDonor || !newNoteContent.trim()) return

    setSubmittingNote(true)
    try {
      const headers = getAuthHeaders()
      const res = await axios.post(`${API_BASE}/api/v1/admin-features/donors/${selectedDonor.id}/notes`, {
        content: newNoteContent
      }, { headers })
      
      setNotes(prev => [res.data, ...prev])
      setNewNoteContent('')
    } catch (err) {
      console.error('Failed to add note:', err)
      alert('Not eklenemedi.')
    } finally {
      setSubmittingNote(false)
    }
  }

  const filteredDonors = donors.filter(d => {
    const term = searchQuery.toLowerCase()
    const fullName = `${d.first_name} ${d.last_name || ''}`.toLowerCase()
    return fullName.includes(term) || d.email.toLowerCase().includes(term) || d.phone.includes(term)
  })

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Bağışçı CRM Yönetimi</h1>
      </div>

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Left side: Donors List */}
        <div className={`${selectedDonor ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-6 transition-all duration-300`}>
          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-4">
              <input
                type="text"
                placeholder="İsim, e-posta veya telefon ile ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500"
              />
            </div>

            {filteredDonors.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">Bağışçı bulunamadı.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-600">
                  <thead>
                    <tr className="border-b text-gray-500 uppercase tracking-wider text-[10px] font-bold">
                      <th className="pb-3">Ad Soyad</th>
                      <th className="pb-3">İletişim</th>
                      <th className="pb-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredDonors.map((d) => (
                      <tr 
                        key={d.id} 
                        onClick={() => handleSelectDonor(d)}
                        className={`hover:bg-gray-50/80 cursor-pointer transition-colors ${selectedDonor?.id === d.id ? 'bg-primary-50/50' : ''}`}
                      >
                        <td className="py-3 font-semibold text-gray-900">{d.first_name} {d.last_name}</td>
                        <td className="py-3">
                          <div className="font-mono text-[11px]">{d.phone}</div>
                          <div className="text-gray-400 text-[10px]">{d.email}</div>
                        </td>
                        <td className="py-3 text-right">
                          <Button size="sm" variant="ghost" className="text-primary-600 hover:text-primary-700 font-bold">
                            Detay ➔
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Right side: Selected Donor Details Drawer */}
        {selectedDonor && (
          <div className="lg:col-span-6 space-y-6 animate-fade-in">
            <Card className="p-6 border border-gray-100 shadow-md space-y-6 relative">
              <button 
                onClick={() => setSelectedDonor(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-sm font-bold"
              >
                ✕ Kapat
              </button>

              <div>
                <span className="text-[10px] bg-primary-100 text-primary-800 font-bold px-2 py-0.5 rounded uppercase tracking-wider">Bağışçı CRM Profili</span>
                <h2 className="text-2xl font-bold text-gray-900 mt-2">{selectedDonor.first_name} {selectedDonor.last_name}</h2>
                <div className="mt-3 grid grid-cols-2 gap-4 text-xs text-gray-600 border-t pt-3">
                  <div>
                    <span className="font-bold text-gray-400 block uppercase text-[10px]">E-Posta</span>
                    <span>{selectedDonor.email}</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-400 block uppercase text-[10px]">Telefon</span>
                    <span>{selectedDonor.phone}</span>
                  </div>
                </div>
              </div>

              {/* Donations History */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-900 border-b pb-1.5">Bağış Geçmişi</h3>
                {donorDonations.length === 0 ? (
                  <p className="text-xs text-gray-400">Bu bağışçıya ait onaylanmış bağış bulunmamaktadır.</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                    {donorDonations.map((don) => (
                      <div key={don.id} className="flex justify-between items-center text-xs p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                        <div>
                          <div className="font-bold text-gray-900">{don.campaign_title || 'Genel Bağış'}</div>
                          <div className="text-[10px] text-gray-400">{new Date(don.created_at).toLocaleDateString('tr-TR')}</div>
                        </div>
                        <div className="font-bold text-emerald-700">{(don.amount_cents / 100).toLocaleString('tr-TR')} ₺</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Administrative Notes */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-900 border-b pb-1.5">Takip Notları (CRM)</h3>
                
                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="space-y-2">
                  <textarea
                    placeholder="Bağışçı hakkında not ekleyin... (Örn: Kurumsal temsilci, Kurban dönemi aranacak)"
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500 min-h-[60px]"
                    required
                  />
                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={submittingNote}
                      className="bg-primary-600 text-white font-bold py-1.5 px-4 rounded-lg text-xs"
                    >
                      {submittingNote ? 'Ekleniyor...' : 'Not Ekle'}
                    </Button>
                  </div>
                </form>

                {/* Notes Feed */}
                {loadingNotes ? (
                  <p className="text-xs text-gray-400 text-center py-2 animate-pulse">Notlar yükleniyor...</p>
                ) : notes.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">Kayıtlı not bulunmamaktadır.</p>
                ) : (
                  <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                    {notes.map(note => (
                      <div key={note.id} className="p-3 rounded-xl bg-amber-50/50 border border-amber-100 space-y-1.5">
                        <p className="text-xs text-gray-800 leading-relaxed font-medium">{note.content}</p>
                        <div className="flex justify-between items-center text-[10px] text-gray-400 font-semibold">
                          <span>👤 {note.author_email}</span>
                          <span>{new Date(note.created_at).toLocaleString('tr-TR')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
