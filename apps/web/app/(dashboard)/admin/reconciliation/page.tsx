'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Printer } from 'lucide-react'
import { Card } from '@e-infak/ui'
import {
  apiErrorMessage,
  formatMoney,
  v1Get,
  v1Send,
} from '../../../../lib/admin-access'
import { Notice, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { ExportButtons, PageHeader, StatCard, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'

interface BankTransaction {
  id: string
  external_id: string
  booked_at: string
  amount_cents: number
  currency: string
  sender_name?: string | null
  description?: string | null
  status: 'unmatched' | 'matched' | 'ambiguous' | 'ignored'
  payment_order_id?: string | null
  donation_id?: string | null
  bank_account_id?: string | null
  suggestion?: {
    expense_id?: string
    expense_title?: string
    ignored?: string
    sender?: string | null
    note?: string | null
  }
}

interface Summary {
  total_count: number
  incoming_cents: number
  outgoing_cents: number
  by_status: Record<string, { count: number; amount_cents: number }>
}

interface ImportHistory {
  id: string
  filename: string
  row_count: number
  created_at: string
  counts: Record<string, number>
}

interface PreviewRow {
  external_id: string
  booked_at: string
  amount_cents: number
  currency: string
  sender_name?: string | null
  description?: string | null
}

interface OrderCandidate {
  id: string
  transfer_reference: string | null
  total_cents: number
  currency: string
  donor_email: string | null
  donor_phone: string | null
  created_at: string
}

interface Account {
  id: string
  bank: string
  label: string
  currency: string
}

const STATUS_META: Record<string, [string, string]> = {
  matched: ['✓ Eşleşti', 'bg-green-100 text-green-800'],
  ambiguous: ['⚠ Belirsiz', 'bg-amber-100 text-amber-800'],
  unmatched: ['⏳ Bekliyor', 'bg-red-100 text-red-800'],
  ignored: ['— Yok Sayıldı', 'bg-slate-100 text-slate-600'],
}

const EXPENSE_CATEGORIES = ['Kira', 'Personel', 'Fatura', 'Yardim', 'Banka Masrafi', 'Diger']

export default function AdminReconciliationPage() {
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [imports, setImports] = useState<ImportHistory[]>([])
  const [showImports, setShowImports] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [search, setSearch] = useState('')

  // Upload & preview
  const [file, setFile] = useState<File | null>(null)
  const [bankAccountId, setBankAccountId] = useState('')
  const [previewRows, setPreviewRows] = useState<{ row_count: number; rows: PreviewRow[] } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  // Resolve order modal
  const [resolveTx, setResolveTx] = useState<BankTransaction | null>(null)
  const [candidates, setCandidates] = useState<OrderCandidate[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)

  // Convert outgoing tx to Expense modal
  const [expenseTx, setExpenseTx] = useState<BankTransaction | null>(null)
  const [expenseForm, setExpenseForm] = useState({ title: '', category: 'Diger', receipt_no: '' })
  const [savingExpense, setSavingExpense] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [txRes, sumRes, impRes, accRes] = await Promise.all([
        v1Get<BankTransaction[]>('/admin/reconciliation', filterStatus ? { status: filterStatus } : undefined),
        v1Get<Summary>('/admin/reconciliation/summary'),
        v1Get<ImportHistory[]>('/admin/bank-statements/imports'),
        v1Get<Account[]>('/admin/bank-accounts'),
      ])
      setTransactions(txRes.data)
      setSummary(sumRes.data)
      setImports(impRes.data)
      setAccounts(accRes.data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Banka mutabakat verileri yüklenemedi.') })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus])

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return transactions
    return transactions.filter(
      (t) =>
        (t.sender_name || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.external_id || '').toLowerCase().includes(q),
    )
  }, [transactions, search])

  const submitStatement = async (preview: boolean) => {
    if (!file) return
    setUploading(true)
    setMessage(null)
    const formData = new FormData()
    formData.append('file', file)
    const params = new URLSearchParams()
    if (preview) params.set('preview', 'true')
    if (bankAccountId) params.set('bank_account_id', bankAccountId)
    const qs = params.toString() ? `?${params.toString()}` : ''
    try {
      const res = await v1Send<any>('post', `/admin/bank-statements/import${qs}`, formData)
      if (preview) {
        setPreviewRows({ row_count: res.data.row_count, rows: res.data.rows || [] })
      } else {
        setPreviewRows(null)
        setFile(null)
        const d = res.data
        setMessage({
          type: 'ok',
          text: `Ekstre aktarıldı! Toplam: ${d.row_count}, Yeni: ${d.imported_count}, Atlanan: ${d.skipped_count} (Sipariş: ${d.orders ?? 0}, Önerilen: ${d.suggested ?? 0}, Otomatik Onay: ${d.auto_approved ?? 0}, Yok Sayılan: ${d.ignored ?? 0}).`,
        })
        loadAll()
      }
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Ekstre okunamadı.') })
    } finally {
      setUploading(false)
    }
  }

  const deleteImport = async (imp: ImportHistory) => {
    if (!(await confirmDialog(`"${imp.filename}" ekstresi ve içindeki eşleşmemiş hareketler silinecek. Devam edilsin mi?`))) return
    try {
      await v1Send('delete', `/admin/bank-statements/imports/${imp.id}`)
      setMessage({ type: 'ok', text: `${imp.filename} içe aktarımı geri alındı.` })
      loadAll()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'İçe aktarım geri alınamadı.') })
    }
  }

  const openResolveModal = async (tx: BankTransaction) => {
    setResolveTx(tx)
    setCandidates([])
    setLoadingCandidates(true)
    try {
      const res = await v1Get<OrderCandidate[]>(`/admin/reconciliation/${tx.id}/candidates`)
      setCandidates(res.data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Aday siparişler alınamadı.') })
    } finally {
      setLoadingCandidates(false)
    }
  }

  const resolveWithOrder = async (orderId: string) => {
    if (!resolveTx) return
    try {
      await v1Send('post', `/admin/reconciliation/${resolveTx.id}/resolve?payment_order_id=${orderId}`)
      setResolveTx(null)
      setMessage({ type: 'ok', text: 'Hareket online sipariş ile eşleştirildi ve makbuz oluşturuldu.' })
      loadAll()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Sipariş eşleştirilemedi.') })
    }
  }

  const ignoreTx = async (tx: BankTransaction) => {
    if (!(await confirmDialog({ title: 'Bu hareket yok sayılanlara taşınsın mı?', danger: false }))) return
    try {
      await v1Send('post', `/admin/incoming-transfers/${tx.id}/ignore`)
      loadAll()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const reopenTx = async (tx: BankTransaction) => {
    try {
      await v1Send('post', `/admin/reconciliation/${tx.id}/reopen`)
      setMessage({ type: 'ok', text: 'Hareket tekrar bekleyenlere alındı.' })
      loadAll()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const saveExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expenseTx) return
    setSavingExpense(true)
    try {
      await v1Send('post', `/admin/reconciliation/${expenseTx.id}/to-expense`, expenseForm)
      setExpenseTx(null)
      setMessage({ type: 'ok', text: 'Giden ödeme Kasa & Finans giderlerine kaydedildi.' })
      loadAll()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Gider kaydedilemedi.') })
    } finally {
      setSavingExpense(false)
    }
  }

  const sMatched = summary?.by_status?.matched || { count: 0, amount_cents: 0 }
  const sUnmatched = summary?.by_status?.unmatched || { count: 0, amount_cents: 0 }
  const sAmbiguous = summary?.by_status?.ambiguous || { count: 0, amount_cents: 0 }
  const sIgnored = summary?.by_status?.ignored || { count: 0, amount_cents: 0 }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banka Mutabakatı"
        description={<>CSV, Excel (.xlsx/.xls), SWIFT MT940 ve ISO 20022 CAMT.053 XML ekstrelerini içe aktarın, sipariş veya giderlerle eşleştirin.</>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/gelen-havaleler" className={ghostButton}>Gelen Havaleler</Link>
            <Link href="/admin/banka-hesaplari" className={ghostButton}>Banka Hesapları</Link>
            <button type="button" onClick={() => setShowImports((v) => !v)} className={ghostButton}>
              Ekstre Geçmişi ({imports.length})
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-100">
              <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Yazdır
            </button>
            {filteredTransactions.length > 0 && (
              <ExportButtons
                filename={`banka-mutabakat-${new Date().toISOString().slice(0, 10)}`}
                title="Banka Mutabakat Raporu"
                subtitle={`${filteredTransactions.length} hareket`}
                currencyCols={[4]}
                getData={() => ({
                  headers: ['Tarih', 'İşlem No', 'Gönderen', 'Açıklama', 'Tutar', 'Para Birimi', 'Durum'],
                  rows: filteredTransactions.map((t) => [
                    new Date(t.booked_at).toLocaleString('tr-TR'),
                    t.external_id,
                    t.sender_name || '',
                    t.description || '',
                    t.amount_cents / 100,
                    t.currency,
                    t.status,
                  ]),
                })}
              />
            )}
          </div>
        }
      />

      <Notice message={message} />

      {/* KPI Özet Kartları */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Toplam Hareket"
          value={summary?.total_count ?? transactions.length}
          hint={`Gelen: ${formatMoney(summary?.incoming_cents || 0)}`}
          detail={{
            title: 'Tüm Banka Hareketleri Özeti',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Durum</Th><Th>Adet</Th><Th className="text-right">Tutar</Th></Tr></THead>
                <TBody>
                  <Tr><Td>Eşleşen</Td><Td>{sMatched.count}</Td><Td className="text-right font-mono">{formatMoney(sMatched.amount_cents)}</Td></Tr>
                  <Tr><Td>Bekleyen</Td><Td>{sUnmatched.count}</Td><Td className="text-right font-mono">{formatMoney(sUnmatched.amount_cents)}</Td></Tr>
                  <Tr><Td>Belirsiz / Çoklu Aday</Td><Td>{sAmbiguous.count}</Td><Td className="text-right font-mono">{formatMoney(sAmbiguous.amount_cents)}</Td></Tr>
                  <Tr><Td>Yok Sayılan</Td><Td>{sIgnored.count}</Td><Td className="text-right font-mono">{formatMoney(sIgnored.amount_cents)}</Td></Tr>
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Eşleşti"
          value={sMatched.count}
          hint={formatMoney(sMatched.amount_cents)}
          tone="good"
          detail={{
            title: 'Eşleşen Hareketler',
            size: 'lg',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Tarih</Th><Th>İşlem No</Th><Th>Gönderen</Th><Th className="text-right">Tutar</Th></Tr></THead>
                <TBody>
                  {transactions.filter((t) => t.status === 'matched').map((t) => (
                    <Tr key={t.id}>
                      <Td>{new Date(t.booked_at).toLocaleDateString('tr-TR')}</Td>
                      <Td className="font-mono text-xs">{t.external_id}</Td>
                      <Td>{t.sender_name || '—'}</Td>
                      <Td className="text-right font-mono">{formatMoney(t.amount_cents, t.currency)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Bekleyen"
          value={sUnmatched.count}
          hint={formatMoney(sUnmatched.amount_cents)}
          tone="bad"
          detail={{
            title: 'Eşleşmeyen Bekleyen Hareketler',
            size: 'lg',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Tarih</Th><Th>Gönderen</Th><Th>Açıklama</Th><Th className="text-right">Tutar</Th></Tr></THead>
                <TBody>
                  {transactions.filter((t) => t.status === 'unmatched').map((t) => (
                    <Tr key={t.id}>
                      <Td>{new Date(t.booked_at).toLocaleDateString('tr-TR')}</Td>
                      <Td>{t.sender_name || '—'}</Td>
                      <Td>{t.description || ''}</Td>
                      <Td className="text-right font-mono">{formatMoney(t.amount_cents, t.currency)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Belirsiz Aday"
          value={sAmbiguous.count}
          hint={formatMoney(sAmbiguous.amount_cents)}
          tone="warn"
          detail={{
            title: 'Çoklu Sipariş Adayı Olan Hareketler',
            size: 'lg',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Tarih</Th><Th>Gönderen</Th><Th>Açıklama</Th><Th className="text-right">Tutar</Th></Tr></THead>
                <TBody>
                  {transactions.filter((t) => t.status === 'ambiguous').map((t) => (
                    <Tr key={t.id}>
                      <Td>{new Date(t.booked_at).toLocaleDateString('tr-TR')}</Td>
                      <Td>{t.sender_name || '—'}</Td>
                      <Td>{t.description || ''}</Td>
                      <Td className="text-right font-mono">{formatMoney(t.amount_cents, t.currency)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Yok Sayılan / Giden"
          value={sIgnored.count}
          hint={`Giden: ${formatMoney(Math.abs(summary?.outgoing_cents || 0))}`}
          detail={{
            title: 'Yok Sayılan & Giden Hareketler',
            size: 'lg',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Tarih</Th><Th>Açıklama</Th><Th className="text-right">Tutar</Th></Tr></THead>
                <TBody>
                  {transactions.filter((t) => t.status === 'ignored' || t.amount_cents < 0).map((t) => (
                    <Tr key={t.id}>
                      <Td>{new Date(t.booked_at).toLocaleDateString('tr-TR')}</Td>
                      <Td>{t.description || t.sender_name || '—'}</Td>
                      <Td className="text-right font-mono">{formatMoney(t.amount_cents, t.currency)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ),
          }}
        />
      </div>

      {/* Ekstre Geçmişi */}
      {showImports && (
        <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Son Yüklenen Ekstreler</h2>
            <button type="button" onClick={() => setShowImports(false)} className="text-xs font-bold text-gray-500 hover:text-gray-800">Kapat</button>
          </div>
          {imports.length === 0 ? (
            <p className="text-xs text-gray-400">Henüz ekstre yüklenmemiş.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table inset>
                <THead className="bg-gray-50">
                  <Tr>
                    <Th>Dosya</Th>
                    <Th>Tarih</Th>
                    <Th>Satır</Th>
                    <Th>Durum Dağılımı</Th>
                    <Th />
                  </Tr>
                </THead>
                <TBody>
                  {imports.map((imp) => (
                    <Tr key={imp.id}>
                      <Td className="font-semibold text-gray-800">{imp.filename}</Td>
                      <Td className="text-gray-500 whitespace-nowrap">{new Date(imp.created_at).toLocaleString('tr-TR')}</Td>
                      <Td>{imp.row_count}</Td>
                      <Td className="text-xs text-gray-600">
                        Eşleşen: {imp.counts.matched || 0} · Bekleyen: {imp.counts.unmatched || 0} · Yok sayılan: {imp.counts.ignored || 0}
                      </Td>
                      <Td className="text-right">
                        <button
                          type="button"
                          onClick={() => deleteImport(imp)}
                          disabled={(imp.counts.matched || 0) > 0}
                          title={(imp.counts.matched || 0) > 0 ? 'Eşleşmiş hareket içeren ekstre silinemez' : 'Ekstreyi geri al'}
                          className={`${ghostButton} text-red-600 disabled:opacity-40`}
                        >
                          Geri Al
                        </button>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </Card>
      )}

      {/* Ekstre Yükleme ve Önizleme */}
      <Card className="space-y-4 border border-gray-100 p-5 shadow-sm">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Banka Ekstresi Yükle (CSV / Excel / MT940 / CAMT.053 XML)</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Banka internet şubesinden aldığınız CSV (UTF-8 veya Windows-1254), XLSX/XLS, SWIFT MT940 (.sta/.mt940) veya ISO 20022 CAMT.053 (.xml) dosyalarını yükleyin.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className={`${inputClass} sm:w-64`}>
            <option value="">Banka hesabı seçin (isteğe bağlı)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.bank} · {a.label}</option>
            ))}
          </select>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.sta,.mt940,.mt,.xml"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null)
              setPreviewRows(null)
            }}
            className="block w-full text-xs text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-xs file:font-bold file:text-primary-700 hover:file:bg-primary-100"
          />
          <div className="flex gap-2 whitespace-nowrap">
            <button type="button" disabled={!file || uploading} onClick={() => submitStatement(true)} className={ghostButton}>
              Önizle
            </button>
            <button type="button" disabled={!file || uploading} onClick={() => submitStatement(false)} className={primaryButton}>
              {uploading ? 'Aktarılıyor…' : 'İçe Aktar'}
            </button>
          </div>
        </div>

        {previewRows && (
          <div className="space-y-2 rounded-xl border border-primary-100 bg-primary-50/40 p-4">
            <div className="flex items-center justify-between text-xs font-bold text-primary-900">
              <span>Önizleme: Toplam {previewRows.row_count} satır okundu (ilk {previewRows.rows.length} satır gösteriliyor)</span>
              <button type="button" onClick={() => setPreviewRows(null)} className="text-gray-500 hover:text-gray-800">Kapat</button>
            </div>
            <div className="max-h-64 overflow-auto rounded-lg border bg-white">
              <Table inset>
                <THead className="bg-gray-50">
                  <Tr>
                    <Th>Tarih</Th>
                    <Th>Gönderen</Th>
                    <Th>Açıklama</Th>
                    <Th className="text-right">Tutar</Th>
                  </Tr>
                </THead>
                <TBody>
                  {previewRows.rows.map((r, i) => (
                    <Tr key={i}>
                      <Td className="whitespace-nowrap text-xs">{new Date(r.booked_at).toLocaleDateString('tr-TR')}</Td>
                      <Td className="text-xs font-semibold">{r.sender_name || '—'}</Td>
                      <Td className="max-w-xs truncate text-xs text-gray-600">{r.description || '—'}</Td>
                      <Td className={`whitespace-nowrap text-right font-mono text-xs font-bold ${r.amount_cents < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {formatMoney(r.amount_cents, r.currency)}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        )}
      </Card>

      {/* Hareketler Tablosu */}
      <Card id="mutabakat-printable" className="space-y-4 border border-gray-100 p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b pb-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">
            {[
              ['', 'Tümü'],
              ['unmatched', 'Bekleyenler'],
              ['ambiguous', 'Belirsiz Aday'],
              ['matched', 'Eşleşenler'],
              ['ignored', 'Yok Sayılanlar'],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setFilterStatus(val)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${filterStatus === val ? 'bg-primary-600 text-white' : 'border bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Gönderen, açıklama veya işlem no ara…"
            className={`${inputClass} sm:w-72`}
          />
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-400 animate-pulse">Banka hareketleri yükleniyor…</p>
        ) : filteredTransactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Kayıt bulunamadı.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table inset>
              <THead className="bg-gray-50">
                <Tr>
                  <Th>Tarih</Th>
                  <Th>İşlem No</Th>
                  <Th>Gönderen</Th>
                  <Th>Açıklama</Th>
                  <Th className="text-right">Tutar</Th>
                  <Th className="text-center">Durum</Th>
                  <Th className="text-right">İşlemler</Th>
                </Tr>
              </THead>
              <TBody>
                {filteredTransactions.map((t) => {
                  const [badgeLabel, badgeCls] = STATUS_META[t.status] || [t.status, 'bg-gray-100 text-gray-700']
                  return (
                    <Tr key={t.id} className="hover:bg-gray-50/60">
                      <Td className="whitespace-nowrap text-gray-600">{new Date(t.booked_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</Td>
                      <Td className="font-mono text-[11px] text-gray-500">{t.external_id}</Td>
                      <Td className="font-bold text-gray-800">{t.sender_name || t.suggestion?.sender || 'Bilinmiyor'}</Td>
                      <Td className="max-w-xs truncate text-gray-600" title={t.description || ''}>
                        {t.description || '—'}
                        {t.suggestion?.expense_title && (
                          <div className="text-[11px] font-semibold text-indigo-700">Gider: {t.suggestion.expense_title}</div>
                        )}
                      </Td>
                      <Td className={`whitespace-nowrap text-right font-mono font-bold ${t.amount_cents < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatMoney(t.amount_cents, t.currency)}
                      </Td>
                      <Td className="whitespace-nowrap text-center">
                        <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold ${badgeCls}`}>
                          {badgeLabel}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1.5">
                          {(t.status === 'unmatched' || t.status === 'ambiguous') && t.amount_cents > 0 && (
                            <>
                              <button type="button" onClick={() => openResolveModal(t)} className={ghostButton}>
                                Sipariş Eşleştir
                              </button>
                              <Link href="/admin/gelen-havaleler" className={ghostButton}>
                                Bağışa Dönüştür
                              </Link>
                              <button type="button" onClick={() => ignoreTx(t)} className={ghostButton}>
                                Yok Say
                              </button>
                            </>
                          )}
                          {t.status !== 'matched' && t.amount_cents < 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setExpenseTx(t)
                                setExpenseForm({
                                  title: (t.description || t.sender_name || 'Banka Ödemesi').slice(0, 120),
                                  category: 'Diger',
                                  receipt_no: t.external_id.slice(0, 50),
                                })
                              }}
                              className={ghostButton}
                            >
                              Gider Kaydet
                            </button>
                          )}
                          {t.status === 'ignored' && (
                            <button type="button" onClick={() => reopenTx(t)} className={ghostButton}>
                              Bekleyene Al
                            </button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Sipariş Eşleştirme Modalı */}
      {resolveTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setResolveTx(null)}>
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">Online Sipariş ile Eşleştir</h3>
                <p className="text-xs text-gray-500">
                  {resolveTx.sender_name || '—'} · <b>{formatMoney(resolveTx.amount_cents, resolveTx.currency)}</b>
                </p>
              </div>
              <button type="button" onClick={() => setResolveTx(null)} className="text-xl text-gray-400 hover:text-gray-700">×</button>
            </div>
            {loadingCandidates ? (
              <p className="py-6 text-center text-xs text-gray-400">Aday siparişler aranıyor…</p>
            ) : candidates.length === 0 ? (
              <p className="rounded-lg bg-gray-50 p-4 text-center text-xs text-gray-500">
                Bu tutarda bekleyen havale siparişi bulunamadı. Bağış olarak kaydetmek için{' '}
                <Link href="/admin/gelen-havaleler" className="font-bold text-primary-700 underline">Gelen Havaleler</Link> sayfasını kullanabilirsiniz.
              </p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {candidates.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-xs">
                    <div>
                      <div className="font-bold text-gray-900">Kod: {c.transfer_reference || c.id.slice(0, 8)}</div>
                      <div className="text-gray-500">{c.donor_email || c.donor_phone || 'İletişim yok'} · {new Date(c.created_at).toLocaleString('tr-TR')}</div>
                    </div>
                    <button type="button" onClick={() => resolveWithOrder(c.id)} className={primaryButton}>
                      Eşleştir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Giden Ödeme -> Gider Modalı */}
      {expenseTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setExpenseTx(null)}>
          <form onSubmit={saveExpense} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">Kasa &amp; Finans Gideri Olarak Kaydet</h3>
                <p className="text-xs text-gray-500">Tutar: <b className="text-red-600">{formatMoney(Math.abs(expenseTx.amount_cents), expenseTx.currency)}</b></p>
              </div>
              <button type="button" onClick={() => setExpenseTx(null)} className="text-xl text-gray-400 hover:text-gray-700">×</button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-700">Gider Başlığı</label>
              <input
                required
                value={expenseForm.title}
                onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-700">Kategori</label>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className={inputClass}
                >
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-700">Belge / Dekont No</label>
                <input
                  value={expenseForm.receipt_no}
                  onChange={(e) => setExpenseForm({ ...expenseForm, receipt_no: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setExpenseTx(null)} className={ghostButton}>Vazgeç</button>
              <button type="submit" disabled={savingExpense} className={primaryButton}>
                {savingExpense ? 'Kaydediliyor…' : 'Gider Olarak Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
