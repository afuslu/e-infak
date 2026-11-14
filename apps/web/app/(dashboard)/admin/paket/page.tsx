'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, HardDrive, Landmark, PackageCheck, Sparkles, Users } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminSend, apiErrorMessage, useAdminAccess } from '../../../../lib/admin-access'
import { PageHeader, StatCard, TBody, THead, Table, Td, Th, Tr } from '../../../../components/admin/ui'

const FEATURE_CATEGORIES: { title: string; keys: string[] }[] = [
  {
    title: 'Temel & Web',
    keys: ['website', 'online_donation', 'receipts', 'multi_language', 'multi_currency', 'sitemap', 'roles'],
  },
  {
    title: 'Bağışçı & İletişim',
    keys: ['donor_crm', 'donor_portal_advanced', 'sms', 'recurring', 'donation_video', 'whatsapp', 'sms_donation', 'call_center', 'membership'],
  },
  {
    title: 'Saha & Yardım Operasyonları',
    keys: ['kurban', 'sponsorship', 'education', 'water_well', 'project_funding', 'money_box', 'food_aid', 'poverty_tracking', 'tasks'],
  },
  {
    title: 'Finans, Rapor & Yönetim',
    keys: ['bank_transactions', 'accounting', 'reports_basic', 'reports_advanced'],
  },
]

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 MB'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 1 : 2)} GB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
}

function formatMb(mb: number) {
  if (mb >= 1024) {
    const gb = mb / 1024
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
  }
  return `${mb} MB`
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : used > 0 ? 100 : 0
  const color = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary-600'
  return (
    <div className="mt-2.5 space-y-1">
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[11px] font-medium text-gray-500">
        <span>%{pct} kullanılıyor</span>
        {pct >= 100 ? (
          <span className="font-bold text-red-600">Kota doldu</span>
        ) : pct >= 80 ? (
          <span className="font-bold text-amber-600">Limite yakın</span>
        ) : null}
      </div>
    </div>
  )
}

export default function PackagePage() {
  const queryClient = useQueryClient()
  const { data: access, isLoading } = useAdminAccess()
  const [plan, setPlan] = useState('')
  const [addons, setAddons] = useState<string[]>([])
  const [extraSeats, setExtraSeats] = useState(0)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (access) {
      setPlan(access.plan)
      setAddons(access.addons)
      setExtraSeats(access.limits.extra_user_seats)
    }
  }, [access])

  const groupedCatalog = useMemo(() => {
    if (!access) return []
    const byKey = new Map(access.catalog.map((f) => [f.key, f]))
    const used = new Set<string>()
    const groups = FEATURE_CATEGORIES.map((cat) => {
      const items = cat.keys.map((k) => byKey.get(k)).filter((item): item is NonNullable<typeof item> => Boolean(item))
      items.forEach((i) => used.add(i.key))
      return { title: cat.title, items }
    }).filter((g) => g.items.length > 0)

    const rest = access.catalog.filter((f) => !used.has(f.key))
    if (rest.length > 0) groups.push({ title: 'Diğer Modüller', items: rest })
    return groups
  }, [access])

  if (isLoading || !access) {
    return <p className="py-12 text-center text-sm text-gray-500 animate-pulse">Yükleniyor...</p>
  }

  const selectedPlan = access.plans.find((p) => p.key === plan) || access.plans[0]
  const labelOf = (key: string) => access.catalog.find((f) => f.key === key)?.label || key

  const save = async () => {
    setMessage(null)
    try {
      await adminSend('put', '/plan', {
        plan,
        enabled_addons: addons.filter((a) => selectedPlan.addons.includes(a)),
        extra_user_seats: extraSeats,
      })
      await queryClient.invalidateQueries({ queryKey: ['admin-access'] })
      setMessage({ type: 'ok', text: 'Paket güncellendi' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Paket & Kullanım" description={<>Kurumunuzun paketi, açık modüller ve kullanım kotaları.</>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Mevcut Paket"
          icon={PackageCheck}
          tone="brand"
          value={access.plan_label}
          hint={
            <div className="space-y-1.5">
              <div>{access.features.length} / {access.catalog.length} modül aktif</div>
              {access.addons.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {access.addons.map((a) => (
                    <span key={a} className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      <Sparkles className="h-2.5 w-2.5" /> {labelOf(a)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          }
          detail={{
            title: `${access.plan_label} · Aktif Modüller`,
            description: `${access.features.length} / ${access.catalog.length} modül aktif`,
            content: () => (
              <Table>
                <THead><Tr><Th>Modül</Th><Th className="text-right">Durum</Th></Tr></THead>
                <TBody>
                  {access.catalog.map((m) => {
                    const active = access.features.includes(m.key)
                    return (
                      <Tr key={m.key}>
                        <Td className="font-semibold">{m.label}</Td>
                        <Td className={`text-right text-xs font-bold ${active ? 'text-green-700' : 'text-gray-400'}`}>
                          {active ? 'Aktif' : 'Kapalı'}
                        </Td>
                      </Tr>
                    )
                  })}
                </TBody>
              </Table>
            ),
          }}
        />

        <StatCard
          label="Aktif Kullanıcı"
          icon={Users}
          value={`${access.usage.users} / ${access.limits.users}`}
          hint={
            <div>
              {access.limits.extra_user_seats > 0 && <div className="text-[11px] text-gray-500">{access.limits.extra_user_seats} ek koltuk dahil</div>}
              <UsageBar used={access.usage.users} limit={access.limits.users} />
            </div>
          }
          detail={{
            title: 'Kullanıcı Kotası Özeti',
            size: 'md',
            content: () => (
              <div className="space-y-4">
                <Table>
                  <TBody>
                    <Tr><Td className="font-semibold">Kullanılan Kullanıcı</Td><Td className="text-right font-bold tabular-nums">{access.usage.users}</Td></Tr>
                    <Tr><Td className="font-semibold">Toplam Kota</Td><Td className="text-right font-bold tabular-nums">{access.limits.users}</Td></Tr>
                    <Tr><Td className="font-semibold">Ek Koltuk Eklentisi</Td><Td className="text-right font-bold tabular-nums">{access.limits.extra_user_seats}</Td></Tr>
                  </TBody>
                </Table>
                <div className="flex justify-end">
                  <Link href="/admin/users" className="text-xs font-bold text-primary-700 hover:underline">Personel listesine git →</Link>
                </div>
              </div>
            ),
          }}
        />

        <StatCard
          label="Banka Hesapları"
          icon={Landmark}
          value={`${access.usage.bank_accounts} / ${access.limits.bank_accounts}`}
          hint={access.limits.bank_accounts === 0 ? 'Otomatik banka entegrasyonu Orta ve İleri paketlerde açılır.' : <UsageBar used={access.usage.bank_accounts} limit={access.limits.bank_accounts} />}
          detail={{
            title: 'Banka Hesabı Kotası',
            size: 'md',
            content: () => (
              <div className="space-y-4">
                <Table>
                  <TBody>
                    <Tr><Td className="font-semibold">Tanımlı Banka Hesabı</Td><Td className="text-right font-bold tabular-nums">{access.usage.bank_accounts}</Td></Tr>
                    <Tr><Td className="font-semibold">Paket Limiti</Td><Td className="text-right font-bold tabular-nums">{access.limits.bank_accounts}</Td></Tr>
                  </TBody>
                </Table>
                <div className="flex justify-end">
                  <Link href="/admin/gelen-havaleler" className="text-xs font-bold text-primary-700 hover:underline">Gelen havalelere git →</Link>
                </div>
              </div>
            ),
          }}
        />

        <StatCard
          label="Medya Depolama"
          icon={HardDrive}
          value={<span>{formatBytes(access.usage.storage_bytes)} <span className="text-sm font-semibold text-gray-400">/ {formatBytes(access.limits.storage_bytes)}</span></span>}
          hint={
            <div>
              <div className="text-[11px] text-gray-500">{access.usage.media_count} medya dosyası</div>
              <UsageBar used={access.usage.storage_bytes} limit={access.limits.storage_bytes} />
            </div>
          }
          detail={{
            title: 'Depolama & Medya Kullanımı',
            size: 'md',
            content: () => (
              <div className="space-y-4">
                <Table>
                  <TBody>
                    <Tr><Td className="font-semibold">Kullanılan Alan</Td><Td className="text-right font-bold tabular-nums">{formatBytes(access.usage.storage_bytes)}</Td></Tr>
                    <Tr><Td className="font-semibold">Toplam Kota</Td><Td className="text-right font-bold tabular-nums">{formatBytes(access.limits.storage_bytes)}</Td></Tr>
                    <Tr><Td className="font-semibold">Toplam Medya Dosyası</Td><Td className="text-right font-bold tabular-nums">{access.usage.media_count}</Td></Tr>
                  </TBody>
                </Table>
                <div className="flex justify-end">
                  <Link href="/admin/icerikler" className="text-xs font-bold text-primary-700 hover:underline">Medya / içeriklere git →</Link>
                </div>
              </div>
            ),
          }}
        />
      </div>

      {message && (
        <div className={`rounded-lg border p-3 text-sm font-semibold ${message.type === 'ok' ? 'border-green-100 bg-green-50 text-green-700' : 'border-red-100 bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <Card className="overflow-x-auto border border-gray-100 p-6 shadow-sm">
        <Table>
          <THead>
            <Tr className="border-b">
              <Th className="text-xs uppercase tracking-wider text-gray-500">Modül & Kota</Th>
              {access.plans.map((p) => (
                <Th
                  key={p.key}
                  className={`pb-3 text-center ${p.key === access.plan ? 'bg-primary-50/60 text-primary-700 rounded-t-lg' : 'text-gray-700'}`}
                >
                  {p.label}
                  {p.key === access.plan && <div className="text-[10px] font-semibold">(mevcut paket)</div>}
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {groupedCatalog.map((group) => (
              <FragmentRows key={group.title} title={group.title} features={group.items} plans={access.plans} currentPlan={access.plan} />
            ))}
            <Tr className="bg-gray-50/80">
              <Td colSpan={access.plans.length + 1} className="py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Kullanım Sınırları
              </Td>
            </Tr>
            <Tr>
              <Td className="font-medium text-gray-800">Aktif kullanıcı kotası</Td>
              {access.plans.map((p) => (
                <Td key={p.key} className={`text-center font-semibold ${p.key === access.plan ? 'bg-primary-50/30' : ''}`}>
                  {p.users}
                </Td>
              ))}
            </Tr>
            <Tr>
              <Td className="font-medium text-gray-800">Otomatik banka hesabı kotası</Td>
              {access.plans.map((p) => (
                <Td key={p.key} className={`text-center font-semibold ${p.key === access.plan ? 'bg-primary-50/30' : ''}`}>
                  {p.bank_accounts === 0 ? <span className="text-gray-300">—</span> : p.bank_accounts}
                </Td>
              ))}
            </Tr>
            <Tr>
              <Td className="font-medium text-gray-800">Medya depolama alanı</Td>
              {access.plans.map((p) => (
                <Td key={p.key} className={`text-center font-semibold ${p.key === access.plan ? 'bg-primary-50/30' : ''}`}>
                  {formatMb(p.storage_mb)}
                </Td>
              ))}
            </Tr>
          </TBody>
        </Table>
        {!access.me.is_platform_admin && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs text-gray-600">
              Paket yükseltme, ek kullanıcı koltuğu veya ek modül talepleriniz için E-İnfak destek ekibiyle iletişime geçebilirsiniz.
            </p>
            <a
              href={`mailto:destek@e-infak.org?subject=${encodeURIComponent(`Paket / Ek Modül Talebi (${access.plan_label})`)}`}
              className="rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-700"
            >
              Yükseltme / Modül Talep Et
            </a>
          </div>
        )}
      </Card>

      {access.me.is_platform_admin && (
        <Card className="space-y-4 border border-amber-200 bg-amber-50/40 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">Platform yöneticisi: paketi değiştir</h2>
          <div className="flex flex-wrap gap-4">
            <label className="text-xs font-semibold text-gray-600">Paket
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className="mt-1 block rounded-lg border bg-white p-2 text-sm">
                {access.plans.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600">Ek kullanıcı
              <input type="number" min={0} max={100} value={extraSeats} onChange={(e) => setExtraSeats(Number(e.target.value))} className="mt-1 block w-28 rounded-lg border bg-white p-2 text-sm" />
            </label>
          </div>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="mb-2 text-xs font-semibold text-gray-600">Ek modüller ({selectedPlan.label} için açılabilenler)</legend>
            {selectedPlan.addons.length === 0 ? (
              <span className="text-xs text-gray-500">Bu paket için ek modül seçeneği yok.</span>
            ) : (
              selectedPlan.addons.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={addons.includes(key)}
                    onChange={() => setAddons((prev) => (prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]))}
                  />
                  {labelOf(key)}
                </label>
              ))
            )}
          </fieldset>
          <button onClick={save} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">Kaydet</button>
        </Card>
      )}
    </div>
  )
}

function FragmentRows({
  title,
  features,
  plans,
  currentPlan,
}: {
  title: string
  features: { key: string; label: string }[]
  plans: { key: string; features: string[]; addons: string[] }[]
  currentPlan: string
}) {
  return (
    <>
      <Tr className="bg-gray-50/80">
        <Td colSpan={plans.length + 1} className="py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
          {title}
        </Td>
      </Tr>
      {features.map((feature) => (
        <Tr key={feature.key}>
          <Td className="text-gray-800">{feature.label}</Td>
          {plans.map((p) => (
            <Td key={p.key} className={`text-center ${p.key === currentPlan ? 'bg-primary-50/30' : ''}`}>
              {p.features.includes(feature.key) ? (
                <span className="inline-flex items-center justify-center font-bold text-emerald-600"><Check className="h-4 w-4" /></span>
              ) : p.addons.includes(feature.key) ? (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">Ek modül</span>
              ) : (
                <span className="text-gray-300">—</span>
              )}
            </Td>
          ))}
        </Tr>
      ))}
    </>
  )
}
