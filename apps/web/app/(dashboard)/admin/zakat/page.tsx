'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Calculator,
  Coins,
  DollarSign,
  ExternalLink,
  RefreshCw,
  Scale,
  Sparkles,
} from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { GlobalStatCard } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { PageHeader, toast } from '../../../../components/admin/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'

interface LiveTcmb {
  usd_rate: number | null
  eur_rate: number | null
  gold_price_per_gram: number | null
  nisap_amount_lira: number | null
  silver_price_per_gram?: number | null
  stale?: boolean
  source?: string | null
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
  const [sampleAsset, setSampleAsset] = useState('350000')

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadSettings = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await adminGet<ZakatSetting>('/zakat-settings', refresh ? { refresh: true } : undefined)
      const data = res.data
      setGoldPrice(String(data.gold_price_per_gram))
      setNisapLira(String(data.nisap_amount_lira))
      setAutoSync(data.is_auto_sync)
      setUpdatedAt(data.updated_at)
      if (data.live_tcmb) setLiveTcmb(data.live_tcmb)
      if (refresh) toast.ok('TCMB canlı kurları yenilendi.')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Zekât ayarları yüklenemedi'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadSettings(false)
  }, [loadSettings])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const g = Number(goldPrice)
    const n = Number(nisapLira)
    if (!Number.isFinite(g) || g <= 0 || !Number.isFinite(n) || n <= 0) {
      toast.error('Gram altın fiyatı ve nisap sınırı sıfırdan büyük olmalıdır.')
      return
    }
    setSaving(true)
    try {
      const res = await adminSend<ZakatSetting>('put', '/zakat-settings', {
        gold_price_per_gram: g,
        nisap_amount_lira: n,
        is_auto_sync: autoSync,
      })
      setUpdatedAt(res.data.updated_at)
      toast.ok('Zekât nisap ayarları başarıyla kaydedildi.')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Ayarlar kaydedilemedi'))
    } finally {
      setSaving(false)
    }
  }

  // Live price only when it was really fetched; otherwise the last stored one.
  const live = autoSync && liveTcmb && !liveTcmb.stale && liveTcmb.gold_price_per_gram ? liveTcmb : null
  const activeGold = live ? live.gold_price_per_gram || 0 : Number(goldPrice) || 0
  const activeNisap = live ? live.nisap_amount_lira || 0 : Number(nisapLira) || 0
  const silverGram = liveTcmb?.silver_price_per_gram ?? null
  const silverNisap = silverGram ? Math.round(silverGram * 595) : null

  const parsedSample = Math.max(0, Number(sampleAsset.replace(',', '.')) || 0)
  const isAboveNisap = parsedSample >= activeNisap && activeNisap > 0
  const sampleZakat = isAboveNisap ? parsedSample * 0.025 : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zekât & Nisap Ayarları"
        description="Ön yüzdeki zekât hesaplama robotunun kullanacağı nisap sınırını, altın/gümüş kurunu ve hesaplama modunu yönetin."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {updatedAt && (
              <span className="text-xs font-medium text-slate-400 mr-1">
                Son güncelleme: {new Date(updatedAt).toLocaleString('tr-TR')}
              </span>
            )}
            <Button type="button" variant="outline" size="sm" disabled={refreshing || loading} onClick={() => loadSettings(true)}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
              TCMB Yenile
            </Button>
            <Link
              href="/zekat-hesapla"
              target="_blank"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Zekât Hesaplayıcıyı Aç
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        }
      />

      {liveTcmb?.stale && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">TCMB canlı verisi şu an yenilenemedi</p>
            <p className="text-amber-800 mt-0.5">
              Son kayıtlı / yedek kur değerleri gösteriliyor. Biraz sonra &quot;TCMB Yenile&quot; ile tekrar deneyebilirsiniz.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlobalStatCard
          title="Aktif Nisap (85 gr Altın)"
          value={`${activeNisap.toLocaleString('tr-TR')} ₺`}
          subtitle={autoSync ? 'TCMB Otomatik Mod' : 'Manuel Sabit Mod'}
          gradient="from-emerald-600 to-teal-700"
          icon={<Scale className="w-5 h-5" />}
        />
        <GlobalStatCard
          title="Gram Altın (24 Ayar)"
          value={`${activeGold.toLocaleString('tr-TR')} ₺`}
          subtitle={liveTcmb?.source ? `Kaynak: ${liveTcmb.source}` : 'Kayıtlı kur'}
          gradient="from-amber-500 to-orange-600"
          icon={<Coins className="w-5 h-5" />}
        />
        <GlobalStatCard
          title="Gümüş Nisabı (595 gr)"
          value={silverNisap !== null ? `${silverNisap.toLocaleString('tr-TR')} ₺` : '—'}
          subtitle={silverGram !== null ? `Gram gümüş: ${silverGram.toLocaleString('tr-TR')} ₺` : 'TCMB verisi bekleniyor'}
          gradient="from-slate-600 to-slate-700"
          icon={<Sparkles className="w-5 h-5" />}
        />
        <GlobalStatCard
          title="TCMB Döviz Kurları"
          value={liveTcmb?.usd_rate != null ? `$ ${liveTcmb.usd_rate.toLocaleString('tr-TR')} ₺` : '—'}
          subtitle={liveTcmb?.eur_rate != null ? `EUR: ${liveTcmb.eur_rate.toLocaleString('tr-TR')} ₺` : 'EUR bilgisi yok'}
          gradient="from-sky-600 to-indigo-700"
          icon={<DollarSign className="w-5 h-5" />}
        />
      </div>

      {loading ? (
        <Card className="p-8 border border-slate-200 text-center text-sm text-slate-500 animate-pulse">
          Ayarlar yükleniyor...
        </Card>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-12">
          {/* Sol: Ayar Formu */}
          <div className="lg:col-span-6">
            <Card className="space-y-5 border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Hesaplama Modu & Değişkenler</h2>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                    autoSync
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }`}
                >
                  {autoSync ? 'TCMB Otomatik' : 'Manuel Sabit'}
                </span>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAutoSync(true)}
                    className={`rounded-xl border p-3.5 text-left transition ${
                      autoSync
                        ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900">Otomatik (TCMB Canlı)</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Ön yüz doğrudan TCMB döviz/altın verisi ve 85 gr nisap kullanır.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoSync(false)}
                    className={`rounded-xl border p-3.5 text-left transition ${
                      !autoSync
                        ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900">Manuel Sabit Değer</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Belirlediğiniz gram altın ve nisap tutarı sabit olarak kullanılır.
                    </p>
                  </button>
                </div>

                {autoSync ? (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 text-xs text-sky-900">
                    <p className="font-bold">Otomatik mod aktif</p>
                    <p className="mt-1 text-sky-800/90">
                      Ziyaretçiler <code>/zekat-hesapla</code> sayfasını açtığında TCMB kurlarından hesaplanan güncel
                      veriler gösterilir. Manuel tutar girmek için &quot;Manuel Sabit Değer&quot; modunu seçin.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Gram Altın Fiyatı (TL) *</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="1"
                          placeholder="Örn: 3000"
                          value={goldPrice}
                          onChange={(e) => setGoldPrice(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Zekât Nisap Sınırı (TL) *</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="1"
                          placeholder="Örn: 255000"
                          value={nisapLira}
                          onChange={(e) => setNisapLira(e.target.value)}
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
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      85 gr × Gram Altın ile Nisap Hesapla ({((Number(goldPrice) || 0) * 85).toLocaleString('tr-TR')} ₺)
                    </button>
                  </div>
                )}

                <div className="flex justify-end pt-3 border-t border-slate-100">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          {/* Sağ: Simülatör + Esaslar */}
          <div className="space-y-6 lg:col-span-6">
            <Card className="space-y-4 border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-emerald-600" />
                  <h2 className="text-base font-bold text-slate-900">Canlı Zekât Test Simülatörü</h2>
                </div>
                <span className="text-[11px] text-slate-400">%2,5 (1/40) oranı</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Örnek Net Varlık Tutarı (TL)</label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={sampleAsset}
                  onChange={(e) => setSampleAsset(e.target.value)}
                  placeholder="Örn: 350000"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                <div>
                  <div className="text-[11px] font-medium text-slate-500">Nisap Durumu</div>
                  <div className={`text-sm font-bold mt-0.5 ${isAboveNisap ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {isAboveNisap ? 'Nisap Sınırı Üstünde (Farz)' : 'Nisap Altında'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500">Hesaplanan Zekât</div>
                  <div className="text-base font-extrabold text-emerald-700 mt-0.5 tabular-nums">
                    {sampleZakat.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺
                  </div>
                </div>
              </div>
            </Card>

            <Card className="space-y-3 border border-amber-200/70 bg-amber-50/30 p-6 shadow-sm">
              <h2 className="border-b border-amber-200/60 pb-2 text-base font-bold text-amber-900">Zekât Nisap Esasları</h2>
              <div className="space-y-2.5 text-xs leading-relaxed text-amber-950/85">
                <p>
                  Nisap; zekât, kurban ve sadaka-i fıtır gibi ibadetlerin farz veya vacip olması için belirlenen asgari
                  zenginlik ölçüsüdür.
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <strong>Altın Nisabı (85 gr):</strong>{' '}
                    <span className="tabular-nums">{(activeGold * 85).toLocaleString('tr-TR')} ₺</span>
                  </li>
                  {silverNisap !== null && (
                    <li>
                      <strong>Gümüş Nisabı (595 gr):</strong>{' '}
                      <span className="tabular-nums">{silverNisap.toLocaleString('tr-TR')} ₺</span>
                    </li>
                  )}
                </ul>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
