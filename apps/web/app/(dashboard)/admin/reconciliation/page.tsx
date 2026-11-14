'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'
import { adminApiBase, adminAuthHeaders } from '../../../../lib/admin-access'
import { PageHeader, TBody, THead, Table, Td, Th, Tr } from '../../../../components/admin/ui'

interface BankTransaction {
  id: string
  external_id: string
  booked_at: string
  amount_cents: number
  currency: string
  sender_name?: string
  description?: string
  status: 'unmatched' | 'matched' | 'ambiguous'
  payment_order_id?: string
}

export default function AdminReconciliationPage() {
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('')
  
  // File upload state
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const API_BASE = adminApiBase()

  const getAuthHeaders = adminAuthHeaders

  const loadTransactions = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const headers = getAuthHeaders()
      const url = filterStatus 
        ? `${API_BASE}/api/v1/admin/reconciliation?status=${filterStatus}`
        : `${API_BASE}/api/v1/admin/reconciliation`
      const res = await axios.get(url, { headers })
      setTransactions(res.data)
    } catch (err: any) {
      console.error('Failed to load reconciliation data:', err)
      setErrorMsg('Banka hesap hareketleri yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus])

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setUploading(true)
    setErrorMsg('')
    setImportResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const headers = getAuthHeaders()
      const res = await axios.post(`${API_BASE}/api/v1/admin/bank-statements/import`, formData, {
        headers: {
          ...headers,
          'Content-Type': 'multipart/form-data',
        },
      })
      setImportResult(res.data)
      setFile(null)
      loadTransactions()
    } catch (err: any) {
      console.error('Failed to import bank statement:', err)
      setErrorMsg(err.response?.data?.detail || 'Banka ekstresi aktarılamadı.')
    } finally {
      setUploading(false)
    }
  }

  const exportCSV = () => {
    if (!transactions.length) return
    const headers = ['Islem No', 'Tarih', 'Gonderen', 'Aciklama', 'Tutar', 'Para Birimi', 'Durum']
    const rows = transactions.map(t => [
      t.external_id,
      new Date(t.booked_at).toLocaleString('tr-TR'),
      `"${(t.sender_name || '').replace(/"/g, '""')}"`,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      (t.amount_cents / 100).toFixed(2),
      t.currency,
      t.status
    ])
    
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `banka_mutabakat_${new Date().toISOString().slice(0,10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Otomatik Banka Mutabakatı" description={<>Havale / EFT ekstrelerini aktarın ve bağışlar ile otomatik eşleştirin</>} actions={<Button onClick={exportCSV} variant="ghost" className="border border-gray-200 text-xs font-bold">
          CSV Dışa Aktar
        </Button>} />

      {errorMsg && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 font-semibold border border-red-100">
          {errorMsg}
        </div>
      )}

      {importResult && (
        <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 font-semibold border border-emerald-100 space-y-1">
          <div>Ekstre Başarıyla Aktarıldı!</div>
          <div className="text-xs text-emerald-700 font-normal">
            Toplam Satır: {importResult.row_count} | Eşleşen/İçe Aktarılan: {importResult.imported_count} | Atlanan: {importResult.skipped_count}
          </div>
        </div>
      )}

      {/* Upload Section */}
      <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Banka Ekstresi Yükle (CSV / XLSX)</h2>
        <form onSubmit={handleFileUpload} className="flex flex-col sm:flex-row gap-4 items-center">
          <input
            type="file"
            accept=".csv, .xlsx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
          />
          <Button
            type="submit"
            disabled={!file || uploading}
            className="w-full sm:w-auto bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs whitespace-nowrap"
          >
            {uploading ? 'Aktarılıyor...' : 'Ekstreyi İçe Aktar'}
          </Button>
        </form>
      </Card>

      {/* Transactions Table Section */}
      <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-3">
          <h2 className="text-lg font-bold text-gray-900">Banka Hareketleri ({transactions.length})</h2>
          
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase">Filtrele:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-gray-200 p-2 text-xs font-bold text-gray-700 outline-none bg-white"
            >
              <option value="">Tüm Hareketler</option>
              <option value="unmatched">Eşleşmedi (unmatched)</option>
              <option value="matched">Eşleşti (matched)</option>
              <option value="ambiguous">Çoklu Aday (ambiguous)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 py-8 text-center animate-pulse">Banka hareketleri yükleniyor...</p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">Herhangi bir banka hareketi bulunamadı.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table inset className="border-collapse">
              <THead>
                <Tr>
                  <Th>Tarih</Th>
                  <Th>İşlem No</Th>
                  <Th>Gönderen</Th>
                  <Th>Açıklama</Th>
                  <Th className="text-right">Tutar</Th>
                  <Th className="text-center">Durum</Th>
                </Tr>
              </THead>
              <TBody>
                {transactions.map((t) => (
                  <Tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                    <Td className="text-gray-600 font-medium whitespace-nowrap">
                      {new Date(t.booked_at).toLocaleString('tr-TR')}
                    </Td>
                    <Td className="font-mono text-[11px] text-gray-500">{t.external_id}</Td>
                    <Td className="font-bold text-gray-800">{t.sender_name || 'Bilinmiyor'}</Td>
                    <Td className="text-gray-600 max-w-xs truncate" title={t.description}>
                      {t.description || '-'}
                    </Td>
                    <Td className="text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                      {(t.amount_cents / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {t.currency}
                    </Td>
                    <Td className="text-center whitespace-nowrap">
                      <span
                        className={`inline-block font-bold px-2.5 py-1 rounded-full text-[10px] ${
                          t.status === 'matched'
                            ? 'bg-green-100 text-green-800'
                            : t.status === 'ambiguous'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {t.status === 'matched' ? '✓ Eşleşti' : t.status === 'ambiguous' ? '⚠ Belirsiz' : '✕ Eşleşmedi'}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}
