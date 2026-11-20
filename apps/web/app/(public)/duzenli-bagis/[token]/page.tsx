'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Bell, Calendar, CheckCircle2, CreditCard, Lock, Pause, Play, Repeat, Trash2 } from 'lucide-react'
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
  can_save_card?: boolean
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

            {info.can_save_card && (
              <SaveCard token={token} hasCard={info.mode === 'card'} onSaved={(next, message) => {
                setInfo((prev) => (prev ? { ...prev, ...next } : prev))
                setNotice(message)
              }} />
            )}

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

function SaveCard({ token, hasCard, onSaved }: {
  token: string; hasCard: boolean; onSaved: (info: Partial<RecurringInfo>, message: string) => void
}) {
  const [open, setOpen] = useState(!hasCard)
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [holder, setHolder] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = 'w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm outline-none focus:border-emerald-600'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const [month, year] = expiry.split('/').map((p) => p.trim())
    setBusy(true)
    setError('')
    try {
      const res = await axios.post<RecurringInfo & { message: string }>(
        `${apiUrl}/api/v1/portal/recurring/${encodeURIComponent(token)}/card`,
        { card_number: number.replace(/\s/g, ''), expire_month: month || '', expire_year: year || '', cvv, holder_name: holder },
      )
      // Clear the card from memory as soon as the bank has it.
      setNumber(''); setCvv(''); setExpiry('')
      setOpen(false)
      onSaved(res.data, res.data.message)
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : null
      setError(typeof detail === 'string' ? detail : 'Kart kaydedilemedi. Bilgileri kontrol edip tekrar deneyin.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-emerald-700 hover:underline">
        {hasCard ? 'Kartımı değiştir' : 'Kartımı kaydet, her ay otomatik çekilsin'}
      </button>
    )
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4" autoComplete="on">
      <div>
        <h2 className="text-sm font-bold text-slate-900">{hasCard ? 'Kartı değiştir' : 'Otomatik ödeme için kartınızı kaydedin'}</h2>
        <p className="mt-1 text-xs text-slate-600">
          Kartınız bankada (Vakıf Katılım) güvenli olarak saklanır; derneğin sisteminde kart numarası tutulmaz.
          Her ay aynı gün bağış tutarı bu karttan çekilir; talimatı bu sayfadan istediğiniz zaman durdurabilirsiniz.
        </p>
      </div>
      <input className={input} inputMode="numeric" autoComplete="cc-number" placeholder="Kart numarası" maxLength={23} required
        value={number} onChange={(e) => setNumber(e.target.value.replace(/[^0-9 ]/g, ''))} />
      <div className="grid grid-cols-2 gap-3">
        <input className={input} inputMode="numeric" autoComplete="cc-exp" placeholder="AA/YY" maxLength={5} required
          value={expiry} onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '').slice(0, 4)
            setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d)
          }} />
        <input className={input} inputMode="numeric" autoComplete="cc-csc" placeholder="CVV" maxLength={4} required
          value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))} />
      </div>
      <input className={input} autoComplete="cc-name" placeholder="Kart üzerindeki isim" maxLength={60} required
        value={holder} onChange={(e) => setHolder(e.target.value)} />
      {error && <p className="text-xs font-medium text-rose-700">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy}><Lock className="mr-1.5 h-3.5 w-3.5" />{busy ? 'Kaydediliyor…' : 'Kartı kaydet'}</Button>
        {hasCard && <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setOpen(false)}>Vazgeç</button>}
      </div>
    </form>
  )
}
