'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Bell, Calendar, CheckCircle2, CreditCard, Pause, Play, Repeat, Trash2 } from 'lucide-react'
import axios from 'axios'
import { Button, Card } from '@e-infak/ui'
import '../../../../lib/api'

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface RecurringInfo {
  id: string
  donor_name: string
  campaign_title: string
  campaign_slug?: string | null
  amount_cents: number
  amount_lira: number
  currency: string
  frequency: string
  day_of_month?: number | null
  mode: 'card' | 'reminder'
  card_brand?: string | null
  card_last4?: string | null
  status: string
  next_charge_date?: string | null
}

export default function ManageRecurringPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token || ''
  const [info, setInfo] = useState<RecurringInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const res = await axios.get<RecurringInfo>(`${apiUrl}/api/v1/portal/recurring/${encodeURIComponent(token)}`)
      setInfo(res.data)
    } catch {
      setError('Düzenli bağış talimatı bulunamadı veya bağlantı süresi dolmuş.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const runAction = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!token) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await axios.post<RecurringInfo>(`${apiUrl}/api/v1/portal/recurring/${encodeURIComponent(token)}/action`, {
        action,
      })
      setInfo((prev) => (prev ? { ...prev, ...res.data } : res.data))
      setNotice(
        action === 'pause'
          ? 'Talimatınız geçici olarak duraklatıldı.'
          : action === 'resume'
            ? 'Talimatınız yeniden etkinleştirildi.'
            : 'Talimatınız iptal edildi.',
      )
    } catch {
      setError('İşlem sırasında bir hata oluştu.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12 bg-slate-50">
      <Card className="w-full max-w-lg p-6 sm:p-8 border border-slate-200 bg-white shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
            <Repeat className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Düzenli Bağış Talimatı</h1>
            <p className="text-xs text-slate-500">Aylık bağış ve hatırlatma tercihlerinizi buradan yönetebilirsiniz.</p>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500 animate-pulse">Talimat bilgileri yükleniyor...</div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {error}
          </div>
        ) : info ? (
          <div className="space-y-5">
            {notice && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{notice}</span>
              </div>
            )}

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-xs">Bağışçı</span>
                <span className="font-semibold text-slate-900">{info.donor_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-xs">Bağış Kalemi</span>
                <span className="font-semibold text-slate-900">{info.campaign_title}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-xs">Tutar & Sıklık</span>
                <span className="font-bold text-emerald-700">
                  {info.amount_lira.toLocaleString('tr-TR')} {info.currency} /{' '}
                  {info.frequency === 'weekly' ? 'Haftalık' : 'Aylık'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-xs">Yöntem</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  {info.mode === 'card' ? (
                    <>
                      <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                      Otomatik Kart Çekimi {info.card_last4 ? `(•••• ${info.card_last4})` : ''}
                    </>
                  ) : (
                    <>
                      <Bell className="w-3.5 h-3.5 text-amber-600" />
                      SMS Hatırlatma {info.day_of_month ? `(Her ayın ${info.day_of_month}. günü)` : ''}
                    </>
                  )}
                </span>
              </div>
              {info.next_charge_date && info.status === 'active' && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-xs">Sonraki Tarih</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {new Date(info.next_charge_date).toLocaleDateString('tr-TR')}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-slate-200/80">
                <span className="text-slate-500 text-xs">Durum</span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    info.status === 'active'
                      ? 'bg-emerald-100 text-emerald-800'
                      : info.status === 'paused'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {info.status === 'active' ? 'Aktif' : info.status === 'paused' ? 'Duraklatıldı' : 'İptal Edildi'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              {info.status === 'active' && (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => runAction('pause')}>
                  <Pause className="w-3.5 h-3.5 mr-1.5" />
                  Duraklat
                </Button>
              )}
              {info.status === 'paused' && (
                <Button type="button" size="sm" disabled={busy} onClick={() => runAction('resume')}>
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  Devam Ettir
                </Button>
              )}
              {info.status !== 'cancelled' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => runAction('cancel')}
                  className="text-rose-700 border-rose-200 hover:bg-rose-50"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Talimatı İptal Et
                </Button>
              )}
              <Link
                href={info.campaign_slug ? `/kampanyalar/${info.campaign_slug}` : '/bagis'}
                className="ml-auto text-xs font-semibold text-emerald-700 hover:underline"
              >
                Şimdi Bağış Yap →
              </Link>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  )
}
