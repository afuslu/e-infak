'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import axios from 'axios'
import Link from 'next/link'
import { Card, Button } from '@e-infak/ui'

interface ReceiptData {
  status: string
  receipt_number: string
  donor_name: string
  amount_lira: number
  created_at: string
  payment_method: string
}

export default function PublicVerifyReceiptPage() {
  const params = useParams()
  const receiptNumber = params.receipt_number as string
  
  const [data, setData] = useState<ReceiptData | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  useEffect(() => {
    if (!receiptNumber) return
    
    const verifyReceipt = async () => {
      setLoading(true)
      setErrorMsg('')
      try {
        const res = await axios.get(`${API_BASE}/api/v1/public/receipts/${receiptNumber}`)
        setData(res.data)
      } catch (err: any) {
        console.error(err)
        setErrorMsg(err.response?.data?.detail || 'Makbuz doğrulanamadı. Geçersiz veya hatalı numara.')
      } finally {
        setLoading(false)
      }
    }
    
    verifyReceipt()
  }, [receiptNumber, API_BASE])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        
        {/* Verification Card */}
        <Card className="p-8 border border-gray-200 shadow-xl space-y-6 bg-white rounded-3xl relative overflow-hidden">
          {/* Decorative Security Ribbons */}
          <div className="absolute top-0 right-0 h-16 w-16 bg-[#1B5E20] rotate-45 translate-x-8 -translate-y-8" />
          
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-black tracking-tight text-gray-900">E-İnfak Makbuz Doğrulama</h1>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Resmi Dijital Doğrulama Servisi</p>
          </div>

          {loading ? (
            <div className="py-12 text-center space-y-3">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-[#1B5E20]" />
              <p className="text-xs text-gray-400 font-bold">Makbuz Sorgulanıyor...</p>
            </div>
          ) : errorMsg ? (
            <div className="py-8 text-center space-y-4">
              <div className="mx-auto h-16 w-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center text-3xl font-black">
                ⚠️
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-red-600 text-sm">Geçersiz Makbuz Numarası</h3>
                <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">{errorMsg}</p>
              </div>
            </div>
          ) : data ? (
            <div className="space-y-6 animate-fade-in">
              {/* Checkmark Status */}
              <div className="text-center space-y-2 py-2">
                <div className="mx-auto h-16 w-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center text-3xl font-bold">
                  ✓
                </div>
                <h3 className="text-emerald-800 font-bold text-sm uppercase tracking-wide">✓ Resmi Olarak Doğrulandı</h3>
              </div>

              {/* Data Table */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3 text-xs leading-relaxed text-gray-600">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="font-bold text-gray-400 uppercase text-[10px]">Makbuz No</span>
                  <span className="font-mono font-bold text-gray-900">{data.receipt_number}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="font-bold text-gray-400 uppercase text-[10px]">Bağışçı</span>
                  <span className="font-bold text-gray-900">{data.donor_name}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="font-bold text-gray-400 uppercase text-[10px]">Bağış Tarihi</span>
                  <span className="font-bold text-gray-900">{new Date(data.created_at).toLocaleDateString('tr-TR')}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="font-bold text-gray-400 uppercase text-[10px]">Ödeme Tipi</span>
                  <span className="font-bold text-gray-900">{data.payment_method}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="font-bold text-gray-400 uppercase text-[10px]">Bağış Tutarı</span>
                  <span className="font-black text-emerald-700 text-lg">{data.amount_lira.toLocaleString('tr-TR')} ₺</span>
                </div>
              </div>

              {/* Legal Note */}
              <p className="text-[10px] text-gray-400 text-center leading-relaxed italic">
                * Bu belge, dernek muhasebe sistemindeki resmi kayıtlar esas alınarak dijital olarak imzalanmış ve doğrulanmıştır.
              </p>
            </div>
          ) : null}

          <div className="pt-2 flex justify-center">
            <Link href="/" className="w-full">
              <Button variant="outline" className="w-full border-gray-300 text-gray-600 hover:bg-gray-50 text-xs py-2.5">
                Ana Sayfaya Dön
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
