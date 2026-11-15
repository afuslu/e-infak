'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, GitMerge, RefreshCw, Users } from 'lucide-react'
import { Button, Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, formatMoney, useAdminAccess, can } from '../../../../../lib/admin-access'
import { AppPageHeader, GlobalStatCard } from '../../../../../components/admin/muhasebe/OnMuhasebeUI'
import { EmptyState, TBody, THead, Table, Td, Th, Tr, confirmDialog, toast } from '../../../../../components/admin/ui'

interface DonorBrief {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  tc_masked: string | null
  city: string | null
  total_donations: number
  total_donated_cents: number
  last_donation_at: string | null
  created_at: string
  tags: string[]
}
interface Group {
  reasons: string[]
  donors: DonorBrief[]
}

export default function DuplicateDonorsPage() {
  const { data: access } = useAdminAccess()
  const canEdit = can(access, 'donors.merge')
  const [includeNames, setIncludeNames] = useState(false)
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [targets, setTargets] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminGet<{ groups: Group[] }>('/donors/duplicates', { include_names: includeNames })
      setGroups(res.data.groups)
      setTargets({})
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Mükerrer kayıtlar yüklenemedi'))
    } finally {
      setLoading(false)
    }
  }, [includeNames])

  useEffect(() => {
    load()
  }, [load])

  const merge = async (index: number, group: Group) => {
    const target = targets[index] || group.donors[0].id
    const sources = group.donors.filter((d) => d.id !== target)
    const targetName = group.donors.find((d) => d.id === target)?.full_name
    const ok = await confirmDialog({
      title: `${sources.length} kart "${targetName}" kartına birleştirilsin mi?`,
      text: 'Bağışlar, notlar ve sponsorluklar hedef karta taşınır, diğer kartlar silinir.',
      confirmLabel: 'Birleştir',
      danger: true,
    })
    if (!ok) return
    try {
      const res = await adminSend<{ merged: number; moved: Record<string, number> }>('post', '/donors/merge', {
        target_id: target,
        source_ids: sources.map((d) => d.id),
      })
      const moved = Object.values(res.data.moved).reduce((a, b) => a + b, 0)
      toast.ok(`${res.data.merged} kart birleştirildi, ${moved} kayıt taşındı`)
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const totalDuplicateCards = (groups || []).reduce((sum, g) => sum + g.donors.length, 0)

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Bağışçı CRM · Veri Temizliği"
        title="Mükerrer Bağışçılar"
        meta="Aynı telefon, e-posta veya TC ile açılmış kartlar. Asıl kartı seçip birleştirin; boş alanlar diğer kartlardan doldurulur."
        icon={<GitMerge className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            <Link href="/admin/bagiscilar">
              <Button type="button" variant="outline" size="sm">
                <ArrowLeft className="h-3.5 w-3.5" />
                Bağışçılar
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <GlobalStatCard
          title="Mükerrer Grup"
          value={groups ? groups.length : '—'}
          subtitle="Birleştirilmeyi bekleyen eşleşme grubu"
          gradient={groups && groups.length > 0 ? 'from-amber-500 to-orange-600' : 'from-emerald-500 to-teal-600'}
          icon={<GitMerge className="h-4 w-4" />}
        />
        <GlobalStatCard
          title="Etkilenen Kart"
          value={groups ? totalDuplicateCards : '—'}
          subtitle="Gruplardaki toplam bağışçı kartı"
          gradient="from-slate-600 to-slate-800"
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      <Card className="rounded-2xl border border-slate-200/80 p-4 shadow-xs">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={includeNames} onChange={(e) => setIncludeNames(e.target.checked)} />
          Aynı ad soyadı da mükerrer say (yanlış eşleşme olabilir, dikkatle kontrol edin)
        </label>
      </Card>

      {loading && groups === null ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl border border-slate-200/80 bg-white" />
          ))}
        </div>
      ) : groups?.length === 0 ? (
        <Card className="rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <EmptyState
            icon={GitMerge}
            title="Mükerrer bağışçı kartı bulunamadı"
            text="Aynı telefon, e-posta veya TC kimlik numarasına sahip yinelenen kayıt yok."
          />
        </Card>
      ) : (
        groups?.map((g, index) => {
          const target = targets[index] || g.donors[0].id
          return (
            <Card key={g.donors.map((d) => d.id).join()} className="space-y-3 rounded-2xl border border-slate-200/80 p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-500">Eşleşen: {g.reasons.join(', ')}</p>
                {canEdit && (
                  <Button type="button" size="sm" onClick={() => merge(index, g)}>
                    <GitMerge className="h-3.5 w-3.5" />
                    Birleştir
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <Tr>
                      <Th>Asıl Kart</Th>
                      <Th>Ad</Th>
                      <Th>Telefon</Th>
                      <Th>E-posta</Th>
                      <Th>TC</Th>
                      <Th>Şehir</Th>
                      <Th>Bağış</Th>
                      <Th>Son Bağış</Th>
                      <Th>Kayıt</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {g.donors.map((d) => (
                      <Tr key={d.id} className={d.id === target ? 'bg-emerald-50/40' : ''}>
                        <Td>
                          <input
                            type="radio"
                            name={`target-${index}`}
                            checked={d.id === target}
                            onChange={() => setTargets({ ...targets, [index]: d.id })}
                          />
                        </Td>
                        <Td className="font-semibold text-slate-900">{d.full_name}</Td>
                        <Td>{d.phone || '—'}</Td>
                        <Td>{d.email || '—'}</Td>
                        <Td>{d.tc_masked || '—'}</Td>
                        <Td>{d.city || '—'}</Td>
                        <Td>
                          {d.total_donations} · {formatMoney(d.total_donated_cents)}
                        </Td>
                        <Td>{d.last_donation_at ? new Date(d.last_donation_at).toLocaleDateString('tr-TR') : '—'}</Td>
                        <Td>{new Date(d.created_at).toLocaleDateString('tr-TR')}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}
