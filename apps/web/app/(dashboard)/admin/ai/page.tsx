'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, MessageSquare, RefreshCw, Sparkles, TrendingUp, Users } from 'lucide-react'
import { Button, Card } from '@e-infak/ui'
import { QuickSmsDialog, sentNotice } from '../../../../components/admin/QuickSmsDialog'
import { EmptyState, ExportButtons, PageHeader, SmsIcon, StatCard, TBody, THead, Table, Td, Th, Tr, WhatsAppIcon, toast } from '../../../../components/admin/ui'
import { adminGet, apiErrorMessage, formatMoney, whatsappUrl } from '../../../../lib/admin-access'

interface ChurnDonor {
  donor_id: string
  donor_name: string
  donor_phone?: string | null
  sms_opt_out?: boolean
  last_donation_date: string
  days_since_last: number
  donation_count: number
  total_donated_cents: number
  risk_percentage: number
  recommended_action: string
  rfm_score?: string
  segment_label?: string
  expected_next_date?: string
  preferred_campaign?: string | null
  avg_interval_days?: number
}

interface UpgradeCandidate {
  donor_id: string
  donor_name: string
  donor_phone?: string | null
  sms_opt_out?: boolean
  rfm_score: string
  segment_label: string
  donation_count: number
  total_donated_cents: number
  suggested_next_cents: number
  preferred_campaign?: string | null
  expected_next_date?: string
}

interface RfmSegment {
  key: string
  label: string
  count: number
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
  upgrade_candidates?: UpgradeCandidate[]
  segments?: RfmSegment[]
  narrative?: string
  predictive_amounts: PredictiveAmount[]
  summary?: {
    analyzed_donors: number
    at_risk_count: number
    high_risk_count: number
    upgrade_count?: number
    avg_monthly_try_cents: number
    current_month_try_cents: number
  }
}

export default function AdminAiPage() {
  const [churns, setChurns] = useState<ChurnDonor[]>([])
  const [upgrades, setUpgrades] = useState<UpgradeCandidate[]>([])
  const [segments, setSegments] = useState<RfmSegment[]>([])
  const [narrative, setNarrative] = useState('')
  const [predictives, setPredictives] = useState<PredictiveAmount[]>([])
  const [summary, setSummary] = useState({
    analyzed_donors: 0,
    at_risk_count: 0,
    high_risk_count: 0,
    upgrade_count: 0,
    avg_monthly_try_cents: 0,
    current_month_try_cents: 0,
  })
  const [loading, setLoading] = useState(true)
  const [smsTarget, setSmsTarget] = useState<{
    donor_id: string
    donor_name: string
    donor_phone?: string | null
    sms_opt_out?: boolean
  } | null>(null)

  const loadAiInsights = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminGet<InsightsResponse>('/ai/donor-insights')
      setChurns(res.data.churn_list || [])
      setUpgrades(res.data.upgrade_candidates || [])
      setSegments(res.data.segments || [])
      setNarrative(res.data.narrative || '')
      setPredictives(res.data.predictive_amounts || [])
      if (res.data.summary) {
        setSummary({
          analyzed_donors: res.data.summary.analyzed_donors || 0,
          at_risk_count: res.data.summary.at_risk_count || 0,
          high_risk_count: res.data.summary.high_risk_count || 0,
          upgrade_count: res.data.summary.upgrade_count || 0,
          avg_monthly_try_cents: res.data.summary.avg_monthly_try_cents || 0,
          current_month_try_cents: res.data.summary.current_month_try_cents || 0,
        })
      }
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
          detail={{
            title: 'Bağışçı Analiz Özeti',
            description: `Toplam ${summary.analyzed_donors.toLocaleString('tr-TR')} bağışçı analiz edildi`,
            content: () => (
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Metrik</th><th className="py-2 text-right">Değer</th></tr></thead>
                <tbody>
                  <tr className="border-b"><td className="py-2 font-semibold">Analiz Edilen Bağışçı</td><td className="py-2 text-right font-bold">{summary.analyzed_donors.toLocaleString('tr-TR')}</td></tr>
                  <tr className="border-b"><td className="py-2 font-semibold">Kayıp Riski Taşıyan (45+ gün)</td><td className="py-2 text-right font-bold">{summary.at_risk_count.toLocaleString('tr-TR')}</td></tr>
                  <tr className="border-b"><td className="py-2 font-semibold">Yüksek Riskli (≥%75)</td><td className="py-2 text-right font-bold text-red-600">{summary.high_risk_count.toLocaleString('tr-TR')}</td></tr>
                  <tr className="border-b"><td className="py-2 font-semibold">Bu Ay Hacim (TRY)</td><td className="py-2 text-right font-bold">{formatMoney(summary.current_month_try_cents, 'TRY')}</td></tr>
                </tbody>
              </table>
            ),
          }}
        />
        <StatCard
          label="Kayıp Riski Taşıyan"
          value={summary.at_risk_count.toLocaleString('tr-TR')}
          hint="45+ gündür bağış yapmayan"
          tone="warn"
          icon={Sparkles}
          detail={{
            title: 'Kayıp Riski Taşıyan Bağışçılar',
            description: '45+ gündür bağış yapmayanlar',
            content: () => churns.length === 0 ? <p className="text-sm text-gray-500">Kayıp riski taşıyan bağışçı yok.</p> : (
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Bağışçı</th><th className="py-2">Risk</th><th className="py-2 text-right">Toplam</th></tr></thead>
                <tbody>{churns.slice(0, 20).map((c) => <tr key={c.donor_id} className="border-b"><td className="py-2 font-semibold">{c.donor_name}</td><td className="py-2">%{c.risk_percentage}</td><td className="py-2 text-right font-bold">{formatMoney(c.total_donated_cents, 'TRY')}</td></tr>)}</tbody>
              </table>
            ),
          }}
        />
        <StatCard
          label="Yüksek Riskli (≥%75)"
          value={summary.high_risk_count.toLocaleString('tr-TR')}
          hint="Öncelikli iletişim önerilen"
          tone="bad"
          icon={AlertTriangle}
          detail={{
            title: 'Yüksek Riskli Bağışçılar (≥%75)',
            description: 'Öncelikli iletişim önerilenler',
            content: () => {
              const high = churns.filter((c) => c.risk_percentage >= 75)
              return high.length === 0 ? <p className="text-sm text-gray-500">Yüksek riskli bağışçı yok.</p> : (
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Bağışçı</th><th className="py-2">Risk</th><th className="py-2 text-right">Toplam</th></tr></thead>
                  <tbody>{high.map((c) => <tr key={c.donor_id} className="border-b"><td className="py-2 font-semibold">{c.donor_name}</td><td className="py-2 text-red-600 font-bold">%{c.risk_percentage}</td><td className="py-2 text-right font-bold">{formatMoney(c.total_donated_cents, 'TRY')}</td></tr>)}</tbody>
                </table>
              )
            },
          }}
        />
        <StatCard
          label="3 Aylık Ort. Hacim (TRY)"
          value={formatMoney(summary.avg_monthly_try_cents, 'TRY')}
          hint={`Bu ay: ${formatMoney(summary.current_month_try_cents, 'TRY')}`}
          tone="good"
          icon={TrendingUp}
          detail={{
            title: 'Bağış Hacmi Karşılaştırması',
            description: 'Son 3 aylık ortalama ile bu ayın karşılaştırması',
            content: () => (
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Dönem</th><th className="py-2 text-right">Tutar</th></tr></thead>
                <tbody>
                  <tr className="border-b"><td className="py-2 font-semibold">3 Aylık Ortalama</td><td className="py-2 text-right font-bold">{formatMoney(summary.avg_monthly_try_cents, 'TRY')}</td></tr>
                  <tr className="border-b"><td className="py-2 font-semibold">Bu Ay (Güncel)</td><td className="py-2 text-right font-bold text-emerald-700">{formatMoney(summary.current_month_try_cents, 'TRY')}</td></tr>
                </tbody>
              </table>
            ),
          }}
        />
      </div>

      {!loading && (narrative || segments.length > 0) && (
        <Card className="p-4 border border-emerald-200/80 bg-gradient-to-r from-emerald-50/70 via-white to-slate-50 shadow-sm space-y-3">
          {narrative && (
            <div className="flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">{narrative}</p>
            </div>
          )}
          {segments.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                RFM Segmentleri:
              </span>
              {segments.map((seg) => (
                <span
                  key={seg.key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-700"
                >
                  <span>{seg.label}</span>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-900">
                    {seg.count}
                  </span>
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      {loading ? (
        <Card className="p-10 border border-slate-200 text-center text-sm text-slate-500 animate-pulse">
          Bağışçı geçmişi analiz ediliyor...
        </Card>
      ) : (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 space-y-6">
            <Card className="p-5 border border-slate-200 bg-white shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Kayıp Riski Yüksek Bağışçılar (Churn Alert)</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kişisel bağış aralığı gecikmesi, RFM skoru ve toplam katkı tutarına göre sıralanır.
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
                        <Th>Son Bağış / Tahmini</Th>
                        <Th>Toplam Katkı</Th>
                        <Th>RFM & Risk</Th>
                        <Th>Önerilen Aksiyon</Th>
                        <Th className="text-right">İşlem</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {churns.map((c) => (
                        <Tr key={c.donor_id} className="hover:bg-slate-50/70">
                          <Td>
                            <Link
                              href={`/admin/bagiscilar/${c.donor_id}`}
                              className="font-semibold text-slate-900 hover:text-emerald-700"
                            >
                              {c.donor_name}
                            </Link>
                            {c.donor_phone && <div className="text-[11px] text-slate-400">{c.donor_phone}</div>}
                            {c.preferred_campaign && (
                              <div className="text-[10px] text-emerald-700 font-medium mt-0.5">
                                Tercih: {c.preferred_campaign}
                              </div>
                            )}
                          </Td>
                          <Td className="whitespace-nowrap">
                            <div className="text-xs font-medium text-slate-700">
                              {new Date(c.last_donation_date).toLocaleDateString('tr-TR')}
                            </div>
                            <div className="text-[11px] text-slate-400">{c.days_since_last} gün önce</div>
                            {c.expected_next_date && (
                              <div className="text-[10px] text-slate-500">
                                Beklenen: {new Date(c.expected_next_date).toLocaleDateString('tr-TR')}
                              </div>
                            )}
                          </Td>
                          <Td className="whitespace-nowrap">
                            <div className="text-xs font-semibold text-slate-800">
                              {formatMoney(c.total_donated_cents, 'TRY')}
                            </div>
                            <div className="text-[11px] text-slate-400">{c.donation_count} bağış</div>
                          </Td>
                          <Td className="whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                  c.risk_percentage >= 75
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                %{c.risk_percentage}
                              </span>
                              {c.rfm_score && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono font-bold">
                                  RFM {c.rfm_score}
                                </span>
                              )}
                            </div>
                            {c.segment_label && (
                              <div className="text-[10px] text-slate-500 mt-0.5">{c.segment_label}</div>
                            )}
                          </Td>
                          <Td className="text-xs text-slate-600 max-w-[220px]">{c.recommended_action}</Td>
                          <Td className="text-right whitespace-nowrap">
                            {c.donor_phone ? (
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSmsTarget(c)}
                                  className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100"
                                >
                                  <SmsIcon className="h-3.5 w-3.5" />
                                  SMS
                                </button>
                                {(() => {
                                  const wa = whatsappUrl(
                                    c.donor_phone,
                                    `Merhaba ${c.donor_name}, desteğiniz için teşekkür ederiz. Hayırlı günler dileriz.`,
                                  )
                                  return wa ? (
                                    <a
                                      href={wa}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="WhatsApp ile mesaj gönder"
                                      className="inline-flex items-center gap-1 rounded-md border border-[#25D366]/40 bg-[#25D366]/10 px-2 py-1 text-[11px] font-bold text-[#128C7E] hover:bg-[#25D366]/20"
                                    >
                                      <WhatsAppIcon className="h-3.5 w-3.5" />
                                      WhatsApp
                                    </a>
                                  ) : null
                                })()}
                              </div>
                            ) : (
                              <Link
                                href={`/admin/bagiscilar/${c.donor_id}`}
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

            {upgrades.length > 0 && (
              <Card className="p-5 border border-slate-200 bg-white shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Yükseltme Adayları & Sadık Bağışçılar</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Düzenli bağışa veya üst dilim katkıya davet edilebilecek yüksek RFM skorlu bağışçılar.
                    </p>
                  </div>
                  <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold px-2.5 py-0.5 rounded-full">
                    {upgrades.length} Aday
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Bağışçı</Th>
                        <Th>RFM / Segment</Th>
                        <Th>Toplam Katkı</Th>
                        <Th>Önerilen Yeni Tutar</Th>
                        <Th>Tercih Edilen Kalem</Th>
                        <Th className="text-right">İletişim</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {upgrades.map((u) => (
                        <Tr key={u.donor_id} className="hover:bg-slate-50/70">
                          <Td>
                            <Link
                              href={`/admin/bagiscilar/${u.donor_id}`}
                              className="font-semibold text-slate-900 hover:text-emerald-700"
                            >
                              {u.donor_name}
                            </Link>
                            {u.donor_phone && <div className="text-[11px] text-slate-400">{u.donor_phone}</div>}
                          </Td>
                          <Td className="whitespace-nowrap">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold mr-1.5">
                              RFM {u.rfm_score}
                            </span>
                            <span className="text-xs text-slate-600">{u.segment_label}</span>
                          </Td>
                          <Td className="whitespace-nowrap">
                            <div className="text-xs font-semibold text-slate-800">
                              {formatMoney(u.total_donated_cents, 'TRY')}
                            </div>
                            <div className="text-[11px] text-slate-400">{u.donation_count} bağış</div>
                          </Td>
                          <Td className="whitespace-nowrap font-bold text-emerald-700 text-xs">
                            {formatMoney(u.suggested_next_cents, 'TRY')}
                          </Td>
                          <Td className="text-xs text-slate-600">
                            {u.preferred_campaign || 'Genel Bağış'}
                          </Td>
                          <Td className="text-right whitespace-nowrap">
                            {u.donor_phone ? (
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSmsTarget(u)}
                                  className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100"
                                >
                                  <SmsIcon className="h-3.5 w-3.5" />
                                  SMS
                                </button>
                              </div>
                            ) : (
                              <Link
                                href={`/admin/bagiscilar/${u.donor_id}`}
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
              </Card>
            )}
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
            smsOptOut: smsTarget.sms_opt_out,
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
