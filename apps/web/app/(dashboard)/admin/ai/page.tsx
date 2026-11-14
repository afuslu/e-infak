'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, MessageSquare, RefreshCw, Sparkles, TrendingUp, Users } from 'lucide-react'
import { Button, Card } from '@e-infak/ui'
import { QuickSmsDialog, sentNotice } from '../../../../components/admin/QuickSmsDialog'
import { EmptyState, ExportButtons, PageHeader, StatCard, TBody, THead, Table, Td, Th, Tr, toast } from '../../../../components/admin/ui'
import { adminGet, apiErrorMessage, formatMoney } from '../../../../lib/admin-access'

interface ChurnDonor {
  donor_id: string
  donor_name: string
  donor_phone?: string | null
  allow_sms?: boolean
  last_donation_date: string
  days_since_last: number
  donation_count: number
  total_donated_cents: number
  risk_percentage: number
  recommended_action: string
}

interface PredictiveAmount {
  campaign_category: string
  currency: string
  suggested_avg_cents: number
  suggested_avg_lira: number
  expected_donor_count: number
  donation_count: number
  total_cents: number
}

interface InsightsResponse {
  churn_list: ChurnDonor[]
  predictive_amounts: PredictiveAmount[]
  summary?: {
    analyzed_donors: number
    at_risk_count: number
    high_risk_count: number
    avg_monthly_try_cents: number
    current_month_try_cents: number
  }
}

export default function AdminAiPage() {
  const [churns, setChurns] = useState<ChurnDonor[]>([])
  const [predictives, setPredictives] = useState<PredictiveAmount[]>([])
  const [summary, setSummary] = useState({
    analyzed_donors: 0,
    at_risk_count: 0,
    high_risk_count: 0,
    avg_monthly_try_cents: 0,
    current_month_try_cents: 0,
  })
  const [loading, setLoading] = useState(true)
  const [smsTarget, setSmsTarget] = useState<ChurnDonor | null>(null)

  const loadAiInsights = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminGet<InsightsResponse>('/ai/donor-insights')
      setChurns(res.data.churn_list || [])
      setPredictives(res.data.predictive_amounts || [])
      if (res.data.summary) setSummary(res.data.summary)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Bağışçı öngörüleri yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAiInsights()
  }, [loadAiInsights])

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Öngörüleri & RFM Analizi"
        description="Gerçek bağış geçmişine dayalı kayıp riski (churn) sinyalleri ve kategori bazlı tutar öngörüleri."
        actions={
          <div className="flex items-center gap-2">
            {churns.length > 0 && (
              <ExportButtons
                filename="bagisci-risk-analizi"
                title="Bağışçı Kayıp Riski (Churn) Analizi"
                subtitle={`${churns.length} bağışçı`}
                currencyCols={[5]}
                getData={() => ({
                  headers: ['Bağışçı', 'Telefon', 'Son Bağış', 'Geçen Gün', 'Bağış Sayısı', 'Toplam Katkı (TL)', 'Risk (%)', 'Önerilen Aksiyon'],
                  rows: churns.map((c) => [
                    c.donor_name,
                    c.donor_phone || '',
                    new Date(c.last_donation_date).toLocaleDateString('tr-TR'),
                    c.days_since_last,
                    c.donation_count,
                    c.total_donated_cents / 100,
                    c.risk_percentage,
                    c.recommended_action,
                  ]),
                })}
              />
            )}
            <Button type="button" variant="outline" size="sm" onClick={loadAiInsights} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Analiz Edilen Bağışçı"
          value={summary.analyzed_donors.toLocaleString('tr-TR')}
          hint="En az 1 onaylı bağışı olanlar"
          tone="neutral"
          icon={Users}
        />
        <StatCard
          label="Kayıp Riski Taşıyan"
          value={summary.at_risk_count.toLocaleString('tr-TR')}
          hint="45+ gündür bağış yapmayan"
          tone="warn"
          icon={Sparkles}
        />
        <StatCard
          label="Yüksek Riskli (≥%75)"
          value={summary.high_risk_count.toLocaleString('tr-TR')}
          hint="Öncelikli iletişim önerilen"
          tone="bad"
          icon={AlertTriangle}
        />
        <StatCard
          label="3 Aylık Ort. Hacim (TRY)"
          value={formatMoney(summary.avg_monthly_try_cents, 'TRY')}
          hint={`Bu ay: ${formatMoney(summary.current_month_try_cents, 'TRY')}`}
          tone="good"
          icon={TrendingUp}
        />
      </div>

      {loading ? (
        <Card className="p-10 border border-slate-200 text-center text-sm text-slate-500 animate-pulse">
          Bağışçı geçmişi analiz ediliyor...
        </Card>
      ) : (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8">
            <Card className="p-5 border border-slate-200 bg-white shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Kayıp Riski Yüksek Bağışçılar (Churn Alert)</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Son bağış tarihi, sıklık ve toplam katkı tutarına göre sıralanır.
                  </p>
                </div>
                <span className="text-[11px] bg-rose-50 text-rose-700 border border-rose-200 font-semibold px-2.5 py-0.5 rounded-full">
                  {churns.length} Kayıt
                </span>
              </div>

              {churns.length === 0 ? (
                <EmptyState
                  title="Kayıp riski taşıyan bağışçı yok"
                  text="45 günden uzun süredir pasif kalan bağışçı bulunmadı veya henüz yeterli bağış geçmişi oluşmadı."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Bağışçı</Th>
                        <Th>Son Bağış</Th>
                        <Th>Toplam Katkı</Th>
                        <Th>Risk</Th>
                        <Th>Önerilen Aksiyon</Th>
                        <Th className="text-right">İşlem</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {churns.map((c) => (
                        <Tr key={c.donor_id} className="hover:bg-slate-50/70">
                          <Td>
                            <Link
                              href={`/admin/bagiscilar?donor=${c.donor_id}`}
                              className="font-semibold text-slate-900 hover:text-emerald-700"
                            >
                              {c.donor_name}
                            </Link>
                            {c.donor_phone && <div className="text-[11px] text-slate-400">{c.donor_phone}</div>}
                          </Td>
                          <Td className="whitespace-nowrap">
                            <div className="text-xs font-medium text-slate-700">
                              {new Date(c.last_donation_date).toLocaleDateString('tr-TR')}
                            </div>
                            <div className="text-[11px] text-slate-400">{c.days_since_last} gün önce</div>
                          </Td>
                          <Td className="whitespace-nowrap">
                            <div className="text-xs font-semibold text-slate-800">
                              {formatMoney(c.total_donated_cents, 'TRY')}
                            </div>
                            <div className="text-[11px] text-slate-400">{c.donation_count} bağış</div>
                          </Td>
                          <Td>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                c.risk_percentage >= 75
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                            >
                              %{c.risk_percentage}
                            </span>
                          </Td>
                          <Td className="text-xs text-slate-600 max-w-[220px]">{c.recommended_action}</Td>
                          <Td className="text-right whitespace-nowrap">
                            {c.donor_phone ? (
                              <Button type="button" variant="outline" size="sm" onClick={() => setSmsTarget(c)}>
                                <MessageSquare className="w-3.5 h-3.5 mr-1" />
                                SMS
                              </Button>
                            ) : (
                              <Link
                                href={`/admin/bagiscilar?donor=${c.donor_id}`}
                                className="text-xs font-semibold text-emerald-700 hover:underline"
                              >
                                Profil →
                              </Link>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-4">
            <Card className="p-5 border border-slate-200 bg-white shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">Kategori Bazlı Tutar Önerileri</h2>
                <p className="text-xs text-slate-500 mt-0.5">Son 12 ayın onaylı bağış ortalamaları</p>
              </div>

              {predictives.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  Son 12 ayda kategori bazlı analiz için yeterli onaylı bağış bulunmuyor.
                </p>
              ) : (
                <div className="space-y-3">
                  {predictives.map((p, idx) => (
                    <div key={`${p.campaign_category}-${p.currency}-${idx}`} className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{p.campaign_category}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-500">
                          {p.currency}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline text-xs">
                        <span className="text-slate-500">Ortalama Bağış:</span>
                        <span className="font-bold text-emerald-700 text-sm">
                          {formatMoney(p.suggested_avg_cents, p.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/70">
                        <span>{p.expected_donor_count} tekil bağışçı</span>
                        <span>{p.donation_count} işlem · {formatMoney(p.total_cents, p.currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {smsTarget && (
        <QuickSmsDialog
          target={{
            donorId: smsTarget.donor_id,
            name: smsTarget.donor_name,
            phone: smsTarget.donor_phone,
            allowSms: smsTarget.allow_sms,
          }}
          onClose={() => setSmsTarget(null)}
          onSent={(res) => {
            toast.ok(sentNotice(res))
            setSmsTarget(null)
          }}
        />
      )}
    </div>
  )
}
