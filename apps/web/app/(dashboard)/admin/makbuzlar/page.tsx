'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Download } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, exportCsv, formatMoney, hasPermission, useAdminAccess, adminApiBase, adminAuthHeaders } from '../../../../lib/admin-access'
import { ManualReceiptForm, downloadReceiptPdf } from '../../../../components/admin/ManualReceiptForm'
import { QuickSmsDialog, SmsStatusPill, loadRelatedSms, sentNotice } from '../../../../components/admin/QuickSmsDialog'
import { RelatedSms } from '../../../../lib/sms'
import { PageHeader, TBody, THead, Table, Td, Th, Tr, toast } from '../../../../components/admin/ui'

interface Donation {
  id: string
  receipt_number: string
  official_receipt_no?: string | null
  amount_cents: number
  currency: string
  status: string
  payment_method_label: string
  is_manual: boolean
  donor_name: string
  campaign_id?: string | null
  donor_id?: string | null
  on_behalf_of: string | null
  paid_at: string
}

interface ReceiptDetail {
  receipt_number: string
  official_receipt_no?: string | null
  verification_hash: string
  verify_url: string
  status: string
  donor_name: string
  amount_lira: number
  payment_method: string
}

export default function AdminReceiptsPage() {
  const [donations, setDonations] = useState<Donation[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [receiptDetail, setReceiptDetail] = useState<ReceiptDetail | null>(null)
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [notice, setNotice] = useState('')
  const [sms, setSms] = useState<Record<string, RelatedSms>>({})
  const [smsFor, setSmsFor] = useState<Donation | null>(null)
  const { data: access } = useAdminAccess()
  const canIssue = hasPermission(access, 'finance_manage')
  const canSms = hasPermission(access, 'donor_manage')

  const API_BASE = adminApiBase()

  const getAuthHeaders = adminAuthHeaders

  const loadDonations = async () => {
    setLoading(true)
    try {
      const res = await adminGet<{ items: Donation[] }>('/donations', {
        status: 'confirmed', q: searchQuery || undefined, page_size: 100,
      })
      setDonations(res.data.items)
      setSms(await loadRelatedSms('donation', res.data.items.map((d) => d.id)))
    } catch (err) {
      console.error('Failed to load donations:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(loadDonations, 300)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const viewReceipt = async (donationId: string) => {
    setReceiptLoadingId(donationId)
    setReceiptDetail(null)
    try {
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/donations/${donationId}/receipt`, { headers: getAuthHeaders() })
      setReceiptDetail(res.data)
    } catch (err) {
      console.error('Failed to load receipt:', err)
      toast.error('Makbuz bilgisi alınamadı.')
    } finally {
      setReceiptLoadingId(null)
    }
  }

  const filteredDonations = donations

  return (
    <div className="space-y-8">
      <PageHeader title="Makbuzlar" actions={<div className="flex gap-2">
          <button
            onClick={loadDonations}
            className="text-xs font-bold text-primary-600 hover:text-primary-700 bg-white border px-3 py-1.5 rounded-lg shadow-sm"
          >
            Yenile
          </button>
          {canIssue && (
            <button onClick={() => setShowManual((v) => !v)} className="text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-lg shadow-sm">
              {showManual ? 'Vazgeç' : '+ Elle Makbuz Kes'}
            </button>
          )}
        </div>} />

      {smsFor && (
        <QuickSmsDialog
          title="Hızlı SMS Gönder — Makbuz"
          eventKey="makbuz"
          campaignId={smsFor.campaign_id}
          target={{ donationId: smsFor.id, name: smsFor.donor_name }}
          onClose={() => setSmsFor(null)}
          onSent={(r) => { setNotice(sentNotice(r)); loadDonations() }}
        />
      )}

      {notice && <div className="rounded-lg border border-green-100 bg-green-50 p-3 text-sm font-semibold text-green-700">{notice}</div>}

      {showManual && (
        <Card className="p-6 border border-primary-100 shadow-sm">
          <ManualReceiptForm onDone={(r) => {
            setShowManual(false)
            setNotice(`${r.receipt_number} numaralı makbuz kesildi${r.official_receipt_no ? ` (matbu: ${r.official_receipt_no})` : ''}`)
            loadDonations()
          }} />
        </Card>
      )}

      {receiptDetail && (
        <Card className="p-6 border-2 border-primary-200 shadow-sm space-y-3 bg-primary-50/40">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Makbuz Doğrulama</div>
              <div className="text-2xl font-black text-gray-900">{receiptDetail.receipt_number}</div>
            </div>
            <button onClick={() => setReceiptDetail(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm pt-2 border-t">
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase">Bağışçı</div>
              <div className="font-semibold text-gray-800">{receiptDetail.donor_name}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase">Tutar</div>
              <div className="font-semibold text-gray-800">{receiptDetail.amount_lira.toLocaleString('tr-TR')} ₺</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase">Ödeme</div>
              <div className="font-semibold text-gray-800">{receiptDetail.payment_method}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase">Doğrulama Kodu</div>
              <div className="font-mono text-xs text-gray-600">{receiptDetail.verification_hash}</div>
            </div>
          </div>
          <a href={receiptDetail.verify_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-primary-600 hover:underline">
            Genel doğrulama sayfasını görüntüle ↗
          </a>
        </Card>
      )}

      <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <input
            type="text"
            placeholder="Makbuz no, bağışçı adı veya telefon ile ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500"
          />
          {donations.length > 0 && (
            <button
              type="button"
              onClick={() => exportCsv('makbuzlar.csv', ['Makbuz No', 'Matbu No', 'Bağışçı', 'Kimin Adına', 'Ödeme Yöntemi', 'Tutar', 'Para Birimi', 'Durum', 'Tarih'],
                donations.map((d) => [d.receipt_number, d.official_receipt_no || '', d.donor_name, d.on_behalf_of || '', d.payment_method_label, d.amount_cents / 100, d.currency, d.status, d.paid_at ? new Date(d.paid_at).toLocaleDateString('tr-TR') : '']))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" /> CSV İndir
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Makbuzlar yükleniyor...</p>
        ) : filteredDonations.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">Ödemesi tamamlanmış bağış bulunmamaktadır.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table inset>
              <THead>
                <Tr>
                  <Th>Makbuz No</Th>
                  <Th>Bağışçı</Th>
                  <Th>Ödeme Tipi</Th>
                  <Th>Tarih</Th>
                  <Th className="text-right">Tutar</Th>
                  <Th>SMS</Th>
                  <Th className="text-right">İşlem</Th>
                </Tr>
              </THead>
              <TBody>
                {filteredDonations.map((don) => (
                  <Tr key={don.id} className="hover:bg-gray-50/50">
                    <Td className="font-bold text-gray-900">{don.receipt_number}{don.official_receipt_no && <div className="text-[11px] font-semibold text-gray-500">Matbu {don.official_receipt_no}</div>}</Td>
                    <Td>
                      {don.donor_name}
                      {don.on_behalf_of && <div className="text-[10px] text-primary-700">Adına: {don.on_behalf_of}</div>}
                    </Td>
                    <Td>{don.payment_method_label}{don.is_manual && ' (elle)'}</Td>
                    <Td className="text-gray-400">{new Date(don.paid_at).toLocaleDateString('tr-TR')}</Td>
                    <Td className="text-right font-bold text-emerald-800">{formatMoney(don.amount_cents, don.currency)}</Td>
                    <Td><SmsStatusPill sms={sms[don.id]} /></Td>
                    <Td className="text-right">
                      {canSms && <button onClick={() => setSmsFor(don)} className="mr-3 font-bold text-primary-600 hover:text-primary-700">SMS</button>}
                      <button
                        onClick={() => viewReceipt(don.id)}
                        disabled={receiptLoadingId === don.id}
                        className="text-primary-600 hover:text-primary-700 font-bold"
                      >
                        {receiptLoadingId === don.id ? 'Yükleniyor...' : 'Doğrulama Linki'}
                      </button>
                      <button
                        onClick={() => downloadReceiptPdf(don.id, don.receipt_number).catch(() => toast.error('PDF indirilemedi.'))}
                        className="ml-3 text-primary-600 hover:text-primary-700 font-bold"
                      >
                        PDF
                      </button>
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
