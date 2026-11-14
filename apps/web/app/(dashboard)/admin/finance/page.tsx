'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'
import { Banknote, Download, Pencil, Trash2, TrendingDown, Wallet } from 'lucide-react'
import { Modal, PageHeader, StatCard, TBody, THead, Table, Td, Th, Tr, confirmDialog, toast } from '../../../../components/admin/ui'
import { adminApiBase, adminAuthHeaders, exportCsv, formatMoney } from '../../../../lib/admin-access'

interface Expense {
  id: string
  title: string
  category: string
  amount_cents: number
  currency?: string
  receipt_no: string
  expense_date: string
}

const CATEGORIES = ['Kira', 'Fatura', 'Personel', 'Yardım', 'Diğer']
const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'CHF']

interface Stats {
  total_income_lira: number
  total_expense_lira: number
  balance_lira: number
  category_breakdown_lira: Record<string, number>
}

interface BankTransaction {
  id: string
  booked_at: string
  amount_cents: number
  currency: string
  sender_name?: string
  description?: string
  status: 'unmatched' | 'matched' | 'ambiguous' | 'ignored'
}

export default function AdminFinancePage() {
  const [stats, setStats] = useState<Stats>({
    total_income_lira: 0,
    total_expense_lira: 0,
    balance_lira: 0,
    category_breakdown_lira: {}
  })
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([])
  const [statementFile, setStatementFile] = useState<File | null>(null)
  
  // Form state
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Kira')
  const [amountLira, setAmountLira] = useState('')
  const [currency, setCurrency] = useState('TRY')
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [receiptNo, setReceiptNo] = useState('')

  // Filters & pagination
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20
  
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [editingExpense, setEditingExpense] = useState<{ id: string; title: string; category: string; amountLira: string; currency: string; receiptNo: string; expenseDate: string } | null>(null)

  const API_BASE = adminApiBase()

  const getAuthHeaders = adminAuthHeaders

  const loadData = async () => {
    try {
      const headers = getAuthHeaders()
      const [statsRes, expensesRes, reconciliationRes] = await Promise.all([
        axios.get(`${API_BASE}/api/v1/finance/stats`, { headers }),
        axios.get(`${API_BASE}/api/v1/finance/expenses`, { headers }),
        axios.get(`${API_BASE}/api/v1/admin/reconciliation`, { headers })
      ])
      setStats(statsRes.data)
      setExpenses(expensesRes.data)
      setBankTransactions(reconciliationRes.data)
    } catch (err) {
      console.error('Failed to load finance data:', err)
    }
  }

  const handleStatementImport = async () => {
    if (!statementFile) return
    setLoading(true)
    setErrorMsg('')
    try {
      const form = new FormData()
      form.append('file', statementFile)
      const response = await axios.post(`${API_BASE}/api/v1/admin/bank-statements/import`, form, {
        headers: getAuthHeaders(),
      })
      setSuccessMsg(`${response.data.imported_count} hareket içe aktarıldı; ${response.data.skipped_count} tekrar kayıt atlandı.`)
      setStatementFile(null)
      await loadData()
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Ekstre içe aktarılamadı.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        currency,
        receipt_no: receiptNo,
        expense_date: expenseDate ? new Date(`${expenseDate}T12:00:00`).toISOString() : undefined,
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

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingExpense) return
    const parsedAmount = Number(editingExpense.amountLira)
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error('Geçerli bir harcama tutarı giriniz.')
      return
    }
    try {
      await axios.put(
        `${API_BASE}/api/v1/finance/expenses/${editingExpense.id}`,
        {
          title: editingExpense.title,
          category: editingExpense.category,
          amount_cents: Math.round(parsedAmount * 100),
          currency: editingExpense.currency || 'TRY',
          receipt_no: editingExpense.receiptNo,
          expense_date: editingExpense.expenseDate ? new Date(`${editingExpense.expenseDate}T12:00:00`).toISOString() : undefined,
        },
        { headers: getAuthHeaders() },
      )
      toast.ok('Harcama kaydı güncellendi')
      setEditingExpense(null)
      await loadData()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Harcama güncellenemedi')
    }
  }

  const handleDeleteExpense = async (exp: Expense) => {
    if (!(await confirmDialog(`${exp.title} (${(exp.amount_cents / 100).toLocaleString('tr-TR')} ₺) harcaması silinsin mi?`))) return
    try {
      await axios.delete(`${API_BASE}/api/v1/finance/expenses/${exp.id}`, { headers: getAuthHeaders() })
      toast.ok('Harcama kaydı silindi')
      await loadData()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Harcama silinemedi')
    }
  }

  const handleExportDerbis = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
      const response = await fetch(`${API_BASE}/api/v1/finance/derbis-export`, {
        headers: {
          'Authorization': `Bearer ${token}`,
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
      toast.error('Rapor indirme sırasında hata oluştu.')
    }
  }

  const filteredExpenses = expenses.filter((ex) => {
    if (filterCat && ex.category !== filterCat) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return ex.title.toLowerCase().includes(q) || ex.receipt_no.toLowerCase().includes(q) || ex.category.toLowerCase().includes(q)
  })
  const pageExpenses = filteredExpenses.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Kasa & Finans Yönetimi"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/muhasebe" className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">
              Muhasebe Modülü →
            </Link>
            <button type="button" onClick={() => window.print()} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">
              🖨️ Yazdır / PDF
            </button>
            <Button
              onClick={handleExportDerbis}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-5 rounded-lg flex items-center gap-2 shadow-sm text-xs"
            >
              DERBİS Ek-5/A Raporu (Excel/CSV)
            </Button>
          </div>
        }
      />

      {errorMsg && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 font-semibold border border-red-100">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100">
          {successMsg}
        </div>
      )}

      {/* Stats Summary Grid */}
      <div className="grid gap-6 sm:grid-cols-3">
        <StatCard
          label="Toplam Toplanan Bağış"
          icon={Banknote}
          value={`${stats.total_income_lira.toLocaleString('tr-TR')} ₺`}
          detail={{
            title: 'Banka Mutabakat Hareketleri',
            description: `Toplam ${bankTransactions.length} banka mutabakat kaydı`,
            content: () => (
              <div className="space-y-4">
                <Table>
                  <THead>
                    <Tr><Th>Tarih</Th><Th>Açıklama</Th><Th className="text-right">Tutar</Th><Th className="text-right">Durum</Th></Tr>
                  </THead>
                  <TBody>
                    {bankTransactions.slice(0, 50).map((b: any, i: number) => (
                      <Tr key={b.id || i}>
                        <Td className="whitespace-nowrap text-xs">{b.booked_at ? new Date(b.booked_at).toLocaleDateString('tr-TR') : '—'}</Td>
                        <Td className="max-w-xs truncate text-xs">{b.description || b.sender_name || '—'}</Td>
                        <Td className="text-right font-semibold tabular-nums">{formatMoney(b.amount_cents || 0, b.currency || 'TRY')}</Td>
                        <Td className="text-right text-xs">{b.status === 'matched' ? 'Eşleşti' : 'Bekliyor'}</Td>
                      </Tr>
                    ))}
                    {bankTransactions.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Banka hareketi yok.</Td></Tr>}
                  </TBody>
                </Table>
                <div className="flex justify-end">
                  <Link href="/admin/makbuzlar" className="text-xs font-bold text-primary-700 hover:underline">Tüm makbuzlara git →</Link>
                </div>
              </div>
            ),
          }}
        />

        <StatCard
          label="Toplam Kasa Harcaması"
          icon={TrendingDown}
          tone="bad"
          value={`${stats.total_expense_lira.toLocaleString('tr-TR')} ₺`}
          detail={{
            title: 'Kasa Harcama Kalemleri',
            description: `Toplam ${expenses.length} harcama kaydı`,
            content: () => (
              <Table>
                <THead>
                  <Tr><Th>Tarih</Th><Th>Başlık</Th><Th>Kategori</Th><Th>Fiş No</Th><Th className="text-right">Tutar</Th></Tr>
                </THead>
                <TBody>
                  {expenses.map((ex) => (
                    <Tr key={ex.id}>
                      <Td className="whitespace-nowrap text-xs">{new Date(ex.expense_date).toLocaleDateString('tr-TR')}</Td>
                      <Td className="font-semibold">{ex.title}</Td>
                      <Td className="text-xs text-gray-500">{ex.category}</Td>
                      <Td className="font-mono text-xs text-gray-500">{ex.receipt_no}</Td>
                      <Td className="text-right font-bold tabular-nums text-red-600">{(ex.amount_cents / 100).toLocaleString('tr-TR')} ₺</Td>
                    </Tr>
                  ))}
                  {expenses.length === 0 && <Tr><Td colSpan={5} className="text-center text-gray-400">Harcama kaydı yok.</Td></Tr>}
                </TBody>
              </Table>
            ),
          }}
        />

        <StatCard
          label="Net Kasa Bakiyesi"
          icon={Wallet}
          tone={stats.balance_lira >= 0 ? 'good' : 'bad'}
          value={`${stats.balance_lira.toLocaleString('tr-TR')} ₺`}
          detail={{
            title: 'Kasa Gelir & Gider Özeti',
            size: 'md',
            content: () => (
              <Table>
                <THead>
                  <Tr><Th>Kalem</Th><Th className="text-right">Tutar</Th></Tr>
                </THead>
                <TBody>
                  <Tr><Td className="font-semibold">Toplam Toplanan Bağış</Td><Td className="text-right font-bold tabular-nums text-green-700">+{stats.total_income_lira.toLocaleString('tr-TR')} ₺</Td></Tr>
                  <Tr><Td className="font-semibold">Toplam Kasa Harcaması ({expenses.length} kayıt)</Td><Td className="text-right font-bold tabular-nums text-red-600">-{stats.total_expense_lira.toLocaleString('tr-TR')} ₺</Td></Tr>
                  <Tr><Td className="font-bold">Net Kasa Bakiyesi</Td><Td className={`text-right font-black tabular-nums ${stats.balance_lira >= 0 ? 'text-green-700' : 'text-red-700'}`}>{stats.balance_lira.toLocaleString('tr-TR')} ₺</Td></Tr>
                </TBody>
              </Table>
            ),
          }}
        />
      </div>

      <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Hızlı Banka Ekstresi Yükle</h2>
            <p className="mt-1 text-xs text-gray-500">
              CSV, XLSX, MT940 ve CAMT.053 dosyaları SHA-256 ile tekrar yüklemeye karşı korunur.{' '}
              <Link href="/admin/reconciliation" className="font-semibold text-primary-700 hover:underline">
                Banka Mutabakatına Git →
              </Link>
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input aria-label="Banka ekstresi" type="file" accept=".csv,.xlsx,.xls,.sta,.mt940,.mt,.xml" onChange={(e) => setStatementFile(e.target.files?.[0] || null)}
              className="rounded-lg border p-2 text-xs" />
            <Button type="button" onClick={handleStatementImport} disabled={!statementFile || loading}
              className="bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
              Ekstreyi İçe Aktar
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(['matched', 'unmatched', 'ambiguous'] as const).map((status) => (
            <div key={status} className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">{status === 'matched' ? 'Eşleşen' : status === 'unmatched' ? 'Bekleyen' : 'İncelenecek'}</p>
              <p className="mt-1 text-2xl font-black">{bankTransactions.filter((item) => item.status === status).length}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Left side: Add Expense Form */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Yeni Gider Kaydı Girişi</h2>
            <form onSubmit={handleSubmitExpense} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-600">Açıklama / Başlık *</label>
                <input
                  type="text"
                  placeholder="Örn: Medrese Kira Ödemesi"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-600">Kategori *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none bg-white focus:border-primary-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-600">Tutar & Para Birimi *</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Örn: 8500"
                      value={amountLira}
                      onChange={(e) => setAmountLira(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500"
                      required
                    />
                    <select
                      aria-label="Para birimi"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="rounded-lg border border-gray-300 bg-white px-2.5 py-2.5 text-sm font-semibold outline-none focus:border-primary-500"
                    >
                      {CURRENCIES.map((cur) => (
                        <option key={cur} value={cur}>{cur}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-600">Harcama Tarihi</label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-gray-600">Fatura / Belge Numarası *</label>
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
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg text-xs"
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <h2 className="text-lg font-bold text-gray-900">Son Harcamalar ({filteredExpenses.length})</h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Ara (ad, belge no)..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs outline-none focus:border-primary-500"
                />
                <select
                  aria-label="Kategori filtresi"
                  value={filterCat}
                  onChange={(e) => { setFilterCat(e.target.value); setPage(1); }}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-primary-500"
                >
                  <option value="">Tüm Kategoriler</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {filteredExpenses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => exportCsv('kasa-harcamalari.csv', ['Tarih', 'Harcama', 'Kategori', 'Belge No', 'Para Birimi', 'Tutar'],
                      filteredExpenses.map((ex) => [new Date(ex.expense_date).toLocaleDateString('tr-TR'), ex.title, ex.category, ex.receipt_no, ex.currency || 'TRY', ex.amount_cents / 100]))}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-3.5 w-3.5" /> CSV
                  </button>
                )}
              </div>
            </div>
            {filteredExpenses.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Kayıtlı harcama bulunmamaktadır.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Tarih</Th>
                        <Th>Harcama</Th>
                        <Th>Kategori</Th>
                        <Th>Belge No</Th>
                        <Th className="text-right">Tutar</Th>
                        <Th className="text-right">İşlem</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {pageExpenses.map((exp) => (
                        <Tr key={exp.id} className="hover:bg-gray-50/50">
                          <Td className="whitespace-nowrap text-xs text-gray-500">
                            {exp.expense_date ? new Date(exp.expense_date).toLocaleDateString('tr-TR') : '—'}
                          </Td>
                          <Td className="font-semibold text-gray-900">{exp.title}</Td>
                          <Td>{exp.category}</Td>
                          <Td className="font-mono text-xs">{exp.receipt_no}</Td>
                          <Td className="text-right font-bold text-red-600 tabular-nums">
                            -{formatMoney(exp.amount_cents, exp.currency || 'TRY')}
                          </Td>
                          <Td className="text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                title="Düzenle"
                                onClick={() => setEditingExpense({
                                  id: exp.id,
                                  title: exp.title,
                                  category: exp.category,
                                  amountLira: String(exp.amount_cents / 100),
                                  currency: exp.currency || 'TRY',
                                  receiptNo: exp.receipt_no,
                                  expenseDate: exp.expense_date ? exp.expense_date.slice(0, 10) : '',
                                })}
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-primary-700"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            <button
                              type="button"
                              title="Sil"
                              onClick={() => handleDeleteExpense(exp)}
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
              {filteredExpenses.length > PAGE_SIZE && (
                <div className="flex items-center justify-between pt-2 text-xs text-gray-500">
                  <span>
                    Sayfa {page} / {Math.ceil(filteredExpenses.length / PAGE_SIZE)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Önceki
                    </button>
                    <button
                      type="button"
                      disabled={page >= Math.ceil(filteredExpenses.length / PAGE_SIZE)}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Sonraki
                    </button>
                  </div>
                </div>
              )}
            </>
            )}
          </Card>
        </div>
      </div>

      {editingExpense && (
        <Modal title="Harcamayı Düzenle" size="sm" onClose={() => setEditingExpense(null)}>
          <form onSubmit={handleUpdateExpense} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-700">Harcama Adı</label>
              <input required value={editingExpense.title} onChange={(e) => setEditingExpense({ ...editingExpense, title: e.target.value })}
                className="w-full rounded-lg border border-gray-300 p-2 text-xs outline-none focus:border-primary-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-700">Kategori</label>
                <select value={editingExpense.category} onChange={(e) => setEditingExpense({ ...editingExpense, category: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white p-2 text-xs outline-none focus:border-primary-500">
                  {!CATEGORIES.includes(editingExpense.category as any) && (
                    <option value={editingExpense.category}>{editingExpense.category}</option>
                  )}
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-700">Harcama Tarihi</label>
                <input type="date" value={editingExpense.expenseDate}
                  onChange={(e) => setEditingExpense({ ...editingExpense, expenseDate: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 p-2 text-xs outline-none focus:border-primary-500" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-700">Tutar</label>
                <input required type="number" step="0.01" value={editingExpense.amountLira}
                  onChange={(e) => setEditingExpense({ ...editingExpense, amountLira: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 p-2 text-xs outline-none focus:border-primary-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-700">Para Birimi</label>
                <select value={editingExpense.currency}
                  onChange={(e) => setEditingExpense({ ...editingExpense, currency: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white p-2 text-xs outline-none focus:border-primary-500">
                  {CURRENCIES.map((cur) => (
                    <option key={cur} value={cur}>{cur}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-700">Belge No</label>
                <input required value={editingExpense.receiptNo}
                  onChange={(e) => setEditingExpense({ ...editingExpense, receiptNo: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 p-2 text-xs outline-none focus:border-primary-500" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setEditingExpense(null)} className="text-xs">Vazgeç</Button>
              <Button type="submit" className="bg-primary-600 text-xs font-bold text-white hover:bg-primary-700">Kaydet</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
