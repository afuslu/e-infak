'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

interface Expense {
  id: string
  title: string
  category: string
  amount_cents: number
  receipt_no: string
  expense_date: string
}

interface Stats {
  total_income_lira: number
  total_expense_lira: number
  balance_lira: number
  category_breakdown_lira: Record<string, number>
}

export default function AdminFinancePage() {
  const [stats, setStats] = useState<Stats>({
    total_income_lira: 0,
    total_expense_lira: 0,
    balance_lira: 0,
    category_breakdown_lira: {}
  })
  const [expenses, setExpenses] = useState<Expense[]>([])
  
  // Form state
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Kira')
  const [amountLira, setAmountLira] = useState('')
  const [receiptNo, setReceiptNo] = useState('')
  
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
      'x-organization-slug': 'hicret-dernegi' // Default context
    }
  }

  const loadData = async () => {
    try {
      const headers = getAuthHeaders()
      const [statsRes, expensesRes] = await Promise.all([
        axios.get(`${API_BASE}/api/v1/finance/stats`, { headers }),
        axios.get(`${API_BASE}/api/v1/finance/expenses`, { headers })
      ])
      setStats(statsRes.data)
      setExpenses(expensesRes.data)
    } catch (err) {
      console.error('Failed to load finance data:', err)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    
    const parsedAmount = Number(amountLira)
    if (!parsedAmount || parsedAmount <= 0) {
      setErrorMsg('Lütfen geçerli bir harcama tutarı giriniz.')
      return
    }
    if (!title || !receiptNo) {
      setErrorMsg('Lütfen zorunlu alanları doldurunuz.')
      return
    }

    setLoading(true)
    try {
      await axios.post(`${API_BASE}/api/v1/finance/expenses`, {
        title,
        category,
        amount_cents: Math.round(parsedAmount * 100),
        receipt_no: receiptNo
      }, {
        headers: getAuthHeaders()
      })
      
      setSuccessMsg('Gider kaydı başarıyla eklendi!')
      setTitle('')
      setAmountLira('')
      setReceiptNo('')
      loadData()
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.response?.data?.detail || 'Gider ekleme işlemi başarısız.')
    } finally {
      setLoading(false)
    }
  }

  const handleExportDerbis = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
      const response = await fetch(`${API_BASE}/api/v1/finance/derbis-export`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-organization-slug': 'hicret-dernegi'
        }
      })
      if (!response.ok) throw new Error('İndirme başarısız.')
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'derbis_bagis_defteri.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      alert('Rapor indirme sırasında hata oluştu.')
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Kasa & Finans Yönetimi</h1>
        <Button 
          onClick={handleExportDerbis}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-5 rounded-lg flex items-center gap-2 shadow-sm text-xs"
        >
          📥 DERBİS Ek-5/A Raporu (Excel/CSV)
        </Button>
      </div>

      {errorMsg && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 font-semibold border border-red-100">
          ⚠️ {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100">
          ✨ {successMsg}
        </div>
      )}

      {/* Stats Summary Grid */}
      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="p-6 border border-gray-100 shadow-sm space-y-1">
          <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider block">Toplam Toplanan Bağış</span>
          <h4 className="text-3xl font-black text-gray-950">{stats.total_income_lira.toLocaleString('tr-TR')} ₺</h4>
        </Card>

        <Card className="p-6 border border-gray-100 shadow-sm space-y-1">
          <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider block">Toplam Kasa Harcaması</span>
          <h4 className="text-3xl font-black text-red-600">{stats.total_expense_lira.toLocaleString('tr-TR')} ₺</h4>
        </Card>

        <Card className="p-6 border border-gray-100 shadow-sm space-y-1">
          <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider block">Net Kasa Bakiyesi</span>
          <h4 className={`text-3xl font-black ${stats.balance_lira >= 0 ? 'text-green-600' : 'text-red-700'}`}>
            {stats.balance_lira.toLocaleString('tr-TR')} ₺
          </h4>
        </Card>
      </div>

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Left side: Add Expense Form */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Yeni Gider Kaydı Girişi</h2>
            <form onSubmit={handleSubmitExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Açıklama / Başlık *</label>
                <input
                  type="text"
                  placeholder="Örn: Medrese Kira Ödemesi"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Kategori *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none bg-white focus:border-primary-500"
                  >
                    <option value="Kira">Kira</option>
                    <option value="Fatura">Fatura</option>
                    <option value="Personel">Personel Maaşı</option>
                    <option value="Yardim">Yardım Dağıtımı</option>
                    <option value="Diger">Diğer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tutar (TL) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Örn: 8500"
                    value={amountLira}
                    onChange={(e) => setAmountLira(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Fatura / Belge Numarası *</label>
                <input
                  type="text"
                  placeholder="Örn: FTR-12345678"
                  value={receiptNo}
                  onChange={(e) => setReceiptNo(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg text-xs uppercase"
              >
                {loading ? 'Kaydediliyor...' : 'Gider Kaydet'}
              </Button>
            </form>
          </Card>
        </div>

        {/* Right side: Expense Breakdown Charts & List */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Kategori Dağılımı</h2>
            <div className="space-y-3">
              {Object.entries(stats.category_breakdown_lira).length === 0 ? (
                <p className="text-xs text-gray-400">Henüz harcama dağılımı bulunmamaktadır.</p>
              ) : (
                Object.entries(stats.category_breakdown_lira).map(([cat, amount]) => {
                  const pct = stats.total_expense_lira > 0 ? (amount / stats.total_expense_lira) * 100 : 0
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex justify-between items-center text-xs font-bold text-gray-700">
                        <span>{cat}</span>
                        <span>{amount.toLocaleString('tr-TR')} ₺ (%{pct.toFixed(1)})</span>
                      </div>
                      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary-600 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Card>

          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Son Harcamalar</h2>
            {expenses.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Kayıtlı harcama bulunmamaktadır.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-600">
                  <thead>
                    <tr className="border-b text-gray-500 uppercase tracking-wider text-[10px] font-bold">
                      <th className="pb-3">Harcama</th>
                      <th className="pb-3">Kategori</th>
                      <th className="pb-3">Belge No</th>
                      <th className="pb-3 text-right">Tutar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {expenses.slice(0, 10).map((exp) => (
                      <tr key={exp.id} className="hover:bg-gray-50/50">
                        <td className="py-3 font-semibold text-gray-900">{exp.title}</td>
                        <td className="py-3">{exp.category}</td>
                        <td className="py-3 font-mono">{exp.receipt_no}</td>
                        <td className="py-3 text-right font-bold text-red-600">
                          -{(exp.amount_cents / 100).toLocaleString('tr-TR')} ₺
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
