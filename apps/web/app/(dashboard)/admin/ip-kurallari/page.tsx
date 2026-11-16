'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, Globe, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { AppPageHeader, GlobalStatCard } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { EmptyState, TBody, THead, Table, Tabs, Td, Th, Tr, confirmDialog, toast } from '../../../../components/admin/ui'

type Kind = 'allow' | 'block'
interface Rule {
  id: string
  network: string
  note: string | null
  user_id: string | null
  user_name: string | null
  created_by: string | null
  created_at: string
}
interface Staff {
  id: string
  first_name: string
  last_name: string
  is_active: boolean
}

const when = (iso: string) => new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })

function isValidNetwork(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  const ipv4Cidr = /^(\d{1,3}\.){3}\d{1,3}(\/([0-9]|[12]\d|3[0-2]))?$/
  if (ipv4Cidr.test(s)) {
    const ip = s.split('/')[0]
    return ip.split('.').every((oct) => Number(oct) >= 0 && Number(oct) <= 255)
  }
  // Allow IPv6 / CIDR as fallback if it contains ':'
  return s.includes(':') && /^[0-9a-fA-F:]+(\/\d{1,3})?$/.test(s)
}

/** e-Infak "IP İzinleri" and "IP Engellemeleri" on one screen. */
export default function IpRulesPage() {
  const [kind, setKind] = useState<Kind>('allow')
  const [allowRows, setAllowRows] = useState<Rule[]>([])
  const [blockRows, setBlockRows] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [yourIp, setYourIp] = useState<string | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [form, setForm] = useState({ network: '', note: '', user_id: '' })
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [allowRes, blockRes] = await Promise.all([
        adminGet<{ items: Rule[]; your_ip: string | null }>('/ip-rules', { kind: 'allow' }),
        adminGet<{ items: Rule[]; your_ip: string | null }>('/ip-rules', { kind: 'block' }),
      ])
      setAllowRows(allowRes.data.items)
      setBlockRows(blockRes.data.items)
      setYourIp(allowRes.data.your_ip || blockRes.data.your_ip)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kayıtlar yüklenemedi'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    adminGet<Staff[]>('/users')
      .then((r) => setStaff(r.data.filter((s) => s.is_active)))
      .catch(() => {})
  }, [])

  const rows = kind === 'allow' ? allowRows : blockRows

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      `${r.network} ${r.note || ''} ${r.user_name || ''} ${r.created_by || ''}`.toLowerCase().includes(q),
    )
  }, [rows, query])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanNet = form.network.trim()
    if (!isValidNetwork(cleanNet)) {
      toast.error('Geçerli bir IP adresi veya CIDR aralığı girin (ör. 81.213.241.27 veya 81.213.241.0/24).')
      return
    }
    if (kind === 'block' && yourIp && cleanNet.replace(/\/32$/, '') === yourIp) {
      const ok = await confirmDialog({
        title: 'Kendi IP adresinizi engellemek üzeresiniz!',
        text: `${yourIp} şu an bağlı olduğunuz IP adresi. Devam ederseniz panele erişiminiz kesilebilir.`,
        confirmLabel: 'Yine de Engelle',
        danger: true,
      })
      if (!ok) return
    }

    setSaving(true)
    try {
      await adminSend('post', '/ip-rules', {
        kind,
        network: cleanNet,
        note: form.note.trim() || null,
        user_id: kind === 'allow' && form.user_id ? form.user_id : null,
      })
      toast.ok(kind === 'allow' ? 'IP izni eklendi' : 'IP engellendi')
      setForm({ network: '', note: '', user_id: '' })
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (rule: Rule) => {
    const ok = await confirmDialog({
      title: `${rule.network.replace(/\/32$/, '')} kaydı silinsin mi?`,
      confirmLabel: 'Sil',
      danger: true,
    })
    if (!ok) return
    try {
      await adminSend('delete', `/ip-rules/${rule.id}`)
      toast.ok('IP kuralı silindi')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Güvenlik & Erişim Kontrolü"
        title="IP İzinleri ve Engellemeleri"
        meta="İzin kaydı olan personel panele yalnızca tanımlı IP/CIDR adreslerinden girer (yöneticiler hariç); engellenen adresten kimse giremez."
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <GlobalStatCard
          title="Mevcut IP Adresiniz"
          value={yourIp || '—'}
          subtitle="Şu an bağlı olduğunuz ağ"
          gradient="from-slate-600 to-slate-800"
          icon={<Globe className="h-4 w-4" />}
        />
        <GlobalStatCard
          title="İzinli IP / Ağ"
          value={allowRows.length}
          subtitle={allowRows.length === 0 ? 'Kısıtlama yok (tüm IP serbest)' : 'İzin listesi aktif'}
          gradient="from-emerald-500 to-teal-600"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <GlobalStatCard
          title="Engellenen IP / Ağ"
          value={blockRows.length}
          subtitle="Erişimi engellenmiş adres"
          gradient={blockRows.length > 0 ? 'from-rose-500 to-red-600' : 'from-slate-500 to-slate-700'}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
      </div>

      <Tabs
        value={kind}
        onChange={(next) => {
          setKind(next)
          setQuery('')
        }}
        tabs={[
          { key: 'allow', label: 'IP İzinleri', icon: ShieldCheck, count: allowRows.length },
          { key: 'block', label: 'IP Engellemeleri', icon: Ban, count: blockRows.length },
        ]}
      />

      <Card className="rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <form onSubmit={add} className="grid items-end gap-3 sm:grid-cols-12">
          <div className={kind === 'allow' ? 'sm:col-span-4' : 'sm:col-span-5'}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-xs font-bold text-slate-700">IP veya CIDR Aralığı *</label>
              {yourIp && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, network: yourIp }))}
                  className="text-[11px] font-semibold text-emerald-700 hover:underline"
                >
                  Mevcut IP&apos;mi Doldur
                </button>
              )}
            </div>
            <Input
              required
              placeholder="81.213.241.27 veya 81.213.241.0/24"
              value={form.network}
              onChange={(e) => setForm({ ...form, network: e.target.value })}
            />
          </div>
          {kind === 'allow' && (
            <div className="sm:col-span-3">
              <Label label="Kapsam (Personel)">
                <select className={inputClass} value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                  <option value="">Tüm personel</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
              </Label>
            </div>
          )}
          <div className={kind === 'allow' ? 'sm:col-span-3' : 'sm:col-span-5'}>
            <Label label="Açıklama">
              <Input
                placeholder="ör. Merkez ofis"
                maxLength={200}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </Label>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant={kind === 'block' ? 'danger' : 'primary'} disabled={saving} className="w-full">
              <Plus className="h-3.5 w-3.5" />
              {kind === 'allow' ? 'İzin Ver' : 'Engelle'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-black text-slate-900">
            {kind === 'allow' ? 'İzin Verilen IP Adresleri' : 'Engellenen IP Adresleri'}
          </h2>
          {rows.length > 0 && (
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="IP, personel veya açıklama ara…"
                className="pl-8 text-xs"
              />
            </div>
          )}
        </div>

        {loading && rows.length === 0 ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon={kind === 'allow' ? ShieldCheck : Ban}
            title={
              rows.length === 0
                ? kind === 'allow'
                  ? 'İzin kaydı yok'
                  : 'Engellenen adres yok'
                : 'Aramaya uygun kayıt bulunamadı'
            }
            text={
              rows.length === 0
                ? kind === 'allow'
                  ? 'Henüz IP kısıtlaması tanımlanmadığı için personel her adresten giriş yapabilir.'
                  : 'Engellenmiş bir IP adresi veya ağ aralığı bulunmuyor.'
                : 'Arama metnini temizleyip tekrar deneyin.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>IP / Ağ</Th>
                  {kind === 'allow' && <Th>Personel</Th>}
                  <Th>Açıklama</Th>
                  <Th>Tarih</Th>
                  <Th>Ekleyen</Th>
                  <Th className="text-right">İşlem</Th>
                </Tr>
              </THead>
              <TBody>
                {filteredRows.map((r) => {
                  const cleanNet = r.network.replace(/\/32$/, '')
                  const isMine = yourIp && cleanNet === yourIp
                  return (
                    <Tr key={r.id} className="hover:bg-slate-50/70">
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-slate-900">{cleanNet}</span>
                          {isMine && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              Mevcut IP
                            </span>
                          )}
                        </div>
                      </Td>
                      {kind === 'allow' && (
                        <Td>{r.user_name || <span className="text-slate-400">Tüm personel</span>}</Td>
                      )}
                      <Td>{r.note || '—'}</Td>
                      <Td className="whitespace-nowrap text-xs text-slate-500">{when(r.created_at)}</Td>
                      <Td className="text-xs text-slate-500">{r.created_by || '—'}</Td>
                      <Td className="text-right">
                        <Button type="button" variant="danger" size="sm" onClick={() => remove(r)} aria-label="Sil">
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Sil</span>
                        </Button>
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}
