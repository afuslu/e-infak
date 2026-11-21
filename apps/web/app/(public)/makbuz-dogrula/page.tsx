'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Award, CheckCircle2, FileDown, PlayCircle, Search, ShieldCheck, XCircle } from 'lucide-react'
import { apiClient } from '@/lib/api'

interface VerifiedReceipt {
  status: 'valid' | 'refunded' | 'cancelled'
  receipt_number: string
  code_verified: boolean
  donor_name: string | null
  campaign_title: string
  currency: string
  amount_lira: number
  created_at: string
  payment_method: string
  video_url: string | null
  pdf_url: string | null
  certificate_url: string | null
}

function VerifyReceiptContent() {
  const sp = useSearchParams()
  const [receiptNo, setReceiptNo] = useState(sp.get('no') || '')
  const [code, setCode] = useState(sp.get('k') || '')
  const [honoree, setHonoree] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<VerifiedReceipt | null>(null)

  const verify = async (noVal: string, kVal: string) => {
    const cleanNo = noVal.trim()
    if (!cleanNo) return
    setLoading(true)
    setError(null)
    try {
      const qs = kVal.trim() ? `?k=${encodeURIComponent(kVal.trim())}` : ''
      const res = await apiClient.get<VerifiedReceipt>(`/public/receipts/${encodeURIComponent(cleanNo)}${qs}`)
      setResult(res.data)
    } catch {
      setResult(null)
      setError('Bu numaraya ait onaylı bağış makbuzu bulunamadı.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const initialNo = sp.get('no')
    if (initialNo) {
      void verify(initialNo, sp.get('k') || '')
    }
  }, [sp])

  const certHref = result?.certificate_url
    ? `${result.certificate_url}${honoree.trim() ? `&honoree=${encodeURIComponent(honoree.trim())}` : ''}`
    : null

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="font-heading text-3xl font-bold text-gray-900">Makbuz Doğrulama & Sertifika</h1>
        <p className="mt-2 text-sm text-gray-600">
          Makbuz numaranız ve doğrulama kodunuzla bağışınızın durumunu sorgulayabilir, resmi makbuzunuzu veya hediye sertifikanızı indirebilirsiniz.
        </p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void verify(receiptNo, code) }}
        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Makbuz Numarası</span>
            <input
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value)}
              placeholder="Örn. MKB-2026-000123"
              required
              className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Doğrulama Kodu (opsiyonel)</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Makbuz üzerindeki kod"
              className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          <Search className="h-4 w-4" />
          {loading ? 'Sorgulanıyor…' : 'Makbuzu Doğrula'}
        </button>
      </form>

      {error && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <XCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className={`h-6 w-6 ${result.status === 'valid' ? 'text-emerald-600' : 'text-amber-600'}`} />
              <div>
                <div className="text-sm font-bold text-gray-900">{result.receipt_number}</div>
                <div className="text-xs text-gray-500">
                  {result.status === 'valid' ? 'Onaylı Bağış Makbuzu' : result.status === 'refunded' ? 'İade Edildi' : 'İptal Edildi'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-primary-700">
                {result.amount_lira.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {result.currency}
              </div>
              <div className="text-xs text-gray-500">{result.payment_method}</div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Kampanya / Kalem</dt>
              <dd className="font-semibold text-gray-900">{result.campaign_title}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Tarih</dt>
              <dd className="font-semibold text-gray-900">{new Date(result.created_at).toLocaleDateString('tr-TR')}</dd>
            </div>
            {result.donor_name && (
              <div className="col-span-2">
                <dt className="text-xs text-gray-500">Bağışçı</dt>
                <dd className="font-semibold text-gray-900">{result.donor_name}</dd>
              </div>
            )}
          </dl>

          {result.code_verified && (
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  Hediye Sertifikası İçin İsim (opsiyonel — ör. sevdiklerinizin adı)
                </span>
                <input
                  value={honoree}
                  onChange={(e) => setHonoree(e.target.value)}
                  placeholder="Boş bırakılırsa bağışçı adı yazılır"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-600"
                />
              </label>
              <div className="flex flex-wrap gap-2.5">
                {result.pdf_url && (
                  <a
                    href={result.pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-100"
                  >
                    <FileDown className="h-4 w-4" /> Resmi PDF Makbuz
                  </a>
                )}
                {certHref && (
                  <a
                    href={certHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-700"
                  >
                    <Award className="h-4 w-4" /> Teşekkür / Hediye Sertifikası
                  </a>
                )}
                {result.video_url && (
                  <a
                    href={result.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <PlayCircle className="h-4 w-4" /> Teslimat Videosunu İzle
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}

export default function VerifyReceiptPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-gray-500">Yükleniyor…</div>}>
      <VerifyReceiptContent />
    </Suspense>
  )
}
