'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { Card } from '@e-infak/ui'
import {
  adminApiBase, adminAuthHeaders, adminGet, adminSend, apiErrorMessage, exportCsv, formatMoney, hasPermission, useAdminAccess,
} from '../../../../lib/admin-access'
import { Label, Notice, TextArea, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { PageHeader, TBody, THead, Table, Td, Th, Tr } from '../../../../components/admin/ui'

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
  const [distStatus, setDistStatus] = useState<'planned' | 'delivered' | ''>('planned')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [pkgForm, setPkgForm] = useState<{ id?: string; name: string; contents: string; cost: string; campaign: string; stock: string } | null>(null)
  const [recForm, setRecForm] = useState<{ id?: string; full_name: string; phone: string; national_id: string; region_id: string; address: string; household_size: string; needs: string } | null>(null)
  const [plan, setPlan] = useState({ package_id: '', quantity: '1', planned_date: '' })

  const load = async () => {
    try {
      const [rep, rec, dist, reg] = await Promise.all([
        adminGet<{ packages: Package[]; by_region: typeof byRegion }>('/aid-report'),
        adminGet<Recipient[]>('/aid-recipients', { region_id: regionFilter || undefined, q: q || undefined }),
        adminGet<Distribution[]>('/aid-distributions', { status: distStatus || undefined, region_id: regionFilter || undefined }),
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
  }, [regionFilter, q, distStatus])
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
      donation_campaign_id: pkgForm.campaign || null, stock: Number(pkgForm.stock) || 0, is_active: true,
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

  const setDistributionStatus = (status: 'delivered' | 'cancelled' | 'planned') =>
    act(() => adminSend('post', '/aid-distributions/status', { ids: [...picked], status }),
      status === 'delivered' ? 'Teslim edildi olarak işaretlendi' : 'Dağıtımlar güncellendi')

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Kumanya Dağıtım" description={<>Paketin bağış kalemine gelen bağışlar kaç paketin fonlandığını gösterir; teslimde stok düşer.</>} />

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
          {canEdit && !pkgForm && <button className={primaryButton} onClick={() => setPkgForm({ name: '', contents: '', cost: '', campaign: '', stock: '0' })}>+ Paket Tanımla</button>}
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
                <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4">
                  <button type="button" className={ghostButton} onClick={() => setPkgForm(null)}>Vazgeç</button>
                  <button type="submit" className={primaryButton}>Kaydet</button>
                </div>
              </form>
            </Card>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {packages.map((p) => (
              <Card key={p.id} className="space-y-2 border border-gray-100 p-5 shadow-sm">
                <div className="flex justify-between"><strong>{p.name}</strong><span className="text-sm text-gray-500">{formatMoney(p.unit_cost_cents)}</span></div>
                {p.contents && <p className="text-xs text-gray-500">{p.contents}</p>}
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  {[['Fonlanan', p.funded_packages], ['Stok', p.stock], ['Planlı', p.planned], ['Teslim', p.delivered]].map(([l, v]) => (
                    <div key={l as string} className="rounded-lg bg-gray-50 p-2"><div className="text-gray-500">{l}</div><div className="text-lg font-black">{v}</div></div>
                  ))}
                </div>
                {p.donation_campaign_id && <div className="text-xs text-gray-500">Toplanan bağış: {formatMoney(p.funded_cents)}</div>}
                {canEdit && (
                  <button className={ghostButton} onClick={() => setPkgForm({
                    id: p.id, name: p.name, contents: p.contents || '', cost: String(p.unit_cost_cents / 100), campaign: p.donation_campaign_id || '', stock: String(p.stock),
                  })}>Düzenle / stok</button>
                )}
              </Card>
            ))}
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
          <div className="flex flex-wrap items-end gap-2">
            <input className={`${inputClass} w-56`} placeholder="Ad, telefon, adres" value={q} onChange={(e) => setQ(e.target.value)} />
            {canEdit && !recForm && <button className={primaryButton} onClick={() => setRecForm({ full_name: '', phone: '', national_id: '', region_id: regionFilter, address: '', household_size: '', needs: '' })}>+ Hane</button>}
            {canEdit && picked.size > 0 && (
              <>
                <select className={`${inputClass} w-48`} value={plan.package_id} onChange={(e) => setPlan({ ...plan, package_id: e.target.value })}>
                  <option value="">Paket seçin</option>{packages.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input className={`${inputClass} w-20`} type="number" min={1} value={plan.quantity} onChange={(e) => setPlan({ ...plan, quantity: e.target.value })} aria-label="Adet" />
                <input className={`${inputClass} w-40`} type="date" value={plan.planned_date} onChange={(e) => setPlan({ ...plan, planned_date: e.target.value })} aria-label="Planlanan tarih" />
                <button className={primaryButton} onClick={planSelected}>Seçilen {picked.size} haneye planla</button>
              </>
            )}
          </div>
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
          <div className="flex flex-wrap gap-2">
            <select className={`${inputClass} w-44`} value={distStatus} onChange={(e) => setDistStatus(e.target.value as typeof distStatus)}>
              <option value="planned">Planlanan</option><option value="delivered">Teslim edilen</option><option value="">Tümü</option>
            </select>
            {canEdit && picked.size > 0 && distStatus === 'planned' && (
              <>
                <button className={primaryButton} onClick={() => setDistributionStatus('delivered')}>Seçilen {picked.size} teslim edildi</button>
                <button className={`${ghostButton} text-red-600`} onClick={() => setDistributionStatus('cancelled')}>İptal</button>
              </>
            )}
            {canEdit && picked.size > 0 && distStatus === 'delivered' && (
              <button className={ghostButton} onClick={() => setDistributionStatus('planned')}>Teslimi geri al</button>
            )}
            <button className={ghostButton} onClick={() => exportCsv('kumanya-dagitim-listesi.csv', ['Hane', 'Telefon', 'Adres', 'Bölge', 'Paket', 'Adet', 'Durum', 'Tarih'],
              distributions.map((d) => [d.recipient_name, d.recipient_phone, d.recipient_address, d.region_name, d.package_name, d.quantity,
                d.status === 'delivered' ? 'Teslim' : d.status === 'planned' ? 'Planlı' : 'İptal',
                d.delivered_at ? new Date(d.delivered_at).toLocaleDateString('tr-TR') : d.planned_date || '']))}>⬇ Dağıtım listesi (CSV)</button>
          </div>
          <Card className="border border-gray-100 p-4 shadow-sm">
            <Table>
              <THead>
                <Tr>
                  {canEdit && <Th><input type="checkbox" checked={picked.size > 0 && picked.size === distributions.length}
                    onChange={(e) => setPicked(e.target.checked ? new Set(distributions.map((d) => d.id)) : new Set())} aria-label="Tümünü seç" /></Th>}
                  <Th>Hane</Th><Th>Paket</Th><Th>Bölge</Th><Th>Tarih</Th><Th>Durum</Th>
                </Tr>
              </THead>
              <TBody>
                {distributions.map((d) => (
                  <Tr key={d.id}>
                    {canEdit && <Td><input type="checkbox" checked={picked.has(d.id)} onChange={() => toggle(d.id)} /></Td>}
                    <Td><div className="font-semibold">{d.recipient_name}</div><div className="text-[10px] text-gray-500">{d.recipient_address}</div></Td>
                    <Td>{d.package_name} × {d.quantity}</Td>
                    <Td>{d.region_name || '—'}</Td>
                    <Td>{d.delivered_at ? new Date(d.delivered_at).toLocaleDateString('tr-TR') : d.planned_date ? new Date(d.planned_date).toLocaleDateString('tr-TR') : '—'}</Td>
                    <Td>{d.status === 'delivered' ? 'Teslim edildi' : d.status === 'planned' ? 'Planlı' : 'İptal'}</Td>
                  </Tr>
                ))}
                {distributions.length === 0 && <Tr><Td colSpan={6} className="text-center text-gray-400">Kayıt yok.</Td></Tr>}
              </TBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  )
}
