'use client'

import { useCallback, useEffect, useState } from 'react'
import { CreditCard, Download, Mail, Plus } from 'lucide-react'
import { PlatformOrg, dateTr, platformCall, platformError, platformToken } from '../../lib/platform-api'
import { downloadCsv, ptCard, ptInput, ptPrimaryBtn, ptSecondaryBtn, ptSelect } from './PlatformUI'

interface OrgPayment {
  id: string
  amount_cents: number
  currency: string
  period_label: string
  payment_method: string
  status: string
  notes: string | null
  paid_at: string | null
}

const tl = (cents: number) =>
  (cents / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 })

export function SubscriptionCard({ org, onUpdated }: { org: PlatformOrg; onUpdated: () => Promise<void> }) {
  const [sub, setSub] = useState({
    subscription_status: org.subscription_status || 'active',
    billing_cycle: org.billing_cycle || 'monthly',
    subscription_ends_at: org.subscription_ends_at ? org.subscription_ends_at.slice(0, 10) : '',
    monthly_fee_lira: String((org.monthly_fee_cents || 0) / 100),
  })
  const [payments, setPayments] = useState<OrgPayment[]>([])
  const [pay, setPay] = useState({ amount_lira: '', period_label: '', payment_method: 'havale', extend_days: '30', notes: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadPayments = useCallback(() => {
    platformCall<OrgPayment[]>('get', `/organizations/${org.id}/payments`).then(setPayments).catch(() => undefined)
  }, [org.id])

  useEffect(() => {
    setSub({
      subscription_status: org.subscription_status || 'active',
      billing_cycle: org.billing_cycle || 'monthly',
      subscription_ends_at: org.subscription_ends_at ? org.subscription_ends_at.slice(0, 10) : '',
      monthly_fee_lira: String((org.monthly_fee_cents || 0) / 100),
    })
  }, [org.subscription_status, org.billing_cycle, org.subscription_ends_at, org.monthly_fee_cents])

  useEffect(() => { loadPayments() }, [loadPayments])

  const saveSub = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const feeCents = Math.max(0, Math.round((Number(sub.monthly_fee_lira) || 0) * 100))
      await platformCall('patch', `/organizations/${org.id}/subscription`, {
        subscription_status: sub.subscription_status,
        billing_cycle: sub.billing_cycle,
        subscription_ends_at: sub.subscription_ends_at ? `${sub.subscription_ends_at}T23:59:59Z` : null,
        monthly_fee_cents: feeCents,
      })
      await onUpdated()
      setMsg({ ok: true, text: 'Abonelik ayarları güncellendi' })
    } catch (err) {
      setMsg({ ok: false, text: platformError(err, 'Abonelik güncellenemedi') })
    } finally {
      setBusy(false)
    }
  }

  const addPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountCents = Math.round((Number(pay.amount_lira) || 0) * 100)
    if (amountCents <= 0) return setMsg({ ok: false, text: 'Geçerli bir tutar girin' })
    setBusy(true)
    setMsg(null)
    try {
      await platformCall('post', `/organizations/${org.id}/payments`, {
        amount_cents: amountCents,
        period_label: pay.period_label,
        payment_method: pay.payment_method,
        extend_days: Number(pay.extend_days) || 0,
        notes: pay.notes || null,
      })
      setPay({ amount_lira: '', period_label: '', payment_method: 'havale', extend_days: '30', notes: '' })
      loadPayments()
      await onUpdated()
      setMsg({ ok: true, text: 'Tahsilat kaydedildi' })
    } catch (err) {
      setMsg({ ok: false, text: platformError(err, 'Tahsilat kaydedilemedi') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`space-y-5 lg:col-span-2 ${ptCard}`}>
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <CreditCard className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        <h2 className="text-base font-bold text-slate-900">Abonelik &amp; SaaS Tahsilat</h2>
      </div>

      {msg && (
        <p className={`rounded-xl border px-3.5 py-2 text-xs font-semibold ${msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {msg.text}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={saveSub} className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
          <h3 className="text-sm font-bold text-slate-800">Abonelik Durumu</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Durum
              <select className={ptSelect} value={sub.subscription_status} onChange={(e) => setSub({ ...sub, subscription_status: e.target.value })}>
                <option value="active">Aktif</option>
                <option value="trial">Deneme</option>
                <option value="past_due">Ödeme Gecikmiş</option>
                <option value="suspended">Askıda</option>
              </select>
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Dönem
              <select className={ptSelect} value={sub.billing_cycle} onChange={(e) => setSub({ ...sub, billing_cycle: e.target.value })}>
                <option value="monthly">Aylık</option>
                <option value="yearly">Yıllık</option>
              </select>
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Aylık Ücret (TL)
              <input type="number" min="0" step="0.01" className={ptInput} value={sub.monthly_fee_lira} onChange={(e) => setSub({ ...sub, monthly_fee_lira: e.target.value })} />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Bitiş Tarihi
              <input type="date" className={ptInput} value={sub.subscription_ends_at} onChange={(e) => setSub({ ...sub, subscription_ends_at: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={ptPrimaryBtn}>Aboneliği Kaydet</button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setMsg(null)
                try {
                  const res = await platformCall<{ email: string }>('post', `/organizations/${org.id}/send-renewal-reminder`)
                  setMsg({ ok: true, text: `Yenileme hatırlatma e-postası gönderildi (${res.email})` })
                } catch (err) {
                  setMsg({ ok: false, text: platformError(err, 'Hatırlatma e-postası gönderilemedi') })
                } finally {
                  setBusy(false)
                }
              }}
              className={ptSecondaryBtn}
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              <span>Hatırlatma Gönder</span>
            </button>
          </div>
        </form>

        <form onSubmit={addPayment} className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
          <h3 className="text-sm font-bold text-slate-800">Yeni Tahsilat Kaydet</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Tutar (TL) *
              <input required type="number" min="0.01" step="0.01" className={ptInput} value={pay.amount_lira} onChange={(e) => setPay({ ...pay, amount_lira: e.target.value })} placeholder="2500" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Dönem Açıklaması *
              <input required className={ptInput} value={pay.period_label} onChange={(e) => setPay({ ...pay, period_label: e.target.value })} placeholder="2026 Kasım" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Yöntem
              <select className={ptSelect} value={pay.payment_method} onChange={(e) => setPay({ ...pay, payment_method: e.target.value })}>
                <option value="havale">Havale / EFT</option>
                <option value="kart">Kredi Kartı</option>
                <option value="nakit">Nakit</option>
              </select>
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Süreyi Uzat (Gün)
              <input type="number" min="0" max="366" className={ptInput} value={pay.extend_days} onChange={(e) => setPay({ ...pay, extend_days: e.target.value })} />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 sm:col-span-2">
              Not (isteğe bağlı)
              <input maxLength={300} className={ptInput} value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} placeholder="Dekont no veya açıklama…" />
            </label>
          </div>
          <button type="submit" disabled={busy} className={ptPrimaryBtn}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Tahsilat Ekle</span>
          </button>
        </form>
      </div>

      {payments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Tahsilat Geçmişi</h3>
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  `${org.slug}-tahsilatlar.csv`,
                  ['Tarih', 'Dönem', 'Yöntem', 'Durum', 'Tutar (TL)', 'Not'],
                  payments.map((p) => [p.paid_at, p.period_label, p.payment_method, p.status, (p.amount_cents / 100).toFixed(2), p.notes || '']),
                )
              }
              className={`${ptSecondaryBtn} py-1.5 text-xs`}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>CSV İndir</span>
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Tarih</th>
                <th className="px-4 py-2.5">Dönem</th>
                <th className="px-4 py-2.5">Yöntem</th>
                <th className="px-4 py-2.5">Tutar</th>
                <th className="px-4 py-2.5">Not</th>
                <th className="px-4 py-2.5 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{dateTr(p.paid_at)}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">
                    {p.period_label}
                    {p.status && p.status !== 'paid' && (
                      <span className="ms-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        {p.status === 'pending' ? 'Beklemede' : 'İptal'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs uppercase text-slate-600">{p.payment_method}</td>
                  <td className="px-4 py-2.5 font-bold text-emerald-700">{tl(p.amount_cents)}</td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-xs text-slate-500" title={p.notes || undefined}>{p.notes || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch(`${window.location.origin}/api/v1/platform/organizations/${org.id}/payments/${p.id}/receipt.pdf`, {
                              headers: platformToken() ? { Authorization: `Bearer ${platformToken()}` } : {},
                            })
                            if (!res.ok) return setMsg({ ok: false, text: 'Makbuz indirilemedi' })
                            const blob = await res.blob()
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = `saas-makbuz-${p.id.slice(0, 8)}.pdf`
                            a.click()
                            window.setTimeout(() => URL.revokeObjectURL(url), 1000)
                          } catch {
                            setMsg({ ok: false, text: 'Makbuz indirilemedi; ağ hatası' })
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="h-3 w-3" aria-hidden="true" /> PDF
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (!window.confirm(`${p.period_label} tahsilat kaydı silinsin mi?`)) return
                          setBusy(true)
                          setMsg(null)
                          try {
                            await platformCall('delete', `/organizations/${org.id}/payments/${p.id}`)
                            setPayments((prev) => prev.filter((x) => x.id !== p.id))
                            setMsg({ ok: true, text: 'Tahsilat kaydı silindi' })
                          } catch (err) {
                            setMsg({ ok: false, text: platformError(err, 'Tahsilat silinemedi') })
                          } finally {
                            setBusy(false)
                          }
                        }}
                        className="inline-flex items-center rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </section>
  )
}
