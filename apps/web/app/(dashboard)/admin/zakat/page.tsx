'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { Button, Card } from '@e-infak/ui'
import { Notice, ghostButton } from '../../../../components/admin/FormKit'
import { PageHeader } from '../../../../components/admin/ui'
import { adminApiBase, adminAuthHeaders, apiErrorMessage } from '../../../../lib/admin-access'

interface LiveTcmb {
  usd_rate: number
  eur_rate: number
  gold_price_per_gram: number
  nisap_amount_lira: number
}

interface ZakatSetting {
  id: string
  gold_price_per_gram: number
  nisap_amount_lira: number
  is_auto_sync: boolean
  updated_at: string
  live_tcmb?: LiveTcmb
}

export default function AdminZakatPage() {
  const [goldPrice, setGoldPrice] = useState('3000')
  const [nisapLira, setNisapLira] = useState('255000')
  const [autoSync, setAutoSync] = useState(true)
  const [liveTcmb, setLiveTcmb] = useState<LiveTcmb | null>(null)
  const [updatedAt, setUpdatedAt] = useState('')

  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const API_BASE = adminApiBase()

  const loadSettings = async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await axios.get<ZakatSetting>(`${API_BASE}/api/v1/admin-features/zakat-settings`, {
        headers: adminAuthHeaders(),
        params: refresh ? { refresh: true } : undefined,
      })
      const data = res.data
      setGoldPrice(String(data.gold_price_per_gram))
      setNisapLira(String(data.nisap_amount_lira))
      setAutoSync(data.is_auto_sync)
      setUpdatedAt(data.updated_at)
      if (data.live_tcmb) setLiveTcmb(data.live_tcmb)
      if (refresh) setMessage({ type: 'ok', text: 'TCMB canlı kurları yenilendi.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Zekât ayarları yüklenemedi') })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadSettings(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const g = Number(goldPrice)
    const n = Number(nisapLira)
    if (!Number.isFinite(g) || g <= 0 || !Number.isFinite(n) || n <= 0) {
      setMessage({ type: 'error', text: 'Gram altın fiyatı ve nisap sınırı sıfırdan büyük olmalıdır.' })
      return
    }
    setSaving(true)
    setMessage(null)

    try {
      const res = await axios.put<ZakatSetting>(
        `${API_BASE}/api/v1/admin-features/zakat-settings`,
        {
          gold_price_per_gram: g,
          nisap_amount_lira: n,
          is_auto_sync: autoSync,
        },
        { headers: adminAuthHeaders() }
      )
      setUpdatedAt(res.data.updated_at)
      setMessage({ type: 'ok', text: 'Zekât nisap ayarları başarıyla kaydedildi.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Ayarlar kaydedilemedi') })
    } finally {
      setSaving(false)
    }
  }

  const activeGold = autoSync && liveTcmb ? liveTcmb.gold_price_per_gram : Number(goldPrice) || 0
  const activeNisap = autoSync && liveTcmb ? liveTcmb.nisap_amount_lira : Number(nisapLira) || 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zekât & Nisap Ayarları"
        description={<>Ön yüzdeki zekât hesaplama robotunun kullanacağı nisap ve kur modunu yönetin.</>}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {updatedAt && (
              <span className="text-xs font-semibold text-gray-400">
                Son güncelleme: {new Date(updatedAt).toLocaleString('tr-TR')}
              </span>
            )}
            <Link
              href="/zekat-hesapla"
              target="_blank"
              className={`${ghostButton} inline-flex items-center gap-1.5`}
            >
              Zekât Hesaplayıcıyı Aç <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        }
      />

      <Notice message={message} />

      {loading ? (
        <p className="py-6 text-center text-sm text-gray-500 animate-pulse">Ayarlar yükleniyor...</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-12">
          {/* Sol: Ayar Formu */}
          <div className="lg:col-span-6">
            <Card className="space-y-5 border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center justify-between border-b pb-2">
                <h2 className="text-lg font-bold text-gray-900">Hesaplama Modu & Değişkenler</h2>
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => loadSettings(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  TCMB Yenile
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAutoSync(true)}
                    className={`rounded-xl border p-3 text-left transition ${
                      autoSync
                        ? 'border-primary-600 bg-primary-50/50 ring-1 ring-primary-600'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <p className="text-xs font-bold text-gray-900">Otomatik (TCMB Canlı)</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      Ön yüz doğrudan TCMB döviz/altın tahmini ve 85 gr nisap kullanır.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoSync(false)}
                    className={`rounded-xl border p-3 text-left transition ${
                      !autoSync
                        ? 'border-primary-600 bg-primary-50/50 ring-1 ring-primary-600'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <p className="text-xs font-bold text-gray-900">Manuel Sabit Değer</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      Belirlediğiniz gram altın ve nisap tutarı sabit olarak kullanılır.
                    </p>
                  </button>
                </div>

                {autoSync ? (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs text-blue-900">
                    <p className="font-bold">Otomatik mod aktif</p>
                    <p className="mt-1 text-blue-800/90">
                      Ziyaretçiler <code>/zekat-hesapla</code> sayfasını açtığında TCMB kurlarından hesaplanan güncel
                      veriler gösterilir. Manuel tutar girmek için &quot;Manuel Sabit Değer&quot; modunu seçin.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-gray-600">Gram Altın Fiyatı (TL) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="1"
                          placeholder="Örn: 3000"
                          value={goldPrice}
                          onChange={(e) => setGoldPrice(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold text-gray-600">Zekât Nisap Sınırı (TL) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="1"
                          placeholder="Örn: 255000"
                          value={nisapLira}
                          onChange={(e) => setNisapLira(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                          required
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const g = Number(goldPrice)
                        if (g > 0) setNisapLira(String(Math.round(g * 85 * 100) / 100))
                      }}
                      className="text-xs font-semibold text-primary-700 hover:underline"
                    >
                      85 gr × Gram Altın ile Nisap Hesapla ({((Number(goldPrice) || 0) * 85).toLocaleString('tr-TR')} ₺)
                    </button>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-primary-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-primary-700"
                  >
                    {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          {/* Sağ: Aktif Ön Yüz Özeti + Esaslar */}
          <div className="space-y-6 lg:col-span-6">
            <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center justify-between border-b pb-2">
                <h2 className="text-lg font-bold text-gray-900">Aktif Ön Yüz Özeti</h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    autoSync ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {autoSync ? 'TCMB Otomatik' : 'Manuel Sabit'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[11px] font-bold text-gray-400">Aktif Nisap Sınırı</p>
                  <p className="mt-1 text-lg font-extrabold text-gray-900 tabular-nums">
                    {activeNisap.toLocaleString('tr-TR')} ₺
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[11px] font-bold text-gray-400">Gram Altın</p>
                  <p className="mt-1 text-lg font-extrabold text-gray-900 tabular-nums">
                    {activeGold.toLocaleString('tr-TR')} ₺
                  </p>
                </div>
                {liveTcmb && (
                  <>
                    <div className="rounded-xl bg-gray-50 p-3">
                      <p className="text-[11px] font-bold text-gray-400">TCMB USD Kuru</p>
                      <p className="mt-1 text-sm font-bold text-gray-800 tabular-nums">
                        {liveTcmb.usd_rate.toLocaleString('tr-TR')} ₺
                      </p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3">
                      <p className="text-[11px] font-bold text-gray-400">TCMB EUR Kuru</p>
                      <p className="mt-1 text-sm font-bold text-gray-800 tabular-nums">
                        {liveTcmb.eur_rate.toLocaleString('tr-TR')} ₺
                      </p>
                    </div>
                  </>
                )}
              </div>
            </Card>

            <Card className="space-y-4 border border-amber-100 bg-amber-50/20 p-6 shadow-sm">
              <h2 className="border-b border-amber-200/50 pb-2 text-lg font-bold text-amber-900">Zekât Nisap Esasları</h2>
              <div className="space-y-3 text-xs font-medium leading-relaxed text-amber-950/80">
                <p>
                  Nisap; zekât, kurban ve sadaka-i fıtır gibi ibadetlerin kişiye farz veya vacip olması için belirlenen
                  asgari zenginlik ölçüsüdür.
                </p>
                <p>
                  <strong>Hanefi mezhebine göre:</strong> Altın için nisap miktarı <strong>85 gramdır</strong>.
                </p>
                <div className="rounded-xl border border-amber-100 bg-white p-3 text-[11px] text-amber-900">
                  <span className="mb-1 block font-bold uppercase tracking-wider">Hesaplama Formülü:</span>
                  Nisap Limit = Gram Fiyatı ({activeGold.toLocaleString('tr-TR')} ₺) × 85 ={' '}
                  <strong>{(activeGold * 85).toLocaleString('tr-TR')} ₺</strong>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
