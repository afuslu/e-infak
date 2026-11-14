'use client'

import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { AlertTriangle, Boxes, CheckCircle2, Package, Search, Truck, Wallet } from 'lucide-react'
import { Card } from '@e-infak/ui'
import {
  adminApiBase, adminAuthHeaders, adminGet, adminSend, apiErrorMessage, exportCsv, formatMoney, hasPermission, useAdminAccess,
} from '../../../../lib/admin-access'
import { Label, Notice, TextArea, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { PageHeader, StatCard, TBody, THead, Table, Td, Th, Tr } from '../../../../components/admin/ui'

interface Package {
  id: string; name: string; contents: string | null; unit_cost_cents: number; donation_campaign_id: string | null
  stock: number; is_active: boolean; funded_cents: number; funded_packages: number; planned: number; delivered: number
}
interface Recipient {
  id: string; full_name: string; phone: string | null; national_id_masked: string | null; region_id: string | null
  region_name: string | null; address: string | null; household_size: number | null; needs: string | null; status: string
  last_delivery_at: string | null; total_received: number
}
interface Distribution {
  id: string; package_name: string; recipient_name: string | null; recipient_phone: string | null; recipient_address: string | null
  region_name: string | null; quantity: number; status: 'planned' | 'delivered' | 'cancelled'; planned_date: string | null; delivered_at: string | null
}

type Tab = 'packages' | 'recipients' | 'distributions'

export default function KumanyaPage() {
  const { data: access } = useAdminAccess()
  const canEdit = hasPermission(access, 'operations_manage')
  const [tab, setTab] = useState<Tab>('packages')
  const [packages, setPackages] = useState<Package[]>([])
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [distributions, setDistributions] = useState<Distribution[]>([])
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([])
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([])
  const [byRegion, setByRegion] = useState<{ label: string; households: number; packages: number }[]>([])
  const [regionFilter, setRegionFilter] = useState('')
  const [q, setQ] = useState('')
  const [distStatus, setDistStatus] = useState<'planned' | 'delivered' | 'cancelled' | ''>('planned')
  const [distPackageId, setDistPackageId] = useState('')
  const [distQuery, setDistQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [pkgForm, setPkgForm] = useState<{ id?: string; name: string; contents: string; cost: string; campaign: string; stock: string; is_active: boolean } | null>(null)
  const [recForm, setRecForm] = useState<{ id?: string; full_name: string; phone: string; national_id: string; region_id: string; address: string; household_size: string; needs: string } | null>(null)
  const [plan, setPlan] = useState({ package_id: '', quantity: '1', planned_date: '' })

  const load = async () => {
    try {
      const [rep, rec, dist, reg] = await Promise.all([
        adminGet<{ packages: Package[]; by_region: typeof byRegion }>('/aid-report'),
        adminGet<Recipient[]>('/aid-recipients', { region_id: regionFilter || undefined, q: q || undefined }),
        adminGet<Distribution[]>('/aid-distributions', {
          status: distStatus || undefined,
          package_id: distPackageId || undefined,
          region_id: regionFilter || undefined,
        }),
        adminGet<{ id: string; name: string }[]>('/regions'),
      ])
      setPackages(rep.data.packages)
      setByRegion(rep.data.by_region)
      setRecipients(rec.data)
      setDistributions(dist.data)
      setRegions(reg.data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Kumanya verileri yüklenemedi') })
    }
  }
  useEffect(() => {
    setPicked(new Set())
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionFilter, q, distStatus, distPackageId])
  useEffect(() => {
    axios.get(`${adminApiBase()}/api/v1/campaigns`, { headers: adminAuthHeaders(), params: { page_size: 100 } })
      .then((r) => setCampaigns(r.data.items || [])).catch(() => {})
  }, [])

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMessage(null)
    try {
      await fn()
      setMessage({ type: 'ok', text: ok })
      await load()
      return true
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
      return false
    }
  }

  const savePackage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pkgForm) return
    const body = {
      name: pkgForm.name, contents: pkgForm.contents || null,
      unit_cost_cents: Math.round(Number(pkgForm.cost.replace(',', '.')) * 100),
      donation_campaign_id: pkgForm.campaign || null, stock: Number(pkgForm.stock) || 0, is_active: pkgForm.is_active,
    }
    if (await act(() => (pkgForm.id ? adminSend('put', `/aid-packages/${pkgForm.id}`, body) : adminSend('post', '/aid-packages', body)), 'Paket kaydedildi')) setPkgForm(null)
  }

  const saveRecipient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recForm) return
    const body = {
      full_name: recForm.full_name, phone: recForm.phone || null, national_id: recForm.national_id || null,
      region_id: recForm.region_id || null, address: recForm.address || null,
      household_size: recForm.household_size ? Number(recForm.household_size) : null, needs: recForm.needs || null, status: 'active',
    }
    if (await act(() => (recForm.id ? adminSend('put', `/aid-recipients/${recForm.id}`, body) : adminSend('post', '/aid-recipients', body)), 'Hane kaydedildi')) setRecForm(null)
  }

  const planSelected = () => {
    if (!plan.package_id) {
      setMessage({ type: 'error', text: 'Önce paket seçin' })
      return
    }
    act(() => adminSend('post', '/aid-distributions', {
      package_id: plan.package_id, recipient_ids: [...picked], quantity: Number(plan.quantity) || 1, planned_date: plan.planned_date || null,
    }), `${picked.size} haneye dağıtım planlandı`).then((ok) => ok && setPicked(new Set()))
  }

  const setDistributionStatus = (status: 'delivered' | 'cancelled' | 'planned', ids?: string[]) => {
    const targetIds = ids ?? [...picked]
    if (targetIds.length === 0) return
    act(() => adminSend('post', '/aid-distributions/status', { ids: targetIds, status }),
      status === 'delivered' ? 'Teslim edildi olarak işaretlendi' : status === 'cancelled' ? 'Dağıtımlar iptal edildi' : 'Dağıtımlar güncellendi')
      .then((ok) => ok && setPicked(new Set()))
  }

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const kpi = useMemo(() => {
    return packages.reduce(
      (acc, p) => ({
        stock: acc.stock + p.stock,
        planned: acc.planned + p.planned,
        delivered: acc.delivered + p.delivered,
        fundedCents: acc.fundedCents + p.funded_cents,
      }),
      { stock: 0, planned: 0, delivered: 0, fundedCents: 0 },
    )
  }, [packages])

  const filteredDistributions = useMemo(() => {
    const query = distQuery.trim().toLowerCase()
    if (!query) return distributions
    return distributions.filter((d) =>
      `${d.recipient_name || ''} ${d.recipient_phone || ''} ${d.recipient_address || ''} ${d.package_name}`.toLowerCase().includes(query),
    )
  }, [distributions, distQuery])

  const pickedPlannedIds = useMemo(
    () => filteredDistributions.filter((d) => picked.has(d.id) && d.status === 'planned').map((d) => d.id),
    [filteredDistributions, picked],
  )
  const pickedDeliveredIds = useMemo(
    () => filteredDistributions.filter((d) => picked.has(d.id) && d.status === 'delivered').map((d) => d.id),
    [filteredDistributions, picked],
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Kumanya Dağıtım" description={<>Paketin bağış kalemine gelen bağışlar kaç paketin fonlandığını gösterir; teslimde stok düşer.</>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Hazır Stok"
          icon={Boxes}
          value={<span>{kpi.stock} <span className="text-xs font-semibold text-gray-500">paket</span></span>}
          detail={{
            title: 'Kumanya Paket Stokları',
            content: () => (
              <Table>
                <THead><Tr><Th>Paket</Th><Th className="text-right">Stok</Th><Th className="text-right">Planlı</Th><Th className="text-right">Teslim</Th></Tr></THead>
                <TBody>
                  {packages.map((p) => (
                    <Tr key={p.id}>
                      <Td className="font-semibold">{p.name}</Td>
                      <Td className={`text-right font-bold tabular-nums ${p.stock <= 5 ? 'text-red-600' : ''}`}>{p.stock}</Td>
                      <Td className="text-right tabular-nums text-amber-700">{p.planned}</Td>
                      <Td className="text-right tabular-nums text-emerald-700">{p.delivered}</Td>
                    </Tr>
                  ))}
                  {packages.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Paket yok.</Td></Tr>}
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Planlı Dağıtım"
          icon={Truck}
          tone="warn"
          value={<span>{kpi.planned} <span className="text-xs font-semibold text-gray-500">paket</span></span>}
          detail={{
            title: 'Planlı Dağıtım Kayıtları',
            content: () => {
              const plannedRows = distributions.filter((d) => d.status === 'planned')
              return (
                <Table>
                  <THead><Tr><Th>Hane / Alıcı</Th><Th>Paket</Th><Th className="text-right">Adet</Th></Tr></THead>
                  <TBody>
                    {plannedRows.map((d) => (
                      <Tr key={d.id}>
                        <Td className="font-semibold">{d.recipient_name}</Td>
                        <Td>{d.package_name}</Td>
                        <Td className="text-right font-bold tabular-nums">{d.quantity}</Td>
                      </Tr>
                    ))}
                    {plannedRows.length === 0 && <Tr><Td colSpan={3} className="text-center text-gray-400">Planlı dağıtım yok.</Td></Tr>}
                  </TBody>
                </Table>
              )
            },
          }}
        />
        <StatCard
          label="Teslim Edilen"
          icon={CheckCircle2}
          tone="good"
          value={<span>{kpi.delivered} <span className="text-xs font-semibold text-gray-500">paket</span></span>}
          detail={{
            title: 'Teslim Edilen Dağıtımlar',
            content: () => {
              const deliveredRows = distributions.filter((d) => d.status === 'delivered')
              return (
                <Table>
                  <THead><Tr><Th>Hane / Alıcı</Th><Th>Paket</Th><Th className="text-right">Adet</Th></Tr></THead>
                  <TBody>
                    {deliveredRows.map((d) => (
                      <Tr key={d.id}>
                        <Td className="font-semibold">{d.recipient_name}</Td>
                        <Td>{d.package_name}</Td>
                        <Td className="text-right font-bold tabular-nums text-emerald-700">{d.quantity}</Td>
                      </Tr>
                    ))}
                    {deliveredRows.length === 0 && <Tr><Td colSpan={3} className="text-center text-gray-400">Teslim edilen kayıt yok.</Td></Tr>}
                  </TBody>
                </Table>
              )
            },
          }}
        />
        <StatCard
          label="Fonlanan Bağış"
          icon={Wallet}
          value={formatMoney(kpi.fundedCents)}
          detail={{
            title: 'Paket Bazlı Fonlama Durumu',
            content: () => (
              <Table>
                <THead><Tr><Th>Paket</Th><Th className="text-right">Birim Maliyet</Th><Th className="text-right">Fonlanan Paket</Th><Th className="text-right">Toplam Bağış</Th></Tr></THead>
                <TBody>
                  {packages.map((p) => (
                    <Tr key={p.id}>
                      <Td className="font-semibold">{p.name}</Td>
                      <Td className="text-right tabular-nums">{formatMoney(p.unit_cost_cents)}</Td>
                      <Td className="text-right tabular-nums">{p.funded_packages}</Td>
                      <Td className="text-right font-bold tabular-nums">{formatMoney(p.funded_cents)}</Td>
                    </Tr>
                  ))}
                  {packages.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Paket yok.</Td></Tr>}
                </TBody>
              </Table>
            ),
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 border-b text-sm font-semibold">
          {([['packages', `Paketler (${packages.length})`], ['recipients', `Haneler (${recipients.length})`], ['distributions', 'Dağıtımlar']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); setPicked(new Set()) }} className={`-mb-px border-b-2 px-3 py-2 ${tab === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500'}`}>{l}</button>
          ))}
        </div>
        <select className={`${inputClass} w-44`} value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
          <option value="">Tüm bölgeler</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      <Notice message={message} />

      {tab === 'packages' && (
        <div className="space-y-4">
          {canEdit && !pkgForm && <button className={primaryButton} onClick={() => setPkgForm({ name: '', contents: '', cost: '', campaign: '', stock: '0', is_active: true })}>+ Paket Tanımla</button>}
          {pkgForm && (
            <Card className="border border-primary-100 p-6 shadow-sm">
              <form onSubmit={savePackage} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2"><TextInput label="Paket adı" required value={pkgForm.name} onChange={(v) => setPkgForm({ ...pkgForm, name: v })} /></div>
                <TextInput label="Birim maliyet (₺)" required inputMode="decimal" value={pkgForm.cost} onChange={(v) => setPkgForm({ ...pkgForm, cost: v })} />
                <TextInput label="Hazır stok (adet)" type="number" min={0} value={pkgForm.stock} onChange={(v) => setPkgForm({ ...pkgForm, stock: v })} />
                <div className="sm:col-span-2">
                  <Label label="Bağış kalemi (fonlama takibi)">
                    <select className={inputClass} value={pkgForm.campaign} onChange={(e) => setPkgForm({ ...pkgForm, campaign: e.target.value })}>
                      <option value="">—</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                  </Label>
                </div>
                <div className="sm:col-span-2"><TextArea label="İçerik" rows={2} value={pkgForm.contents} onChange={(v) => setPkgForm({ ...pkgForm, contents: v })} /></div>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 sm:col-span-2">
                  <input type="checkbox" checked={pkgForm.is_active} onChange={(e) => setPkgForm({ ...pkgForm, is_active: e.target.checked })} />
                  Paket dağıtım planlamasında aktif olsun
                </label>
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <button type="button" className={ghostButton} onClick={() => setPkgForm(null)}>Vazgeç</button>
                  <button type="submit" className={primaryButton}>Kaydet</button>
                </div>
              </form>
            </Card>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {packages.map((p) => {
              const deficit = Math.max(0, p.planned - p.stock)
              const targetCount = Math.max(p.funded_packages, p.planned + p.delivered, 1)
              const fundedPct = Math.min(100, Math.round((p.funded_packages / targetCount) * 100))
              return (
                <Card key={p.id} className={`flex flex-col justify-between space-y-3 border p-5 shadow-sm ${p.is_active ? 'border-gray-100' : 'border-gray-200 bg-gray-50/70 opacity-80'}`}>
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary-600" />
                          <strong className="text-gray-900">{p.name}</strong>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                            {p.is_active ? 'Aktif' : 'Pasif'}
                          </span>
                          {deficit > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                              <AlertTriangle className="h-3 w-3" /> {deficit} adet stok açığı
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700">{formatMoney(p.unit_cost_cents)}</span>
                    </div>
                    {p.contents && <p className="text-xs leading-relaxed text-gray-500">{p.contents}</p>}
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      {[
                        ['Fonlanan', p.funded_packages, 'text-gray-900'],
                        ['Stok', p.stock, deficit > 0 ? 'text-red-700' : 'text-gray-900'],
                        ['Planlı', p.planned, 'text-amber-700'],
                        ['Teslim', p.delivered, 'text-emerald-700'],
                      ].map(([l, v, tone]) => (
                        <div key={l as string} className="rounded-lg bg-gray-50 p-2">
                          <div className="text-[11px] text-gray-500">{l}</div>
                          <div className={`text-lg font-black ${tone}`}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {p.donation_campaign_id && (
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between text-[11px] text-gray-500">
                          <span>Toplanan bağış</span>
                          <span className="font-semibold text-gray-800">{formatMoney(p.funded_cents)}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-primary-600" style={{ width: `${fundedPct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="pt-1">
                      <button className={ghostButton} onClick={() => setPkgForm({
                        id: p.id, name: p.name, contents: p.contents || '', cost: String(p.unit_cost_cents / 100),
                        campaign: p.donation_campaign_id || '', stock: String(p.stock), is_active: p.is_active,
                      })}>Düzenle / stok</button>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
          {byRegion.length > 0 && (
            <Card className="border border-gray-100 p-5 shadow-sm">
              <h2 className="mb-2 text-sm font-bold">Bölgelere göre teslim edilen</h2>
              <ul className="space-y-1 text-sm">
                {byRegion.map((r) => <li key={r.label} className="flex justify-between"><span>{r.label}</span><span>{r.households} hane · <strong>{r.packages} paket</strong></span></li>)}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === 'recipients' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input className={`${inputClass} pl-9`} placeholder="Ad, telefon, adres ara..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {canEdit && !recForm && <button className={primaryButton} onClick={() => setRecForm({ full_name: '', phone: '', national_id: '', region_id: regionFilter, address: '', household_size: '', needs: '' })}>+ Hane</button>}
          </div>
          {canEdit && picked.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary-200 bg-primary-50/70 p-3">
              <span className="text-xs font-bold text-primary-800">{picked.size} hane seçili:</span>
              <select className={`${inputClass} w-48`} value={plan.package_id} onChange={(e) => setPlan({ ...plan, package_id: e.target.value })}>
                <option value="">Paket seçin</option>{packages.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input className={`${inputClass} w-20`} type="number" min={1} value={plan.quantity} onChange={(e) => setPlan({ ...plan, quantity: e.target.value })} aria-label="Adet" />
              <input className={`${inputClass} w-40`} type="date" value={plan.planned_date} onChange={(e) => setPlan({ ...plan, planned_date: e.target.value })} aria-label="Planlanan tarih" />
              <button className={primaryButton} onClick={planSelected}>Seçilenlere Planla</button>
            </div>
          )}
          {recForm && (
            <Card className="border border-primary-100 p-6 shadow-sm">
              <form onSubmit={saveRecipient} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <TextInput label="Ad Soyad" required value={recForm.full_name} onChange={(v) => setRecForm({ ...recForm, full_name: v })} />
                <TextInput label="Telefon" value={recForm.phone} onChange={(v) => setRecForm({ ...recForm, phone: v })} />
                <TextInput label="TC / kimlik no" hint={recForm.id ? 'Boş bırakılırsa kayıtlı değer korunur' : undefined} value={recForm.national_id} onChange={(v) => setRecForm({ ...recForm, national_id: v })} />
                <Label label="Bölge">
                  <select className={inputClass} value={recForm.region_id} onChange={(e) => setRecForm({ ...recForm, region_id: e.target.value })}>
                    <option value="">—</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </Label>
                <div className="sm:col-span-2"><TextInput label="Adres" value={recForm.address} onChange={(v) => setRecForm({ ...recForm, address: v })} /></div>
                <TextInput label="Hane nüfusu" type="number" min={1} value={recForm.household_size} onChange={(v) => setRecForm({ ...recForm, household_size: v })} />
                <TextInput label="İhtiyaç notu" value={recForm.needs} onChange={(v) => setRecForm({ ...recForm, needs: v })} />
                <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4">
                  <button type="button" className={ghostButton} onClick={() => setRecForm(null)}>Vazgeç</button>
                  <button type="submit" className={primaryButton}>Kaydet</button>
                </div>
              </form>
            </Card>
          )}
          <Card className="border border-gray-100 p-4 shadow-sm">
            <Table>
              <THead>
                <Tr>
                  {canEdit && <Th><input type="checkbox" checked={picked.size > 0 && picked.size === recipients.length}
                    onChange={(e) => setPicked(e.target.checked ? new Set(recipients.map((r) => r.id)) : new Set())} aria-label="Tümünü seç" /></Th>}
                  <Th>Hane</Th><Th>Bölge / adres</Th><Th>Nüfus</Th><Th>Son teslim</Th><Th />
                </Tr>
              </THead>
              <TBody>
                {recipients.map((r) => (
                  <Tr key={r.id}>
                    {canEdit && <Td><input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} /></Td>}
                    <Td><div className="font-semibold">{r.full_name}</div><div className="text-[10px] text-gray-500">{r.phone} {r.national_id_masked && `· ${r.national_id_masked}`}</div></Td>
                    <Td>{r.region_name || '—'}<div className="text-[10px] text-gray-500">{r.address}</div></Td>
                    <Td>{r.household_size || '—'}</Td>
                    <Td>{r.last_delivery_at ? new Date(r.last_delivery_at).toLocaleDateString('tr-TR') : 'Hiç'} <span className="text-gray-400">({r.total_received})</span></Td>
                    <Td className="text-right">{canEdit && <button className="font-bold text-primary-700" onClick={() => setRecForm({
                      id: r.id, full_name: r.full_name, phone: r.phone || '', national_id: '', region_id: r.region_id || '', address: r.address || '',
                      household_size: r.household_size?.toString() || '', needs: r.needs || '',
                    })}>Düzenle</button>}</Td>
                  </Tr>
                ))}
                {recipients.length === 0 && <Tr><Td colSpan={6} className="text-center text-gray-400">Hane kaydı yok.</Td></Tr>}
              </TBody>
            </Table>
          </Card>
        </div>
      )}

      {tab === 'distributions' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input className={`${inputClass} pl-9`} placeholder="Hane, telefon, adres ara..." value={distQuery} onChange={(e) => setDistQuery(e.target.value)} />
              </div>
              <select className={`${inputClass} w-44`} value={distStatus} onChange={(e) => setDistStatus(e.target.value as typeof distStatus)}>
                <option value="planned">Planlanan</option>
                <option value="delivered">Teslim edilen</option>
                <option value="cancelled">İptal edilenler</option>
                <option value="">Tümü</option>
              </select>
              <select className={`${inputClass} w-48`} value={distPackageId} onChange={(e) => setDistPackageId(e.target.value)}>
                <option value="">Tüm paketler</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <button className={ghostButton} onClick={() => exportCsv('kumanya-dagitim-listesi.csv', ['Hane', 'Telefon', 'Adres', 'Bölge', 'Paket', 'Adet', 'Durum', 'Tarih'],
              filteredDistributions.map((d) => [d.recipient_name, d.recipient_phone, d.recipient_address, d.region_name, d.package_name, d.quantity,
                d.status === 'delivered' ? 'Teslim' : d.status === 'planned' ? 'Planlı' : 'İptal',
                d.delivered_at ? new Date(d.delivered_at).toLocaleDateString('tr-TR') : d.planned_date || '']))}>⬇ Dağıtım listesi (CSV)</button>
          </div>
          {canEdit && picked.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary-200 bg-primary-50/70 p-3">
              <span className="text-xs font-bold text-primary-800">{picked.size} dağıtım seçili:</span>
              {pickedPlannedIds.length > 0 && (
                <>
                  <button className={primaryButton} onClick={() => setDistributionStatus('delivered', pickedPlannedIds)}>
                    Teslim edildi ({pickedPlannedIds.length})
                  </button>
                  <button className={`${ghostButton} text-red-600`} onClick={() => setDistributionStatus('cancelled', pickedPlannedIds)}>
                    İptal et ({pickedPlannedIds.length})
                  </button>
                </>
              )}
              {pickedDeliveredIds.length > 0 && (
                <button className={ghostButton} onClick={() => setDistributionStatus('planned', pickedDeliveredIds)}>
                  Teslimi geri al ({pickedDeliveredIds.length})
                </button>
              )}
            </div>
          )}
          <Card className="border border-gray-100 p-4 shadow-sm">
            <Table>
              <THead>
                <Tr>
                  {canEdit && <Th><input type="checkbox" checked={picked.size > 0 && picked.size === filteredDistributions.length && filteredDistributions.length > 0}
                    onChange={(e) => setPicked(e.target.checked ? new Set(filteredDistributions.map((d) => d.id)) : new Set())} aria-label="Tümünü seç" /></Th>}
                  <Th>Hane / İletişim</Th><Th>Paket</Th><Th>Bölge</Th><Th>Tarih</Th><Th>Durum</Th>
                </Tr>
              </THead>
              <TBody>
                {filteredDistributions.map((d) => (
                  <Tr key={d.id}>
                    {canEdit && <Td><input type="checkbox" checked={picked.has(d.id)} onChange={() => toggle(d.id)} /></Td>}
                    <Td>
                      <div className="font-semibold text-gray-900">{d.recipient_name}</div>
                      {d.recipient_phone && <div className="text-[11px] text-gray-500">{d.recipient_phone}</div>}
                      {d.recipient_address && <div className="text-[10px] text-gray-400">{d.recipient_address}</div>}
                    </Td>
                    <Td className="font-medium">{d.package_name} × {d.quantity}</Td>
                    <Td>{d.region_name || '—'}</Td>
                    <Td>{d.delivered_at ? new Date(d.delivered_at).toLocaleDateString('tr-TR') : d.planned_date ? new Date(d.planned_date).toLocaleDateString('tr-TR') : '—'}</Td>
                    <Td>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        d.status === 'delivered'
                          ? 'bg-emerald-50 text-emerald-700'
                          : d.status === 'planned'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}>
                        {d.status === 'delivered' ? 'Teslim edildi' : d.status === 'planned' ? 'Planlı' : 'İptal'}
                      </span>
                    </Td>
                  </Tr>
                ))}
                {filteredDistributions.length === 0 && <Tr><Td colSpan={6} className="text-center text-gray-400">Kayıt yok.</Td></Tr>}
              </TBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  )
}
