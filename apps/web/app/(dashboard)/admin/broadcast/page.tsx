'use client'

import { useState } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

export default function AdminBroadcastPage() {
  const [filterType, setFilterType] = useState('all')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
      'x-organization-slug': 'hicret-dernegi'
    }
  }

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return

    setSending(true)
    setSuccessMsg('')
    try {
      const headers = getAuthHeaders()
      const res = await axios.post(`${API_BASE}/api/v1/admin-features/sms/broadcast`, {
        filter_type: filterType,
        message: message
      }, { headers })
      
      setSuccessMsg(`Tebrikler! Toplu SMS duyurusu başarıyla gönderildi. Toplam ${res.data.sent_count} bağışçıya SMS iletildi.`);
      setMessage('')
    } catch (err) {
      console.error(err)
      alert('SMS gönderimi başarısız.')
    } finally {
      setSending(false)
    }
  }

  const selectTemplate = (text: string) => {
    setMessage(text)
    setSuccessMsg('')
  }

  const charCount = message.length
  const smsCount = Math.ceil(charCount / 160) || 1

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Toplu SMS Gönderim Paneli</h1>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100 animate-fade-in">
          ✨ {successMsg}
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Left: Broadcast Form */}
        <div className="lg:col-span-7">
          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wider text-gray-400 font-bold">Duyuru Parametreleri</h2>
            <form onSubmit={handleBroadcast} className="space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Hedef Bağışçı Grubu *</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none bg-white focus:border-primary-500 font-semibold text-gray-700"
                >
                  <option value="all">Tüm Kayıtlı Bağışçılar</option>
                  <option value="active_donors">Son 6 Ayda Bağış Yapanlar (Sıcak Portföy)</option>
                  <option value="kurban_donors">Kurban Bağışçıları Grubu</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase">Duyuru Mesajı Metni *</label>
                  <span className="text-[10px] text-gray-400 font-bold">
                    Karakter: {charCount} | SMS Boyutu: {smsCount} (Her 160 kar. 1 SMS)
                  </span>
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Bağışçılarınıza duyurmak istediğiniz mesajı buraya yazın..."
                  className="w-full rounded-lg border border-gray-300 p-4 text-xs outline-none focus:border-primary-500 min-h-[150px] leading-relaxed"
                  required
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={sending}
                  className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 px-6 rounded-lg text-xs uppercase"
                >
                  {sending ? 'Gönderiliyor...' : 'Kampanyayı Başlat (Broadcast)'}
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Right: Quick Templates Panel */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wider text-gray-400 font-bold">Hızlı Şablonlar</h2>
            <div className="space-y-3">
              <button
                onClick={() => selectTemplate("Hicret Derneği: Eskişehir medresemiz için zekat ve eğitim bursu bağış kabullerimiz başlamıştır. Detaylı bilgi için portalımızı ziyaret edin: e-infak.org")}
                className="w-full text-left p-3 bg-slate-50 border rounded-xl text-xs font-semibold text-gray-700 hover:bg-slate-100 transition-colors"
              >
                🎓 Zekat & Eğitim Bursu Çağrısı
              </button>
              <button
                onClick={() => selectTemplate("Hicret Derneği: Kurban ibadetinizi hisse vekaletiyle medreselerimizdeki talebelerimize ulaştırıyoruz. Hisse bedeli: 11.500 TL. e-infak.org/bagis/kurban")}
                className="w-full text-left p-3 bg-slate-50 border rounded-xl text-xs font-semibold text-gray-700 hover:bg-slate-100 transition-colors"
              >
                🐏 Kurban Vekaleti Çağrısı
              </button>
              <button
                onClick={() => selectTemplate("Hicret Derneği: Afrika Çad su kuyusu projemizin yapımı tamamlanmıştır. Destek veren tüm bağışçılarımıza teşekkür ederiz. Detaylı koordinat ve video portaldadır.")}
                className="w-full text-left p-3 bg-slate-50 border rounded-xl text-xs font-semibold text-gray-700 hover:bg-slate-100 transition-colors"
              >
                ⛲ Su Kuyusu Tamamlandı Teşekkürü
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
